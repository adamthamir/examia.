import { getProvider } from "./ai/index.js";
import type { RawQuestion, SourceBlock } from "./ai/types.js";
import { json } from "./db.js";
import { getDocumentRow, id, setQuizError, setQuizProgress, setQuizReady } from "./repo.js";
import type { Difficulty, OptionLabel, Question, QuestionType, Section } from "../shared/types.js";

const LABELS: OptionLabel[] = ["A", "B", "C", "D"];

export interface GenerationJob {
  quizId: string;
  userId: string;
  documentIds: string[];
  subjectName: string | null;
  scopeLabel: string;
  count: number;
  difficulty: Difficulty;
  type: QuestionType;
}

export function buildSources(userId: string, documentIds: string[]): SourceBlock[] {
  const sources: SourceBlock[] = [];
  documentIds.forEach((docId, di) => {
    const d = getDocumentRow(userId, docId);
    if (!d || d.status !== "ready") return;
    for (const s of json<Section[]>(d.sections, [])) {
      sources.push({
        ref: `D${di + 1}-${s.id}`,
        documentName: d.filename,
        sectionLabel: s.label,
        chapterId: d.chapter_id,
        chapterName: d.chapter_name,
        text: s.text,
      });
    }
  });
  return sources;
}

/** Lance la génération en tâche de fond ; la progression est stockée en base. */
export function runGeneration(job: GenerationJob) {
  void (async () => {
    try {
      const sources = buildSources(job.userId, job.documentIds);
      if (!sources.length) throw new Error("Aucun contenu de cours exploitable pour ce périmètre.");
      const provider = getProvider();
      const generate = (count: number, weight: number, offset: number) =>
        provider.generate({
          subjectName: job.subjectName,
          scopeLabel: job.scopeLabel,
          sources,
          count,
          difficulty: job.difficulty,
          type: job.type,
          onProgress: (r) => setQuizProgress(job.quizId, offset + r * weight),
        });

      let questions = normalize(await generate(job.count, 0.9, 0), sources, job);
      // Complément unique si certaines questions ont été rejetées à la validation.
      const missing = job.count - questions.length;
      if (missing > 0 && provider.name === "anthropic") {
        const extra = normalize(await generate(Math.min(missing + 2, 20), 0.09, 0.9), sources, job);
        const seen = new Set(questions.map((q) => q.stem));
        questions = questions.concat(extra.filter((q) => !seen.has(q.stem)));
      }
      questions = questions.slice(0, job.count);
      if (!questions.length) throw new Error("Aucune question valide n'a pu être générée.");
      setQuizReady(job.quizId, questions);
    } catch (err) {
      console.error("[génération]", err);
      setQuizError(job.quizId, err instanceof Error ? err.message : "Erreur inconnue lors de la génération.");
    }
  })();
}

/** Valide et normalise les questions brutes ; rejette celles qui sont mal formées. */
export function normalize(raw: RawQuestion[], sources: SourceBlock[], job: Pick<GenerationJob, "type" | "difficulty">): Question[] {
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  const out: Question[] = [];
  for (const r of raw) {
    if (!r?.stem?.trim() || !Array.isArray(r.options) || r.options.length !== 4) continue;
    const options = r.options.map((o, i) => ({
      label: LABELS[i],
      text: String(o.text ?? "").trim(),
      rationale: String(o.rationale ?? "").trim(),
    }));
    if (options.some((o) => !o.text)) continue;
    // Si le modèle a mélangé les étiquettes, on réaligne les bonnes réponses sur la position.
    const labelMap = new Map(r.options.map((o, i) => [o.label, LABELS[i]]));
    const correct = Array.from(new Set((r.correct ?? []).map((c) => labelMap.get(c) ?? c)))
      .filter((c): c is OptionLabel => LABELS.includes(c as OptionLabel))
      .sort();
    if (!correct.length) continue;
    if (job.type === "unique" && correct.length !== 1) continue;

    const refs = (r.source_refs ?? []).map((x) => byRef.get(String(x).trim())).filter(Boolean) as SourceBlock[];
    const refLabels = Array.from(new Set(refs.map((s) => `${s.documentName} — ${s.sectionLabel}`)));
    const chapter = refs.find((s) => s.chapterName) ?? null;
    let outOfCourse = Boolean(r.out_of_course);
    let note = String(r.out_of_course_note ?? "").trim();
    if (!refs.length && !outOfCourse) {
      outOfCourse = true;
      note = "Aucune référence précise au cours n'a été identifiée pour cette question : vérifiez-la dans vos documents.";
    }

    out.push({
      id: id(),
      stem: r.stem.trim(),
      options,
      correct,
      correction: String(r.correction ?? "").trim(),
      explanation: String(r.explanation ?? "").trim(),
      reference: [r.topic?.trim(), refLabels.join(" ; ")].filter(Boolean).join(" · ") || "Référence non identifiée",
      chapterId: chapter?.chapterId ?? null,
      chapterName: chapter?.chapterName ?? (refs[0] ? refs[0].documentName.replace(/\.[a-z0-9]+$/i, "") : null),
      difficulty: job.difficulty,
      outOfCourse,
      outOfCourseNote: outOfCourse ? note || "Cette question mobilise une notion qui ne figure pas explicitement dans le cours." : "",
    });
  }
  return out;
}
