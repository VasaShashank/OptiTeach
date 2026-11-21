import networkx as nx
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from app.models.entities import Topic, Concept, Performance

# Calibrated weights for realistic OBE (Outcome-Based Education) priority scoring
DEFAULT_WEIGHTS = {
    "importance": 0.22,
    "difficulty": 0.18,
    "prerequisite_downstream": 0.22,
    "assessment_relevance": 0.14,
    "weakness_penalty": 0.14,
    "bloom_depth": 0.10
}

BLOOM_LEVEL_RANKS: Dict[str, int] = {
    "remember": 1,
    "understand": 2,
    "apply": 3,
    "analyze": 4,
    "evaluate": 5,
    "create": 6
}

class ScoringEngine:
    """
    Transparent, explainable mathematical scoring engine for Autonomous OBE curriculum.
    Calculates priority scores for topics and concepts based on:
    1. Prerequisite bottleneck graph degree (cascading dependency risk)
    2. Cohort test performance deficits on concepts & upstream prerequisites
    3. Bloom's Taxonomy cognitive complexity (L1 Remember to L6 Create)
    4. Course Outcome (CO) mapping & exam marks weightage
    5. Difficulty rating (1 to 5)
    """

    def __init__(self, weights: Dict[str, float] = None):
        self.weights = weights or DEFAULT_WEIGHTS

    def build_concept_dag(self, db: Session, course_id: str) -> nx.DiGraph:
        """Construct directed acyclic graph of concepts for downstream impact calculation"""
        dag = nx.DiGraph()
        
        concepts = (
            db.query(Concept)
            .join(Topic, Concept.topic_id == Topic.id)
            .join(Topic.unit)
            .filter(Topic.unit.has(course_id=course_id))
            .all()
        )
        
        for c in concepts:
            dag.add_node(c.id, name=c.name, topic_id=c.topic_id, difficulty=c.difficulty, importance=c.importance)
            for prereq in c.prerequisites:
                # Directed edge: prerequisite -> dependent concept
                dag.add_edge(prereq.id, c.id)

        return dag

    def calculate_topic_scores(self, db: Session, course_id: str) -> List[Dict[str, Any]]:
        dag = self.build_concept_dag(db, course_id)
        
        topics = (
            db.query(Topic)
            .join(Topic.unit)
            .filter(Topic.unit.has(course_id=course_id))
            .order_by(Topic.unit_id, Topic.order_index)
            .all()
        )

        results = []
        for topic in topics:
            concept_scores = []
            reason_codes = set()
            key_concept_names = []
            
            for c in topic.concepts:
                key_concept_names.append(c.name)
                # 1. Downstream dependent count (bottleneck factor in DAG)
                downstream_count = len(nx.descendants(dag, c.id)) if c.id in dag else 0
                if downstream_count >= 2:
                    reason_codes.add(f"PREREQUISITE_FOR_{downstream_count}_CONCEPTS")

                # 2. Historical & Cohort performance on this concept
                performances = db.query(Performance).filter(Performance.concept_id == c.id).all()
                avg_score = 75.0  # default baseline
                weakness_factor = 0.0
                if performances:
                    scores = [p.average_score for p in performances]
                    avg_score = sum(scores) / len(scores)
                    if avg_score < 60.0:
                        weakness_factor = (60.0 - avg_score) / 60.0  # 0.0 to 1.0
                        reason_codes.add("WEAK_RECENT_PERFORMANCE")

                # 3. Prerequisite Deficit Analysis: check if upstream prerequisites had weak scores
                prereq_weakness = 0.0
                for prereq in c.prerequisites:
                    prereq_perfs = db.query(Performance).filter(Performance.concept_id == prereq.id).all()
                    if prereq_perfs:
                        p_avg = sum(p.average_score for p in prereq_perfs) / len(prereq_perfs)
                        if p_avg < 60.0:
                            prereq_weakness = max(prereq_weakness, (60.0 - p_avg) / 60.0)
                            reason_codes.add("PREREQUISITE_GAP_REQUIRING_REVISION")

                # Combine direct weakness and prerequisite gap
                combined_weakness = max(weakness_factor, prereq_weakness * 0.85)

                # 4. Bloom's Taxonomy cognitive complexity
                bloom_str = "understand"
                if hasattr(c, "outcomes") and c.outcomes:
                    bloom_str = c.outcomes[0].bloom_level.lower()
                elif hasattr(c, "bloom_level") and c.bloom_level:
                    bloom_str = str(c.bloom_level).lower()
                bloom_rank = BLOOM_LEVEL_RANKS.get(bloom_str, 2)
                norm_bloom = bloom_rank / 6.0
                if bloom_rank >= 4:
                    reason_codes.add(f"HIGH_BLOOM_LEVEL_{bloom_str.upper()}")

                # 5. Assessment relevance
                assess_relevance = 0.5
                if c.questions:
                    assess_relevance = min(1.0, 0.4 + (len(c.questions) * 0.2))
                    reason_codes.add("HIGH_ASSESSMENT_RELEVANCE")

                if c.difficulty >= 4:
                    reason_codes.add("HIGH_CONCEPTUAL_DIFFICULTY")

                # Normalized component factors (0 to 1)
                norm_imp = c.importance / 5.0
                norm_diff = c.difficulty / 5.0
                norm_down = min(1.0, downstream_count / 4.0)
                norm_assess = assess_relevance
                norm_weak = combined_weakness

                score = (
                    self.weights["importance"] * norm_imp +
                    self.weights["difficulty"] * norm_diff +
                    self.weights["prerequisite_downstream"] * norm_down +
                    self.weights["assessment_relevance"] * norm_assess +
                    self.weights["weakness_penalty"] * norm_weak +
                    self.weights.get("bloom_depth", 0.10) * norm_bloom
                )
                concept_scores.append(score)

            topic_priority = sum(concept_scores) / len(concept_scores) if concept_scores else 0.5
            
            # Generate human-readable explanation
            reasons_list = list(reason_codes)
            explanation_parts = []
            if "WEAK_RECENT_PERFORMANCE" in reasons_list:
                explanation_parts.append("students scored low on it in recent tests (<60%)")
            if "PREREQUISITE_GAP_REQUIRING_REVISION" in reasons_list:
                explanation_parts.append("prerequisite topics had low cohort mastery needing scaffolding")
            if any("PREREQUISITE_FOR" in r for r in reasons_list):
                explanation_parts.append("it is a critical prerequisite for downstream units")
            if any("HIGH_BLOOM_LEVEL" in r for r in reasons_list):
                explanation_parts.append("it requires higher-order Bloom cognitive skills (Apply/Analyze)")
            if "HIGH_ASSESSMENT_RELEVANCE" in reasons_list:
                explanation_parts.append("it carries high CIE/SEE exam weightage")
            if "HIGH_CONCEPTUAL_DIFFICULTY" in reasons_list:
                explanation_parts.append("it is conceptually complex and needs worked derivations")

            if explanation_parts:
                reasons_text = ", ".join(explanation_parts[:-1]) + (" and " if len(explanation_parts) > 1 else "") + explanation_parts[-1]
                explanation_text = f"Weighted up because {reasons_text}."
            else:
                explanation_text = "Standard foundational weighting."

            results.append({
                "topic": topic,
                "priority_score": round(topic_priority, 3),
                "reason_codes": reasons_list,
                "explanation": explanation_text,
                "key_concepts": key_concept_names
            })

        return results

scoring_engine = ScoringEngine()
