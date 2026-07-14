import * as SQLite from "expo-sqlite";

export type LocalChat = {
  id: string;
  title: string;
  updatedAt: string;
};

export type LocalMessage = {
  id: string;
  chatId: string;
  clientId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citationsJson: string | null;
  webSourcesJson: string | null;
  kind: string | null;
  createdAt: string;
  synced: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("examgpt-chat.db");
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY NOT NULL,
          chatId TEXT NOT NULL,
          clientId TEXT UNIQUE NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          citationsJson TEXT,
          webSourcesJson TEXT,
          kind TEXT,
          createdAt TEXT NOT NULL,
          synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chatId, createdAt);
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function cacheChats(chats: LocalChat[]) {
  const db = await getDb();
  for (const c of chats) {
    await db.runAsync(
      `INSERT INTO chats (id, title, updatedAt) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, updatedAt=excluded.updatedAt`,
      c.id,
      c.title,
      c.updatedAt,
    );
  }
}

export async function listCachedChats(): Promise<LocalChat[]> {
  const db = await getDb();
  return db.getAllAsync<LocalChat>(
    `SELECT id, title, updatedAt FROM chats ORDER BY updatedAt DESC`,
  );
}

export async function upsertLocalMessage(m: LocalMessage) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO messages (id, chatId, clientId, role, content, citationsJson, webSourcesJson, kind, createdAt, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(clientId) DO UPDATE SET
       content=excluded.content,
       citationsJson=excluded.citationsJson,
       webSourcesJson=excluded.webSourcesJson,
       kind=excluded.kind,
       synced=excluded.synced`,
    m.id,
    m.chatId,
    m.clientId,
    m.role,
    m.content,
    m.citationsJson,
    m.webSourcesJson,
    m.kind,
    m.createdAt,
    m.synced,
  );
}

export async function listLocalMessages(chatId: string): Promise<LocalMessage[]> {
  const db = await getDb();
  return db.getAllAsync<LocalMessage>(
    `SELECT * FROM messages WHERE chatId = ? ORDER BY createdAt ASC`,
    chatId,
  );
}

export async function listUnsyncedMessages(chatId?: string): Promise<LocalMessage[]> {
  const db = await getDb();
  if (chatId) {
    return db.getAllAsync<LocalMessage>(
      `SELECT * FROM messages WHERE synced = 0 AND chatId = ? ORDER BY createdAt ASC`,
      chatId,
    );
  }
  return db.getAllAsync<LocalMessage>(
    `SELECT * FROM messages WHERE synced = 0 ORDER BY createdAt ASC`,
  );
}

export async function markSynced(clientIds: string[]) {
  if (clientIds.length === 0) return;
  const db = await getDb();
  for (const id of clientIds) {
    await db.runAsync(`UPDATE messages SET synced = 1 WHERE clientId = ?`, id);
  }
}
