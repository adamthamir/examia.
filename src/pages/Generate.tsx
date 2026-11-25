import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Info, Sparkles } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { Empty, FileIcon, Loading, PageHeader, Segmented, useDialogs } from "../components/ui";
import { QUESTION_COUNTS, type Difficulty, type QuestionType, type ScoringMode } from "../../shared/types";

const DIFFICULTIES: { value: Difficulty; title: string; desc: string }[] = [
  { value: "facile", title: "Facile", desc: "Définitions et faits explicites du cours" },
  { value: "intermediaire", title: "Intermédiaire", desc: "Compréhension et liens entre notions" },
  { value: "difficile", title: "Difficile", desc: "Mécanismes, exceptions, distracteurs proches" },
  { value: "examen", title: "Niveau examen", desc: "Mélange représentatif d'une épreuve, avec pièges" },
];

export function Generate() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();
  const subjects = useAsync(() => api.subjects(), []);
  const allDocs = useAsync(() => api.documents(), []);
  const ai = useAsync(() => api.aiStatus(), []);

  const [subjectId, setSubjectId] = useState(params.get("matiere") ?? "");
  const [chapterId, setChapterId] = useState(params.get("chapitre") ?? "");
  const [count, setCount] = useState<number>(20);
  const [difficulty, setDifficulty] = useState<Difficulty>("examen");
  const [type, setType] = useState<QuestionType>("multiple");
  const [scoring, setScoring] = useState<ScoringMode>("strict");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string> | null>(params.get("document") ? new Set([params.get("document")!]) : null);
  const [submitting, setSubmitting] = useState(false);

  const subject = subjects.data?.find((s) => s.id === subjectId);
  useEffect(() => {
    if (!subjectId && subjects.data?.length === 1) setSubjectId(subjects.data[0].id);
  }, [subjects.data, subjectId]);

  const scopeDocs = useMemo(
    () =>
      (allDocs.data ?? []).filter(
        (d) => d.status === "ready" && (!subjectId || d.subjectId === subjectId) && (!chapterId || d.chapterId === chapterId),
      ),
    [allDocs.data, subjectId, chapterId],
  );
  const selectedDocs = picked ? scopeDocs.filter((d) => picked.has(d.id)) : scopeDocs;
  const chars = selectedDocs.reduce((n, d) => n + d.charCount, 0);

  if (subjects.loading || allDocs.loading) return <div className="page"><Loading /></div>;
  if (!allDocs.data?.some((d) => d.status === "ready")) {
    return (
      <div className="page narrow">
        <PageHeader title="Générer un QCM" />
        <div className="card">
          <Empty icon={<Sparkles size={20} />} title="Importez d'abord un cours" text="Les questions sont construites à partir de vos documents. Ajoutez au moins un cours à votre bibliothèque." action={<Link to="/bibliotheque" className="btn btn-primary">Aller à la bibliothèque</Link>} />
        </div>
      </div>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    try {
      const quiz = await api.createQuiz({
        subjectId: subjectId || null,
        chapterId: chapterId || null,
        documentIds: picked ? [...picked].filter((id) => scopeDocs.some((d) => d.id === id)) : undefined,
        count,
        difficulty,
        type,
        scoring: type === "multiple" ? scoring : "strict",
        title: title.trim() || undefined,
      });
      navigate(`/qcm/${quiz.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setSubmitting(false);
    }
  };

  const toggle = (id: string) => {
    const next = new Set(picked ?? scopeDocs.map((d) => d.id));
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next.size === scopeDocs.length ? null : next);
  };

  return (
    <div className="page narrow">
      <PageHeader title="Générer un QCM" subtitle="Des questions d'entraînement construites à partir de vos cours, dans un style d'examen rigoureux." />

      <div className="stack gap-16">
        <div className="card card-pad stack gap-16">
          <div className="section-title" style={{ margin: 0 }}>1 · Périmètre</div>
          <div className="grid grid-2">
            <div className="field">
              <label className="label">Matière</label>
              <select className="select" value={subjectId} onChange={(e) => (setSubjectId(e.target.value), setChapterId(""), setPicked(null))}>
                <option value="">Tous les cours</option>
                {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Chapitre</label>
              <select className="select" value={chapterId} disabled={!subject?.chapters?.length} onChange={(e) => (setChapterId(e.target.value), setPicked(null))}>
                <option value="">Ensemble du cours</option>
                {subject?.chapters?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label className="label">Documents utilisés</label>
            {scopeDocs.length ? (
              <div className="stack gap-6">
                {scopeDocs.map((d) => {
                  const on = !picked || picked.has(d.id);
                  return (
                    <button key={d.id} type="button" className={`choice ${on ? "on" : ""}`} style={{ padding: "10px 12px", alignItems: "center" }} onClick={() => toggle(d.id)}>
                      <FileIcon kind={d.kind} />
                      <div className="flex-1">
                        <div className="truncate" style={{ fontWeight: 500 }}>{d.filename}</div>
                        <div className="xs subtle truncate">{d.chapterName ?? d.subjectName ?? "Non classé"} · {d.sectionCount} sections</div>
                      </div>
                      <span className="radio-dot" style={{ borderRadius: 5 }}>{on && <Check size={11} color="var(--primary)" strokeWidth={3} />}</span>
                    </button>
                  );
                })}
                <div className="hint">{selectedDocs.length} document{selectedDocs.length > 1 ? "s" : ""} · ~{Math.max(1, Math.round(chars / 1000))}k caractères de cours</div>
              </div>
            ) : (
              <div className="callout">Aucun document prêt dans ce périmètre. <Link to="/bibliotheque" style={{ textDecoration: "underline" }}>Importer un cours</Link></div>
            )}
          </div>
        </div>

        <div className="card card-pad stack gap-16">
          <div className="section-title" style={{ margin: 0 }}>2 · Paramètres</div>
          <div className="field">
            <label className="label">Nombre de questions</label>
            <Segmented value={count} onChange={setCount} options={QUESTION_COUNTS.map((n) => ({ value: n, label: n }))} />
          </div>
          <div className="field">
            <label className="label">Difficulté</label>
            <div className="choice-grid grid-2">
              {DIFFICULTIES.map((d) => (
                <button key={d.value} type="button" className={`choice ${difficulty === d.value ? "on" : ""}`} onClick={() => setDifficulty(d.value)}>
                  <span className="radio-dot" />
                  <div><div className="choice-title">{d.title}</div><div className="choice-desc">{d.desc}</div></div>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="label">Format</label>
            <div className="choice-grid grid-2">
              <button type="button" className={`choice ${type === "unique" ? "on" : ""}`} onClick={() => setType("unique")}>
                <span className="radio-dot" />
                <div><div className="choice-title">Réponse unique</div><div className="choice-desc">Une seule proposition juste parmi A, B, C, D</div></div>
              </button>
              <button type="button" className={`choice ${type === "multiple" ? "on" : ""}`} onClick={() => setType("multiple")}>
                <span className="radio-dot" />
                <div><div className="choice-title">Réponses multiples</div><div className="choice-desc">Une à quatre propositions justes par question</div></div>
              </button>
            </div>
          </div>
          {type === "multiple" && (
            <div className="field">
              <label className="label">Barème</label>
              <Segmented value={scoring} onChange={setScoring} options={[{ value: "strict", label: "Tout ou rien" }, { value: "partiel", label: "Partiel (discordances)" }]} />
              <div className="hint">
                {scoring === "strict" ? "1 point uniquement si toutes les cases sont exactes." : "1 point sans erreur, 0,5 avec une discordance, 0,2 avec deux, 0 au-delà."}
              </div>
            </div>
          )}
          <div className="field">
            <label className="label">Titre <span className="subtle" style={{ fontWeight: 400 }}>(facultatif)</span></label>
            <input className="input" value={title} maxLength={140} placeholder={`${subject?.name ?? "Cours"} · ${subject?.chapters?.find((c) => c.id === chapterId)?.name ?? "Ensemble du cours"}`} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>

        {ai.data && !ai.data.configured && (
          <div className="callout warn">
            <div className="callout-title"><Info /> Mode démonstration</div>
            Aucune clé d'API n'est configurée sur le serveur : les questions seront produites par un générateur local simplifié (questions à trous et affirmations altérées tirées du cours). <Link to="/parametres" style={{ textDecoration: "underline" }}>Connecter l'IA</Link>
          </div>
        )}

        <div className="row gap-12 wrap between">
          <div className="small muted">
            Les questions s'appuient en priorité sur vos documents. Toute notion absente du cours est signalée.
          </div>
          <button className="btn btn-primary btn-lg" disabled={submitting || !selectedDocs.length} onClick={submit}>
            {submitting ? <span className="spinner" style={{ borderColor: "rgba(255,255,255,.3)", borderTopColor: "#fff" }} /> : <Sparkles />}
            Générer {count} questions
          </button>
        </div>
      </div>
    </div>
  );
}
