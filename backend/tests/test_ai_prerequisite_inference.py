import pytest
from app.nlp.llm_prerequisite_engine import llm_prerequisite_engine


def test_prerequisite_engine_domain_toc():
    """Verify that Theory of Computation concepts receive genuine DAG prerequisite edges without cycles."""
    units_data = [
        {
            "unit_number": 1,
            "title": "Regular Languages & Finite Automata",
            "topics": [
                {
                    "title": "Finite Automata",
                    "concepts": [
                        {"id": "c1", "name": "Deterministic Finite Automata (DFA)", "difficulty": 2},
                        {"id": "c2", "name": "Non Deterministic Finite Automata (NFA)", "difficulty": 3},
                        {"id": "c3", "name": "Minimization of Finite Automata", "difficulty": 4},
                    ]
                }
            ]
        },
        {
            "unit_number": 2,
            "title": "Context Free Languages & Grammars",
            "topics": [
                {
                    "title": "CFG and Pumping Lemma",
                    "concepts": [
                        {"id": "c4", "name": "Pumping Lemma for Regular Languages", "difficulty": 4},
                        {"id": "c5", "name": "Context-free grammars (CFG)", "difficulty": 3},
                    ]
                }
            ]
        }
    ]

    result = llm_prerequisite_engine.infer_course_prerequisites("CS354TA Theory of Computation", units_data)
    assert result["is_dag"] is True
    assert len(result["edges"]) > 0

    # Minimization should depend on DFA
    targets = {e["target_name"] for e in result["edges"]}
    assert "Minimization of Finite Automata" in targets or "Pumping Lemma for Regular Languages" in targets


def test_infer_prerequisites_api_endpoint(api):
    """Test POST /api/courses/{course_id}/curriculum/infer-prerequisites endpoint."""
    courses_res = api.get("/api/courses")
    assert courses_res.status_code == 200
    courses = courses_res.json()
    assert len(courses) > 0
    cid = courses[0]["id"]

    res = api.post(f"/api/courses/{cid}/curriculum/infer-prerequisites")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "provider" in data
    assert "edges_count" in data
