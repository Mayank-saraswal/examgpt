import {
  derivePaletteFromEvents,
  isAnsweredPalette,
  type AttemptEventLike,
  type PaletteState,
} from "./palette";

export type MarkingScheme = {
  correct: number;
  wrong: number;
  unattempted: number;
};

export const NEET_MARKING: MarkingScheme = {
  correct: 4,
  wrong: -1,
  unattempted: 0,
};

export const JEE_MARKING: MarkingScheme = {
  correct: 4,
  wrong: -1,
  unattempted: 0,
};

export type QuestionForScore = {
  index: number;
  correctKey: string | null;
  flagged?: boolean;
};

export type ScoredResponse = {
  questionIndex: number;
  selectedKey: string | null;
  paletteState: PaletteState;
  timeSpentSec: number;
  visitCount: number;
  optionChanges: number;
  isCorrect: boolean | null;
  marksAwarded: number;
};

export function scoreAttempt(opts: {
  questions: QuestionForScore[];
  events: AttemptEventLike[];
  scheme: MarkingScheme;
}): { score: number; maxScore: number; responses: ScoredResponse[] } {
  const indices = opts.questions.map((q) => q.index);
  const derived = derivePaletteFromEvents(opts.events, indices);
  let score = 0;
  let maxScore = 0;
  const responses: ScoredResponse[] = [];

  for (const q of opts.questions) {
    if (q.flagged) {
      // excluded from scoring
      const s = derived.get(q.index);
      responses.push({
        questionIndex: q.index,
        selectedKey: s?.selectedKey ?? null,
        paletteState: s?.paletteState ?? "NOT_VISITED",
        timeSpentSec: s?.timeSpentSec ?? 0,
        visitCount: s?.visitCount ?? 0,
        optionChanges: s?.optionChanges ?? 0,
        isCorrect: null,
        marksAwarded: 0,
      });
      continue;
    }

    maxScore += opts.scheme.correct;
    const s = derived.get(q.index);
    const selected = s?.selectedKey ?? null;
    const palette = s?.paletteState ?? "NOT_VISITED";
    const answered = isAnsweredPalette(palette) && selected != null;

    let marks = opts.scheme.unattempted;
    let isCorrect: boolean | null = null;
    if (answered) {
      if (q.correctKey && selected === q.correctKey) {
        marks = opts.scheme.correct;
        isCorrect = true;
      } else if (q.correctKey) {
        marks = opts.scheme.wrong;
        isCorrect = false;
      } else {
        // no key — no marks
        marks = 0;
        isCorrect = null;
      }
    }

    score += marks;
    responses.push({
      questionIndex: q.index,
      selectedKey: selected,
      paletteState: palette,
      timeSpentSec: s?.timeSpentSec ?? 0,
      visitCount: s?.visitCount ?? 0,
      optionChanges: s?.optionChanges ?? 0,
      isCorrect,
      marksAwarded: marks,
    });
  }

  return { score, maxScore, responses };
}
