import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, RotateCcw, Sparkles, Target, XCircle } from "lucide-react";
import { api } from "../api";
import { fmtScore, formatDate, formatDuration, useAsync } from "../hooks";
import { ScoreRing } from "../components/Charts";
import { ErrorBox, Loading, Segmented, masteryOf, useDialogs } from "../components/ui";
import { QuestionReview } from "../components/QuestionReview";
import { MasteryRow } from "./Dashboard";

type Filter = "all" | "ko" | "ok" | "na";

export function Results() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();
  const { data, error, loading } = useAsync(() => api.attempt(id), [id]);
  const [filter, setFilter] = useState<Filter>("all");

  const resultById = useMemo(() => new Map((data?.results ?? []).map((r) => [r.questionId, r])), [data]);
  useEffect(() => {
    if (data && data.status !== "submitted") navigate(`/examen/${data.id}`, { replace: true });
  }, [data, navigate]);
  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorBox message={error ?? "Résultat introuvable"} /></div>;
  if (data.status !== "submitted") return null;

  const score = data.score20 ?? 0;
  const stats = data.chapterStats ?? [];
  const mastered = stats.filter((c) => c.rate >= 0.75);
  const toWork = stats.filter((c) => c.rate < 0.5);
  const verdict = score >= 16 ? "Excellent travail." : score >= 14 ? "Très bon résultat." : score >= 12 ? "Bon résultat, encore quelques points à consolider." : score >= 10 ? "Moyenne atteinte — consolidez les chapitres signalés." : "En dessous de la moyenne : reprenez les chapitres à retravailler.";
  const questions = data.quiz.questions.filter((q) => {
    const r = resultById.get(q.id);
    if (filter === "all" || !r) return true;
    if (filter === "na") return r.selected.length === 0;
    if (filter === "ok") return r.isCorrect;
    return !r.isCorrect && r.selected.length > 0;
  });

  const retry = async () => {
    try {
      const a = await api.startAttempt(data.quizId, { mode: data.mode, secondsPerQuestion: data.durationLimitSec ? Math.round(data.durationLimitSec / data.questionCount) : 90 });
      navigate(`/examen/${a.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="page narrow">
      <Link to={`/qcm/${data.quizId}`} className="crumb"><ArrowLeft size={14} /> {data.quiz.title}</Link>
      <div className="eyebrow">Résultats · {data.mode === "examen" ? "examen" : "entraînement"} du {formatDate(data.submittedAt ?? data.startedAt, true)}</div>

      <div className="card score-hero">
        <ScoreRing score20={score} />
        <div style={{ minWidth: 0, width: "100%" }}>
          <h1 className="display" style={{ fontSize: 26, lineHeight: 1.2 }}>{verdict}</h1>
          <div className="muted mt-4">{fmtScore(data.percent)} % de réussite{data.quiz.scoring === "partiel" ? " (barème partiel)" : ""}</div>
          <div className="stat-row mt-16">
            <div className="stat"><div className="stat-v" style={{ color: "var(--good)" }}>{data.correctCount}</div><div className="stat-l row gap-4"><CheckCircle2 size={12} /> Justes</div></div>
            <div className="stat"><div className="stat-v" style={{ color: "var(--bad)" }}>{data.wrongCount}</div><div className="stat-l row gap-4"><XCircle size={12} /> Fausses</div></div>
            <div className="stat"><div className="stat-v">{data.unansweredCount}</div><div className="stat-l">Sans réponse</div></div>
            <div className="stat"><div className="stat-v mono">{formatDuration(data.elapsedSec)}</div><div className="stat-l row gap-4"><Clock size={12} /> Durée</div></div>
          </div>
          <div className="row gap-8 wrap mt-16" style={{ justifyContent: "inherit" }}>
            <button className="btn" onClick={retry}><RotateCcw /> Repasser</button>
            <Link className="btn" to={`/generer?${new URLSearchParams({ ...(data.quiz.subjectId && { matiere: data.quiz.subjectId }) })}`}><Sparkles /> Nouveau QCM</Link>
          </div>
        </div>
      </div>

      {stats.length > 0 && (
        <div className="grid grid-2 mt-16">
          <div className="card">
            <div className="card-head"><h2 className="row gap-8"><Target size={16} /> Réussite par chapitre</h2></div>
            <div className="card-body">
              {stats.map((c) => <MasteryRow key={c.chapterName} name={c.chapterName} sub={`${c.correct}/${c.total} justes`} rate={c.rate} />)}
            </div>
          </div>
          <div className="card card-pad stack gap-16">
            <div>
              <div className="label row gap-6" style={{ color: "var(--good)" }}><CheckCircle2 size={15} /> Chapitres maîtrisés</div>
              <div className="small muted mt-4">{mastered.length ? mastered.map((c) => c.chapterName).join(" · ") : "Aucun chapitre au-dessus de 75 % pour l'instant."}</div>
            </div>
            <div>
              <div className="label row gap-6" style={{ color: "var(--bad)" }}><XCircle size={15} /> Chapitres à retravailler</div>
              <div className="small muted mt-4">{toWork.length ? toWork.map((c) => c.chapterName).join(" · ") : "Aucun chapitre sous 50 %."}</div>
            </div>
            {stats.filter((c) => c.rate >= 0.5 && c.rate < 0.75).length > 0 && (
              <div>
                <div className="label" style={{ color: "var(--warn)" }}>À consolider</div>
                <div className="small muted mt-4">{stats.filter((c) => masteryOf(c.rate).cls === "warn").map((c) => c.chapterName).join(" · ")}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card mt-24">
        <div className="card-head wrap">
          <h2>Correction détaillée</h2>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `Toutes (${data.questionCount})` },
              { value: "ko", label: `Erreurs (${data.wrongCount})` },
              { value: "ok", label: `Justes (${data.correctCount})` },
              { value: "na", label: `Sans réponse (${data.unansweredCount})` },
            ]}
          />
        </div>
        {questions.map((q) => (
          <QuestionReview key={q.id} q={q} index={data.quiz.questions.indexOf(q)} result={resultById.get(q.id)} multi={data.quiz.type === "multiple"} />
        ))}
        {!questions.length && <div className="card-body subtle">Aucune question dans cette catégorie.</div>}
      </div>
    </div>
  );
}
