import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, BookOpenCheck, Eye, EyeOff, Pencil, Play, RotateCcw, Timer, Trash2 } from "lucide-react";
import { api } from "../api";
import { fmtScore, formatDate, formatDuration, useAsync } from "../hooks";
import { DifficultyBadge, ErrorBox, Loading, Modal, Progress, Segmented, scoreTone, useDialogs } from "../components/ui";
import { QuestionReview } from "../components/QuestionReview";

export function QuizDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { confirm, prompt, toast } = useDialogs();
  const quiz = useAsync(() => api.quiz(id), [id], (q) => (q?.status === "generating" ? 1500 : null));
  const attempts = useAsync(() => api.attempts({ quizId: id }), [id]);
  const [startOpen, setStartOpen] = useState(false);
  const [perQ, setPerQ] = useState(90);
  const [preview, setPreview] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [starting, setStarting] = useState(false);

  if (quiz.loading && !quiz.data) return <div className="page"><Loading /></div>;
  if (quiz.error || !quiz.data) return <div className="page"><ErrorBox message={quiz.error ?? "QCM introuvable"} /></div>;
  const q = quiz.data;
  const inProgress = attempts.data?.find((a) => a.status === "in_progress");
  const done = attempts.data?.filter((a) => a.status === "submitted") ?? [];
  const outOfCourse = q.questions.filter((x) => x.outOfCourse).length;

  const start = async (mode: "examen" | "entrainement") => {
    setStarting(true);
    try {
      const a = await api.startAttempt(q.id, { mode, secondsPerQuestion: perQ });
      navigate(`/examen/${a.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setStarting(false);
    }
  };

  const regenerate = async () => {
    try {
      const n = await api.createQuiz({ subjectId: q.subjectId, chapterId: q.chapterId, documentIds: q.documentIds, count: q.requestedCount, difficulty: q.difficulty, type: q.type, scoring: q.scoring, title: q.title });
      await api.deleteQuiz(q.id);
      navigate(`/qcm/${n.id}`, { replace: true });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="page narrow">
      <Link to="/qcm" className="crumb"><ArrowLeft size={14} /> Mes QCM</Link>
      <div className="row gap-16 wrap" style={{ alignItems: "flex-start", marginBottom: 20 }}>
        <div className="flex-1">
          <div className="eyebrow">{q.subjectName ?? "Cours"}{q.chapterName ? ` › ${q.chapterName}` : " › Ensemble du cours"}</div>
          <h1 className="display" style={{ fontSize: 28, lineHeight: 1.2 }}>{q.title}</h1>
          <div className="row gap-6 wrap mt-12">
            <span className="badge">{q.status === "ready" ? q.questionCount : q.requestedCount} questions</span>
            <DifficultyBadge d={q.difficulty} />
            <span className="badge">{q.type === "unique" ? "Réponse unique" : "Réponses multiples"}</span>
            {q.type === "multiple" && <span className="badge">Barème {q.scoring === "strict" ? "tout ou rien" : "partiel"}</span>}
            <span className="badge">{q.provider.startsWith("anthropic") ? "Généré par IA" : "Mode démo"}</span>
          </div>
        </div>
        <div className="row gap-8">
          <button className="btn btn-icon" title="Renommer" onClick={async () => {
            const t = await prompt({ title: "Renommer le QCM", initial: q.title });
            if (t) quiz.setData(await api.renameQuiz(q.id, t));
          }}><Pencil /></button>
          <button className="btn btn-icon btn-danger" title="Supprimer" onClick={async () => {
            if (!(await confirm({ title: "Supprimer ce QCM ?", message: "Le questionnaire et l'historique de ses examens seront supprimés.", confirmLabel: "Supprimer", danger: true }))) return;
            await api.deleteQuiz(q.id);
            navigate("/qcm");
          }}><Trash2 /></button>
        </div>
      </div>

      {q.status === "generating" && (
        <div className="card card-pad">
          <div className="row gap-12"><span className="spinner lg" />
            <div className="flex-1">
              <div style={{ fontWeight: 600 }}>Génération des questions en cours</div>
              <div className="small muted">Analyse du cours, conception des questions et rédaction des corrections. Comptez de quelques secondes à quelques minutes selon le volume ; vous pouvez quitter cette page.</div>
            </div>
          </div>
          <div className="mt-16"><Progress value={q.progress} indeterminate={q.progress === 0} /></div>
          <div className="xs subtle mt-8 mono">{Math.round(q.progress * 100)} %</div>
        </div>
      )}

      {q.status === "error" && (
        <div className="callout bad">
          <div className="callout-title"><AlertCircle /> La génération a échoué</div>
          {q.error}
          <div className="mt-12"><button className="btn btn-sm" onClick={regenerate}><RotateCcw /> Relancer la génération</button></div>
        </div>
      )}

      {q.status === "ready" && (
        <>
          <div className="grid grid-2">
            <button className="card card-pad choice" style={{ display: "block" }} onClick={() => setStartOpen(true)}>
              <div className="row gap-8" style={{ fontWeight: 600 }}><Timer size={17} /> Mode examen</div>
              <div className="small muted mt-4">Chronomètre, une question à la fois, navigation libre, validation définitive puis note sur 20.</div>
              <span className="btn btn-primary mt-16"><Play /> Démarrer l'examen</span>
            </button>
            <button className="card card-pad choice" style={{ display: "block" }} disabled={starting} onClick={() => start("entrainement")}>
              <div className="row gap-8" style={{ fontWeight: 600 }}><BookOpenCheck size={17} /> Mode entraînement</div>
              <div className="small muted mt-4">Sans chronomètre. Vérifiez chaque réponse et lisez la correction immédiatement.</div>
              <span className="btn mt-16"><Play /> S'entraîner</span>
            </button>
          </div>
          {q.questionCount < q.requestedCount && (
            <div className="callout warn mt-16">
              <div className="callout-title"><AlertCircle /> {q.questionCount} questions générées sur {q.requestedCount} demandées</div>
              Le contenu disponible ne permettait pas davantage de questions distinctes et fondées sur le cours. Ajoutez des documents ou élargissez le périmètre.
            </div>
          )}
          {inProgress && (
            <div className="callout primary mt-16 row gap-12 wrap between">
              <div><b>Un examen est en cours.</b> Commencé le {formatDate(inProgress.startedAt, true)}.</div>
              <Link to={`/examen/${inProgress.id}`} className="btn btn-sm btn-primary">Reprendre</Link>
            </div>
          )}
          {outOfCourse > 0 && (
            <div className="callout warn mt-16">
              <div className="callout-title"><AlertCircle /> {outOfCourse} question{outOfCourse > 1 ? "s" : ""} signalée{outOfCourse > 1 ? "s" : ""} « hors cours »</div>
              Elles mobilisent une notion absente ou non localisée dans vos documents ; le détail figure dans leur correction.
            </div>
          )}

          {done.length > 0 && (
            <div className="card mt-24">
              <div className="card-head"><h2>Tentatives</h2></div>
              <table className="table">
                <thead><tr><th>Date</th><th>Note</th><th className="hide-sm">Réussite</th><th className="hide-sm">Durée</th></tr></thead>
                <tbody>
                  {done.map((a) => (
                    <tr key={a.id} className="click" onClick={() => navigate(`/resultats/${a.id}`)}>
                      <td>{formatDate(a.submittedAt ?? a.startedAt, true)} {a.mode === "entrainement" && <span className="badge">Entraînement</span>}</td>
                      <td><span className={`badge mono ${scoreTone(a.score20)}`}>{fmtScore(a.score20)}/20</span></td>
                      <td className="hide-sm mono">{fmtScore(a.percent)} %</td>
                      <td className="hide-sm mono">{formatDuration(a.elapsedSec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card mt-24">
            <div className="card-head">
              <h2>Aperçu des questions</h2>
              <div className="row gap-8">
                {preview && (
                  <button className="btn btn-sm" onClick={() => setShowAnswers((v) => !v)}>
                    {showAnswers ? <><EyeOff /> Masquer les corrections</> : <><Eye /> Afficher les corrections</>}
                  </button>
                )}
                <button className="btn btn-sm" onClick={() => setPreview((v) => !v)}>{preview ? "Replier" : "Déplier"}</button>
              </div>
            </div>
            {preview ? (
              q.questions.map((x, i) => <QuestionReview key={x.id} q={x} index={i} showAnswers={showAnswers} multi={q.type === "multiple"} />)
            ) : (
              <div className="card-body small muted">Dépliez pour parcourir les énoncés (mode révision). Évitez de consulter les corrections avant un examen blanc.</div>
            )}
          </div>
        </>
      )}

      {startOpen && (
        <Modal
          title="Démarrer l'examen"
          onClose={() => setStartOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setStartOpen(false)}>Annuler</button>
              <button className="btn btn-primary" disabled={starting} onClick={() => start("examen")}><Play /> Commencer</button>
            </>
          }
        >
          <div className="stack gap-12">
            <div className="field">
              <label className="label">Temps par question</label>
              <Segmented value={perQ} onChange={setPerQ} options={[45, 60, 90, 120].map((s) => ({ value: s, label: `${s} s` }))} />
            </div>
            <div className="callout">
              Durée totale : <b className="mono">{formatDuration(perQ * q.questions.length)}</b> pour {q.questions.length} questions. À la fin du temps, la copie est validée automatiquement. Les corrections ne sont accessibles qu'après la validation.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
