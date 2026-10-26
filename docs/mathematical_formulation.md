# 📐 Mathematical Formulation of Curriculum Optimization

OptiTeach formulates curriculum time distribution as a **Mixed-Integer Linear Programming (MILP)** optimization problem satisfying strict academic invariants.

---

## 1. Parameters & Decision Variables

### Sets and Indices
- $i \in \{1, 2, \dots, N\}$: Set of syllabus topics.
- $P$: Duration of a single class period in minutes (standardized to $P = 60$).
- $T_{\text{avail}}$: Total available semester instructional time in minutes ($T_{\text{avail}} = \text{total\_classes} \times P$).

### Constants & Weights
- $d_i \in [1, 5]$: Difficulty rating of topic $i$.
- $w_i \in [1, 5]$: Importance / Exam weightage of topic $i$.
- $b_i \in \mathbb{N}$: Number of downstream prerequisite dependencies.
- $T_{\min}$: Minimum required threshold duration ($T_{\min} = P$, i.e., at least 1 discrete period per topic).
- $B_{\text{rev}}$: Teacher-controllable revision reserve (default $10\%$ of $T_{\text{avail}}$, rounded to nearest period).
- $B_{\text{asmt}}$: Teacher-controllable assessment reserve (default $6\%$ of $T_{\text{avail}}$, rounded to nearest period).
- $e_i$: Pedagogically estimated need in periods ($e_i = \text{estimated\_minutes}_i / P$), capped at a realistic pedagogical ceiling of $\min(e_i, 5)$ periods ($300$ minutes) to prevent single-topic syllabus agglomeration anomalies.

### Decision Variables
- $x_i \in \mathbb{Z}^+$: Number of discrete class periods allocated to topic $i$.
- $t_i = x_i \cdot P$: Allocated minutes for topic $i$.

---

## 2. Mathematical Objective Function

### Case 1: Deficit Budget ($\sum_{i=1}^N e_i > M_{\text{instr}}$)
When the total pedagogical demand exceeds available instructional periods $M_{\text{instr}} = (T_{\text{avail}} - B_{\text{rev}} - B_{\text{asmt}}) / P$, pure linear knapsack models cause **catastrophic starvation** (filling early topics to 100% while starving complex multi-concept topics to 1 period, e.g. 60 out of 540 min).

OptiTeach solves this via **Proportional Fairness / Diminishing-Returns Deficit Minimization**:

$$\min \sum_{i=1}^N p_i \left( \frac{e_i - x_i}{e_i} \right)^2$$

subject to:
$$\sum_{i=1}^N x_i \le M_{\text{instr}}$$
$$1 \le x_i \le e_i \quad \forall i \in \{1, \dots, N\}$$

By minimizing the weighted squared relative deficit:
- **No Topic Exceeds Need**: $x_i \le e_i$, strictly preventing surplus allocation to satisfied topics while others remain in deficit.
- **Fair Equitable Compression**: Topics share the deficit proportionally (e.g. 75% to 85% satisfaction across all topics) based on pedagogical weights $p_i$, eliminating single-topic starvation.

### Case 2: Surplus Budget ($\sum_{i=1}^N e_i < M_{\text{instr}}$)
When instructional periods exceed total syllabus demand:
1. Every topic receives $100\%$ of its suggested need: $x_i \ge e_i$.
2. Leftover surplus periods $S = M_{\text{instr}} - \sum e_i$ are distributed one-by-one to the highest-priority topics ($p_i$) for enrichment and advanced problem solving.

---

## 3. Strict Invariant Constraints

### Invariant 1: Finite Semester Budget Invariant
$$\sum_{i=1}^{N} x_i \cdot P + B_{\text{rev}} + B_{\text{asmt}} \le T_{\text{avail}}$$

### Invariant 2: Discrete Period Integrality & Minimum Cognitive Threshold
$$x_i \ge 1, \quad x_i \in \mathbb{Z}^+ \quad \forall i \in \{1, \dots, N\}$$

### Invariant 3: In-Class Session Phase Sum Invariant
For every class session $s$, with phases $\Phi = \{\text{Warmup}, \text{Instruction}, \text{Practice}, \text{Assessment}, \text{Wrapup}\}$:
$$\sum_{\phi \in \Phi} \text{Duration}(\phi) = P$$

---

## 4. Prerequisite Topological Ordering Constraint

If topic $u$ is a prerequisite of topic $v$ ($u \prec v$):
$$\text{ScheduledStartSession}(u) < \text{ScheduledStartSession}(v)$$
Ensuring no student is taught dependent concepts without prerequisite scaffolding.
