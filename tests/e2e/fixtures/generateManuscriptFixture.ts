/**
 * Deterministic ≥100,000-word manuscript fixture generator, for the performance test in
 * performance.spec.ts (docs/TESTING.md's stated concrete next step — "generate a realistic
 * fixture and profile editor input latency and autosave duration against it").
 *
 * Not lorem ipsum: a small fantasy-flavored word bank strung into sentences via a seeded PRNG,
 * so the output is reproducible across runs (same seed -> same text -> same word count every
 * time) without needing a checked-in multi-hundred-KB file.
 */
const WORD_BANK = [
  "the",
  "raven",
  "circled",
  "tower",
  "ancient",
  "stone",
  "whispered",
  "shadow",
  "dawn",
  "crown",
  "exile",
  "kingdom",
  "betrayal",
  "fire",
  "ash",
  "wind",
  "silence",
  "blade",
  "oath",
  "blood",
  "court",
  "throne",
  "ghost",
  "storm",
  "memory",
  "wolf",
  "forest",
  "river",
  "mountain",
  "star",
  "night",
  "sword",
  "banner",
  "knight",
  "queen",
  "king",
  "prophecy",
  "curse",
  "flame",
  "iron",
  "letter",
  "sealed",
  "message",
  "army",
  "border",
  "village",
  "temple",
  "priestess",
  "omen",
  "tide",
];

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export interface ManuscriptFixture {
  markdown: string;
  chapterCount: number;
  approxWordCount: number;
}

/** Defaults to 40 chapters x 2,500 words = 100,000 words, matching docs/TESTING.md's stated target. */
export function generateManuscriptFixture(chapterCount = 40, wordsPerChapter = 2500, seed = 42): ManuscriptFixture {
  const rand = seededRandom(seed);
  const lines: string[] = [];
  let totalWords = 0;

  for (let chapter = 1; chapter <= chapterCount; chapter++) {
    lines.push(`# Chapter ${chapter}`, "");
    let wordsInChapter = 0;
    let wordsInParagraph = 0;

    while (wordsInChapter < wordsPerChapter) {
      const sentenceLength = 8 + Math.floor(rand() * 10);
      const sentence: string[] = [];
      for (let i = 0; i < sentenceLength; i++) sentence.push(WORD_BANK[Math.floor(rand() * WORD_BANK.length)]!);
      sentence[0] = capitalize(sentence[0]!);
      lines.push(sentence.join(" ") + ".");
      wordsInChapter += sentenceLength;
      wordsInParagraph += sentenceLength;
      totalWords += sentenceLength;
      if (wordsInParagraph > 80) {
        lines.push("");
        wordsInParagraph = 0;
      }
    }
    lines.push("");
  }

  return { markdown: lines.join("\n"), chapterCount, approxWordCount: totalWords };
}
