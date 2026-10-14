from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.models.entities import Course
from app.nlp.deterministic import nlp_provider
from app.optimization.time_allocator import time_allocator
from app.optimization.class_optimizer import class_optimizer

client = TestClient(app)

def test_api_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "database" in data

def test_auth_login():
    response = client.post("/api/auth/login", json={
        "email": "faculty@optiteach.edu",
        "password": "admin123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["email"] == "faculty@optiteach.edu"

def test_nlp_extraction():
    sample_text = """
    Course Code: CS302
    Course Title: Database Management Systems
    CO1: Understand database concepts and ER diagrams.
    CO2: Apply SQL queries and normalization.
    UNIT 1: Database Architecture and ER Model
    Entities, Attributes, Relationships, Cardinality.
    UNIT 2: Relational Normalization
    Functional Dependencies, Minimal Cover, 3NF, BCNF.
    """
    result = nlp_provider.extract_from_text(sample_text)
    assert result.course_code == "CS302"
    assert len(result.outcomes) >= 2
    assert len(result.units) >= 2
    assert result.confidence_score >= 0.85

def test_course_optimization_invariant():
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.code == "CS302").first()
        assert course is not None
        
        opt_res = time_allocator.optimize_course_time(db, course.id)
        
        # Verify strict invariant: Allocated + Revision + Assessment <= Total Available Time
        total_used = opt_res.total_allocated_minutes + opt_res.revision_budget_minutes + opt_res.assessment_budget_minutes
        assert total_used <= opt_res.total_available_minutes, (
            f"Total used ({total_used}m) exceeded available ({opt_res.total_available_minutes}m)"
        )
        assert len(opt_res.topic_allocations) > 0
    finally:
        db.close()

def test_class_optimizer_exact_period_duration_sum():
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.code == "CS302").first()
        assert course is not None

        # Period 15: Flagship Normalization with revision
        class_plan = class_optimizer.optimize_next_class(db, course.id, session_number=15)
        
        # Strict Invariant: Sum of phase durations MUST equal period duration
        assert class_plan.period_duration == course.period_duration
        phase_sum = sum(p.duration_minutes for p in class_plan.phases)
        assert phase_sum == course.period_duration, f"Phase sum was {phase_sum}, expected {course.period_duration}"
        
        # Must detect revision requirement due to Quiz 2 weak performance
        assert class_plan.revision_needed is True
        assert class_plan.revision_minutes == 10
        assert class_plan.revision_concept in ["Candidate Key Determination", "Attribute Closure & Minimal Cover", "Functional Dependencies & Armstrong's Axioms"]
    finally:
        db.close()

def test_assessment_feedback_reoptimization(api):
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.code == "CS302").first()
        assert course is not None
        
        # Call optimize-next-class via API
        resp = api.post(f"/api/courses/{course.id}/optimize-next-class?session_number=15")
        assert resp.status_code == 200
        plan = resp.json()
        assert plan["total_phase_minutes"] == course.period_duration
        assert len(plan["phases"]) >= 4

        # Verify DBMS Insights queries
        q_resp = api.post(f"/api/dbms/queries/q1_topics_remaining/execute?course_id={course.id}")
        assert q_resp.status_code == 200
        q_data = q_resp.json()
        assert q_data["row_count"] > 0
        assert "execution_time_ms" in q_data
    finally:
        db.close()
