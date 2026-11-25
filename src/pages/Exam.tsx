import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Clock, Flag, Grid3x3, LogOut, Send } from "lucide-react";
import { api } from "../api";
import { formatDuration, useAsync } from "../hooks";
import { ErrorBox, Loading, Modal, useDialogs } from "../components/ui";
import { QuestionReview } from "../components/QuestionReview";
import type { Answers, OptionLabel } from "../../shared/types";

const LABELS: OptionLabel[] = ["A", "B", "C", "D"];

export function Exam() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { confirm, toast } = useDialogs();
  const { data, error, loading } = useAsync(() => api.attempt(id), [id]);

  const [answers, setAnswers] = useState<Answers>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(Date.now());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const ready = useRef(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!data) return;
    if (data.status === "submitted") {
      navigate(`/resultats/${data.id}`, { replace: true });
      return;
    }
    setAnswers(data.answers);
    setFlagged(data.flagged);
    setIndex(data.currentIndex);
    ready.current = true;
  }, [data, navigate]);

  const quiz = data?.quiz;
  const questions = quiz?.questions ?? [];
  const multi = quiz?.type === "multiple";
  const training = data?.mode === "entrainement";
  const deadline = data && data.durationLimitSec ? new Date(data.startedAt).getTime() + data.durationLimitSec * 1000 : null;
  const remaining = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null;
  const elapsed = data ? Math.round((now - new Date(data.startedAt).getTime()) / 1000) : 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Sauvegarde automatique (reprise possible après fermeture de l'onglet).
  useEffect(() => {
    if (!ready.current || !data || submittedRef.current) return;
    const t = setTimeout(() => {
      api.saveAttempt(data.id, { answers, flagged, currentIndex: index, elapsedSec: elapsed }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, flagged, index]);

  const submit = useCallback(
    async (auto = false) => {
      if (!data || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        await api.submitAttempt(data.id, answers, elapsed);
        if (auto) toast("Temps écoulé : votre copie a été validée automatiquement.");
        navigate(`/resultats/${data.id}`, { replace: true });
      } catch (e) {
        submittedRef.current = false;
        setSubmitting(false);
        toast((e as Error).message, "error");
      }
    },
    [data, answers, elapsed, navigate, toast],
  );

  useEffect(() => {
    if (remaining === 0 && ready.current) void submit(true);
  }, [remaining, submit]);

  const q = questions[index];
  const isChecked = q ? checked.has(q.id) : false;

  const toggle = useCallback(
    (label: OptionLabel) => {
      if (!q || isChecked) return;
      setAnswers((prev) => {
        const cur = prev[q.id] ?? [];
        const next = multi ? (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label].sort()) : cur[0] === label ? [] : [label];
        return { ...prev, [q.id]: next };
      });
    },
    [q, multi, isChecked],
  );
  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(questions.length - 1, i))), [questions.length]);
  const toggleFlag = useCallback(() => q && setFlagged((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id])), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (submitOpen || paletteOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toUpperCase();
      const n = ["1", "2", "3", "4"].indexOf(k);
      if (LABELS.includes(k as OptionLabel)) toggle(k as OptionLabel);
      else if (n >= 0) toggle(LABELS[n]);
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (k === "F") toggleFlag();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, go, index, toggleFlag, submitOpen, paletteOpen]);

  const answeredCount = useMemo(() => questions.filter((x) => (answers[x.id] ?? []).length > 0).length, [questions, answers]);

  if (loading && !data) return <Loading />;
  if (error || !data || !quiz) return <div className="page"><ErrorBox message={error ?? "Examen introuvable"} /></div>;
  if (!q) return <Loading />;

  const selected = answers[q.id] ?? [];
  const isLast = index === questions.length - 1;
  const correctSet = new Set(q.correct);

  const palette = (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5 }}>Questions</div>
        <div className="xs subtle mono">{answeredCount}/{questions.length} répondues</div>
      </div>
      <div className="palette-grid">
        {questions.map((x, i) => {
          const ans = (answers[x.id] ?? []).length > 0;
          let cls = ans ? "answered" : "";
          if (training && checked.has(x.id)) {
            const s = answers[x.id] ?? [];
            cls = s.length === x.correct.length && s.every((l) => x.correct.includes(l)) ? "ok" : "ko";
          }
          return (
            <button key={x.id} className={`pcell ${cls} ${i === index ? "current" : ""} ${flagged.includes(x.id) ? "flag" : ""}`} onClick={() => (go(i), setPaletteOpen(false))} aria-label={`Question ${i + 1}`}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="legend mt-16">
        <span><i style={{ background: "var(--primary)", borderColor: "var(--primary)" }} /> Répondue</span>
        <span><i /> Non répondue</span>
        <span><i style={{ background: "var(--warn)", borderColor: "var(--warn)", borderRadius: "50%" }} /> Marquée</span>
      </div>
      <div className="xs subtle mt-16 hide-sm">Raccourcis : <kbd>A</kbd>–<kbd>D</kbd> répondre · <kbd>←</kbd> <kbd>→</kbd> naviguer · <kbd>F</kbd> marquer</div>
    </>
  );

  return (
    <div className="exam">
      <header className="exam-top">
        <div className="exam-top-inner">
          <button className="btn btn-ghost btn-icon" title="Quitter (progression sauvegardée)" onClick={async () => {
            if (await confirm({ title: "Quitter l'examen ?", message: training ? "Votre progression est sauvegardée, vous pourrez reprendre plus tard." : "Votre progression est sauvegardée, mais le chronomètre continue de tourner.", confirmLabel: "Quitter" }))
              navigate(`/qcm/${quiz.id}`);
          }}><LogOut /></button>
          <div className="flex-1" style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 600, fontSize: 14 }}>{quiz.title}</div>
            <div className="xs subtle">{training ? "Mode entraînement" : "Mode examen"} · Question {index + 1} sur {questions.length}</div>
          </div>
          {remaining != null ? (
            <div className={`timer ${remaining < 60 ? "low" : ""}`} title="Temps restant"><Clock /> {formatDuration(remaining)}</div>
          ) : (
            <div className="timer" title="Temps écoulé"><Clock /> {formatDuration(elapsed)}</div>
          )}
          <button className="btn btn-primary hide-sm" onClick={() => setSubmitOpen(true)}><Send /> Terminer</button>
        </div>
        <div className="progress" style={{ borderRadius: 0, height: 3 }}><span style={{ width: `${(answeredCount / questions.length) * 100}%`, borderRadius: 0 }} /></div>
      </header>

      <div className="exam-body">
        <main>
          {training && isChecked ? (
            <div className="card" key={q.id}>
              <QuestionReview q={q} index={index} multi={multi} result={{ questionId: q.id, selected, isCorrect: selected.length === q.correct.length && selected.every((l) => correctSet.has(l)), points: 0 }} />
            </div>
          ) : (
            <div className="card q-card" key={q.id}>
              <div className="q-meta">
                <span className="badge badge-primary mono">Question {index + 1}</span>
                <span className="badge">{multi ? "Une ou plusieurs réponses" : "Une seule réponse"}</span>
                <button className={`btn btn-sm ${flagged.includes(q.id) ? "" : "btn-ghost"}`} style={{ marginLeft: "auto", color: flagged.includes(q.id) ? "var(--warn)" : undefined }} onClick={toggleFlag}>
                  <Flag /> {flagged.includes(q.id) ? "Marquée" : "Marquer"}
                </button>
              </div>
              <p className="q-stem">{q.stem}</p>
              <div className="options" role={multi ? "group" : "radiogroup"}>
                {q.options.map((o) => {
                  const on = selected.includes(o.label);
                  return (
                    <button key={o.label} className={`option ${multi ? "multi" : ""} ${on ? "on" : ""}`} role={multi ? "checkbox" : "radio"} aria-checked={on} onClick={() => toggle(o.label)}>
                      <span className="option-letter">{on && multi ? <Check size={14} strokeWidth={3} /> : o.label}</span>
                      <span className="option-text">{o.text}</span>
                    </button>
                  );
                })}
              </div>
              {training && (
                <button className="btn btn-primary mt-24" disabled={!selected.length} onClick={() => setChecked((c) => new Set(c).add(q.id))}>
                  <Check /> Vérifier ma réponse
                </button>
              )}
            </div>
          )}
        </main>
        <aside className="palette-side">
          <div className="card palette">{palette}</div>
        </aside>
      </div>

      <nav className="exam-nav">
        <div className="exam-nav-inner">
          <button className="btn" disabled={index === 0} onClick={() => go(index - 1)}><ArrowLeft /> <span className="hide-sm">Précédente</span></button>
          <button className="btn btn-ghost" onClick={() => setPaletteOpen(true)} style={{ marginInline: "auto" }}><Grid3x3 /> {index + 1} / {questions.length}</button>
          {isLast ? (
            <button className="btn btn-primary" onClick={() => setSubmitOpen(true)}><Send /> Terminer</button>
          ) : (
            <button className="btn btn-primary" onClick={() => go(index + 1)}><span className="hide-sm">Suivante</span> <ArrowRight /></button>
          )}
        </div>
      </nav>

      {paletteOpen && (
        <Modal title="Aller à la question" onClose={() => setPaletteOpen(false)}>
          <div style={{ paddingBottom: 18 }}>{palette}</div>
        </Modal>
      )}

      {submitOpen && (
        <Modal
          title="Valider définitivement votre copie ?"
          onClose={() => setSubmitOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setSubmitOpen(false)}>Continuer l'examen</button>
              <button className="btn btn-primary" disabled={submitting} onClick={() => submit()}>
                {submitting ? <span className="spinner" /> : <Send />} Valider et voir ma note
              </button>
            </>
          }
        >
          <div className="stat-row" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            <div className="stat"><div className="stat-v">{answeredCount}</div><div className="stat-l">Répondues</div></div>
            <div className="stat"><div className="stat-v" style={{ color: questions.length - answeredCount ? "var(--bad)" : undefined }}>{questions.length - answeredCount}</div><div className="stat-l">Sans réponse</div></div>
            <div className="stat"><div className="stat-v" style={{ color: flagged.length ? "var(--warn)" : undefined }}>{flagged.length}</div><div className="stat-l">Marquées</div></div>
          </div>
          <p className="small" style={{ marginBottom: 0 }}>Après validation, vous ne pourrez plus modifier vos réponses. Les questions sans réponse comptent zéro.</p>
        </Modal>
      )}
    </div>
  );
}
