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
- $B_{\text{rev}}$: Reserved revision buffer budget ($10\%$ of $T_{\text{avail}}$, rounded to nearest period).
- $B_{\text{asmt}}$: Reserved assessment checkpoint budget ($8\%$ of $T_{\text{avail}}$, rounded to nearest period).

### Decision Variables
- $x_i \in \mathbb{Z}^+$: Number of discrete class periods allocated to topic $i$.
- $t_i = x_i \cdot P$: Allocated minutes for topic $i$.

---

## 2. Mathematical Objective Function

Each topic $i$ has a priority $p_i$ (the weighted score above) and an estimated need of
$e_i = \max(1, \text{round}(\text{estimated\_minutes}_i / P))$ periods. Its periods are split into
*needed* periods $y_i$ and *extra* periods $z_i$, with $x_i = y_i + z_i$:

$$\max \sum_{i=1}^{N} (1 + p_i)\, y_i + 0.5\, p_i\, z_i$$

$$1 \le y_i \le e_i, \qquad 0 \le z_i \le e_i, \qquad y_i, z_i \in \mathbb{Z}$$

A needed period is always worth more than an extra one ($1 + p_i > 0.5\,p_j$), so the optimum
covers every topic's estimate before any topic gets extra time (diminishing returns). When the
budget is short, priority decides which topics are cut back towards their one-period floor.
A purely linear objective $\sum p_i x_i$ has corner-point optima that pour every spare period
into the single highest-priority topic, which is why the two tiers are used.

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
