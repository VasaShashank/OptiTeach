"""
Export API Routes for Schedules and Reports
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.entities import ClassSession, Course, User
from app.services.export_service import export_service
from app.auth.security import get_current_user, get_accessible_course

router = APIRouter(prefix="/exports", tags=["Exports & Compliance"], dependencies=[Depends(get_current_user)])

@router.get("/courses/{course_id}/calendar.ics")
def export_course_calendar(course_id: str, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    """Export course schedule as iCalendar (.ics) format"""
    try:
        ics_content = export_service.generate_ics_calendar(db, course_id)
        return Response(
            content=ics_content,
            media_type="text/calendar",
            headers={"Content-Disposition": f"attachment; filename=course-{course_id}-schedule.ics"}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@router.get("/lesson-plans/{session_id}/printable")
def export_lesson_plan_printable(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Export formatted printable HTML lesson plan (saveable as PDF)"""
    session = db.query(ClassSession).filter(ClassSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Lesson plan not found")
    get_accessible_course(session.course_id, current_user, db)
    try:
        html_content = export_service.generate_lesson_plan_html(db, session_id)
        return Response(
            content=html_content,
            media_type="text/html"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

@router.get("/courses/{course_id}/outcomes-matrix")
def export_course_outcomes_matrix(course_id: str, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    """Export NBA/ABET Course Outcome Attainment Matrix"""
    try:
        return export_service.generate_outcome_matrix(db, course_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

@router.get("/courses/{course_id}/nba-course-file")
def export_nba_course_file(course_id: str, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    """Export Comprehensive 1-Click NBA / Autonomous Course File (Printable HTML/PDF)"""
    try:
        html_content = export_service.generate_nba_course_file_html(db, course_id)
        return Response(content=html_content, media_type="text/html")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
