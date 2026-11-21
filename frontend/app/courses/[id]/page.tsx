"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, Trash2, AlertCircle } from "lucide-react";
import { coursesAPI } from "@/lib/api";
import CurriculumGraphView from "@/components/curriculum-graph-view";
import AssessmentResults from "@/components/assessment-results";
import CoursePeople from "@/components/course-people";
import CourseStudents from "@/components/course-students";
import InstitutionalOperations from "@/components/institutional-operations";
import type { Course, CurriculumGraph, CourseAnalytics, AssessmentItem } from "@/lib/types";

type Tab = "overview" | "map" | "students" | "results" | "progress" | "institutional";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "map", label: "Topic map" },
  { key: "students", label: "Students & CIE" },
  { key: "results", label: "Test results" },
  { key: "progress", label: "Progress" },
  { key: "institutional", label: "Academic Operations" },
];

const fmt = (n: number) => Math.round(n).toLocaleString();

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [graph, setGraph] = useState<CurriculumGraph | null>(null);
  const [analytics, setAnalytics] = useState<CourseAnalytics | null>(null);
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("tab") as Tab) : null;
    if (t && TABS.some((x) => x.key === t)) {
      setActiveTab(t);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [c, g, a, assess] = await Promise.all([
          coursesAPI.get(courseId),
          coursesAPI.getGraph(courseId).catch(() => null),
          coursesAPI.getAnalytics(courseId).catch(() => null),
          coursesAPI.listAssessments(courseId).catch(() => []),
        ]);
        setCourse(c);
        setGraph(g);
        setAnalytics(a);
        setAssessments(assess);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [courseId]);

  // New results change weakness flags, priorities and alerts: reload what depends on them
  const refreshAfterResults = async () => {
    const [assess, g, a] = await Promise.all([
      coursesAPI.listAssessments(courseId).catch(() => assessments),
      coursesAPI.getGraph(courseId).catch(() => graph),
      coursesAPI.getAnalytics(courseId).catch(() => analytics),
    ]);
    setAssessments(assess);
    setGraph(g);
    setAnalytics(a);
  };

  if (loading) return <div className="skeleton" style={{ height: 360 }} />;
  if (!course) {
    return (
      <p>
        This course doesn&apos;t exist, or it hasn&apos;t been shared with you. <Link href="/courses">Back to courses</Link>
      </p>
    );
  }

  const canEdit = course.my_role !== "viewer";

  return (
    <div className="animate-fade-in">
      <header className="page-header">
        <div>
          <p style={{ color: "var(--pencil)", marginTop: 0 }}>
            <Link href="/courses">Courses</Link> / {course.code}, {course.semester}
          </p>
          <h1>{course.title}</h1>
          <p>
            {course.teacher_name ? `${course.teacher_name}. ` : ""}
            {course.total_classes} periods of {course.period_duration === 60 ? "1 hour" : `${course.period_duration} minutes`}, {fmt(course.total_available_minutes)} minutes ({Math.round(course.total_available_minutes / 60)} hrs) in all.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {course.units_count > 0 && (
            <>
              <Link href={`/optimization?course=${course.id}`} className="btn btn-secondary">Time plan</Link>
              <Link href={`/lesson-plans?course=${course.id}`} className="btn btn-primary">Lesson plans</Link>
            </>
          )}
          {(course.my_role === "owner" || course.my_role === "admin") && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                color: "var(--redpen)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
              onClick={() => setDeleting(true)}
              title="Delete this course"
            >
              <Trash2 size={16} /> Delete course
            </button>
          )}
        </div>
      </header>

      {deleting && (
        <DeleteCourseDialog
          course={course}
          onClose={() => setDeleting(false)}
          onDeleted={() => router.push("/courses")}
        />
      )}

      {!canEdit && (
        <p role="note" style={{ padding: "10px 14px", marginBottom: 16, background: "var(--caution-wash)", borderLeft: "4px solid var(--caution)", borderRadius: "var(--radius-sm)" }}>
          This course is shared with you to view. You can look at everything, but only the owner or a co-teacher can change it.
        </p>
      )}

      <div className="tab-list" role="tablist" style={{ marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={`tab ${activeTab === t.key ? "active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="animate-fade-in" key={activeTab} role="tabpanel">
        {activeTab === "overview" && <OverviewTab course={course} analytics={analytics} graph={graph} canEdit={canEdit} />}
        {activeTab === "map" && (
          graph && graph.nodes.length > 0
            ? <CurriculumGraphView graph={graph} />
            : <NoSyllabus course={course} canEdit={canEdit} />
        )}
        {activeTab === "students" && (
          <CourseStudents
            courseId={courseId}
            assessments={assessments}
            onUpdated={refreshAfterResults}
          />
        )}
        {activeTab === "results" && (
          <AssessmentResults
            courseId={courseId}
            assessments={assessments}
            concepts={graph?.nodes ?? []}
            onRecorded={refreshAfterResults}
          />
        )}
        {activeTab === "progress" && <ProgressTab analytics={analytics} />}
        {activeTab === "institutional" && (
          <InstitutionalOperations
            courseId={courseId}
            courseCode={course.code}
            courseTitle={course.title}
            semester={course.semester}
            onRefreshCourse={refreshAfterResults}
          />
        )}
      </div>
    </div>
  );
}

function NoSyllabus({ course, canEdit }: { course: Course; canEdit: boolean }) {
  return (
    <section className="card" style={{ padding: 24, maxWidth: 620 }}>
      <h2 style={{ fontSize: "1.15rem" }}>This course has no syllabus yet</h2>
      <p style={{ color: "var(--pencil)", margin: "6px 0 16px" }}>
        Import the syllabus to add its units, topics and course outcomes. The time plan, lesson plans and topic map
        are all built from it.
      </p>
      {canEdit && (
        <Link href={`/upload?courseId=${course.id}`} className="btn btn-primary">
          <Upload size={16} /> Import syllabus
        </Link>
      )}
    </section>
  );
}

function OverviewTab({ course, analytics, graph, canEdit }: {
  course: Course; analytics: CourseAnalytics | null; graph: CurriculumGraph | null; canEdit: boolean;
}) {
  if (course.units_count === 0) return <NoSyllabus course={course} canEdit={canEdit} />;

  const struggling = graph ? graph.nodes.filter((n) => graph.bottlenecks.includes(n.id)) : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
      <section className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>What&apos;s in the course</h2>
        <dl className="facts">
          <dt>Units</dt><dd>{course.units_count}</dd>
          <dt>Topics</dt><dd>{course.topics_count}</dd>
          <dt>Concepts</dt><dd>{course.concepts_count}</dd>
          <dt>Section</dt><dd>{course.section_name || "A"}</dd>
        </dl>
        {canEdit && (
          <p style={{ marginTop: 14 }}>
            <Link href={`/curriculum?course=${course.id}`}>Edit units, topics and prerequisites</Link>
          </p>
        )}
      </section>

      {analytics && (
        <section className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>How far along</h2>
          <p style={{ fontSize: "1.05rem" }}>
            <strong>{analytics.completed_sessions} of {analytics.total_sessions} periods taught</strong>{" "}
            <span style={{ color: "var(--pencil)" }}>({analytics.progress_percentage}%)</span>
          </p>
          <div className="progress-bar" style={{ marginTop: 12 }} aria-hidden>
            <div className="progress-bar-fill" style={{ width: `${analytics.progress_percentage}%` }} />
          </div>
          <p style={{ color: "var(--pencil)", marginTop: 10 }}>
            {fmt(analytics.remaining_minutes)} teaching minutes left this semester.
          </p>
        </section>
      )}

      {struggling.length > 0 && (
        <section className="card" style={{ padding: 22, gridColumn: "1 / -1" }}>
          <h2 style={{ fontSize: "1.05rem" }}>Concepts holding the class back</h2>
          <p style={{ color: "var(--pencil)", margin: "4px 0 12px" }}>
            Students scored low on these, and later concepts depend on them. The next lesson plans add revision for them.
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
            {struggling.map((n) => (
              <li key={n.id}>
                <strong>{n.name}</strong>: class average {n.avg_score}%, {n.downstream_count} later concept{n.downstream_count === 1 ? "" : "s"} depend on it
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProgressTab({ analytics }: { analytics: CourseAnalytics | null }) {
  if (!analytics) return <p>Progress appears here once you record the first class.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <p style={{ fontSize: "1.05rem" }}>
        <strong>{analytics.progress_percentage}% of the course taught.</strong>{" "}
        {fmt(analytics.actual_minutes_taught)} minutes taught so far, {fmt(analytics.remaining_minutes)} left.
      </p>

      {analytics.alerts.length > 0 && (
        <section>
          <h2 style={{ fontSize: "1.05rem", marginBottom: 10 }}>Things to look at</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {analytics.alerts.map((alert) => (
              <li
                key={alert.id}
                className="note-item"
                style={{ borderLeftColor: ALERT_COLOR[alert.severity] || "var(--ink)" }}
              >
                <strong>{alert.title}</strong>
                <p style={{ color: "var(--pencil)", margin: "2px 0 0" }}>{alert.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {analytics.teaching_method_effectiveness.length > 0 && (
        <section className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--rule)" }}>
            <h2 style={{ fontSize: "1.05rem" }}>Which teaching methods worked</h2>
            <p style={{ color: "var(--pencil)", marginTop: 2 }}>
              Average quiz score before and after classes taught each way. The lesson plans favour methods with bigger improvements.
            </p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  <th scope="col">Used for</th>
                  <th scope="col" style={{ textAlign: "right" }}>Before</th>
                  <th scope="col" style={{ textAlign: "right" }}>After</th>
                  <th scope="col" style={{ textAlign: "right" }}>Improvement</th>
                  <th scope="col" style={{ textAlign: "right" }}>Classes</th>
                </tr>
              </thead>
              <tbody>
                {analytics.teaching_method_effectiveness.map((m, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{m.method_name}</td>
                    <td>{CONCEPT_KIND[m.concept_type] || m.concept_type}</td>
                    <td style={{ textAlign: "right" }}>{m.baseline_score}%</td>
                    <td style={{ textAlign: "right" }}>{m.post_score}%</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: m.observed_gain >= 0 ? "var(--tick)" : "var(--redpen)" }}>
                      {m.observed_gain >= 0 ? "+" : ""}{m.observed_gain} points
                    </td>
                    <td style={{ textAlign: "right" }}>{m.sessions_tracked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

const ALERT_COLOR: Record<string, string> = {
  danger: "var(--redpen)",
  warning: "var(--caution)",
  success: "var(--tick)",
  info: "var(--ink)",
};

const CONCEPT_KIND: Record<string, string> = {
  conceptual: "Ideas to understand",
  procedural: "Procedures",
  problem_solving: "Problem solving",
  analytical: "Analysis",
  practical: "Hands-on practice",
  revision: "Revision",
};

function DeleteCourseDialog({
  course,
  onClose,
  onDeleted,
}: {
  course: Course;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await coursesAPI.delete(course.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete course");
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-course-title"
        style={{ maxWidth: 460, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--redpen)", marginBottom: 12 }}>
          <AlertCircle size={22} />
          <h2 id="delete-course-title" style={{ fontSize: "1.25rem", margin: 0, color: "inherit" }}>
            Delete {course.code}?
          </h2>
        </div>
        <p style={{ color: "var(--pencil)", margin: "0 0 16px" }}>
          Are you sure you want to permanently delete <strong>{course.title}</strong>? All associated units, topics, lesson plans, sessions, and analytics will be permanently removed. This action cannot be undone.
        </p>
        {error && (
          <p role="alert" style={{ color: "var(--redpen)", fontWeight: 600, marginBottom: 16 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: "var(--redpen)", color: "#ffffff", border: "none" }}
            onClick={confirmDelete}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Yes, delete course"}
          </button>
        </div>
      </div>
    </div>
  );
}

