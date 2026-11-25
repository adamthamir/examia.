import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, FileUp, GraduationCap, ListChecks, Sparkles, Target, TrendingUp, Trophy } from "lucide-react";
import { api } from "../api";
import { fmtScore, relativeTime, useAsync } from "../hooks";
import { ScoreChart } from "../components/Charts";
import { Empty, ErrorBox, FileIcon, Loading, PageHeader, masteryOf, scoreTone } from "../components/ui";

export function Dashboard() {
  const { data, error, loading, reload } = useAsync(() => api.dashboard(), []);
  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error || !data) return <div className="page"><ErrorBox message={error ?? "Erreur"} onRetry={reload} /></div>;

  const hour = new Date().getHours();
  const greeting = hour < 18 ? "Bonjour" : "Bonsoir";
  const isNew = data.documentCount === 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting}. Prêt à réviser ?`}
        subtitle="Votre espace personnel : cours, QCM, examens et progression."
        actions={
          <>
            <Link to="/bibliotheque" className="btn"><FileUp /> Importer un cours</Link>
            <Link to="/generer" className="btn btn-primary"><Sparkles /> Générer un QCM</Link>
          </>
        }
      />

      {isNew ? (
        <Onboarding />
      ) : (
        <>
          <div className="grid grid-4">
            <Kpi icon={<GraduationCap />} label="Moyenne générale" value={data.averageScore20 != null ? fmtScore(data.averageScore20) : "—"} unit={data.averageScore20 != null ? "/20" : ""} foot={`${data.attemptCount} examen${data.attemptCount > 1 ? "s" : ""} validé${data.attemptCount > 1 ? "s" : ""}`} />
            <Kpi icon={<Trophy />} label="Meilleure note" value={fmtScore(data.bestScore20)} unit={data.bestScore20 != null ? "/20" : ""} foot={`${data.questionsAnswered} questions traitées`} />
            <Kpi icon={<ListChecks />} label="QCM générés" value={String(data.quizCount)} foot="prêts à l'entraînement" />
            <Kpi icon={<BookOpen />} label="Cours importés" value={String(data.documentCount)} foot={`${data.subjectCount} matière${data.subjectCount > 1 ? "s" : ""}`} />
          </div>

          <div className="grid mt-16" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)" }} data-dash>
            <div className="card">
              <div className="card-head">
                <h2 className="row gap-8"><TrendingUp size={16} /> Évolution des résultats</h2>
                <span className="subtle xs">Note /20 · seuil de validation 10</span>
              </div>
              <div className="card-body">
                {data.evolution.length ? (
                  <ScoreChart points={data.evolution} />
                ) : (
                  <Empty icon={<TrendingUp />} title="Aucun examen validé" text="Passez votre premier examen pour suivre votre progression." action={<Link to="/qcm" className="btn">Voir mes QCM</Link>} />
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2 className="row gap-8"><Target size={16} /> Points faibles</h2>
              </div>
              {data.weakPoints.length ? (
                <div className="card-body">
                  {data.weakPoints.map((c) => <MasteryRow key={`${c.subjectName}-${c.chapterName}`} name={c.chapterName} sub={c.subjectName} rate={c.rate} />)}
                  <Link to="/generer" className="btn btn-sm mt-12">Cibler ces chapitres <ArrowRight /></Link>
                </div>
              ) : (
                <div className="card-body muted small">
                  {data.attemptCount
                    ? "Aucun chapitre sous 60 % de réussite. Continuez ainsi !"
                    : "Vos chapitres à retravailler apparaîtront ici après vos premiers examens."}
                  {data.strongPoints.length > 0 && (
                    <>
                      <div className="label mt-16" style={{ color: "var(--text)" }}>Chapitres maîtrisés</div>
                      {data.strongPoints.map((c) => <MasteryRow key={`${c.subjectName}-${c.chapterName}`} name={c.chapterName} sub={c.subjectName} rate={c.rate} />)}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-3 mt-16">
            <RecentCard title="Derniers examens" to="/historique" empty="Aucun examen pour l'instant.">
              {data.recentAttempts.map((a) => (
                <Link key={a.id} to={`/resultats/${a.id}`} className="list-item">
                  <div className="flex-1">
                    <div className="truncate" style={{ fontWeight: 500 }}>{a.quizTitle}</div>
                    <div className="xs subtle">{relativeTime(a.submittedAt ?? a.startedAt)}</div>
                  </div>
                  <span className={`badge ${scoreTone(a.score20)} mono`}>{fmtScore(a.score20)}/20</span>
                </Link>
              ))}
            </RecentCard>
            <RecentCard title="Derniers QCM" to="/qcm" empty="Aucun QCM généré.">
              {data.recentQuizzes.map((q) => (
                <Link key={q.id} to={`/qcm/${q.id}`} className="list-item">
                  <div className="flex-1">
                    <div className="truncate" style={{ fontWeight: 500 }}>{q.title}</div>
                    <div className="xs subtle">{q.status === "generating" ? "Génération en cours…" : `${q.questionCount} questions · ${relativeTime(q.createdAt)}`}</div>
                  </div>
                  {q.status === "generating" && <span className="spinner" />}
                </Link>
              ))}
            </RecentCard>
            <RecentCard title="Derniers cours" to="/bibliotheque" empty="Aucun cours importé.">
              {data.recentDocuments.map((d) => (
                <Link key={d.id} to={`/bibliotheque/document/${d.id}`} className="list-item">
                  <FileIcon kind={d.kind} />
                  <div className="flex-1">
                    <div className="truncate" style={{ fontWeight: 500 }}>{d.filename}</div>
                    <div className="xs subtle truncate">{d.subjectName ?? "Non classé"}{d.chapterName ? ` › ${d.chapterName}` : ""}</div>
                  </div>
                </Link>
              ))}
            </RecentCard>
          </div>
        </>
      )}
      <style>{`@media (max-width: 860px){[data-dash]{grid-template-columns:minmax(0,1fr)!important}}`}</style>
    </div>
  );
}

function Kpi({ icon, label, value, unit, foot }: { icon: React.ReactNode; label: string; value: string; unit?: string; foot?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{icon}{label}</div>
      <div className="kpi-value">{value}{unit && <small>{unit}</small>}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

export function MasteryRow({ name, sub, rate }: { name: string; sub?: string | null; rate: number }) {
  const m = masteryOf(rate);
  return (
    <div className="bar-row">
      <div className="truncate">
        <div className="truncate small" style={{ fontWeight: 500 }}>{name}</div>
        {sub && <div className="xs subtle truncate">{sub}</div>}
      </div>
      <div className="hbar" aria-hidden><span style={{ width: `${Math.round(rate * 100)}%`, background: m.color }} /></div>
      <div className="small mono" style={{ textAlign: "right", fontWeight: 600 }}>{Math.round(rate * 100)} %</div>
    </div>
  );
}

function RecentCard({ title, to, empty, children }: { title: string; to: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <Link to={to} className="btn btn-ghost btn-sm">Tout voir <ArrowRight /></Link>
      </div>
      <div className="list">{children.length ? children : <div className="card-body subtle small">{empty}</div>}</div>
    </div>
  );
}

function Onboarding() {
  const steps = [
    { t: "Importez vos cours", d: "PDF, PowerPoint, Word ou photos de vos notes. Le texte est extrait automatiquement.", to: "/bibliotheque", cta: "Importer" },
    { t: "Générez des QCM", d: "Choisissez la matière, le chapitre, la difficulté et le format. L'IA s'appuie sur votre cours.", to: "/generer", cta: "Générer" },
    { t: "Simulez l'examen", d: "Chronomètre, navigation libre, validation finale, puis correction détaillée et note sur 20.", to: "/qcm", cta: "Mes QCM" },
  ];
  return (
    <div className="card card-pad">
      <div className="eyebrow">Premiers pas</div>
      <h2 className="display" style={{ fontSize: 22 }}>Trois étapes pour préparer vos examens</h2>
      <div className="steps mt-24">
        {steps.map((s, i) => (
          <div key={s.t} className="card step" style={{ boxShadow: "none" }}>
            <div className="step-n">{i + 1}</div>
            <div style={{ fontWeight: 600 }}>{s.t}</div>
            <p className="small muted" style={{ margin: "6px 0 14px" }}>{s.d}</p>
            <Link to={s.to} className={`btn btn-sm ${i === 0 ? "btn-primary" : ""}`}>{s.cta} <ArrowRight /></Link>
          </div>
        ))}
      </div>
    </div>
  );
}
