# OptiTeach Frontend Web Application

The OptiTeach frontend is a Next.js 15 (App Router) client application engineered for university faculty, academic directors, and evaluators. It delivers an interface for curriculum engineering, operations-research time optimization, class presentation, and live database systems demonstration.

---

## 🚀 Key Application Modules

### 1. Curriculum Time Optimization (`/optimization`)
- **Realistic Duration Assigner**: Renders realistic suggested topic durations derived from concept typologies, cognitive difficulty, and Bloom's taxonomy depth.
- **Fair Proportional Allocation**: Shows discrete period allocations (`X out of Y min (suggested)`) with integer multiples of 60 minutes.
- **Teacher-Controllable Reserves**: Interactive controls for adjusting the revision percentage and assessment checkpoint percentage in real time.
- **Fair Sharing Guarantee**: Visual confirmation that topic compression is distributed equitably across the curriculum without single-topic starvation.

### 2. Syllabus Upload & Parsing (`/upload`)
- Drag-and-drop syllabus ingest supporting PDF and raw text.
- Connects to the deterministic NLP parser to extract units, topics, atomic concepts, and course outcomes.
- Faculty confirmation workflow: review, edit, and approve before committing to the relational schema.

### 3. Curriculum Graph & Prerequisite Explorer (`/curriculum`)
- Interactive dependency graph showing concept DAGs and cognitive bottleneck detection.
- Highlights prerequisite concepts where historical assessment marks require targeted revision.

### 4. Lesson Planning & Presenter Mode (`/lesson-plans`, `/present`)
- **Lesson Planner**: Generates structured 60-minute class session plans (warmup, explanation, worked examples, guided practice, quick check).
- **Classroom Presenter**: High-contrast, presentation-optimized classroom display featuring a live countdown timer, concept prompts, and formative assessment pulse checks.

### 5. DBMS Academic Showcase (`/dbms`)
- **9 Live Interactive Tabs**:
  1. **ER Model**: Live Mermaid ER diagram generated directly from relational foreign keys.
  2. **Schema & Constraints**: Primary, foreign, unique, and check constraint catalog.
  3. **Advanced SQL**: 19 live SQL queries with `EXPLAIN ANALYZE` execution plans.
  4. **Database Objects**: Stored procedures, triggers, views, and materialized views.
  5. **Transaction Lab**: Interactive ACID transaction simulations with concurrency rollback.
  6. **Security & RLS**: Row-Level Security verification across faculty accounts.
  7. **NoSQL MongoDB**: Lesson plan draft versioning, schema validation, and TTL indices.
  8. **Cross-Store**: Referential integrity checks across PostgreSQL and MongoDB.
  9. **Interactive Console**: Read-only, sandboxed SQL query terminal.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 15.2.x (React 19, TypeScript)
- **Styling**: Vanilla CSS tokens & Tailwind CSS utilities
- **Icons**: Lucide React
- **Diagrams**: Mermaid.js for live schema and DAG visualization
- **State & Data Fetching**: Native Fetch API with typed responses and revalidation

---

## 🏃 Getting Started Locally

```bash
# 1. Install dependencies
npm install

# 2. Run the development server
npm run dev

# 3. Type check & lint
npx tsc --noEmit
npm run lint
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Default demo credentials:
- **Faculty**: `faculty@optiteach.edu` / `admin123`
- **Admin**: `admin@optiteach.edu` / `admin123`
