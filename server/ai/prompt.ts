import type { Difficulty, QuestionType } from "../../shared/types.js";
import type { SourceBlock } from "./types.js";

export const SYSTEM_PROMPT = `Tu es EXAMIA, un concepteur de QCM d'entraînement pour des étudiants en sciences de la santé (médecine, pharmacie, médecine dentaire, soins infirmiers, sciences paramédicales).

Ton style s'inspire du format des épreuves écrites des facultés de sciences de la santé marocaines, comme celles de l'UM6SS : énoncés académiques et rigoureux, vocabulaire scientifique exact, propositions de longueur et de structure comparables, distracteurs plausibles construits à partir de confusions classiques (inversion de causalité, valeur numérique voisine, terme proche, exception à une règle, généralisation abusive). Tu ne prétends jamais reproduire un sujet officiel : tu crées des questions d'entraînement originales.

Règles impératives :
1. Le cours fourni est ta source de vérité. Chaque question doit être vérifiable dans le cours, et tu cites dans "source_refs" les références exactes des blocs utilisés (par exemple "D1-S4"), uniquement parmi celles fournies.
2. N'invente jamais un fait absent du cours. Si une question nécessite une connaissance générale non présente dans le cours, mets "out_of_course" à true et explique précisément dans "out_of_course_note" ce qui ne figure pas dans le cours. Sinon, "out_of_course" vaut false et "out_of_course_note" est une chaîne vide. Préfère toujours les questions entièrement fondées sur le cours.
3. Exactement quatre propositions, étiquetées A, B, C, D. Une proposition est soit vraie soit fausse sans ambiguïté selon le cours.
4. Évite les formulations « toutes les réponses sont justes » / « aucune n'est juste », les doubles négations non signalées et les indices grammaticaux qui trahissent la réponse. Si une négation est nécessaire, écris-la en majuscules (ex. « est FAUSSE »).
5. Varie la position des bonnes réponses et les types de questions : définition, mécanisme, valeur, classification, comparaison, cas clinique court, interprétation, application.
6. "correction" : la réponse juste et sa justification détaillée, en t'appuyant sur le cours. "explanation" : une explication pédagogique qui aide à retenir la notion (moyen mnémotechnique, lien avec une autre notion, piège à éviter). "rationale" de chaque proposition : pourquoi elle est vraie ou fausse, en une ou deux phrases.
7. "topic" : la notion ou la partie du cours évaluée, en quelques mots.
8. Rédige en français, sauf si le cours est intégralement dans une autre langue.
9. Ne répète pas une question déjà posée et ne pose pas deux fois la même notion sous une forme quasi identique.`;

const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  facile: "FACILE : restitution directe d'une définition, d'un fait ou d'une valeur explicitement présents dans le cours. Distracteurs clairement distincts.",
  intermediaire: "INTERMÉDIAIRE : compréhension et mise en relation de deux notions du cours. Distracteurs plausibles reposant sur des confusions fréquentes.",
  difficile: "DIFFICILE : raisonnement, mécanismes, exceptions, comparaisons fines. Distracteurs très proches de la bonne réponse, qui exigent une lecture attentive.",
  examen: "NIVEAU EXAMEN : mélange représentatif d'une épreuve réelle — environ 20 % de questions de restitution, 50 % de compréhension et 30 % de raisonnement ou de cas cliniques courts, avec des pièges pertinents et des formulations rigoureuses.",
};

const TYPE_GUIDE: Record<QuestionType, string> = {
  unique: "QCM à RÉPONSE UNIQUE : exactement une proposition juste par question ; \"correct\" contient une seule lettre.",
  multiple: "QCM à RÉPONSES MULTIPLES : une à quatre propositions justes par question ; \"correct\" contient toutes les lettres justes. Varie le nombre de bonnes réponses d'une question à l'autre (une, deux, trois, parfois quatre) pour qu'il ne soit pas devinable.",
};

export function renderCorpus(sources: SourceBlock[]): string {
  return sources
    .map(
      (s) =>
        `<bloc ref="${s.ref}" document="${escapeAttr(s.documentName)}" section="${escapeAttr(s.sectionLabel)}"${
          s.chapterName ? ` chapitre="${escapeAttr(s.chapterName)}"` : ""
        }>\n${s.text.trim()}\n</bloc>`,
    )
    .join("\n\n");
}

export function renderBatchInstructions(params: {
  subjectName: string | null;
  scopeLabel: string;
  count: number;
  difficulty: Difficulty;
  type: QuestionType;
  focusRefs: string[];
  avoidStems: string[];
}): string {
  const lines = [
    `Matière : ${params.subjectName ?? "non précisée"}`,
    `Périmètre : ${params.scopeLabel}`,
    "",
    `Génère exactement ${params.count} questions.`,
    DIFFICULTY_GUIDE[params.difficulty],
    TYPE_GUIDE[params.type],
  ];
  if (params.focusRefs.length) {
    lines.push(
      "",
      `Concentre ces questions principalement sur les blocs suivants (répartis-les de façon équilibrée) : ${params.focusRefs.join(", ")}.`,
    );
  }
  if (params.avoidStems.length) {
    lines.push(
      "",
      "Questions déjà générées dans ce QCM — ne les répète pas et n'évalue pas la même notion de la même façon :",
      ...params.avoidStems.slice(-80).map((s) => `- ${s}`),
    );
  }
  lines.push("", "Réponds uniquement avec l'objet JSON demandé.");
  return lines.join("\n");
}

export const QUESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "stem",
          "options",
          "correct",
          "correction",
          "explanation",
          "topic",
          "source_refs",
          "out_of_course",
          "out_of_course_note",
        ],
        properties: {
          stem: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text", "rationale"],
              properties: {
                label: { type: "string", enum: ["A", "B", "C", "D"] },
                text: { type: "string" },
                rationale: { type: "string" },
              },
            },
          },
          correct: { type: "array", items: { type: "string", enum: ["A", "B", "C", "D"] } },
          correction: { type: "string" },
          explanation: { type: "string" },
          topic: { type: "string" },
          source_refs: { type: "array", items: { type: "string" } },
          out_of_course: { type: "boolean" },
          out_of_course_note: { type: "string" },
        },
      },
    },
  },
} as const;

function escapeAttr(s: string) {
  return s.replace(/"/g, "'").replace(/[<>]/g, "");
}
