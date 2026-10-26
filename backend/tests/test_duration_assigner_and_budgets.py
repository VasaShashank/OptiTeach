from unittest.mock import MagicMock
from app.optimization.duration_assigner import duration_assigner
from app.optimization.time_allocator import time_allocator
from app.schemas.schemas import ConceptDraft, TopicDraft

def test_concept_raw_demand_by_type_and_difficulty():
    # Problem solving / high difficulty should demand more time than basic conceptual
    c_easy_conceptual = ConceptDraft(
        name="Intro Definitions",
        difficulty=1,
        importance=3,
        concept_type="conceptual",
        bloom_level="Remember",
        prerequisites=[]
    )
    c_hard_problem = ConceptDraft(
        name="Relational Joins & Division",
        difficulty=5,
        importance=5,
        concept_type="problem_solving",
        bloom_level="Apply",
        prerequisites=[]
    )

    easy_demand = duration_assigner.calculate_concept_raw_demand(c_easy_conceptual)
    hard_demand = duration_assigner.calculate_concept_raw_demand(c_hard_problem)

    assert hard_demand > easy_demand * 1.5, f"Hard problem solving ({hard_demand}) should significantly exceed easy conceptual ({easy_demand})"

def test_topic_realistic_duration_assignment():
    # Unit with 2 topics: one simple intro, one heavy normalization
    t_simple = TopicDraft(
        title="Database System Architecture",
        description="Intro to architecture",
        concepts=[
            ConceptDraft(name="3-Schema Architecture", difficulty=2, importance=3, concept_type="conceptual", bloom_level="Understand", prerequisites=[]),
            ConceptDraft(name="Data Independence", difficulty=2, importance=3, concept_type="conceptual", bloom_level="Understand", prerequisites=[]),
        ]
    )
    t_heavy = TopicDraft(
        title="Relational Normalization and Decomposition",
        description="Core design theory",
        concepts=[
            ConceptDraft(name="Functional Dependencies", difficulty=4, importance=5, concept_type="analytical", bloom_level="Analyze", prerequisites=[]),
            ConceptDraft(name="Candidate Key Determination", difficulty=4, importance=5, concept_type="problem_solving", bloom_level="Apply", prerequisites=[]),
            ConceptDraft(name="BCNF Decomposition Algorithm", difficulty=5, importance=5, concept_type="problem_solving", bloom_level="Analyze", prerequisites=[]),
        ]
    )

    all_topics = [t_simple, t_heavy]
    # Unit hours = 9 (540 minutes total)
    simple_mins = duration_assigner.calculate_topic_estimated_minutes(t_simple, period_duration=60, unit_hours=9, all_topics_in_unit=all_topics)
    heavy_mins = duration_assigner.calculate_topic_estimated_minutes(t_heavy, period_duration=60, unit_hours=9, all_topics_in_unit=all_topics)

    assert heavy_mins > simple_mins
    assert heavy_mins >= 240, f"Heavy normalization should receive at least 4 periods (240m), got {heavy_mins}"
    # Verify neither is hardcoded to 120
    assert not (simple_mins == 120 and heavy_mins == 120)

def test_period_phase_division_difficulty_and_type_adaptive():
    t_practical = MagicMock()
    t_practical.title = "Complex SQL Joins and Aggregations"
    c1 = MagicMock()
    c1.name = "SQL Joins"
    c1.difficulty = 4
    c1.concept_type = "practical"
    t_practical.concepts = [c1]

    phases_no_rev = duration_assigner.compute_period_phase_division(
        period_duration=60,
        topic=t_practical,
        needs_revision=False,
    )

    # Invariant: sum of minutes == period_duration
    assert sum(p.duration_minutes for p in phases_no_rev) == 60
    assert all(p.duration_minutes % 5 == 0 for p in phases_no_rev)
    
    # Practical / high difficulty topic should have more active worked examples + practice than pure lecture
    explain_phase = next(p for p in phases_no_rev if p.phase_name == "Explain")
    worked_phase = next(p for p in phases_no_rev if p.phase_name == "Worked examples")
    practice_phase = next(p for p in phases_no_rev if p.phase_name == "Guided practice")

    assert (worked_phase.duration_minutes + practice_phase.duration_minutes) > explain_phase.duration_minutes

def test_period_phase_division_with_revision_and_custom_timer():
    t_mock = MagicMock()
    t_mock.title = "Relational Algebra Operators"
    t_mock.concepts = [MagicMock(name="Selection & Projection", difficulty=3, concept_type="problem_solving")]

    # Severe prerequisite weakness (<50%) gets 15 min revision
    phases_severe = duration_assigner.compute_period_phase_division(
        period_duration=60,
        topic=t_mock,
        needs_revision=True,
        rev_concept="ER Mapping",
        prereq_score=42.0,
    )
    rev_phase = next(p for p in phases_severe if p.phase_name == "Revision")
    assert rev_phase.duration_minutes == 15
    assert sum(p.duration_minutes for p in phases_severe) == 60

    # Custom teacher revision override (e.g. 20 minutes)
    phases_custom = duration_assigner.compute_period_phase_division(
        period_duration=60,
        topic=t_mock,
        needs_revision=True,
        rev_concept="ER Mapping",
        custom_revision_minutes=20,
    )
    rev_custom = next(p for p in phases_custom if p.phase_name == "Revision")
    assert rev_custom.duration_minutes == 20
    assert sum(p.duration_minutes for p in phases_custom) == 60

def test_controllable_time_allocator_percentages():
    db = MagicMock()
    course = MagicMock()
    course.id = "c-101"
    course.total_classes = 45
    course.period_duration = 60
    course.total_available_minutes = 2700
    db.query.return_value.filter.return_value.first.return_value = course

    # Custom percentages: 15% revision, 12% assessment
    resp = time_allocator.optimize_course_time(
        db,
        course_id="c-101",
        persist=False,
        revision_percent=15.0,
        assessment_percent=12.0
    )

    # 2700 * 0.15 = 405 -> discrete 60m periods = 360m (6 periods)
    assert resp.revision_budget_minutes == 360
    # 2700 * 0.12 = 324 -> discrete 60m periods = 300m (5 periods)
    assert resp.assessment_budget_minutes == 300
    assert resp.formula_explanation["revision_percent"] == 15.0
    assert resp.formula_explanation["assessment_percent"] == 12.0
    assert resp.formula_explanation["teacher_controllable"] is True
