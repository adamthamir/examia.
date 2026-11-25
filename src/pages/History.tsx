import { Link, useNavigate } from "react-router-dom";
import { History as HistoryIcon, Trash2 } from "lucide-react";
import { api } from "../api";
import { fmtScore, formatDate, formatDuration, useAsync } from "../hooks";
import { Empty, ErrorBox, Loading, PageHeader, scoreTone, useDialogs } from "../components/ui";

export function History() {
  const navigate = useNavigate();
  const { confirm } = useDialogs();
  const { data, error, loading, reload } = useAsync(() => api.attempts(), []);
  return (
    <div className="page">
      <PageHeader title="Historique" subtitle="Tous vos examens et entraînements, avec leur correction." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : data?.length ? (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>QCM</th><th className="hide-sm">Date</th><th>Note</th><th className="hide-sm">Justes</th><th className="hide-sm">Durée</th><th /></tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="click" onClick={() => navigate(a.status === "submitted" ? `/resultats/${a.id}` : `/examen/${a.id}`)}>
                  <td style={{ maxWidth: 340 }}>
                    <div className="truncate" style={{ fontWeight: 500 }}>{a.quizTitle}</div>
                    <div className="xs subtle">{a.subjectName ?? "Cours"} · {a.mode === "examen" ? "Examen" : "Entraînement"}</div>
                  </td>
                  <td className="hide-sm nowrap">{formatDate(a.submittedAt ?? a.startedAt, true)}</td>
                  <td>{a.status === "submitted" ? <span className={`badge mono ${scoreTone(a.score20)}`}>{fmtScore(a.score20)}/20</span> : <span className="badge badge-primary">En cours · reprendre</span>}</td>
                  <td className="hide-sm mono">{a.status === "submitted" ? `${a.correctCount}/${a.questionCount}` : "—"}</td>
                  <td className="hide-sm mono">{a.status === "submitted" ? formatDuration(a.elapsedSec) : "—"}</td>
                  <td style={{ width: 40 }}>
                    <button className="icon-btn" title="Supprimer" onClick={async (e) => {
                      e.stopPropagation();
                      if (await confirm({ title: "Supprimer cette tentative ?", message: "Elle ne sera plus comptée dans vos statistiques.", confirmLabel: "Supprimer", danger: true })) {
                        await api.deleteAttempt(a.id);
                        reload();
                      }
                    }}><Trash2 /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card"><Empty icon={<HistoryIcon size={20} />} title="Aucun examen passé" text="Vos résultats apparaîtront ici." action={<Link to="/qcm" className="btn btn-primary">Voir mes QCM</Link>} /></div>
      )}
    </div>
  );
}
