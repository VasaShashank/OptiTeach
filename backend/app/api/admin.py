import random
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database.connection import get_db
from app.auth.security import get_current_user, require_admin, hash_password
from app.models.entities import (
    User, Teacher, Course, Section, Student, StudentEnrollment,
    StudentTestResult, Assessment, Performance, Concept, Topic, Unit,
    TeacherConstraint, ClassSession
)
from app.schemas.schemas import (
    AdminOverviewOut, CourseMappingOut, CourseMappingUpdate,
    StudentOut, StudentCreate, RecordStudentTestResultIn,
    TeacherCreateAdmin, CourseCreateAdmin
)
from app.optimization.scoring import scoring_engine

router = APIRouter(prefix="/admin", tags=["Administration (RVCE Portal)"], dependencies=[Depends(require_admin)])

# Common realistic Indian names for RVCE student simulations
FIRST_NAMES = [
    "Aarav", "Aditya", "Akash", "Ananya", "Aniket", "Bhavya", "Chetan", "Deepika",
    "Dhruv", "Gautam", "Harini", "Harsh", "Isha", "Ishaan", "Kavya", "Keerthi",
    "Manish", "Meghana", "Naveen", "Nikhil", "Nithya", "Pooja", "Pranav", "Prathik",
    "Rahul", "Rakesh", "Riya", "Rohan", "Sanjay", "Shreya", "Siddharth", "Sneha",
    "Sourabh", "Suhas", "Swathi", "Tanvi", "Tarun", "Tejas", "Varun", "Vikas"
]

LAST_NAMES = [
    "Bhat", "Deshpande", "Gowda", "Hegde", "Iyengar", "Joshi", "Kulkarni", "Kumar",
    "Murthy", "Nayak", "Patil", "Prasad", "Rao", "Reddy", "Sharma", "Shetty",
    "Singh", "Srinivasan", "Verma", "Venkatesh"
]


@router.get("/overview", response_model=AdminOverviewOut)
def get_admin_overview(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """Institutional overview for RV College of Engineering Department of CSE."""
    total_teachers = db.query(Teacher).count()
    total_courses = db.query(Course).count()
    total_sections = db.query(Section).count()
    total_students = db.query(Student).count()

    # Calculate average attendance
    enrollments = db.query(StudentEnrollment).all()
    if enrollments:
        avg_att = sum(e.attendance_percentage for e in enrollments) / len(enrollments)
        at_risk = sum(1 for e in enrollments if e.attendance_percentage < 75.0 or (e.cie_total > 0 and e.cie_total < 20.0))
    else:
        avg_att = 85.0
        at_risk = 0

    # Attainment rate (% of enrolled student test results meeting 60% threshold)
    test_results = db.query(StudentTestResult).all()
    if test_results:
        met_count = sum(1 for t in test_results if t.percentage >= 60.0)
        attainment_rate = round((met_count / len(test_results)) * 100, 1)
    else:
        attainment_rate = 76.5

    return AdminOverviewOut(
        institution_name="RV College of Engineering (RVCE), Autonomous Bengaluru",
        department_name="Department of Computer Science & Engineering",
        total_teachers=total_teachers,
        total_courses=total_courses,
        total_sections=total_sections,
        total_students=total_students,
        average_attendance=round(avg_att, 1),
        at_risk_students_count=at_risk,
        attainment_rate_percentage=attainment_rate
    )


@router.get("/mappings", response_model=List[CourseMappingOut])
def get_course_mappings(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """
    List all course-to-teacher mappings across semesters and sections.
    Accessible to administrators and faculty for workload transparency.
    """
    courses = db.query(Course).all()
    mappings = []
    for c in courses:
        teacher = c.teacher
        t_user = teacher.user if teacher else None
        teacher_name = t_user.full_name if t_user else "Unassigned"
        teacher_email = t_user.email if t_user else ""
        sec_name = c.sections[0].name if c.sections else "Section A"
        student_cnt = c.sections[0].student_count if c.sections else len(c.enrollments)

        mappings.append(CourseMappingOut(
            course_id=c.id,
            code=c.code,
            title=c.title,
            semester=c.semester,
            section_name=sec_name,
            teacher_id=teacher.id if teacher else "",
            teacher_name=teacher_name,
            teacher_email=teacher_email,
            student_count=max(student_cnt, len(c.enrollments)),
            units_count=len(c.units),
            total_classes=c.total_classes
        ))
    return mappings


@router.put("/mappings/{course_id}", response_model=CourseMappingOut)
def update_course_mapping(
    course_id: str,
    payload: CourseMappingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Admin reassigns a course to a teacher or changes section parameters."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    new_teacher = db.query(Teacher).filter(Teacher.id == payload.teacher_id).first()
    if not new_teacher:
        raise HTTPException(status_code=404, detail="Target teacher profile not found")

    course.teacher_id = new_teacher.id
    if payload.section_name and course.sections:
        course.sections[0].name = payload.section_name

    db.commit()
    db.refresh(course)

    t_user = new_teacher.user
    sec_name = course.sections[0].name if course.sections else "Section A"
    student_cnt = course.sections[0].student_count if course.sections else len(course.enrollments)

    return CourseMappingOut(
        course_id=course.id,
        code=course.code,
        title=course.title,
        semester=course.semester,
        section_name=sec_name,
        teacher_id=new_teacher.id,
        teacher_name=t_user.full_name if t_user else "Faculty",
        teacher_email=t_user.email if t_user else "",
        student_count=student_cnt,
        units_count=len(course.units),
        total_classes=course.total_classes
    )


@router.get("/teachers")
def list_teachers(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """List all faculty members for allocation."""
    teachers = db.query(Teacher).all()
    results = []
    for t in teachers:
        results.append({
            "id": t.id,
            "user_id": t.user_id,
            "full_name": t.user.full_name if t.user else "Faculty",
            "email": t.user.email if t.user else "",
            "department": t.department,
            "designation": t.designation,
            "employee_id": t.employee_id,
            "courses_count": len(t.courses)
        })
    return results


@router.post("/teachers")
def create_teacher(
    payload: TeacherCreateAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Admin registers and enrolls a new faculty member into the institution."""
    email = payload.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Faculty with this email already exists")

    if db.query(Teacher).filter(Teacher.employee_id == payload.employee_id).first():
        raise HTTPException(status_code=400, detail="Faculty with this Employee ID already exists")

    pwd = payload.password or "faculty123"
    user = User(
        email=email,
        hashed_password=hash_password(pwd),
        full_name=payload.full_name,
        role="teacher"
    )
    db.add(user)
    db.flush()

    teacher = Teacher(
        user_id=user.id,
        department=payload.department,
        designation=payload.designation,
        employee_id=payload.employee_id
    )
    db.add(teacher)
    db.commit()
    db.refresh(teacher)

    return {
        "id": teacher.id,
        "user_id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "department": teacher.department,
        "designation": teacher.designation,
        "employee_id": teacher.employee_id
    }


@router.post("/courses", response_model=CourseMappingOut)
def create_course_by_admin(
    payload: CourseCreateAdmin,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Admin creates a course and maps it directly to a teacher, semester, and section."""
    teacher = db.query(Teacher).filter(Teacher.id == payload.teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Selected teacher profile not found")

    existing = db.query(Course).filter(
        Course.teacher_id == teacher.id,
        Course.code == payload.code,
        Course.semester == payload.semester
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Course {payload.code} for {payload.semester} already assigned to this faculty.")

    course = Course(
        teacher_id=teacher.id,
        code=payload.code,
        title=payload.title,
        semester=payload.semester,
        academic_year=payload.academic_year,
        total_classes=payload.total_classes,
        period_duration=payload.period_duration
    )
    db.add(course)
    db.flush()

    section = Section(
        course_id=course.id,
        name=payload.section_name,
        room_number=payload.room_number,
        student_count=payload.student_count
    )
    db.add(section)

    constraint = TeacherConstraint(
        course_id=course.id,
        max_lecture_ratio=0.45,
        min_practice_ratio=0.35,
        revision_threshold_score=60.0,
        default_revision_minutes=10
    )
    db.add(constraint)

    for i in range(1, payload.total_classes + 1):
        db.add(ClassSession(
            course_id=course.id,
            session_number=i,
            duration_minutes=payload.period_duration,
            status="scheduled"
        ))

    db.commit()
    db.refresh(course)

    t_user = teacher.user
    return CourseMappingOut(
        course_id=course.id,
        code=course.code,
        title=course.title,
        semester=course.semester,
        section_name=section.name,
        teacher_id=teacher.id,
        teacher_name=t_user.full_name if t_user else "Faculty",
        teacher_email=t_user.email if t_user else "",
        student_count=section.student_count,
        units_count=0,
        total_classes=course.total_classes
    )


@router.get("/students", response_model=List[StudentOut])
def list_students(
    semester: Optional[int] = Query(None),
    section: Optional[str] = Query(None),
    course_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Filter and view students with their enrollments and CIE marks."""
    query = db.query(Student)
    if semester is not None:
        query = query.filter(Student.semester == semester)
    if section is not None:
        query = query.filter(Student.section == section)

    students = query.order_by(Student.usn).all()
    out = []

    for s in students:
        # Check enrollment in specific course or first enrollment
        enrollment = None
        if course_id:
            enrollment = next((e for e in s.enrollments if e.course_id == course_id), None)
        elif s.enrollments:
            enrollment = s.enrollments[0]

        att = enrollment.attendance_percentage if enrollment else 85.0
        cie = enrollment.cie_total if enrollment else 0.0
        status_str = enrollment.status if enrollment else "active"

        # Collect test scores
        scores = {}
        if enrollment:
            for tr in enrollment.test_results:
                title = tr.assessment.title if tr.assessment else "Assessment"
                scores[title] = tr.marks_obtained

        is_risk = att < 75.0 or (cie > 0 and cie < 20.0)

        out.append(StudentOut(
            id=s.id,
            usn=s.usn,
            full_name=s.full_name,
            email=s.email,
            department=s.department,
            semester=s.semester,
            section=s.section,
            batch_year=s.batch_year,
            attendance_percentage=round(att, 1),
            cie_total=round(cie, 1),
            status=status_str,
            is_at_risk=is_risk,
            test_scores=scores
        ))

    return out


@router.post("/students", response_model=StudentOut)
def create_student(
    payload: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Admin manually adds a student and enrolls them into matching semester/section courses.
    """
    usn = payload.usn.upper().strip()
    if db.query(Student).filter(Student.usn == usn).first():
        raise HTTPException(status_code=400, detail=f"Student with USN '{usn}' already exists")

    email = payload.email.lower().strip()
    if db.query(Student).filter(Student.email == email).first():
        raise HTTPException(status_code=400, detail=f"Student with email '{email}' already exists")

    student = Student(
        usn=usn,
        full_name=payload.full_name,
        email=email,
        department=payload.department,
        semester=payload.semester,
        section=payload.section.upper(),
        batch_year=payload.batch_year
    )
    db.add(student)
    db.flush()

    # Automatically enroll in semester courses that match this semester & section
    all_courses = db.query(Course).all()
    matching_courses = []
    for c in all_courses:
        sem_str = (c.semester or "").lower()
        matches_sem = False
        if str(payload.semester) in sem_str:
            matches_sem = True
        elif payload.semester == 5 and any(term in sem_str for term in ["5", "v", "fall"]):
            matches_sem = True
        elif payload.semester == 3 and any(term in sem_str for term in ["3", "iii"]):
            matches_sem = True
        elif payload.semester == 7 and any(term in sem_str for term in ["7", "vii"]):
            matches_sem = True
        elif not sem_str:
            matches_sem = True
            
        if matches_sem:
            matching_courses.append(c)

    for c in matching_courses:
        sec = next((s for s in c.sections if s.name.upper().endswith(payload.section.upper())), None)
        sec_id = sec.id if sec else (c.sections[0].id if c.sections else None)

        enrollment = StudentEnrollment(
            student_id=student.id,
            course_id=c.id,
            section_id=sec_id,
            attendance_percentage=88.0,
            cie_total=0.0,
            status="enrolled"
        )
        db.add(enrollment)

    db.commit()
    db.refresh(student)

    return StudentOut(
        id=student.id,
        usn=student.usn,
        full_name=student.full_name,
        email=student.email,
        department=student.department,
        semester=student.semester,
        section=student.section,
        batch_year=student.batch_year,
        attendance_percentage=88.0,
        cie_total=0.0,
        status="enrolled",
        is_at_risk=False,
        test_scores={}
    )


class BulkStudentItem(BaseModel):
    usn: str
    full_name: str
    email: Optional[str] = None


class BulkEnrollSectionIn(BaseModel):
    semester: int
    section: str
    department: str = "Computer Science & Engineering"
    batch_year: str = "2023-2027"
    students: List[BulkStudentItem]


@router.post("/sections/bulk-enroll")
def bulk_enroll_section(
    payload: BulkEnrollSectionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Core LMS Feature: Bulk enroll a cohort of students into a specific section
    and automatically bind them to all departmental courses matching that semester & section.
    """
    sec_code = payload.section.upper().replace("SECTION", "").strip()
    sem = payload.semester

    all_courses = db.query(Course).all()
    matching_courses = []
    for c in all_courses:
        sem_str = (c.semester or "").lower()
        matches_sem = False
        if str(sem) in sem_str:
            matches_sem = True
        elif sem == 5 and any(term in sem_str for term in ["5", "v"]):
            matches_sem = True
        elif sem == 3 and any(term in sem_str for term in ["3", "iii"]):
            matches_sem = True
        elif sem == 7 and any(term in sem_str for term in ["7", "vii"]):
            matches_sem = True

        if matches_sem:
            matching_courses.append(c)

    processed_count = 0
    new_count = 0
    enrolled_links = 0

    for item in payload.students:
        raw_usn = item.usn.upper().strip()
        if not raw_usn:
            continue
        
        student = db.query(Student).filter(Student.usn == raw_usn).first()
        if not student:
            raw_email = (item.email or f"{raw_usn.lower()}@rvce.edu.in").lower().strip()
            student = Student(
                usn=raw_usn,
                full_name=item.full_name.strip() or f"Student {raw_usn}",
                email=raw_email,
                department=payload.department,
                semester=sem,
                section=sec_code,
                batch_year=payload.batch_year
            )
            db.add(student)
            db.flush()
            new_count += 1
        else:
            student.semester = sem
            student.section = sec_code
            if item.full_name:
                student.full_name = item.full_name.strip()
            db.flush()

        for c in matching_courses:
            existing_enr = (
                db.query(StudentEnrollment)
                .filter(StudentEnrollment.student_id == student.id, StudentEnrollment.course_id == c.id)
                .first()
            )
            if not existing_enr:
                sec = next((s for s in c.sections if s.name.upper().endswith(sec_code)), None)
                sec_id = sec.id if sec else (c.sections[0].id if c.sections else None)
                enr = StudentEnrollment(
                    student_id=student.id,
                    course_id=c.id,
                    section_id=sec_id,
                    attendance_percentage=88.0,
                    cie_total=0.0,
                    status="enrolled"
                )
                db.add(enr)
                enrolled_links += 1

        processed_count += 1

    db.commit()

    return {
        "status": "success",
        "message": f"Successfully enrolled {processed_count} students ({new_count} newly registered) for {sem}th Sem Section {sec_code}.",
        "processed_students": processed_count,
        "newly_created_students": new_count,
        "enrolled_course_links": enrolled_links,
        "matching_courses": [c.code for c in matching_courses]
    }


@router.post("/simulate-rvce-data")
def simulate_rvce_student_cohorts(
    semester: int = Query(5, description="Semester to simulate (e.g. 3, 5, 7)"),
    section: str = Query("A", description="Section (e.g. A, B)"),
    student_count: int = Query(60, ge=10, le=70, description="Students to generate"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Simulation Engine: Generates realistic RVCE student cohort with valid USNs,
    genuine Indian names, attendance distribution, and realistic test marks for CIEs & Quizzes.
    Simulates genuine conceptual weaknesses on prerequisite topics (e.g. Attribute Closure & Normalization)
    so the Pedagogical Optimizer dynamically calculates remedial time and updates priorities.
    """
    # 1. Locate courses for this semester/section
    courses = db.query(Course).filter(Course.semester.ilike(f"%{semester}%")).all()
    if not courses:
        courses = db.query(Course).all()

    if not courses:
        raise HTTPException(status_code=400, detail="No courses found in database to associate students with")

    target_course = courses[0]

    # Batch year based on semester
    batch_map = {3: "2024-2028", 5: "2023-2027", 7: "2022-2026"}
    batch_year = batch_map.get(semester, "2023-2027")
    year_prefix = "24" if semester == 3 else ("23" if semester == 5 else "22")

    created_students = 0
    enrolled_count = 0

    random.seed(42 + semester)

    # 2. Generate Students
    for i in range(1, student_count + 1):
        usn = f"1RV{year_prefix}CS{i:03d}"
        existing = db.query(Student).filter(Student.usn == usn).first()
        first_n = random.choice(FIRST_NAMES)
        last_n = random.choice(LAST_NAMES)
        full_n = f"{first_n} {last_n}"
        email = f"{first_n.lower()}.{last_n.lower()}{i}@rvce.edu.in"

        if not existing:
            student = Student(
                usn=usn,
                full_name=full_n,
                email=email,
                department="Computer Science & Engineering",
                semester=semester,
                section=section,
                batch_year=batch_year
            )
            db.add(student)
            db.flush()
            created_students += 1
        else:
            student = existing

        # 3. Enroll into courses
        for course in courses:
            enrollment = db.query(StudentEnrollment).filter(
                StudentEnrollment.student_id == student.id,
                StudentEnrollment.course_id == course.id
            ).first()

            if not enrollment:
                # Realistic attendance distribution (majority 80-95%, some at-risk < 75%)
                att = random.gauss(84.0, 7.0)
                att = max(55.0, min(99.0, att))

                sec_id = course.sections[0].id if course.sections else None
                enrollment = StudentEnrollment(
                    student_id=student.id,
                    course_id=course.id,
                    section_id=sec_id,
                    attendance_percentage=att,
                    cie_total=0.0,
                    status="enrolled"
                )
                db.add(enrollment)
                db.flush()
                enrolled_count += 1

            # 4. Generate realistic test results for course assessments
            assessments = course.assessments
            cie_running = 0.0

            for assess in assessments:
                # Check existing test result
                existing_res = db.query(StudentTestResult).filter(
                    StudentTestResult.enrollment_id == enrollment.id,
                    StudentTestResult.assessment_id == assess.id
                ).first()

                if not existing_res:
                    # Model realistic performance based on topic difficulty:
                    # If assessment title contains 'Functional Dependencies' or 'Minimal Cover' or 'Normalization',
                    # introduce a realistic cohort deficit (mean ~52%) to simulate real pedagogical friction!
                    is_hard_topic = any(k in assess.title.lower() for k in ["normal", "functional", "closure", "keys"])
                    if is_hard_topic:
                        mean_pct = 54.0
                        std_dev = 14.0
                    else:
                        mean_pct = 75.0
                        std_dev = 11.0

                    pct = max(20.0, min(100.0, random.gauss(mean_pct, std_dev)))
                    marks = round((pct / 100.0) * assess.max_marks, 1)

                    tr = StudentTestResult(
                        enrollment_id=enrollment.id,
                        assessment_id=assess.id,
                        marks_obtained=marks,
                        max_marks=assess.max_marks,
                        percentage=round(pct, 1),
                        feedback="Conceptual review recommended on normal forms" if pct < 60.0 else "Satisfactory"
                    )
                    db.add(tr)
                    cie_running += (marks / assess.max_marks) * (15.0 if assess.assessment_type == "quiz" else 25.0)

            if cie_running > 0:
                enrollment.cie_total = min(50.0, round(cie_running, 1))

    db.commit()

    # 5. Aggregate student test results into Concept Performance table
    for c in courses:
        for assess in c.assessments:
            all_res = db.query(StudentTestResult).filter(StudentTestResult.assessment_id == assess.id).all()
            if all_res:
                avg_pct = sum(r.percentage for r in all_res) / len(all_res)
                for perf in assess.performances:
                    perf.average_score = round(avg_pct, 1)
                    perf.sample_size = len(all_res)
                    perf.weakness_flag = perf.average_score < 60.0
    db.commit()

    # 6. Re-score course priority engine and raw demand based on simulated test results
    for c in courses:
        for s in scoring_engine.calculate_topic_scores(db, c.id):
            s["topic"].priority_score = s["priority_score"]
    db.commit()

    return {
        "status": "success",
        "message": f"Simulated {student_count} RVCE students for Sem {semester} Sec {section}. Enrolled in {len(courses)} courses with realistic test results.",
        "created_students": created_students,
        "enrolled_count": enrolled_count,
        "department": "Computer Science & Engineering, RVCE"
    }
