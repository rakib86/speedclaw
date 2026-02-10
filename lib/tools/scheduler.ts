import type { ToolDefinition, ToolExecutionResult } from "../types";
import * as db from "../db";
import cron from "node-cron";

// ===== Tool Definitions =====

export const scheduleTaskDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "schedule_task",
    description: `Schedule a task to run later. The task will run as a full AI agent with all tools available.

IMPORTANT scheduling logic:
- Use 'once' for one-time actions: "after 1 min", "in 5 minutes", "at 3pm", "again after X", "remind me at Y". The schedule_value MUST be a future ISO timestamp calculated from the current time.
- Use 'interval' ONLY when the user explicitly wants REPEATING actions: "every 5 minutes", "every hour", "repeatedly".
- Use 'cron' ONLY for calendar-based recurring schedules: "every day at 8am", "weekly on Monday", "daily".
- DEFAULT TO 'once' when the intent is ambiguous. Words like "after", "in", "again" mean one-time.`,
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "What the agent should do when the task runs",
        },
        schedule_type: {
          type: "string",
          enum: ["cron", "once", "interval"],
          description:
            "'once' = one-time at a specific time (DEFAULT for 'after X min', 'in X hours', 'at 3pm', 'again'). 'interval' = repeating every N ms (ONLY for 'every X minutes' etc). 'cron' = calendar recurring (ONLY for 'daily at', 'weekly', 'monthly').",
        },
        schedule_value: {
          type: "string",
          description:
            "For 'once': ISO timestamp of when to run (e.g. '2026-02-09T18:31:00.000Z'). For 'interval': milliseconds between runs (e.g. '60000' for 1 min). For 'cron': cron expression (e.g. '0 8 * * *' for daily 8am).",
        },
        notify: {
          type: "string",
          description: "Whether to send results to the chat (default 'true')",
        },
      },
      required: ["prompt", "schedule_type", "schedule_value"],
    },
  },
};

export const listTasksDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "list_tasks",
    description:
      "List all scheduled tasks with their status, next run time, and last result.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

export const cancelTaskDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "cancel_task",
    description: "Cancel and delete a scheduled task by ID",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "The ID of the task to cancel",
        },
      },
      required: ["task_id"],
    },
  },
};

export const pauseTaskDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "pause_task",
    description: "Pause a scheduled task by ID (it won't run until resumed)",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "The ID of the task to pause",
        },
      },
      required: ["task_id"],
    },
  },
};

export const resumeTaskDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "resume_task",
    description: "Resume a previously paused scheduled task",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "The ID of the task to resume",
        },
      },
      required: ["task_id"],
    },
  },
};

// ===== Helper: compute next run =====

function computeNextRun(
  scheduleType: string,
  scheduleValue: string,
): string | null {
  const now = new Date();

  if (scheduleType === "once") {
    const target = new Date(scheduleValue);
    if (isNaN(target.getTime())) return null;
    return target.toISOString();
  }

  if (scheduleType === "interval") {
    const ms = parseInt(scheduleValue, 10);
    if (isNaN(ms)) return null;
    return new Date(now.getTime() + ms).toISOString();
  }

  if (scheduleType === "cron") {
    // Validate cron expression
    if (!cron.validate(scheduleValue)) return null;
    // Simple estimate: next minute for cron (exact calculation is complex)
    // We'll use a simple approach: add 1 minute from now as an approximation
    // The scheduler loop checks every 30 seconds and matches properly
    return new Date(now.getTime() + 60000).toISOString();
  }

  return null;
}

// ===== Tool Executors =====

export async function scheduleTask(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const prompt = args.prompt as string;
  const scheduleType = args.schedule_type as string;
  const scheduleValue = args.schedule_value as string;
  const notify = args.notify !== "false";

  if (!prompt || !scheduleType || !scheduleValue) {
    return {
      success: false,
      result: "prompt, schedule_type, and schedule_value are required",
    };
  }

  if (!["cron", "once", "interval"].includes(scheduleType)) {
    return {
      success: false,
      result: "schedule_type must be 'cron', 'once', or 'interval'",
    };
  }

  if (scheduleType === "cron" && !cron.validate(scheduleValue)) {
    return {
      success: false,
      result: `Invalid cron expression: ${scheduleValue}`,
    };
  }

  const nextRun = computeNextRun(scheduleType, scheduleValue);
  if (!nextRun) {
    return {
      success: false,
      result: `Could not compute next run time for ${scheduleType}: ${scheduleValue}`,
    };
  }

  const task = db.createTask({
    conversation_id: null, // Will be set by the agent loop
    prompt,
    schedule_type: scheduleType as "cron" | "once" | "interval",
    schedule_value: scheduleValue,
    status: "active",
    notify,
    next_run: nextRun,
  });

  return {
    success: true,
    result: `Task scheduled successfully!\n- ID: ${task.id}\n- Type: ${scheduleType}\n- Schedule: ${scheduleValue}\n- Next run: ${nextRun}\n- Prompt: "${prompt}"`,
  };
}

export async function listTasksTool(
  _args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const tasks = db.listTasks();

  if (tasks.length === 0) {
    return { success: true, result: "No scheduled tasks." };
  }

  const formatted = tasks
    .map(
      (t) =>
        `- **Task #${t.id}** [${t.status.toUpperCase()}]\n  Prompt: "${t.prompt}"\n  Type: ${t.schedule_type} (${t.schedule_value})\n  Next run: ${t.next_run || "N/A"}\n  Last run: ${t.last_run || "Never"}`,
    )
    .join("\n\n");

  return { success: true, result: `Scheduled tasks:\n\n${formatted}` };
}

export async function cancelTask(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const taskId = args.task_id as number;
  const task = db.getTask(taskId);
  if (!task) {
    return { success: false, result: `Task #${taskId} not found` };
  }
  db.deleteTask(taskId);
  return {
    success: true,
    result: `Task #${taskId} has been cancelled and deleted.`,
  };
}

export async function pauseTask(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const taskId = args.task_id as number;
  const task = db.getTask(taskId);
  if (!task) {
    return { success: false, result: `Task #${taskId} not found` };
  }
  db.updateTask(taskId, { status: "paused" });
  return { success: true, result: `Task #${taskId} has been paused.` };
}

export async function resumeTask(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const taskId = args.task_id as number;
  const task = db.getTask(taskId);
  if (!task) {
    return { success: false, result: `Task #${taskId} not found` };
  }

  const nextRun = computeNextRun(task.schedule_type, task.schedule_value);
  db.updateTask(taskId, { status: "active", next_run: nextRun || undefined });
  return {
    success: true,
    result: `Task #${taskId} has been resumed. Next run: ${nextRun}`,
  };
}
