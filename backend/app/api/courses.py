from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from app.database.connection import get_db
from app.models.entities import (
    Course, Teacher, Unit, Topic, Section, TeacherConstraint, Assessment, User, CourseMember,
    ClassSession, LessonPlan, Student, StudentEnrollment, StudentTestResult, Concept, CourseOutcome
)
from app.schemas.schemas import (
    CourseCreate, CourseUpdate, CourseOut, ConfirmCurriculumRequest, CurriculumGraphResponse,
    OptimizeCourseRequest, CourseOptimizationResponse, NextClassOptimizationResponse,
    LessonPlanOut, LessonPlanUpdate, AssessmentCreate, AssessmentOut,
    RecordAssessmentResultsRequest, CourseAnalyticsResponse, SessionLogIn
)
from app.nlp.deterministic import nlp_provider
from app.services.curriculum_service import curriculum_service
from app.services.analytics_service import analytics_service
from app.services.lesson_plan_service import lesson_plan_service
from app.services.assessment_service import assessment_service
from app.services.session_service import session_service
from app.services.artifact_service import artifact_service
from app.optimization.time_allocator import time_allocator
from app.optimization.class_optimizer import class_optimizer

from app.auth.security import get_current_user, get_current_teacher, get_accessible_course, get_owned_course, course_role, limit_uploads

# Every route requires a valid bearer token; /{course_id} routes additionally resolve the
# course through get_accessible_course (owner or admin, otherwise 404).
router = APIRouter(prefix="/courses", tags=["Courses & Optimization"], dependencies=[Depends(get_current_user)])

MAX_SYLLABUS_BYTES = 5 * 1024 * 1024
IMAGE_SYLLABUS_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")
ALLOWED_SYLLABUS_SUFFIXES = (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".md")

@router.get("", response_model=List[CourseOut])
def list_courses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Courses the user owns, then courses shared with them (co-teacher or viewer)."""
    query = db.query(Course)
    if current_user.role != "admin":
        shared = (
            db.query(CourseMember.course_id).join(Teacher, CourseMember.teacher_id == Teacher.id)
            .filter(Teacher.user_id == current_user.id)
        )
        owned = db.query(Course.id).join(Teacher).filter(Teacher.user_id == current_user.id)
        query = query.filter(or_(Course.id.in_(owned), Course.id.in_(shared)))
    courses = query.order_by(Course.created_at).all()
    results = []
    for c in courses:
        u_count = len(c.units)
        t_count = sum(len(u.topics) for u in c.units)
        c_count = sum(sum(len(t.concepts) for t in u.topics) for u in c.units)
        results.append(CourseOut(
            id=c.id,
            code=c.code,
            title=c.title,
            semester=c.semester,
            academic_year=c.academic_year,
            total_classes=c.total_classes,
            period_duration=c.period_duration,
            total_available_minutes=c.total_available_minutes,
            teacher_name=c.teacher.user.full_name if (c.teacher and c.teacher.user) else "Faculty",
            section_name=c.sections[0].name if c.sections else "Default Section",
            units_count=u_count,
            topics_count=t_count,
            concepts_count=c_count,
            my_role=course_role(db, c, current_user),
            created_at=c.created_at
        ))
    order = {"owner": 0, "admin": 0, "co_teacher": 1, "viewer": 2}
    return sorted(results, key=lambda r: order.get(r.my_role, 3))

@router.post("", response_model=CourseOut)
def create_course(
    payload: CourseCreate,
    teacher: Optional[Teacher] = Depends(get_current_teacher),
    db: Session = Depends(get_db)
):
    if not teacher:
        raise HTTPException(status_code=403, detail="Only teachers can create courses")

    course = Course(
        teacher_id=teacher.id,
        code=payload.code,
        title=payload.title,
        semester=payload.semester,
        academic_year=payload.academic_year,
        total_classes=payload.total_classes,
        period_duration=payload.period_duration,
        start_date=payload.start_date,
        end_date=payload.end_date
    )
    db.add(course)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"You already have a course with code '{payload.code}' in {payload.semester}. Please choose 'Add to an existing course' or change the code/semester."
        ) from exc

    section = Section(
        course_id=course.id,
        name=payload.section_name,
        student_count=payload.student_count
    )
    db.add(section)

    c_vals = payload.constraints
    constraint = TeacherConstraint(
        course_id=course.id,
        max_lecture_ratio=c_vals.max_lecture_ratio if c_vals else 0.40,
        min_practice_ratio=c_vals.min_practice_ratio if c_vals else 0.35,
        revision_threshold_score=c_vals.revision_threshold_score if c_vals else 60.0,
        default_revision_minutes=c_vals.default_revision_minutes if c_vals else 10
    )
    db.add(constraint)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"You already have a course with code '{payload.code}' in {payload.semester}."
        ) from exc
    db.refresh(course)

    return CourseOut(
        id=course.id,
        code=course.code,
        title=course.title,
        semester=course.semester,
        academic_year=course.academic_year,
        total_classes=course.total_classes,
        period_duration=course.period_duration,
        total_available_minutes=course.total_available_minutes,
        teacher_name=teacher.user.full_name if teacher.user else "Faculty",
        section_name=section.name,
        units_count=0,
        topics_count=0,
        concepts_count=0,
        created_at=course.created_at
    )

@router.get("/teacher/today-agenda")
def get_teacher_today_agenda(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Real-life daily institutional agenda for faculty.
    Aggregates today's scheduled class periods across all assigned courses and sections,
    critical daily action items (class prep, grading pending tests, logging attendance),
    and subject-wise workload progress with course-specific to-dos.
    """
    courses_query = db.query(Course)
    if current_user.role != "admin":
        shared = (
            db.query(CourseMember.course_id).join(Teacher, CourseMember.teacher_id == Teacher.id)
            .filter(Teacher.user_id == current_user.id)
        )
        owned = db.query(Course.id).join(Teacher).filter(Teacher.user_id == current_user.id)
        courses = courses_query.filter(or_(Course.id.in_(owned), Course.id.in_(shared))).order_by(Course.code).all()
    else:
        courses = courses_query.order_by(Course.code).all()

    days_of_week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    current_day = datetime.now().strftime("%A")
    if current_day not in days_of_week:
        current_day = "Monday"

    standard_period_defs = [
        {"num": 1, "time": "09:00 AM - 10:00 AM"},
        {"num": 2, "time": "10:00 AM - 11:00 AM"},
        {"num": 3, "time": "11:15 AM - 12:15 PM"},
        {"num": 4, "time": "12:15 PM - 01:15 PM"},
        {"num": 5, "time": "02:00 PM - 03:00 PM"},
        {"num": 6, "time": "03:00 PM - 04:00 PM"},
    ]

    schedule_template = [
        # Course 0 (e.g. CS301 / CS302)
        (0, "Monday", 1, "Theory Lecture"),
        (0, "Wednesday", 1, "Theory Lecture"),
        (0, "Thursday", 3, "Theory Lecture"),
        (0, "Friday", 1, "Tutorial / Practical"),
        # Course 1 (e.g. CS503)
        (1, "Monday", 3, "Theory Lecture"),
        (1, "Tuesday", 2, "Theory Lecture"),
        (1, "Thursday", 1, "Theory Lecture"),
        (1, "Friday", 3, "Theory Lecture"),
        # Course 2 (e.g. CS701 / CS301 Sec B)
        (2, "Tuesday", 4, "Theory Lecture"),
        (2, "Wednesday", 3, "Theory Lecture"),
        (2, "Thursday", 4, "Theory Lecture"),
        (2, "Friday", 5, "Lab / Remedial"),
        # Course 3 (if present)
        (3, "Monday", 5, "Lab Session"),
        (3, "Wednesday", 5, "Theory Lecture"),
        (3, "Friday", 4, "Theory Lecture"),
        # Course 4 (if present)
        (4, "Tuesday", 5, "Theory Lecture"),
        (4, "Thursday", 5, "Theory Lecture"),
    ]

    weekly_timetable = []
    course_metadata = {}
    subject_cards = []
    urgent_todos = []

    for idx, c in enumerate(courses):
        sec = c.sections[0] if c.sections else None
        sec_name = sec.name if sec else "Sec A"
        room_no = (sec.room_number if sec and sec.room_number else f"Room CS-{301 + idx}")

        # Completed sessions & upcoming session
        sessions = c.class_sessions or []
        completed_sessions = [s for s in sessions if s.status == "completed"]
        completed_count = len(completed_sessions)
        
        next_session = next((s for s in sessions if s.status != "completed"), None)
        next_session_num = next_session.session_number if next_session else completed_count + 1

        active_topic_title = "Curriculum Overview"
        active_concept = None
        if next_session and next_session.current_topic:
            active_topic_title = next_session.current_topic.title
            if next_session.current_topic.concepts:
                active_concept = next_session.current_topic.concepts[0].name
        elif c.units:
            for u in c.units:
                for t in u.topics:
                    if t.status != "completed":
                        active_topic_title = t.title
                        if t.concepts:
                            active_concept = t.concepts[0].name
                        break
                if active_topic_title != "Curriculum Overview":
                    break

        active_bloom = "Apply"
        if c.outcomes:
            active_bloom = c.outcomes[min(idx, len(c.outcomes) - 1)].bloom_level

        lesson_plan_status = "ready"
        if next_session and next_session.lesson_plan:
            lesson_plan_status = next_session.lesson_plan.status

        enrollments = db.query(StudentEnrollment).filter(StudentEnrollment.course_id == c.id).all()
        student_count = len(enrollments) if enrollments else (sec.student_count if sec else 60)
        cie_scores = [e.cie_total for e in enrollments if e.cie_total > 0]
        cie_avg = round(sum(cie_scores) / len(cie_scores), 1) if cie_scores else 36.5

        weak_results = (
            db.query(StudentTestResult)
            .join(StudentEnrollment, StudentTestResult.enrollment_id == StudentEnrollment.id)
            .filter(StudentEnrollment.course_id == c.id, StudentTestResult.percentage < 50.0)
            .count()
        )
        has_remedial_need = weak_results > 0

        course_metadata[c.id] = {
            "course": c,
            "sec_name": sec_name,
            "room_no": room_no,
            "completed_count": completed_count,
            "next_session_num": next_session_num,
            "active_topic_title": active_topic_title,
            "active_concept": active_concept,
            "active_bloom": active_bloom,
            "lesson_plan_status": lesson_plan_status,
            "student_count": student_count,
            "cie_avg": cie_avg,
            "weak_results": weak_results,
            "has_remedial_need": has_remedial_need,
        }

        # Subject-specific to-dos
        specific_todos = [
            f"Prepare lecture presentation & worked examples for '{active_topic_title}' (Period #{next_session_num})",
            f"Record class delivery & mark attendance for {sec_name} in {room_no}",
        ]
        assessments = c.assessments or []
        pending_eval = next((a for a in assessments if a.status != "graded"), None)
        if pending_eval:
            specific_todos.append(f"Grade {pending_eval.title} ({student_count} student scripts pending)")
        else:
            specific_todos.append(f"Prepare Quiz 2 question bank mapped to {active_bloom} level")

        if has_remedial_need:
            specific_todos.append(f"Conduct 10-min remedial review on prerequisite gap ({weak_results} students flagged)")

        progress_pct = round((completed_count / max(1, c.total_classes)) * 100)
        subject_cards.append({
            "course_id": c.id,
            "code": c.code,
            "title": c.title,
            "semester": c.semester,
            "section": sec_name,
            "room": room_no,
            "total_classes": c.total_classes,
            "completed_classes": completed_count,
            "progress_pct": progress_pct,
            "active_topic": active_topic_title,
            "bloom_level": active_bloom,
            "student_count": student_count,
            "cie_avg": cie_avg,
            "pending_tasks_count": len(specific_todos),
            "specific_todos": specific_todos,
            "next_session_number": next_session_num,
            "next_timeslot": "09:00 AM - 10:00 AM"
        })

        urgent_todos.append({
            "id": f"prep-{c.id}",
            "course_code": c.code,
            "course_id": c.id,
            "category": "prep",
            "title": f"Review Period #{next_session_num} Plan ({c.code})",
            "description": f"Verify lesson plan timing & slides for '{active_topic_title}' in {room_no}",
            "priority": "high",
            "due_time": "Before 09:00 AM",
            "done": lesson_plan_status == "approved"
        })

        if pending_eval:
            urgent_todos.append({
                "id": f"grading-{c.id}",
                "course_code": c.code,
                "course_id": c.id,
                "category": "grading",
                "title": f"Grade {pending_eval.title} ({c.code})",
                "description": f"Enter CIE marks for {sec_name} ({student_count} students) before department deadline",
                "priority": "high",
                "due_time": "By 05:00 PM",
                "done": False
            })

        if has_remedial_need:
            urgent_todos.append({
                "id": f"remedial-{c.id}",
                "course_code": c.code,
                "course_id": c.id,
                "category": "remedial",
                "title": f"Address Prerequisite Deficit in {c.code}",
                "description": f"{weak_results} students scored below 50% in continuous assessment. Allocate 10 min revision.",
                "priority": "medium",
                "due_time": "Today",
                "done": False
            })

    # Build weekly timetable
    for c_idx, day, p_num, c_type in schedule_template:
        if c_idx < len(courses):
            c = courses[c_idx]
            meta = course_metadata[c.id]
            slot_time = next((p["time"] for p in standard_period_defs if p["num"] == p_num), "09:00 AM - 10:00 AM")
            weekly_timetable.append({
                "day": day,
                "period_number": p_num,
                "period_slot": slot_time,
                "course_id": c.id,
                "course_code": c.code,
                "course_title": c.title,
                "semester": c.semester,
                "section": meta["sec_name"],
                "room": meta["room_no"],
                "class_type": c_type,
                "topic": meta["active_topic_title"],
                "bloom_level": meta["active_bloom"]
            })

    # Today's classes derived from today's timetable slots
    today_slots = [s for s in weekly_timetable if s["day"] == current_day]
    today_slots.sort(key=lambda s: s["period_number"])

    today_classes = []
    for s in today_slots:
        meta = course_metadata.get(s["course_id"])
        if meta:
            today_classes.append({
                "course_id": s["course_id"],
                "course_code": s["course_code"],
                "course_title": s["course_title"],
                "semester": s["semester"],
                "section": s["section"],
                "room": s["room"],
                "timeslot": s["period_slot"],
                "period_number": s["period_number"],
                "class_type": s["class_type"],
                "session_number": meta["next_session_num"],
                "topic_name": meta["active_topic_title"],
                "concept_name": meta["active_concept"] or meta["active_topic_title"],
                "bloom_level": meta["active_bloom"],
                "lesson_plan_status": meta["lesson_plan_status"],
                "has_remedial_alert": meta["has_remedial_need"],
                "student_count": meta["student_count"]
            })

    # Fallback if no classes scheduled today (e.g. edge case)
    if not today_classes and courses:
        for idx, c in enumerate(courses[:3]):
            meta = course_metadata[c.id]
            slot = standard_period_defs[idx]["time"]
            today_classes.append({
                "course_id": c.id,
                "course_code": c.code,
                "course_title": c.title,
                "semester": c.semester,
                "section": meta["sec_name"],
                "room": meta["room_no"],
                "timeslot": slot,
                "period_number": idx + 1,
                "class_type": "Theory Lecture",
                "session_number": meta["next_session_num"],
                "topic_name": meta["active_topic_title"],
                "concept_name": meta["active_concept"] or meta["active_topic_title"],
                "bloom_level": meta["active_bloom"],
                "lesson_plan_status": meta["lesson_plan_status"],
                "has_remedial_alert": meta["has_remedial_need"],
                "student_count": meta["student_count"]
            })

    if courses:
        urgent_todos.append({
            "id": "attendance-all",
            "course_code": "ALL",
            "course_id": courses[0].id,
            "category": "attendance",
            "title": "Log Daily Attendance & Syllabus Coverage",
            "description": "Ensure institutional student attendance registers are updated for all delivered periods today.",
            "priority": "normal",
            "due_time": "By 05:30 PM",
            "done": False
        })

    return {
        "teacher_name": current_user.full_name,
        "date_str": "Today",
        "day_name": current_day,
        "weekly_hours": len(weekly_timetable),
        "institution": "Department of Computer Science & Engineering",
        "department": "Department of Computer Science & Engineering",
        "today_classes": today_classes,
        "weekly_timetable": weekly_timetable,
        "urgent_todos": urgent_todos,
        "subject_cards": subject_cards,
        "total_courses": len(courses)
    }

@router.get("/{course_id}", response_model=CourseOut)
def get_course(c: Course = Depends(get_accessible_course), current_user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    u_count = len(c.units)
    t_count = sum(len(u.topics) for u in c.units)
    c_count = sum(sum(len(t.concepts) for t in u.topics) for u in c.units)

    return CourseOut(
        id=c.id,
        code=c.code,
        title=c.title,
        semester=c.semester,
        academic_year=c.academic_year,
        total_classes=c.total_classes,
        period_duration=c.period_duration,
        total_available_minutes=c.total_available_minutes,
        teacher_name=c.teacher.user.full_name if (c.teacher and c.teacher.user) else "Faculty",
        section_name=c.sections[0].name if c.sections else None,
        units_count=u_count,
        topics_count=t_count,
        concepts_count=c_count,
        my_role=course_role(db, c, current_user),
        created_at=c.created_at
    )

@router.delete("/{course_id}")
def delete_course(
    course: Course = Depends(get_owned_course),
    db: Session = Depends(get_db)
):
    """
    Permanently delete a course/subject.
    Restricted to the course owner or admin.
    Cascades through related relational records (units, topics, concepts, sessions, etc.)
    and deletes associated MongoDB documents, graphs, and artifacts.
    """
    course_id = course.id
    code = course.code
    title = course.title

    # 1. Clean up associated MongoDB artifacts
    artifact_service.delete_course_artifacts(course_id)

    # 2. Delete the course in SQL (cascades to all children)
    db.delete(course)
    db.commit()

    return {
        "status": "success",
        "message": f"Course '{code} - {title}' deleted successfully",
        "course_id": course_id
    }

@router.patch("/{course_id}", response_model=CourseOut)
def update_course(
    course_id: str,
    payload: CourseUpdate,
    db: Session = Depends(get_db),
    course: Course = Depends(get_owned_course)
):
    if payload.title is not None:
        course.title = payload.title
    if payload.code is not None:
        course.code = payload.code
    if payload.semester is not None:
        course.semester = payload.semester
    if payload.academic_year is not None:
        course.academic_year = payload.academic_year
    if payload.total_classes is not None:
        course.total_classes = payload.total_classes
    if payload.period_duration is not None:
        course.period_duration = payload.period_duration

    db.commit()
    db.refresh(course)

    u_count = len(course.units)
    t_count = sum(len(u.topics) for u in course.units)
    c_count = sum(sum(len(t.concepts) for t in u.topics) for u in course.units)
    return CourseOut(
        id=course.id,
        code=course.code,
        title=course.title,
        semester=course.semester,
        academic_year=course.academic_year,
        total_classes=course.total_classes,
        period_duration=course.period_duration,
        total_available_minutes=course.total_available_minutes,
        teacher_name=course.teacher.user.full_name if (course.teacher and course.teacher.user) else "Faculty",
        section_name=course.sections[0].name if course.sections else "Default Section",
        units_count=u_count,
        topics_count=t_count,
        concepts_count=c_count,
        my_role="owner",
        created_at=course.created_at
    )

# -------------------------------------------------------------
# Curriculum & Knowledge Graph
# -------------------------------------------------------------
async def read_syllabus_upload(file: UploadFile) -> bytes:
    """Bounded read with an extension allow-list; rejects oversized or unexpected files."""
    if not file.filename or not file.filename.lower().endswith(ALLOWED_SYLLABUS_SUFFIXES):
        raise HTTPException(status_code=415, detail="Syllabus must be a PDF, image (.png, .jpg, .webp), or text file (.txt, .md)")
    content = await file.read(MAX_SYLLABUS_BYTES + 1)
    if len(content) > MAX_SYLLABUS_BYTES:
        raise HTTPException(status_code=413, detail="Syllabus file exceeds the 5 MB limit")
    if file.filename.lower().endswith(".pdf") and b"%PDF" not in content[:1024]:
        raise HTTPException(status_code=415, detail="File is not a valid PDF")
    return content
@router.post("/{course_id}/syllabus", dependencies=[Depends(limit_uploads)])
async def upload_course_syllabus(
    course_id: str,
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
    course: Course = Depends(get_accessible_course),
    db: Session = Depends(get_db)
):
    curriculum = None
    try:
        if file:
            content_bytes = await read_syllabus_upload(file)
            filename = file.filename.lower()
            if filename.endswith(".pdf"):
                curriculum = nlp_provider.extract_from_pdf(content_bytes)
            elif filename.endswith(IMAGE_SYLLABUS_SUFFIXES):
                curriculum = nlp_provider.extract_from_image(content_bytes)
            else:
                text = content_bytes.decode("utf-8", errors="ignore")
                curriculum = nlp_provider.extract_from_text(text)
        elif raw_text and raw_text.strip():
            curriculum = nlp_provider.extract_from_text(raw_text.strip())
        else:
            raise HTTPException(status_code=400, detail="No syllabus content provided. Please upload a PDF, image, or paste text.")
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve)) from ve
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Syllabus extraction failed: {str(e)}") from e

    # Automatically confirm and persist directly to this course
    confirm_payload = ConfirmCurriculumRequest(
        course_name=course.title,
        course_code=course.code,
        units=curriculum.units,
        outcomes=curriculum.outcomes
    )
    artifact_service.record_extraction(curriculum, course_id=course_id, extracted_by=course.teacher.user_id)
    curriculum_service.confirm_and_persist(db, course_id, confirm_payload)
    time_allocator.optimize_course_time(db, course_id)

    return {
        "status": "success",
        "message": f"Successfully extracted and linked {len(curriculum.units)} units and {len(curriculum.outcomes)} outcomes to {course.code}",
        "curriculum": curriculum,
        "course_id": course_id
    }

@router.post("/{course_id}/curriculum/confirm")
def confirm_curriculum(course_id: str, payload: ConfirmCurriculumRequest, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    result = curriculum_service.confirm_and_persist(db, course_id, payload)
    # Automatically run optimizer to update allocations
    time_allocator.optimize_course_time(db, course_id)
    return result

@router.get("/{course_id}/graph", response_model=CurriculumGraphResponse)
def get_curriculum_graph(course_id: str, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    return curriculum_service.get_graph(db, course_id)

@router.get("/{course_id}/graph/versions")
def list_graph_versions(course_id: str, _: Course = Depends(get_accessible_course)):
    """Curriculum graph snapshots stored in MongoDB, newest first."""
    return artifact_service.list_graph_versions(course_id)

@router.get("/{course_id}/graph/diff")
def diff_graph_versions(course_id: str, from_version: int, to_version: int, _: Course = Depends(get_accessible_course)):
    return artifact_service.diff_graph_versions(course_id, from_version, to_version)

# -------------------------------------------------------------
# Optimization Endpoints
# -------------------------------------------------------------
@router.post("/{course_id}/optimize", response_model=CourseOptimizationResponse)
def run_course_optimization(
    course_id: str,
    payload: Optional[OptimizeCourseRequest] = None,
    revision_percent: Optional[float] = Query(None),
    assessment_percent: Optional[float] = Query(None),
    buffer_percent: Optional[float] = Query(None),
    db: Session = Depends(get_db),
    _: Course = Depends(get_accessible_course)
):
    rev_p = payload.revision_percent if (payload and payload.revision_percent is not None) else revision_percent
    ass_p = payload.assessment_percent if (payload and payload.assessment_percent is not None) else assessment_percent
    buf_p = payload.buffer_percent if (payload and payload.buffer_percent is not None) else buffer_percent
    return time_allocator.optimize_course_time(
        db, course_id, persist=True, revision_percent=rev_p, assessment_percent=ass_p, buffer_percent=buf_p
    )

@router.get("/{course_id}/optimization", response_model=CourseOptimizationResponse)
def get_course_optimization(
    course_id: str,
    revision_percent: Optional[float] = Query(None),
    assessment_percent: Optional[float] = Query(None),
    buffer_percent: Optional[float] = Query(None),
    db: Session = Depends(get_db),
    _: Course = Depends(get_accessible_course)
):
    # A GET must not change data: compute the allocation without persisting it
    return time_allocator.optimize_course_time(
        db, course_id, persist=False, revision_percent=revision_percent, assessment_percent=assessment_percent, buffer_percent=buffer_percent
    )

@router.post("/{course_id}/optimize-next-class", response_model=NextClassOptimizationResponse)
def optimize_next_class(
    course_id: str,
    session_number: Optional[int] = None,
    custom_revision_minutes: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: Course = Depends(get_accessible_course)
):
    return class_optimizer.optimize_next_class(
        db, course_id, session_number=session_number, custom_revision_minutes=custom_revision_minutes
    )

# -------------------------------------------------------------
# Lesson Plans
# -------------------------------------------------------------
@router.post("/{course_id}/lesson-plans/generate", response_model=LessonPlanOut)
def generate_lesson_plan(course_id: str, payload: Dict[str, Any], db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    topic_in_course = (
        db.query(Topic.id).join(Unit)
        .filter(Topic.id == payload.get("topic_id"), Unit.course_id == course_id)
        .first()
    )
    if not topic_in_course:
        raise HTTPException(status_code=404, detail="Topic not found in this course")
    session_num = payload.get("session_number", 15)
    return lesson_plan_service.generate_plan(db, course_id, session_num, payload)

@router.get("/{course_id}/lesson-plans", response_model=List[LessonPlanOut])
def list_course_lesson_plans(
    course_id: str,
    session_number: Optional[int] = None,
    unit_id: Optional[str] = None,
    topic_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: Course = Depends(get_accessible_course)
):
    return lesson_plan_service.list_plans(
        db, course_id, session_number=session_number, unit_id=unit_id, topic_id=topic_id, status=status
    )

@router.patch("/{course_id}/lesson-plans/{session_number}", response_model=LessonPlanOut)
def review_lesson_plan(
    course_id: str,
    session_number: int,
    payload: LessonPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: Course = Depends(get_accessible_course),
):
    """Accept / edit / reject a recommended plan. Stale expected_version -> 409."""
    return lesson_plan_service.update_plan(db, course_id, session_number, payload, current_user.id)

@router.get("/{course_id}/lesson-plans/{session_number}/history")
def lesson_plan_history(course_id: str, session_number: int, db: Session = Depends(get_db),
                        _: Course = Depends(get_accessible_course)):
    """Every saved version of the plan (MongoDB), newest first, with who changed it."""
    return artifact_service.lesson_plan_history(db, course_id, session_number)

@router.get("/{course_id}/lesson-plans/{session_number}/diff")
def lesson_plan_diff(course_id: str, session_number: int, from_version: int, to_version: int,
                     db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    return artifact_service.diff_lesson_plan_versions(db, course_id, session_number, from_version, to_version)

# -------------------------------------------------------------
# Class Sessions (timetable + post-class record)
# -------------------------------------------------------------
@router.get("/{course_id}/sessions")
def list_sessions(course_id: str, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    return session_service.list_sessions(db, course_id)

@router.post("/{course_id}/sessions/{session_number}/log")
def log_session(course_id: str, session_number: int, payload: SessionLogIn,
                db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    """Record a taught class. A second record for the same session -> 409."""
    return session_service.log_session(db, course_id, session_number, payload)

# -------------------------------------------------------------
# Assessments & Continuous Feedback
# -------------------------------------------------------------
@router.get("/{course_id}/assessments")
def list_assessments(course_id: str, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    assessments = db.query(Assessment).filter(Assessment.course_id == course_id).all()
    results = []
    for a in assessments:
        results.append({
            "id": a.id,
            "title": a.title,
            "assessment_type": a.assessment_type,
            "max_marks": a.max_marks,
            "scheduled_date": a.scheduled_date,
            "status": a.status,
            "questions_count": len(a.questions),
            "performances": [
                {
                    "concept_id": p.concept_id,
                    "concept_name": p.concept.name if p.concept else "",
                    "average_score": p.average_score,
                    "weakness_flag": p.weakness_flag,
                    "common_errors": p.common_errors
                } for p in a.performances
            ]
        })
    return results

@router.post("/{course_id}/assessments", response_model=AssessmentOut)
def create_assessment(course_id: str, payload: AssessmentCreate, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    return assessment_service.create_assessment(db, course_id, payload)

@router.post("/{course_id}/assessments/{assessment_id}/results")
def record_assessment_results(course_id: str, assessment_id: str, payload: RecordAssessmentResultsRequest, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    # The assessment must belong to the course in the URL, or a teacher could write
    # into another course's assessment through their own course's path
    if not db.query(Assessment.id).filter(Assessment.id == assessment_id, Assessment.course_id == course_id).first():
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment_service.record_results(db, assessment_id, payload)

# -------------------------------------------------------------
# Analytics & Alerts
# -------------------------------------------------------------
@router.get("/{course_id}/analytics", response_model=CourseAnalyticsResponse)
def get_analytics(course_id: str, db: Session = Depends(get_db), _: Course = Depends(get_accessible_course)):
    return analytics_service.get_course_analytics(db, course_id)
