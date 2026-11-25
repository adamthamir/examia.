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
import { auth, requireAuth } from "./auth.js";

const app = express();
app.disable("x-powered-by");
// Derrière le proxy HTTPS de l'hébergeur : nécessaire pour req.secure et req.ip.
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", auth);
app.use("/api", requireAuth, library, quizzes, stats);
app.use("/api", (_req, res) => res.status(404).json({ error: "Route inconnue." }));

// En production, le serveur sert aussi l'interface compilée (dist/).
const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y" }));
  app.use(
    express.static(dist, {
      index: false,
      setHeaders: (res, file) => {
        if (/(sw\.js|\.webmanifest|\.html)$/.test(file)) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
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
  console.log(process.env.EXAMIA_ACCESS_CODE ? "Accès protégé par code." : "Accès libre (EXAMIA_ACCESS_CODE non défini).");
});
