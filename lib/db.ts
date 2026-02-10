import Database from "better-sqlite3";
import path from "path";
import type { Conversation, Message, ScheduledTask, TaskRunLog } from "./types";

const DB_PATH = path.join(process.cwd(), "store", "data.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    // Ensure store directory exists
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      notify INTEGER DEFAULT 1,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES scheduled_tasks(id),
      run_at TEXT,
      duration_ms INTEGER,
      status TEXT,
      result TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ===== Conversations =====

export function createConversation(id: string, title: string): Conversation {
  const database = getDb();
  database
    .prepare("INSERT INTO conversations (id, title) VALUES (?, ?)")
    .run(id, title);
  return getConversation(id)!;
}

export function getConversation(id: string): Conversation | null {
  const database = getDb();
  return database
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as Conversation | null;
}

export function listConversations(): Conversation[] {
  const database = getDb();
  return database
    .prepare("SELECT * FROM conversations ORDER BY updated_at DESC")
    .all() as Conversation[];
}

export function updateConversationTitle(id: string, title: string) {
  const database = getDb();
  database
    .prepare(
      "UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(title, id);
}

export function deleteConversation(id: string) {
  const database = getDb();
  database.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}

export function touchConversation(id: string) {
  const database = getDb();
  database
    .prepare(
      "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
    )
    .run(id);
}

// ===== Messages =====

export function addMessage(
  conversationId: string,
  role: string,
  content: string | null,
  toolCalls?: unknown[] | null,
  toolCallId?: string | null,
): number {
  const database = getDb();
  const result = database
    .prepare(
      "INSERT INTO messages (conversation_id, role, content, tool_calls, tool_call_id) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      conversationId,
      role,
      content,
      toolCalls ? JSON.stringify(toolCalls) : null,
      toolCallId || null,
    );
  touchConversation(conversationId);
  return result.lastInsertRowid as number;
}

export function getMessages(conversationId: string): Message[] {
  const database = getDb();
  const rows = database
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC")
    .all(conversationId) as Array<{
    id: number;
    conversation_id: string;
    role: string;
    content: string | null;
    tool_calls: string | null;
    tool_call_id: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role as Message["role"],
    content: row.content,
    tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : null,
    tool_call_id: row.tool_call_id,
    created_at: row.created_at,
  }));
}

// ===== Scheduled Tasks =====

export function createTask(
  task: Omit<ScheduledTask, "id" | "created_at" | "last_run" | "last_result">,
): ScheduledTask {
  const database = getDb();
  const result = database
    .prepare(
      `INSERT INTO scheduled_tasks (conversation_id, prompt, schedule_type, schedule_value, status, notify, next_run)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      task.conversation_id,
      task.prompt,
      task.schedule_type,
      task.schedule_value,
      task.status,
      task.notify ? 1 : 0,
      task.next_run,
    );
  return getTask(result.lastInsertRowid as number)!;
}

export function getTask(id: number): ScheduledTask | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM scheduled_tasks WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...row, notify: Boolean(row.notify) } as unknown as ScheduledTask;
}

export function listTasks(): ScheduledTask[] {
  const database = getDb();
  const rows = database
    .prepare("SELECT * FROM scheduled_tasks ORDER BY created_at DESC")
    .all() as Array<Record<string, unknown>>;
  return rows.map(
    (row) =>
      ({ ...row, notify: Boolean(row.notify) }) as unknown as ScheduledTask,
  );
}

export function getDueTasks(): ScheduledTask[] {
  const database = getDb();
  // Use datetime() to normalize ISO 8601 timestamps (with T and Z) for proper comparison
  const rows = database
    .prepare(
      "SELECT * FROM scheduled_tasks WHERE status = 'active' AND next_run IS NOT NULL AND datetime(next_run) <= datetime('now')",
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(
    (row) =>
      ({ ...row, notify: Boolean(row.notify) }) as unknown as ScheduledTask,
  );
}

export function updateTask(id: number, updates: Partial<ScheduledTask>) {
  const database = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.next_run !== undefined) {
    fields.push("next_run = ?");
    values.push(updates.next_run);
  }
  if (updates.last_run !== undefined) {
    fields.push("last_run = ?");
    values.push(updates.last_run);
  }
  if (updates.last_result !== undefined) {
    fields.push("last_result = ?");
    values.push(updates.last_result);
  }

  if (fields.length === 0) return;
  values.push(id);
  database
    .prepare(`UPDATE scheduled_tasks SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function deleteTask(id: number) {
  const database = getDb();
  database.prepare("DELETE FROM task_run_logs WHERE task_id = ?").run(id);
  database.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
}

// ===== Task Run Logs =====

export function logTaskRun(log: Omit<TaskRunLog, "id">) {
  const database = getDb();
  database
    .prepare(
      "INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      log.task_id,
      log.run_at,
      log.duration_ms,
      log.status,
      log.result,
      log.error,
    );
}

// ===== Settings =====

export function getSetting(key: string): string | null {
  const database = getDb();
  const row = database
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  const database = getDb();
  database
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const database = getDb();
  const rows = database.prepare("SELECT * FROM settings").all() as Array<{
    key: string;
    value: string;
  }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
