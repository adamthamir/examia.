import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, FileImage, FileText, FileType2, Presentation } from "lucide-react";
import type { CourseDocument, Difficulty } from "../../shared/types";
import { DIFFICULTY_LABELS } from "../../shared/types";

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="flex-1">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row gap-8 wrap">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="row gap-12 muted" style={{ padding: 40, justifyContent: "center" }}>
      <span className="spinner" /> {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="callout bad">
      <div className="callout-title">
        <AlertCircle /> Une erreur est survenue
      </div>
      {message}
      {onRetry && (
        <div className="mt-8">
          <button className="btn btn-sm" onClick={onRetry}>
            Réessayer
          </button>
        </div>
      )}
    </div>
  );
}

export function Progress({ value, indeterminate }: { value: number; indeterminate?: boolean }) {
  return (
    <div className={`progress ${indeterminate ? "indeterminate" : ""}`}>
      <span style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DifficultyBadge({ d }: { d: Difficulty }) {
  const cls = d === "facile" ? "badge-good" : d === "intermediaire" ? "badge-primary" : d === "difficile" ? "badge-warn" : "badge-bad";
  return <span className={`badge ${cls}`}>{DIFFICULTY_LABELS[d]}</span>;
}

export function FileIcon({ kind }: { kind: CourseDocument["kind"] }) {
  const Icon = kind === "pptx" ? Presentation : kind === "image" ? FileImage : kind === "docx" ? FileType2 : FileText;
  return (
    <div className={`file-icon ${kind}`}>
      <Icon />
    </div>
  );
}

export function scoreTone(score20: number | null | undefined) {
  if (score20 == null) return "";
  return score20 >= 14 ? "badge-good" : score20 >= 10 ? "badge-warn" : "badge-bad";
}

export function masteryOf(rate: number) {
  if (rate >= 0.75) return { label: "Maîtrisé", cls: "good", color: "var(--good)" };
  if (rate >= 0.5) return { label: "À consolider", cls: "warn", color: "var(--warn)" };
  return { label: "À retravailler", cls: "bad", color: "var(--bad)" };
}

// ─── Modale ──────────────────────────────────────────────────────────────
export function Modal({ title, children, footer, onClose }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

type ConfirmOpts = { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean };
type PromptOpts = { title: string; label?: string; initial?: string; confirmLabel?: string; placeholder?: string };

interface DialogCtx {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
  toast: (message: string, kind?: "info" | "error") => void;
}
const Ctx = createContext<DialogCtx>(null as unknown as DialogCtx);
export const useDialogs = () => useContext(Ctx);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [promptState, setPrompt] = useState<(PromptOpts & { resolve: (v: string | null) => void }) | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: string }[]>([]);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })), []);
  const prompt = useCallback(
    (o: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(o.initial ?? "");
        setPrompt({ ...o, resolve });
      }),
    [],
  );
  const toast = useCallback((message: string, kind: "info" | "error" = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const closeConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirm(null);
  };
  const closePrompt = (v: string | null) => {
    promptState?.resolve(v);
    setPrompt(null);
  };

  return (
    <Ctx.Provider value={{ confirm, prompt, toast }}>
      {children}
      {confirmState && (
        <Modal
          title={confirmState.title}
          onClose={() => closeConfirm(false)}
          footer={
            <>
              <button className="btn" onClick={() => closeConfirm(false)}>
                Annuler
              </button>
              <button className={`btn ${confirmState.danger ? "btn-danger" : "btn-primary"}`} autoFocus onClick={() => closeConfirm(true)}>
                {confirmState.confirmLabel ?? "Confirmer"}
              </button>
            </>
          }
        >
          {confirmState.message}
        </Modal>
      )}
      {promptState && (
        <Modal
          title={promptState.title}
          onClose={() => closePrompt(null)}
          footer={
            <>
              <button className="btn" onClick={() => closePrompt(null)}>
                Annuler
              </button>
              <button className="btn btn-primary" disabled={!promptValue.trim()} onClick={() => closePrompt(promptValue.trim())}>
                {promptState.confirmLabel ?? "Enregistrer"}
              </button>
            </>
          }
        >
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              if (promptValue.trim()) closePrompt(promptValue.trim());
            }}
          >
            {promptState.label && <label className="label">{promptState.label}</label>}
            <input className="input" autoFocus value={promptValue} placeholder={promptState.placeholder} onChange={(e) => setPromptValue(e.target.value)} />
          </form>
        </Modal>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>
            {t.kind === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
