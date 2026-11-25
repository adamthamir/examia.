import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { config } from "./config.js";
import "./db.js";
import { aiStatus } from "./ai/index.js";
import { library } from "./routes/library.js";
import { quizzes } from "./routes/quizzes.js";
import { stats } from "./routes/stats.js";
import { HttpError } from "./routes/util.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", library, quizzes, stats);
app.use("/api", (_req, res) => res.status(404).json({ error: "Route inconnue." }));

// En production, le serveur sert aussi l'interface compilée (dist/).
const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? `Fichier trop volumineux (max ${config.maxUploadBytes / 1024 / 1024} Mo).` : err.message;
    return res.status(400).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur." });
});

app.listen(config.port, () => {
  const ai = aiStatus();
  console.log(`EXAMIA API → http://localhost:${config.port}`);
  console.log(ai.configured ? `IA : Claude (${ai.model})` : "IA : mode démo (aucune clé ANTHROPIC_API_KEY)");
});
