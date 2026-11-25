import { AlertTriangle, BookMarked, CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import type { OptionLabel, Question, QuestionResult } from "../../shared/types";

/** Affichage corrigé d'une question : propositions, choix, correction, explications, référence. */
export function QuestionReview({
  q,
  index,
  result,
  showAnswers = true,
  multi,
}: {
  q: Question;
  index: number;
  result?: QuestionResult;
  showAnswers?: boolean;
  multi: boolean;
}) {
  const selected = new Set<OptionLabel>(result?.selected ?? []);
  const correct = new Set(q.correct);
  const status = !result ? null : result.selected.length === 0 ? "na" : result.isCorrect ? "ok" : "ko";

  return (
    <div className="review-item" id={`q-${index + 1}`}>
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        <div className={`q-num ${status ?? "na"}`}>{index + 1}</div>
        <div className="flex-1">
          <div className="row gap-6 wrap" style={{ marginBottom: 8 }}>
            {status === "ok" && <span className="badge badge-good"><CheckCircle2 /> Juste</span>}
            {status === "ko" && <span className="badge badge-bad"><XCircle /> {result && result.points > 0 ? `Partiel · ${result.points} pt` : "Faux"}</span>}
            {status === "na" && <span className="badge">Sans réponse</span>}
            {q.chapterName && <span className="badge">{q.chapterName}</span>}
            {q.outOfCourse && <span className="badge badge-warn"><AlertTriangle /> Hors cours</span>}
          </div>
          <p className="q-stem" style={{ fontSize: 15.5, marginBottom: 14 }}>{q.stem}</p>
          <div className="options">
            {q.options.map((o) => {
              const isC = correct.has(o.label);
              const isS = selected.has(o.label);
              let cls = "";
              let tag = "";
              if (showAnswers) {
                if (result) {
                  if (isC && isS) (cls = "correct"), (tag = "Votre choix · juste");
                  else if (!isC && isS) (cls = "wrong"), (tag = "Votre choix · faux");
                  else if (isC && !isS) (cls = "missed"), (tag = "Bonne réponse");
                } else if (isC) (cls = "correct"), (tag = "Bonne réponse");
              }
              return (
                <div key={o.label} className={`option ${multi ? "multi" : ""} ${cls}`} style={{ cursor: "default" }}>
                  <span className="option-letter">{o.label}</span>
                  <div className="option-text">
                    {o.text}
                    {showAnswers && o.rationale && <div className="option-why">{o.rationale}</div>}
                  </div>
                  {tag && <span className="option-tag" style={{ color: cls === "wrong" ? "var(--bad)" : "var(--good)" }}>{tag}</span>}
                </div>
              );
            })}
          </div>
          {showAnswers && (
            <div className="stack gap-8 mt-16">
              <div className="callout primary">
                <div className="callout-title"><CheckCircle2 /> Correction — réponse{q.correct.length > 1 ? "s" : ""} {q.correct.join(", ")}</div>
                {q.correction}
              </div>
              {q.explanation && (
                <div className="callout">
                  <div className="callout-title"><Lightbulb /> Explication pédagogique</div>
                  {q.explanation}
                </div>
              )}
              {q.outOfCourse && (
                <div className="callout warn">
                  <div className="callout-title"><AlertTriangle /> Information non présente dans le cours</div>
                  {q.outOfCourseNote}
                </div>
              )}
              <div className="row gap-6 xs subtle" style={{ alignItems: "flex-start" }}>
                <BookMarked size={13} style={{ flexShrink: 0, marginTop: 2 }} /> <span>Référence : {q.reference}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
