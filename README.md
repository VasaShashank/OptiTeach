# OptiTeach: Intelligent Course-Planning & Curriculum Assistant

> **"DBMS is the core. AI and optimization are the intelligence. The dashboard is the product."**

OptiTeach is a course-planning and curriculum optimization assistant engineered for university faculty. A teacher faces a rigid syllabus and a finite calendar of class hours. OptiTeach helps them solve four fundamental instructional challenges:

1. **What to teach next:** Determining optimal sequence and identifying bottleneck prerequisites.
2. **How much time each topic deserves:** Allocating semester minutes mathematically using Operations Research (Mixed-Integer Linear Programming).
3. **How to teach it:** Recommending pedagogical methods (lecture, worked examples, inquiry, group discussion) based on concept typology and empirical efficacy.
4. **Whether to revise first:** Dynamically recommending prerequisite revision when student assessment scores fall below cognitive mastery thresholds.

OptiTeach deliberately operates at the **course, topic, and concept level**, rather than acting as a student attendance tracker or administrative ERP.

---

## 🧭 The Teacher's Journey: End-to-End Workflow

The platform operates on a closed pedagogical feedback loop:  
**Plan → Teach → Assess → Record → Analyze → Re-optimize**

```
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. Upload Syllabus (PDF/Text)                               │
   │    └─► Deterministic NLP parses Units, Topics, COs, DAG     │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 2. Knowledge Graph & Bottleneck Analysis                    │
   │    └─► Prerequisite DAG identifies high-risk concept blocks │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 3. Semester Time Optimization (Optimizer Level 1)           │
   │    └─► SciPy MILP allocates minutes across 45 1-hr periods  │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 4. Period & Lesson Planning (Optimizer Level 2)             │
   │    └─► Exact period phase division + Pedagogy Selection     │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 5. The "Next Class" Dashboard Card & Classroom Presenter    │
   │    └─► Real-time revision alerts, topic briefings, timer    │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 6. Teach, Record Class & Log Assessment Scores              │
   │    └─► Actual minutes taught, engagement, quiz results      │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ 7. Dynamic Re-Optimization & Calendar Adaptation            │
   │    └─► Weak concepts trigger auto-revision in future plans  │
   └─────────────────────────────────────────────────────────────┘
```

### 1. Create a Course & Upload the Syllabus
The teacher configures a course (e.g., *CS355 Advanced Algorithms*, 45 periods of 1 hour / 60 minutes) and uploads the syllabus as a PDF or raw text. The **deterministic NLP engine** (`app/nlp/deterministic.py`) extracts:
- Course name, code, and total syllabus duration (e.g., `Total Hours : 45L` -> 45 periods).
- Units and modules with clean titles and hour detachment.
- Topics and atomic concepts with cognitive difficulty (1–5) and typology.
- Course Outcomes (COs) mapped to **Bloom's Taxonomy** levels (*Remember*, *Understand*, *Apply*, *Analyze*, *Evaluate*, *Create*).
- Initial prerequisite Directed Acyclic Graph (DAG) dependencies.
- *Strict Rule: NLP proposes, teacher confirms.* The teacher reviews and adjusts the draft before committing to the database.

### 2. The Curriculum Graph & Bottleneck Detection
Concepts are assembled into an in-memory and database-backed **knowledge graph** (using NetworkX and recursive SQL CTEs). The system highlights **curriculum bottlenecks**: concepts that are heavily depended upon by subsequent units where student performance is lagging.

### 3. Realistic Duration Assigner & Course-Level Time Allocation (Optimizer Level 1)
The total semester duration (standardized to $45 \times 60 = 2700$ minutes) is partitioned using an advanced pedagogical allocation engine:
- **Pedagogical Duration Assigner (`duration_assigner.py`)**: Computes realistic suggested topic minutes from atomic concept typologies (conceptual, procedural, problem-solving, analytical), Bloom's Taxonomy cognitive depth (*Remember* through *Create*), and difficulty scores (1–5), snapped to whole 60-minute period multiples.
- **Pedagogical Ceiling Protection**: Caps any single topic's estimated duration to a realistic maximum of 5 periods (300 minutes), preventing syllabus anomalies where 8+ concepts are agglomerated under one topic from consuming 20%+ of the semester.
- **Teacher-Controllable Reserves**: Instructors can customize revision percentage (default 10%) and assessment percentage (default 6%) with live slider controls.
- **Proportional Diminishing-Returns Fair Allocation (`ilp_solver.py`)**:
  - *Under Deficit*: Minimizes weighted relative deficit squared, guaranteeing that no topic is starved (e.g. 1 out of 9 periods / 60 out of 540 min). All topics receive 75% to 100% of their suggested time.
  - *Strict Non-Surplus Guarantee*: No topic is permitted to exceed its suggested time while other topics remain short of hours.
  - *Under Surplus*: 100% satisfies every topic's need before surplus periods are awarded to high-priority topics.

### 4. Class-Level Phase Planning (Optimizer Level 2)
For each individual 1-hour period (60 minutes), OptiTeach constructs a minute-by-minute phase schedule:
- **Standard 60-Minute Period**: 5 min recap, 25 min explanation/lecture, 20 min worked examples, 10 min quiz/active check ($5+25+20+10 = 60$).
- **Revision 60-Minute Period (when prerequisite $< 60\%$)**: 10–15 min targeted revision, 20 min explanation, 20 min worked examples, 10 min guided practice ($15+20+15+10 = 60$).
- Phases strictly sum to the period duration (60 minutes) in discrete 5-minute increments.
- **Pedagogical Advisor**: Suggests teaching methods tailored to the concept's cognitive category and historical effectiveness.
- Provides explicit, transparent pedagogical rationales for every recommendation.

### 5. The "Next Class" Dashboard Card
Upon logging in, the instructor is greeted with immediate, actionable context:
> *"Good afternoon, Prof. Turing. Next up: Dynamic Programming: Matrix-Chain Multiplication. Revise Recursion Trees for 10 minutes first. Reason: student assessment average was 54.2%, below the 60% mastery threshold."*
Offers one-click actions: **Prepare my class**, **Launch Presenter Mode**, or **Record this class**.

### 6. Lesson Plans & Versioned Teaching Artifacts
Generates comprehensive lesson plans containing objectives, phase breakdowns, worked examples, interactive activities, common student misconceptions, and Bloom-aligned quiz questions.
- Instructors can **Approve, Edit, or Reject** plans.
- Every modification creates a new immutable version in MongoDB with diff inspection and audit logging.

### 7. Teach, Record, and Close the Loop
After class, the instructor logs actual delivery: minutes spent, teaching methods utilized, student engagement rating (1–5), topics covered, and carry-over status for unfinished topics.

### 8. Assessment & Real-Time Re-Optimization
The teacher inputs quiz and assignment marks per concept. OptiTeach recalculates concept health scores (*Strong*, *Moderate*, *Weak*, *Bottleneck*), updates course velocity, and **immediately adapts upcoming lesson plans and time allocations**.

---

## 👥 User Roles, Permissions & Account Creation

OptiTeach enforces strict Role-Based Access Control (RBAC) and row-level multi-tenancy:

| Role / Scope | Access Level & Capabilities | Course Boundary & Visibility |
|---|---|---|
| **Admin** (`admin`) | Institutional supervisor / department chair. Can view all courses across all faculty, inspect institution-wide attainment metrics, audit logs, and system settings. | Global visibility across all courses and instructors. |
| **Teacher** (`teacher`) | Course instructor. Creates courses, uploads syllabi, edits curriculum DAGs, approves lesson plans, and enters assessment marks. | Strictly isolated to owned courses (`teacher_id`) and courses where explicitly added as a member. Other courses return `404 Not Found` (anti-enumeration defense). |
| **Co-Teacher** (`editor`) | Collaborating faculty or lab instructor. Has read and write permissions to edit lesson plans, record sessions, and enter marks. | Granted per-course by the course owner via `course_members`. |
| **Viewer** (`viewer`) | Teaching assistant, auditor, or observer. Has read-only permissions (`GET` requests allowed; any `POST`/`PUT`/`DELETE` returns `403 Forbidden`). | Granted per-course by the course owner via `course_members`. |

### Account Creation & Registration
- **Faculty Self-Registration**: Available via the frontend `/register` interface or the API endpoint `POST /api/auth/register`.
  - Accepts `email`, `password`, `full_name`, `department`, `designation`, and `employee_id`.
  - Self-registration **strictly assigns the `teacher` role** and automatically provisions a linked `Teacher` profile in the relational schema. Self-registration can never grant administrative privileges.
- **Admin Account Provisioning**: System administrators are established during database initialization (`python -m database.seed.seed_data`) or promoted directly within the database by setting `role = 'admin'` in the `users` table.
- **Authentication Lifecycle**:
  - Secure password hashing using **bcrypt** (work factor 12) with per-user salt.
  - Legacy SHA-256 password hashes are automatically upgraded to bcrypt upon successful login.
  - Short-lived **JWT bearer tokens** (HS256) encode user identity, role, and permissions.
  - Brute-force protection: IP and email-based login throttling via in-memory rate limiting.

---

## 🧠 The Deterministic NLP Engine (`backend/app/nlp/deterministic.py`)

Unlike fragile generative AI extractors that suffer from hallucinations, non-deterministic output, and network latency, OptiTeach utilizes an **auditable, deterministic, rule-based NLP pipeline**:

```
 Raw Syllabus Text / PDF
          │
          ▼
 1. Unicode & Whitespace Normalization (Dashes, ligatures, zero-width chars)
          │
          ▼
 2. Course Name & Code Extraction (e.g., CS355TBB, Advanced Algorithms)
          │
          ▼
 3. Strict Boundary Detection & Post-Unit Cutoff (Slices before References/Rubrics)
          │
          ▼
 4. Multi-Unit & Module Recognition (Roman, Arabic, Word numerals)
          │
          ▼
 5. Wrapped-Line Unwrapping (_merge_wrapped_lines for mid-sentence breaks)
          │
          ▼
 6. Topic Parsing & Concept Atomic Splitting
          │
          ▼
 7. Concept Classification, Difficulty Scoring & Prerequisite DAG Linking
          │
          ▼
 8. Bloom's Taxonomy Course Outcome (CO) Extraction
```

### Key Technical Innovations in `deterministic.py`
1. **Unicode Dash & Punctuation Normalization**: Standardizes em-dashes (`—`), en-dashes (`–`), minus signs (`−`), horizontal bars (`―`), and smart quotes into canonical ASCII representations.
2. **Multi-Unit Roman & Word Numeral Recognition**: Parses `Unit-I`, `Unit – II`, `UNIT 3:`, `MODULE IV`, `CHAPTER 5`, `Part One` through `ROMAN_MAP` and `WORD_MAP` lookup tables.
3. **Inline Hours Detachment**: Strips administrative time notations such as `09 Hrs`, `(8 Hours)`, `10 Periods`, `45L` from unit headings and topic clauses without corrupting subject titles.
4. **Intelligent Wrapped-Line Joining (`_merge_wrapped_lines`)**: Indian university syllabus documents frequently break sentences across newlines mid-clause (e.g., `Decreasing a key and \n deleting a node`, or `Johnson's Algorithm for sparse \n graphs`). The parser identifies lowercase continuations and trailing conjunctions/prepositions (`and`, `or`, `for`, `with`, `of`) and merges them into unified semantic clauses.
5. **Strict Post-Unit Boundary Cutoff**: Stops unit parsing prior to trailing non-curricular sections:
   - `Course Outcomes` / `CO 1..n`
   - `Reference Books` / `Textbooks` / `Suggested Readings`
   - `Continuous Internal Evaluation (CIE)` / `SEE Rubrics` / `Question Paper Pattern`  
   *This ensures Unit V cleanly ends at its actual concepts and does not absorb reference lists or marking rubrics.*
6. **Bloom's Taxonomy Classification**: Course Outcomes (`CO 1`, `CO 2`...) are extracted into the `course_outcomes` table with automated cognitive verb mapping (*Remember, Understand, Apply, Analyze, Evaluate, Create*).
7. **Prerequisite DAG Synthesis**: Chained sequential dependencies are generated between atomic concepts within topics, outputting a valid Directed Acyclic Graph.
8. **Strict Zero-Hallucination Guarantee**: If unit headers or topics cannot be parsed, the parser raises an explicit `ValueError` guiding the user rather than fabricating artificial placeholder curriculum data.

---

## 🏛️ The Relational & Document DBMS Core (The Graded Core)

OptiTeach is built around an enterprise database architecture demonstrated live on the **DBMS Showcase page** with 9 interactive tabs:

| DBMS Category | Architecture & Technical Implementation in OptiTeach |
|---|---|
| **ER Model** | 22 normalized entities; the interactive Mermaid ER diagram is dynamically generated directly from the live database catalog and foreign key constraints. |
| **Relational Schema** | Primary keys, 27 foreign keys, 15 unique constraints, and 40 check constraints managed through versioned, reversible **Alembic migrations** (`0001_initial_schema` to `0005_co_teaching`). |
| **Normalization** | Identified and resolved real-world 1NF violations (multi-valued comma-separated lists migrated to `concept_prerequisites`) and derived attribute violations (converted to generated computed column `total_available_minutes`). Complete functional dependency mapping ensures 3NF / BCNF compliance. |
| **Advanced SQL** | 19 live SQL query demonstrations featuring multi-table `INNER`/`LEFT JOIN`s, `GROUP BY ... HAVING`, recursive Common Table Expressions (`WITH RECURSIVE` for prerequisite graphs), window functions (`RANK()`, `LAG()`, cumulative running sums), relational division, and `EXCEPT` operations. Each query renders its live query execution plan (`EXPLAIN ANALYZE`). |
| **Database Objects** | 3 relational views, 1 materialized view (`mv_course_analytics`), 10 custom functions, 1 stored procedure (`archive_completed_course`), and 18 triggers (automated audit logging, real-time student weakness flags, and prerequisite cycle prevention). |
| **Transactions & ACID** | Multi-step curriculum operations execute within strict ACID transactions featuring row-level locking (`SELECT ... FOR UPDATE`), transaction savepoints, and version-checked concurrency. The **Transaction Lab** demonstrates live rollbacks, isolation levels (`READ COMMITTED`, `REPEATABLE READ`, `SERIALIZABLE`), lost-update mitigation, and deadlock resolution across concurrent connections. |
| **Security & Privacy** | bcrypt password hashing, JWT bearer tokens, least-privilege connection roles (`optiteach_app` role restricted from DDL and `TRUNCATE`), immutable `SECURITY DEFINER` audit logs, and **Row-Level Security (RLS)** in the interactive SQL console ensuring faculty cannot query other instructors' records. |
| **Document NoSQL (MongoDB)** | MongoDB 8 houses semi-structured, deeply nested, versioned documents: lesson plan drafts and historical revisions, curriculum DAG graph snapshots, and raw syllabus uploads. Enforces JSON Schema validators, unique and compound indexes, TTL automatic draft expiry, and aggregation analytics pipelines. |
| **Cross-Store Consistency** | A hybrid coordinator verifies referential integrity between PostgreSQL entity IDs and MongoDB document references, providing an automated detection and reconciliation utility. |

### Why a Polyglot Persistence Architecture?
- **PostgreSQL 17**: Enforces relational integrity, foreign key cascades, complex joins, mathematical aggregation, and ACID constraints for core academic records (courses, units, topics, concepts, outcomes, assessment marks).
- **MongoDB 8**: Efficiently stores and versions polymorphic, deeply nested documents (lesson plans with variable pedagogical phases, multimedia resources, and graph snapshots) that are read and updated atomically.

---

## 🛠️ Complete Technology Stack

| Layer | Technologies & Libraries |
|---|---|
| **Web Dashboard** | **Next.js 15** (App Router), React 19, TypeScript, Lucide Icons, Mermaid.js (live ER diagrams), Tailwind CSS / Vanilla CSS design tokens. |
| **Backend API** | **FastAPI**, Uvicorn ASGI server, Pydantic v2 data validation and serialization. |
| **Relational Database** | **PostgreSQL 17** via SQLAlchemy 2.0 ORM + Alembic migrations (*Zero-config local fallback to SQLite with enforced Foreign Keys*). |
| **Document Database** | **MongoDB 8** via PyMongo (*Zero-config local fallback to in-memory MongoMock*). |
| **Optimization & Graph Engine** | **SciPy** (Mixed-Integer Linear Programming MILP solver), **NetworkX** (graph algorithms, cycle detection, topological sorting). |
| **Security & Auth** | bcrypt, PyJWT (HS256), PostgreSQL RLS policies, least-privilege database roles. |
| **Testing & Verification** | **Pytest** (121 unit, integration, and security tests), Ruff linter, ESLint, TypeScript compiler checks. |

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+** & npm
- *(Optional, Recommended)*: PostgreSQL 15+ and MongoDB 6+. *(If not installed, OptiTeach automatically runs with SQLite + MongoMock for zero-setup execution).*

### 2. Backend Setup
Run all commands from the **repository root**:

```bash
# 1. Create and activate Python virtual environment
python -m venv .venv
.venv\Scripts\activate       # Windows PowerShell / CMD
# source .venv/bin/activate  # macOS / Linux

# 2. Install dependencies
pip install -r backend/requirements.txt

# 3. Configure environment (Optional: defaults work out-of-the-box for local SQLite/PostgreSQL)
cp backend/.env.example backend/.env

# 4. Initialize database and seed sample course data
# (Initializes tables, seeds Prof. Turing's CS302 course, and seeds faculty/admin users)
python -m database.seed.seed_data

# 5. Start the FastAPI backend server
python -m uvicorn app.main:app --app-dir backend --reload --port 8000
```
Backend API will be running at `http://127.0.0.1:8000` with interactive Swagger API docs at `http://127.0.0.1:8000/docs`.

### 3. Frontend Setup
In a separate terminal window:

```bash
cd frontend
npm install
npm run dev
```
The web dashboard will be live at `http://localhost:3000`.

### 4. Default Demo Credentials

| Role | Email | Password | Description |
|---|---|---|---|
| **Teacher (Faculty)** | `faculty@optiteach.edu` | `admin123` | Owns CS302 Database Management Systems; full access to planning, curriculum, and class recording. |
| **Administrator** | `admin@optiteach.edu` | `admin123` | Department Administrator; global visibility across all courses and institutional metrics. |
| **New Faculty** | Use `/register` | Custom | Registers a new teacher account with an isolated workspace. |

---

## 🧪 Testing & Verification

The test suite validates data integrity, optimization invariants, concurrency control, and security boundaries:

```bash
# Run the complete test suite (121 tests)
python -m pytest backend/tests -v
```

### Test Coverage Highlights
- **Curriculum & NLP**: Deterministic extraction, Roman numeral parsing, wrapped line joining, Unit V boundary isolation, Bloom's CO classification.
- **Optimization Invariants**: MILP total minute conservation, period integrality, cognitive revision constraints.
- **Security & Authorization**: Password hashing, JWT validation, brute-force rate limiting, course-level multi-tenancy, RLS isolation in SQL console.
- **ACID Transactions**: Row locking, optimistic concurrency version checks, and rollback verification in the Transaction Lab.
- **Subject Lifecycle**: Creation, syllabus upload, updates, and cascading course deletion (relational records + MongoDB artifacts).

---

## 📄 Project Documentation Links

- **[docs/DBMS_REPORT.md](docs/DBMS_REPORT.md)**: Comprehensive Database Management Systems report mapped to academic evaluation criteria.
- **[docs/mathematical_formulation.md](docs/mathematical_formulation.md)**: Exact Mixed-Integer Linear Programming equations and objective functions.
- **[docs/api_documentation.md](docs/api_documentation.md)**: Full REST API endpoint reference and payload specifications.
- **[PENDING_IMPLEMENTATIONS_AND_EXTENSIONS.md](PENDING_IMPLEMENTATIONS_AND_EXTENSIONS.md)**: Active engineering roadmap, completed features, and future LMS integration specifications.

---

## 👨‍💻 Author

- **Vasa Shashank** — System Architecture, Optimization, Database Design & Full-Stack Development
- **Vignesh Hariharan** — System Architecture, Optimization, Database Design & Full-Stack Development
- **Venkata Saivijay Kuncham** — System Architecture, Optimization, Database Design & Full-Stack Development



## 📜 License
This project is developed for educational and research purposes as an advanced database engineering and curriculum optimization platform.
