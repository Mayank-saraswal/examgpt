import { describe, expect, it } from "vitest";
import {
  derivePaletteFromEvents,
  isAnsweredPalette,
  type AttemptEventLike,
  type EventType,
} from "./palette";

function ev(
  questionIndex: number,
  type: EventType,
  t: number,
  optionKey?: string,
): AttemptEventLike {
  return {
    questionIndex,
    type,
    optionKey,
    clientTs: new Date(t),
  };
}

describe("derivePaletteFromEvents", () => {
  it("starts NOT_VISITED", () => {
    const m = derivePaletteFromEvents([], [1, 2]);
    expect(m.get(1)?.paletteState).toBe("NOT_VISITED");
  });

  it("VISIT without answer → NOT_ANSWERED", () => {
    const m = derivePaletteFromEvents(
      [ev(1, "VISIT", 1000)],
      [1],
    );
    expect(m.get(1)?.paletteState).toBe("NOT_ANSWERED");
  });

  it("SELECT → ANSWERED", () => {
    const m = derivePaletteFromEvents(
      [ev(1, "VISIT", 1), ev(1, "SELECT", 2, "B")],
      [1],
    );
    expect(m.get(1)?.paletteState).toBe("ANSWERED");
    expect(m.get(1)?.selectedKey).toBe("B");
  });

  it("MARK without answer → MARKED", () => {
    const m = derivePaletteFromEvents(
      [ev(1, "VISIT", 1), ev(1, "MARK_REVIEW", 2)],
      [1],
    );
    expect(m.get(1)?.paletteState).toBe("MARKED");
  });

  it("answer + mark → ANSWERED_MARKED (counts as answered)", () => {
    const m = derivePaletteFromEvents(
      [
        ev(1, "VISIT", 1),
        ev(1, "SELECT", 2, "A"),
        ev(1, "MARK_REVIEW", 3),
      ],
      [1],
    );
    expect(m.get(1)?.paletteState).toBe("ANSWERED_MARKED");
    expect(isAnsweredPalette("ANSWERED_MARKED")).toBe(true);
  });

  it("CLEAR returns to NOT_ANSWERED if visited", () => {
    const m = derivePaletteFromEvents(
      [
        ev(1, "VISIT", 1),
        ev(1, "SELECT", 2, "C"),
        ev(1, "CLEAR", 3),
      ],
      [1],
    );
    expect(m.get(1)?.selectedKey).toBeNull();
    expect(m.get(1)?.paletteState).toBe("NOT_ANSWERED");
  });

  it("property: random sequences only produce valid palette states", () => {
    const types: EventType[] = [
      "VISIT",
      "LEAVE",
      "SELECT",
      "CHANGE",
      "CLEAR",
      "MARK_REVIEW",
      "UNMARK_REVIEW",
      "SAVE_NEXT",
    ];
    const valid = new Set([
      "NOT_VISITED",
      "NOT_ANSWERED",
      "ANSWERED",
      "MARKED",
      "ANSWERED_MARKED",
    ]);
    for (let trial = 0; trial < 40; trial++) {
      const events: AttemptEventLike[] = [];
      let t = 0;
      const n = 5 + Math.floor(Math.random() * 20);
      for (let i = 0; i < n; i++) {
        t += 100 + Math.floor(Math.random() * 500);
        const type = types[Math.floor(Math.random() * types.length)]!;
        const q = 1 + Math.floor(Math.random() * 5);
        const opt =
          type === "SELECT" || type === "CHANGE"
            ? ["A", "B", "C", "D"][Math.floor(Math.random() * 4)]
            : undefined;
        events.push(ev(q, type, t, opt));
      }
      const m = derivePaletteFromEvents(events, [1, 2, 3, 4, 5]);
      for (const s of m.values()) {
        expect(valid.has(s.paletteState)).toBe(true);
        if (s.paletteState === "ANSWERED" || s.paletteState === "ANSWERED_MARKED") {
          expect(s.selectedKey).toBeTruthy();
        }
        if (s.paletteState === "MARKED" || s.paletteState === "ANSWERED_MARKED") {
          expect(s.marked).toBe(true);
        }
      }
    }
  });
});
