import type { EventType } from "@examgpt/ai";

export type QueuedEvent = {
  questionIndex: number;
  type: EventType;
  optionKey?: string | null;
  clientTs: string;
};

const key = (attemptId: string) => `examgpt:attempt-events:${attemptId}`;

export function loadQueuedEvents(attemptId: string): QueuedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(attemptId));
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

export function saveQueuedEvents(attemptId: string, events: QueuedEvent[]) {
  localStorage.setItem(key(attemptId), JSON.stringify(events));
}

export function enqueueEvent(attemptId: string, event: QueuedEvent) {
  const all = loadQueuedEvents(attemptId);
  all.push(event);
  saveQueuedEvents(attemptId, all);
}

export function clearQueuedEvents(attemptId: string) {
  localStorage.removeItem(key(attemptId));
}

export function newBatchId(): string {
  return crypto.randomUUID();
}
