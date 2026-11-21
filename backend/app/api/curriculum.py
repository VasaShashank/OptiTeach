from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.security import get_accessible_course, get_current_user
from app.database.connection import get_db
from app.models.entities import Course
from app.services.curriculum_editor_service import curriculum_editor_service

router = APIRouter(prefix="/courses", tags=["Curriculum Builder"], dependencies=[Depends(get_current_user)])

ConceptType = Literal["conceptual", "procedural", "problem_solving", "practical", "analytical", "revision"]


class ConceptUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    difficulty: Optional[int] = Field(default=None, ge=1, le=5)
    importance: Optional[int] = Field(default=None, ge=1, le=5)
    concept_type: Optional[ConceptType] = None


class PrerequisiteLink(BaseModel):
    concept_id: str
    prerequisite_id: str


class UnitLayout(BaseModel):
    unit_id: str
    topic_ids: List[str]


class CurriculumLayout(BaseModel):
    units: List[UnitLayout] = Field(min_length=1)


@router.get("/{course_id}/curriculum")
def get_curriculum(course_id: str, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    """Units, their topics in teaching order, concepts and prerequisite links."""
    return curriculum_editor_service.structure(db, course_id)


@router.patch("/{course_id}/concepts/{concept_id}")
def update_concept(course_id: str, concept_id: str, payload: ConceptUpdate,
                   db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    """Change difficulty / importance / type; returns the topic's time allocation before and after."""
    return curriculum_editor_service.update_concept(db, course_id, concept_id, payload.model_dump(exclude_none=True))


@router.post("/{course_id}/prerequisites", status_code=201)
def add_prerequisite(course_id: str, payload: PrerequisiteLink,
                     db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    """Add a prerequisite link. A link that would create a loop is refused with 409."""
    return curriculum_editor_service.add_prerequisite(db, course_id, payload.concept_id, payload.prerequisite_id)


@router.delete("/{course_id}/prerequisites", status_code=204)
def remove_prerequisite(course_id: str, concept_id: str, prerequisite_id: str,
                        db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    curriculum_editor_service.remove_prerequisite(db, course_id, concept_id, prerequisite_id)
    return Response(status_code=204)


@router.put("/{course_id}/curriculum/layout")
def save_layout(course_id: str, payload: CurriculumLayout,
                db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    """Save topic order (and moves between units) in one transaction."""
    return curriculum_editor_service.save_layout(db, course_id, [u.model_dump() for u in payload.units])


@router.post("/{course_id}/curriculum/infer-prerequisites")
def infer_prerequisites(course_id: str,
                        db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    """
    Infers prerequisite dependencies and Bloom's taxonomy levels using Groq LLM
    (llama-3.3-70b-versatile) or pedagogical semantic knowledge graph.
    """
    return curriculum_editor_service.infer_and_apply_prerequisites(db, course_id)
