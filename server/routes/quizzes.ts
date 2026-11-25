import { Router } from "express";
import { getProvider } from "../ai/index.js";
import { runGeneration } from "../generation.js";
import * as repo from "../repo.js";
import { scoreAttempt } from "../scoring.js";
import { HttpError, userId } from "./util.js";
import {
  DIFFICULTY_LABELS,
  QUESTION_COUNTS,
  type Answers,
  type AttemptDetail,
  type Difficulty,
  type OptionLabel,
  type QuestionType,
  type QuizDetail,
  type ScoringMode,
} from "../../shared/types.js";

export const quizzes = Router();

// Limite simple contre les générations en rafale (coût API).
const recent = new Map<string, number[]>();
function rateLimit(uid: string) {
  const t = Date.now();
  const list = (recent.get(uid) ?? []).filter((x) => t - x < 60_000);
  if (list.length >= 5) throw new HttpError(429, "Trop de générations simultanées. Patientez une minute.");
  list.push(t);
  recent.set(uid, list);
}

quizzes.get("/quizzes", (req, res) => res.json(repo.listQuizzes(userId(req))));

quizzes.post("/quizzes", (req, res) => {
  const uid = userId(req);
  const b = req.body ?? {};
  const count = Number(b.count);
  const difficulty = b.difficulty as Difficulty;
  const type = b.type as QuestionType;
  const scoring = (b.scoring ?? "strict") as ScoringMode;
  if (!QUESTION_COUNTS.includes(count as (typeof QUESTION_COUNTS)[number])) throw new HttpError(400, "Nombre de questions invalide.");
  if (!(difficulty in DIFFICULTY_LABELS)) throw new HttpError(400, "Difficulté invalide.");
  if (type !== "unique" && type !== "multiple") throw new HttpError(400, "Type de QCM invalide.");
  if (scoring !== "strict" && scoring !== "partiel") throw new HttpError(400, "Barème invalide.");

  const subject = b.subjectId ? repo.getSubject(uid, String(b.subjectId)) : null;
  if (b.subjectId && !subject) throw new HttpError(400, "Matière introuvable.");
  const chapter = b.chapterId ? repo.getChapter(uid, String(b.chapterId)) : null;
  if (b.chapterId && (!chapter || (subject && chapter.subjectId !== subject.id))) throw new HttpError(400, "Chapitre introuvable.");

  let docs = repo.listDocuments(uid, { subjectId: subject?.id, chapterId: chapter?.id }).filter((d) => d.status === "ready");
  if (Array.isArray(b.documentIds) && b.documentIds.length) {
    const wanted = new Set(b.documentIds.map(String));
    docs = repo.listDocuments(uid).filter((d) => wanted.has(d.id) && d.status === "ready");
  }
  if (!docs.length) throw new HttpError(400, "Aucun document prêt dans ce périmètre. Importez un cours d'abord.");
  rateLimit(uid);

  const provider = getProvider();
  const scopeLabel = chapter ? `Chapitre : ${chapter.name}` : "Ensemble du cours";
  const title =
    String(b.title ?? "").trim() ||
    `${subject?.name ?? docs[0].filename} · ${chapter?.name ?? "Ensemble du cours"}`;
  const quizId = repo.id();
  repo.insertQuiz({
    id: quizId,
    userId: uid,
    title: title.slice(0, 140),
    subjectId: subject?.id ?? docs[0].subjectId,
    chapterId: chapter?.id ?? null,
    difficulty,
    type,
    scoring,
    requestedCount: count,
    provider: provider.model ? `${provider.name}:${provider.model}` : provider.name,
    documentIds: docs.map((d) => d.id),
  });
  runGeneration({
    quizId,
    userId: uid,
    documentIds: docs.map((d) => d.id),
    subjectName: subject?.name ?? null,
    scopeLabel,
    count,
    difficulty,
    type,
  });
  res.status(202).json(repo.getQuiz(uid, quizId));
});

quizzes.get("/quizzes/:id", (req, res) => {
  const q = repo.getQuiz(userId(req), String(req.params.id));
  if (!q) throw new HttpError(404, "QCM introuvable.");
  res.json(q);
});

quizzes.patch("/quizzes/:id", (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  if (!title) throw new HttpError(400, "Titre requis.");
  const q = repo.renameQuiz(userId(req), String(req.params.id), title.slice(0, 140));
  if (!q) throw new HttpError(404, "QCM introuvable.");
  res.json(q);
});

quizzes.delete("/quizzes/:id", (req, res) => {
  if (!repo.deleteQuiz(userId(req), String(req.params.id))) throw new HttpError(404, "QCM introuvable.");
  res.status(204).end();
});

// ─── Examens ─────────────────────────────────────────────────────────────
quizzes.post("/quizzes/:id/attempts", (req, res) => {
  const uid = userId(req);
  const quiz = repo.getQuiz(uid, String(req.params.id));
  if (!quiz) throw new HttpError(404, "QCM introuvable.");
  if (quiz.status !== "ready") throw new HttpError(409, "Ce QCM n'est pas encore prêt.");
  const mode = req.body?.mode === "entrainement" ? "entrainement" : "examen";
  const perQuestion = Math.min(600, Math.max(15, Number(req.body?.secondsPerQuestion) || 90));
  const attemptId = repo.id();
  repo.insertAttempt({
    id: attemptId,
    userId: uid,
    quizId: quiz.id,
    mode,
    durationLimitSec: mode === "examen" ? Math.round(perQuestion * quiz.questions.length) : 0,
  });
  res.status(201).json(repo.getAttempt(uid, attemptId));
});

quizzes.get("/attempts", (req, res) => {
  res.json(
    repo.listAttempts(userId(req), {
      status: req.query.status ? String(req.query.status) : undefined,
      quizId: req.query.quizId ? String(req.query.quizId) : undefined,
    }),
  );
});

quizzes.get("/attempts/:id", (req, res) => {
  const uid = userId(req);
  const attempt = repo.getAttempt(uid, String(req.params.id));
  if (!attempt) throw new HttpError(404, "Examen introuvable.");
  const quiz = repo.getQuiz(uid, attempt.quizId)!;
  // En mode examen, les corrections ne quittent pas le serveur avant la validation.
  const detail: AttemptDetail = {
    ...attempt,
    quiz: attempt.status === "in_progress" && attempt.mode === "examen" ? hideAnswers(quiz) : quiz,
  };
  res.json(detail);
});

quizzes.patch("/attempts/:id", (req, res) => {
  const uid = userId(req);
  const attempt = repo.getAttempt(uid, String(req.params.id));
  if (!attempt) throw new HttpError(404, "Examen introuvable.");
  if (attempt.status !== "in_progress") throw new HttpError(409, "Cet examen est déjà validé.");
  const quiz = repo.getQuiz(uid, attempt.quizId)!;
  repo.saveAttemptProgress(attempt.id, {
    answers: sanitizeAnswers(req.body?.answers, quiz),
    flagged: Array.isArray(req.body?.flagged) ? req.body.flagged.map(String).slice(0, 200) : attempt.flagged,
    currentIndex: Math.max(0, Math.min(quiz.questions.length - 1, Number(req.body?.currentIndex) || 0)),
    elapsedSec: Math.max(0, Number(req.body?.elapsedSec) || 0),
  });
  res.json(repo.getAttempt(uid, attempt.id));
});

quizzes.post("/attempts/:id/submit", (req, res) => {
  const uid = userId(req);
  const attempt = repo.getAttempt(uid, String(req.params.id));
  if (!attempt) throw new HttpError(404, "Examen introuvable.");
  if (attempt.status !== "in_progress") throw new HttpError(409, "Cet examen est déjà validé.");
  const quiz = repo.getQuiz(uid, attempt.quizId)!;
  const answers = req.body?.answers ? sanitizeAnswers(req.body.answers, quiz) : attempt.answers;
  const scored = scoreAttempt(quiz.questions, answers, quiz.scoring);
  const elapsed = Math.round((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
  repo.finalizeAttempt(attempt.id, {
    ...scored,
    answers,
    elapsedSec: attempt.durationLimitSec ? Math.min(elapsed, attempt.durationLimitSec) : Number(req.body?.elapsedSec) || elapsed,
  });
  res.json({ ...repo.getAttempt(uid, attempt.id), quiz });
});

quizzes.delete("/attempts/:id", (req, res) => {
  if (!repo.deleteAttempt(userId(req), String(req.params.id))) throw new HttpError(404, "Examen introuvable.");
  res.status(204).end();
});

function hideAnswers(quiz: QuizDetail): QuizDetail {
  return {
    ...quiz,
    questions: quiz.questions.map((q) => ({
      ...q,
      correct: [],
      correction: "",
      explanation: "",
      options: q.options.map((o) => ({ ...o, rationale: "" })),
    })),
  };
}

function sanitizeAnswers(input: unknown, quiz: QuizDetail): Answers {
  const out: Answers = {};
  if (!input || typeof input !== "object") return out;
  const ids = new Set(quiz.questions.map((q) => q.id));
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ids.has(k) || !Array.isArray(v)) continue;
    const labels = Array.from(new Set(v.filter((x): x is OptionLabel => ["A", "B", "C", "D"].includes(x as string))));
    out[k] = quiz.type === "unique" ? labels.slice(0, 1) : labels.sort();
  }
  return out;
}
