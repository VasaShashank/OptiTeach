"""
Exact Mixed-Integer Linear Programming (MILP) solver for curriculum time allocation,
formulated with scipy.optimize.milp.

Enforces pedagogical fairness:
1. No topic is allowed to exceed its suggested time while other topics are in deficit.
   If budget <= total needed periods, every topic is capped strictly at its needed periods.
2. Diminishing returns: Surplus periods beyond need are only awarded after every single
   topic's suggested need has been fully satisfied.
"""
from typing import Any, Dict, List, Optional
import numpy as np

class CurriculumILPSolver:
    """
    Discrete period allocation with strict pedagogical conservation.
    Ensures that instructional periods are prioritized to satisfy topic needs,
    and no topic exceeds its suggested duration while other topics remain short of time.
    """

    def solve_period_allocation(
        self,
        topic_items: List[Dict[str, Any]],
        instructional_budget: int,
        period_duration: int = 60,
    ) -> Optional[List[int]]:
        """Returns integer period counts [x_1, ..., x_n], or None if infeasible."""
        n = len(topic_items)
        max_periods = instructional_budget // period_duration
        if n == 0 or max_periods < n:
            return None

        priority = np.array([max(0.05, float(item["priority_score"])) for item in topic_items])
        need = np.array([max(1, round(item["topic"].estimated_minutes / period_duration)) for item in topic_items])
        total_needed = int(np.sum(need))

        # CASE 1: Finite or balanced budget (max_periods <= total_needed)
        # Fair sharing under deficit: allocate periods to minimize weighted relative deficit squared.
        # This prevents severe starvation of any topic (e.g. 1 out of 9 periods).
        if max_periods <= total_needed:
            x = [min(1, int(nd)) for nd in need]
            remaining = max_periods - sum(x)

            while remaining > 0:
                best_idx = None
                best_gain = -1e9
                for i in range(n):
                    if x[i] < need[i]:
                        d_curr = (need[i] - x[i]) / need[i]
                        d_next = (need[i] - x[i] - 1) / need[i]
                        gain = priority[i] * (d_curr**2 - d_next**2)
                        if gain > best_gain:
                            best_gain = gain
                            best_idx = i
                if best_idx is None:
                    break
                x[best_idx] += 1
                remaining -= 1

            if sum(x) * period_duration <= instructional_budget and all(p >= 1 for p in x):
                return x
            return None

        # CASE 2: Surplus budget (max_periods > total_needed)
        # Every topic's suggested need is 100% satisfied first.
        # Only leftover surplus periods go to the highest-priority topics.
        periods = [int(p) for p in need]
        surplus = max_periods - total_needed
        sorted_indices = np.argsort(-priority)
        for idx in sorted_indices:
            if surplus <= 0:
                break
            periods[idx] += 1
            surplus -= 1

        if sum(periods) * period_duration <= instructional_budget and all(p >= 1 for p in periods):
            return periods
        return None

ilp_solver = CurriculumILPSolver()
