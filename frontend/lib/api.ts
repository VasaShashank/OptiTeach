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
  optimize: (id: string, options?: { revision_percent?: number; assessment_percent?: number }) => {
    const params = new URLSearchParams();
    if (options?.revision_percent !== undefined) params.append("revision_percent", options.revision_percent.toString());
    if (options?.assessment_percent !== undefined) params.append("assessment_percent", options.assessment_percent.toString());
    const query = params.toString() ? `?${params.toString()}` : "";
    return fetchAPI<CourseOptimization>(`/courses/${id}/optimize${query}`, { method: "POST", ...(options ? json(options) : {}) });
  },
  getOptimization: (id: string, options?: { revision_percent?: number; assessment_percent?: number }) => {
    const params = new URLSearchParams();
    if (options?.revision_percent !== undefined) params.append("revision_percent", options.revision_percent.toString());
    if (options?.assessment_percent !== undefined) params.append("assessment_percent", options.assessment_percent.toString());
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
};
