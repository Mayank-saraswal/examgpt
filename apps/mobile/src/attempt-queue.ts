import * as SQLite from "expo-sqlite";
import type { EventType } from "@examgpt/ai";

export type QueuedEvent = {
  questionIndex: number;
  type: EventType;
  optionKey?: string | null;
  clientTs: string;
};

let dbp: Promise<SQLite.SQLiteDatabase> | null = null;

async function db() {
  if (!dbp) {
    dbp = (async () => {
      const d = await SQLite.openDatabaseAsync("examgpt-attempts.db");
      await d.execAsync(`
        CREATE TABLE IF NOT EXISTS attempt_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attemptId TEXT NOT NULL,
          questionIndex INTEGER NOT NULL,
          type TEXT NOT NULL,
          optionKey TEXT,
          clientTs TEXT NOT NULL,
          flushed INTEGER NOT NULL DEFAULT 0
        );
      `);
      return d;
    })();
  }
  return dbp;
}

export async function enqueueAttemptEvent(
  attemptId: string,
  e: QueuedEvent,
) {
  const d = await db();
  await d.runAsync(
    `INSERT INTO attempt_events (attemptId, questionIndex, type, optionKey, clientTs, flushed)
     VALUES (?, ?, ?, ?, ?, 0)`,
    attemptId,
    e.questionIndex,
    e.type,
    e.optionKey ?? null,
    e.clientTs,
  );
}

export async function loadUnflushed(attemptId: string): Promise<
  (QueuedEvent & { id: number })[]
> {
  const d = await db();
  return d.getAllAsync(
    `SELECT id, questionIndex, type, optionKey, clientTs FROM attempt_events
     WHERE attemptId = ? AND flushed = 0 ORDER BY id ASC`,
    attemptId,
  );
}

export async function markFlushed(ids: number[]) {
  if (ids.length === 0) return;
  const d = await db();
  for (const id of ids) {
    await d.runAsync(`UPDATE attempt_events SET flushed = 1 WHERE id = ?`, id);
  }
}
