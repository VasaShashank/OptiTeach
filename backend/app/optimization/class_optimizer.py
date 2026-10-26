from typing import Optional
from sqlalchemy.orm import Session
from app.models.entities import Course, ClassSession, Topic
from app.optimization.revision_engine import revision_engine
from app.optimization.method_selector import method_selector
from app.optimization.duration_assigner import duration_assigner
from app.schemas.schemas import NextClassOptimizationResponse

class ClassOptimizer:
    """
    Class-level optimization engine.
    Answers: 'What exactly should happen during THIS period?'
    Guarantees that the sum of phase durations strictly equals the configured period duration.
    """

    def optimize_next_class(
        self, 
        db: Session, 
        course_id: str, 
        session_number: Optional[int] = None,
        custom_revision_minutes: Optional[int] = None,
    ) -> NextClassOptimizationResponse:
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise ValueError(f"Course {course_id} not found")

        period_duration = course.period_duration # e.g. 55 minutes

        # Determine target session
        if session_number is None:
            # Pick first non-completed session or session 1
            session = (
                db.query(ClassSession)
                .filter(ClassSession.course_id == course_id, ClassSession.status != "completed")
                .order_by(ClassSession.session_number)
                .first()
            )
            if not session:
                session = db.query(ClassSession).filter(ClassSession.course_id == course_id).order_by(ClassSession.session_number).first()
        else:
            session = db.query(ClassSession).filter(ClassSession.course_id == course_id, ClassSession.session_number == session_number).first()

        current_session_num = session.session_number if session else 1

        # Determine target topic:
        # If session has a current_topic_id, use it; otherwise pick from topic sequence
        target_topic = None
        if session and session.current_topic_id:
            target_topic = db.query(Topic).filter(Topic.id == session.current_topic_id).first()

        if not target_topic:
            # Find in-progress topic or first pending topic
            target_topic = (
                db.query(Topic)
                .join(Topic.unit)
                .filter(Topic.unit.has(course_id=course_id))
                .order_by(Topic.unit_id, Topic.order_index)
                .first()
            )

        if not target_topic:
            raise ValueError("No topics available in this course curriculum")

        # Evaluate revision requirement
        rev_info = revision_engine.evaluate_revision_need(db, target_topic)
        needs_revision = rev_info["revision_needed"]
        rev_minutes = rev_info["revision_minutes"]
        rev_concept = rev_info["revision_concept"]
        rev_reason = rev_info["reason"]

        # Determine primary concept type of target topic
        concept_types = [c.concept_type for c in target_topic.concepts]
        primary_type = concept_types[0] if concept_types else "conceptual"
        has_weak = needs_revision

        # Method recommendations
        recommended_methods, predicted_gain = method_selector.select_methods(db, primary_type, has_weak_prereq=has_weak)

        max_lecture_ratio = course.constraints.max_lecture_ratio if course.constraints else 0.45
        min_practice_ratio = course.constraints.min_practice_ratio if course.constraints else 0.35

        # Build realistic pedagogical phase breakdown based on topic difficulty, concept type, and revision needs
        phases = duration_assigner.compute_period_phase_division(
            period_duration=period_duration,
            topic=target_topic,
            needs_revision=needs_revision,
            rev_concept=rev_concept,
            prereq_score=rev_info.get("lowest_score"),
            custom_revision_minutes=custom_revision_minutes,
            max_lecture_ratio=max_lecture_ratio,
            min_practice_ratio=min_practice_ratio,
            recommended_methods=recommended_methods,
        )

        actual_rev_minutes = next((p.duration_minutes for p in phases if p.phase_name == "Revision"), 0)
        if actual_rev_minutes > 0:
            needs_revision = True
            rev_minutes = actual_rev_minutes

        total_phase_minutes = sum(p.duration_minutes for p in phases)
        # Verify strict invariant
        assert total_phase_minutes == period_duration, f"Phase sum {total_phase_minutes} must equal period duration {period_duration}"

        methods_text = " and ".join(m.lower() for m in recommended_methods[:2])
        why_text = (
            f"{rev_reason} "
            f"{methods_text[:1].upper() + methods_text[1:]} gave the biggest improvement on similar topics "
            f"in past classes (about +{predicted_gain:g}% on the next quiz)."
        )

        return NextClassOptimizationResponse(
            session_number=current_session_num,
            topic_id=target_topic.id,
            topic_title=target_topic.title,
            unit_number=target_topic.unit.unit_number if target_topic.unit else 1,
            period_duration=period_duration,
            target_concepts=[c.name for c in target_topic.concepts],
            revision_needed=needs_revision,
            revision_minutes=rev_minutes,
            revision_concept=rev_concept,
            revision_reason=rev_reason,
            recommended_methods=recommended_methods,
            phases=phases,
            total_phase_minutes=total_phase_minutes,
            why_explanation=why_text,
            learning_gain_prediction=predicted_gain
        )

class_optimizer = ClassOptimizer()
