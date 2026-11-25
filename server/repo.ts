import { nanoid } from "nanoid";
import { db, json, now } from "./db.js";
import type {
  Attempt,
  Chapter,
  CourseDocument,
  CourseDocumentDetail,
  Question,
  Quiz,
  QuizDetail,
  Section,
  Subject,
} from "../shared/types.js";

/* Accès aux données. Toutes les requêtes sont filtrées par utilisateur. */

type Row = Record<string, any>;
export const id = () => nanoid(12);

const PALETTE = ["#1E3A8A", "#0F766E", "#9D174D", "#B45309", "#4338CA", "#15803D", "#7C2D12", "#334155"];

// ─── Matières & chapitres ────────────────────────────────────────────────
export function listSubjects(userId: string): Subject[] {
  const subjects = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM documents d WHERE d.subject_id = s.id) AS doc_count
       FROM subjects s WHERE s.user_id = ? ORDER BY s.name COLLATE NOCASE`,
    )
    .all(userId) as Row[];
  const chapters = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM documents d WHERE d.chapter_id = c.id) AS doc_count
       FROM chapters c JOIN subjects s ON s.id = c.subject_id WHERE s.user_id = ? ORDER BY c.position, c.name`,
    )
    .all(userId) as Row[];
  return subjects.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    createdAt: s.created_at,
    documentCount: s.doc_count,
    chapters: chapters.filter((c) => c.subject_id === s.id).map(mapChapter),
  }));
}

export function getSubject(userId: string, subjectId: string): Subject | null {
  return listSubjects(userId).find((s) => s.id === subjectId) ?? null;
}

export function createSubject(userId: string, name: string, color?: string): Subject {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM subjects WHERE user_id = ?").get(userId) as Row).n as number;
  const sid = id();
  db.prepare("INSERT INTO subjects (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)").run(
    sid,
    userId,
    name.trim(),
    color || PALETTE[count % PALETTE.length],
    now(),
  );
  return getSubject(userId, sid)!;
}

export function updateSubject(userId: string, subjectId: string, patch: { name?: string; color?: string }) {
  const s = getSubject(userId, subjectId);
  if (!s) return null;
  db.prepare("UPDATE subjects SET name = ?, color = ? WHERE id = ?").run(
    patch.name?.trim() || s.name,
    patch.color || s.color,
    subjectId,
  );
  return getSubject(userId, subjectId);
}

export function deleteSubject(userId: string, subjectId: string) {
  return db.prepare("DELETE FROM subjects WHERE id = ? AND user_id = ?").run(subjectId, userId).changes > 0;
}

function mapChapter(c: Row): Chapter {
  return { id: c.id, subjectId: c.subject_id, name: c.name, position: c.position, documentCount: c.doc_count ?? 0 };
}

export function getChapter(userId: string, chapterId: string): (Chapter & { subjectName: string }) | null {
  const c = db
    .prepare(
      "SELECT c.*, s.name AS subject_name FROM chapters c JOIN subjects s ON s.id = c.subject_id WHERE c.id = ? AND s.user_id = ?",
    )
    .get(chapterId, userId) as Row | undefined;
  return c ? { ...mapChapter(c), subjectName: c.subject_name } : null;
}

export function createChapter(userId: string, subjectId: string, name: string): Chapter | null {
  if (!getSubject(userId, subjectId)) return null;
  const pos = (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM chapters WHERE subject_id = ?").get(subjectId) as Row).p;
  const cid = id();
  db.prepare("INSERT INTO chapters (id, subject_id, name, position) VALUES (?, ?, ?, ?)").run(cid, subjectId, name.trim(), pos);
  return getChapter(userId, cid);
}

export function updateChapter(userId: string, chapterId: string, name: string) {
  if (!getChapter(userId, chapterId)) return null;
  db.prepare("UPDATE chapters SET name = ? WHERE id = ?").run(name.trim(), chapterId);
  return getChapter(userId, chapterId);
}

export function deleteChapter(userId: string, chapterId: string) {
  if (!getChapter(userId, chapterId)) return false;
  db.prepare("DELETE FROM chapters WHERE id = ?").run(chapterId);
  return true;
}

// ─── Documents ───────────────────────────────────────────────────────────
const DOC_SELECT = `SELECT d.*, s.name AS subject_name, c.name AS chapter_name FROM documents d
  LEFT JOIN subjects s ON s.id = d.subject_id LEFT JOIN chapters c ON c.id = d.chapter_id`;

function mapDocument(d: Row): CourseDocument {
  const sections = json<Section[]>(d.sections, []);
  return {
    id: d.id,
    subjectId: d.subject_id,
    chapterId: d.chapter_id,
    filename: d.filename,
    mime: d.mime,
    size: d.size,
    kind: d.kind,
    status: d.status,
    error: d.error,
    charCount: d.char_count,
    sectionCount: sections.length,
    createdAt: d.created_at,
    subjectName: d.subject_name,
    chapterName: d.chapter_name,
  };
}

export function listDocuments(userId: string, filter: { subjectId?: string; chapterId?: string } = {}): CourseDocument[] {
  let sql = `${DOC_SELECT} WHERE d.user_id = ?`;
  const args: string[] = [userId];
  if (filter.subjectId) (sql += " AND d.subject_id = ?"), args.push(filter.subjectId);
  if (filter.chapterId) (sql += " AND d.chapter_id = ?"), args.push(filter.chapterId);
  return (db.prepare(`${sql} ORDER BY d.created_at DESC`).all(...args) as Row[]).map(mapDocument);
}

export function getDocumentRow(userId: string, docId: string) {
  return db.prepare(`${DOC_SELECT} WHERE d.id = ? AND d.user_id = ?`).get(docId, userId) as Row | undefined;
}

export function getDocument(userId: string, docId: string): CourseDocumentDetail | null {
  const d = getDocumentRow(userId, docId);
  return d ? { ...mapDocument(d), sections: json<Section[]>(d.sections, []) } : null;
}

export function insertDocument(row: {
  id: string;
  userId: string;
  subjectId: string | null;
  chapterId: string | null;
  filename: string;
  mime: string;
  size: number;
  kind: string;
  storagePath: string;
}) {
  db.prepare(
    `INSERT INTO documents (id, user_id, subject_id, chapter_id, filename, mime, size, kind, storage_path, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?)`,
  ).run(row.id, row.userId, row.subjectId, row.chapterId, row.filename, row.mime, row.size, row.kind, row.storagePath, now());
}

export function setDocumentExtracted(docId: string, sections: Section[]) {
  const chars = sections.reduce((n, s) => n + s.text.length, 0);
  db.prepare("UPDATE documents SET status = 'ready', error = NULL, sections = ?, char_count = ? WHERE id = ?").run(
    JSON.stringify(sections),
    chars,
    docId,
  );
}

export function setDocumentError(docId: string, error: string) {
  db.prepare("UPDATE documents SET status = 'error', error = ? WHERE id = ?").run(error, docId);
}

export function updateDocument(
  userId: string,
  docId: string,
  patch: { subjectId?: string | null; chapterId?: string | null; filename?: string },
) {
  const d = getDocumentRow(userId, docId);
  if (!d) return null;
  db.prepare("UPDATE documents SET subject_id = ?, chapter_id = ?, filename = ? WHERE id = ?").run(
    patch.subjectId !== undefined ? patch.subjectId : d.subject_id,
    patch.chapterId !== undefined ? patch.chapterId : d.chapter_id,
    patch.filename?.trim() || d.filename,
    docId,
  );
  return getDocument(userId, docId);
}

export function deleteDocument(userId: string, docId: string) {
  return db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(docId, userId).changes > 0;
}

// ─── QCM ─────────────────────────────────────────────────────────────────
const QUIZ_SELECT = `SELECT q.*, s.name AS subject_name, c.name AS chapter_name,
  (SELECT COUNT(*) FROM attempts a WHERE a.quiz_id = q.id AND a.status = 'submitted') AS attempt_count,
  (SELECT MAX(score20) FROM attempts a WHERE a.quiz_id = q.id AND a.status = 'submitted') AS best_score
  FROM quizzes q LEFT JOIN subjects s ON s.id = q.subject_id LEFT JOIN chapters c ON c.id = q.chapter_id`;

function mapQuiz(q: Row): Quiz {
  const questions = json<Question[]>(q.questions, []);
  return {
    id: q.id,
    title: q.title,
    subjectId: q.subject_id,
    subjectName: q.subject_name,
    chapterId: q.chapter_id,
    chapterName: q.chapter_name,
    difficulty: q.difficulty,
    type: q.type,
    scoring: q.scoring,
    requestedCount: q.requested_count,
    status: q.status,
    progress: q.progress,
    error: q.error,
    provider: q.provider,
    questionCount: questions.length,
    documentIds: json<string[]>(q.document_ids, []),
    createdAt: q.created_at,
    attemptCount: q.attempt_count ?? 0,
    bestScore: q.best_score ?? null,
  };
}

export function listQuizzes(userId: string): Quiz[] {
  return (db.prepare(`${QUIZ_SELECT} WHERE q.user_id = ? ORDER BY q.created_at DESC`).all(userId) as Row[]).map(mapQuiz);
}

export function getQuiz(userId: string, quizId: string): QuizDetail | null {
  const q = db.prepare(`${QUIZ_SELECT} WHERE q.id = ? AND q.user_id = ?`).get(quizId, userId) as Row | undefined;
  return q ? { ...mapQuiz(q), questions: json<Question[]>(q.questions, []) } : null;
}

export function insertQuiz(row: {
  id: string;
  userId: string;
  title: string;
  subjectId: string | null;
  chapterId: string | null;
  difficulty: string;
  type: string;
  scoring: string;
  requestedCount: number;
  provider: string;
  documentIds: string[];
}) {
  db.prepare(
    `INSERT INTO quizzes (id, user_id, title, subject_id, chapter_id, difficulty, type, scoring, requested_count, status, progress, provider, document_ids, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generating', 0, ?, ?, ?)`,
  ).run(
    row.id,
    row.userId,
    row.title,
    row.subjectId,
    row.chapterId,
    row.difficulty,
    row.type,
    row.scoring,
    row.requestedCount,
    row.provider,
    JSON.stringify(row.documentIds),
    now(),
  );
}

export function setQuizProgress(quizId: string, progress: number) {
  db.prepare("UPDATE quizzes SET progress = ? WHERE id = ?").run(Math.min(0.99, progress), quizId);
}
export function setQuizReady(quizId: string, questions: Question[]) {
  db.prepare("UPDATE quizzes SET status = 'ready', progress = 1, questions = ?, error = NULL WHERE id = ?").run(
    JSON.stringify(questions),
    quizId,
  );
}
export function setQuizError(quizId: string, error: string) {
  db.prepare("UPDATE quizzes SET status = 'error', error = ? WHERE id = ?").run(error, quizId);
}
export function renameQuiz(userId: string, quizId: string, title: string) {
  db.prepare("UPDATE quizzes SET title = ? WHERE id = ? AND user_id = ?").run(title.trim(), quizId, userId);
  return getQuiz(userId, quizId);
}
export function deleteQuiz(userId: string, quizId: string) {
  return db.prepare("DELETE FROM quizzes WHERE id = ? AND user_id = ?").run(quizId, userId).changes > 0;
}

// ─── Tentatives (examens) ────────────────────────────────────────────────
const ATTEMPT_SELECT = `SELECT a.*, q.title AS quiz_title, s.name AS subject_name,
  json_array_length(q.questions) AS question_count
  FROM attempts a JOIN quizzes q ON q.id = a.quiz_id LEFT JOIN subjects s ON s.id = q.subject_id`;

function mapAttempt(a: Row): Attempt {
  return {
    id: a.id,
    quizId: a.quiz_id,
    quizTitle: a.quiz_title,
    subjectName: a.subject_name,
    status: a.status,
    mode: a.mode,
    answers: json(a.answers, {}),
    flagged: json(a.flagged, []),
    currentIndex: a.current_index,
    durationLimitSec: a.duration_limit_sec,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    elapsedSec: a.elapsed_sec,
    score20: a.score20,
    percent: a.percent,
    correctCount: a.correct_count,
    wrongCount: a.wrong_count,
    unansweredCount: a.unanswered_count,
    questionCount: a.question_count ?? 0,
    chapterStats: json(a.chapter_stats, null),
    results: json(a.results, null),
  };
}

export function listAttempts(userId: string, filter: { status?: string; quizId?: string } = {}): Attempt[] {
  let sql = `${ATTEMPT_SELECT} WHERE a.user_id = ?`;
  const args: string[] = [userId];
  if (filter.status) (sql += " AND a.status = ?"), args.push(filter.status);
  if (filter.quizId) (sql += " AND a.quiz_id = ?"), args.push(filter.quizId);
  return (db.prepare(`${sql} ORDER BY a.started_at DESC`).all(...args) as Row[]).map(mapAttempt);
}

export function getAttempt(userId: string, attemptId: string): Attempt | null {
  const a = db.prepare(`${ATTEMPT_SELECT} WHERE a.id = ? AND a.user_id = ?`).get(attemptId, userId) as Row | undefined;
  return a ? mapAttempt(a) : null;
}

export function insertAttempt(row: { id: string; userId: string; quizId: string; mode: string; durationLimitSec: number }) {
  db.prepare(
    `INSERT INTO attempts (id, user_id, quiz_id, status, mode, duration_limit_sec, started_at) VALUES (?, ?, ?, 'in_progress', ?, ?, ?)`,
  ).run(row.id, row.userId, row.quizId, row.mode, row.durationLimitSec, now());
}

export function saveAttemptProgress(
  attemptId: string,
  patch: { answers: unknown; flagged: unknown; currentIndex: number; elapsedSec: number },
) {
  db.prepare(
    "UPDATE attempts SET answers = ?, flagged = ?, current_index = ?, elapsed_sec = ? WHERE id = ? AND status = 'in_progress'",
  ).run(JSON.stringify(patch.answers), JSON.stringify(patch.flagged), patch.currentIndex, patch.elapsedSec, attemptId);
}

export function finalizeAttempt(attemptId: string, r: Record<string, unknown>) {
  db.prepare(
    `UPDATE attempts SET status = 'submitted', submitted_at = ?, answers = ?, elapsed_sec = ?, score20 = ?, percent = ?,
     correct_count = ?, wrong_count = ?, unanswered_count = ?, chapter_stats = ?, results = ? WHERE id = ?`,
  ).run(
    now(),
    JSON.stringify(r.answers),
    r.elapsedSec as number,
    r.score20 as number,
    r.percent as number,
    r.correctCount as number,
    r.wrongCount as number,
    r.unansweredCount as number,
    JSON.stringify(r.chapterStats),
    JSON.stringify(r.results),
    attemptId,
  );
}

export function deleteAttempt(userId: string, attemptId: string) {
  return db.prepare("DELETE FROM attempts WHERE id = ? AND user_id = ?").run(attemptId, userId).changes > 0;
}
