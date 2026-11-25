import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { CourseDocument, Section } from "../../shared/types.js";
import { getProvider } from "../ai/index.js";

export type DocKind = CourseDocument["kind"];

const MIME_KIND: Record<string, DocKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "text/plain": "texte",
  "text/markdown": "texte",
};
const EXT_KIND: Record<string, DocKind> = {
  pdf: "pdf",
  pptx: "pptx",
  docx: "docx",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  txt: "texte",
  md: "texte",
};

export function detectKind(filename: string, mime: string): DocKind | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_KIND[ext] ?? MIME_KIND[mime] ?? null;
}

const KIND_MIME: Partial<Record<DocKind, string>> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  texte: "text/plain; charset=utf-8",
};

export function normalizeMime(kind: DocKind, filename: string, _mime: string) {
  if (kind !== "image") return KIND_MIME[kind]!;
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/png";
}

/** Extrait le texte d'un fichier et le découpe en sections citables. */
export async function extractSections(buffer: Buffer, kind: DocKind, mime: string): Promise<Section[]> {
  let raw: { label: string; text: string }[];
  switch (kind) {
    case "pdf":
      raw = await extractPdf(buffer);
      break;
    case "pptx":
      raw = await extractPptx(buffer);
      break;
    case "docx":
      raw = await extractDocx(buffer);
      break;
    case "image":
      raw = [{ label: "Image", text: await extractImage(buffer, mime) }];
      break;
    case "texte":
      raw = splitLongText(buffer.toString("utf8"), "Partie");
      break;
  }
  const sections = raw
    .map((s) => ({ ...s, text: cleanText(s.text) }))
    .filter((s) => s.text.length > 0)
    .map((s, i) => ({ id: `S${i + 1}`, label: s.label, text: s.text }));
  if (!sections.length) throw new Error("Aucun texte n'a pu être extrait de ce document.");
  return sections;
}

async function extractPdf(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (text as string[]).map((t, i) => ({ label: `Page ${i + 1}`, text: t }));
  const chars = pages.reduce((n, p) => n + p.text.trim().length, 0);
  // PDF scanné (pas de couche texte) : transcription par l'IA si disponible.
  if (chars < 40 * Math.max(1, pages.length) && chars < 2000) {
    const provider = getProvider();
    if (provider.transcribePdf) {
      const transcribed = await provider.transcribePdf(buffer);
      if (transcribed.length) return transcribed.map((t, i) => ({ label: `Page ${i + 1}`, text: t }));
    }
    if (chars === 0) throw new Error("Ce PDF semble scanné (aucun texte). Configurez une clé API pour activer la transcription.");
  }
  return pages;
}

async function extractPptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => num(a) - num(b));
  const out: { label: string; text: string }[] = [];
  for (const f of slideFiles) {
    const n = num(f);
    const xml = await zip.file(f)!.async("string");
    let text = xmlParagraphs(xml);
    const notes = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    if (notes) {
      const notesText = xmlParagraphs(await notes.async("string")).replace(/^\d+\s*$/gm, "").trim();
      if (notesText) text += `\n[Notes de l'orateur] ${notesText}`;
    }
    out.push({ label: `Diapositive ${n}`, text });
  }
  return out;
}

async function extractDocx(buffer: Buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  // Découpage par titres (h1-h3) pour des références précises.
  const parts = html.split(/(?=<h[1-3][^>]*>)/);
  const out: { label: string; text: string }[] = [];
  for (const part of parts) {
    const heading = part.match(/^<h[1-3][^>]*>(.*?)<\/h[1-3]>/s)?.[1];
    const text = htmlToText(part);
    if (!text.trim()) continue;
    const label = heading ? `Titre : ${htmlToText(heading).slice(0, 90)}` : "Introduction";
    for (const chunk of splitLongText(text, label)) out.push(chunk);
  }
  if (out.length === 1 && out[0].text.length > 6000) return splitLongText(out[0].text, "Partie");
  return out;
}

async function extractImage(buffer: Buffer, mime: string) {
  const provider = getProvider();
  if (provider.transcribeImage) return provider.transcribeImage(buffer, mime);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("fra+eng");
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

function splitLongText(text: string, label: string, max = 4000) {
  if (text.length <= max) return [{ label, text }];
  const paras = text.split(/\n{2,}|\n/);
  const out: { label: string; text: string }[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf.length + p.length > max && buf) {
      out.push({ label: `${label} (${out.length + 1})`, text: buf });
      buf = "";
    }
    buf += (buf ? "\n" : "") + p;
  }
  if (buf) out.push({ label: out.length ? `${label} (${out.length + 1})` : label, text: buf });
  return out;
}

function xmlParagraphs(xml: string) {
  return (xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) ?? [])
    .map((p) => (p.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? []).map((t) => decode(t.replace(/<\/?a:t>/g, ""))).join(""))
    .filter((l) => l.trim())
    .join("\n");
}

function htmlToText(html: string) {
  return decode(
    html
      .replace(/<\/(p|h\d|li|tr|table)>/g, "\n")
      .replace(/<li[^>]*>/g, "• ")
      .replace(/<\/t[dh]>/g, " | ")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function decode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

function cleanText(s: string) {
  return s
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const num = (f: string) => Number(f.match(/(\d+)\.xml$/)?.[1] ?? 0);
