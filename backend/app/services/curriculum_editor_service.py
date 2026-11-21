"""
Curriculum builder: edit a confirmed curriculum in place.

  * reorder topics (and move them between units) with one layout save
  * add / remove prerequisite links, refusing cycles
  * adjust a concept's difficulty, importance and type, then re-optimize

Cycle safety is enforced twice: here, so the teacher gets a clear message on any database,
and on PostgreSQL by the trg_prerequisite_guard trigger, which also serialises concurrent
edits with an advisory lock.
"""
from typing import Any, Dict, List, Set

from sqlalchemy import delete, insert, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, joinedload

from app.models.entities import Concept, Topic, Unit, prerequisites
from app.optimization.time_allocator import time_allocator
from app.services.artifact_service import artifact_service
from app.services.errors import ConflictError


class CurriculumEditorService:
    # ------------------------------------------------------------------ read
    def structure(self, db: Session, course_id: str) -> Dict[str, Any]:
        units = (
            db.query(Unit)
            .options(joinedload(Unit.topics).joinedload(Topic.concepts).joinedload(Concept.prerequisites))
            .filter(Unit.course_id == course_id)
            .order_by(Unit.unit_number)
            .all()
        )
        return {
            "course_id": course_id,
            "units": [{
                "id": u.id,
                "unit_number": u.unit_number,
                "title": u.title,
                "topics": [{
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "allocated_minutes": t.allocated_minutes,
                    "estimated_minutes": t.estimated_minutes,
                    "concepts": [{
                        "id": c.id,
                        "name": c.name,
                        "difficulty": c.difficulty,
                        "importance": c.importance,
                        "concept_type": c.concept_type,
                        "prerequisite_ids": [p.id for p in c.prerequisites],
                    } for c in sorted(t.concepts, key=lambda c: c.order_index or 0)],
                } for t in sorted(u.topics, key=lambda t: t.order_index)],
            } for u in units],
        }

    def _course_concepts(self, db: Session, course_id: str) -> Dict[str, Concept]:
        rows = db.query(Concept).join(Topic).join(Unit).filter(Unit.course_id == course_id).all()
        return {c.id: c for c in rows}

    # ------------------------------------------------------------------ concept attributes
    def update_concept(self, db: Session, course_id: str, concept_id: str, changes: Dict[str, Any]) -> Dict[str, Any]:
        concept = self._course_concepts(db, course_id).get(concept_id)
        if not concept:
            raise ValueError("Concept not found in this course")
        topic_id = concept.topic_id
        before = db.get(Topic, topic_id).allocated_minutes

        for field, value in changes.items():
            setattr(concept, field, value)
        db.commit()

        # Difficulty/importance feed the priority score, so re-run the allocation
        allocation = time_allocator.optimize_course_time(db, course_id)
        after = next((a.allocated_minutes for a in allocation.topic_allocations if a.topic_id == topic_id), before)
        return {
            "concept_id": concept_id,
            "topic_id": topic_id,
            "allocated_minutes_before": before,
            "allocated_minutes_after": after,
        }

    # ------------------------------------------------------------------ prerequisites
    @staticmethod
    def _ancestors(start: str, edges: Dict[str, Set[str]]) -> Set[str]:
        """Every concept that `start` (transitively) depends on."""
        seen, stack = set(), [start]
        while stack:
            for parent in edges.get(stack.pop(), ()):
                if parent not in seen:
                    seen.add(parent)
                    stack.append(parent)
        return seen

    def add_prerequisite(self, db: Session, course_id: str, concept_id: str, prerequisite_id: str) -> Dict[str, Any]:
        concepts = self._course_concepts(db, course_id)
        if concept_id not in concepts or prerequisite_id not in concepts:
            raise ValueError("Both concepts must belong to this course (concept not found)")
        if concept_id == prerequisite_id:
            raise ValueError("A concept cannot be its own prerequisite")

        edges: Dict[str, Set[str]] = {}
        for c in concepts.values():
            edges[c.id] = {p.id for p in c.prerequisites}
        if prerequisite_id in edges[concept_id]:
            raise ConflictError("That prerequisite link already exists")
        # New edge prerequisite -> concept closes a cycle iff concept is already upstream of prerequisite
        if concept_id in self._ancestors(prerequisite_id, edges):
            raise ConflictError(
                f"'{concepts[prerequisite_id].name}' already depends on '{concepts[concept_id].name}', "
                "so this link would create a loop"
            )

        try:
            db.execute(insert(prerequisites).values(concept_id=concept_id, prerequisite_id=prerequisite_id))
            db.commit()
        except DBAPIError as exc:  # PostgreSQL trigger: a concurrent edit closed the loop first
            db.rollback()
            raise ConflictError(str(exc.orig).splitlines()[0]) from exc
        artifact_service.snapshot_curriculum_graph(db, course_id, reason="Prerequisite added in curriculum builder")
        return {"concept_id": concept_id, "prerequisite_id": prerequisite_id}

    def remove_prerequisite(self, db: Session, course_id: str, concept_id: str, prerequisite_id: str) -> None:
        if concept_id not in self._course_concepts(db, course_id):
            raise ValueError("Concept not found in this course")
        result = db.execute(delete(prerequisites).where(
            prerequisites.c.concept_id == concept_id, prerequisites.c.prerequisite_id == prerequisite_id))
        if result.rowcount == 0:
            db.rollback()
            raise ValueError("Prerequisite link not found")
        db.commit()
        artifact_service.snapshot_curriculum_graph(db, course_id, reason="Prerequisite removed in curriculum builder")

    # ------------------------------------------------------------------ topic order
    def save_layout(self, db: Session, course_id: str, layout: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        layout = [{unit_id, topic_ids: [...]}, ...] covering every topic of the course.
        UNIQUE(unit_id, order_index) would be violated by in-place swaps, so the update is
        two-phase inside one transaction: park every topic at a negative index, then write
        the final positions. Either the whole layout is saved or none of it.
        """
        units = {uid for (uid,) in db.execute(select(Unit.id).where(Unit.course_id == course_id)).all()}
        topics = {t.id: t for t in db.query(Topic).join(Unit).filter(Unit.course_id == course_id).with_for_update().all()}

        placed = [tid for entry in layout for tid in entry["topic_ids"]]
        if any(entry["unit_id"] not in units for entry in layout):
            raise ValueError("Unit not found in this course")
        if sorted(placed) != sorted(topics) or len(placed) != len(set(placed)):
            raise ValueError("The layout must list every topic of the course exactly once")

        try:
            for i, topic in enumerate(topics.values(), start=1):
                topic.order_index = -i
            db.flush()
            for entry in layout:
                for position, tid in enumerate(entry["topic_ids"], start=1):
                    topics[tid].unit_id = entry["unit_id"]
                    topics[tid].order_index = position
            db.commit()
        except Exception:
            db.rollback()
            raise
        return self.structure(db, course_id)

    # ------------------------------------------------------------------ AI Prerequisite Inference
    def infer_and_apply_prerequisites(self, db: Session, course_id: str) -> Dict[str, Any]:
        """
        Infers deep pedagogical prerequisite relationships using Groq LLM (when configured)
        or the CS knowledge taxonomy semantic engine, updating the curriculum graph.
        """
        from app.models.entities import Course
        from app.nlp.llm_prerequisite_engine import llm_prerequisite_engine

        course = db.get(Course, course_id)
        course_title = course.title if course else "Course Curriculum"

        curr_data = self.structure(db, course_id)
        result = llm_prerequisite_engine.infer_course_prerequisites(course_title, curr_data["units"])

        # Concept map for this course
        concepts = self._course_concepts(db, course_id)
        concept_ids = set(concepts.keys())

        # Clear existing synthetic prerequisites for these concepts
        if concept_ids:
            db.execute(delete(prerequisites).where(prerequisites.c.concept_id.in_(concept_ids)))

        # Update Bloom's levels if inferred
        for cid, bloom in result.get("bloom_levels", {}).items():
            if cid in concepts:
                concepts[cid].bloom_level = bloom

        # Insert inferred valid edges
        added_count = 0
        for edge in result.get("edges", []):
            src_id = edge["source_id"]
            tgt_id = edge["target_id"]
            if src_id in concepts and tgt_id in concepts and src_id != tgt_id:
                try:
                    db.execute(insert(prerequisites).values(concept_id=tgt_id, prerequisite_id=src_id))
                    added_count += 1
                except Exception:
                    pass

        db.commit()
        artifact_service.snapshot_curriculum_graph(db, course_id, reason=f"AI prerequisite inference via {result['provider']}")
        return {
            "status": "success",
            "provider": result["provider"],
            "edges_count": added_count,
            "edges": result.get("edges", []),
            "cycles_prevented": result.get("cycles_prevented", 0),
        }


curriculum_editor_service = CurriculumEditorService()
