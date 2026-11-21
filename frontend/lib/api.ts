import { clearSession, getToken } from "./auth";
import type {
  Course,
  ExtractedCurriculum,
  CurriculumGraph,
  CourseOptimization,
  NextClassPlan,
  LessonPlan,
  LessonPlanReview,
  LessonPlanVersion,
  LessonPlanDiff,
  AssessmentItem,
  CourseAnalytics,
  TableSchemaInfo,
  QueryDemoResult,
  QueryMeta,
  ClassSessionItem,
  SessionLogInput,
  SessionLogResult,
  TeachingMethodItem,
  GraphVersion,
  GraphDiff,
  DatabaseObjects,
  ConsoleResult,
  LabScenario,
  LabResult,
  AggregationMeta,
  AggregationResult,
  ConsistencyReport,
  SessionUserResponse,
  CurriculumStructure,
  ConceptEditResult,
  ConceptType,
  CourseMembers,
  MemberRole,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/** Thrown for non-2xx responses; `status` and the response body are kept for callers (e.g. 409 handling). */
export class APIError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response, endpoint: string): Promise<T> {
  if (res.status === 401 && !endpoint.startsWith("/auth/login")) {
    clearSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = typeof body.detail === "string" ? body.detail : `API Error: ${res.status}`;
    throw new APIError(detail, res.status, body);
  }
  return res.json();
}

async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...options.headers },
  });
  return handle<T>(res, endpoint);
}

async function postForm<T>(endpoint: string, form: FormData): Promise<T> {
  // No Content-Type: the browser sets the multipart boundary itself
  const res = await fetch(`${API_BASE}${endpoint}`, { method: "POST", body: form, headers: authHeaders() });
  return handle<T>(res, endpoint);
}

function syllabusForm(file?: File, rawText?: string): FormData {
  const form = new FormData();
  if (file) form.append("file", file);
  else if (rawText) form.append("raw_text", rawText);
  return form;
}

const json = (data: unknown): RequestInit => ({ body: JSON.stringify(data) });

// ── Auth ──────────────────────────────────────────
export const authAPI = {
  login: (email: string, password: string) =>
    fetchAPI<SessionUserResponse>("/auth/login", { method: "POST", ...json({ email, password }) }),
  register: (data: { email: string; password: string; full_name: string; department: string; employee_id: string }) =>
    fetchAPI<SessionUserResponse>("/auth/register", { method: "POST", ...json(data) }),
};

// ── Courses ───────────────────────────────────────
export const coursesAPI = {
  getTodayAgenda: () => fetchAPI<import("./types").TodayAgenda>("/courses/teacher/today-agenda"),
  list: () => fetchAPI<Course[]>("/courses"),
  get: (id: string) => fetchAPI<Course>(`/courses/${id}`),
  create: (data: {
    code: string;
    title: string;
    semester: string;
    academic_year?: string;
    total_classes?: number;
    period_duration?: number;
    section_name?: string;
    student_count?: number;
  }) => fetchAPI<Course>("/courses", { method: "POST", ...json(data) }),
  update: (id: string, data: {
    title?: string;
    code?: string;
    semester?: string;
    academic_year?: string;
    total_classes?: number;
    period_duration?: number;
  }) => fetchAPI<Course>(`/courses/${id}`, { method: "PATCH", ...json(data) }),
  delete: (id: string) =>
    fetchAPI<{ status: string; message: string; course_id: string }>(`/courses/${id}`, { method: "DELETE" }),
  getGraph: (id: string) => fetchAPI<CurriculumGraph>(`/courses/${id}/graph`),
  listGraphVersions: (id: string) => fetchAPI<GraphVersion[]>(`/courses/${id}/graph/versions`),
  diffGraphVersions: (id: string, from: number, to: number) =>
    fetchAPI<GraphDiff>(`/courses/${id}/graph/diff?from_version=${from}&to_version=${to}`),
  confirmCurriculum: (id: string, data: unknown) =>
    fetchAPI(`/courses/${id}/curriculum/confirm`, { method: "POST", ...json(data) }),
  optimize: (id: string, options?: { revision_percent?: number; assessment_percent?: number; buffer_percent?: number }) => {
    const params = new URLSearchParams();
    if (options?.revision_percent !== undefined) params.append("revision_percent", options.revision_percent.toString());
    if (options?.assessment_percent !== undefined) params.append("assessment_percent", options.assessment_percent.toString());
    if (options?.buffer_percent !== undefined) params.append("buffer_percent", options.buffer_percent.toString());
    const query = params.toString() ? `?${params.toString()}` : "";
    return fetchAPI<CourseOptimization>(`/courses/${id}/optimize${query}`, { method: "POST", ...(options ? json(options) : {}) });
  },
  getOptimization: (id: string, options?: { revision_percent?: number; assessment_percent?: number; buffer_percent?: number }) => {
    const params = new URLSearchParams();
    if (options?.revision_percent !== undefined) params.append("revision_percent", options.revision_percent.toString());
    if (options?.assessment_percent !== undefined) params.append("assessment_percent", options.assessment_percent.toString());
    if (options?.buffer_percent !== undefined) params.append("buffer_percent", options.buffer_percent.toString());
    const query = params.toString() ? `?${params.toString()}` : "";
    return fetchAPI<CourseOptimization>(`/courses/${id}/optimization${query}`);
  },
  optimizeNextClass: (id: string, sessionNumber?: number, customRevisionMinutes?: number) => {
    const params = new URLSearchParams();
    if (sessionNumber) params.append("session_number", sessionNumber.toString());
    if (customRevisionMinutes !== undefined) params.append("custom_revision_minutes", customRevisionMinutes.toString());
    const query = params.toString() ? `?${params.toString()}` : "";
    return fetchAPI<NextClassPlan>(
      `/courses/${id}/optimize-next-class${query}`,
      { method: "POST" }
    );
  },
  listLessonPlans: (id: string, sessionNumber?: number, status?: string) => {
    const params = new URLSearchParams();
    if (sessionNumber) params.append("session_number", sessionNumber.toString());
    if (status) params.append("status", status);
    const query = params.toString() ? `?${params.toString()}` : "";
    return fetchAPI<LessonPlan[]>(`/courses/${id}/lesson-plans${query}`);
  },
  generateLessonPlan: (id: string, data: unknown) =>
    fetchAPI<LessonPlan>(`/courses/${id}/lesson-plans/generate`, { method: "POST", ...json(data) }),
  reviewLessonPlan: (id: string, sessionNumber: number, data: LessonPlanReview) =>
    fetchAPI<LessonPlan>(`/courses/${id}/lesson-plans/${sessionNumber}`, { method: "PATCH", ...json(data) }),
  lessonPlanHistory: (id: string, sessionNumber: number) =>
    fetchAPI<LessonPlanVersion[]>(`/courses/${id}/lesson-plans/${sessionNumber}/history`),
  lessonPlanDiff: (id: string, sessionNumber: number, from: number, to: number) =>
    fetchAPI<LessonPlanDiff>(`/courses/${id}/lesson-plans/${sessionNumber}/diff?from_version=${from}&to_version=${to}`),
  listSessions: (id: string) => fetchAPI<ClassSessionItem[]>(`/courses/${id}/sessions`),
  logSession: (id: string, sessionNumber: number, data: SessionLogInput) =>
    fetchAPI<SessionLogResult>(`/courses/${id}/sessions/${sessionNumber}/log`, { method: "POST", ...json(data) }),
  listAssessments: (id: string) => fetchAPI<AssessmentItem[]>(`/courses/${id}/assessments`),
  createAssessment: (id: string, data: unknown) =>
    fetchAPI(`/courses/${id}/assessments`, { method: "POST", ...json(data) }),
  recordResults: (courseId: string, assessmentId: string, data: unknown) =>
    fetchAPI<{ status: string; message: string; updated_concepts: string[]; skipped: { concept_id: string; reason: string }[] }>(
      `/courses/${courseId}/assessments/${assessmentId}/results`, { method: "POST", ...json(data) }
    ),
  getStudents: (courseId: string) => fetchAPI<import("./types").StudentItem[]>(`/courses/${courseId}/students`),
  recordStudentResult: (
    courseId: string,
    data: { student_id: string; assessment_id: string; marks_obtained: number; max_marks?: number; feedback?: string }
  ) => fetchAPI<{ status: string; message: string }>(`/courses/${courseId}/students/record-result`, { method: "POST", ...json(data) }),
  getAttainment: (courseId: string) => fetchAPI<import("./types").AttainmentReport>(`/courses/${courseId}/attainment`),
  getAnalytics: (id: string) => fetchAPI<CourseAnalytics>(`/courses/${id}/analytics`),
  uploadSyllabus: (courseId: string, file?: File, rawText?: string) =>
    postForm<{ status: string; message: string; curriculum: ExtractedCurriculum }>(
      `/courses/${courseId}/syllabus`, syllabusForm(file, rawText)
    ),
};

export const curriculumAPI = {
  get: (courseId: string) => fetchAPI<CurriculumStructure>(`/courses/${courseId}/curriculum`),
  saveLayout: (courseId: string, units: { unit_id: string; topic_ids: string[] }[]) =>
    fetchAPI<CurriculumStructure>(`/courses/${courseId}/curriculum/layout`, { method: "PUT", ...json({ units }) }),
  updateConcept: (courseId: string, conceptId: string,
    changes: Partial<{ name: string; difficulty: number; importance: number; concept_type: ConceptType }>) =>
    fetchAPI<ConceptEditResult>(`/courses/${courseId}/concepts/${conceptId}`, { method: "PATCH", ...json(changes) }),
  addPrerequisite: (courseId: string, conceptId: string, prerequisiteId: string) =>
    fetchAPI(`/courses/${courseId}/prerequisites`, { method: "POST", ...json({ concept_id: conceptId, prerequisite_id: prerequisiteId }) }),
  removePrerequisite: async (courseId: string, conceptId: string, prerequisiteId: string) => {
    const endpoint = `/courses/${courseId}/prerequisites?concept_id=${conceptId}&prerequisite_id=${prerequisiteId}`;
    const res = await fetch(`${API_BASE}${endpoint}`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) await handle(res, endpoint);  // 204 has no body to parse
  },
  inferPrerequisites: (courseId: string) =>
    fetchAPI<{ status: string; provider: string; edges_count: number; edges: { source_name: string; target_name: string }[]; cycles_prevented: number }>(
      `/courses/${courseId}/curriculum/infer-prerequisites`,
      { method: "POST" }
    ),
};

export const membersAPI = {
  list: (courseId: string) => fetchAPI<CourseMembers>(`/courses/${courseId}/members`),
  put: (courseId: string, email: string, role: MemberRole) =>
    fetchAPI<CourseMembers>(`/courses/${courseId}/members`, { method: "PUT", ...json({ email, role }) }),
  remove: async (courseId: string, teacherId: string) => {
    const endpoint = `/courses/${courseId}/members/${teacherId}`;
    const res = await fetch(`${API_BASE}${endpoint}`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) await handle(res, endpoint);
  },
};

export const teachingMethodsAPI = {
  list: () => fetchAPI<TeachingMethodItem[]>("/teaching-methods"),
};

// ── Syllabus ──────────────────────────────────────
export const syllabusAPI = {
  upload: (file?: File, rawText?: string) =>
    postForm<ExtractedCurriculum>("/syllabus/upload", syllabusForm(file, rawText)),
};

// ── DBMS Insights ─────────────────────────────────
export const dbmsAPI = {
  getStatus: () => fetchAPI<Record<string, unknown>>("/dbms/status"),
  getSchema: () => fetchAPI<TableSchemaInfo[]>("/dbms/schema"),
  listQueries: () => fetchAPI<QueryMeta[]>("/dbms/queries"),
  executeQuery: (queryId: string, courseId?: string) =>
    fetchAPI<QueryDemoResult>(
      `/dbms/queries/${queryId}/execute${courseId ? `?course_id=${courseId}` : ""}`,
      { method: "POST" }
    ),
  explainQuery: (queryId: string, courseId: string) =>
    fetchAPI<{ query_id: string; plan: string[] }>(`/dbms/queries/${queryId}/explain?course_id=${courseId}`, { method: "POST" }),
  getObjects: () => fetchAPI<DatabaseObjects>("/dbms/objects"),
  getERDiagram: () => fetchAPI<{ mermaid: string; tables: number; relationships: number }>("/dbms/er-diagram"),
  runConsole: (sql: string) => fetchAPI<ConsoleResult>("/dbms/console", { method: "POST", ...json({ sql }) }),
  listLabScenarios: () => fetchAPI<LabScenario[]>("/dbms/transaction-lab"),
  runLabScenario: (id: string) => fetchAPI<LabResult>(`/dbms/transaction-lab/${id}`, { method: "POST" }),
  listAggregations: () => fetchAPI<AggregationMeta[]>("/dbms/nosql/aggregations"),
  runAggregation: (id: string, courseId: string) =>
    fetchAPI<AggregationResult>(`/dbms/nosql/aggregations/${id}/execute?course_id=${courseId}`, { method: "POST" }),
  consistency: (courseId?: string) =>
    fetchAPI<ConsistencyReport>(`/dbms/consistency${courseId ? `?course_id=${courseId}` : ""}`),
  repairConsistency: () =>
    fetchAPI<Record<string, number>>("/dbms/consistency/repair", { method: "POST" }),
};

// ── Health ─────────────────────────────────────────
export const healthAPI = {
  check: () =>
    fetch(API_BASE.replace("/api", "") + "/health")
      .then((r) => r.json())
      .catch(() => ({ status: "unreachable" })),
};

// ── Exports ────────────────────────────────────────
// Links cannot carry the bearer token, so exports are fetched and handed to the browser as blobs.
async function fetchBlob(endpoint: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${endpoint}`, { headers: authHeaders() });
  if (!res.ok) await handle(res, endpoint);
  return res.blob();
}

export const exportsAPI = {
  downloadCalendar: async (courseId: string) => {
    const url = URL.createObjectURL(await fetchBlob(`/exports/courses/${courseId}/calendar.ics`));
    const a = document.createElement("a");
    a.href = url;
    a.download = `course-${courseId}-schedule.ics`;
    a.click();
    URL.revokeObjectURL(url);
  },
  openPrintableLessonPlan: async (sessionId: string) => {
    const url = URL.createObjectURL(await fetchBlob(`/exports/lesson-plans/${sessionId}/printable`));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  getOutcomesMatrix: (courseId: string) =>
    fetchAPI<{ course_id: string; standard: string; outcomes_count: number; attainment_matrix: Record<string, unknown>[] }>(
      `/exports/courses/${courseId}/outcomes-matrix`
    ),
  openNbaCourseFile: async (courseId: string) => {
    const url = URL.createObjectURL(await fetchBlob(`/exports/courses/${courseId}/nba-course-file`));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

// ── Admin & Department Operations ────────────
export const adminAPI = {
  getOverview: () => fetchAPI<import("./types").AdminOverview>("/admin/overview"),
  getMappings: () => fetchAPI<import("./types").CourseMapping[]>("/admin/mappings"),
  updateMapping: (courseId: string, data: { teacher_id: string; section_name?: string }) =>
    fetchAPI<import("./types").CourseMapping>(`/admin/mappings/${courseId}`, { method: "PUT", ...json(data) }),
  listTeachers: () =>
    fetchAPI<{ id: string; user_id: string; full_name: string; email: string; department: string; designation: string; employee_id: string; courses_count: number }[]>("/admin/teachers"),
  listStudents: (params?: { semester?: number; section?: string; course_id?: string }) => {
    const sp = new URLSearchParams();
    if (params?.semester !== undefined) sp.append("semester", params.semester.toString());
    if (params?.section) sp.append("section", params.section);
    if (params?.course_id) sp.append("course_id", params.course_id);
    const query = sp.toString() ? `?${sp.toString()}` : "";
    return fetchAPI<import("./types").StudentItem[]>(`/admin/students${query}`);
  },
  simulateCohortData: (params?: { semester?: number; section?: string; student_count?: number }) => {
    const sp = new URLSearchParams();
    if (params?.semester !== undefined) sp.append("semester", params.semester.toString());
    if (params?.section) sp.append("section", params.section);
    if (params?.student_count !== undefined) sp.append("student_count", params.student_count.toString());
    const query = sp.toString() ? `?${sp.toString()}` : "";
    return fetchAPI<{ status: string; message: string; created_students: number; enrolled_count: number; department: string }>(
      `/admin/simulate-cohort-data${query}`,
      { method: "POST" }
    );
  },
  createTeacher: (data: import("./types").TeacherCreateAdminInput) =>
    fetchAPI<{ id: string; user_id: string; full_name: string; email: string; department: string; designation: string; employee_id: string }>(
      "/admin/teachers",
      { method: "POST", ...json(data) }
    ),
  createCourse: (data: import("./types").CourseCreateAdminInput) =>
    fetchAPI<import("./types").CourseMapping>(
      "/admin/courses",
      { method: "POST", ...json(data) }
    ),
  createStudent: (data: import("./types").StudentCreateInput) =>
    fetchAPI<import("./types").StudentItem>(
      "/admin/students",
      { method: "POST", ...json(data) }
    ),
  bulkEnrollSection: (data: {
    semester: number;
    section: string;
    department?: string;
    batch_year?: string;
    students: { usn: string; full_name: string; email?: string }[];
  }) =>
    fetchAPI<{
      status: string;
      message: string;
      processed_students: number;
      newly_created_students: number;
      enrolled_course_links: number;
      matching_courses: string[];
    }>("/admin/sections/bulk-enroll", { method: "POST", ...json(data) }),
};

// ── Institutional Operations & Academic Compliance ──
export const institutionalAPI = {
  reportLostClass: (courseId: string, data: { session_id?: string; reason: string; action: string; compensation_date?: string; compensation_slot?: string; notes?: string }) =>
    fetchAPI<{ status: string; action: string; message: string; compensation?: Record<string, unknown>; compressed_topics?: Record<string, unknown>[] }>(
      `/courses/${courseId}/lost-class`,
      { method: "POST", ...json(data) }
    ),
  listLostClasses: (courseId: string) =>
    fetchAPI<{ course_id: string; lost_classes: Record<string, unknown>[]; compensations: Record<string, unknown>[] }>(
      `/courses/${courseId}/lost-classes`
    ),
  assignProxy: (courseId: string, data: { session_id: string; proxy_teacher_name: string; proxy_teacher_email: string; reason: string; special_instructions?: string }) =>
    fetchAPI<{ status: string; message: string; proxy_assignment: Record<string, unknown> }>(
      `/courses/${courseId}/assign-proxy`,
      { method: "POST", ...json(data) }
    ),
  getProxyHandoverKit: (courseId: string, sessionId: string) =>
    fetchAPI<any>(`/courses/${courseId}/proxy-handover/${sessionId}`),
  getLabSync: (courseId: string) =>
    fetchAPI<{
      course_id: string;
      course_code: string;
      course_title: string;
      department: string;
      batches: string[];
      total_experiments: number;
      synced_count: number;
      sync_health_percentage: number;
      experiments: {
        exp_no: number;
        title: string;
        prerequisite_theory: string;
        batch_a1_slot: string;
        batch_a2_slot: string;
        theory_status: string;
        sync_status: string;
        badge: string;
        alert?: string;
      }[];
    }>(`/courses/${courseId}/lab-sync`),
  getDifferentiatedLearners: (courseId: string) =>
    fetchAPI<{
      course_id: string;
      standard: string;
      cohort_size: number;
      slow_learners_count: number;
      advanced_learners_count: number;
      average_learners_count: number;
      slow_learners: {
        student_id: string;
        usn: string;
        full_name: string;
        cie_total: number;
        attendance_percentage: number;
        weakest_area: string;
        remedial_intervention: string;
        action_item: string;
        retest_eligibility: string;
      }[];
      advanced_learners: {
        student_id: string;
        usn: string;
        full_name: string;
        cie_total: number;
        attendance_percentage: number;
        strength_area: string;
        enrichment_track: string;
        experiential_project: string;
        nptel_recommendation: string;
      }[];
      remedial_schedule: {
        day: string;
        timing: string;
        classroom: string;
        faculty_incharge: string;
      };
    }>(`/courses/${courseId}/differentiated-learners`),
  recordTopicProgress: (courseId: string, topicId: string, data: { actual_periods_taken: number; completion_date?: string; remarks?: string }) =>
    fetchAPI<{
      status: string;
      message: string;
      topic_progress: Record<string, unknown>;
      recommendation: string;
    }>(`/courses/${courseId}/topics/${topicId}/record-progress`, { method: "POST", ...json(data) }),
  getSyllabusDrift: (courseId: string) =>
    fetchAPI<{
      course_id: string;
      total_topics: number;
      completed_topics: number;
      net_drift_periods: number;
      overall_status: string;
      status_alert: string;
      topic_breakdown: {
        topic_id: string;
        title: string;
        planned_periods: number;
        actual_periods: number | null;
        drift: number;
        status: string;
      }[];
    }>(`/courses/${courseId}/syllabus-drift`),
  getAttendanceAnalysis: (courseId: string) =>
    fetchAPI<{
      course_id: string;
      regulation: string;
      total_classes: number;
      classes_conducted: number;
      classes_remaining: number;
      eligible_count: number;
      condonation_count: number;
      detained_count: number;
      roster: {
        student_id: string;
        usn: string;
        full_name: string;
        section: string;
        classes_conducted: number;
        classes_attended: number;
        classes_remaining: number;
        current_percentage: number;
        max_reachable_percentage: number;
        status: string;
        badge_color: string;
        action_note: string;
      }[];
    }>(`/courses/${courseId}/attendance-analysis`),
};

