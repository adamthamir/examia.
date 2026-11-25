import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

/**
 * Couche de persistance SQLite (module natif Node, sans dépendance).
 * Chaque table porte un `user_id` pour accueillir plus tard les comptes,
 * abonnements et paiements sans migration lourde.
 */
export const db = new DatabaseSync(config.dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  kind TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  sections TEXT NOT NULL DEFAULT '[]',
  char_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  difficulty TEXT NOT NULL,
  type TEXT NOT NULL,
  scoring TEXT NOT NULL DEFAULT 'strict',
  requested_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  error TEXT,
  provider TEXT NOT NULL,
  document_ids TEXT NOT NULL DEFAULT '[]',
  questions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'examen',
  answers TEXT NOT NULL DEFAULT '{}',
  flagged TEXT NOT NULL DEFAULT '[]',
  current_index INTEGER NOT NULL DEFAULT 0,
  duration_limit_sec INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  elapsed_sec INTEGER NOT NULL DEFAULT 0,
  score20 REAL,
  percent REAL,
  correct_count INTEGER,
  wrong_count INTEGER,
  unanswered_count INTEGER,
  chapter_stats TEXT,
  results TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_user ON quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts(quiz_id);
`);

db.prepare(
  "INSERT OR IGNORE INTO users (id, display_name, plan, created_at) VALUES (?, ?, 'free', ?)",
).run(config.defaultUserId, "Étudiant", new Date().toISOString());

// Les quiz restés « en génération » après un redémarrage ne reprendront pas.
db.prepare(
  "UPDATE quizzes SET status='error', error='Génération interrompue (redémarrage du serveur).' WHERE status='generating'",
).run();

export const now = () => new Date().toISOString();
export const json = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
