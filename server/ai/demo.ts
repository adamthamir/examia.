import type { OptionLabel } from "../../shared/types.js";
import type { GenerationInput, QuizAIProvider, RawQuestion, SourceBlock } from "./types.js";

/**
 * Générateur local sans IA, utilisé quand aucune clé API n'est configurée.
 * Il fabrique des questions à trous et des affirmations vraies/altérées
 * à partir des phrases exactes du cours : rien n'est inventé, mais la
 * qualité pédagogique reste très inférieure à celle d'un vrai modèle.
 */
const LABELS: OptionLabel[] = ["A", "B", "C", "D"];
const STOP = new Set(
  `alors aussi autre autres avant avec avoir cette celle celles celui ceux chaque comme comment dans depuis donc elle elles encore entre être fait faire font leur leurs lorsque mais même moins notre nous parce pendant peut peuvent plus pour pourquoi quand quel quelle quelles quels sans selon sera seront sont sous suivant suivante suivantes tous tout toute toutes très vers votre vous permet permettent ainsi entre ensemble certains certaines plusieurs souvent également généralement notamment d'une d'un qu'il qu'elle c'est chez about which where there their these those would should could being`
    .split(/\s+/),
);

interface Sentence {
  text: string;
  source: SourceBlock;
  terms: string[];
}

export class DemoProvider implements QuizAIProvider {
  readonly name = "demo" as const;
  readonly model = null;

  async generate(input: GenerationInput): Promise<RawQuestion[]> {
    const rand = mulberry32(hash(input.sources.map((s) => s.ref).join() + input.count + input.type));
    const sentences: Sentence[] = [];
    const freq = new Map<string, number>();

    for (const source of input.sources) {
      const parts = source.text
        .split(/\n+/)
        .flatMap((line) => line.replace(/^[•▪●◦–-]\s*/, "").split(/(?<=[.!?;])\s+/))
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter((s) => s.length >= 45 && s.length <= 280);
      for (const text of parts) {
        const terms = Array.from(new Set(text.match(/[\p{L}][\p{L}\-']{5,}/gu) ?? [])).filter(
          (w) => !STOP.has(w.toLowerCase()),
        );
        if (terms.length < 2) continue;
        sentences.push({ text, source, terms });
        for (const t of terms) freq.set(t.toLowerCase(), (freq.get(t.toLowerCase()) ?? 0) + 1);
      }
    }
    if (sentences.length < 4) {
      throw new Error("Le cours ne contient pas assez de texte exploitable pour générer des questions.");
    }
    const vocabulary = Array.from(new Set(sentences.flatMap((s) => s.terms)));
    const shuffled = shuffle([...sentences], rand);
    const out: RawQuestion[] = [];

    for (let i = 0; out.length < input.count && i < input.count * 12; i++) {
      const s = shuffled[i % shuffled.length];
      const q =
        input.type === "unique" ? this.cloze(s, vocabulary, freq, rand) : this.statements(s, shuffled, vocabulary, rand);
      if (q && !out.some((o) => o.stem === q.stem)) out.push(q);
      input.onProgress?.(out.length / input.count);
    }
    return out;
  }

  private cloze(s: Sentence, vocab: string[], freq: Map<string, number>, rand: () => number): RawQuestion | null {
    // On masque le terme le plus « spécifique » (rare dans le corpus, long).
    const term = [...s.terms].sort(
      (a, b) => (freq.get(a.toLowerCase()) ?? 0) - (freq.get(b.toLowerCase()) ?? 0) || b.length - a.length,
    )[0];
    const distractors = shuffle(
      vocab.filter((w) => w.toLowerCase() !== term.toLowerCase() && !s.text.includes(w) && Math.abs(w.length - term.length) <= 4),
      rand,
    ).slice(0, 3);
    if (distractors.length < 3) return null;
    const words = shuffle([term, ...distractors], rand);
    const blanked = s.text.replace(term, "_____");
    const correct = LABELS[words.indexOf(term)];
    return {
      stem: `Selon le cours, quel terme complète correctement l'énoncé suivant ?\n« ${blanked} »`,
      options: words.map((w, i) => ({
        label: LABELS[i],
        text: w,
        rationale: w === term ? `C'est le terme employé dans le cours : « ${s.text} »` : `Ce terme ne correspond pas à l'énoncé du cours.`,
      })),
      correct: [correct],
      correction: `Réponse ${correct} : « ${term} ». Phrase exacte du cours : « ${s.text} »`,
      explanation: `Relisez la partie « ${s.source.sectionLabel} » du document ${s.source.documentName} pour fixer cette notion. (Question produite par le générateur de démonstration, sans IA.)`,
      topic: term,
      source_refs: [s.source.ref],
      out_of_course: false,
      out_of_course_note: "",
    };
  }

  private statements(s: Sentence, pool: Sentence[], vocab: string[], rand: () => number): RawQuestion | null {
    const picks = [s, ...shuffle(pool.filter((p) => p !== s && p.source.ref === s.source.ref), rand)].slice(0, 4);
    while (picks.length < 4) {
      const extra = pool[Math.floor(rand() * pool.length)];
      if (!picks.includes(extra)) picks.push(extra);
    }
    const trueCount = 1 + Math.floor(rand() * 3);
    const options: RawQuestion["options"] = [];
    const correct: OptionLabel[] = [];
    picks.forEach((p, i) => {
      const label = LABELS[i];
      if (i < trueCount) {
        options.push({ label, text: p.text, rationale: "Affirmation conforme au cours, reprise telle quelle." });
        correct.push(label);
      } else {
        const term = p.terms[Math.floor(rand() * p.terms.length)];
        const swap = shuffle(vocab.filter((w) => w !== term && !p.text.includes(w)), rand)[0];
        if (!swap) return;
        options.push({
          label,
          text: p.text.replace(term, swap),
          rationale: `Affirmation altérée : le cours dit « ${term} » et non « ${swap} ».`,
        });
      }
    });
    if (options.length < 4) return null;
    // Mélange des positions tout en conservant les étiquettes A-D.
    const order = shuffle([0, 1, 2, 3], rand);
    const remapped = order.map((o, i) => ({ ...options[o], label: LABELS[i] }));
    const newCorrect = order.map((o, i) => (correct.includes(LABELS[o]) ? LABELS[i] : null)).filter(Boolean) as OptionLabel[];
    return {
      stem: `Parmi les propositions suivantes, laquelle ou lesquelles sont conformes au cours (${s.source.sectionLabel}) ?`,
      options: remapped,
      correct: newCorrect,
      correction: `Propositions justes : ${newCorrect.join(", ")}. Les autres ont été modifiées par substitution d'un terme.`,
      explanation: "Repérez le mot qui change le sens de la phrase : c'est un piège classique des QCM. (Question produite par le générateur de démonstration, sans IA.)",
      topic: s.terms[0],
      source_refs: Array.from(new Set(picks.map((p) => p.source.ref))),
      out_of_course: false,
      out_of_course_note: "",
    };
  }
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
