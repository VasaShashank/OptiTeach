"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Sliders, RotateCcw, Clock, Sparkles } from "lucide-react";
import { coursesAPI } from "@/lib/api";
import PeriodStrip from "@/components/period-strip";
import type { Course, CourseOptimization, NextClassPlan, TopicAllocation } from "@/lib/types";

const fmt = (n: number) => Math.round(n).toLocaleString();

export default function TimePlanPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [plan, setPlan] = useState<CourseOptimization | null>(null);
  const [nextClass, setNextClass] = useState<NextClassPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Teacher-controllable revision and assessment percentages
  const [revisionPercent, setRevisionPercent] = useState<number>(10);
  const [assessmentPercent, setAssessmentPercent] = useState<number>(8);
  const [customNextClassRevMinutes, setCustomNextClassRevMinutes] = useState<number | undefined>(undefined);

  const syncPercentsFromPlan = (p: CourseOptimization) => {
    if (typeof p.formula_explanation?.revision_percent === "number") {
      setRevisionPercent(p.formula_explanation.revision_percent as number);
    }
    if (typeof p.formula_explanation?.assessment_percent === "number") {
      setAssessmentPercent(p.formula_explanation.assessment_percent as number);
    }
  };

  useEffect(() => {
    coursesAPI.list().then((c) => {
      setCourses(c);
      const wanted = new URLSearchParams(window.location.search).get("course");
      const start = c.find((x) => x.id === wanted) || c[0];
      if (start) {
        setSelectedCourse(start.id);
        return coursesAPI.getOptimization(start.id).then((p) => {
          setPlan(p);
          syncPercentsFromPlan(p);
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const changeCourse = async (courseId: string) => {
    setSelectedCourse(courseId);
    setPlan(null);
    setNextClass(null);
    setError(null);
    try {
      const p = await coursesAPI.getOptimization(courseId);
      setPlan(p);
      syncPercentsFromPlan(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The time plan couldn't be loaded");
    }
  };

  const rebuild = async (revP?: number, assP?: number) => {
    if (!selectedCourse) return;
    setRebuilding(true);
    setError(null);
    try {
      const rP = revP !== undefined ? revP : revisionPercent;
      const aP = assP !== undefined ? assP : assessmentPercent;
      const updatedPlan = await coursesAPI.optimize(selectedCourse, {
        revision_percent: rP,
        assessment_percent: aP
      });
      setPlan(updatedPlan);
      syncPercentsFromPlan(updatedPlan);
      setNextClass(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The time plan couldn't be rebuilt");
    }
    setRebuilding(false);
  };

  const resetToDefaults = () => {
    setRevisionPercent(10);
    setAssessmentPercent(8);
    rebuild(10, 8);
  };

  const previewNextClass = async (overrideRevMinutes?: number) => {
    if (!selectedCourse) return;
    setPreviewing(true);
    setError(null);
    try {
      const revM = overrideRevMinutes !== undefined ? overrideRevMinutes : customNextClassRevMinutes;
      const nextPlan = await coursesAPI.optimizeNextClass(selectedCourse, undefined, revM);
      setNextClass(nextPlan);
      if (nextPlan.revision_needed) {
        setCustomNextClassRevMinutes(nextPlan.revision_minutes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The next class couldn't be planned");
    }
    setPreviewing(false);
  };

  if (loading) return <div className="skeleton" style={{ height: 320 }} />;

  const course = courses.find((c) => c.id === selectedCourse);
  const totalMins = plan?.total_available_minutes || (course ? course.total_classes * course.period_duration : 0);
  const pd = course?.period_duration || 60;

  const estimatedRevMinutes = Math.round((totalMins * (revisionPercent / 100)) / pd) * pd;
  const estimatedAssMinutes = Math.round((totalMins * (assessmentPercent / 100)) / pd) * pd;

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <h1>Time plan</h1>
          <p>
            Dynamically models semester hours across topics, targeted revision, and formal assessments using
            difficulty-aware integer optimization. Adjust parameters below to customize pedagogical divisions.
          </p>
        </div>
        {courses.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select
              aria-label="Course"
              value={selectedCourse}
              onChange={(e) => changeCourse(e.target.value)}
              className="input-select"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.code}: {c.title}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={() => rebuild()} disabled={rebuilding}>
              {rebuilding ? <><div className="spinner" /> Rebuilding…</> : <><RefreshCw size={16} /> Rebuild plan</>}
            </button>
          </div>
        )}
      </header>

      {error && <p role="alert" style={{ color: "var(--redpen)", fontWeight: 600, marginBottom: 16 }}>{error}</p>}

      {courses.length === 0 && (
        <p>
          There are no courses yet. <Link href="/courses">Create a course</Link> and import its syllabus first.
        </p>
      )}

      {plan && plan.topic_allocations.length === 0 && (
        <p>
          This course has no topics yet, so there is nothing to plan.{" "}
          <Link href={`/upload?courseId=${selectedCourse}`}>Import its syllabus</Link>.
        </p>
      )}

      {plan && plan.topic_allocations.length > 0 && (
        <>
          {/* Teacher Controllable Division Panel */}
          <section className="card" style={{ padding: "18px 22px", marginBottom: 20, background: "var(--surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sliders size={18} style={{ color: "var(--accent)" }} />
                <h2 style={{ fontSize: "1.05rem", margin: 0, fontWeight: 600 }}>Teacher Budget Division Controls</h2>
              </div>
              <button
                type="button"
                onClick={resetToDefaults}
                disabled={rebuilding}
                className="btn btn-ghost"
                style={{ fontSize: "0.85rem", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <RotateCcw size={14} /> Reset to Standard (10% Rev / 8% Tests)
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
              {/* Revision Percentage Slider */}
              <div style={{ padding: "12px 16px", borderRadius: "var(--radius-sm)", background: "var(--surface-sunk)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label htmlFor="revision-range" style={{ fontWeight: 600, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--highlighter)" }} />
                    Revision Reserve
                  </label>
                  <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--highlighter-ink)" }}>
                    {revisionPercent}% ({estimatedRevMinutes} min / {Math.round(estimatedRevMinutes / pd)} periods)
                  </span>
                </div>
                <input
                  id="revision-range"
                  type="range"
                  min="0"
                  max="25"
                  step="1"
                  value={revisionPercent}
                  onChange={(e) => setRevisionPercent(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--highlighter)", cursor: "pointer" }}
                />
                <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "var(--pencil)" }}>
                  Sets aside dynamic buffer periods for remediating weak prerequisites before topics begin.
                </p>
              </div>

              {/* Assessment Percentage Slider */}
              <div style={{ padding: "12px 16px", borderRadius: "var(--radius-sm)", background: "var(--surface-sunk)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label htmlFor="assessment-range" style={{ fontWeight: 600, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--caution)" }} />
                    Assessments & Exams
                  </label>
                  <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--caution)" }}>
                    {assessmentPercent}% ({estimatedAssMinutes} min / {Math.round(estimatedAssMinutes / pd)} periods)
                  </span>
                </div>
                <input
                  id="assessment-range"
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={assessmentPercent}
                  onChange={(e) => setAssessmentPercent(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--caution)", cursor: "pointer" }}
                />
                <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "var(--pencil)" }}>
                  Reserves discrete classroom checkpoints for midterms, quizzes, and practical exams.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => rebuild()}
                disabled={rebuilding}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {rebuilding ? <><div className="spinner" /> Re-optimizing…</> : <><Sparkles size={16} /> Apply & Re-allocate Teaching Minutes</>}
              </button>
            </div>
          </section>

          <Budget plan={plan} course={course} />

          <section className="card" style={{ overflow: "hidden", marginBottom: 28 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--rule)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2 style={{ fontSize: "1.1rem" }}>Curriculum Topics & Realistic Duration Allocation</h2>
                <p style={{ color: "var(--pencil)", marginTop: 2, fontSize: "0.88rem" }}>
                  Topic estimates are calculated from concept difficulties, Bloom taxonomy levels, and prerequisites instead of arbitrary constants.
                </p>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Unit</th>
                    <th scope="col">Topic</th>
                    <th scope="col" style={{ textAlign: "right" }}>Periods</th>
                    <th scope="col" style={{ textAlign: "right" }}>Minutes</th>
                    <th scope="col">Pedagogical Rationale & Weights</th>
                  </tr>
                </thead>
                <tbody>
                  {[...plan.topic_allocations].sort((a, b) => a.unit_number - b.unit_number).map((a) => <TopicRow key={a.topic_id} a={a} />)}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: "1.1rem" }}>Next class: In-period division</h2>
                <p style={{ color: "var(--pencil)", marginTop: 2 }}>
                  Dynamically balances active worked examples, lecture, student practice, and revision according to topic difficulty.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {nextClass?.revision_needed && (
                  <label style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 6, color: "var(--pencil)" }}>
                    Revision time:
                    <select
                      value={customNextClassRevMinutes ?? nextClass.revision_minutes}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setCustomNextClassRevMinutes(val);
                        previewNextClass(val);
                      }}
                      className="input-select"
                      style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                    >
                      <option value="5">5 min</option>
                      <option value="10">10 min</option>
                      <option value="15">15 min</option>
                      <option value="20">20 min</option>
                    </select>
                  </label>
                )}
                <button type="button" className="btn btn-primary" onClick={() => previewNextClass()} disabled={previewing}>
                  {previewing ? <><div className="spinner" /> Planning…</> : nextClass ? "Plan it again" : "Plan the next class"}
                </button>
              </div>
            </div>
            {nextClass && <NextClass plan={nextClass} onUpdateRevMinutes={(m) => previewNextClass(m)} />}
          </section>

          <details style={{ color: "var(--pencil)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>How this plan is mathematically optimized</summary>
            <div style={{ marginTop: 10, maxWidth: "75ch", display: "flex", flexDirection: "column", gap: 8 }}>
              <p>
                Each topic is evaluated using a pedagogical scoring engine integrating conceptual difficulty (1-5), Bloom taxonomy cognitive demand (Remember to Create), prerequisite bottleneck depth, assessment relevance, and recent class performance scores.
              </p>
              <p>
                Teacher-configured revision budget ({revisionPercent}%) and assessment budget ({assessmentPercent}%) are preserved first into discrete periods. The mixed-integer linear programming (MILP) solver then guarantees exact period integrality while distributing instructional minutes according to diminishing returns.
              </p>
              {plan.formula_explanation?.model && <p><strong>Optimization solver:</strong> {String(plan.formula_explanation.model)}</p>}
              {plan.formula_explanation?.invariant && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>{String(plan.formula_explanation.invariant)}</p>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function Budget({ plan, course }: { plan: CourseOptimization; course?: Course }) {
  const total = plan.total_available_minutes || 1;
  const parts = [
    { label: "Teaching topics", minutes: plan.total_allocated_minutes, color: "var(--ink)" },
    { label: "Revision", minutes: plan.revision_budget_minutes, color: "var(--highlighter)" },
    { label: "Tests & Checkpoints", minutes: plan.assessment_budget_minutes, color: "var(--caution)" },
    { label: "Buffer Spare", minutes: plan.unallocated_buffer_minutes, color: "var(--rule-strong)" },
  ];
  const used = plan.total_allocated_minutes + plan.revision_budget_minutes + plan.assessment_budget_minutes;
  const status =
    plan.time_pressure_status === "high_pressure"
      ? { text: `Over by ${fmt(used - total)} minutes. Reduce revision/tests, shorten topics, or add periods to course.`, color: "var(--redpen)" }
      : plan.time_pressure_status === "balanced"
        ? { text: `Tightly fitted: ${fmt(plan.unallocated_buffer_minutes)} minutes unallocated buffer.`, color: "var(--caution)" }
        : { text: `Feasible schedule with ${fmt(plan.unallocated_buffer_minutes)} minutes available buffer.`, color: "var(--tick)" };

  return (
    <section className="card" style={{ padding: 20, marginBottom: 24 }}>
      <p style={{ fontSize: "1.05rem" }}>
        {course ? `${course.total_classes} periods of ${course.period_duration} minutes gives ` : ""}
        <strong>{fmt(plan.total_available_minutes)} minutes</strong> this semester.{" "}
        <strong style={{ color: status.color }}>{status.text}</strong>
      </p>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${fmt(p.minutes)} minutes`).join(", ")}
        style={{ display: "flex", height: 18, borderRadius: "var(--radius-sm)", overflow: "hidden", margin: "14px 0 10px", background: "var(--surface-sunk)" }}
      >
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.minutes / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", gap: 20, flexWrap: "wrap" }}>
        {parts.map((p) => (
          <li key={p.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: p.color, flexShrink: 0 }} />
            {p.label} <strong>{fmt(p.minutes)} min</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopicRow({ a }: { a: TopicAllocation }) {
  const short = a.allocated_minutes < a.estimated_minutes;

  return (
    <tr>
      <td>{a.unit_number}</td>
      <td>
        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{a.topic_title}</div>
        {a.key_concepts && a.key_concepts.length > 0 && (
          <div style={{ fontSize: "0.8rem", color: "var(--pencil)", marginTop: 2 }}>
            {a.key_concepts.slice(0, 3).join(" • ")}{a.key_concepts.length > 3 ? "…" : ""}
          </div>
        )}
      </td>
      <td style={{ textAlign: "right" }}>
        <strong>{a.recommended_periods}</strong>
      </td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <strong style={{ color: short ? "var(--redpen)" : "var(--text-primary)" }}>
          {a.allocated_minutes}
        </strong>
        <span style={{ color: "var(--pencil)", fontSize: "0.88rem" }}>
          {" "}out of {a.estimated_minutes} min (suggested)
        </span>
      </td>
      <td style={{ color: "var(--pencil)", minWidth: 260, fontSize: "0.9rem" }}>{a.explanation}</td>
    </tr>
  );
}

function NextClass({ plan, onUpdateRevMinutes }: { plan: NextClassPlan; onUpdateRevMinutes?: (m: number) => void }) {
  return (
    <div className="card animate-fade-in" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <p style={{ color: "var(--pencil)", margin: 0 }}>
          Period {plan.session_number}, Unit {plan.unit_number} • Total: {plan.period_duration} minutes
        </p>
        <span style={{ fontSize: "0.85rem", color: "var(--pencil)", display: "flex", alignItems: "center", gap: 4 }}>
          <Clock size={14} /> Exact minute conservation satisfied
        </span>
      </div>

      <h3 style={{ fontSize: "1.25rem", margin: "6px 0 12px" }}>{plan.topic_title}</h3>

      {plan.revision_needed && plan.revision_concept && (
        <div style={{ padding: "12px 16px", background: "var(--caution-wash)", borderLeft: "4px solid var(--caution)", borderRadius: "var(--radius-sm)", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <strong>Prerequisite Remediation: Revise {plan.revision_concept} first ({plan.revision_minutes} min).</strong>
            <div style={{ fontSize: "0.86rem", color: "var(--pencil)", marginTop: 2 }}>
              {plan.revision_reason || "Students scored below mastery on prerequisite concepts."}
            </div>
          </div>
          {onUpdateRevMinutes && (
            <div style={{ display: "flex", gap: 6 }}>
              {[5, 10, 15, 20].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => onUpdateRevMinutes(mins)}
                  className={`btn ${plan.revision_minutes === mins ? "btn-primary" : "btn-secondary"}`}
                  style={{ padding: "3px 8px", fontSize: "0.78rem" }}
                >
                  {mins}m
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <PeriodStrip phases={plan.phases} />

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {plan.phases.map((p, i) => (
          <div key={i} style={{ padding: "10px 12px", background: "var(--surface-sunk)", borderRadius: "var(--radius-sm)", borderLeft: `3px solid ${p.phase_name === "Revision" ? "var(--highlighter)" : p.phase_name === "Explain" ? "var(--ink)" : "var(--accent)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "0.92rem" }}>{p.phase_name}</strong>
              <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--accent)" }}>{p.duration_minutes} min</span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", marginTop: 2, fontWeight: 500 }}>{p.method_name}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--pencil)", marginTop: 4 }}>{p.activity_description}</div>
          </div>
        ))}
      </div>

      {plan.why_explanation && (
        <p style={{ color: "var(--pencil)", marginTop: 16, fontSize: "0.9rem", borderTop: "1px solid var(--rule)", paddingTop: 10 }}>
          {plan.why_explanation}
        </p>
      )}

      {plan.target_concepts.length > 0 && (
        <p style={{ marginTop: 8, fontSize: "0.88rem" }}>
          <strong>Key Target Concepts:</strong> {plan.target_concepts.join(", ")}
        </p>
      )}
    </div>
  );
}
