import { config } from "../config.js";
import { AnthropicProvider } from "./anthropic.js";
import { DemoProvider } from "./demo.js";
import type { QuizAIProvider } from "./types.js";
import type { AiStatus } from "../../shared/types.js";

let provider: QuizAIProvider | null = null;

/** Sélectionne le fournisseur d'IA. Ajoutez ici d'autres implémentations. */
export function getProvider(): QuizAIProvider {
  if (!provider) {
    provider = config.anthropicKeyPresent && !config.forceDemo ? new AnthropicProvider() : new DemoProvider();
  }
  return provider;
}

export function aiStatus(): AiStatus {
  const p = getProvider();
  return {
    provider: p.name,
    model: p.model,
    configured: p.name === "anthropic",
    visionOcr: Boolean(p.transcribeImage),
  };
}
