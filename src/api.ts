import type {
  AiStatus,
  Attempt,
  AttemptDetail,
  Chapter,
  CourseDocument,
  CourseDocumentDetail,
  DashboardStats,
  Answers,
  Quiz,
  QuizDetail,
  Subject,
} from "../shared/types";

/** Client HTTP. Aucune clé API ne transite par le navigateur : tout passe par /api. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erreur ${res.status}`);
  return data as T;
}
const body = (data: unknown) => JSON.stringify(data);

export const api = {
  aiStatus: () => request<AiStatus>("/ai/status"),
  dashboard: () => request<DashboardStats>("/dashboard"),

  subjects: () => request<Subject[]>("/subjects"),
  createSubject: (name: string) => request<Subject>("/subjects", { method: "POST", body: body({ name }) }),
  updateSubject: (id: string, patch: Partial<Subject>) => request<Subject>(`/subjects/${id}`, { method: "PATCH", body: body(patch) }),
  deleteSubject: (id: string) => request<void>(`/subjects/${id}`, { method: "DELETE" }),
  createChapter: (subjectId: string, name: string) =>
    request<Chapter>(`/subjects/${subjectId}/chapters`, { method: "POST", body: body({ name }) }),
  updateChapter: (id: string, name: string) => request<Chapter>(`/chapters/${id}`, { method: "PATCH", body: body({ name }) }),
  deleteChapter: (id: string) => request<void>(`/chapters/${id}`, { method: "DELETE" }),

  documents: (filter: { subjectId?: string; chapterId?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();
    return request<CourseDocument[]>(`/documents${q ? `?${q}` : ""}`);
  },
  document: (id: string) => request<CourseDocumentDetail>(`/documents/${id}`),
  upload: (files: File[], subjectId?: string | null, chapterId?: string | null) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (subjectId) form.append("subjectId", subjectId);
    if (chapterId) form.append("chapterId", chapterId);
    return request<CourseDocument[]>("/documents", { method: "POST", body: form });
  },
  updateDocument: (id: string, patch: { subjectId?: string | null; chapterId?: string | null; filename?: string }) =>
    request<CourseDocumentDetail>(`/documents/${id}`, { method: "PATCH", body: body(patch) }),
  reprocessDocument: (id: string) => request<CourseDocumentDetail>(`/documents/${id}/reprocess`, { method: "POST" }),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
  fileUrl: (id: string) => `/api/documents/${id}/file`,

  quizzes: () => request<Quiz[]>("/quizzes"),
  quiz: (id: string) => request<QuizDetail>(`/quizzes/${id}`),
  createQuiz: (params: Record<string, unknown>) => request<Quiz>("/quizzes", { method: "POST", body: body(params) }),
  renameQuiz: (id: string, title: string) => request<QuizDetail>(`/quizzes/${id}`, { method: "PATCH", body: body({ title }) }),
  deleteQuiz: (id: string) => request<void>(`/quizzes/${id}`, { method: "DELETE" }),

  startAttempt: (quizId: string, opts: { mode: "examen" | "entrainement"; secondsPerQuestion?: number }) =>
    request<Attempt>(`/quizzes/${quizId}/attempts`, { method: "POST", body: body(opts) }),
  attempts: (filter: { status?: string; quizId?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();
    return request<Attempt[]>(`/attempts${q ? `?${q}` : ""}`);
  },
  attempt: (id: string) => request<AttemptDetail>(`/attempts/${id}`),
  saveAttempt: (id: string, data: { answers: Answers; flagged: string[]; currentIndex: number; elapsedSec: number }) =>
    request<Attempt>(`/attempts/${id}`, { method: "PATCH", body: body(data) }),
  submitAttempt: (id: string, answers: Answers, elapsedSec: number) =>
    request<AttemptDetail>(`/attempts/${id}/submit`, { method: "POST", body: body({ answers, elapsedSec }) }),
  deleteAttempt: (id: string) => request<void>(`/attempts/${id}`, { method: "DELETE" }),
};
