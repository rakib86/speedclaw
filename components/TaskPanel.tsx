"use client";

import { useState, useEffect } from "react";
import {
  Clock,
  Pause,
  Play,
  Trash2,
  RefreshCw,
  Zap,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Task {
  id: number;
  conversation_id: string | null;
  prompt: string;
  schedule_type: string;
  schedule_value: string;
  status: string;
  notify: boolean;
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  created_at: string;
}

interface TaskPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "active":
      return "text-emerald-400";
    case "paused":
      return "text-amber-400";
    case "completed":
      return "text-blue-400";
    case "error":
      return "text-red-400";
    default:
      return "text-zinc-400";
  }
}

export default function TaskPanel({ isOpen, onClose }: TaskPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);

  const fetchTasks = async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTasks();
      const interval = setInterval(fetchTasks, 10000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const [runningTaskId, setRunningTaskId] = useState<number | null>(null);

  const handleAction = async (id: number, action: string) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) console.error("Task action failed:", await res.text());
      await fetchTasks();
    } catch (err) {
      console.error("Task action error:", err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "delete" }),
      });
      if (!res.ok) {
        console.error("Task delete failed:", await res.text());
        return;
      }
      // Remove from local state immediately for responsive UI
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Task delete error:", err);
    }
  };
  const handleRun = async (id: number) => {
    setRunningTaskId(id);
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "run" }),
      });
      fetchTasks();
    } catch {
      /* ignore */
    } finally {
      setRunningTaskId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Clock size={16} className="text-amber-400" />
          Scheduled Tasks
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTasks}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tasks List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tasks.length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-8">
            No scheduled tasks yet. Ask NexusAgent to schedule something!
          </p>
        )}
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-800"
          >
            <div className="flex items-start justify-between mb-2">
              <span
                className={cn(
                  "text-xs font-medium uppercase",
                  statusColor(task.status),
                )}
              >
                {task.status}
              </span>
              <span className="text-xs text-zinc-500">#{task.id}</span>
            </div>
            <p className="text-sm text-zinc-200 mb-2 line-clamp-2">
              {task.prompt}
            </p>
            <div className="text-xs text-zinc-500 space-y-1">
              <div>
                Type: {task.schedule_type} ({task.schedule_value})
              </div>
              <div>Next run: {formatDate(task.next_run)}</div>
              <div>Last run: {formatDate(task.last_run)}</div>
            </div>
            {task.last_result && (
              <div className="mt-2 text-xs text-zinc-400 bg-zinc-900 rounded p-2 max-h-20 overflow-y-auto">
                {task.last_result.slice(0, 200)}
              </div>
            )}
            <div className="flex gap-1 mt-2">
              {(task.status === "active" || task.status === "paused") && (
                <button
                  onClick={() => handleRun(task.id)}
                  disabled={runningTaskId === task.id}
                  className="p-1.5 rounded bg-zinc-700 hover:bg-emerald-600/20 text-zinc-400 hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Run Now"
                >
                  {runningTaskId === task.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Zap size={12} />
                  )}
                </button>
              )}
              {task.status === "active" && (
                <button
                  onClick={() => handleAction(task.id, "pause")}
                  className="p-1.5 rounded bg-zinc-700 hover:bg-amber-600/20 text-zinc-400 hover:text-amber-400 transition-colors"
                  title="Pause"
                >
                  <Pause size={12} />
                </button>
              )}
              {task.status === "paused" && (
                <button
                  onClick={() => handleAction(task.id, "resume")}
                  className="p-1.5 rounded bg-zinc-700 hover:bg-emerald-600/20 text-zinc-400 hover:text-emerald-400 transition-colors"
                  title="Resume"
                >
                  <Play size={12} />
                </button>
              )}
              <button
                onClick={() => handleDelete(task.id)}
                className="p-1.5 rounded bg-zinc-700 hover:bg-red-600/20 text-zinc-400 hover:text-red-400 transition-colors"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
