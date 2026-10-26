from typing import Optional
from sqlalchemy.orm import Session
from app.models.entities import Course, Topic
from app.database.connection import refresh_dashboard_snapshot
from app.optimization.scoring import scoring_engine
from app.optimization.duration_assigner import duration_assigner
from app.schemas.schemas import CourseOptimizationResponse, TopicAllocationOut

class TimeAllocator:
    """
    Constrained optimization engine for finite teaching time.
    Strictly satisfies:
    Total Instructional Time + Revision Budget + Assessment Budget <= Available Teaching Time
    """

    def optimize_course_time(
        self,
        db: Session,
        course_id: str,
        persist: bool = True,
        revision_percent: Optional[float] = None,
        assessment_percent: Optional[float] = None,
    ) -> CourseOptimizationResponse:
        """
        persist=True writes the new allocation. The course row is locked FOR UPDATE first,
        so two concurrent re-optimizations of one course run one after the other instead
        of interleaving their topic updates. persist=False (GET) computes without writing.
        """
        query = db.query(Course).filter(Course.id == course_id)
        if persist:
            query = query.with_for_update()
        course = query.first()
        if not course:
            raise ValueError(f"Course {course_id} not found")

        total_avail_min = course.total_available_minutes
        period_duration = course.period_duration

        # Teacher-controllable reservation for revision and assessment checkpoints
        # Default: 10% revision buffer, 8% formal assessments (e.g., midterms/quizzes)
        rev_pct = revision_percent if revision_percent is not None else 10.0
        ass_pct = assessment_percent if assessment_percent is not None else 8.0
        if rev_pct > 1.0:
            rev_pct = rev_pct / 100.0
        if ass_pct > 1.0:
            ass_pct = ass_pct / 100.0
        rev_pct = max(0.0, min(0.35, rev_pct))
        ass_pct = max(0.0, min(0.30, ass_pct))

        revision_budget = int(total_avail_min * rev_pct)
        assessment_budget = int(total_avail_min * ass_pct)
        
        # Round revision and assessment budgets to discrete periods
        revision_budget = (revision_budget // period_duration) * period_duration
        assessment_budget = (assessment_budget // period_duration) * period_duration
        
        instructional_budget = total_avail_min - revision_budget - assessment_budget

        # Calculate topic priority scores
        topic_scores = scoring_engine.calculate_topic_scores(db, course_id)
        if not topic_scores:
            return CourseOptimizationResponse(
                course_id=course_id,
                total_available_minutes=total_avail_min,
                total_allocated_minutes=0,
                revision_budget_minutes=revision_budget,
                assessment_budget_minutes=assessment_budget,
                unallocated_buffer_minutes=total_avail_min,
                time_pressure_status="healthy",
                topic_allocations=[],
                formula_explanation={
                    "revision_percent": round(rev_pct * 100, 1),
                    "assessment_percent": round(ass_pct * 100, 1),
                    "teacher_controllable": True,
                }
            )

        # Apply realistic duration assigner if topic estimated_minutes are flat defaults or <= 0
        for item in topic_scores:
            t_obj: Topic = item["topic"]
            if t_obj.concepts and (t_obj.estimated_minutes == 120 or t_obj.estimated_minutes <= 0):
                unit_topics = t_obj.unit.topics if t_obj.unit else None
                unit_hrs = getattr(t_obj.unit, "hours", None) if t_obj.unit else None
                t_obj.estimated_minutes = duration_assigner.calculate_topic_estimated_minutes(
                    t_obj, period_duration=period_duration, unit_hours=unit_hrs, all_topics_in_unit=unit_topics
                )

        from app.optimization.ilp_solver import ilp_solver

        allocated_allocations = []
        allocated_sum = 0
        solver_used = "greedy period-by-period sharing (used when the exact solver is unavailable)"

        # 1. Attempt exact MILP formulation with SciPy
        milp_periods = ilp_solver.solve_period_allocation(topic_scores, instructional_budget, period_duration)

        if milp_periods is not None and len(milp_periods) == len(topic_scores):
            solver_used = "exact integer optimisation (SciPy MILP)"
            for idx, item in enumerate(topic_scores):
                topic: Topic = item["topic"]
                periods_count = milp_periods[idx]
                snapped_minutes = periods_count * period_duration
                allocated_allocations.append({
                    "topic": topic,
                    "allocated_minutes": snapped_minutes,
                    "periods_count": periods_count,
                    "priority_score": item["priority_score"],
                    "reason_codes": item["reason_codes"],
                    "explanation": item["explanation"],
                    "key_concepts": item["key_concepts"]
                })
                allocated_sum += snapped_minutes
        else:
            # 2. Discrete greedy fallback:
            # Guarantee: no topic exceeds its suggested time while other topics are in deficit.
            n_topics = len(topic_scores)
            max_p = instructional_budget // period_duration
            need_p = [max(1, round(t["topic"].estimated_minutes / period_duration)) for t in topic_scores]
            total_need_p = sum(need_p)

            # Fair proportional sharing: allocate periods to minimize relative deficit squared
            periods = [min(1, nd) for nd in need_p]
            remaining = max_p - sum(periods)

            # Phase 1: Allocate up to need_p[i] to topics that have deficit
            while remaining > 0 and sum(periods) < total_need_p:
                best_idx = None
                best_gain = -1e9
                for i in range(n_topics):
                    if periods[i] < need_p[i]:
                        d_curr = (need_p[i] - periods[i]) / need_p[i]
                        d_next = (need_p[i] - periods[i] - 1) / need_p[i]
                        gain = float(topic_scores[i]["priority_score"]) * (d_curr**2 - d_next**2)
                        if gain > best_gain:
                            best_gain = gain
                            best_idx = i
                if best_idx is None:
                    break
                periods[best_idx] += 1
                remaining -= 1

            # Phase 2: Only if ALL topics met their need (surplus), give remaining to top priority
            if remaining > 0 and sum(periods) >= total_need_p:
                sorted_indices = sorted(
                    range(n_topics),
                    key=lambda i: topic_scores[i]["priority_score"],
                    reverse=True
                )
                for i in sorted_indices:
                    if remaining <= 0:
                        break
                    periods[i] += 1
                    remaining -= 1

            for idx, item in enumerate(topic_scores):
                topic: Topic = item["topic"]
                periods_count = periods[idx]
                snapped_minutes = periods_count * period_duration
                allocated_allocations.append({
                    "topic": topic,
                    "allocated_minutes": snapped_minutes,
                    "periods_count": periods_count,
                    "priority_score": item["priority_score"],
                    "reason_codes": item["reason_codes"],
                    "explanation": item["explanation"],
                    "key_concepts": item["key_concepts"]
                })
                allocated_sum += snapped_minutes

        # Save allocated minutes and priority scores back to PostgreSQL in transaction
        if persist:
            for item in allocated_allocations:
                t = item["topic"]
                t.allocated_minutes = item["allocated_minutes"]
                t.priority_score = item["priority_score"]
            db.commit()
            refresh_dashboard_snapshot(db)
        else:
            db.rollback()  # release the read snapshot; nothing was written

        unallocated_buffer = total_avail_min - (allocated_sum + revision_budget + assessment_budget)

        # Time pressure status
        total_used = allocated_sum + revision_budget + assessment_budget
        if total_used > total_avail_min:
            pressure = "high_pressure"
        elif total_used >= 0.95 * total_avail_min:
            pressure = "balanced"
        else:
            pressure = "healthy"

        # Format output
        output_topics = []
        for a in allocated_allocations:
            t = a["topic"]
            output_topics.append(TopicAllocationOut(
                topic_id=t.id,
                unit_number=t.unit.unit_number if t.unit else 1,
                topic_title=t.title,
                estimated_minutes=t.estimated_minutes,
                allocated_minutes=a["allocated_minutes"],
                priority_score=a["priority_score"],
                recommended_periods=float(a["periods_count"]),
                reason_codes=a["reason_codes"],
                explanation=a["explanation"],
                key_concepts=a["key_concepts"]
            ))

        return CourseOptimizationResponse(
            course_id=course_id,
            total_available_minutes=total_avail_min,
            total_allocated_minutes=allocated_sum,
            revision_budget_minutes=revision_budget,
            assessment_budget_minutes=assessment_budget,
            unallocated_buffer_minutes=max(0, unallocated_buffer),
            time_pressure_status=pressure,
            topic_allocations=output_topics,
            formula_explanation={
                "model": solver_used,
                "weights": scoring_engine.weights,
                "invariant": f"Allocated ({allocated_sum}m) + Revision ({revision_budget}m) + Assessment ({assessment_budget}m) <= Total ({total_avail_min}m)",
                "period_duration_minutes": period_duration,
                "revision_percent": round(rev_pct * 100, 1),
                "assessment_percent": round(ass_pct * 100, 1),
                "teacher_controllable": True,
                "duration_assignment_factors": [
                    "concept_difficulty",
                    "concept_type",
                    "bloom_taxonomy",
                    "prerequisite_graph",
                    "historical_performance"
                ]
            }
        )

time_allocator = TimeAllocator()
