import * as db from "./db";
import { runAgentLoop } from "./agent";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// Connected WebSocket clients for notifications
const notifyCallbacks: Set<(conversationId: string, message: string) => void> =
  new Set();

export function onTaskNotification(
  callback: (conversationId: string, message: string) => void,
) {
  notifyCallbacks.add(callback);
  return () => notifyCallbacks.delete(callback);
}

function notifyClients(conversationId: string, message: string) {
  for (const cb of notifyCallbacks) {
    try {
      cb(conversationId, message);
    } catch {
      /* ignore */
    }
  }
}

function computeNextCronRun(cronExpression: string): string | null {
  try {
    if (!cron.validate(cronExpression)) return null;
    // node-cron doesn't expose next run easily, so we estimate
    // The scheduler checks every 30 seconds, so a 1-minute estimate is fine
    const now = new Date();
    return new Date(now.getTime() + 60000).toISOString();
  } catch {
    return null;
  }
}

import type { ScheduledTask } from "./types";

async function processTask(task: ScheduledTask) {
  if (!task) return;

  const startTime = Date.now();
  let status: "success" | "error" = "success";
  let result = "";
  let error: string | null = null;

  try {
    // Create a conversation for task if needed
    const convId = task.conversation_id || uuidv4();
    result = await runAgentLoop(convId, task.prompt);
  } catch (err) {
    status = "error";
    error = err instanceof Error ? err.message : String(err);
    result = `Error: ${error}`;
  }

  const durationMs = Date.now() - startTime;

  // Log the run
  db.logTaskRun({
    task_id: task.id,
    run_at: new Date().toISOString(),
    duration_ms: durationMs,
    status,
    result: result.slice(0, 5000), // Truncate result
    error,
  });

  // Update task
  const updates: Partial<typeof task> = {
    last_run: new Date().toISOString(),
    last_result: result.slice(0, 2000),
  };

  if (task.schedule_type === "once") {
    updates.status = "completed";
    updates.next_run = null;
  } else if (task.schedule_type === "interval") {
    const ms = parseInt(task.schedule_value, 10);
    updates.next_run = new Date(Date.now() + ms).toISOString();
  } else if (task.schedule_type === "cron") {
    updates.next_run = computeNextCronRun(task.schedule_value);
  }

  if (status === "error") {
    updates.status = "error";
  }

  db.updateTask(task.id, updates as Partial<ScheduledTask>);

  // Notify frontend
  if (task.notify && task.conversation_id) {
    notifyClients(
      task.conversation_id,
      `⏰ Scheduled task #${task.id} completed:\n\n${result.slice(0, 1000)}`,
    );
  }
}

async function schedulerTick() {
  if (isRunning) return;
  isRunning = true;

  try {
    const dueTasks = db.getDueTasks();
    if (dueTasks.length > 0) {
      console.log(
        `[Scheduler] Found ${dueTasks.length} due task(s):`,
        dueTasks.map((t) => `#${t.id} "${t.prompt}" (next_run: ${t.next_run})`),
      );
    }
    for (const task of dueTasks) {
      console.log(`[Scheduler] Executing task #${task.id}: "${task.prompt}"`);
      await processTask(task);
      console.log(`[Scheduler] Completed task #${task.id}`);
    }
  } catch (err) {
    console.error("[Scheduler] Error:", err);
  } finally {
    isRunning = false;
  }
}

export function startScheduler() {
  if (schedulerInterval) return;
  console.log("[Scheduler] Started — checking every 15 seconds");
  schedulerInterval = setInterval(schedulerTick, 15000);
  // Also run immediately
  schedulerTick();
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  console.log("[Scheduler] Stopped");
}
