import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { QUESTIONS_SCHEMA, SYSTEM_PROMPT, renderBatchInstructions, renderCorpus } from "./prompt.js";
import type { GenerationInput, QuizAIProvider, RawQuestion, SourceBlock } from "./types.js";

const BATCH_SIZE = 20;
const CONCURRENCY = 3;
/** Au-delà, chaque lot ne reçoit que ses propres blocs au lieu du cours entier. */
const SHARED_CORPUS_MAX_CHARS = 350_000;

export class AnthropicProvider implements QuizAIProvider {
  readonly name = "anthropic" as const;
  readonly model = config.model;
  // Le client lit ANTHROPIC_API_KEY dans l'environnement du serveur uniquement.
  private client = new Anthropic({ maxRetries: 3 });

  async generate(input: GenerationInput): Promise<RawQuestion[]> {
    const batches = planBatches(input.sources, input.count);
    const totalChars = input.sources.reduce((n, s) => n + s.text.length, 0);
    const shareCorpus = totalChars <= SHARED_CORPUS_MAX_CHARS;
    const sharedCorpus = shareCorpus ? renderCorpus(input.sources) : null;

    const results: RawQuestion[][] = new Array(batches.length);
    const done: RawQuestion[] = [];
    let finished = 0;
    let cursor = 0;

    const runOne = async (i: number) => {
      const batch = batches[i];
      const corpus = sharedCorpus ?? renderCorpus(batch.sources);
      const questions = await this.runBatch(corpus, {
        subjectName: input.subjectName,
        scopeLabel: input.scopeLabel,
        count: batch.count,
        difficulty: input.difficulty,
        type: input.type,
        focusRefs: shareCorpus && batches.length > 1 ? batch.sources.map((s) => s.ref) : [],
        avoidStems: done.map((q) => q.stem),
      });
      results[i] = questions;
      done.push(...questions);
      finished++;
      input.onProgress?.(finished / batches.length);
    };

    // Le premier lot passe seul : il amorce le cache du cours pour les lots suivants.
    await runOne(0);
    cursor = 1;
    const worker = async () => {
      while (cursor < batches.length) await runOne(cursor++);
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length - 1) }, worker));
    return results.flat();
  }

  private async runBatch(
    corpus: string,
    params: Parameters<typeof renderBatchInstructions>[0],
  ): Promise<RawQuestion[]> {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: config.effort,
        format: { type: "json_schema", schema: QUESTIONS_SCHEMA as unknown as Record<string, unknown> },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Voici le cours de l'étudiant. Il constitue ta source de vérité.\n\n<cours>\n${corpus}\n</cours>`,
              cache_control: { type: "ephemeral" },
            },
            { type: "text", text: renderBatchInstructions(params) },
          ],
        },
      ],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new Error("Le modèle a refusé de générer ces questions. Essayez avec un autre extrait de cours.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new Error("Réponse du modèle tronquée (limite de longueur atteinte). Réduisez le nombre de questions.");
    }
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      const parsed = JSON.parse(text) as { questions: RawQuestion[] };
      return Array.isArray(parsed.questions) ? parsed.questions : [];
    } catch {
      throw new Error("Réponse du modèle illisible (JSON invalide).");
    }
  }

  async transcribeImage(data: Buffer, mime: string): Promise<string> {
    const media = (["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime) ? mime : "image/png") as
      | "image/png"
      | "image/jpeg"
      | "image/gif"
      | "image/webp";
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data: data.toString("base64") } },
            {
              type: "text",
              text: "Transcris fidèlement tout le texte de cette image de cours (titres, listes, tableaux, légendes de schémas). Décris brièvement entre crochets les schémas sans texte. Ne commente pas, n'ajoute aucune information.",
            },
          ],
        },
      ],
    });
    return textOf(message.content);
  }

  async transcribePdf(data: Buffer): Promise<string[]> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 64000,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: data.toString("base64") },
            },
            {
              type: "text",
              text: "Ce PDF est un cours scanné. Transcris fidèlement le texte de chaque page. Commence chaque page par une ligne « === PAGE n === ». N'ajoute aucune information.",
            },
          ],
        },
      ],
    });
    return textOf(message.content)
      .split(/^=== PAGE \d+ ===\s*$/m)
      .map((p) => p.trim())
      .filter(Boolean);
  }
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Répartit les questions en lots et attribue à chaque lot un sous-ensemble de blocs. */
export function planBatches(sources: SourceBlock[], count: number) {
  const n = Math.max(1, Math.ceil(count / BATCH_SIZE));
  const base = Math.floor(count / n);
  const extra = count % n;
  // Découpage contigu pondéré par la longueur du texte : chaque lot couvre une partie du cours.
  const total = sources.reduce((s, b) => s + b.text.length, 0) || 1;
  const groups: SourceBlock[][] = Array.from({ length: n }, () => []);
  let acc = 0;
  for (const s of sources) {
    const idx = Math.min(n - 1, Math.floor((acc / total) * n));
    groups[idx].push(s);
    acc += s.text.length;
  }
  return groups.map((g, i) => ({
    count: base + (i < extra ? 1 : 0),
    sources: g.length ? g : sources,
  }));
}
