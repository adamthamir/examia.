import { Router } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { detectKind, extractSections, normalizeMime } from "../extract/index.js";
import * as repo from "../repo.js";
import { asyncRoute, HttpError, userId } from "./util.js";

export const library = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 20 },
});

// ─── Matières ────────────────────────────────────────────────────────────
library.get("/subjects", (req, res) => res.json(repo.listSubjects(userId(req))));

library.post("/subjects", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) throw new HttpError(400, "Le nom de la matière est requis.");
  res.status(201).json(repo.createSubject(userId(req), name.slice(0, 80), req.body?.color));
});

library.patch("/subjects/:id", (req, res) => {
  const s = repo.updateSubject(userId(req), String(req.params.id), req.body ?? {});
  if (!s) throw new HttpError(404, "Matière introuvable.");
  res.json(s);
});

library.delete("/subjects/:id", (req, res) => {
  if (!repo.deleteSubject(userId(req), String(req.params.id))) throw new HttpError(404, "Matière introuvable.");
  res.status(204).end();
});

library.post("/subjects/:id/chapters", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) throw new HttpError(400, "Le nom du chapitre est requis.");
  const c = repo.createChapter(userId(req), String(req.params.id), name.slice(0, 120));
  if (!c) throw new HttpError(404, "Matière introuvable.");
  res.status(201).json(c);
});

library.patch("/chapters/:id", (req, res) => {
  const c = repo.updateChapter(userId(req), String(req.params.id), String(req.body?.name ?? ""));
  if (!c) throw new HttpError(404, "Chapitre introuvable.");
  res.json(c);
});

library.delete("/chapters/:id", (req, res) => {
  if (!repo.deleteChapter(userId(req), String(req.params.id))) throw new HttpError(404, "Chapitre introuvable.");
  res.status(204).end();
});

// ─── Documents ───────────────────────────────────────────────────────────
library.get("/documents", (req, res) => {
  res.json(
    repo.listDocuments(userId(req), {
      subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
      chapterId: req.query.chapterId ? String(req.query.chapterId) : undefined,
    }),
  );
});

library.post(
  "/documents",
  upload.array("files", 20),
  asyncRoute(async (req, res) => {
    const uid = userId(req);
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw new HttpError(400, "Aucun fichier reçu.");
    const { subjectId, chapterId } = validatePlacement(uid, req.body?.subjectId, req.body?.chapterId);

    const created = [];
    for (const f of files) {
      // multer décode les noms en latin1 : on rétablit l'UTF-8 (accents).
      const filename = Buffer.from(f.originalname, "latin1").toString("utf8");
      const kind = detectKind(filename, f.mimetype);
      if (!kind) throw new HttpError(415, `Format non pris en charge : ${filename}. Formats acceptés : PDF, PPTX, DOCX, PNG, JPG, WEBP, TXT.`);
      const docId = repo.id();
      const storagePath = path.join(config.uploadDir, `${docId}${path.extname(filename).toLowerCase()}`);
      await fs.writeFile(storagePath, f.buffer);
      const mime = normalizeMime(kind, filename, f.mimetype);
      repo.insertDocument({ id: docId, userId: uid, subjectId, chapterId, filename, mime, size: f.size, kind, storagePath });
      created.push(repo.getDocument(uid, docId));
      // Extraction en arrière-plan : le client suit le statut « processing → ready ».
      void extractSections(f.buffer, kind, mime)
        .then((sections) => repo.setDocumentExtracted(docId, sections))
        .catch((e) => {
          console.error("[extraction]", filename, e);
          repo.setDocumentError(docId, e instanceof Error ? e.message : "Échec de l'extraction.");
        });
    }
    res.status(201).json(created);
  }),
);

library.post(
  "/documents/:id/reprocess",
  asyncRoute(async (req, res) => {
    const uid = userId(req);
    const d = repo.getDocumentRow(uid, String(req.params.id));
    if (!d) throw new HttpError(404, "Document introuvable.");
    const buffer = await fs.readFile(d.storage_path);
    try {
      repo.setDocumentExtracted(d.id, await extractSections(buffer, d.kind, d.mime));
    } catch (e) {
      repo.setDocumentError(d.id, e instanceof Error ? e.message : "Échec de l'extraction.");
    }
    res.json(repo.getDocument(uid, d.id));
  }),
);

library.get("/documents/:id", (req, res) => {
  const d = repo.getDocument(userId(req), String(req.params.id));
  if (!d) throw new HttpError(404, "Document introuvable.");
  res.json(d);
});

library.get("/documents/:id/file", (req, res) => {
  const d = repo.getDocumentRow(userId(req), String(req.params.id));
  if (!d) throw new HttpError(404, "Document introuvable.");
  res.setHeader("Content-Type", d.mime);
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
  res.sendFile(path.resolve(d.storage_path));
});

library.patch("/documents/:id", (req, res) => {
  const uid = userId(req);
  const body = req.body ?? {};
  const placement =
    "subjectId" in body || "chapterId" in body ? validatePlacement(uid, body.subjectId, body.chapterId) : {};
  const d = repo.updateDocument(uid, String(req.params.id), { ...placement, filename: body.filename });
  if (!d) throw new HttpError(404, "Document introuvable.");
  res.json(d);
});

library.delete(
  "/documents/:id",
  asyncRoute(async (req, res) => {
    const uid = userId(req);
    const d = repo.getDocumentRow(uid, String(req.params.id));
    if (!d) throw new HttpError(404, "Document introuvable.");
    repo.deleteDocument(uid, d.id);
    await fs.rm(d.storage_path, { force: true });
    res.status(204).end();
  }),
);

function validatePlacement(uid: string, subjectId: unknown, chapterId: unknown) {
  const sid = subjectId ? String(subjectId) : null;
  const cid = chapterId ? String(chapterId) : null;
  if (sid && !repo.getSubject(uid, sid)) throw new HttpError(400, "Matière invalide.");
  if (cid) {
    const c = repo.getChapter(uid, cid);
    if (!c || (sid && c.subjectId !== sid)) throw new HttpError(400, "Chapitre invalide.");
    return { subjectId: c.subjectId, chapterId: cid };
  }
  return { subjectId: sid, chapterId: null };
}
