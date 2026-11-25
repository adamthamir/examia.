import type { Difficulty, OptionLabel, QuestionType } from "../../shared/types.js";

/** Un bloc de cours transmis à l'IA, identifié par une référence stable. */
export interface SourceBlock {
  ref: string; // ex. "D1-S4"
  documentName: string;
  sectionLabel: string; // ex. "Page 4"
  chapterId: string | null;
  chapterName: string | null;
  text: string;
}

export interface GenerationInput {
  subjectName: string | null;
  scopeLabel: string; // "Chapitre 3 — Le rein" ou "Ensemble du cours"
  sources: SourceBlock[];
  count: number;
  difficulty: Difficulty;
  type: QuestionType;
  onProgress?: (ratio: number) => void;
}

/** Question brute renvoyée par un fournisseur, avant normalisation. */
export interface RawQuestion {
  stem: string;
  options: { label: OptionLabel; text: string; rationale: string }[];
  correct: OptionLabel[];
  correction: string;
  explanation: string;
  topic: string;
  source_refs: string[];
  out_of_course: boolean;
  out_of_course_note: string;
}

/**
 * Contrat d'un fournisseur d'IA. Pour brancher un autre modèle ou service,
 * implémentez cette interface et enregistrez-la dans `ai/index.ts`.
 */
export interface QuizAIProvider {
  readonly name: "anthropic" | "demo";
  readonly model: string | null;
  generate(input: GenerationInput): Promise<RawQuestion[]>;
  /** OCR / transcription d'une image de cours (optionnel). */
  transcribeImage?(data: Buffer, mime: string): Promise<string>;
  /** Transcription d'un PDF scanné sans couche texte (optionnel). */
  transcribePdf?(data: Buffer): Promise<string[]>;
}
