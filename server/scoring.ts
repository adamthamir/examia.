import type { Answers, ChapterStat, OptionLabel, Question, QuestionResult, ScoringMode } from "../shared/types.js";

const LABELS: OptionLabel[] = ["A", "B", "C", "D"];
/** Barème par discordances, classique des QCM à réponses multiples en facultés de santé. */
const PARTIAL_SCALE: Record<number, number> = { 0: 1, 1: 0.5, 2: 0.2 };

export function scoreQuestion(q: Question, selected: OptionLabel[] = [], mode: ScoringMode): QuestionResult {
  const sel = new Set(selected);
  const cor = new Set(q.correct);
  const exact = sel.size === cor.size && [...sel].every((l) => cor.has(l));
  let points = exact ? 1 : 0;
  if (!exact && mode === "partiel" && sel.size > 0 && q.correct.length > 0 && isMultiple(q)) {
    const discordances = LABELS.filter((l) => sel.has(l) !== cor.has(l)).length;
    points = PARTIAL_SCALE[discordances] ?? 0;
  }
  return { questionId: q.id, selected: [...sel].sort() as OptionLabel[], isCorrect: exact, points };
}

const isMultiple = (q: Question) => q.options.length === 4 && q.correct.length >= 1;

export function scoreAttempt(questions: Question[], answers: Answers, mode: ScoringMode) {
  const results = questions.map((q) => scoreQuestion(q, answers[q.id], mode));
  const total = questions.length || 1;
  const points = results.reduce((n, r) => n + r.points, 0);
  const unanswered = results.filter((r) => r.selected.length === 0).length;
  const correct = results.filter((r) => r.isCorrect).length;

  const byChapter = new Map<string, ChapterStat & { points: number }>();
  questions.forEach((q, i) => {
    const key = q.chapterId ?? q.chapterName ?? "—";
    const entry = byChapter.get(key) ?? {
      chapterId: q.chapterId,
      chapterName: q.chapterName ?? "Sans chapitre",
      total: 0,
      correct: 0,
      rate: 0,
      points: 0,
    };
    entry.total++;
    entry.points += results[i].points;
    if (results[i].isCorrect) entry.correct++;
    byChapter.set(key, entry);
  });
  const chapterStats: ChapterStat[] = [...byChapter.values()]
    .map(({ points: p, ...c }) => ({ ...c, rate: round(p / c.total, 4) }))
    .sort((a, b) => a.rate - b.rate);

  return {
    results,
    score20: round((points / total) * 20, 2),
    percent: round((points / total) * 100, 1),
    correctCount: correct,
    wrongCount: questions.length - correct - unanswered,
    unansweredCount: unanswered,
    chapterStats,
  };
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
