"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Upload,
  Trash2,
  BookOpen,
  Calendar,
  Layers,
  GraduationCap,
  Sparkles,
  ExternalLink,
  Clock,
  MapPin,
  Users,
} from "lucide-react";
import { coursesAPI } from "@/lib/api";
import { useSession } from "@/lib/auth";
import type { Course } from "@/lib/types";

export default function CoursesPage() {
  const { user } = useSession();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Course | null>(null);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);

  useEffect(() => {
    coursesAPI.list().then(setCourses).catch(() => setCourses([]));
  }, []);

  // Extract distinct semesters
  const semesters = useMemo(() => {
    if (!courses) return [];
    const set = new Set(courses.map((c) => c.semester));
    return Array.from(set).sort();
  }, [courses]);

  // Group courses by semester
  const groupedCourses = useMemo(() => {
    if (!courses) return {};
    const filtered = selectedSemester === "all"
      ? courses
      : courses.filter((c) => c.semester === selectedSemester);

    const groups: Record<string, Course[]> = {};
    for (const c of filtered) {
      if (!groups[c.semester]) groups[c.semester] = [];
      groups[c.semester].push(c);
    }
    return groups;
  }, [courses, selectedSemester]);

  if (courses === null) return <div className="skeleton" style={{ height: 260 }} />;

  const isAdmin = user?.role === "admin";

  return (
    <div className="animate-fade-in" style={{ display: "grid", gap: 24, paddingBottom: 40 }}>
      {/* Header */}
      <header
        className="card"
        style={{
          padding: "22px 26px",
          background: "linear-gradient(135deg, rgba(37,99,235,0.05) 0%, rgba(30,58,138,0.02) 100%)",
          borderLeft: "4px solid var(--primary)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              <span>CSE Department · Autonomous Curriculum</span>
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0 }}>
              {isAdmin ? "Department Courses & Curriculum Allotments" : "My Assigned Courses & Workloads"}
            </h1>
            <p style={{ color: "var(--pencil)", margin: "4px 0 0", fontSize: "0.95rem" }}>
              {isAdmin
                ? "Institutional course allocations categorized by semester cohorts, curriculum structures, and faculty mappings."
                : "Your teaching workload organized semester-wise across different cohorts and sections."}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New Course
            </button>
            <Link href="/upload" className="btn btn-secondary">
              <Upload size={16} /> Import Syllabus
            </Link>
          </div>
        </div>

        {/* Semester Filter Tabs */}
        {semesters.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--rule)", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedSemester("all")}
              style={{
                padding: "6px 14px",
                fontSize: "0.825rem",
                fontWeight: 600,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--rule)",
                background: selectedSemester === "all" ? "var(--primary)" : "var(--canvas)",
                color: selectedSemester === "all" ? "#ffffff" : "var(--ink)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              All Semesters ({courses.length})
            </button>
            {semesters.map((sem) => {
              const count = courses.filter((c) => c.semester === sem).length;
              return (
                <button
                  key={sem}
                  type="button"
                  onClick={() => setSelectedSemester(sem)}
                  style={{
                    padding: "6px 14px",
                    fontSize: "0.825rem",
                    fontWeight: 600,
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--rule)",
                    background: selectedSemester === sem ? "var(--primary)" : "var(--canvas)",
                    color: selectedSemester === sem ? "#ffffff" : "var(--ink)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {sem} ({count})
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Courses Display Grouped by Semester */}
      {courses.length === 0 ? (
        <div className="card" style={{ padding: 40, maxWidth: 540, margin: "20px auto", textAlign: "center" }}>
          <BookOpen size={36} color="var(--pencil)" style={{ margin: "0 auto 12px" }} />
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 8px" }}>No courses found</h2>
          <p style={{ color: "var(--pencil)", fontSize: "0.9rem", margin: "0 0 20px" }}>
            You haven&apos;t created or been assigned any courses yet. Create a course or import a syllabus to begin.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Create Course
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 28 }}>
          {Object.entries(groupedCourses).map(([semesterName, semCourses]) => (
            <section key={semesterName} style={{ display: "grid", gap: 14 }}>
              {/* Semester Group Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid var(--rule)", paddingBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      background: "var(--primary)",
                      color: "#ffffff",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      padding: "3px 8px",
                      borderRadius: 4,
                    }}
                  >
                    SEMESTER
                  </span>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                    {semesterName}
                  </h2>
                </div>
                <span style={{ fontSize: "0.85rem", color: "var(--pencil)", fontWeight: 600 }}>
                  {semCourses.length} {semCourses.length === 1 ? "Course" : "Courses"} &middot; {semCourses.reduce((acc, c) => acc + c.total_classes, 0)} Total Periods
                </span>
              </div>

              {/* Course Cards for this Semester */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
                {semCourses.map((c) => (
                  <div
                    key={c.id}
                    className="card"
                    style={{
                      padding: 20,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "box-shadow 0.15s ease",
                    }}
                  >
                    <div>
                      {/* Top Badges */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 800,
                            padding: "2px 8px",
                            background: "rgba(37,99,235,0.08)",
                            color: "var(--primary)",
                            borderRadius: 4,
                          }}
                        >
                          {c.code}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {c.units_count === 0 ? (
                            <span className="badge badge-warning" style={{ fontSize: "0.75rem" }}>
                              Needs Syllabus
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--pencil)", fontWeight: 600 }}>
                              {c.units_count} Units &middot; {c.topics_count} Topics
                            </span>
                          )}

                          {(c.my_role === "owner" || c.my_role === "admin" || isAdmin) && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: "4px 6px", color: "var(--redpen)", cursor: "pointer" }}
                              onClick={() => setCourseToDelete(c)}
                              title={`Delete ${c.code}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Course Title */}
                      <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 6px" }}>
                        <Link href={`/courses/${c.id}`} style={{ color: "var(--ink)", textDecoration: "none" }}>
                          {c.title}
                        </Link>
                      </h3>

                      {/* Faculty & Section Info */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: "0.825rem", color: "var(--pencil)", margin: "8px 0" }}>
                        {c.teacher_name && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: "var(--ink)" }}>
                            <Users size={14} color="var(--primary)" /> {c.teacher_name}
                          </span>
                        )}
                        <span>&bull;</span>
                        <span>{c.section_name || "Section A"}</span>
                        <span>&bull;</span>
                        <span>{c.total_classes} periods ({c.period_duration}m)</span>
                      </div>
                    </div>

                    {/* Bottom Action Links */}
                    <div style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
                      <Link
                        href={`/courses/${c.id}`}
                        className="btn btn-primary"
                        style={{ flex: 1, fontSize: "0.8rem", justifyContent: "center" }}
                      >
                        Open Course
                      </Link>
                      <Link
                        href={`/curriculum?course=${c.id}`}
                        className="btn btn-secondary"
                        style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                        title="View Curriculum Graph"
                      >
                        Graph
                      </Link>
                      <Link
                        href={`/optimization?course=${c.id}`}
                        className="btn btn-ghost"
                        style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                        title="View Time Plan"
                      >
                        Time Plan
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {courseToDelete && (
        <DeleteCourseDialog
          course={courseToDelete}
          onClose={() => setCourseToDelete(null)}
          onDeleted={() => {
            setCourses((prev) => (prev ? prev.filter((item) => item.id !== courseToDelete.id) : []));
            setCourseToDelete(null);
          }}
        />
      )}

      {creating && (
        <NewCourseDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCourses((prev) => [...(prev || []), c]);
            setCreating(false);
            setCreated(c);
          }}
        />
      )}

      {created && (
        <div className="modal-backdrop" onClick={() => setCreated(null)}>
          <div
            className="modal-box card"
            style={{ maxWidth: 480, padding: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "1.3rem", margin: "0 0 8px", fontWeight: 700 }}>
              {created.code} is ready.
            </h2>
            <p style={{ color: "var(--pencil)", margin: "0 0 20px", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Import its syllabus next: OptiTeach reads the units, topics and course outcomes, and you can inspect and approve them before saving.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Link href={`/upload?courseId=${created.id}`} className="btn btn-primary">
                <Upload size={16} /> Import Syllabus
              </Link>
              <Link href={`/courses/${created.id}`} className="btn btn-secondary">
                Open Course
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewCourseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Course) => void }) {
  const [form, setForm] = useState({
    code: "",
    title: "",
    semester: "5th Sem",
    academic_year: "2024-2025",
    total_classes: 45,
    period_duration: 60,
    section_name: "Section A",
    student_count: 60,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof typeof form, numeric = false) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [field]: numeric ? Number(e.target.value) : e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await coursesAPI.create(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the course");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box card" style={{ maxWidth: 500, padding: 26 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 6px", fontSize: "1.25rem", fontWeight: 700 }}>New Course</h2>
        <p style={{ color: "var(--pencil)", margin: "0 0 16px", fontSize: "0.85rem" }}>
          Set up a new semester course offering and map the default section.
        </p>

        {error && (
          <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.1)", color: "var(--redpen)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", marginBottom: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>Course Code</label>
              <input className="input" placeholder="e.g. CS302" value={form.code} onChange={set("code")} required />
            </div>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>Course Title</label>
              <input className="input" placeholder="e.g. Database Management Systems" value={form.title} onChange={set("title")} required />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>Semester</label>
              <select className="select" value={form.semester} onChange={set("semester")}>
                <option value="3rd Sem">3rd Sem</option>
                <option value="4th Sem">4th Sem</option>
                <option value="5th Sem">5th Sem</option>
                <option value="6th Sem">6th Sem</option>
                <option value="7th Sem">7th Sem</option>
                <option value="8th Sem">8th Sem</option>
              </select>
            </div>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>Section</label>
              <input className="input" placeholder="e.g. Section A" value={form.section_name} onChange={set("section_name")} required />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>Total Periods</label>
              <input className="input" type="number" min={15} max={90} value={form.total_classes} onChange={set("total_classes", true)} required />
            </div>
            <div>
              <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>Enrolled Students</label>
              <input className="input" type="number" min={1} max={120} value={form.student_count} onChange={set("student_count", true)} required />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Creating..." : "Create Course"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteCourseDialog({ course, onClose, onDeleted }: { course: Course; onClose: () => void; onDeleted: () => void }) {
  const [confirmInput, setConfirmInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmInput.trim().toUpperCase() !== course.code.toUpperCase()) {
      setError(`Type "${course.code}" exactly to confirm deletion.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await coursesAPI.delete(course.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete course");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box card" style={{ maxWidth: 440, padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 700, color: "var(--redpen)" }}>
          Delete {course.code}?
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--pencil)", lineHeight: 1.5 }}>
          This will permanently delete <strong>{course.title}</strong>, including its curriculum units, concepts, lesson plans, student enrollments, and test results.
        </p>

        {error && (
          <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.1)", color: "var(--redpen)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", marginBottom: 12 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleDelete} style={{ display: "grid", gap: 12 }}>
          <div>
            <label className="label" style={{ fontSize: "0.8rem", marginBottom: 4 }}>
              To confirm, type <strong style={{ color: "var(--ink)" }}>{course.code}</strong> below:
            </label>
            <input
              type="text"
              className="input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={course.code}
              autoFocus
              required
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn" style={{ background: "var(--redpen)", color: "#ffffff", border: "none" }} disabled={busy}>
              {busy ? "Deleting..." : "Permanently Delete"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
