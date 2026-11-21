# OptiTeach API reference

Generated from the application's OpenAPI schema (`app.openapi()`); the interactive version with
request/response schemas is served at `http://localhost:8000/docs`.

* **Base URL:** `http://localhost:8000`
* **Authentication:** `POST /api/auth/login` with JSON `{"email", "password"}` returns `access_token`;
  send it as `Authorization: Bearer <token>`. Every route below needs it except the four marked *public*.
* **Authorization:** routes under `/api/courses/{course_id}` return **404** for courses the caller neither owns
  nor has been given access to (admins see all). Viewers of a shared course get **403** on every write.
  Nested IDs (assessment, topic, session) must belong to that course.
* **Errors:** `400` bad reference/input, `401` missing/invalid token, `403` role required, `404` not found or not
  yours, `409` concurrency conflict (stale lesson-plan version, class already recorded), `413`/`415` upload limits,
  `422` validation, `429` too many failed logins or uploads.


## Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login *(public)* |
| `GET` | `/api/auth/me` | Get Profile |
| `POST` | `/api/auth/register` | Register *(public)* |

## Courses & Optimization

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/courses` | Courses the user owns, then courses shared with them (co-teacher or viewer). |
| `POST` | `/api/courses` | Create Course |
| `GET` | `/api/courses/{course_id}` | Get Course |
| `GET` | `/api/courses/{course_id}/analytics` | Get Analytics |
| `GET` | `/api/courses/{course_id}/assessments` | List Assessments |
| `POST` | `/api/courses/{course_id}/assessments` | Create Assessment |
| `POST` | `/api/courses/{course_id}/assessments/{assessment_id}/results` | Record Assessment Results |
| `POST` | `/api/courses/{course_id}/curriculum/confirm` | Confirm Curriculum |
| `GET` | `/api/courses/{course_id}/graph` | Get Curriculum Graph |
| `GET` | `/api/courses/{course_id}/graph/diff` | Diff Graph Versions |
| `GET` | `/api/courses/{course_id}/graph/versions` | Curriculum graph snapshots stored in MongoDB, newest first. |
| `GET` | `/api/courses/{course_id}/lesson-plans` | List Course Lesson Plans |
| `POST` | `/api/courses/{course_id}/lesson-plans/generate` | Generate Lesson Plan |
| `PATCH` | `/api/courses/{course_id}/lesson-plans/{session_number}` | Accept / edit / reject a recommended plan. Stale expected_version -> 409. |
| `GET` | `/api/courses/{course_id}/lesson-plans/{session_number}/diff` | Lesson Plan Diff |
| `GET` | `/api/courses/{course_id}/lesson-plans/{session_number}/history` | Every saved version of the plan (MongoDB), newest first, with who changed it. |
| `GET` | `/api/courses/{course_id}/optimization` | Get Course Optimization |
| `POST` | `/api/courses/{course_id}/optimize` | Run Course Optimization |
| `POST` | `/api/courses/{course_id}/optimize-next-class` | Optimize Next Class |
| `GET` | `/api/courses/{course_id}/sessions` | List Sessions |
| `POST` | `/api/courses/{course_id}/sessions/{session_number}/log` | Record a taught class. A second record for the same session -> 409. |
| `POST` | `/api/courses/{course_id}/syllabus` | Upload Course Syllabus |

## Syllabus Extraction

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/syllabus/upload` | Upload Syllabus |

## DBMS Insights & Academic Showcase

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dbms/consistency` | Compare PostgreSQL pointers with MongoDB documents. Without course_id: all courses (admin). |
| `POST` | `/api/dbms/consistency/repair` | Repair Cross Store Consistency |
| `POST` | `/api/dbms/console` | Ad-hoc read-only SQL, executed as optiteach_readonly under row-level security. |
| `GET` | `/api/dbms/er-diagram` | Mermaid erDiagram generated from the live schema. |
| `GET` | `/api/dbms/nosql/aggregations` | List Nosql Aggregations |
| `POST` | `/api/dbms/nosql/aggregations/{aggregation_id}/execute` | Run Nosql Aggregation |
| `GET` | `/api/dbms/objects` | Views, routines, triggers, RLS policies, indexes and roles from the system catalogs. |
| `GET` | `/api/dbms/queries` | List Demo Queries |
| `POST` | `/api/dbms/queries/{query_id}/execute` | Execute Query |
| `POST` | `/api/dbms/queries/{query_id}/explain` | EXPLAIN (ANALYZE, BUFFERS) of a demo query: the executed plan, timings and index use. |
| `GET` | `/api/dbms/schema` | Get Relational Schema |
| `GET` | `/api/dbms/status` | Get Db Status |
| `GET` | `/api/dbms/transaction-lab` | List Transaction Scenarios |
| `POST` | `/api/dbms/transaction-lab/{scenario}` | Runs interleaved transactions on the txn_lab_accounts scratch table and returns the timeline. |

## Exports & Compliance

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/exports/courses/{course_id}/calendar.ics` | Export course schedule as iCalendar (.ics) format |
| `GET` | `/api/exports/courses/{course_id}/outcomes-matrix` | Export NBA/ABET Course Outcome Attainment Matrix |
| `GET` | `/api/exports/courses/{course_id}/nba-course-file` | **1-Click NBA / Autonomous Course File (SAR)**: Printable audit dossier (HTML/PDF) |
| `GET` | `/api/exports/lesson-plans/{session_id}/printable` | Export formatted printable HTML lesson plan (saveable as PDF) |

## Institutional Operations & Regulatory Compliance (RVCE / VTU)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/courses/{course_id}/lost-class` | Report a lost class (fest/holiday/leave) with Saturday zero-hour compensation or dynamic MILP rebalancing |
| `GET` | `/api/courses/{course_id}/lost-classes` | View history of reported lost classes and scheduled Saturday compensatory sessions |
| `POST` | `/api/courses/{course_id}/assign-proxy` | Assign a substitute faculty for On-Duty (OD) periods (valuation, conference, leave) |
| `GET` | `/api/courses/{course_id}/proxy-handover/{session_id}` | Generate the **1-Click Proxy Handover Kit** with delivery phases, whiteboard problems, and exit checks |
| `GET` | `/api/courses/{course_id}/lab-sync` | Check Theory vs. Lab Batch Synchronization for Batches A1 & A2 with precedence guard alerts |
| `GET` | `/api/courses/{course_id}/differentiated-learners` | **AICTE Criterion 2.2**: Classify Slow Learners (<40%) with remedial tutorials vs. Advanced Learners (>80%) |
| `POST` | `/api/courses/{course_id}/topics/{topic_id}/record-progress` | Log topic completion with actual periods spent and detect syllabus pace drift |
| `GET` | `/api/courses/{course_id}/syllabus-drift` | Real-time syllabus pace drift analysis: lagging, on-schedule, or ahead |
| `GET` | `/api/courses/{course_id}/attendance-analysis` | **VTU Clauses 8.1 & 8.2**: Evaluate Safe Zone (>=85%), Condonation Zone (75-84.9%), and detention risk |

## Admin & Department Governance

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/overview` | Department overview: total courses, teachers, enrolled students, at-risk count |
| `GET` | `/api/admin/mappings` | List all course-to-teacher mappings with semester filtering |
| `PUT` | `/api/admin/mappings/{course_id}` | Re-assign faculty or change section for a course |
| `GET` | `/api/admin/teachers` | Department faculty roster with course workloads and pending assignments |
| `POST` | `/api/admin/teachers` | Admin manually provisions a new department teacher |
| `POST` | `/api/admin/courses` | Admin provisions a course and maps it to a teacher and section |
| `GET` | `/api/admin/students` | Filter students by semester, section, and course with CIE marks |
| `POST` | `/api/admin/students` | Admin creates a student manually with automatic semester course enrollment |
| `POST` | `/api/admin/simulate-rvce-data` | Seed realistic RVCE student cohort (60 students per section) with CIE marks |

## Course Students & Continuous Evaluation

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/courses/{course_id}/students` | Roster of enrolled students in a course with attendance and individual CIE test scores |
| `POST` | `/api/courses/{course_id}/students/record-result` | Faculty records/updates test marks (CIE-I, CIE-II, Quizzes) with feedback |
| `GET` | `/api/courses/{course_id}/attainment` | NBA Outcome-Based Education (OBE) Course Outcome attainment vs 60% benchmark |

## Teaching Methods

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/teaching-methods` | Global method catalog (not course-specific), used when recording a taught class. |

## Curriculum Builder

| Method | Path | Description |
|---|---|---|
| `PATCH` | `/api/courses/{course_id}/concepts/{concept_id}` | Change difficulty / importance / type; returns the topic's time allocation before and after. |
| `GET` | `/api/courses/{course_id}/curriculum` | Units, their topics in teaching order, concepts and prerequisite links. |
| `PUT` | `/api/courses/{course_id}/curriculum/layout` | Save topic order (and moves between units) in one transaction. |
| `DELETE` | `/api/courses/{course_id}/prerequisites` | Remove Prerequisite |
| `POST` | `/api/courses/{course_id}/prerequisites` | Add a prerequisite link. A link that would create a loop is refused with 409. |

## Co-teaching

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/courses/{course_id}/members` | Who has access to the course: the owner, co-teachers and viewers. |
| `PUT` | `/api/courses/{course_id}/members` | Share the course with another teacher by email, or change their role. Owner only. |
| `DELETE` | `/api/courses/{course_id}/members/{teacher_id}` | Remove Member |

## Service

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Root *(public)* |
| `GET` | `/health` | Healthcheck *(public)* |
