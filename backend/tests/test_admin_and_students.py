import pytest
from app.database.connection import SessionLocal
from app.models.entities import Course
from tests.conftest import login_client

@pytest.fixture(scope="session")
def admin_api(seeded_database):
    return login_client("admin@optiteach.edu", "admin123")

def test_admin_overview_endpoint(admin_api):
    res = admin_api.get("/api/admin/overview")
    assert res.status_code == 200
    data = res.json()
    assert "RV College of Engineering" in data["institution_name"]
    assert data["total_teachers"] >= 1
    assert data["total_courses"] >= 1
    assert "attainment_rate_percentage" in data

def test_course_mappings_endpoint(admin_api):
    res = admin_api.get("/api/admin/mappings")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    first_map = data[0]
    assert "course_id" in first_map
    assert "teacher_name" in first_map
    assert "semester" in first_map

def test_students_list_endpoint(admin_api):
    res = admin_api.get("/api/admin/students?semester=5&section=A")
    assert res.status_code == 200
    students = res.json()
    assert isinstance(students, list)
    if students:
        s0 = students[0]
        assert s0["usn"].startswith("1RV")
        assert "attendance_percentage" in s0
        assert "cie_total" in s0

def test_simulate_rvce_cohort_endpoint(admin_api):
    res = admin_api.post("/api/admin/simulate-rvce-data?semester=5&section=A&student_count=15")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["enrolled_count"] >= 1

def test_course_students_and_attainment(api):
    db = SessionLocal()
    try:
        course = db.query(Course).first()
        assert course is not None
        course_id = course.id
    finally:
        db.close()

    # Get students enrolled in course
    res = api.get(f"/api/courses/{course_id}/students")
    assert res.status_code == 200
    students = res.json()
    assert isinstance(students, list)

    # Get attainment report
    att_res = api.get(f"/api/courses/{course_id}/attainment")
    assert att_res.status_code == 200
    att_data = att_res.json()
    assert "outcomes" in att_data
    assert "bloom_mastery" in att_data
    assert "RV College of Engineering" in att_data["institution"]

def test_teacher_forbidden_from_admin_endpoints(api):
    # Faculty teacher should be strictly forbidden (403) from admin endpoints
    res_overview = api.get("/api/admin/overview")
    assert res_overview.status_code == 403

    res_mappings = api.get("/api/admin/mappings")
    assert res_mappings.status_code == 403

    res_sim = api.post("/api/admin/simulate-rvce-data")
    assert res_sim.status_code == 403

def test_teacher_today_agenda(api):
    # Faculty teacher requests their daily institutional schedule & to-dos
    res = api.get("/api/courses/teacher/today-agenda")
    assert res.status_code == 200
    data = res.json()
    assert "Computer Science & Engineering" in data["institution"]
    assert "today_classes" in data
    assert "urgent_todos" in data
    assert "subject_cards" in data
    assert len(data["today_classes"]) >= 1
    c0 = data["today_classes"][0]
    assert "timeslot" in c0
    assert "course_code" in c0
    assert "room" in c0
    assert "topic_name" in c0
    assert "bloom_level" in c0

def test_admin_create_student_manually(admin_api):
    # Admin manually enrolls a new student into the cohort
    payload = {
        "usn": "1RV23CS099",
        "full_name": "Niranjan Murthy",
        "email": "niranjan.cs23@rvce.edu.in",
        "department": "Computer Science & Engineering",
        "semester": 5,
        "section": "A",
        "batch_year": "2023-2027"
    }
    res = admin_api.post("/api/admin/students", json=payload)
    assert res.status_code == 200
    st = res.json()
    assert st["usn"] == "1RV23CS099"
    assert st["full_name"] == "Niranjan Murthy"
    assert st["semester"] == 5
    assert st["section"] == "A"

def test_teacher_record_test_result_manually(api):
    db = SessionLocal()
    try:
        course = db.query(Course).first()
        course_id = course.id
        assessment = course.assessments[0]
        assess_id = assessment.id
        student = course.enrollments[0].student
        student_id = student.id
    finally:
        db.close()

    # Teacher manually enters marks for this student
    payload = {
        "student_id": student_id,
        "assessment_id": assess_id,
        "marks_obtained": 18.5,
        "max_marks": 20.0,
        "feedback": "Excellent performance on normalization and BCNF"
    }
    res = api.post(f"/api/courses/{course_id}/students/record-result", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
