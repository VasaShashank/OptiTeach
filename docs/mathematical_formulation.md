# 📐 Mathematical Formulation, Algorithms & Operations Research Models

This document presents the complete mathematical foundation, algorithmic formulations, and Operations Research (Mixed-Integer Linear Programming) models powering **OptiTeach**. The system models curriculum time allocation not as heuristic guessing, but as an optimization problem constrained by pedagogical invariants, cognitive science, and statutory regulations.

---

## 1. Mathematical Notation & Symbol Glossary

| Symbol | Definition | Domain / Units |
| :--- | :--- | :--- |
| $N$ | Total number of syllabus topics | $N \in \mathbb{Z}^+$ |
| $i$ | Index of a topic | $i \in \{1, 2, \dots, N\}$ |
| $C_i$ | Set of constituent atomic concepts in topic $i$ | — |
| $P$ | Standardized duration of one class period | $P = 60\text{ minutes}$ |
| $T_{\text{avail}}$ | Total semester instructional time ($T_{\text{avail}} = \text{total\_classes} \times P$) | Minutes ($2700\text{ min for } 45\text{ classes}$) |
| $B_{\text{buf}}$ | Buffer reservation for gazetted holidays, fests & contingencies | $B_{\text{buf}} = 0.10 \times T_{\text{avail}}$ |
| $B_{\text{rev}}$ | Revision reserve for prerequisite remediation | $B_{\text{rev}} = 0.10 \times T_{\text{avail}}$ |
| $B_{\text{asmt}}$ | Assessment reservation for CIE-I, CIE-II, and Quizzes | $B_{\text{asmt}} = 0.08 \times T_{\text{avail}}$ |
| $M_{\text{instr}}$ | Usable instructional periods budget | $M_{\text{instr}} = \lfloor (T_{\text{avail}} - B_{\text{buf}} - B_{\text{rev}} - B_{\text{asmt}}) / P \rfloor$ |
| $e_i$ | Raw pedagogical demand (time needed) for topic $i$ | Minutes ($e_i \in \mathbb{R}^+$) |
| $need_i$ | Suggested discrete period demand for topic $i$ | $need_i = \max(1, \text{round}(e_i / P))$ |
| $x_i$ | **Decision variable**: Discrete periods allocated to topic $i$ | $x_i \in \mathbb{Z}^+$ |
| $p_i$ | Normalized priority score for topic $i$ | $p_i \in [0.05, 1.0]$ |
| $L(c)$ | Bloom's Taxonomy cognitive depth level of concept $c$ | $L(c) \in \{1, 2, 3, 4, 5, 6\}$ |
| $b(c)$ | Downstream bottleneck degree (out-degree in prerequisite DAG) | $b(c) = |\text{Descendants}(c)|$ |
| $\delta(c)$ | Cohort prerequisite deficit measured from CIE test scores | $\delta(c) \in [0.0, 1.0]$ |

---

## 2. Pedagogical Demand Engine (`duration_assigner.py`)

Instructional time in an engineering curriculum is governed by five cognitive drivers:
1. Concept Typology Baseline ($\text{BaseMin}$)
2. Bloom's Taxonomy Depth Multiplier ($\mu_{\text{BT}}$)
3. Topic Difficulty Multiplier ($\mu_{\text{diff}}$)
4. Syllabus Importance Multiplier ($\mu_{\text{imp}}$)
5. Prerequisite Cognitive Deficit Penalty ($\delta_i$)

### 2.1 Concept Typology Baselines
Each atomic concept $c$ is assigned a baseline duration based on instructional modality:
$$\text{BaseMin}(c) = \begin{cases}
30\text{ minutes} & \text{if } \text{Typology}(c) = \text{Conceptual / Definitional} \\
40\text{ minutes} & \text{if } \text{Typology}(c) = \text{Procedural / Algorithmic} \\
55\text{ minutes} & \text{if } \text{Typology}(c) = \text{Problem-Solving / Mathematical} \\
50\text{ minutes} & \text{if } \text{Typology}(c) = \text{Practical / Software Tool}
\end{cases}$$

### 2.2 Cognitive Depth & Difficulty Multipliers
The cognitive depth multiplier $\mu_{\text{BT}}$ scales with Bloom's Revised Taxonomy level $L(c)$:
$$\mu_{\text{BT}}(c) = \begin{cases}
0.85 & L=1\text{ (Remember: definitions, taxonomy)} \\
1.00 & L=2\text{ (Understand: concept models, diagrams)} \\
1.25 & L=3\text{ (Apply: query execution, procedural steps)} \\
1.45 & L=4\text{ (Analyze: schema decomposition, dependency closure)} \\
1.60 & L=5\text{ (Evaluate: plan cost estimation, serializability)} \\
1.75 & L=6\text{ (Create: relational synthesis, physical tuning)}
\end{cases}$$

The difficulty multiplier scales with expert rating $d(c) \in [1, 5]$:
$$\mu_{\text{diff}}(c) = 0.70 + 0.15 \cdot d(c)$$

The importance multiplier scales with exam weight $w(c) \in [1, 5]$:
$$\mu_{\text{imp}}(c) = 0.85 + 0.06 \cdot w(c)$$

### 2.3 Prerequisite Deficit Multiplier
Let $\bar{S}_p$ be the cohort average percentage score in prerequisite assessments, and let $\tau = 60\%$ be the autonomous competency threshold. The prerequisite deficit $\delta(c)$ is:
$$\delta(c) = \max\left(0, \frac{\tau - \bar{S}_p}{100}\right)$$

When students fail to master prerequisite concepts ($\bar{S}_p < 60\%$), the remedial scaling factor $\gamma_{\text{prereq}} = 0.50$ introduces extra instructional scaffolding:
$$\mu_{\text{remedial}}(c) = 1.0 + \gamma_{\text{prereq}} \cdot \delta(c)$$

### 2.4 Total Raw Demand & Discrete Period Snapping
For topic $i$ containing concepts $C_i$:
$$e_i = \min\left(300, \sum_{c \in C_i} \text{BaseMin}(c) \cdot \mu_{\text{BT}}(c) \cdot \mu_{\text{diff}}(c) \cdot \mu_{\text{imp}}(c) \cdot \mu_{\text{remedial}}(c)\right)$$

> **Pedagogical Ceiling Guard**: No single topic may demand more than $300\text{ minutes}$ (5 class periods) to prevent syllabus anomalies from dominating the semester.

The discrete period need $need_i$ is snapped to discrete 60-minute units:
$$need_i = \max\left(1, \text{round}\left(\frac{e_i}{60}\right)\right)$$

---

## 3. Priority Scoring Model (`scoring.py`)

The priority score $p_i \in [0.05, 1.0]$ ranks topics for fair budget distribution. It is a linear combination of 5 normalized dimensions:

$$p_i = \alpha_1 \frac{\bar{w}_i}{5} + \alpha_2 \frac{\bar{d}_i}{5} + \alpha_3 \min\left(1, \frac{b_i}{4}\right) + \alpha_4 \frac{\text{BloomLevel}_i}{6} + \alpha_5 \delta_i$$

with normalized weights:
$$\alpha = [\alpha_1, \alpha_2, \alpha_3, \alpha_4, \alpha_5] = [0.25, 0.20, 0.25, 0.15, 0.15], \quad \sum_{j=1}^5 \alpha_j = 1.0$$

- $\bar{w}_i / 5$: Normalized exam weight in Continuous Internal Evaluation (CIE) and SEE.
- $\bar{d}_i / 5$: Normalized cognitive difficulty.
- $\min(1, b_i / 4)$: Normalized DAG bottleneck degree (capped at 4 downstream descendants).
- $\text{BloomLevel}_i / 6$: Cognitive complexity level.
- $\delta_i$: Cohort performance deficit on prerequisite concepts.

---

## 4. Operations Research Optimization Formulation (`ilp_solver.py`)

Curriculum time allocation is formulated as an integer mathematical program solved with **SciPy MILP (HiGHS solver)**.

### Decision Variables
- $x_i \in \mathbb{Z}^+$: Discrete periods allocated to topic $i$, where $i \in \{1, \dots, N\}$.

### Case 1: Deficit Budget ($M_{\text{instr}} < \sum_{i=1}^N need_i$)
When total usable instructional periods are fewer than the aggregate requested periods, simple proportional truncation starves multi-concept units. OptiTeach minimizes the **Weighted Squared Relative Deficit**:

$$\min_{\mathbf{x}} \sum_{i=1}^N p_i \left( \frac{need_i - x_i}{need_i} \right)^2$$

subject to:
$$\sum_{i=1}^N x_i \le M_{\text{instr}}$$
$$1 \le x_i \le need_i \quad \forall i \in \{1, \dots, N\}$$
$$x_i \in \mathbb{Z}^+ \quad \forall i \in \{1, \dots, N\}$$

#### Piecewise-Linear Reformulation for MILP Solver
Because SciPy's `milp` solves linear objective functions $\mathbf{c}^T \mathbf{x}$, the convex quadratic penalty $f_i(x_i) = p_i \left(\frac{need_i - x_i}{need_i}\right)^2$ is discretized across integer grid points $k \in \{1, \dots, need_i\}$.

Let $\Delta f_i(k) = f_i(k-1) - f_i(k) > 0$ represent the marginal utility of awarding the $k$-th period to topic $i$. By convexity, $\Delta f_i(k)$ is strictly decreasing in $k$ (diminishing marginal returns). Introducing binary indicator variables $y_{ik} \in \{0, 1\}$:

$$\max_{\mathbf{y}} \sum_{i=1}^N \sum_{k=1}^{need_i} \Delta f_i(k) \cdot y_{ik}$$

subject to:
$$\sum_{i=1}^N \sum_{k=1}^{need_i} y_{ik} \le M_{\text{instr}}$$
$$y_{i, k+1} \le y_{ik} \quad \forall i, \forall k \in \{1, \dots, need_i - 1\}$$
$$y_{i, 1} = 1 \quad \forall i \in \{1, \dots, N\} \quad \text{(Minimum 1 period guarantee)}$$
$$x_i = \sum_{k=1}^{need_i} y_{ik}$$

This guarantees:
1. **Zero Starvation**: Every topic receives at least 1 class period ($x_i \ge 1$).
2. **Fair Deficit Sharing**: The squared penalty prevents any topic from being trimmed below 75% of its need before other topics absorb proportionate cuts.
3. **Strict Non-Surplus**: No topic receives more than its requested need ($x_i \le need_i$).

### Case 2: Surplus Budget ($M_{\text{instr}} \ge \sum_{i=1}^N need_i$)
1. **Base Guarantee**: Every topic is awarded $100\%$ of its suggested need ($x_i = need_i$).
2. **Surplus Distribution**: The remaining surplus periods $S = M_{\text{instr}} - \sum need_i$ are assigned greedily in descending order of priority score $p_i$:
   $$x_i \leftarrow x_i + \min\left(1, S\right), \quad S \leftarrow S - 1$$
   Surplus time is earmarked for GATE problem-solving, advanced case studies, and hands-on lab demonstration.

---

## 5. Topological Precedence & Bottleneck Algorithms

Let $G = (V, E)$ be the directed acyclic graph (DAG) of syllabus concepts, where $(u, v) \in E$ denotes that concept $u$ is a strict prerequisite for concept $v$ ($u \prec v$).

### 5.1 Topological Scheduling Algorithm
```
Algorithm: Topological Curriculum Sequencing
Input: DAG G = (V, E), Topic Concept Mapping C_i
Output: Valid linear instructional order of topics

1. Compute In-Degree in_deg(v) for all v in V.
2. Initialize Queue Q with all concepts having in_deg(v) == 0.
3. While Q is not empty:
     u = Q.dequeue()
     Append u to LinearOrder
     For each neighbor v of u:
       in_deg(v) = in_deg(v) - 1
       If in_deg(v) == 0:
         Q.enqueue(v)
4. Group sorted concepts by Topic ID.
5. Invariant Assertion: If u in Topic A and v in Topic B with u -> v,
   then ScheduledPeriod(Topic A) < ScheduledPeriod(Topic B).
```

### 5.2 Bottleneck Score Computation
The cascading risk degree $b_i$ of concept $u$ is computed using Breadth-First Search (BFS) over the transitive closure of descendants:
$$b(u) = |\text{Descendants}(u)| = |\{v \in V \mid u \rightsquigarrow v\}|$$

If students underperform on concept $u$ ($\bar{S}_u < 60\%$) and $b(u) \ge 3$, the system raises a **High Bottleneck Alert**, because failure to remediate $u$ impairs all downstream descendant topics.

---

## 6. Period Phase Discretization Algorithm (`phase_allocator.py`)

Every 60-minute class period $s$ is partitioned into 4 discrete pedagogical phases constrained to 5-minute increments:

$$\text{Warmup}(s) + \text{Instruction}(s) + \text{Practice}(s) + \text{ExitCheck}(s) = 60\text{ minutes}$$

```
Phase 1: Warmup & Prerequisite Bridge  │  5 to 15 minutes (scaled by prerequisite deficit δ)
Phase 2: Core Concept Delivery         │ 20 to 30 minutes (whiteboard theory & derivations)
Phase 3: Board Worked Problems / Code  │ 15 to 25 minutes (guided problem-solving)
Phase 4: Formative Exit Check          │  5 to 10 minutes (Bloom L1-L3 quick verification)
```

### Remainder Snapping Algorithm
To ensure phases sum to exactly $P = 60$ minutes with no fractional leftovers:
1. Compute raw floating-point phase minutes based on topic complexity.
2. Snap each phase to the nearest 5-minute boundary: $t_k = 5 \times \lfloor (t_k^{\text{raw}} + 2.5) / 5 \rfloor$.
3. Compute residual drift $\Delta = 60 - \sum_{k=1}^4 t_k$.
4. If $\Delta > 0$, add $\Delta$ to the phase with the highest pedagogical variance (Worked Problems).
5. If $\Delta < 0$, subtract $|\Delta|$ from Core Delivery while preserving minimum phase floors ($t_{\text{warmup}} \ge 5$, $t_{\text{instr}} \ge 20$, $t_{\text{prac}} \ge 15$, $t_{\text{check}} \ge 5$).

---

## 7. Dynamic Re-Optimization & Pace Drift Engine

When classroom reality diverges from the plan, OptiTeach recalculates syllabus pace:

### 7.1 Syllabus Drift Formula
Let $D_i^{\text{planned}}$ be the planned period duration for completed topic $i$, and let $D_i^{\text{actual}}$ be the actual periods spent recorded by the faculty:

$$\text{Drift}_i = D_i^{\text{planned}} - D_i^{\text{actual}}$$

$$\text{Net Syllabus Drift} = \sum_{i \in \text{Completed}} \text{Drift}_i$$

- **$\text{Net Drift} = 0$**: Curriculum delivery is on schedule.
- **$\text{Net Drift} > 0$**: Curriculum is ahead by $\text{Net Drift}$ periods (surplus awarded to enrichment).
- **$\text{Net Drift} < 0$**: Curriculum is **lagging** by $|\text{Net Drift}|$ periods.

### 7.2 Rebalancing Action Trigger
When $\text{Net Drift} < 0$, OptiTeach evaluates two remedies:
1. **Compensatory Slot (Saturday Zero Hour)**:
   $$M_{\text{usable}} \leftarrow M_{\text{usable}} + 1, \quad \text{Schedule Saturday Period}$$
2. **Graceful Compression (MILP Re-solve)**:
   $$M_{\text{remaining}} \leftarrow M_{\text{remaining}} - |\text{Net Drift}|$$
   The MILP solver is re-executed over remaining uncompleted topics, protecting prerequisite concepts and compressing low-priority topics into guided self-study modules.

---

## 8. VTU Attendance Projection & Condonation Mathematics

Let:
- $C_{\text{total}}$: Total planned classes in the semester ($C_{\text{total}} = 45$).
- $C_{\text{held}}$: Number of classes conducted to date.
- $C_{\text{rem}}$: Number of remaining classes ($C_{\text{rem}} = C_{\text{total}} - C_{\text{held}}$).
- $C_{\text{att}}$: Number of classes attended by the student.

$$\text{Current Attendance \%} = \frac{C_{\text{att}}}{C_{\text{held}}} \times 100$$

$$\text{Maximum Reachable Attendance \%} = \frac{C_{\text{att}} + C_{\text{rem}}}{C_{\text{total}}} \times 100$$

### Classification Thresholds (VTU Clauses 8.1 & 8.2)
$$\text{Status} = \begin{cases}
\text{ELIGIBLE (Safe Zone)} & \text{if } \text{Current \%} \ge 85.0\% \\
\text{CONDONATION\_REQUIRED} & \text{if } 75.0\% \le \text{Current \%} < 85.0\% \\
\text{DETENTION\_RISK} & \text{if } \text{Current \%} < 75.0\% \text{ and } \text{Max Reachable \%} \ge 75.0\% \\
\text{MATHEMATICALLY\_DETAINED (NE)} & \text{if } \text{Max Reachable \%} < 75.0\%
\end{cases}$$

For students in the **Detention Risk** zone, the exact minimum number of consecutive future classes $k$ they must attend to cross the 75% condonation cutoff is:
$$k = \left\lceil \frac{0.75 \times C_{\text{total}} - C_{\text{att}}}{1.0} \right\rceil$$

---

## 9. NBA Course Outcome Attainment Metrics

Let $S$ be the set of enrolled students, $|S| = M$. For Course Outcome $CO_j$ assessed across question items $Q(CO_j)$ with maximum marks $M(q)$:

Let $s_{ik}$ be the mark scored by student $i$ on question $k$. The student's percentage mastery on $CO_j$ is:
$$\text{Score}_i(CO_j) = \frac{\sum_{k \in Q(CO_j)} s_{ik}}{\sum_{k \in Q(CO_j)} M(k)} \times 100$$

Under the **RVCE Autonomous OBE Standard**, a student has attained the outcome if:
$$\mathbb{I}_i(CO_j) = \begin{cases} 1 & \text{if } \text{Score}_i(CO_j) \ge 60.0\% \\ 0 & \text{otherwise} \end{cases}$$

The cohort outcome attainment percentage is:
$$\text{Attainment}(CO_j) = \frac{\sum_{i=1}^M \mathbb{I}_i(CO_j)}{M} \times 100$$

$$\text{Target Status} = \begin{cases}
\text{TARGET MET} & \text{if } \text{Attainment}(CO_j) \ge 70.0\% \\
\text{DEFICIT / REMEDIAL REQUIRED} & \text{if } \text{Attainment}(CO_j) < 70.0\%
\end{cases}$$

When $\text{Attainment}(CO_j) < 70.0\%$, the system flags a curricular deficiency in the end-of-semester NBA Course File and schedules remedial review in the next academic cycle.
