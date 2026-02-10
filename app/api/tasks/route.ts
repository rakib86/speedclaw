import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { runAgentLoop } from "@/lib/agent";
import { startScheduler } from "@/lib/scheduler";
import { v4 as uuidv4 } from "uuid";

// Ensure scheduler is running when tasks API is accessed
let schedulerStarted = false;
function ensureScheduler() {
  if (!schedulerStarted) {
    startScheduler();
    schedulerStarted = true;
  }
}

// GET: List all tasks
export async function GET() {
  ensureScheduler();
  const tasks = db.listTasks();
  return NextResponse.json(tasks);
}

// PATCH: Update task status
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, action } = body;

  if (!id || !action) {
    return NextResponse.json(
      { error: "id and action are required" },
      { status: 400 },
    );
  }

  const task = db.getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  switch (action) {
    case "pause":
      db.updateTask(id, { status: "paused" });
      break;
    case "resume":
      db.updateTask(id, { status: "active" });
      break;
    case "cancel":
    case "delete":
      db.deleteTask(id);
      break;
    case "run": {
      // Run the task immediately
      const convId = task.conversation_id || uuidv4();
      const startTime = Date.now();
      let result = "";
      let status: "success" | "error" = "success";
      let error: string | null = null;
      try {
        result = await runAgentLoop(convId, task.prompt);
      } catch (err) {
        status = "error";
        error = err instanceof Error ? err.message : String(err);
        result = `Error: ${error}`;
      }
      const durationMs = Date.now() - startTime;
      db.logTaskRun({
        task_id: id,
        run_at: new Date().toISOString(),
        duration_ms: durationMs,
        status,
        result: result.slice(0, 5000),
        error,
      });
      db.updateTask(id, {
        last_run: new Date().toISOString(),
        last_result: result.slice(0, 2000),
      });
      return NextResponse.json({
        success: true,
        result: result.slice(0, 2000),
      });
    }
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
