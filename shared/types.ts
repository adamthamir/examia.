// Types partagés entre le serveur et le client.

export type Difficulty = "facile" | "intermediaire" | "difficile" | "examen";
export type QuestionType = "unique" | "multiple";
export type ScoringMode = "strict" | "partiel";
export type OptionLabel = "A" | "B" | "C" | "D";

export interface Subject {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  documentCount?: number;
  chapters?: Chapter[];
}

export interface Chapter {
  id: string;
  subjectId: string;
  name: string;
  position: number;
  documentCount?: number;
}

/** Une section repérable du cours (page PDF, diapositive, titre Word...). */
export interface Section {
  id: string; // ex. "S12"
  label: string; // ex. "Page 4", "Diapositive 7", "Titre : Le cycle cardiaque"
  text: string;
}

export interface CourseDocument {
  id: string;
  subjectId: string | null;
  chapterId: string | null;
  filename: string;
  mime: string;
  size: number;
  kind: "pdf" | "pptx" | "docx" | "image" | "texte";
  status: "processing" | "ready" | "error";
  error?: string | null;
  charCount: number;
  sectionCount: number;
  createdAt: string;
  subjectName?: string | null;
  chapterName?: string | null;
}

export interface CourseDocumentDetail extends CourseDocument {
  sections: Section[];
}

export interface QuizOption {
  label: OptionLabel;
  text: string;
  /** Pourquoi cette proposition est vraie ou fausse. */
  rationale: string;
}

export interface Question {
  id: string;
  stem: string;
  options: QuizOption[];
  correct: OptionLabel[];
  correction: string;
  explanation: string;
  reference: string; // ex. "Cardiologie › Chapitre 2 — Diapositive 7"
  chapterId: string | null;
  chapterName: string | null;
  difficulty: Difficulty;
  /** true si la question mobilise une notion absente du cours. */
  outOfCourse: boolean;
  outOfCourseNote: string;
}

export interface Quiz {
  id: string;
  title: string;
  subjectId: string | null;
  subjectName?: string | null;
  chapterId: string | null;
  chapterName?: string | null;
  difficulty: Difficulty;
  type: QuestionType;
  scoring: ScoringMode;
  requestedCount: number;
  status: "generating" | "ready" | "error";
  progress: number; // 0..1
  error?: string | null;
  provider: string;
  questionCount: number;
  documentIds: string[];
  createdAt: string;
  attemptCount?: number;
  bestScore?: number | null;
}

export interface QuizDetail extends Quiz {
  questions: Question[];
}

export type Answers = Record<string, OptionLabel[]>;

export interface ChapterStat {
  chapterId: string | null;
  chapterName: string;
  total: number;
  correct: number;
  rate: number; // 0..1
}

export interface QuestionResult {
  questionId: string;
  selected: OptionLabel[];
  isCorrect: boolean;
  points: number; // 0..1
}

export interface Attempt {
  id: string;
  quizId: string;
  quizTitle?: string;
  subjectName?: string | null;
  status: "in_progress" | "submitted";
  mode: "examen" | "entrainement";
  answers: Answers;
  flagged: string[];
  currentIndex: number;
  durationLimitSec: number;
  startedAt: string;
  submittedAt: string | null;
  elapsedSec: number;
  score20: number | null;
  percent: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  questionCount: number;
  chapterStats: ChapterStat[] | null;
  results: QuestionResult[] | null;
}

export interface AttemptDetail extends Attempt {
  quiz: QuizDetail;
}

export interface DashboardStats {
  documentCount: number;
  subjectCount: number;
  quizCount: number;
  attemptCount: number;
  averageScore20: number | null;
  bestScore20: number | null;
  questionsAnswered: number;
  evolution: { attemptId: string; date: string; score20: number; quizTitle: string }[];
  weakPoints: (ChapterStat & { subjectName: string | null })[];
  strongPoints: (ChapterStat & { subjectName: string | null })[];
  recentAttempts: Attempt[];
  recentQuizzes: Quiz[];
  recentDocuments: CourseDocument[];
}

export interface AiStatus {
  provider: "anthropic" | "demo";
  model: string | null;
  configured: boolean;
  visionOcr: boolean;
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  facile: "Facile",
  intermediaire: "Intermédiaire",
  difficile: "Difficile",
  examen: "Niveau examen",
};

export const QUESTION_COUNTS = [10, 20, 30, 50, 100] as const;
