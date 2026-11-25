import { Router } from "express";
import { aiStatus } from "../ai/index.js";
import * as repo from "../repo.js";
import { userId } from "./util.js";
import type { ChapterStat, DashboardStats } from "../../shared/types.js";

export const stats = Router();

stats.get("/ai/status", (_req, res) => res.json(aiStatus()));

stats.get("/dashboard", (req, res) => {
  const uid = userId(req);
  const documents = repo.listDocuments(uid);
  const subjects = repo.listSubjects(uid);
  const quizzes = repo.listQuizzes(uid);
  const attempts = repo.listAttempts(uid, { status: "submitted" });
  const scores = attempts.map((a) => a.score20 ?? 0);

  // Agrégation des chapitres sur l'ensemble des examens validés.
  const agg = new Map<string, ChapterStat & { subjectName: string | null; points: number }>();
  for (const a of attempts) {
    for (const c of a.chapterStats ?? []) {
      const key = `${a.subjectName ?? ""}::${c.chapterId ?? c.chapterName}`;
      const e = agg.get(key) ?? { ...c, subjectName: a.subjectName ?? null, total: 0, correct: 0, rate: 0, points: 0 };
      e.total += c.total;
      e.correct += c.correct;
      e.points += c.rate * c.total;
      agg.set(key, e);
    }
  }
  const chapters = [...agg.values()]
    .map(({ points, ...c }) => ({ ...c, rate: c.total ? points / c.total : 0 }))
    .filter((c) => c.total >= 2);

  const result: DashboardStats = {
    documentCount: documents.length,
    subjectCount: subjects.length,
    quizCount: quizzes.filter((q) => q.status === "ready").length,
    attemptCount: attempts.length,
    averageScore20: scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    bestScore20: scores.length ? Math.max(...scores) : null,
    questionsAnswered: attempts.reduce((n, a) => n + a.questionCount, 0),
    evolution: attempts
      .slice()
      .reverse()
      .slice(-30)
      .map((a) => ({ attemptId: a.id, date: a.submittedAt ?? a.startedAt, score20: a.score20 ?? 0, quizTitle: a.quizTitle ?? "" })),
    weakPoints: chapters.filter((c) => c.rate < 0.6).sort((a, b) => a.rate - b.rate).slice(0, 6),
    strongPoints: chapters.filter((c) => c.rate >= 0.75).sort((a, b) => b.rate - a.rate).slice(0, 6),
    recentAttempts: attempts.slice(0, 5),
    recentQuizzes: quizzes.slice(0, 5),
    recentDocuments: documents.slice(0, 5),
  };
  res.json(result);
});

const round = (n: number) => Math.round(n * 100) / 100;
