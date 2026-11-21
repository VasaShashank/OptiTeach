# 📚 OptiTeach Engineering Documentation Index

Welcome to the technical and institutional documentation repository for **OptiTeach**, an intelligent curriculum optimization and course-planning platform tailored for Tier-I autonomous engineering institutions (specifically **R.V. College of Engineering** under the **Visvesvaraya Technological University** autonomous scheme).

---

## 📑 Core Documentation Guides

### 1. [Institutional Framework & Regulations (RVCE, VTU & AICTE)](file:///c:/Users/basav/Downloads/DBMS/OptiTeach/docs/institutional_framework_rvce_vtu_aicte.md)
* **What it covers**:
  - Detailed provenance of how authentic RVCE, VTU, and AICTE statutory data was gathered.
  - RVCE Autonomous 2021/2022 Scheme credit architecture (3:0:2, 3:0:0) and 45 contact-hour semester baseline.
  - 50:50 Continuous Internal Evaluation (CIE) to Semester End Examination (SEE) grading structure.
  - Mandatory 20.0/50.0 CIE passing cutoff for SEE examination eligibility.
  - VTU Clauses 8.1, 8.2 & 8.3 governing the 85% attendance rule and 75% condonation allowances.
  - AICTE & NBA Criterion 2.2 for Slow Learners ($<40\%$) and Advanced Learners ($>80\%$) differentiated instruction.
  - Laboratory Batching ($A_1, A_2$) and Theory-Lab chronological precedence constraints.
  - The complete 1-Click NBA Self-Assessment Report (SAR) Course File audit trail.

### 2. [Mathematical Formulation, Algorithms & Operations Research Models](file:///c:/Users/basav/Downloads/DBMS/OptiTeach/docs/mathematical_formulation.md)
* **What it covers**:
  - Complete mathematical notation and symbol glossary.
  - **Pedagogical Demand Engine (`duration_assigner.py`)**: Concept typology baselines, Bloom's Taxonomy cognitive depth multipliers ($\mu_{\text{BT}}$), difficulty multipliers ($\mu_{\text{diff}}$), syllabus importance multipliers ($\mu_{\text{imp}}$), and prerequisite deficit multipliers ($\mu_{\text{remedial}}$).
  - **Priority Scoring Model (`scoring.py`)**: 5-dimensional linear combination scoring model.
  - **Operations Research Formulation (`ilp_solver.py`)**: Mixed-Integer Linear Programming (MILP) minimizing weighted squared relative deficit with piecewise-linear marginal utility transformation.
  - **Topological Sorting & Bottleneck Detection**: DAG depth, ancestor/descendant reachability, and cascading cognitive drift alerts.
  - **Period Phase Discretization Algorithm**: Minute-by-minute phase division summing strictly to 60 minutes in 5-minute multiples with remainder snapping.
  - **Dynamic Re-optimization & Syllabus Pace Drift Engine**: Tracking actual delivery durations and triggering compensatory classes vs. MILP compression.
  - **VTU Attendance Projections**: Calculating maximum reachable attendance and mathematical detention points.
  - **NBA Course Outcome Attainment**: Formative assessment question mapping against the autonomous 60% competency benchmark.

### 3. [DBMS Final Project Report & Schema Architecture](file:///c:/Users/basav/Downloads/DBMS/OptiTeach/docs/DBMS_REPORT.md)
* **What it covers**:
  - Relational database schema with 18 third-normal-form (3NF) tables.
  - PostgreSQL Advanced Features: Recursive Common Table Expressions (CTEs) for DAG prerequisite reachability, stored procedures, audit triggers, and row-level access controls.
  - Hybrid persistence: Relational SQL for transactional integrity and MongoDB MongoMock for versioned, unstructured lesson plan artifacts.

### 4. [REST API Documentation & Endpoints](file:///c:/Users/basav/Downloads/DBMS/OptiTeach/docs/api_documentation.md)
* **What it covers**:
  - Complete endpoint catalog across Auth, Admin, Courses, Curriculum, Syllabus, Teaching Methods, Institutional Operations, and Exports.
  - Role-Based Access Control (RBAC) scopes: `admin` vs. `teacher`.

### 5. [System Architecture & Visual Diagrams](file:///c:/Users/basav/Downloads/DBMS/OptiTeach/docs/architecture_diagrams.md)
* **What it covers**:
  - Entity-Relationship (ER) diagrams and high-level system component interactions.
  - Sequence diagrams for syllabus ingestion, MILP time allocation, and closed-loop continuous evaluation.

### 6. [User Manual & Operational Guide](file:///c:/Users/basav/Downloads/DBMS/OptiTeach/docs/user_manual.md)
* **What it covers**:
  - End-to-end user guide for Faculty Instructors and Department Administrators.
  - Step-by-step instructions for importing syllabi, managing timetables, declaring lost classes, assigning proxies, and exporting NBA Course Files.
