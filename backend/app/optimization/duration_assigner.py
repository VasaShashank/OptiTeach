"""
Pedagogical duration assigner engine.
Calculates realistic instructional time requirements for topics (overall)
and realistic pedagogical phase breakdowns within a single class period.

Factors incorporated:
- Conceptual vs procedural vs analytical vs practical vs problem-solving concept types
- Difficulty rating (1 to 5)
- Bloom's Taxonomy cognitive depth (Remember -> Create)
- Prerequisite downstream bottleneck count (DAG depth)
- Historical student weakness / assessment score deficits
- Teacher constraints and customizable revision/assessment parameters
"""
from typing import Any, Dict, List, Optional
from app.schemas.schemas import PeriodPhase

# Baseline minutes required to teach a concept by concept_type
CONCEPT_TYPE_BASE_MINUTES: Dict[str, int] = {
    "conceptual": 30,
    "procedural": 40,
    "analytical": 50,
    "practical": 50,
    "problem_solving": 55,
    "revision": 25,
}

# Bloom Taxonomy multiplier: higher-order cognitive processing requires more instructional time
BLOOM_MULTIPLIERS: Dict[str, float] = {
    "remember": 0.85,
    "understand": 1.00,
    "apply": 1.15,
    "analyze": 1.30,
    "evaluate": 1.40,
    "create": 1.50,
}

class PedagogicalDurationAssigner:
    """
    Computes realistic durations for:
    1. Overall topics (estimated_minutes) based on constituent concepts and curriculum parameters.
    2. Within-period phase divisions (PeriodPhase breakdown) adhering to teacher constraints.
    """

    def calculate_concept_raw_demand(self, concept: Any) -> float:
        """
        Calculates raw required pedagogical minutes for a single concept.
        Works with both SQLAlchemy Concept entity and Pydantic ConceptDraft.
        """
        c_type = getattr(concept, "concept_type", "conceptual") or "conceptual"
        base_min = CONCEPT_TYPE_BASE_MINUTES.get(c_type.lower(), 35)

        # Difficulty multiplier (scale 1 to 5 -> 0.75 to 1.45)
        diff = getattr(concept, "difficulty", 3) or 3
        diff = max(1, min(5, diff))
        diff_mult = 0.70 + (0.15 * diff)

        # Bloom taxonomy multiplier
        bloom = getattr(concept, "bloom_level", "Understand") or "Understand"
        bloom_mult = BLOOM_MULTIPLIERS.get(str(bloom).lower(), 1.0)

        # Importance multiplier (scale 1 to 5 -> 0.85 to 1.15)
        imp = getattr(concept, "importance", 3) or 3
        imp = max(1, min(5, imp))
        imp_mult = 0.85 + (0.06 * imp)

        return base_min * diff_mult * bloom_mult * imp_mult

    def calculate_topic_estimated_minutes(
        self,
        topic: Any,
        period_duration: int = 60,
        unit_hours: Optional[int] = None,
        all_topics_in_unit: Optional[List[Any]] = None,
    ) -> int:
        """
        Determines realistic estimated_minutes for a topic.
        If unit_hours and all_topics_in_unit are provided, distributes the unit's
        available minutes proportionally according to each topic's pedagogical demand.
        Otherwise, aggregates concept demand and snaps to clean period or half-period blocks.
        """
        concepts = getattr(topic, "concepts", []) or []

        # If no concepts are present, infer from title keywords
        if not concepts:
            raw_demand = self._infer_topic_raw_demand_from_title(getattr(topic, "title", ""), period_duration)
        else:
            raw_demand = sum(self.calculate_concept_raw_demand(c) for c in concepts)

        if unit_hours and unit_hours > 0 and all_topics_in_unit and len(all_topics_in_unit) > 1:
            total_unit_min = unit_hours * 60
            unit_demands = []
            for t in all_topics_in_unit:
                t_concepts = getattr(t, "concepts", []) or []
                if t_concepts:
                    d = sum(self.calculate_concept_raw_demand(c) for c in t_concepts)
                else:
                    d = self._infer_topic_raw_demand_from_title(getattr(t, "title", ""), period_duration)
                unit_demands.append(max(20.0, d))

            total_demand = sum(unit_demands)
            curr_idx = all_topics_in_unit.index(topic) if topic in all_topics_in_unit else 0
            ratio = unit_demands[curr_idx] / total_demand if total_demand > 0 else (1.0 / len(all_topics_in_unit))
            calculated = total_unit_min * ratio

            # Snap strictly to full period multiples (e.g. 60m, 120m, 180m, 240m)
            # avoiding fractional period mismatches with classroom scheduling
            snap_step = period_duration
            max_topic_minutes = 5 * period_duration
            snapped = max(period_duration, min(max_topic_minutes, int(round(calculated / snap_step) * snap_step)))
            return snapped

        # Standalone snapping: minimum 1 period, maximum 5 periods, quantized to full period multiples
        snap_step = period_duration
        max_topic_minutes = 5 * period_duration
        snapped = max(period_duration, min(max_topic_minutes, int(round(raw_demand / snap_step) * snap_step)))
        return snapped

    def _infer_topic_raw_demand_from_title(self, title: str, period_duration: int) -> float:
        """Heuristic demand inference when concepts have not yet been extracted."""
        t_low = title.lower()
        if any(w in t_low for w in ["normalization", "bcnf", "3nf", "concurrency", "recovery", "algebra", "optimization"]):
            return period_duration * 4.0  # 4 periods (240m) for complex topics
        if any(w in t_low for w in ["sql", "queries", "transactions", "er model", "indexing", "b-tree"]):
            return period_duration * 3.0  # 3 periods (180m) for moderate topics
        if any(w in t_low for w in ["architecture", "introduction", "basics", "file", "overview"]):
            return period_duration * 1.0  # 1 period (60m) for introductory topics
        return period_duration * 2.0  # default 2 periods (120m)

    def compute_period_phase_division(
        self,
        period_duration: int,
        topic: Any,
        needs_revision: bool = False,
        rev_concept: Optional[str] = None,
        prereq_score: Optional[float] = None,
        custom_revision_minutes: Optional[int] = None,
        max_lecture_ratio: float = 0.45,
        min_practice_ratio: float = 0.35,
        recommended_methods: Optional[List[str]] = None,
    ) -> List[PeriodPhase]:
        """
        Computes realistic, difficulty-aware phase breakdown for one class period.
        Strict invariant: sum(phase.duration_minutes) == period_duration.
        Every phase duration is an integer multiple of 5 minutes.
        """
        methods = recommended_methods or ["Lecture with diagrams", "Worked examples"]
        method_a = methods[0] if len(methods) > 0 else "Lecture with diagrams"
        method_b = methods[1] if len(methods) > 1 else "Worked examples"

        topic_title = getattr(topic, "title", "Topic")
        concepts = getattr(topic, "concepts", []) or []

        # Analyze topic pedagogical profile
        if concepts:
            difficulties = [getattr(c, "difficulty", 3) or 3 for c in concepts]
            avg_difficulty = sum(difficulties) / len(difficulties)
            types = [getattr(c, "concept_type", "conceptual") or "conceptual" for c in concepts]
            primary_type = types[0]
            first_concept_name = str(getattr(concepts[0], "name", topic_title))
        else:
            avg_difficulty = 3.0
            primary_type = "conceptual"
            first_concept_name = str(topic_title)

        # Step 1: Calculate Revision / Recap duration
        if custom_revision_minutes is not None and custom_revision_minutes >= 0:
            # Teacher explicitly specified revision duration
            max_rev = max(5, period_duration - 25)
            rev_min = int(round(custom_revision_minutes / 5.0) * 5)
            rev_min = max(0, min(max_rev, rev_min))
            has_rev = rev_min > 0
        elif needs_revision:
            has_rev = True
            # Adjust revision intensity based on how severe the weakness score is
            if prereq_score is not None and prereq_score < 50.0:
                rev_min = 15  # severe weakness requires diagnostic recap + misconception unlearning
            else:
                rev_min = 10  # standard targeted revision
        else:
            has_rev = False
            rev_min = 5 if period_duration <= 60 else 10  # brief link to previous session

        # Step 2: Determine remaining instructional minutes
        avail_for_topic = period_duration - rev_min

        # Step 3: Determine weights for Explain, Worked Examples, Practice, and Check
        # High difficulty, problem-solving, or practical topics demand hands-on practice over lecturing
        if primary_type in ("problem_solving", "practical") or avg_difficulty >= 4.0:
            # Keep lecture concise to satisfy max_lecture_ratio
            explain_pct = 0.25
            worked_pct = 0.40
            practice_pct = 0.25
            check_pct = 0.10
            explain_method = "Visual problem modeling" if "diagram" not in method_a.lower() else method_a
            worked_method = "Step-by-step problem deconstruction"
            practice_method = "Hands-on student exercises"
        elif primary_type == "analytical":
            explain_pct = 0.32
            worked_pct = 0.35
            practice_pct = 0.23
            check_pct = 0.10
            explain_method = method_a
            worked_method = "Proof and decomposition walk-through"
            practice_method = "Pair analysis and edge cases"
        else:
            # Conceptual / theoretical foundational topic
            explain_pct = 0.40
            worked_pct = 0.25
            practice_pct = 0.25
            check_pct = 0.10
            explain_method = method_a
            worked_method = method_b
            practice_method = "Concept mapping & student questions"

        # Apply teacher constraints on lecture ratio
        if explain_pct > max_lecture_ratio:
            slack = explain_pct - max_lecture_ratio
            explain_pct = max_lecture_ratio
            practice_pct += slack

        # Raw minutes quantized to 5-min steps
        def snap_5(m: float) -> int:
            return max(5, int(round(m / 5.0) * 5))

        e_min = snap_5(avail_for_topic * explain_pct)
        w_min = snap_5(avail_for_topic * worked_pct)
        p_min = snap_5(avail_for_topic * practice_pct)
        c_min = snap_5(avail_for_topic * check_pct)

        # Balance to exactly match avail_for_topic
        current_sum = e_min + w_min + p_min + c_min
        diff = avail_for_topic - current_sum

        # Adjust the difference on worked examples or practice in 5-min increments
        while diff != 0:
            step = 5 if diff > 0 else -5
            if diff > 0:
                if primary_type in ("problem_solving", "practical", "analytical"):
                    w_min += step
                else:
                    p_min += step
            else:
                if w_min > 10:
                    w_min += step
                elif p_min > 10:
                    p_min += step
                elif e_min > 10:
                    e_min += step
                else:
                    c_min += step
            diff -= step

        # Step 4: Construct PeriodPhase list
        phases: List[PeriodPhase] = []

        if rev_min > 0:
            if has_rev and rev_concept:
                phases.append(PeriodPhase(
                    phase_name="Revision",
                    duration_minutes=rev_min,
                    method_name="Recap and revision",
                    activity_description=f"Targeted review of {rev_concept}; address common misconceptions before moving forward.",
                    concept_ref=rev_concept
                ))
            else:
                phases.append(PeriodPhase(
                    phase_name="Recap",
                    duration_minutes=rev_min,
                    method_name="Recap and revision",
                    activity_description="Quick 5-minute retrieval check connecting today's class to earlier concepts.",
                    concept_ref=topic_title
                ))

        phases.append(PeriodPhase(
            phase_name="Explain",
            duration_minutes=e_min,
            method_name=explain_method,
            activity_description=f"Interactive explanation of core principles for {first_concept_name}.",
            concept_ref=first_concept_name
        ))

        phases.append(PeriodPhase(
            phase_name="Worked examples",
            duration_minutes=w_min,
            method_name=worked_method,
            activity_description=f"Live walk-through of realistic problems and edge cases on {topic_title}.",
            concept_ref=topic_title
        ))

        phases.append(PeriodPhase(
            phase_name="Guided practice",
            duration_minutes=p_min,
            method_name=practice_method,
            activity_description="Students solve practice exercises individually or in pairs with instructor circulation.",
            concept_ref=topic_title
        ))

        if c_min > 0:
            phases.append(PeriodPhase(
                phase_name="Quick check",
                duration_minutes=c_min,
                method_name="Formative assessment",
                activity_description="Short 3-question pulse check or exit ticket to verify student comprehension.",
                concept_ref=topic_title
            ))

        # Strict invariant verification
        total_phases = sum(p.duration_minutes for p in phases)
        if total_phases != period_duration:
            # Fix any remaining drift on the largest active phase
            drift = period_duration - total_phases
            phases[2].duration_minutes += drift

        assert sum(p.duration_minutes for p in phases) == period_duration, (
            f"Phase breakdown sum {sum(p.duration_minutes for p in phases)} != period duration {period_duration}"
        )

        return phases

duration_assigner = PedagogicalDurationAssigner()
