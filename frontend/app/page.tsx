"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  Flame,
  GraduationCap,
  ListTodo,
  MapPin,
  Sparkles,
  Users,
  Grid,
  X,
  ChevronRight,
} from "lucide-react";
import { coursesAPI } from "@/lib/api";
import { useSession } from "@/lib/auth";
import type { TodayAgenda, TodayClass, TodayTodo, SubjectSummaryCard, TimetableSlot } from "@/lib/types";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function FacultyTodayDashboard() {
  const router = useRouter();
  const { user } = useSession();
  const [agenda, setAgenda] = useState<TodayAgenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [todoFilter, setTodoFilter] = useState<"all" | "prep" | "grading" | "attendance" | "remedial">("all");
  const [completedTodoIds, setCompletedTodoIds] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<string>("Friday");
  const [showTimetableModal, setShowTimetableModal] = useState<boolean>(false);
  const [homeView, setHomeView] = useState<"agenda" | "timetable">("agenda");
  const [selectedWorkloadSem, setSelectedWorkloadSem] = useState<string>("all");

  useEffect(() => {
    // RBAC: If user is Administrator, redirect to Admin Portal immediately
    if (user && user.role === "admin") {
      router.replace("/admin");
      return;
    }

    coursesAPI.getTodayAgenda()
      .then((data) => {
        setAgenda(data);
        if (data.day_name && DAYS_OF_WEEK.includes(data.day_name)) {
          setSelectedDay(data.day_name);
        }
      })
      .catch((err) => {
        console.error("Failed to load today's agenda:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user, router]);

  const toggleTodo = (id: string) => {
    setCompletedTodoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Distinct semesters for Subject Workload Cards
  const distinctSemesters = useMemo(() => {
    if (!agenda) return [];
    return Array.from(new Set(agenda.subject_cards.map((c) => c.semester))).sort();
  }, [agenda]);

  // Filtered Subject Workload Cards
  const filteredCards = useMemo(() => {
    if (!agenda) return [];
    if (selectedWorkloadSem === "all") return agenda.subject_cards;
    return agenda.subject_cards.filter((c) => c.semester === selectedWorkloadSem);
  }, [agenda, selectedWorkloadSem]);

  // Classes for the active selected day
  const displayedDayClasses = useMemo(() => {
    if (!agenda) return [];
    if (selectedDay === (agenda.day_name || "Friday")) {
      return agenda.today_classes;
    }
    // Filter from weekly timetable
    const slots = (agenda.weekly_timetable || []).filter((s) => s.day === selectedDay);
    slots.sort((a, b) => a.period_number - b.period_number);
    return slots.map((s) => ({
      course_id: s.course_id,
      course_code: s.course_code,
      course_title: s.course_title,
      semester: s.semester,
      section: s.section,
      room: s.room,
      timeslot: s.period_slot,
      period_number: s.period_number,
      class_type: s.class_type,
      session_number: 14,
      topic_name: s.topic,
      concept_name: s.topic,
      bloom_level: s.bloom_level,
      lesson_plan_status: "ready",
      has_remedial_alert: false,
      student_count: 60,
    }));
  }, [agenda, selectedDay]);

  if (loading) {
    return <div className="skeleton" style={{ height: 420, borderRadius: "var(--radius)" }} />;
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const teacherName = user?.full_name || agenda?.teacher_name || "Faculty Member";

  if (!agenda || agenda.subject_cards.length === 0) {
    return (
      <div className="card" style={{ padding: 40, maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
        <div style={{ display: "inline-flex", padding: 16, background: "rgba(59,130,246,0.1)", borderRadius: "50%", color: "var(--primary)", marginBottom: 16 }}>
          <BookOpen size={40} />
        </div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0 0 10px" }}>{greeting}, {teacherName}.</h1>
        <p style={{ color: "var(--pencil)", lineHeight: 1.6, margin: "0 0 24px" }}>
          You have not been assigned any courses for this semester yet.
          The Department Administrator or HOD maps faculty courses, sections, and student cohorts.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link href="/upload" className="btn btn-primary">
            Import a Syllabus
          </Link>
          <Link href="/courses" className="btn btn-secondary">
            View All Courses
          </Link>
        </div>
      </div>
    );
  }

  const filteredTodos = agenda.urgent_todos.filter((t) => {
    if (todoFilter === "all") return true;
    return t.category === todoFilter;
  });

  const totalStudents = agenda.subject_cards.reduce((acc, c) => acc + c.student_count, 0);
  const pendingTodosCount = agenda.urgent_todos.filter((t) => !completedTodoIds.has(t.id) && !t.done).length;
  const avgCieScore = (
    agenda.subject_cards.reduce((acc, c) => acc + c.cie_avg, 0) / Math.max(1, agenda.subject_cards.length)
  ).toFixed(1);

  return (
    <div className="animate-fade-in" style={{ display: "grid", gap: 28, paddingBottom: 40 }}>
      {/* Department Faculty Welcome Header */}
      <header
        className="card"
        style={{
          padding: "24px 28px",
          background: "linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(30,58,138,0.02) 100%)",
          borderLeft: "5px solid var(--primary)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              <span>Department of Computer Science &amp; Engineering · Autonomous Scheme</span>
            </div>
            <h1 style={{ fontSize: "1.85rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
              {greeting}, {teacherName}.
            </h1>
            <p style={{ color: "var(--pencil)", margin: "4px 0 0", fontSize: "0.95rem" }}>
              Here is your institutional class schedule, daily action items, and semester-wise course workloads.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", background: "var(--canvas-subtle)", padding: 3, borderRadius: "var(--radius-md)", border: "1px solid var(--rule)" }}>
              <button
                type="button"
                className={homeView === "agenda" ? "btn btn-primary" : "btn btn-ghost"}
                style={{ fontSize: "0.85rem", padding: "6px 12px" }}
                onClick={() => setHomeView("agenda")}
              >
                <Clock size={15} /> Daily Agenda View
              </button>
              <button
                type="button"
                className={homeView === "timetable" ? "btn btn-primary" : "btn btn-ghost"}
                style={{ fontSize: "0.85rem", padding: "6px 12px" }}
                onClick={() => setHomeView("timetable")}
              >
                <Grid size={15} /> Weekly Timetable Grid
              </button>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                background: "var(--canvas-subtle)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "var(--ink)",
                border: "1px solid var(--rule)",
              }}
            >
              <Calendar size={15} color="var(--primary)" />
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Quick Institutional KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 16,
            marginTop: 20,
            paddingTop: 18,
            borderTop: "1px solid var(--rule)",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--pencil)", textTransform: "uppercase", fontWeight: 600 }}>
              Classes Today ({selectedDay})
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
              {displayedDayClasses.length} <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--pencil)" }}>periods</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--pencil)", textTransform: "uppercase", fontWeight: 600 }}>
              Weekly Workload
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
              {agenda.weekly_hours || 14} <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--pencil)" }}>hrs / week (AICTE compliant)</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--pencil)", textTransform: "uppercase", fontWeight: 600 }}>
              Enrolled Students
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
              {totalStudents} <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--pencil)" }}>across {agenda.subject_cards.length} sections</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--pencil)", textTransform: "uppercase", fontWeight: 600 }}>
              Pending Action Items
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: pendingTodosCount > 0 ? "var(--caution)" : "var(--tick)", marginTop: 2 }}>
              {pendingTodosCount} <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--pencil)" }}>to-dos</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area: Switch between Timetable Full Page and Daily Agenda */}
      {homeView === "timetable" ? (
        <section className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase" }}>
                Department of Computer Science &amp; Engineering
              </div>
              <h2 style={{ margin: "2px 0 0", fontSize: "1.4rem", fontWeight: 800 }}>
                Weekly Faculty Teaching Timetable Matrix
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--pencil)" }}>
                {teacherName} &middot; Workload: {agenda.weekly_hours || 14} Hours/Week across {agenda.subject_cards.length} Courses
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setHomeView("agenda")}
            >
              &larr; Back to Today&apos;s Agenda
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--canvas-subtle)", borderBottom: "2px solid var(--rule)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 110 }}>Day</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>P1 (09:00 - 10:00)</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>P2 (10:00 - 11:00)</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>P3 (11:15 - 12:15)</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>P4 (12:15 - 01:15)</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>P5 (02:00 - 03:00)</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>P6 (03:00 - 04:00)</th>
                </tr>
              </thead>
              <tbody>
                {DAYS_OF_WEEK.map((day) => {
                  const daySlots = (agenda.weekly_timetable || []).filter((s) => s.day === day);
                  const isToday = day === (agenda.day_name || "Friday");

                  return (
                    <tr
                      key={day}
                      style={{
                        borderBottom: "1px solid var(--rule)",
                        background: isToday ? "rgba(37,99,235,0.04)" : undefined,
                      }}
                    >
                      <td style={{ padding: "12px", fontWeight: 700, verticalAlign: "top" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span>{day}</span>
                          {isToday && (
                            <span style={{ fontSize: "0.65rem", padding: "1px 4px", borderRadius: 3, background: "var(--primary)", color: "#fff", fontWeight: 700 }}>
                              Today
                            </span>
                          )}
                        </div>
                      </td>

                      {[1, 2, 3, 4, 5, 6].map((pNum) => {
                        const slot = daySlots.find((s) => s.period_number === pNum);

                        return (
                          <td key={pNum} style={{ padding: "8px 10px", verticalAlign: "top" }}>
                            {slot ? (
                              <div
                                style={{
                                  padding: "6px 8px",
                                  borderRadius: 4,
                                  background: "var(--canvas)",
                                  border: "1px solid var(--rule)",
                                  borderLeft: "3px solid var(--primary)",
                                  fontSize: "0.75rem",
                                }}
                              >
                                <div style={{ fontWeight: 700, color: "var(--primary)" }}>{slot.course_code}</div>
                                <div style={{ fontSize: "0.7rem", color: "var(--pencil)" }}>
                                  {slot.section} &middot; {slot.room}
                                </div>
                                <div style={{ fontSize: "0.65rem", color: "var(--ink)", marginTop: 2, fontWeight: 500 }}>
                                  {slot.class_type}
                                </div>
                              </div>
                            ) : (
                              <div style={{ color: "var(--pencil)", fontSize: "0.7rem", padding: "6px 8px" }}>
                                —
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--rule)", fontSize: "0.8rem", color: "var(--pencil)" }}>
            <span>Tea Break: 11:00 AM - 11:15 AM &middot; Lunch Break: 01:15 PM - 02:00 PM</span>
            <span style={{ fontWeight: 600 }}>Total: 17 Period Slots Scheduled</span>
          </div>
        </section>
      ) : (
      /* Main Grid: Teaching Timetable & Daily Action Checklist */
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
        {/* Section 1: Teaching Schedule Across Courses with Day Switcher */}
        <section aria-labelledby="today-classes-heading" className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h2 id="today-classes-heading" style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Clock size={20} color="var(--primary)" /> Class Schedule ({selectedDay})
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--pencil)" }}>
                Institutional timetable periods mapped by department admin.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.75rem", padding: "4px 8px" }}
              onClick={() => setShowTimetableModal(true)}
            >
              Full Week View
            </button>
          </div>

          {/* Interactive Day of the Week Switcher */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
            {DAYS_OF_WEEK.map((day) => {
              const isToday = day === (agenda.day_name || "Friday");
              const isSelected = day === selectedDay;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  style={{
                    padding: "6px 12px",
                    fontSize: "0.8rem",
                    fontWeight: isSelected ? 700 : 500,
                    borderRadius: "var(--radius-sm)",
                    border: isSelected ? "1px solid var(--primary)" : "1px solid var(--rule)",
                    background: isSelected ? "var(--primary)" : "var(--canvas-subtle)",
                    color: isSelected ? "#ffffff" : "var(--ink)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{day.slice(0, 3)}</span>
                  {isToday && (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        padding: "1px 4px",
                        borderRadius: 3,
                        background: isSelected ? "rgba(255,255,255,0.25)" : "var(--primary)",
                        color: "#ffffff",
                        fontWeight: 700,
                      }}
                    >
                      Today
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {displayedDayClasses.length === 0 ? (
              <div style={{ padding: "30px 0", textAlign: "center", color: "var(--pencil)" }}>
                <Calendar size={32} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: "0.9rem" }}>No classes scheduled on {selectedDay}.</p>
                <p style={{ margin: "4px 0 0", fontSize: "0.8rem" }}>Dedicated to student mentoring, lab prep, and research.</p>
              </div>
            ) : (
              displayedDayClasses.map((cls, idx) => (
                <div
                  key={`${cls.course_id}-${cls.timeslot}-${idx}`}
                  style={{
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--radius-sm)",
                    padding: 16,
                    background: idx === 0 ? "rgba(37,99,235,0.03)" : "var(--canvas)",
                    borderLeft: idx === 0 ? "4px solid var(--primary)" : "4px solid var(--rule)",
                    transition: "box-shadow 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            background: idx === 0 ? "var(--primary)" : "var(--canvas-subtle)",
                            color: idx === 0 ? "#ffffff" : "var(--ink)",
                            borderRadius: "var(--radius-sm)",
                          }}
                        >
                          {cls.timeslot}
                        </span>
                        {cls.class_type && (
                          <span style={{ fontSize: "0.7rem", color: "var(--pencil)", fontWeight: 600 }}>
                            &bull; {cls.class_type}
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "2px 0 4px" }}>
                        {cls.course_code} · {cls.course_title}
                      </h3>
                    </div>

                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: 12,
                        background: cls.lesson_plan_status === "approved" || cls.lesson_plan_status === "ready"
                          ? "rgba(16,185,129,0.12)"
                          : "rgba(245,158,11,0.12)",
                        color: cls.lesson_plan_status === "approved" || cls.lesson_plan_status === "ready"
                          ? "var(--tick)"
                          : "var(--caution)",
                      }}
                    >
                      {cls.lesson_plan_status === "approved" || cls.lesson_plan_status === "ready" ? "✓ Plan Ready" : "Draft Plan"}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: "0.85rem", color: "var(--pencil)", margin: "8px 0" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <MapPin size={14} /> {cls.room}
                    </span>
                    <span>&bull;</span>
                    <span>{cls.semester} ({cls.section})</span>
                    <span>&bull;</span>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>Period #{cls.session_number}</span>
                  </div>

                  <div
                    style={{
                      background: "var(--canvas-subtle)",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      marginTop: 8,
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ color: "var(--pencil)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 600 }}>
                      Scheduled Topic & Outcome
                    </div>
                    <div style={{ fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>
                      {cls.topic_name}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                      <span style={{ fontSize: "0.75rem", padding: "1px 6px", background: "rgba(99,102,241,0.1)", color: "#4f46e5", borderRadius: 4, fontWeight: 600 }}>
                        Bloom: {cls.bloom_level}
                      </span>
                      {cls.has_remedial_alert && (
                        <span style={{ fontSize: "0.75rem", padding: "1px 6px", background: "rgba(239,68,68,0.1)", color: "var(--redpen)", borderRadius: 4, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <AlertTriangle size={12} /> Prereq Deficit Alert
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <Link
                      href={`/lesson-plans?course=${cls.course_id}&session=${cls.session_number}`}
                      className="btn btn-secondary"
                      style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                    >
                      <FileText size={14} /> View Plan
                    </Link>
                    <Link
                      href={`/courses/${cls.course_id}?tab=institutional`}
                      className="btn btn-ghost"
                      style={{ fontSize: "0.8rem", padding: "4px 10px", color: "var(--amberpen)", borderColor: "rgba(245,158,11,0.3)" }}
                      title="Declare lost class / teacher illness and trigger ILP rebalance"
                    >
                      <AlertTriangle size={13} /> Declare Lost / Rebalance
                    </Link>
                    <Link
                      href={`/courses/${cls.course_id}`}
                      className="btn btn-ghost"
                      style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                    >
                      Roster <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Section 2: Actionable Institutional To-Dos & Faculty Checklist */}
        <section aria-labelledby="todos-heading" className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 id="todos-heading" style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <ListTodo size={20} color="var(--primary)" /> Actionable Daily Tasks
            </h2>
            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "var(--pencil)",
              }}
            >
              {agenda.urgent_todos.length - completedTodoIds.size} remaining
            </span>
          </div>

          {/* Filter Chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              { id: "all", label: "All Tasks" },
              { id: "prep", label: "Class Prep" },
              { id: "grading", label: "Evaluation" },
              { id: "attendance", label: "Attendance" },
              { id: "remedial", label: "Remedials" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTodoFilter(f.id as typeof todoFilter)}
                style={{
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: 20,
                  border: "1px solid var(--rule)",
                  background: todoFilter === f.id ? "var(--primary)" : "var(--canvas-subtle)",
                  color: todoFilter === f.id ? "#ffffff" : "var(--ink)",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredTodos.length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "var(--pencil)" }}>
              <CheckCircle2 size={32} color="var(--tick)" style={{ margin: "0 auto 8px" }} />
              <p style={{ margin: 0, fontSize: "0.9rem" }}>No pending tasks in this category.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredTodos.map((todo) => {
                const isChecked = completedTodoIds.has(todo.id) || todo.done;
                return (
                  <div
                    key={todo.id}
                    onClick={() => toggleTodo(todo.id)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--rule)",
                      background: isChecked ? "rgba(16,185,129,0.04)" : "var(--canvas)",
                      cursor: "pointer",
                      opacity: isChecked ? 0.7 : 1,
                      textDecoration: isChecked ? "line-through" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleTodo(todo.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ marginTop: 3, cursor: "pointer" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--ink)" }}>
                          {todo.title}
                        </span>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background:
                              todo.priority === "high"
                                ? "rgba(239,68,68,0.1)"
                                : todo.priority === "medium"
                                ? "rgba(245,158,11,0.1)"
                                : "var(--canvas-subtle)",
                            color:
                              todo.priority === "high"
                                ? "var(--redpen)"
                                : todo.priority === "medium"
                                ? "var(--caution)"
                                : "var(--pencil)",
                          }}
                        >
                          {todo.due_time}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--pencil)", lineHeight: 1.4 }}>
                        {todo.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
      )}

      {/* Section 3: Subject-Wise Workload & Department Progress (Semester-Wise) */}
      <section aria-labelledby="subject-cards-heading">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 id="subject-cards-heading" style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>
              Assigned Courses &amp; Subject-Wise Workloads
            </h2>
            <p style={{ color: "var(--pencil)", fontSize: "0.85rem", margin: "2px 0 0" }}>
              Workloads, syllabus delivery progress, and continuous internal evaluation (CIE) across semester cohorts.
            </p>
          </div>

          {/* Semester Filter for Workloads */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setSelectedWorkloadSem("all")}
              style={{
                padding: "4px 10px",
                fontSize: "0.75rem",
                fontWeight: 600,
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--rule)",
                background: selectedWorkloadSem === "all" ? "var(--primary)" : "var(--canvas-subtle)",
                color: selectedWorkloadSem === "all" ? "#ffffff" : "var(--ink)",
                cursor: "pointer",
              }}
            >
              All Semesters ({agenda.subject_cards.length})
            </button>
            {distinctSemesters.map((sem) => (
              <button
                key={sem}
                type="button"
                onClick={() => setSelectedWorkloadSem(sem)}
                style={{
                  padding: "4px 10px",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--rule)",
                  background: selectedWorkloadSem === sem ? "var(--primary)" : "var(--canvas-subtle)",
                  color: selectedWorkloadSem === sem ? "#ffffff" : "var(--ink)",
                  cursor: "pointer",
                }}
              >
                {sem}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
          {filteredCards.map((card) => (
            <div
              key={card.course_id}
              className="card"
              style={{
                padding: 22,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "var(--primary)",
                        background: "rgba(37,99,235,0.08)",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      {card.code} · {card.semester}
                    </span>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "6px 0 2px" }}>
                      {card.title}
                    </h3>
                    <div style={{ fontSize: "0.8rem", color: "var(--pencil)" }}>
                      {card.section} &middot; {card.room}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--pencil)", fontWeight: 600 }}>CIE Avg</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--ink)" }}>
                      {card.cie_avg} <span style={{ fontSize: "0.75rem", color: "var(--pencil)", fontWeight: 500 }}>/ 50</span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ margin: "16px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>Syllabus Delivered</span>
                    <span style={{ color: "var(--pencil)" }}>
                      {card.completed_classes} of {card.total_classes} periods ({card.progress_pct}%)
                    </span>
                  </div>
                  <div className="progress-bar" style={{ height: 8 }}>
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${Math.min(100, card.progress_pct)}%` }}
                    />
                  </div>
                </div>

                {/* Next Class & Active Topic */}
                <div style={{ background: "var(--canvas-subtle)", padding: 12, borderRadius: "var(--radius-sm)", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--pencil)", fontWeight: 600 }}>
                    <span>UPCOMING PERIOD #{card.next_session_number}</span>
                    <span>{card.next_timeslot.split(" - ")[0]}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--ink)", marginTop: 2 }}>
                    {card.active_topic}
                  </div>
                </div>

                {/* Subject-Specific Action Items / To-Dos */}
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--pencil)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                    Subject-Specific To-Dos ({card.specific_todos.length})
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8rem", color: "var(--pencil)", lineHeight: 1.5 }}>
                    {card.specific_todos.map((st, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <span style={{ color: "var(--ink)" }}>{st}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
                <Link
                  href={`/courses/${card.course_id}`}
                  className="btn btn-primary"
                  style={{ flex: 1, fontSize: "0.8rem", justifyContent: "center" }}
                >
                  Open Course
                </Link>
                <Link
                  href={`/curriculum?course=${card.course_id}`}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  title="View Curriculum Graph"
                >
                  Curriculum
                </Link>
                <Link
                  href={`/optimization?course=${card.course_id}`}
                  className="btn btn-ghost"
                  style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  title="View Time Plan"
                >
                  Plan
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly Timetable Modal */}
      {showTimetableModal && (
        <div className="modal-backdrop" onClick={() => setShowTimetableModal(false)}>
          <div
            className="modal-box card"
            style={{ maxWidth: 900, width: "95%", padding: 24, maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase" }}>
                  Department of Computer Science &amp; Engineering
                </div>
                <h3 style={{ margin: "2px 0 0", fontSize: "1.3rem", fontWeight: 800 }}>
                  Weekly Faculty Teaching Timetable
                </h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--pencil)" }}>
                  {teacherName} &middot; Workload: {agenda.weekly_hours || 14} Hours/Week across {agenda.subject_cards.length} Courses
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowTimetableModal(false)}
                style={{ padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--canvas-subtle)", borderBottom: "2px solid var(--rule)" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", width: 110 }}>Day</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>P1 (09:00 - 10:00)</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>P2 (10:00 - 11:00)</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>P3 (11:15 - 12:15)</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>P4 (12:15 - 01:15)</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>P5 (02:00 - 03:00)</th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}>P6 (03:00 - 04:00)</th>
                  </tr>
                </thead>
                <tbody>
                  {DAYS_OF_WEEK.map((day) => {
                    const daySlots = (agenda.weekly_timetable || []).filter((s) => s.day === day);
                    const isToday = day === (agenda.day_name || "Friday");

                    return (
                      <tr
                        key={day}
                        style={{
                          borderBottom: "1px solid var(--rule)",
                          background: isToday ? "rgba(37,99,235,0.04)" : undefined,
                        }}
                      >
                        <td style={{ padding: "12px", fontWeight: 700, verticalAlign: "top" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span>{day}</span>
                            {isToday && (
                              <span style={{ fontSize: "0.65rem", padding: "1px 4px", borderRadius: 3, background: "var(--primary)", color: "#fff", fontWeight: 700 }}>
                                Today
                              </span>
                            )}
                          </div>
                        </td>

                        {[1, 2, 3, 4, 5, 6].map((pNum) => {
                          const slot = daySlots.find((s) => s.period_number === pNum);

                          return (
                            <td key={pNum} style={{ padding: "8px 10px", verticalAlign: "top" }}>
                              {slot ? (
                                <div
                                  style={{
                                    padding: "6px 8px",
                                    borderRadius: 4,
                                    background: "var(--canvas)",
                                    border: "1px solid var(--rule)",
                                    borderLeft: "3px solid var(--primary)",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  <div style={{ fontWeight: 700, color: "var(--primary)" }}>{slot.course_code}</div>
                                  <div style={{ fontSize: "0.7rem", color: "var(--pencil)" }}>
                                    {slot.section} &middot; {slot.room}
                                  </div>
                                  <div style={{ fontSize: "0.65rem", color: "var(--ink)", marginTop: 2, fontWeight: 500 }}>
                                    {slot.class_type}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ color: "var(--pencil)", fontSize: "0.7rem", padding: "6px 8px" }}>
                                  —
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--rule)", fontSize: "0.8rem", color: "var(--pencil)" }}>
              <span>Tea Break: 11:00 AM - 11:15 AM &middot; Lunch Break: 01:15 PM - 02:00 PM</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowTimetableModal(false)}
              >
                Close Timetable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
