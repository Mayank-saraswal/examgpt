/**
 * NTA palette state machine from attempt event streams.
 * ANSWERED_MARKED counts as answered at submit.
 */

export type EventType =
  | "VISIT"
  | "LEAVE"
  | "SELECT"
  | "CHANGE"
  | "CLEAR"
  | "MARK_REVIEW"
  | "UNMARK_REVIEW"
  | "SAVE_NEXT"
  | "APP_BACKGROUND"
  | "APP_FOREGROUND";

export type PaletteState =
  | "NOT_VISITED"
  | "NOT_ANSWERED"
  | "ANSWERED"
  | "MARKED"
  | "ANSWERED_MARKED";

export type AttemptEventLike = {
  questionIndex: number;
  type: EventType;
  optionKey?: string | null;
  clientTs: Date | string | number;
};

export type QuestionRuntimeState = {
  questionIndex: number;
  paletteState: PaletteState;
  selectedKey: string | null;
  marked: boolean;
  visited: boolean;
  timeSpentSec: number;
  visitCount: number;
  optionChanges: number;
};

function ts(e: AttemptEventLike): number {
  return new Date(e.clientTs).getTime();
}

/**
 * Derive per-question palette + answer from ordered events.
 */
export function derivePaletteFromEvents(
  events: AttemptEventLike[],
  questionIndices: number[],
): Map<number, QuestionRuntimeState> {
  const map = new Map<number, QuestionRuntimeState>();
  for (const idx of questionIndices) {
    map.set(idx, {
      questionIndex: idx,
      paletteState: "NOT_VISITED",
      selectedKey: null,
      marked: false,
      visited: false,
      timeSpentSec: 0,
      visitCount: 0,
      optionChanges: 0,
    });
  }

  const sorted = [...events].sort((a, b) => ts(a) - ts(b));
  let currentQ: number | null = null;
  let visitStart: number | null = null;

  const ensure = (idx: number): QuestionRuntimeState => {
    let s = map.get(idx);
    if (!s) {
      s = {
        questionIndex: idx,
        paletteState: "NOT_VISITED",
        selectedKey: null,
        marked: false,
        visited: false,
        timeSpentSec: 0,
        visitCount: 0,
        optionChanges: 0,
      };
      map.set(idx, s);
    }
    return s;
  };

  const recomputePalette = (s: QuestionRuntimeState) => {
    if (!s.visited && !s.selectedKey && !s.marked) {
      s.paletteState = "NOT_VISITED";
      return;
    }
    if (s.selectedKey && s.marked) {
      s.paletteState = "ANSWERED_MARKED";
      return;
    }
    if (s.selectedKey) {
      s.paletteState = "ANSWERED";
      return;
    }
    if (s.marked) {
      s.paletteState = "MARKED";
      return;
    }
    s.paletteState = "NOT_ANSWERED";
  };

  for (const e of sorted) {
    const s = ensure(e.questionIndex);
    const t = ts(e);

    switch (e.type) {
      case "VISIT": {
        if (currentQ != null && visitStart != null && currentQ !== e.questionIndex) {
          const prev = ensure(currentQ);
          prev.timeSpentSec += Math.max(0, Math.floor((t - visitStart) / 1000));
        }
        s.visited = true;
        s.visitCount += 1;
        currentQ = e.questionIndex;
        visitStart = t;
        recomputePalette(s);
        break;
      }
      case "LEAVE": {
        if (visitStart != null && currentQ === e.questionIndex) {
          s.timeSpentSec += Math.max(0, Math.floor((t - visitStart) / 1000));
          visitStart = null;
          currentQ = null;
        }
        recomputePalette(s);
        break;
      }
      case "SELECT":
      case "CHANGE": {
        s.visited = true;
        if (s.selectedKey && e.optionKey && s.selectedKey !== e.optionKey) {
          s.optionChanges += 1;
        }
        if (e.type === "CHANGE") s.optionChanges += 1;
        s.selectedKey = e.optionKey ?? s.selectedKey;
        recomputePalette(s);
        break;
      }
      case "CLEAR": {
        s.selectedKey = null;
        recomputePalette(s);
        break;
      }
      case "MARK_REVIEW": {
        s.visited = true;
        s.marked = true;
        recomputePalette(s);
        break;
      }
      case "UNMARK_REVIEW": {
        s.marked = false;
        recomputePalette(s);
        break;
      }
      case "SAVE_NEXT": {
        // selection already applied via SELECT; mark visited
        s.visited = true;
        recomputePalette(s);
        break;
      }
      case "APP_BACKGROUND":
      case "APP_FOREGROUND":
      default:
        break;
    }
  }

  // close open visit
  if (currentQ != null && visitStart != null) {
    const s = ensure(currentQ);
    s.timeSpentSec += Math.max(
      0,
      Math.floor((Date.now() - visitStart) / 1000),
    );
  }

  return map;
}

/** NTA: answered if ANSWERED or ANSWERED_MARKED */
export function isAnsweredPalette(state: PaletteState): boolean {
  return state === "ANSWERED" || state === "ANSWERED_MARKED";
}

export function paletteCounts(
  states: Iterable<PaletteState>,
): Record<PaletteState, number> {
  const counts: Record<PaletteState, number> = {
    NOT_VISITED: 0,
    NOT_ANSWERED: 0,
    ANSWERED: 0,
    MARKED: 0,
    ANSWERED_MARKED: 0,
  };
  for (const s of states) counts[s] += 1;
  return counts;
}
