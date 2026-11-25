import "dotenv/config";
import path from "node:path";
import fs from "node:fs";

const dataDir = path.resolve(process.env.DATA_DIR || "./data");
fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });

export const config = {
  port: Number(process.env.PORT || 3001),
  dataDir,
  uploadDir: path.join(dataDir, "uploads"),
  dbPath: path.join(dataDir, "examia.db"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024,
  // La clé reste côté serveur : elle n'est jamais sérialisée vers le client.
  anthropicKeyPresent: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  model: process.env.EXAMIA_MODEL || "claude-opus-5-5",
  effort: (process.env.EXAMIA_EFFORT || "high") as "low" | "medium" | "high" | "xhigh" | "max",
  forceDemo: process.env.EXAMIA_PROVIDER === "demo",
  // Point d'extension pour les futurs comptes : aujourd'hui un seul utilisateur local.
  defaultUserId: "local",
};
