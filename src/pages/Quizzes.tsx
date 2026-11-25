import { Link } from "react-router-dom";
import { AlertCircle, ListChecks, Sparkles } from "lucide-react";
import { api } from "../api";
import { fmtScore, relativeTime, useAsync } from "../hooks";
import { DifficultyBadge, Empty, ErrorBox, Loading, PageHeader, Progress, scoreTone } from "../components/ui";

export function Quizzes() {
  const { data, error, loading, reload } = useAsync(() => api.quizzes(), [], (d) => (d?.some((q) => q.status === "generating") ? 2000 : null));
  return (
    <div className="page">
      <PageHeader title="Mes QCM" subtitle="Tous vos questionnaires générés, prêts pour l'entraînement ou l'examen blanc." actions={<Link to="/generer" className="btn btn-primary"><Sparkles /> Nouveau QCM</Link>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        <div className="grid grid-3">
          {data.map((q) => (
            <Link key={q.id} to={`/qcm/${q.id}`} className="card card-pad stack gap-12" style={{ transition: "box-shadow .15s, transform .15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--shadow)")} onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "")}>
              <div className="row between gap-8">
                <span className="xs subtle truncate">{q.subjectName ?? "Cours"}{q.chapterName ? ` › ${q.chapterName}` : ""}</span>
                <span className="xs subtle nowrap">{relativeTime(q.createdAt)}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35 }}>{q.title}</div>
              {q.status === "generating" ? (
                <div className="stack gap-6">
                  <div className="row gap-8 small muted"><span className="spinner" /> Génération… {Math.round(q.progress * 100)} %</div>
                  <Progress value={q.progress} indeterminate={q.progress === 0} />
                </div>
              ) : q.status === "error" ? (
                <span className="badge badge-bad" style={{ alignSelf: "flex-start" }}><AlertCircle /> Échec de génération</span>
              ) : (
                <div className="row gap-6 wrap">
                  <span className="badge">{q.questionCount} questions</span>
                  <DifficultyBadge d={q.difficulty} />
                  <span className="badge">{q.type === "unique" ? "Réponse unique" : "Réponses multiples"}</span>
                </div>
              )}
              <div className="row between small" style={{ marginTop: "auto", paddingTop: 4 }}>
                <span className="muted">{q.attemptCount ? `${q.attemptCount} tentative${q.attemptCount > 1 ? "s" : ""}` : "Jamais passé"}</span>
                {q.bestScore != null && <span className={`badge ${scoreTone(q.bestScore)} mono`}>Meilleure : {fmtScore(q.bestScore)}/20</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card"><Empty icon={<ListChecks size={20} />} title="Aucun QCM" text="Générez votre premier QCM à partir d'un cours importé." action={<Link to="/generer" className="btn btn-primary">Générer un QCM</Link>} /></div>
      )}
    </div>
  );
}
