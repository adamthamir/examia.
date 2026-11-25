import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import { config } from "./config.js";

/**
 * Protection par code d'accès, activée dès que EXAMIA_ACCESS_CODE est défini.
 * Session = cookie httpOnly signé (HMAC), valable 30 jours.
 * Point de départ pour de vrais comptes utilisateurs plus tard.
 */
const COOKIE = "examia_session";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const accessCode = process.env.EXAMIA_ACCESS_CODE?.trim() || "";

function loadSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(config.dataDir, ".session-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  }
}
const secret = loadSecret();

const sign = (payload: string) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + MAX_AGE_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function validToken(token: string | undefined) {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch {
    return false;
  }
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

const isAuthenticated = (req: Request) => !accessCode || validToken(readCookie(req, COOKIE));

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: "Authentification requise." });
}

// Limitation des tentatives : 10 essais par IP toutes les 15 minutes.
const attempts = new Map<string, number[]>();

export const auth = Router();

auth.get("/auth/status", (req, res) => {
  res.json({ required: Boolean(accessCode), authenticated: isAuthenticated(req) });
});

auth.post("/auth/login", (req, res) => {
  const ip = req.ip ?? "?";
  const t = Date.now();
  const list = (attempts.get(ip) ?? []).filter((x) => t - x < 15 * 60_000);
  if (list.length >= 10) return res.status(429).json({ error: "Trop de tentatives. Réessayez dans 15 minutes." });
  list.push(t);
  attempts.set(ip, list);

  const given = crypto.createHash("sha256").update(String(req.body?.code ?? "")).digest();
  const expected = crypto.createHash("sha256").update(accessCode).digest();
  if (!accessCode || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: "Code d'accès incorrect." });
  }
  attempts.delete(ip);
  res.cookie(COOKIE, makeToken(), { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: MAX_AGE_MS, path: "/" });
  res.json({ ok: true });
});

auth.post("/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});
