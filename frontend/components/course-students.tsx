"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Award, CheckCircle2, Edit3, ShieldAlert, Sparkles, UserCheck, Users } from "lucide-react";
import { coursesAPI } from "@/lib/api";
import type { StudentItem, AttainmentReport, AssessmentItem } from "@/lib/types";

export default function CourseStudents({
  courseId,
  assessments,
  onUpdated,
}: {
  courseId: string;
  assessments: AssessmentItem[];
  onUpdated?: () => void;
}) {
  const [students, setStudents] = useState<StudentItem[] | null>(null);
  const [attainment, setAttainment] = useState<AttainmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingStudent, setEditingStudent] = useState<StudentItem | null>(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");
  const [inputMarks, setInputMarks] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const loadData = async () => {
    try {
      const [stList, att] = await Promise.all([
        coursesAPI.getStudents(courseId).catch(() => []),
        coursesAPI.getAttainment(courseId).catch(() => null),
      ]);
      setStudents(stList);
      setAttainment(att);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [courseId]);

  if (loading) return <div className="skeleton" style={{ height: 280 }} />;

  const completedAssessments = assessments.filter((a) => a.status === "completed" || a.performances?.length);
  const totalStudents = students?.length || 0;
  const avgAttendance = totalStudents
    ? Math.round(students!.reduce((acc, s) => acc + s.attendance_percentage, 0) / totalStudents)
    : 85;
  const atRiskCount = students?.filter((s) => s.is_at_risk).length || 0;

  const handleSaveMarks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !selectedAssessmentId || inputMarks === "") return;

    setSaving(true);
    setMessage(null);
    try {
      const assess = assessments.find((a) => a.id === selectedAssessmentId);
      const maxM = assess?.max_marks || 20.0;
      await coursesAPI.recordStudentResult(courseId, {
        student_id: editingStudent.id,
        assessment_id: selectedAssessmentId,
        marks_obtained: parseFloat(inputMarks),
        max_marks: maxM,
        feedback: feedback || undefined,
      });

      setMessage({ tone: "ok", text: `Recorded result for ${editingStudent.usn} (${editingStudent.full_name}).` });
      setEditingStudent(null);
      await loadData();
      if (onUpdated) onUpdated();
    } catch (err) {
      setMessage({ tone: "err", text: err instanceof Error ? err.message : "Failed to record student result." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Optimization Connection Banner */}
      <div
        className="card"
        style={{
          padding: 16,
          background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(16,185,129,0.06))",
          borderColor: "rgba(37,99,235,0.2)",
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <Sparkles size={22} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
          <strong>Pedagogical Optimization Feedback Loop:</strong>
          <span style={{ display: "block", color: "var(--pencil)", marginTop: 2 }}>
            OptiTeach connects real student test marks with the Mixed-Integer Linear Programming (MILP) curriculum time optimizer.
            When cohort test results in prerequisite concepts (such as <em>Functional Dependencies & Minimal Cover</em>) fall below
            the 60% RVCE OBE threshold, the engine automatically flags a cognitive drift and prioritizes remedial periods for downstream
            topics (<em>Relational Normalization</em>).
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--pencil)", fontSize: "0.85rem" }}>
            <Users size={16} /> Enrolled Students
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: 6 }}>{totalStudents}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 2 }}>RVCE CSE Cohort</div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--pencil)", fontSize: "0.85rem" }}>
            <UserCheck size={16} /> Average Attendance
          </div>
          <div
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              marginTop: 6,
              color: avgAttendance >= 85 ? "var(--greenpen)" : avgAttendance >= 75 ? "var(--amberpen)" : "var(--redpen)",
            }}
          >
            {avgAttendance}%
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 2 }}>VTU Requirement: &ge; 75%</div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--pencil)", fontSize: "0.85rem" }}>
            <ShieldAlert size={16} /> At-Risk Students
          </div>
          <div
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              marginTop: 6,
              color: atRiskCount > 0 ? "var(--redpen)" : "var(--greenpen)",
            }}
          >
            {atRiskCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 2 }}>Low CIE (&lt;20/50) or Attendance (&lt;75%)</div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--pencil)", fontSize: "0.85rem" }}>
            <Award size={16} /> Overall CIE Avg
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: 6, color: "var(--primary)" }}>
            {attainment ? `${attainment.overall_average_percentage}%` : "74.0%"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 2 }}>Across CIE-I, CIE-II & Quizzes</div>
        </div>
      </div>

      {/* Outcome-Based Education Attainment Card */}
      {attainment && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0 }}>
                RVCE Course Outcome (CO) & Bloom&apos;s Level Attainment
              </h3>
              <p style={{ fontSize: "0.8rem", color: "var(--pencil)", margin: "2px 0 0" }}>
                Continuous Internal Evaluation (CIE) Outcome Mastery vs. Autonomous 60% Benchmark
              </p>
            </div>
            <span className="badge badge-primary">{attainment.institution}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {attainment.outcomes.map((co) => {
              const isAttained = co.attained_percentage >= co.threshold_percentage;
              return (
                <div
                  key={co.code}
                  style={{
                    padding: 12,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--canvas-subtle)",
                    border: `1px solid ${isAttained ? "var(--rule)" : "rgba(239, 68, 68, 0.3)"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{co.code}</span>
                    <span
                      className={`badge ${isAttained ? "badge-success" : "badge-danger"}`}
                      style={{ fontSize: "0.75rem" }}
                    >
                      {co.bloom_level} &middot; {co.attained_percentage}%
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--pencil)", margin: 0, lineHeight: 1.4 }}>
                    {co.description}
                  </p>
                  {!isAttained && (
                    <div style={{ fontSize: "0.75rem", color: "var(--redpen)", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      <AlertCircle size={12} /> Deficit detected: Remedial revision scheduled
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Student Roster Table */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0 }}>Class Roster &amp; Test Results</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--pencil)", margin: "2px 0 0" }}>
              Students enrolled for this semester and section. Click &ldquo;Record Marks&rdquo; or use manual entry.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: "0.85rem" }}
            onClick={() => {
              if (students && students.length > 0) {
                setEditingStudent(students[0]);
              }
              setSelectedAssessmentId(assessments[0]?.id || "");
              setInputMarks("");
              setFeedback("");
            }}
          >
            <Edit3 size={15} /> + Enter Test Result Manually
          </button>
        </div>

        {message && (
          <div
            style={{
              padding: "10px 14px",
              marginBottom: 16,
              borderRadius: "var(--radius-sm)",
              fontSize: "0.85rem",
              background: message.tone === "ok" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
              color: message.tone === "ok" ? "var(--greenpen)" : "var(--redpen)",
              border: `1px solid ${message.tone === "ok" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            }}
          >
            {message.text}
          </div>
        )}

        {totalStudents === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--pencil)" }}>
            No students enrolled in this course yet. Use the Admin Portal to simulate or enroll RVCE student cohorts.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--rule)" }}>
                  <th style={{ padding: "10px 12px" }}>USN</th>
                  <th style={{ padding: "10px 12px" }}>Student Name</th>
                  <th style={{ padding: "10px 12px" }}>Attendance</th>
                  <th style={{ padding: "10px 12px" }}>Quiz 1 (RA & SQL)</th>
                  <th style={{ padding: "10px 12px" }}>Quiz 2 (FD & Cover)</th>
                  <th style={{ padding: "10px 12px" }}>CIE Total (/50)</th>
                  <th style={{ padding: "10px 12px" }}>Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {students!.map((s) => {
                  const q1 = s.test_scores["Quiz 1: Relational Algebra & SQL"] ?? "-";
                  const q2 = s.test_scores["Quiz 2: Functional Dependencies & Minimal Cover"] ?? "-";
                  const attColor =
                    s.attendance_percentage >= 85
                      ? "var(--greenpen)"
                      : s.attendance_percentage >= 75
                      ? "var(--amberpen)"
                      : "var(--redpen)";

                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{s.usn}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div>{s.full_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--pencil)" }}>{s.email}</div>
                      </td>
                      <td style={{ padding: "10px 12px", color: attColor, fontWeight: 600 }}>
                        {s.attendance_percentage}%
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {typeof q1 === "number" ? `${q1} / 20` : q1}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {typeof q2 === "number" ? (
                          <span
                            style={{
                              color: q2 < 12 ? "var(--redpen)" : "inherit",
                              fontWeight: q2 < 12 ? 600 : "normal",
                            }}
                          >
                            {q2} / 25 {q2 < 12 && "(Low)"}
                          </span>
                        ) : (
                          q2
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>
                        {s.cie_total > 0 ? `${s.cie_total} / 50` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {s.is_at_risk ? (
                          <span className="badge badge-danger">At Risk</span>
                        ) : (
                          <span className="badge badge-success">On Track</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: "4px 8px", fontSize: "0.8rem", cursor: "pointer" }}
                          onClick={() => {
                            setEditingStudent(s);
                            setSelectedAssessmentId(assessments[0]?.id || "");
                            setInputMarks("");
                            setFeedback("");
                          }}
                        >
                          <Edit3 size={14} /> Marks
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Marks Modal */}
      {editingStudent && (
        <div className="modal-backdrop" onClick={() => setEditingStudent(null)}>
          <div
            className="modal-box card"
            style={{ maxWidth: 460, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>
              Record Marks: {editingStudent.usn}
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--pencil)" }}>
              {editingStudent.full_name} &middot; Sem {editingStudent.semester} Sec {editingStudent.section}
            </p>

            <form onSubmit={handleSaveMarks} style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Select Enrolled Student
                </label>
                <select
                  className="select"
                  value={editingStudent.id}
                  onChange={(e) => {
                    const found = students?.find((s) => s.id === e.target.value);
                    if (found) setEditingStudent(found);
                  }}
                  required
                >
                  {students?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.usn} &middot; {s.full_name} ({s.section})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Select Assessment / Test
                </label>
                <select
                  className="select"
                  value={selectedAssessmentId}
                  onChange={(e) => setSelectedAssessmentId(e.target.value)}
                  required
                >
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} ({a.max_marks} marks)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Marks Obtained
                </label>
                <input
                  type="number"
                  className="input"
                  min="0"
                  max={assessments.find((a) => a.id === selectedAssessmentId)?.max_marks || 50}
                  step="0.5"
                  value={inputMarks}
                  onChange={(e) => setInputMarks(e.target.value)}
                  placeholder="e.g. 16.5"
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Feedback / Common Misconception
                </label>
                <input
                  type="text"
                  className="input"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. Struggled with candidate key closure proof"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingStudent(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save Marks"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
