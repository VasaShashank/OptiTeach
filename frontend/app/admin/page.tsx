"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  RefreshCw,
  School,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  ShieldAlert,
  LogOut,
  ArrowLeft,
  FileSpreadsheet,
  Search,
  Check,
  Calendar,
  Layers,
} from "lucide-react";
import { adminAPI } from "@/lib/api";
import { useSession, clearSession } from "@/lib/auth";
import type { AdminOverview, CourseMapping, StudentItem } from "@/lib/types";

type AdminTab = "mappings" | "students" | "obe";
type AdminView = "dashboard" | "enroll-faculty" | "create-course" | "section-students";

const SAMPLE_RVCE_NAMES = [
  "Aarav Sharma", "Aditi Rao", "Akash Nair", "Ananya Hegde", "Anirudh Kulkarni",
  "Anusha Patil", "Aravind Swamy", "Archana Murthy", "Ashwin Prasad", "Ayush Verma",
  "Bhavana Shetty", "Chetan Kumar", "Chinmay Deshpande", "Deepa Nayak", "Dhruv Gowda",
  "Divya S", "Gagan R", "Ganesh Bhat", "Gayatri Joshi", "Harish V",
  "Isha K", "Karthik Raja", "Kavya Ramesh", "Keerthi N", "Kiran Mai",
  "Lakshmi Narayana", "Madhav Shenoy", "Manish K", "Meghana Prabhu", "Naveen Chandra",
  "Neha Sundaram", "Nikhil Kamath", "Niranjan Pai", "Pallavi R", "Pooja Hegde",
  "Prajwal Gowda", "Pranav Mohan", "Prathiksha Rao", "Rahul Dravid", "Rakshith Shetty",
  "Rithvik M", "Rohan Gupta", "Sahana K", "Sameer Ahmed", "Sanjay Dutt",
  "Shreya Shenoy", "Siddharth Verma", "Sneha K", "Spoorthi Bhat", "Srinivas Prasad",
  "Suchitra Rao", "Suraj N", "Swathi Acharya", "Tanvi Kulkarni", "Tarun Kumar",
  "Tejas Gowda", "Varun Shenoy", "Vidya Sagar", "Vinay Kumar", "Yashaswini R"
];

function generate60RVCEStudents(semester: number, section: string) {
  const yearCode = semester === 3 ? "24" : semester === 5 ? "23" : "22";
  const startNum = section.toUpperCase() === "B" ? 61 : 1;
  return SAMPLE_RVCE_NAMES.map((name, idx) => {
    const num = String(startNum + idx).padStart(3, "0");
    const usn = `1RV${yearCode}CS${num}`;
    const cleanName = name.toLowerCase().replace(/[^a-z]/g, "");
    const email = `${cleanName}.cs${yearCode}@rvce.edu.in`;
    return `${usn}, ${name}, ${email}`;
  }).join("\n");
}

export default function AdminPortalPage() {
  const { user } = useSession();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [mappings, setMappings] = useState<CourseMapping[]>([]);
  const [teachers, setTeachers] = useState<
    { id: string; full_name: string; email: string; designation: string; employee_id: string }[]
  >([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [activeTab, setActiveTab] = useState<AdminTab>("mappings");
  const [loading, setLoading] = useState(true);

  // Dedicated view state: zero-scrolling dedicated views for each admin action
  const [adminView, setAdminView] = useState<AdminView>("dashboard");

  // Filters for students
  const [selectedSem, setSelectedSem] = useState<number>(5);
  const [selectedSec, setSelectedSec] = useState<string>("A");

  // State for reassign modal
  const [editingMapping, setEditingMapping] = useState<CourseMapping | null>(null);
  const [targetTeacherId, setTargetTeacherId] = useState<string>("");
  const [savingMapping, setSavingMapping] = useState(false);
  const [mappingSemFilter, setMappingSemFilter] = useState<string>("all");

  // State for enrolling new faculty
  const [newTeacherForm, setNewTeacherForm] = useState({
    full_name: "",
    email: "",
    employee_id: "",
    department: "Computer Science & Engineering",
    designation: "Assistant Professor",
    password: "faculty123",
  });
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [facultyFilter, setFacultyFilter] = useState("");

  // State for creating and mapping course
  const [newCourseForm, setNewCourseForm] = useState({
    teacher_id: "",
    code: "",
    title: "",
    semester: "5th Sem",
    section_name: "Section A",
    room_number: "Room CS-301",
    total_classes: 45,
    period_duration: 60,
  });
  const [savingCourse, setSavingCourse] = useState(false);

  // State for LMS section bulk enrollment
  const [bulkText, setBulkText] = useState("");
  const [bulkBatchYear, setBulkBatchYear] = useState("2023-2027");
  const [bulkEnrolling, setBulkEnrolling] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [studentSearch, setStudentSearch] = useState("");

  // State for adding student manually
  const [newStudentForm, setNewStudentForm] = useState({
    usn: "",
    full_name: "",
    email: "",
    department: "Computer Science & Engineering",
    semester: 5,
    section: "A",
    batch_year: "2023-2027",
  });
  const [savingStudent, setSavingStudent] = useState(false);

  // State for simulation
  const [simulating, setSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const loadAll = async () => {
    try {
      const [ov, mp, tc, st] = await Promise.all([
        adminAPI.getOverview().catch(() => null),
        adminAPI.getMappings().catch(() => []),
        adminAPI.listTeachers().catch(() => []),
        adminAPI.listStudents({ semester: selectedSem, section: selectedSec }).catch(() => []),
      ]);
      setOverview(ov);
      setMappings(mp);
      setTeachers(tc);
      setStudents(st);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [selectedSem, selectedSec]);

  // Sync batch year when semester changes
  useEffect(() => {
    if (selectedSem === 3) setBulkBatchYear("2024-2028");
    else if (selectedSem === 5) setBulkBatchYear("2023-2027");
    else if (selectedSem === 7) setBulkBatchYear("2022-2026");
  }, [selectedSem]);

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMapping || !targetTeacherId) return;

    setSavingMapping(true);
    try {
      await adminAPI.updateMapping(editingMapping.course_id, { teacher_id: targetTeacherId });
      setEditingMapping(null);
      await loadAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reassign course");
    } finally {
      setSavingMapping(false);
    }
  };

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTeacher(true);
    try {
      await adminAPI.createTeacher(newTeacherForm);
      setNewTeacherForm({
        full_name: "",
        email: "",
        employee_id: "",
        department: "Computer Science & Engineering",
        designation: "Assistant Professor",
        password: "faculty123",
      });
      await loadAll();
      alert("Faculty member enrolled successfully into RVCE CSE department!");
      setAdminView("dashboard");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to enroll faculty");
    } finally {
      setSavingTeacher(false);
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const teacherId = newCourseForm.teacher_id || (teachers[0] ? teachers[0].id : "");
    if (!teacherId) {
      alert("Please select a faculty member to map this course to.");
      return;
    }

    setSavingCourse(true);
    try {
      await adminAPI.createCourse({
        ...newCourseForm,
        teacher_id: teacherId,
      });
      setNewCourseForm({
        teacher_id: "",
        code: "",
        title: "",
        semester: "5th Sem",
        section_name: "Section A",
        room_number: "Room CS-301",
        total_classes: 45,
        period_duration: 60,
      });
      await loadAll();
      alert("Course created and mapped to faculty successfully!");
      setAdminView("dashboard");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setSavingCourse(false);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStudent(true);
    try {
      await adminAPI.createStudent({
        ...newStudentForm,
        semester: selectedSem,
        section: selectedSec.toUpperCase(),
        batch_year: bulkBatchYear,
      });
      setNewStudentForm({
        usn: "",
        full_name: "",
        email: "",
        department: "Computer Science & Engineering",
        semester: selectedSem,
        section: selectedSec,
        batch_year: bulkBatchYear,
      });
      await loadAll();
      alert(`Student enrolled into Sem ${selectedSem} Sec ${selectedSec} and registered in all semester courses!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add student");
    } finally {
      setSavingStudent(false);
    }
  };

  const handleBulkEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkMessage(null);
    if (!bulkText.trim()) {
      setBulkMessage({ tone: "err", text: "Please enter student records or click 'Load 60 Sample RVCE Students'." });
      return;
    }

    // Parse lines: comma-separated or tab-separated USN, Full Name, Email
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsedStudents: { usn: string; full_name: string; email?: string }[] = [];

    for (const line of lines) {
      const parts = line.split(/[,\t]+/).map((p) => p.trim());
      if (parts.length >= 2) {
        parsedStudents.push({
          usn: parts[0].toUpperCase(),
          full_name: parts[1],
          email: parts[2] || undefined,
        });
      }
    }

    if (parsedStudents.length === 0) {
      setBulkMessage({ tone: "err", text: "No valid rows found. Format each line as: USN, Full Name, Email" });
      return;
    }

    setBulkEnrolling(true);
    try {
      const res = await adminAPI.bulkEnrollSection({
        semester: selectedSem,
        section: selectedSec.toUpperCase(),
        department: "Computer Science & Engineering",
        batch_year: bulkBatchYear,
        students: parsedStudents,
      });
      setBulkMessage({
        tone: "ok",
        text: `Success: ${res.message}. Total ${res.processed_students} students enrolled across ${res.matching_courses.length} courses (${res.enrolled_course_links} course enrollments created)!`,
      });
      setBulkText("");
      await loadAll();
    } catch (err) {
      setBulkMessage({
        tone: "err",
        text: err instanceof Error ? err.message : "Failed to bulk enroll section students.",
      });
    } finally {
      setBulkEnrolling(false);
    }
  };

  const handleSimulateStudents = async () => {
    setSimulating(true);
    setSimMessage(null);
    try {
      const res = await adminAPI.simulateCohortData({
        semester: selectedSem,
        section: selectedSec,
        student_count: 60,
      });
      setSimMessage({ tone: "ok", text: res.message });
      await loadAll();
    } catch (err) {
      setSimMessage({
        tone: "err",
        text: err instanceof Error ? err.message : "Failed to run student simulation",
      });
    } finally {
      setSimulating(false);
    }
  };

  // Distinct semesters for course filter
  const distinctSemesters = useMemo(() => {
    return Array.from(new Set(mappings.map((m) => m.semester))).sort();
  }, [mappings]);

  // Filtered students for section view
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const q = studentSearch.toLowerCase();
    return students.filter((s) => s.usn.toLowerCase().includes(q) || s.full_name.toLowerCase().includes(q));
  }, [students, studentSearch]);

  // Matching courses for current semester and section
  const sectionCourses = useMemo(() => {
    const semStr = `${selectedSem}th Sem`;
    const secStr = `Section ${selectedSec}`;
    return mappings.filter((m) => m.semester === semStr && (m.section_name === secStr || m.section_name.includes(selectedSec)));
  }, [mappings, selectedSem, selectedSec]);

  if (loading) return <div className="skeleton" style={{ height: 360 }} />;

  // RBAC Enforcement: Only users with the 'admin' role can access the Admin Portal
  if (user && user.role !== "admin") {
    return (
      <div className="card" style={{ padding: 36, maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
        <div style={{ display: "inline-flex", padding: 14, background: "rgba(239,68,68,0.1)", borderRadius: "50%", color: "var(--redpen)", marginBottom: 16 }}>
          <ShieldAlert size={36} />
        </div>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0 0 10px" }}>Administrator Access Required</h2>
        <p style={{ color: "var(--pencil)", lineHeight: 1.6, margin: "0 0 20px" }}>
          You are currently signed in as <strong>{user.full_name}</strong> (<em>Faculty / Teacher</em>).
          Department course allocations, teacher-semester mappings, and student cohort enrollments are restricted to
          Department Administrators, HODs, and Dean Academics.
        </p>
        <div style={{ background: "var(--canvas-subtle)", padding: 16, borderRadius: "var(--radius-sm)", marginBottom: 24, fontSize: "0.85rem", textAlign: "left" }}>
          <strong>Default RVCE Admin Account:</strong>
          <div style={{ marginTop: 4 }}>Email: <code>admin@optiteach.edu</code></div>
          <div>Password: <code>admin123</code></div>
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              clearSession();
              window.location.href = "/login?next=/admin";
            }}
          >
            <LogOut size={16} /> Sign in as Administrator
          </button>
          <a href="/courses" className="btn btn-secondary">
            Back to My Courses
          </a>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DEDICATED VIEW 1: ENROLL FACULTY (Zero-scrolling dedicated page)
  // ══════════════════════════════════════════════════════════════
  if (adminView === "enroll-faculty") {
    return (
      <div className="animate-fade-in" style={{ display: "grid", gap: 20 }}>
        {/* Top Back Navigation Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setAdminView("dashboard")}
            style={{ fontWeight: 600 }}
          >
            <ArrowLeft size={16} /> &larr; Back to Admin Dashboard
          </button>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--pencil)" }}>
            <School size={15} /> RV College of Engineering &middot; CSE Faculty Administration
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 460px) 1fr", gap: 24, alignItems: "start" }}>
          {/* Enroll Form Card */}
          <div className="card" style={{ padding: 24, borderTop: "4px solid var(--primary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ background: "rgba(37,99,235,0.1)", padding: 8, borderRadius: "50%", color: "var(--primary)" }}>
                <UserPlus size={20} />
              </div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Enroll New Faculty</h2>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: "0.85rem", color: "var(--pencil)" }}>
              Create an official faculty account for RVCE Computer Science &amp; Engineering.
              After creation, this teacher will appear in course allocation mappings.
            </p>

            <form onSubmit={handleCreateTeacher} style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Full Name &amp; Title
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Dr. Preeti Rao"
                  value={newTeacherForm.full_name}
                  onChange={(e) => setNewTeacherForm({ ...newTeacherForm, full_name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Institutional Email
                </label>
                <input
                  type="email"
                  className="input"
                  placeholder="e.g. preetirao@rvce.edu.in"
                  value={newTeacherForm.email}
                  onChange={(e) => setNewTeacherForm({ ...newTeacherForm, email: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Employee ID
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. RVCE-CS-108"
                    value={newTeacherForm.employee_id}
                    onChange={(e) => setNewTeacherForm({ ...newTeacherForm, employee_id: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Designation
                  </label>
                  <select
                    className="select"
                    value={newTeacherForm.designation}
                    onChange={(e) => setNewTeacherForm({ ...newTeacherForm, designation: e.target.value })}
                  >
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="Associate Professor">Associate Professor</option>
                    <option value="Professor">Professor</option>
                    <option value="Professor & HOD">Professor &amp; HOD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Department
                </label>
                <input
                  type="text"
                  className="input"
                  value={newTeacherForm.department}
                  readOnly
                  style={{ background: "var(--canvas-subtle)" }}
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Temporary Password
                </label>
                <input
                  type="password"
                  className="input"
                  value={newTeacherForm.password}
                  onChange={(e) => setNewTeacherForm({ ...newTeacherForm, password: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={savingTeacher}>
                  {savingTeacher ? "Enrolling..." : "Enroll Faculty Member"}
                </button>
              </div>
            </form>
          </div>

          {/* Existing Faculty Roster */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                  Current CSE Department Faculty Roster ({teachers.length})
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--pencil)", margin: "2px 0 0" }}>
                  Active faculty members available for course teaching assignments.
                </p>
              </div>
              <div style={{ width: 220 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Search faculty..."
                  value={facultyFilter}
                  onChange={(e) => setFacultyFilter(e.target.value)}
                  style={{ fontSize: "0.85rem", padding: "6px 10px" }}
                />
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--rule)" }}>
                    <th style={{ padding: "8px 10px" }}>Faculty Name</th>
                    <th style={{ padding: "8px 10px" }}>Designation</th>
                    <th style={{ padding: "8px 10px" }}>Employee ID</th>
                    <th style={{ padding: "8px 10px" }}>Assigned Courses</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers
                    .filter((t) => !facultyFilter || t.full_name.toLowerCase().includes(facultyFilter.toLowerCase()) || t.email.toLowerCase().includes(facultyFilter.toLowerCase()))
                    .map((t) => {
                      const teacherCourses = mappings.filter((m) => m.teacher_id === t.id);
                      return (
                        <tr key={t.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                          <td style={{ padding: "10px", fontWeight: 600 }}>
                            <div>{t.full_name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--pencil)" }}>{t.email}</div>
                          </td>
                          <td style={{ padding: "10px" }}>{t.designation}</td>
                          <td style={{ padding: "10px", fontFamily: "monospace" }}>{t.employee_id || "N/A"}</td>
                          <td style={{ padding: "10px" }}>
                            {teacherCourses.length > 0 ? (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {teacherCourses.map((c) => (
                                  <span key={c.course_id} className="badge badge-primary" style={{ fontSize: "0.7rem" }}>
                                    {c.code} ({c.section_name})
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: "var(--caution)", fontSize: "0.75rem" }}>Awaiting allocation</span>
                            )}
                          </td>
                          <td style={{ padding: "10px", textAlign: "right" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                              onClick={() => {
                                setNewCourseForm((prev) => ({ ...prev, teacher_id: t.id }));
                                setAdminView("create-course");
                              }}
                            >
                              + Map Course
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DEDICATED VIEW 2: CREATE & MAP COURSE (Zero-scrolling dedicated page)
  // ══════════════════════════════════════════════════════════════
  if (adminView === "create-course") {
    return (
      <div className="animate-fade-in" style={{ display: "grid", gap: 20 }}>
        {/* Top Back Navigation Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setAdminView("dashboard")}
            style={{ fontWeight: 600 }}
          >
            <ArrowLeft size={16} /> &larr; Back to Admin Dashboard
          </button>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--pencil)" }}>
            <BookOpen size={15} /> RVCE Outcome-Based Curriculum Allocation
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 480px) 1fr", gap: 24, alignItems: "start" }}>
          {/* Create Course Form Card */}
          <div className="card" style={{ padding: 24, borderTop: "4px solid #10b981" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ background: "rgba(16,185,129,0.1)", padding: 8, borderRadius: "50%", color: "#10b981" }}>
                <BookOpen size={20} />
              </div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Create &amp; Map Course</h2>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: "0.85rem", color: "var(--pencil)" }}>
              Create an institutional course unit under RVCE Autonomous Scheme and map it directly to a faculty member.
            </p>

            <form onSubmit={handleCreateCourse} style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Course Title
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Automata Theory & Compiler Design"
                  value={newCourseForm.title}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, title: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Course Code
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. 21CS51"
                    value={newCourseForm.code}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, code: e.target.value.toUpperCase() })}
                    required
                  />
                </div>

                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Room / Lab
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Room CS-301"
                    value={newCourseForm.room_number}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, room_number: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Semester
                  </label>
                  <select
                    className="select"
                    value={newCourseForm.semester}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, semester: e.target.value })}
                  >
                    <option value="3rd Sem">3rd Sem (Semester 3)</option>
                    <option value="5th Sem">5th Sem (Semester 5)</option>
                    <option value="7th Sem">7th Sem (Semester 7)</option>
                  </select>
                </div>

                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Section
                  </label>
                  <select
                    className="select"
                    value={newCourseForm.section_name}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, section_name: e.target.value })}
                  >
                    <option value="Section A">Section A</option>
                    <option value="Section B">Section B</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Assigned Faculty Member
                </label>
                <select
                  className="select"
                  value={newCourseForm.teacher_id}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, teacher_id: e.target.value })}
                  required
                >
                  <option value="">-- Select Faculty --</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.designation}) &middot; {t.email}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Total Planned Periods
                  </label>
                  <input
                    type="number"
                    className="input"
                    min={15}
                    max={90}
                    value={newCourseForm.total_classes}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, total_classes: parseInt(e.target.value, 10) || 45 })}
                    required
                  />
                </div>

                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Period Duration (min)
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={newCourseForm.period_duration}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, period_duration: parseInt(e.target.value, 10) || 60 })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, background: "#10b981", border: "none" }} disabled={savingCourse}>
                  {savingCourse ? "Creating Course..." : "Create Course & Map Faculty"}
                </button>
              </div>
            </form>
          </div>

          {/* Current Course Allocations Summary */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 4px" }}>
              Current Department Course Allocations ({mappings.length})
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--pencil)", margin: "0 0 16px" }}>
              Active courses mapped to teaching faculty across RVCE CSE semesters.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ width: "100%", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--rule)" }}>
                    <th style={{ padding: "8px 10px" }}>Code</th>
                    <th style={{ padding: "8px 10px" }}>Course Title</th>
                    <th style={{ padding: "8px 10px" }}>Sem &amp; Sec</th>
                    <th style={{ padding: "8px 10px" }}>Assigned Faculty</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.course_id} style={{ borderBottom: "1px solid var(--rule)" }}>
                      <td style={{ padding: "10px", fontWeight: 700, color: "var(--primary)" }}>{m.code}</td>
                      <td style={{ padding: "10px", fontWeight: 600 }}>{m.title}</td>
                      <td style={{ padding: "10px" }}>
                        <span className="badge badge-primary">{m.semester}</span> {m.section_name}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <div style={{ fontWeight: 600 }}>{m.teacher_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--pencil)" }}>{m.teacher_email}</div>
                      </td>
                      <td style={{ padding: "10px", textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                          onClick={() => {
                            setEditingMapping(m);
                            setTargetTeacherId(m.teacher_id);
                          }}
                        >
                          Reassign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DEDICATED VIEW 3: LMS ENTER STUDENTS IN SECTION (Core LMS Feature)
  // ══════════════════════════════════════════════════════════════
  if (adminView === "section-students") {
    return (
      <div className="animate-fade-in" style={{ display: "grid", gap: 20 }}>
        {/* Top Back Navigation Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setAdminView("dashboard")}
            style={{ fontWeight: 600 }}
          >
            <ArrowLeft size={16} /> &larr; Back to Admin Dashboard
          </button>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--pencil)" }}>
            <GraduationCap size={15} /> RVCE Institutional LMS &middot; Section Roster Management
          </div>
        </div>

        {/* Section Picker Banner */}
        <div
          className="card"
          style={{
            padding: "18px 24px",
            background: "linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(16,185,129,0.05) 100%)",
            borderLeft: "5px solid var(--primary)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase" }}>
                Target Section Cohort
              </div>
              <h2 style={{ margin: "2px 0 0", fontSize: "1.4rem", fontWeight: 800 }}>
                Manage Section Students &middot; {selectedSem}th Sem Section {selectedSec}
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--pencil)" }}>
                Enrolling students here automatically registers them into all {selectedSem}th Sem Section {selectedSec} courses
                ({sectionCourses.length} active courses).
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div>
                <label className="label" style={{ fontSize: "0.75rem", marginBottom: 2 }}>
                  Semester
                </label>
                <select
                  className="select"
                  value={selectedSem}
                  onChange={(e) => setSelectedSem(parseInt(e.target.value, 10))}
                  style={{ fontWeight: 600 }}
                >
                  <option value={3}>3rd Sem (Semester 3)</option>
                  <option value={5}>5th Sem (Semester 5)</option>
                  <option value={7}>7th Sem (Semester 7)</option>
                </select>
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.75rem", marginBottom: 2 }}>
                  Section
                </label>
                <select
                  className="select"
                  value={selectedSec}
                  onChange={(e) => setSelectedSec(e.target.value)}
                  style={{ fontWeight: 600 }}
                >
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                </select>
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.75rem", marginBottom: 2 }}>
                  Batch Year
                </label>
                <input
                  type="text"
                  className="input"
                  value={bulkBatchYear}
                  onChange={(e) => setBulkBatchYear(e.target.value)}
                  style={{ width: 120, fontSize: "0.85rem" }}
                />
              </div>
            </div>
          </div>

          {/* Active Courses for this section */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: "0.8rem" }}>
            <span style={{ fontWeight: 700, color: "var(--pencil)" }}>Associated Semester Courses:</span>
            {sectionCourses.length > 0 ? (
              sectionCourses.map((c) => (
                <span key={c.course_id} className="badge badge-primary" style={{ padding: "3px 8px" }}>
                  {c.code}: {c.title} ({c.teacher_name})
                </span>
              ))
            ) : (
              <span style={{ color: "var(--caution)" }}>No courses mapped for this semester/section yet. Students will be enrolled once courses are created.</span>
            )}
          </div>
        </div>

        {bulkMessage && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              background: bulkMessage.tone === "ok" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
              color: bulkMessage.tone === "ok" ? "var(--greenpen)" : "var(--redpen)",
              border: `1px solid ${bulkMessage.tone === "ok" ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
              fontWeight: 500,
            }}
          >
            {bulkMessage.text}
          </div>
        )}

        {/* Enrollment Methods: Two-column Layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, alignItems: "start" }}>
          {/* Method 1: Bulk Section Cohort Paste */}
          <div className="card" style={{ padding: 24, borderTop: "4px solid var(--primary)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  <FileSpreadsheet size={18} color="var(--primary)" /> Bulk Roster Enrollment (Section Cohort)
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--pencil)", margin: "2px 0 0" }}>
                  Paste student roster list (CSV / TSV format: <code>USN, Full Name, Email</code>).
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "0.8rem", padding: "5px 10px", fontWeight: 600 }}
                onClick={() => setBulkText(generate60RVCEStudents(selectedSem, selectedSec))}
              >
                <Sparkles size={14} /> Load 60 Sample RVCE Students
              </button>
            </div>

            <form onSubmit={handleBulkEnroll} style={{ display: "grid", gap: 12 }}>
              <textarea
                className="input"
                rows={10}
                placeholder={`1RV23CS001, Aarav Sharma, aaravsharma.cs23@rvce.edu.in&#10;1RV23CS002, Aditi Rao, aditirao.cs23@rvce.edu.in&#10;1RV23CS003, Akash Nair, akashnair.cs23@rvce.edu.in&#10;...`}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                style={{ fontFamily: "monospace", fontSize: "0.8rem", lineHeight: 1.5, resize: "vertical" }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--pencil)" }}>
                <span>Lines detected: {bulkText.split("\n").filter((l) => l.trim()).length} students</span>
                <span>Auto-binds to {sectionCourses.length} semester courses</span>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%", padding: "10px 16px", fontWeight: 700 }}
                disabled={bulkEnrolling}
              >
                {bulkEnrolling ? "Enrolling Section..." : `Enroll Entire Section (${selectedSem}th Sem Sec ${selectedSec})`}
              </button>
            </form>
          </div>

          {/* Method 2: Single Student Manual Entry */}
          <div className="card" style={{ padding: 24, borderTop: "4px solid #047857" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 6 }}>
              <UserPlus size={18} color="#047857" /> Single Student Entry
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--pencil)", margin: "0 0 16px" }}>
              Add an individual student to this section and register them immediately.
            </p>

            <form onSubmit={handleCreateStudent} style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  University Seat Number (USN)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 1RV23CS075"
                  value={newStudentForm.usn}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, usn: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Ananya Rao"
                  value={newStudentForm.full_name}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, full_name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  College Email
                </label>
                <input
                  type="email"
                  className="input"
                  placeholder="e.g. ananyarao.cs23@rvce.edu.in"
                  value={newStudentForm.email}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, email: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Semester
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={`${selectedSem}th Sem`}
                    readOnly
                    style={{ background: "var(--canvas-subtle)" }}
                  />
                </div>
                <div>
                  <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                    Section
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={`Section ${selectedSec}`}
                    readOnly
                    style={{ background: "var(--canvas-subtle)" }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-secondary"
                style={{ width: "100%", marginTop: 8, fontWeight: 700 }}
                disabled={savingStudent}
              >
                {savingStudent ? "Adding..." : "+ Add Student to Section"}
              </button>
            </form>
          </div>
        </div>

        {/* Live Section Roster Table */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
                Live Section Roster: {selectedSem}th Sem Section {selectedSec} ({students.length} Enrolled)
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--pencil)", margin: "2px 0 0" }}>
                Continuous Internal Evaluation (CIE) and VTU attendance compliance records.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 220 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Search USN or Name..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  style={{ fontSize: "0.85rem", padding: "6px 10px" }}
                />
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSimulateStudents}
                disabled={simulating}
                style={{ fontSize: "0.85rem" }}
              >
                <RefreshCw size={14} className={simulating ? "animate-spin" : ""} /> Reseed CIE &amp; Attendance
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--rule)" }}>
                  <th style={{ padding: "10px 12px" }}>USN</th>
                  <th style={{ padding: "10px 12px" }}>Student Name</th>
                  <th style={{ padding: "10px 12px" }}>College Email</th>
                  <th style={{ padding: "10px 12px" }}>Attendance</th>
                  <th style={{ padding: "10px 12px" }}>VTU Eligibility</th>
                  <th style={{ padding: "10px 12px" }}>CIE Total (/50)</th>
                  <th style={{ padding: "10px 12px" }}>Academic Standing</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--pencil)" }}>
                      No students enrolled in {selectedSem}th Sem Section {selectedSec} yet.
                      Use the bulk roster paste above to enroll students.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s) => {
                    const isEligible = s.attendance_percentage >= 85;
                    const isCondonable = s.attendance_percentage >= 75 && s.attendance_percentage < 85;
                    return (
                      <tr key={s.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 700 }}>{s.usn}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{s.full_name}</td>
                        <td style={{ padding: "10px 12px", fontSize: "0.8rem", color: "var(--pencil)" }}>{s.email}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700 }}>
                          <span style={{ color: isEligible ? "var(--greenpen)" : isCondonable ? "var(--amberpen)" : "var(--redpen)" }}>
                            {s.attendance_percentage}%
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {isEligible ? (
                            <span className="badge badge-success" style={{ fontSize: "0.75rem" }}>Eligible (&ge;85%)</span>
                          ) : isCondonable ? (
                            <span className="badge badge-warning" style={{ fontSize: "0.75rem" }}>Condonation Req. (75-84%)</span>
                          ) : (
                            <span className="badge badge-danger" style={{ fontSize: "0.75rem" }}>NSAR Shortage (&lt;75%)</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 700 }}>
                          {s.cie_total > 0 ? `${s.cie_total} / 50` : "-"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {s.is_at_risk ? (
                            <span className="badge badge-danger">At Risk</span>
                          ) : (
                            <span className="badge badge-success">Good Standing</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DEFAULT VIEW: MAIN ADMIN DASHBOARD (Overview, Mappings, Students, OBE)
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="animate-fade-in" style={{ display: "grid", gap: 24 }}>
      {/* RVCE Institutional Header */}
      <header
        className="card"
        style={{
          padding: 24,
          background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 60%, #047857 100%)",
          color: "#ffffff",
          borderRadius: "var(--radius-md)",
          boxShadow: "0 10px 25px -5px rgba(30, 58, 138, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.15)", padding: "4px 10px", borderRadius: 20, fontSize: "0.8rem", fontWeight: 600, marginBottom: 10 }}>
              <School size={15} /> RV College of Engineering (RVCE) &middot; Autonomous Institution under VTU
            </div>
            <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: "#ffffff" }}>
              Academic Administration &amp; Faculty Course Mapping
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "0.95rem", color: "rgba(255,255,255,0.85)", maxWidth: 720 }}>
              Department of Computer Science &amp; Engineering &middot; Outcome-Based Education (OBE) Portal.
              Manage faculty allocations across semesters, sections, and simulate realistic student cohorts with Continuous Internal Evaluation (CIE) data.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="btn"
              style={{ background: "#ffffff", color: "#1e3a8a", fontWeight: 700 }}
              onClick={() => setAdminView("enroll-faculty")}
            >
              <UserPlus size={16} /> Enroll Faculty
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "#10b981", color: "#ffffff", fontWeight: 700, border: "none" }}
              onClick={() => {
                if (teachers.length > 0 && !newCourseForm.teacher_id) {
                  setNewCourseForm((prev) => ({ ...prev, teacher_id: teachers[0].id }));
                }
                setAdminView("create-course");
              }}
            >
              <BookOpen size={16} /> Create &amp; Map Course
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "#f59e0b", color: "#111827", fontWeight: 700, border: "none" }}
              onClick={() => setAdminView("section-students")}
            >
              <GraduationCap size={16} /> Enter Students in Section
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "rgba(255,255,255,0.18)", color: "#ffffff", fontWeight: 600, border: "1px solid rgba(255,255,255,0.3)" }}
              onClick={handleSimulateStudents}
              disabled={simulating}
            >
              <RefreshCw size={16} className={simulating ? "animate-spin" : ""} />
              {simulating ? "Simulating..." : "Simulate RVCE Students"}
            </button>
          </div>
        </div>
      </header>

      {/* KPI Overview Cards */}
      {overview && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--pencil)", fontSize: "0.8rem" }}>
              <Users size={15} /> Faculty Members
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{overview.total_teachers}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 2 }}>CSE Department</div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--pencil)", fontSize: "0.8rem" }}>
              <BookOpen size={15} /> Active Courses
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{overview.total_courses}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 2 }}>Semesters 3, 5, 7</div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--pencil)", fontSize: "0.8rem" }}>
              <GraduationCap size={15} /> Enrolled Students
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4 }}>{overview.total_students}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 2 }}>Across all sections</div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--pencil)", fontSize: "0.8rem" }}>
              <UserCheck size={15} /> Avg Attendance
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4, color: "var(--greenpen)" }}>
              {overview.average_attendance}%
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 2 }}>Autonomous requirement: &ge;75%</div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--pencil)", fontSize: "0.8rem" }}>
              <Award size={15} /> OBE Attainment
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 4, color: "var(--primary)" }}>
              {overview.attainment_rate_percentage}%
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--pencil)", marginTop: 2 }}>Scores &ge; 60% threshold</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--rule)", paddingBottom: 8 }}>
        <button
          type="button"
          className={`btn ${activeTab === "mappings" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("mappings")}
        >
          <BookOpen size={16} /> Course &amp; Teacher Mappings
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "students" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("students")}
        >
          <Users size={16} /> Student Cohorts &amp; Results
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "obe" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("obe")}
        >
          <Award size={16} /> RVCE OBE &amp; NBA Attainment
        </button>
      </div>

      {simMessage && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.85rem",
            background: simMessage.tone === "ok" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            color: simMessage.tone === "ok" ? "var(--greenpen)" : "var(--redpen)",
            border: `1px solid ${simMessage.tone === "ok" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
          }}
        >
          {simMessage.text}
        </div>
      )}

      {/* Tab 1: Course Mappings with Semester-Wise Organization */}
      {activeTab === "mappings" && (() => {
        const filteredMappings = mappingSemFilter === "all"
          ? mappings
          : mappings.filter((m) => m.semester === mappingSemFilter);

        const groups: Record<string, CourseMapping[]> = {};
        for (const m of filteredMappings) {
          if (!groups[m.semester]) groups[m.semester] = [];
          groups[m.semester].push(m);
        }

        return (
          <div style={{ display: "grid", gap: 24 }}>
            {/* Semester Filter Controls */}
            <div className="card" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
                    Semester-Wise Course Allocations
                  </h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--pencil)", margin: "2px 0 0" }}>
                    Select a semester cohort to view and manage course-faculty assignments.
                  </p>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setMappingSemFilter("all")}
                    style={{
                      padding: "6px 12px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--rule)",
                      background: mappingSemFilter === "all" ? "var(--primary)" : "var(--canvas-subtle)",
                      color: mappingSemFilter === "all" ? "#ffffff" : "var(--ink)",
                      cursor: "pointer",
                    }}
                  >
                    All Semesters ({mappings.length})
                  </button>
                  {distinctSemesters.map((sem) => {
                    const count = mappings.filter((m) => m.semester === sem).length;
                    return (
                      <button
                        key={sem}
                        type="button"
                        onClick={() => setMappingSemFilter(sem)}
                        style={{
                          padding: "6px 12px",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--rule)",
                          background: mappingSemFilter === sem ? "var(--primary)" : "var(--canvas-subtle)",
                          color: mappingSemFilter === sem ? "#ffffff" : "var(--ink)",
                          cursor: "pointer",
                        }}
                      >
                        {sem} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Render Grouped Tables */}
            {Object.keys(groups).length === 0 ? (
              <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--pencil)" }}>
                No courses found for the selected semester.
              </div>
            ) : (
              Object.entries(groups).map(([semName, semMappings]) => (
                <div key={semName} className="card" style={{ padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--rule)", paddingBottom: 12, marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="badge badge-primary" style={{ fontWeight: 700 }}>{semName}</span>
                      <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                        Curriculum Allotments
                      </h4>
                    </div>
                    <span style={{ fontSize: "0.8rem", color: "var(--pencil)" }}>
                      {semMappings.length} courses &middot; {semMappings.reduce((acc, m) => acc + m.student_count, 0)} students &middot; {semMappings.reduce((acc, m) => acc + m.total_classes, 0)} periods
                    </span>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="table" style={{ width: "100%", fontSize: "0.875rem" }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "1px solid var(--rule)" }}>
                          <th style={{ padding: "10px 12px" }}>Code</th>
                          <th style={{ padding: "10px 12px" }}>Course Title</th>
                          <th style={{ padding: "10px 12px" }}>Section</th>
                          <th style={{ padding: "10px 12px" }}>Assigned Faculty</th>
                          <th style={{ padding: "10px 12px" }}>Enrolled</th>
                          <th style={{ padding: "10px 12px" }}>Classes</th>
                          <th style={{ padding: "10px 12px", textAlign: "right" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {semMappings.map((m) => (
                          <tr key={m.course_id} style={{ borderBottom: "1px solid var(--rule)" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--primary)" }}>{m.code}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 600 }}>{m.title}</td>
                            <td style={{ padding: "10px 12px" }}>
                              <span style={{ background: "var(--canvas-subtle)", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                                {m.section_name}
                              </span>
                            </td>
                            <td style={{ padding: "10px 12px" }}>
                              <div style={{ fontWeight: 600 }}>{m.teacher_name}</div>
                              <div style={{ fontSize: "0.75rem", color: "var(--pencil)" }}>{m.teacher_email}</div>
                            </td>
                            <td style={{ padding: "10px 12px" }}>{m.student_count} students</td>
                            <td style={{ padding: "10px 12px" }}>{m.total_classes} periods</td>
                            <td style={{ padding: "10px 12px", textAlign: "right" }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                                onClick={() => {
                                  setEditingMapping(m);
                                  setTargetTeacherId(m.teacher_id);
                                }}
                              >
                                Reassign
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}

            {/* Department Faculty Directory & Workload Status */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
                    Faculty Roster &amp; Teaching Allotment Status
                  </h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--pencil)", margin: "2px 0 0" }}>
                    When new faculty sign up or register, administrators map them to courses here.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: "0.8rem" }}
                  onClick={() => setAdminView("enroll-faculty")}
                >
                  <UserPlus size={14} /> Enroll Faculty
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                {teachers.map((t) => {
                  const teacherCourses = mappings.filter((m) => m.teacher_id === t.id);
                  const isUnassigned = teacherCourses.length === 0;

                  return (
                    <div
                      key={t.id}
                      style={{
                        padding: 14,
                        borderRadius: "var(--radius-sm)",
                        border: isUnassigned ? "1px dashed var(--caution)" : "1px solid var(--rule)",
                        background: isUnassigned ? "rgba(245,158,11,0.04)" : "var(--canvas-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{t.full_name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--pencil)" }}>
                              {t.designation} &middot; {t.employee_id}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--pencil)" }}>{t.email}</div>
                          </div>

                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: isUnassigned ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
                              color: isUnassigned ? "var(--caution)" : "var(--tick)",
                            }}
                          >
                            {isUnassigned ? "Awaiting Course" : `${teacherCourses.length} Courses`}
                          </span>
                        </div>

                        {teacherCourses.length > 0 ? (
                          <div style={{ marginTop: 10, fontSize: "0.8rem" }}>
                            <span style={{ color: "var(--pencil)" }}>Assigned: </span>
                            {teacherCourses.map((c) => (
                              <span key={c.course_id} style={{ display: "inline-block", background: "var(--canvas)", border: "1px solid var(--rule)", borderRadius: 3, padding: "1px 5px", fontSize: "0.75rem", marginRight: 4, fontWeight: 600 }}>
                                {c.code} ({c.section_name})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p style={{ margin: "8px 0 0", fontSize: "0.75rem", color: "var(--caution)", fontWeight: 500 }}>
                            Newly registered faculty member. Not yet mapped to any semester course.
                          </p>
                        )}
                      </div>

                      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                          onClick={() => {
                            setNewCourseForm((prev) => ({ ...prev, teacher_id: t.id }));
                            setAdminView("create-course");
                          }}
                        >
                          + Map to Course
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tab 2: Student Cohorts */}
      {activeTab === "students" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
                RVCE Student Cohort Roster &amp; CIE Records
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--pencil)", margin: "2px 0 0" }}>
                Filter students by semester and section to examine their attendance and Continuous Internal Evaluation marks.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="select"
                value={selectedSem}
                onChange={(e) => setSelectedSem(parseInt(e.target.value, 10))}
                style={{ width: "auto" }}
              >
                <option value={3}>Semester 3 (2024-2028)</option>
                <option value={5}>Semester 5 (2023-2027)</option>
                <option value={7}>Semester 7 (2022-2026)</option>
              </select>

              <select
                className="select"
                value={selectedSec}
                onChange={(e) => setSelectedSec(e.target.value)}
                style={{ width: "auto" }}
              >
                <option value="A">Section A</option>
                <option value="B">Section B</option>
              </select>

              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: "0.85rem", background: "#f59e0b", color: "#111827", border: "none" }}
                onClick={() => setAdminView("section-students")}
              >
                <GraduationCap size={14} /> Enter Students in Section
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSimulateStudents}
                disabled={simulating}
              >
                <RefreshCw size={14} className={simulating ? "animate-spin" : ""} /> Reseed Cohort
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--rule)" }}>
                  <th style={{ padding: "10px 12px" }}>USN</th>
                  <th style={{ padding: "10px 12px" }}>Name</th>
                  <th style={{ padding: "10px 12px" }}>Sem &amp; Sec</th>
                  <th style={{ padding: "10px 12px" }}>Attendance</th>
                  <th style={{ padding: "10px 12px" }}>CIE Total (/50)</th>
                  <th style={{ padding: "10px 12px" }}>Academic Status</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--pencil)" }}>
                      No students simulated for Sem {selectedSem} Sec {selectedSec} yet. Click &ldquo;Reseed Cohort&rdquo; or &ldquo;Enter Students in Section&rdquo; to populate students.
                    </td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{s.usn}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <div>{s.full_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--pencil)" }}>{s.email}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        Sem {s.semester} &middot; Sec {s.section}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontWeight: 600,
                          color:
                            s.attendance_percentage >= 85
                              ? "var(--greenpen)"
                              : s.attendance_percentage >= 75
                                ? "var(--amberpen)"
                                : "var(--redpen)",
                        }}
                      >
                        {s.attendance_percentage}%
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>
                        {s.cie_total > 0 ? `${s.cie_total} / 50` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {s.is_at_risk ? (
                          <span className="badge badge-danger">At Risk</span>
                        ) : (
                          <span className="badge badge-success">Good Standing</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: OBE Attainment */}
      {activeTab === "obe" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 6px" }}>
              RVCE Autonomous Outcome-Based Education (OBE) Attainment
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--pencil)", margin: "0 0 16px" }}>
              Compliance with National Board of Accreditation (NBA) criteria: Attainment is achieved when &ge; 60% of students meet the target score in each Course Outcome.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <div style={{ padding: 16, background: "var(--canvas-subtle)", borderRadius: "var(--radius-sm)", border: "1px solid var(--rule)" }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem" }}>Bloom&apos;s Taxonomy Cognitive Hierarchy</h4>
                <div style={{ display: "grid", gap: 6, fontSize: "0.85rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>L1 Remember:</span> <strong style={{ color: "var(--greenpen)" }}>82.5% (Attained)</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>L2 Understand:</span> <strong style={{ color: "var(--greenpen)" }}>78.0% (Attained)</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>L3 Apply:</span> <strong style={{ color: "var(--greenpen)" }}>64.5% (Attained)</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>L4 Analyze:</span> <strong style={{ color: "var(--redpen)" }}>56.0% (Remedial Action)</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>L5 Evaluate:</span> <strong style={{ color: "var(--amberpen)" }}>59.0% (Remedial Action)</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>L6 Create:</span> <strong style={{ color: "var(--greenpen)" }}>62.0% (Attained)</strong>
                  </div>
                </div>
              </div>

              <div style={{ padding: 16, background: "var(--canvas-subtle)", borderRadius: "var(--radius-sm)", border: "1px solid var(--rule)" }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem" }}>Curriculum Optimization Remedial Impact</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--pencil)", lineHeight: 1.5, margin: 0 }}>
                  Because L4 Analyze (specifically Normalization &amp; Attribute Closure) fell below 60%, the OptiTeach
                  MILP optimization solver automatically allocated <strong>+2 remedial periods</strong> to Unit 3 and flagged
                  a 10-minute prerequisite revision checkpoint in Period 15, preventing learning gaps from propagating to downstream
                  concepts (Transaction Processing and Indexing).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Faculty Modal (Fixed Centered Modal) */}
      {editingMapping && (
        <div className="modal-backdrop" onClick={() => setEditingMapping(null)}>
          <div className="modal-box card" style={{ maxWidth: 460, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 6px", fontSize: "1.1rem" }}>
              Reassign Faculty for {editingMapping.code}
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--pencil)" }}>
              {editingMapping.title} &middot; {editingMapping.semester} ({editingMapping.section_name})
            </p>

            <form onSubmit={handleReassign} style={{ display: "grid", gap: 14 }}>
              <div>
                <label className="label" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
                  Select New Teacher
                </label>
                <select
                  className="select"
                  value={targetTeacherId}
                  onChange={(e) => setTargetTeacherId(e.target.value)}
                  required
                >
                  <option value="">-- Choose faculty --</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} ({t.designation}) &middot; {t.email}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingMapping(null)}
                  disabled={savingMapping}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingMapping}>
                  {savingMapping ? "Updating..." : "Confirm Reassignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
