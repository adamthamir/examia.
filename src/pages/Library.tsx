import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, FolderOpen, Layers, Pencil, Plus, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { api } from "../api";
import { formatSize, relativeTime, useAsync } from "../hooks";
import { Empty, ErrorBox, FileIcon, Loading, PageHeader, useDialogs } from "../components/ui";
import type { Subject } from "../../shared/types";

const ACCEPT = ".pdf,.pptx,.docx,.png,.jpg,.jpeg,.webp,.txt,.md";

export function Library() {
  const [params, setParams] = useSearchParams();
  const subjectId = params.get("matiere") ?? "";
  const chapterId = params.get("chapitre") ?? "";
  const { confirm, prompt, toast } = useDialogs();
  const navigate = useNavigate();
  const subjects = useAsync(() => api.subjects(), []);
  const docs = useAsync(
    () => api.documents({ subjectId: subjectId || undefined, chapterId: chapterId || undefined }),
    [subjectId, chapterId],
    (d) => (d?.some((x) => x.status === "processing") ? 1500 : null),
  );
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const subject = subjects.data?.find((s) => s.id === subjectId);
  const chapter = subject?.chapters?.find((c) => c.id === chapterId);
  const select = (s?: string, c?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("matiere", s);
    if (c) p.set("chapitre", c);
    setParams(p);
  };

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    try {
      await api.upload(list, subjectId || null, chapterId || null);
      toast(`${list.length} fichier${list.length > 1 ? "s" : ""} importé${list.length > 1 ? "s" : ""} — extraction en cours`);
      await Promise.all([docs.reload(), subjects.reload()]);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  const addSubject = async () => {
    const name = await prompt({ title: "Nouvelle matière", label: "Nom de la matière", placeholder: "ex. Physiologie, Anatomie, Biochimie…", confirmLabel: "Créer" });
    if (!name) return;
    const s = await api.createSubject(name);
    await subjects.reload();
    select(s.id);
  };
  const addChapter = async (s: Subject) => {
    const name = await prompt({ title: `Nouveau chapitre — ${s.name}`, label: "Nom du chapitre", placeholder: "ex. Chapitre 3 : Le néphron", confirmLabel: "Créer" });
    if (!name) return;
    const c = await api.createChapter(s.id, name);
    await subjects.reload();
    select(s.id, c.id);
  };
  const renameSubject = async (s: Subject) => {
    const name = await prompt({ title: "Renommer la matière", initial: s.name });
    if (name) await api.updateSubject(s.id, { name }), subjects.reload(), docs.reload();
  };
  const removeSubject = async (s: Subject) => {
    if (!(await confirm({ title: "Supprimer la matière ?", message: `« ${s.name} » et ses chapitres seront supprimés. Les documents seront conservés mais non classés.`, confirmLabel: "Supprimer", danger: true }))) return;
    await api.deleteSubject(s.id);
    select();
    subjects.reload();
    docs.reload();
  };
  const renameChapter = async (id: string, initial: string) => {
    const name = await prompt({ title: "Renommer le chapitre", initial });
    if (name) await api.updateChapter(id, name), subjects.reload(), docs.reload();
  };
  const removeChapter = async (id: string, name: string) => {
    if (!(await confirm({ title: "Supprimer le chapitre ?", message: `« ${name} » sera supprimé. Ses documents restent dans la matière.`, confirmLabel: "Supprimer", danger: true }))) return;
    await api.deleteChapter(id);
    select(subjectId);
    subjects.reload();
    docs.reload();
  };

  const total = useMemo(() => subjects.data?.reduce((n, s) => n + (s.documentCount ?? 0), 0) ?? 0, [subjects.data]);

  return (
    <div className="page">
      <PageHeader
        title="Bibliothèque"
        subtitle="Vos cours, organisés par matière et par chapitre."
        actions={
          <>
            <button className="btn" onClick={addSubject}><Plus /> Matière</button>
            {docs.data?.some((d) => d.status === "ready") && (
              <button className="btn btn-primary" onClick={() => navigate(`/generer?${new URLSearchParams({ ...(subjectId && { matiere: subjectId }), ...(chapterId && { chapitre: chapterId }) })}`)}>
                <Sparkles /> Générer un QCM
              </button>
            )}
          </>
        }
      />
      <div className="library">
        <aside className="card tree">
          <button className={`tree-item ${!subjectId ? "on" : ""}`} onClick={() => select()}>
            <Layers size={15} /> Tous les cours <span className="count">{docs.data && !subjectId ? docs.data.length : ""}</span>
          </button>
          {subjects.loading && !subjects.data ? <Loading label="" /> : null}
          {subjects.data?.map((s) => (
            <div key={s.id}>
              <div className="tree-row">
                <button className={`tree-item ${subjectId === s.id && !chapterId ? "on" : ""}`} onClick={() => select(s.id)}>
                  <span className="chip-color" style={{ background: s.color }} />
                  <span className="truncate">{s.name}</span>
                  <span className="count">{s.documentCount}</span>
                </button>
                <div className="tree-actions" style={{ position: "absolute", right: 6, top: 5 }}>
                  <button className="icon-btn" title="Ajouter un chapitre" onClick={() => addChapter(s)}><Plus /></button>
                  <button className="icon-btn" title="Renommer" onClick={() => renameSubject(s)}><Pencil /></button>
                  <button className="icon-btn" title="Supprimer" onClick={() => removeSubject(s)}><Trash2 /></button>
                </div>
              </div>
              {subjectId === s.id && (
                <div className="tree-children">
                  {s.chapters?.map((c) => (
                    <div className="tree-row" key={c.id}>
                      <button className={`tree-item small ${chapterId === c.id ? "on" : ""}`} onClick={() => select(s.id, c.id)}>
                        <span className="truncate">{c.name}</span>
                        <span className="count">{c.documentCount}</span>
                      </button>
                      <div className="tree-actions" style={{ position: "absolute", right: 6, top: 4 }}>
                        <button className="icon-btn" title="Renommer" onClick={() => renameChapter(c.id, c.name)}><Pencil /></button>
                        <button className="icon-btn" title="Supprimer" onClick={() => removeChapter(c.id, c.name)}><Trash2 /></button>
                      </div>
                    </div>
                  ))}
                  <button className="tree-item small subtle" onClick={() => addChapter(s)}><Plus size={14} /> Ajouter un chapitre</button>
                </div>
              )}
            </div>
          ))}
          {subjects.data && !subjects.data.length && (
            <div className="small subtle" style={{ padding: "8px 10px" }}>Créez une matière pour organiser vos cours.</div>
          )}
          <div className="divider" style={{ margin: "8px 0" }} />
          <button className="tree-item small" onClick={addSubject}><Plus size={14} /> Nouvelle matière</button>
        </aside>

        <section className="stack gap-16">
          <div
            className={`dropzone ${over ? "over" : ""}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              upload(e.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          >
            <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && upload(e.target.files)} />
            <div className="dropzone-icon">{uploading ? <span className="spinner" style={{ borderColor: "rgba(255,255,255,.3)", borderTopColor: "#fff" }} /> : <UploadCloud size={20} />}</div>
            <div style={{ fontWeight: 600 }}>{uploading ? "Import en cours…" : "Déposez vos cours ici ou cliquez pour parcourir"}</div>
            <div className="small muted mt-4">PDF, PowerPoint (PPTX), Word (DOCX), images (PNG, JPG) · plusieurs fichiers possibles</div>
            <div className="xs subtle mt-8">
              Destination : <b style={{ color: "var(--text-2)" }}>{subject ? `${subject.name}${chapter ? ` › ${chapter.name}` : ""}` : "Non classé"}</b>
              {!subject && subjects.data?.length ? " — sélectionnez une matière à gauche pour classer automatiquement" : ""}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{chapter ? chapter.name : subject ? subject.name : "Tous les cours"}</h2>
              <span className="subtle small">{docs.data?.length ?? 0} document{(docs.data?.length ?? 0) > 1 ? "s" : ""}{!subjectId && total !== docs.data?.length ? "" : ""}</span>
            </div>
            {docs.error && <div className="card-body"><ErrorBox message={docs.error} onRetry={docs.reload} /></div>}
            {docs.loading && !docs.data ? (
              <Loading />
            ) : docs.data?.length ? (
              <div className="list">
                {docs.data.map((d) => (
                  <Link key={d.id} to={`/bibliotheque/document/${d.id}`} className="list-item">
                    <FileIcon kind={d.kind} />
                    <div className="flex-1">
                      <div className="truncate" style={{ fontWeight: 500 }}>{d.filename}</div>
                      <div className="xs subtle truncate">
                        {d.subjectName ?? "Non classé"}{d.chapterName ? ` › ${d.chapterName}` : ""} · {formatSize(d.size)} · {relativeTime(d.createdAt)}
                      </div>
                    </div>
                    {d.status === "processing" && <span className="badge"><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> Extraction…</span>}
                    {d.status === "ready" && <span className="badge hide-sm">{d.sectionCount} section{d.sectionCount > 1 ? "s" : ""} · {Math.round(d.charCount / 1000)}k car.</span>}
                    {d.status === "error" && <span className="badge badge-bad" title={d.error ?? ""}><AlertCircle /> Échec</span>}
                  </Link>
                ))}
              </div>
            ) : (
              <Empty icon={<FolderOpen size={20} />} title="Aucun cours ici" text="Importez vos supports de cours pour commencer à générer des QCM." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
