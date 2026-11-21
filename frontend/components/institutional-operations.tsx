"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  AlertTriangle,
  Calendar,
  UserCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  Users,
  Award,
  Zap,
  Printer,
  ChevronRight,
  ShieldAlert,
  ArrowRight
} from "lucide-react";
import { institutionalAPI, exportsAPI } from "@/lib/api";

interface InstitutionalOperationsProps {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  semester: string;
  onRefreshCourse?: () => void;
}

type SubTab = "drift" | "proxy" | "labsync" | "remedials" | "attendance";

export default function InstitutionalOperations({
  courseId,
  courseCode,
  courseTitle,
  semester,
  onRefreshCourse
}: InstitutionalOperationsProps) {
  const [activeTab, setActiveTab] = useState<SubTab>("drift");
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Data states
  const [driftData, setDriftData] = useState<any>(null);
  const [labSyncData, setLabSyncData] = useState<any>(null);
  const [learnersData, setLearnersData] = useState<any>(null);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [lostClassesData, setLostClassesData] = useState<any>(null);

  // Modals state
  const [showLostClassModal, setShowLostClassModal] = useState(false);
  const [lostForm, setLostForm] = useState({
    reason: "8th Mile College Fest / Sports Day",
    action: "compensate",
    compensation_date: "",
    compensation_slot: "Saturday 09:00 - 10:00 (Zero Hour)",
    notes: ""
  });
  const [submittingLost, setSubmittingLost] = useState(false);

  const [showProxyModal, setShowProxyModal] = useState(false);
  const [proxyForm, setProxyForm] = useState({
    session_id: "sess-1",
    proxy_teacher_name: "Dr. Anitha K",
    proxy_teacher_email: "anitha@rvce.edu.in",
    reason: "VTU External Valuation Duty",
    special_instructions: "Please conduct worked examples on Functional Dependencies."
  });
  const [submittingProxy, setSubmittingProxy] = useState(false);

  const [handoverKit, setHandoverKit] = useState<any>(null);

  const [showProgressModal, setShowProgressModal] = useState<any>(null);
  const [actualPeriods, setActualPeriods] = useState<number>(1.5);
  const [progressRemarks, setProgressRemarks] = useState("");
  const [submittingProgress, setSubmittingProgress] = useState(false);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [drift, lab, learners, att, lost] = await Promise.all([
        institutionalAPI.getSyllabusDrift(courseId).catch(() => null),
        institutionalAPI.getLabSync(courseId).catch(() => null),
        institutionalAPI.getDifferentiatedLearners(courseId).catch(() => null),
        institutionalAPI.getAttendanceAnalysis(courseId).catch(() => null),
        institutionalAPI.listLostClasses(courseId).catch(() => null)
      ]);
      setDriftData(drift);
      setLabSyncData(lab);
      setLearnersData(learners);
      setAttendanceData(att);
      setLostClassesData(lost);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Handle Lost Class Submit
  const handleLostClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLost(true);
    try {
      const res = await institutionalAPI.reportLostClass(courseId, lostForm);
      setStatusMessage({ tone: "ok", text: res.message });
      setShowLostClassModal(false);
      await loadAllData();
      if (onRefreshCourse) onRefreshCourse();
    } catch (err) {
      setStatusMessage({ tone: "err", text: err instanceof Error ? err.message : "Failed to report lost class" });
    } finally {
      setSubmittingLost(false);
    }
  };

  // Handle Assign Proxy Submit
  const handleAssignProxySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingProxy(true);
    try {
      const res = await institutionalAPI.assignProxy(courseId, proxyForm);
      setStatusMessage({ tone: "ok", text: res.message });
      setShowProxyModal(false);
      // Automatically load the handover kit preview
      const kit = await institutionalAPI.getProxyHandoverKit(courseId, proxyForm.session_id);
      setHandoverKit(kit);
    } catch (err) {
      setStatusMessage({ tone: "err", text: err instanceof Error ? err.message : "Failed to assign proxy" });
    } finally {
      setSubmittingProxy(false);
    }
  };

  // Handle Record Topic Progress
  const handleRecordProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showProgressModal) return;
    setSubmittingProgress(true);
    try {
      const res = await institutionalAPI.recordTopicProgress(courseId, showProgressModal.topic_id, {
        actual_periods_taken: actualPeriods,
        remarks: progressRemarks
      });
      setStatusMessage({ tone: "ok", text: `${res.message} ${res.recommendation}` });
      setShowProgressModal(null);
      await loadAllData();
    } catch (err) {
      setStatusMessage({ tone: "err", text: err instanceof Error ? err.message : "Failed to record progress" });
    } finally {
      setSubmittingProgress(false);
    }
  };

  if (loading) {
    return <div className="skeleton" style={{ height: 280 }} />;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Top Banner with 1-Click NBA Course File Export */}
      <div
        className="card"
        style={{
          padding: "20px 24px",
          background: "linear-gradient(135deg, rgba(37,99,235,0.08), rgba(16,185,129,0.08))",
          borderColor: "rgba(37,99,235,0.25)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="badge badge-primary">RVCE Autonomous Academic Model</span>
            <span style={{ fontSize: "0.85rem", color: "var(--pencil)" }}>
              {courseCode} &middot; {semester} &middot; Dept of CSE
            </span>
          </div>
          <h2 style={{ margin: "6px 0 2px", fontSize: "1.3rem", fontWeight: 700 }}>
            Institutional Operations, Scheduling Realities &amp; NBA Compliance
          </h2>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--pencil)" }}>
            Handles real-world college dynamics: unplanned class losses, proxy handovers, lab batch sync, remedial plans, and SAR audit trails.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", fontWeight: 600 }}
          onClick={() => exportsAPI.openNbaCourseFile(courseId)}
          title="Generates complete NBA SAR Course File with Attainment, Lesson Log & Student Marks"
        >
          <Printer size={18} /> 1-Click NBA Course File (PDF)
        </button>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.875rem",
            background: statusMessage.tone === "ok" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            color: statusMessage.tone === "ok" ? "var(--greenpen)" : "var(--redpen)",
            border: `1px solid ${statusMessage.tone === "ok" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "2px 8px", fontSize: "0.75rem" }}
            onClick={() => setStatusMessage(null)}
          >
            &times;
          </button>
        </div>
      )}

      {/* Segmented SubTabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--line)", paddingBottom: 10, flexWrap: "wrap" }}>
        {[
          { key: "drift", label: "Syllabus Drift & Lost Classes", icon: Clock },
          { key: "proxy", label: "Faculty OD & Proxy Handover", icon: Users },
          { key: "labsync", label: "Theory vs. Lab Batch Sync", icon: Zap },
          { key: "remedials", label: "AICTE Remedial & Enrichment", icon: Award },
          { key: "attendance", label: "VTU 85%/75% Attendance & Condonation", icon: ShieldAlert }
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={active ? "btn btn-primary" : "btn btn-ghost"}
              style={{
                fontSize: "0.85rem",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px"
              }}
              onClick={() => setActiveTab(tab.key as SubTab)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── SUBTAB 1: SYLLABUS DRIFT & LOST CLASS RE-BALANCE ── */}
      {activeTab === "drift" && (
        <div style={{ display: "grid", gap: 18 }}>
          {/* Summary KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: "0.8rem", color: "var(--pencil)", fontWeight: 600 }}>CURRICULUM PACE DRIFT</div>
              <div
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  marginTop: 6,
                  color:
                    driftData?.net_drift_periods < 0
                      ? "var(--redpen)"
                      : driftData?.net_drift_periods > 0
                      ? "var(--greenpen)"
                      : "var(--pencil)"
                }}
              >
                {driftData?.net_drift_periods < 0
                  ? `Lagging by ${Math.abs(driftData.net_drift_periods)} periods`
                  : driftData?.net_drift_periods > 0
                  ? `Ahead by ${driftData.net_drift_periods} periods`
                  : "Exactly on Schedule"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 4 }}>
                {driftData?.status_alert || "Planned vs actual class time"}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: "0.8rem", color: "var(--pencil)", fontWeight: 600 }}>COMPLETED TOPICS</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, marginTop: 6, color: "var(--primary)" }}>
                {driftData?.completed_topics || 0} / {driftData?.total_topics || 0}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 4 }}>
                Syllabus progress recorded with actual delivery durations
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: "0.8rem", color: "var(--pencil)", fontWeight: 600 }}>SATURDAY COMPENSATIONS</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, marginTop: 6, color: "var(--amberpen)" }}>
                {lostClassesData?.compensations?.length || 0} Scheduled
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 4 }}>
                Zero-hour slots compensating for fests &amp; holidays
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
                Class Delivery Log &amp; Pace Tracking
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--pencil)" }}>
                Did a difficult topic take 2 periods instead of 1? Record actual duration to let OptiTeach re-balance the remaining semester.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => setShowLostClassModal(true)}
            >
              <AlertTriangle size={16} style={{ color: "var(--amberpen)" }} /> Declare Lost Class / Fest Day
            </button>
          </div>

          {/* Topic Progress Table */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table" style={{ width: "100%", margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>Syllabus Topic</th>
                  <th style={{ textAlign: "center" }}>Planned Duration</th>
                  <th style={{ textAlign: "center" }}>Actual Taken</th>
                  <th style={{ textAlign: "center" }}>Drift</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {driftData?.topic_breakdown?.map((item: any) => (
                  <tr key={item.topic_id}>
                    <td>
                      <strong>{item.title}</strong>
                    </td>
                    <td style={{ textAlign: "center" }}>{item.planned_periods} period ({item.planned_periods * 60}m)</td>
                    <td style={{ textAlign: "center" }}>
                      {item.actual_periods !== null ? `${item.actual_periods} period(s)` : "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {item.actual_periods !== null ? (
                        item.drift < 0 ? (
                          <span style={{ color: "var(--redpen)", fontWeight: 600 }}>{item.drift} period</span>
                        ) : item.drift > 0 ? (
                          <span style={{ color: "var(--greenpen)", fontWeight: 600 }}>+{item.drift} period</span>
                        ) : (
                          <span style={{ color: "var(--pencil)" }}>0</span>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {item.status === "COMPLETED" ? (
                        <span className="badge badge-success">Completed</span>
                      ) : (
                        <span className="badge badge-ghost">Scheduled</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                        onClick={() => {
                          setShowProgressModal(item);
                          setActualPeriods(item.actual_periods || item.planned_periods || 1.0);
                        }}
                      >
                        {item.status === "COMPLETED" ? "Edit Progress" : "Log Completion"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Scheduled Compensations List */}
          {lostClassesData?.compensations?.length > 0 && (
            <div className="card" style={{ padding: 18 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: "0.95rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <Calendar size={16} /> Scheduled Saturday Compensatory Classes (Zero Hour)
              </h4>
              <div style={{ display: "grid", gap: 8 }}>
                {lostClassesData.compensations.map((c: any) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      background: "rgba(245,158,11,0.08)",
                      border: "1px solid rgba(245,158,11,0.25)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <strong>{c.date}</strong> &middot; {c.slot}
                      <span style={{ display: "block", fontSize: "0.8rem", color: "var(--pencil)" }}>
                        {c.reason}
                      </span>
                    </div>
                    <span className="badge badge-warning">Zero-Hour Compensatory</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SUBTAB 2: FACULTY OD & PROXY HANDOVER ── */}
      {activeTab === "proxy" && (
        <div style={{ display: "grid", gap: 18 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                  Faculty On-Duty (OD) Handover &amp; Proxy Delegation
                </h3>
                <p style={{ margin: "3px 0 0", fontSize: "0.85rem", color: "var(--pencil)" }}>
                  Going on VTU evaluation, valuation duty, or conference? Delegate your period to a substitute and generate a 1-page ready-to-teach Handover Kit.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowProxyModal(true)}
              >
                + Assign Substitute Faculty
              </button>
            </div>
          </div>

          {handoverKit ? (
            <div className="card" style={{ padding: 24, border: "2px solid rgba(37,99,235,0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <span className="badge badge-primary">1-Click Proxy Handover Kit</span>
                  <h3 style={{ margin: "8px 0 2px", fontSize: "1.2rem", fontWeight: 700 }}>
                    {handoverKit.topic?.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--pencil)" }}>
                    Period #{handoverKit.session_number} &middot; {handoverKit.scheduled_time} &middot; {handoverKit.lecture_hall}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => window.print()}
                >
                  <Printer size={16} /> Print Handover Sheet
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18, fontSize: "0.85rem" }}>
                <div style={{ padding: 12, background: "rgba(0,0,0,0.02)", borderRadius: 6 }}>
                  <strong>Substitute Faculty:</strong> {handoverKit.proxy_teacher}
                  <br />
                  <strong>Regular Instructor:</strong> {handoverKit.regular_teacher}
                </div>
                <div style={{ padding: 12, background: "rgba(0,0,0,0.02)", borderRadius: 6 }}>
                  <strong>Reason for Proxy:</strong> {handoverKit.reason_for_proxy}
                  <br />
                  <strong>Target Bloom&apos;s Level:</strong> {handoverKit.topic?.bloom_taxonomy_level}
                </div>
              </div>

              <h4 style={{ margin: "14px 0 8px", fontSize: "0.95rem", fontWeight: 600 }}>
                Phase-by-Phase Lecture Delivery Guide ({handoverKit.topic?.allocated_duration}):
              </h4>
              <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
                {handoverKit.topic?.phases?.map((p: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 12px",
                      background: "rgba(37,99,235,0.04)",
                      borderLeft: "3px solid var(--primary)",
                      fontSize: "0.85rem"
                    }}
                  >
                    <strong>{p.phase} ({p.duration}):</strong> {p.content}
                  </div>
                ))}
              </div>

              <h4 style={{ margin: "14px 0 8px", fontSize: "0.95rem", fontWeight: 600 }}>
                Board Worked Examples to Solve:
              </h4>
              <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: "0.85rem" }}>
                {handoverKit.topic?.worked_examples?.map((ex: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: 4 }}>{ex}</li>
                ))}
              </ul>

              <h4 style={{ margin: "14px 0 8px", fontSize: "0.95rem", fontWeight: 600 }}>
                Formative Exit Check Questions:
              </h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.85rem" }}>
                {handoverKit.topic?.exit_check_questions?.map((q: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: 4 }}>{q}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--pencil)" }}>
              No proxy handover kit loaded. Click &quot;+ Assign Substitute Faculty&quot; above to configure and print a handover kit.
            </div>
          )}
        </div>
      )}

      {/* ── SUBTAB 3: THEORY VS LAB BATCH SYNCHRONIZATION ── */}
      {activeTab === "labsync" && (
        <div style={{ display: "grid", gap: 18 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                  Theory &mdash; Laboratory Batch Synchronization (Batches A1 &amp; A2)
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--pencil)" }}>
                  RVCE 60-student sections are split into Batch A1 and Batch A2. OptiTeach prevents lab de-sync where practicals are scheduled before theory is taught!
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className="badge badge-success" style={{ fontSize: "0.9rem", padding: "6px 12px" }}>
                  {labSyncData?.sync_health_percentage || 100}% Synced
                </span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table" style={{ width: "100%", margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: "8%", textAlign: "center" }}>Exp #</th>
                  <th style={{ width: "32%" }}>Laboratory Practical Title</th>
                  <th style={{ width: "28%" }}>Prerequisite Classroom Theory Topic</th>
                  <th style={{ width: "16%" }}>Batch Slots</th>
                  <th style={{ width: "16%", textAlign: "center" }}>Sync Precedence</th>
                </tr>
              </thead>
              <tbody>
                {labSyncData?.experiments?.map((exp: any) => (
                  <tr key={exp.exp_no}>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>#{exp.exp_no}</td>
                    <td>
                      <strong>{exp.title}</strong>
                      {exp.alert && (
                        <div style={{ fontSize: "0.75rem", color: "var(--amberpen)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                          <AlertTriangle size={12} /> {exp.alert}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ color: "var(--pencil)", fontSize: "0.85rem" }}>
                        {exp.prerequisite_theory}
                      </span>
                      <div style={{ fontSize: "0.75rem", color: exp.theory_status === "COMPLETED" ? "var(--greenpen)" : "var(--primary)" }}>
                        Theory status: {exp.theory_status}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--pencil)" }}>
                      <div>A1: {exp.batch_a1_slot}</div>
                      <div>A2: {exp.batch_a2_slot}</div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`badge ${exp.badge}`}>
                        {exp.sync_status === "SYNCED" ? "Precedence Met" : "Monitor Pace"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SUBTAB 4: AICTE REMEDIAL & ENRICHMENT PLANS ── */}
      {activeTab === "remedials" && (
        <div style={{ display: "grid", gap: 18 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <span className="badge badge-primary">AICTE &amp; NBA Criterion 2.2</span>
                <h3 style={{ margin: "6px 0 2px", fontSize: "1.1rem", fontWeight: 700 }}>
                  Differentiated Instruction: Slow Learners (&lt;40%) vs. Advanced Learners (&gt;80%)
                </h3>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--pencil)" }}>
                  Identified automatically from continuous internal evaluation (CIE-1 &amp; Quizzes) with custom remedial assignments.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span className="badge badge-error">{learnersData?.slow_learners_count || 0} Slow Learners</span>
                <span className="badge badge-success">{learnersData?.advanced_learners_count || 0} Advanced Learners</span>
              </div>
            </div>
          </div>

          {/* Slow Learners Remedial Section */}
          <div className="card" style={{ padding: 20 }}>
            <h4 style={{ margin: "0 0 4px", fontSize: "1.05rem", fontWeight: 700, color: "var(--redpen)", display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldAlert size={18} /> Slow Learners Cohort &amp; Remedial Action Plan (&lt;20/50 CIE)
            </h4>
            <p style={{ margin: "0 0 14px", fontSize: "0.8rem", color: "var(--pencil)" }}>
              Mandatory Saturday Zero-Hour tutorial sessions and worked problem banks assigned to boost outcome mastery.
            </p>

            <table className="table" style={{ width: "100%", margin: 0 }}>
              <thead>
                <tr>
                  <th>USN</th>
                  <th>Student Name</th>
                  <th>CIE Total</th>
                  <th>Deficient Prerequisite Topic</th>
                  <th>Remedial Action Assigned</th>
                  <th>Makeup Test</th>
                </tr>
              </thead>
              <tbody>
                {learnersData?.slow_learners?.map((s: any) => (
                  <tr key={s.student_id}>
                    <td><code>{s.usn}</code></td>
                    <td><strong>{s.full_name}</strong></td>
                    <td style={{ color: "var(--redpen)", fontWeight: 700 }}>{s.cie_total} / 50</td>
                    <td style={{ fontSize: "0.85rem" }}>{s.weakest_area}</td>
                    <td style={{ fontSize: "0.85rem" }}>{s.action_item}</td>
                    <td>
                      <span className="badge badge-warning">{s.retest_eligibility}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Advanced Learners Enrichment Section */}
          <div className="card" style={{ padding: 20 }}>
            <h4 style={{ margin: "0 0 4px", fontSize: "1.05rem", fontWeight: 700, color: "var(--greenpen)", display: "flex", alignItems: "center", gap: 8 }}>
              <Award size={18} /> Advanced Learners Cohort &amp; Enrichment Track (&gt;40/50 CIE)
            </h4>
            <p style={{ margin: "0 0 14px", fontSize: "0.8rem", color: "var(--pencil)" }}>
              High-achieving students challenged with GATE problem banks, IEEE transaction case studies, and mini-project synthesis.
            </p>

            <table className="table" style={{ width: "100%", margin: 0 }}>
              <thead>
                <tr>
                  <th>USN</th>
                  <th>Student Name</th>
                  <th>CIE Total</th>
                  <th>Mastery Area</th>
                  <th>Enrichment Track</th>
                  <th>Experiential Project / MOOC</th>
                </tr>
              </thead>
              <tbody>
                {learnersData?.advanced_learners?.map((s: any) => (
                  <tr key={s.student_id}>
                    <td><code>{s.usn}</code></td>
                    <td><strong>{s.full_name}</strong></td>
                    <td style={{ color: "var(--greenpen)", fontWeight: 700 }}>{s.cie_total} / 50</td>
                    <td style={{ fontSize: "0.85rem" }}>{s.strength_area}</td>
                    <td style={{ fontSize: "0.85rem" }}>{s.enrichment_track}</td>
                    <td style={{ fontSize: "0.85rem" }}>{s.experiential_project}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SUBTAB 5: VTU ATTENDANCE SHORTAGE & CONDONATION ── */}
      {activeTab === "attendance" && (
        <div style={{ display: "grid", gap: 18 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <span className="badge badge-primary">VTU Autonomous Clauses 8.1 &amp; 8.2</span>
                <h3 style={{ margin: "6px 0 2px", fontSize: "1.1rem", fontWeight: 700 }}>
                  Attendance Shortage, Condonation &amp; Detention Risk Analysis
                </h3>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--pencil)" }}>
                  Total classes: {attendanceData?.total_classes} &middot; Conducted: {attendanceData?.classes_conducted} &middot; Remaining: {attendanceData?.classes_remaining}.
                  Minimum 85% required; 75% permitted on condonation approved by Principal.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span className="badge badge-success">{attendanceData?.eligible_count || 0} Eligible (&ge;85%)</span>
                <span className="badge badge-warning">{attendanceData?.condonation_count || 0} Condonation (75-84.9%)</span>
                <span className="badge badge-error">{attendanceData?.detained_count || 0} Shortage (&lt;75%)</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table" style={{ width: "100%", margin: 0 }}>
              <thead>
                <tr>
                  <th>USN</th>
                  <th>Student Name</th>
                  <th>Sec</th>
                  <th style={{ textAlign: "center" }}>Classes Attended</th>
                  <th style={{ textAlign: "center" }}>Current %</th>
                  <th style={{ textAlign: "center" }}>Max Reachable %</th>
                  <th style={{ textAlign: "center" }}>VTU Eligibility Status</th>
                  <th>Remedial Note / Action</th>
                </tr>
              </thead>
              <tbody>
                {attendanceData?.roster?.map((st: any) => (
                  <tr key={st.student_id}>
                    <td><code>{st.usn}</code></td>
                    <td><strong>{st.full_name}</strong></td>
                    <td>{st.section}</td>
                    <td style={{ textAlign: "center" }}>{st.classes_attended} / {st.classes_conducted}</td>
                    <td
                      style={{
                        textAlign: "center",
                        fontWeight: 700,
                        color:
                          st.current_percentage >= 85
                            ? "var(--greenpen)"
                            : st.current_percentage >= 75
                            ? "var(--amberpen)"
                            : "var(--redpen)"
                      }}
                    >
                      {st.current_percentage}%
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{st.max_reachable_percentage}%</td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`badge ${st.badge_color}`}>
                        {st.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--pencil)" }}>
                      {st.action_note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: DECLARE LOST CLASS ── */}
      {showLostClassModal && (
        <div className="modal-backdrop" onClick={() => setShowLostClassModal(false)}>
          <div
            className="modal-box card"
            style={{ maxWidth: 480, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 700 }}>
              Declare Lost Class Session
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--pencil)" }}>
              Lost a period due to 8th Mile Fest, rain holiday, or leave? Choose how to recover.
            </p>

            <form onSubmit={handleLostClassSubmit} style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Reason for Lost Period
                </label>
                <select
                  className="select"
                  value={lostForm.reason}
                  onChange={(e) => setLostForm({ ...lostForm, reason: e.target.value })}
                  required
                >
                  <option value="8th Mile College Fest / Sports Day">8th Mile College Fest / Cultural Day</option>
                  <option value="Rain Holiday / Government Bandh">Rain Holiday / Gazetted Holiday</option>
                  <option value="Faculty Emergency Leave">Faculty Emergency Leave</option>
                  <option value="VTU Examination Duty">VTU Examination / Valuation Duty</option>
                  <option value="Industrial Visit / Hackathon">Department Industrial Visit / Hackathon</option>
                </select>
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Curriculum Recovery Action
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    type="button"
                    className={lostForm.action === "compensate" ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ textAlign: "center", padding: "10px" }}
                    onClick={() => setLostForm({ ...lostForm, action: "compensate" })}
                  >
                    Saturday Extra Class<br />
                    <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(Zero Hour)</span>
                  </button>
                  <button
                    type="button"
                    className={lostForm.action === "rebalance" ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ textAlign: "center", padding: "10px" }}
                    onClick={() => setLostForm({ ...lostForm, action: "rebalance" })}
                  >
                    Dynamic MILP Rebalance<br />
                    <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>(Graceful Compress)</span>
                  </button>
                </div>
              </div>

              {lostForm.action === "compensate" && (
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Compensation Time Slot
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={lostForm.compensation_slot}
                    onChange={(e) => setLostForm({ ...lostForm, compensation_slot: e.target.value })}
                    placeholder="Saturday 09:00 - 10:00 (Zero Hour)"
                    required
                  />
                </div>
              )}

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Remarks / Notes
                </label>
                <textarea
                  className="input"
                  rows={2}
                  value={lostForm.notes}
                  onChange={(e) => setLostForm({ ...lostForm, notes: e.target.value })}
                  placeholder="Optional notes for syllabus log..."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowLostClassModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingLost}
                >
                  {submittingLost ? "Applying..." : "Confirm Recovery Action"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ASSIGN PROXY FACULTY ── */}
      {showProxyModal && (
        <div className="modal-backdrop" onClick={() => setShowProxyModal(false)}>
          <div
            className="modal-box card"
            style={{ maxWidth: 480, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 700 }}>
              Assign Substitute Faculty (Proxy)
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--pencil)" }}>
              Delegate your period to a colleague and auto-generate the 1-Click Handover Kit.
            </p>

            <form onSubmit={handleAssignProxySubmit} style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Substitute Faculty Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={proxyForm.proxy_teacher_name}
                  onChange={(e) => setProxyForm({ ...proxyForm, proxy_teacher_name: e.target.value })}
                  placeholder="e.g. Dr. Anitha K"
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Substitute Faculty Email
                </label>
                <input
                  type="email"
                  className="input"
                  value={proxyForm.proxy_teacher_email}
                  onChange={(e) => setProxyForm({ ...proxyForm, proxy_teacher_email: e.target.value })}
                  placeholder="anitha@rvce.edu.in"
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Reason for Proxy (OD Duty)
                </label>
                <select
                  className="select"
                  value={proxyForm.reason}
                  onChange={(e) => setProxyForm({ ...proxyForm, reason: e.target.value })}
                  required
                >
                  <option value="VTU External Valuation Duty">VTU External Valuation Duty</option>
                  <option value="Conference / IEEE Presentation">Conference / IEEE Presentation</option>
                  <option value="Faculty Development Program (FDP)">Faculty Development Program (FDP)</option>
                  <option value="Medical / Emergency Leave">Medical / Emergency Leave</option>
                  <option value="Official Institutional Work">Official Institutional Work</option>
                </select>
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Special Instructions for Proxy Teacher
                </label>
                <textarea
                  className="input"
                  rows={2}
                  value={proxyForm.special_instructions}
                  onChange={(e) => setProxyForm({ ...proxyForm, special_instructions: e.target.value })}
                  placeholder="Focus on 3NF vs BCNF worked problems..."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowProxyModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingProxy}
                >
                  {submittingProxy ? "Assigning..." : "Assign & Generate Handover Kit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: RECORD TOPIC COMPLETION & PACE DRIFT ── */}
      {showProgressModal && (
        <div className="modal-backdrop" onClick={() => setShowProgressModal(null)}>
          <div
            className="modal-box card"
            style={{ maxWidth: 440, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: "1.15rem", fontWeight: 700 }}>
              Record Topic Completion: {showProgressModal.title}
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--pencil)" }}>
              Planned: {showProgressModal.planned_periods} period(s). Enter actual periods taken.
            </p>

            <form onSubmit={handleRecordProgressSubmit} style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Actual Periods Spent
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  className="input"
                  value={actualPeriods}
                  onChange={(e) => setActualPeriods(parseFloat(e.target.value))}
                  required
                />
                <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 4 }}>
                  {actualPeriods > (showProgressModal.planned_periods || 1) ? (
                    <span style={{ color: "var(--redpen)" }}>
                      Takes +{(actualPeriods - (showProgressModal.planned_periods || 1)).toFixed(1)} periods more than planned.
                    </span>
                  ) : (
                    <span style={{ color: "var(--greenpen)" }}>On or ahead of planned time.</span>
                  )}
                </div>
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Remarks / Observations
                </label>
                <textarea
                  className="input"
                  rows={2}
                  value={progressRemarks}
                  onChange={(e) => setProgressRemarks(e.target.value)}
                  placeholder="Students required extra practice on BCNF decomposition..."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowProgressModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingProgress}
                >
                  {submittingProgress ? "Saving..." : "Save Progress & Update Drift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
