import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Download, Pencil, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";
import { api } from "../api";
import { formatDate, formatSize, useAsync } from "../hooks";
import { ErrorBox, FileIcon, Loading, useDialogs } from "../components/ui";

export function DocumentView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { confirm, prompt, toast } = useDialogs();
  const doc = useAsync(() => api.document(id), [id], (d) => (d?.status === "processing" ? 1500 : null));
  const subjects = useAsync(() => api.subjects(), []);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  if (doc.loading && !doc.data) return <div className="page"><Loading /></div>;
  if (doc.error || !doc.data) return <div className="page"><ErrorBox message={doc.error ?? "Introuvable"} /></div>;
  const d = doc.data;
  const subject = subjects.data?.find((s) => s.id === d.subjectId);
  const sections = q ? d.sections.filter((s) => s.text.toLowerCase().includes(q.toLowerCase())) : d.sections;

  const move = async (subjectId: string | null, chapterId: string | null) => {
    try {
      doc.setData(await api.updateDocument(d.id, { subjectId, chapterId }));
      toast("Document reclassé");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="page narrow">
      <Link to="/bibliotheque" className="crumb"><ArrowLeft size={14} /> Bibliothèque</Link>
      <div className="row gap-16 wrap" style={{ alignItems: "flex-start", marginBottom: 24 }}>
        <FileIcon kind={d.kind} />
        <div className="flex-1">
          <h1 className="display" style={{ fontSize: 26, lineHeight: 1.2, wordBreak: "break-word" }}>{d.filename}</h1>
          <div className="small muted mt-4">{d.kind.toUpperCase()} · {formatSize(d.size)} · importé le {formatDate(d.createdAt)} · {d.sectionCount} sections</div>
        </div>
        <div className="row gap-8 wrap">
          <a className="btn btn-icon" href={api.fileUrl(d.id)} target="_blank" rel="noreferrer" title="Ouvrir l'original"><Download /></a>
          <button className="btn btn-icon" title="Renommer" onClick={async () => {
            const name = await prompt({ title: "Renommer le document", initial: d.filename });
            if (name) doc.setData(await api.updateDocument(d.id, { filename: name }));
          }}><Pencil /></button>
          <button className="btn btn-icon btn-danger" title="Supprimer" onClick={async () => {
            if (!(await confirm({ title: "Supprimer ce document ?", message: "Le fichier et son texte extrait seront définitivement supprimés. Les QCM déjà générés sont conservés.", confirmLabel: "Supprimer", danger: true }))) return;
            await api.deleteDocument(d.id);
            navigate("/bibliotheque");
          }}><Trash2 /></button>
        </div>
      </div>

      <div className="card card-pad">
        <div className="grid grid-2">
          <div className="field">
            <label className="label">Matière</label>
            <select className="select" value={d.subjectId ?? ""} onChange={(e) => move(e.target.value || null, null)}>
              <option value="">Non classé</option>
              {subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Chapitre</label>
            <select className="select" value={d.chapterId ?? ""} disabled={!subject} onChange={(e) => move(d.subjectId, e.target.value || null)}>
              <option value="">{subject ? "Aucun (cours entier)" : "Choisissez une matière"}</option>
              {subject?.chapters?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        {d.status === "ready" && (
          <button className="btn btn-primary mt-16" onClick={() => navigate(`/generer?${new URLSearchParams({ ...(d.subjectId && { matiere: d.subjectId }), ...(d.chapterId && { chapitre: d.chapterId }), document: d.id })}`)}>
            <Sparkles /> Générer un QCM sur ce document
          </button>
        )}
      </div>

      {d.status === "processing" && <div className="card card-pad mt-16 row gap-12"><span className="spinner" /> Extraction du texte en cours…</div>}
      {d.status === "error" && (
        <div className="callout bad mt-16">
          <div className="callout-title"><AlertCircle /> Extraction impossible</div>
          {d.error}
          <div className="mt-8">
            <button className="btn btn-sm" disabled={busy} onClick={async () => {
              setBusy(true);
              doc.setData(await api.reprocessDocument(d.id).finally(() => setBusy(false)));
            }}><RefreshCw /> Relancer l'extraction</button>
          </div>
        </div>
      )}

      {d.status === "ready" && (
        <div className="card mt-16">
          <div className="card-head">
            <h2>Texte extrait</h2>
            <div className="row gap-8" style={{ position: "relative", maxWidth: 240, flex: 1 }}>
              <Search size={15} style={{ position: "absolute", left: 10, color: "var(--text-3)" }} />
              <input className="input" style={{ height: 32, paddingLeft: 32 }} placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {sections.map((s) => (
            <div key={s.id} className="section-block">
              <div className="row gap-8 mb-8" style={{ marginBottom: 8 }}>
                <span className="badge badge-primary">{s.label}</span>
                <span className="xs subtle">{s.id}</span>
              </div>
              <div className="section-text">{s.text}</div>
            </div>
          ))}
          {!sections.length && <div className="card-body subtle">Aucun passage ne correspond.</div>}
        </div>
      )}
    </div>
  );
}
