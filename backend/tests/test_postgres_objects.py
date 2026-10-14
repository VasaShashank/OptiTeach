"""
Server-side PostgreSQL objects from migration 0002: generated column, triggers,
functions, stored procedure, views and the materialized view.

Runs against the throwaway `optiteach_test` database from the `pg` fixture (conftest):
migrated with Alembic and seeded, so it exercises exactly what production gets.
"""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError


@pytest.fixture
def conn(pg):
    """Each test runs in a transaction that is rolled back afterwards."""
    with pg.connect() as connection:
        trans = connection.begin()
        yield connection
        trans.rollback()


def scalar(conn, sql, **params):
    return conn.execute(text(sql), params).scalar()


def course_id(conn):
    return scalar(conn, "SELECT id FROM courses WHERE code = 'CS302'")


def concept_id(conn, name):
    return scalar(conn, "SELECT id FROM concepts WHERE name = :n", n=name)


# ------------------------------------------------------------------ normalization

def test_total_available_minutes_is_generated(conn):
    cid = course_id(conn)
    pd = scalar(conn, "SELECT period_duration FROM courses WHERE id = :c", c=cid)
    assert scalar(conn, "SELECT total_available_minutes FROM courses WHERE id = :c", c=cid) == 30 * pd

    with pytest.raises(DBAPIError, match="generated column"):
        with conn.begin_nested():
            conn.execute(text("UPDATE courses SET total_available_minutes = 1 WHERE id = :c"), {"c": cid})


def test_preferred_methods_are_ranked_rows(conn):
    rows = conn.execute(text("""
        SELECT tm.name, tpm.rank
        FROM teacher_preferred_methods tpm
        JOIN teaching_methods tm ON tm.id = tpm.method_id
        JOIN teacher_constraints tc ON tc.id = tpm.constraint_id
        WHERE tc.course_id = :c ORDER BY tpm.rank
    """), {"c": course_id(conn)}).all()
    assert [r.rank for r in rows] == [1, 2]

    with pytest.raises(IntegrityError, match="uq_preferred_method_rank"):
        with conn.begin_nested():
            conn.execute(text("""
                INSERT INTO teacher_preferred_methods (constraint_id, method_id, rank)
                SELECT tc.id, tm.id, 1 FROM teacher_constraints tc, teaching_methods tm
                WHERE tc.course_id = :c AND tm.name = 'Case study'
            """), {"c": course_id(conn)})


# ------------------------------------------------------------------ triggers

def test_weakness_flag_follows_course_threshold(conn):
    cid = course_id(conn)
    perf_id = scalar(conn, """
        SELECT p.id FROM performance p JOIN assessments a ON a.id = p.assessment_id
        WHERE a.course_id = :c ORDER BY p.average_score DESC LIMIT 1
    """, c=cid)
    score = scalar(conn, "SELECT average_score FROM performance WHERE id = :p", p=perf_id)

    # Client lies about the flag; trigger re-derives it from the score
    conn.execute(text("UPDATE performance SET average_score = 10, weakness_flag = false WHERE id = :p"), {"p": perf_id})
    assert scalar(conn, "SELECT weakness_flag FROM performance WHERE id = :p", p=perf_id) is True

    conn.execute(text("UPDATE performance SET average_score = :s WHERE id = :p"), {"s": score, "p": perf_id})
    assert scalar(conn, "SELECT weakness_flag FROM performance WHERE id = :p", p=perf_id) is False

    # Raising the threshold above the score cascades to existing rows
    conn.execute(text("UPDATE teacher_constraints SET revision_threshold_score = :t WHERE course_id = :c"),
                 {"t": score + 1, "c": cid})
    assert scalar(conn, "SELECT weakness_flag FROM performance WHERE id = :p", p=perf_id) is True


def test_prerequisite_cycle_is_rejected(conn):
    # Seed chain: Functional Dependencies -> Attribute Closure -> Candidate Key -> ...
    fd = concept_id(conn, "Functional Dependencies & Armstrong's Axioms")
    closure = concept_id(conn, "Attribute Closure & Minimal Cover")
    assert scalar(conn, "SELECT count(*) FROM prerequisites WHERE concept_id = :c AND prerequisite_id = :p",
                  c=closure, p=fd) == 1

    with pytest.raises(DBAPIError, match="would create a cycle"):
        with conn.begin_nested():
            conn.execute(text("INSERT INTO prerequisites (concept_id, prerequisite_id) VALUES (:c, :p)"),
                         {"c": fd, "p": closure})


def test_prerequisite_must_stay_within_course(conn):
    teacher_id = scalar(conn, "SELECT id FROM teachers LIMIT 1")
    conn.execute(text("""
        INSERT INTO courses (id, teacher_id, code, title, semester, total_classes, period_duration)
        VALUES ('other-course', :t, 'CS999', 'Other', 'Fall 2026', 10, 50);
        INSERT INTO units (id, course_id, unit_number, title, order_index) VALUES ('other-unit', 'other-course', 1, 'U', 1);
        INSERT INTO topics (id, unit_id, title, order_index, estimated_minutes, allocated_minutes, status)
            VALUES ('other-topic', 'other-unit', 'T', 1, 50, 0, 'pending');
        INSERT INTO concepts (id, topic_id, name, difficulty, importance, concept_type, order_index)
            VALUES ('other-concept', 'other-topic', 'C', 3, 3, 'conceptual', 1);
    """), {"t": teacher_id})

    with pytest.raises(DBAPIError, match="different courses"):
        with conn.begin_nested():
            conn.execute(text("INSERT INTO prerequisites (concept_id, prerequisite_id) VALUES ('other-concept', :p)"),
                         {"p": concept_id(conn, "Attribute Closure & Minimal Cover")})


def test_audit_log_records_change_and_actor(conn):
    topic_id = scalar(conn, "SELECT id FROM topics WHERE status = 'pending' LIMIT 1")
    conn.execute(text("SELECT set_config('app.user_id', 'user-123', true)"))
    conn.execute(text("UPDATE topics SET status = 'in_progress' WHERE id = :t"), {"t": topic_id})

    row = conn.execute(text("""
        SELECT operation, changed_by, old_data ->> 'status' AS before, new_data ->> 'status' AS after
        FROM audit_log WHERE table_name = 'topics' AND row_id = :t
        ORDER BY id DESC LIMIT 1
    """), {"t": topic_id}).one()
    assert (row.operation, row.changed_by, row.before, row.after) == ("UPDATE", "user-123", "pending", "in_progress")


def test_audit_log_skips_noop_updates(conn):
    topic_id = scalar(conn, "SELECT id FROM topics LIMIT 1")
    before = scalar(conn, "SELECT count(*) FROM audit_log")
    conn.execute(text("UPDATE topics SET status = status WHERE id = :t"), {"t": topic_id})
    assert scalar(conn, "SELECT count(*) FROM audit_log") == before


def test_updated_at_is_maintained_by_trigger(conn):
    cid = course_id(conn)
    conn.execute(text("UPDATE courses SET updated_at = '2000-01-01' WHERE id = :c"), {"c": cid})
    assert scalar(conn, "SELECT updated_at > '2020-01-01' FROM courses WHERE id = :c", c=cid) is True


# ------------------------------------------------------------------ functions & procedure

def test_prerequisite_chain_is_transitive(conn):
    rows = conn.execute(text("SELECT * FROM fn_prerequisite_chain(:c)"),
                        {"c": concept_id(conn, "Third Normal Form (3NF) & Lossless Joins")}).all()
    names = {r.prerequisite_name for r in rows}
    assert "Attribute Closure & Minimal Cover" in names
    assert max(r.depth for r in rows) >= 2
    assert all(r.path.startswith("Third Normal Form (3NF) & Lossless Joins") for r in rows)


def test_time_pressure(conn):
    row = conn.execute(text("SELECT * FROM fn_time_pressure(:c)"), {"c": course_id(conn)}).one()
    assert row.remaining_topics > 0 and row.remaining_periods > 0
    assert row.pressure_status in {"healthy", "balanced", "high_pressure", "over_capacity"}


def test_record_performance_procedure_upserts(conn):
    cid = course_id(conn)
    assessment_id = scalar(conn, "SELECT id FROM assessments WHERE course_id = :c AND status = 'upcoming' LIMIT 1", c=cid)
    concept = concept_id(conn, "Third Normal Form (3NF) & Lossless Joins")

    call = text("CALL sp_record_concept_performance(:a, :c, :s, 50, 'err')")
    conn.execute(call, {"a": assessment_id, "c": concept, "s": 40.0})
    conn.execute(call, {"a": assessment_id, "c": concept, "s": 82.5})

    rows = conn.execute(text("SELECT average_score, weakness_flag FROM performance WHERE assessment_id = :a AND concept_id = :c"),
                        {"a": assessment_id, "c": concept}).all()
    assert [(r.average_score, r.weakness_flag) for r in rows] == [(82.5, False)]
    assert scalar(conn, "SELECT status FROM assessments WHERE id = :a", a=assessment_id) == "completed"

    with pytest.raises(DBAPIError, match="not found"):
        with conn.begin_nested():
            conn.execute(call, {"a": "missing", "c": concept, "s": 1.0})


# ------------------------------------------------------------------ views

def test_views_and_materialized_view(conn):
    cid = course_id(conn)
    progress = conn.execute(text("SELECT * FROM v_course_progress WHERE course_id = :c"), {"c": cid}).one()
    assert progress.total_topics == scalar(conn, "SELECT count(*) FROM topics t JOIN units u ON u.id = t.unit_id WHERE u.course_id = :c", c=cid)

    statuses = {r[0] for r in conn.execute(text("SELECT DISTINCT mastery_status FROM v_concept_mastery WHERE course_id = :c"), {"c": cid})}
    assert "not_assessed" in statuses and statuses & {"weak", "bottleneck"}

    assert scalar(conn, "SELECT count(*) FROM v_teaching_history WHERE course_id = :c", c=cid) > 0

    conn.execute(text("UPDATE topics SET status = 'completed' WHERE unit_id IN (SELECT id FROM units WHERE course_id = :c)"), {"c": cid})
    conn.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_course_dashboard"))
    dash = conn.execute(text("SELECT * FROM mv_course_dashboard WHERE course_id = :c"), {"c": cid}).one()
    assert dash.completed_topics == dash.total_topics
    assert dash.remaining_topics == 0


# ------------------------------------------------------------------ app integration

def test_record_results_service_uses_procedure_and_savepoints(conn):
    """
    The service's commit becomes a SAVEPOINT release inside the test transaction, so
    everything is still rolled back afterwards. An out-of-range score (bypassing API
    validation) hits the CHECK constraint; its savepoint rolls back alone.
    """
    from sqlalchemy.orm import Session
    from app.schemas.schemas import PerformanceRecordIn, RecordAssessmentResultsRequest
    from app.services.assessment_service import assessment_service

    cid = course_id(conn)
    assessment_id = scalar(conn, "SELECT id FROM assessments WHERE course_id = :c ORDER BY title LIMIT 1", c=cid)
    leaf = concept_id(conn, "B+ Tree Indexing Operations")
    other = concept_id(conn, "WAL Log-Based Recovery & Checkpoints")

    payload = RecordAssessmentResultsRequest.model_construct(performances=[
        PerformanceRecordIn(concept_id=leaf, average_score=30.0, sample_size=40),
        PerformanceRecordIn.model_construct(concept_id=other, average_score=150.0, sample_size=40, common_errors=None),
    ])
    with Session(bind=conn, join_transaction_mode="create_savepoint") as session:
        result = assessment_service.record_results(session, assessment_id, payload)

    assert result["status"] == "partial"
    assert result["updated_concepts"] == ["B+ Tree Indexing Operations"]
    assert result["skipped"][0]["concept_id"] == other
    assert "check_average_score_range" in result["skipped"][0]["reason"]

    # Weakness flag was set by the trigger, not the application
    assert scalar(conn, "SELECT weakness_flag FROM performance WHERE assessment_id = :a AND concept_id = :c",
                  a=assessment_id, c=leaf) is True
    assert scalar(conn, "SELECT count(*) FROM performance WHERE assessment_id = :a AND concept_id = :c",
                  a=assessment_id, c=other) == 0
    # Audit trail captured the procedure's write
    assert scalar(conn, "SELECT count(*) FROM audit_log WHERE table_name = 'performance' AND new_data ->> 'concept_id' = :c",
                  c=leaf) >= 1


def test_every_demo_query_runs_on_postgres(conn):
    from sqlalchemy.orm import Session
    from app.services.dbms_insights_service import DEMO_QUERIES, dbms_insights_service

    cid = course_id(conn)
    with Session(bind=conn, join_transaction_mode="create_savepoint") as session:
        results = {q["id"]: dbms_insights_service.execute_demo_query(session, q["id"], cid) for q in DEMO_QUERIES}

    assert results["q11_curriculum_depth_recursive"].rows[0]["curriculum_depth"] >= 5
    assert results["q14_fully_assessed_topics_division"].row_count >= 1
    assert results["q18_course_dashboard_matview"].rows[0]["bottleneck_concepts"] == 2
    mastery = {r["concept_name"]: r["mastery_status"] for r in results["q16_concept_mastery_view"].rows}
    assert mastery["Attribute Closure & Minimal Cover"] == "bottleneck"
