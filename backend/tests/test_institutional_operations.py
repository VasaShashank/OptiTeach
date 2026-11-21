"""
Test Suite for Institutional Operations, Dynamic Scheduling & NBA Compliance
Covers:
- Lost Class Reporting & Saturday Compensation / MILP Rebalance
- Faculty OD Proxy Delegation & 1-Click Handover Kit
- Theory-Lab Batch Synchronization (Batches A1 & A2)
- AICTE Differentiated Instruction (Slow Learners vs Advanced Learners)
- Topic Completion Tracking & Pace Drift Detection
- VTU 85%/75% Attendance Evaluation & Condonation Workflow
- 1-Click NBA / Autonomous Course File (SAR) Export
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.models.entities import Course, ClassSession, Topic, User

client = TestClient(app)


@pytest.fixture(scope="module")
def faculty_token():
    res = client.post("/api/auth/login", json={"email": "faculty@optiteach.edu", "password": "admin123"})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


@pytest.fixture(scope="module")
def sample_course_id(faculty_token):
    res = client.get("/api/courses", headers={"Authorization": f"Bearer {faculty_token}"})
    assert res.status_code == 200
    courses = res.json()
    assert len(courses) > 0
    # Choose CS302 or first available
    c = next((x for x in courses if x.get("code") == "CS302"), courses[0])
    return c["id"]


def test_lost_class_compensate(faculty_token, sample_course_id):
    """Test declaring a lost class with Saturday Zero-Hour compensation."""
    res = client.post(
        f"/api/courses/{sample_course_id}/lost-class",
        headers={"Authorization": f"Bearer {faculty_token}"},
        json={
            "reason": "8th Mile College Fest / Sports Day",
            "action": "compensate",
            "compensation_date": "2026-11-28",
            "compensation_slot": "Saturday 09:00 - 10:00 (Zero Hour)",
            "notes": "Compensating for lost lecture period."
        }
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "success"
    assert data["action"] == "compensate"
    assert "compensation" in data


def test_lost_class_rebalance(faculty_token, sample_course_id):
    """Test declaring a lost class with graceful dynamic MILP rebalance."""
    res = client.post(
        f"/api/courses/{sample_course_id}/lost-class",
        headers={"Authorization": f"Bearer {faculty_token}"},
        json={
            "reason": "Rain Holiday / Local Bandh",
            "action": "rebalance",
            "notes": "Re-run optimizer to compress descriptive topics."
        }
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "success"
    assert data["action"] == "rebalance"


def test_proxy_assignment_and_handover_kit(faculty_token, sample_course_id):
    """Test assigning a substitute faculty and fetching the complete Handover Kit."""
    db = SessionLocal()
    session = db.query(ClassSession).filter(ClassSession.course_id == sample_course_id).first()
    sess_id = session.id if session else "sess-test-1"
    db.close()

    # 1. Assign proxy
    res = client.post(
        f"/api/courses/{sample_course_id}/assign-proxy",
        headers={"Authorization": f"Bearer {faculty_token}"},
        json={
            "session_id": sess_id,
            "proxy_teacher_name": "Dr. Anitha K",
            "proxy_teacher_email": "anitha@rvce.edu.in",
            "reason": "VTU External Valuation Duty",
            "special_instructions": "Focus on 3NF and BCNF worked problems."
        }
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "success"

    # 2. Get handover kit
    res_kit = client.get(
        f"/api/courses/{sample_course_id}/proxy-handover/{sess_id}",
        headers={"Authorization": f"Bearer {faculty_token}"}
    )
    assert res_kit.status_code == 200, res_kit.text
    kit = res_kit.json()
    assert kit["proxy_teacher"] == "Dr. Anitha K"
    assert "phases" in kit["topic"]
    assert len(kit["topic"]["worked_examples"]) >= 1


def test_theory_lab_synchronization(faculty_token, sample_course_id):
    """Test Theory-Lab synchronization for Batches A1 & A2."""
    res = client.get(
        f"/api/courses/{sample_course_id}/lab-sync",
        headers={"Authorization": f"Bearer {faculty_token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "batches" in data
    assert len(data["experiments"]) > 0
    assert "sync_health_percentage" in data


def test_differentiated_learners(faculty_token, sample_course_id):
    """Test AICTE Slow vs Advanced Learners classification."""
    res = client.get(
        f"/api/courses/{sample_course_id}/differentiated-learners",
        headers={"Authorization": f"Bearer {faculty_token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "slow_learners" in data
    assert "advanced_learners" in data
    assert "remedial_schedule" in data


def test_topic_completion_and_pace_drift(faculty_token, sample_course_id):
    """Test recording topic completion with actual duration taken and checking drift."""
    db = SessionLocal()
    topic = db.query(Topic).first()
    assert topic is not None
    t_id = topic.id
    db.close()

    # Record progress: spent 2 periods
    res = client.post(
        f"/api/courses/{sample_course_id}/topics/{t_id}/record-progress",
        headers={"Authorization": f"Bearer {faculty_token}"},
        json={
            "actual_periods_taken": 2.0,
            "remarks": "Extra class spent working on edge cases."
        }
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "success"

    # Check drift analysis
    drift_res = client.get(
        f"/api/courses/{sample_course_id}/syllabus-drift",
        headers={"Authorization": f"Bearer {faculty_token}"}
    )
    assert drift_res.status_code == 200
    drift_data = drift_res.json()
    assert "net_drift_periods" in drift_data
    assert "overall_status" in drift_data


def test_vtu_attendance_analysis(faculty_token, sample_course_id):
    """Test VTU 85%/75% attendance evaluation & condonation workflow."""
    res = client.get(
        f"/api/courses/{sample_course_id}/attendance-analysis",
        headers={"Authorization": f"Bearer {faculty_token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "eligible_count" in data
    assert "condonation_count" in data
    assert len(data["roster"]) > 0


def test_1click_nba_course_file_export(faculty_token, sample_course_id):
    """Test 1-Click NBA / Autonomous Course File (SAR) printable HTML generation."""
    res = client.get(
        f"/api/exports/courses/{sample_course_id}/nba-course-file",
        headers={"Authorization": f"Bearer {faculty_token}"}
    )
    assert res.status_code == 200, res.text
    assert "text/html" in res.headers["content-type"]
    assert "R. V. COLLEGE OF ENGINEERING" in res.text
    assert "NBA COURSE FILE" in res.text
    assert "Course Outcome" in res.text
