"use client";

import { useState } from "react";
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/ui/timeline";
import {
  Search,
  Globe,
  Brain,
  Terminal,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Zap,
  GitBranch,
  ListChecks,
  Play,
  Clock,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ===== Types =====

export type PipelineLogEntryType =
  | "router"
  | "planning"
  | "timeline"
  | "step_start"
  | "step_done"
  | "tool_start"
  | "tool_end"
  | "done";

export interface PipelineToolActivity {
  toolName: string;
  toolArgs?: string;
  toolResult?: string;
  isActive?: boolean;
}

export interface PipelineLogEntry {
  id: string;
  type: PipelineLogEntryType;
  timestamp: number;
  // router
  taskType?: string;
  // planning
  reasoningText?: string;
  isReasoningStreaming?: boolean;
  // timeline
  steps?: Array<{
    id: number;
    title: string;
    action: string;
    description: string;
  }>;
  // step_start / step_done
  stepId?: number;
  stepTitle?: string;
  // tool_start / tool_end (nested under a step)
  toolActivities?: PipelineToolActivity[];
}

interface PipelineActivityLogProps {
  entries: PipelineLogEntry[];
  isActive?: boolean;
}

// ===== Tool display helpers (same as ActivityTimeline) =====

const TOOL_META: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  brave_web_search: {
    icon: <Search size={11} />,
    label: "Web search",
    color: "text-blue-400",
  },
  browser_open: {
    icon: <Globe size={11} />,
    label: "Open page",
    color: "text-green-400",
  },
  browser_screenshot: {
    icon: <Globe size={11} />,
    label: "Screenshot",
    color: "text-green-400",
  },
  browser_click: {
    icon: <Globe size={11} />,
    label: "Click",
    color: "text-green-400",
  },
  browser_fill: {
    icon: <Globe size={11} />,
    label: "Fill form",
    color: "text-green-400",
  },
  browser_extract_text: {
    icon: <Globe size={11} />,
    label: "Extract text",
    color: "text-green-400",
  },
  browser_close: {
    icon: <Globe size={11} />,
    label: "Close browser",
    color: "text-green-400",
  },
  schedule_task: {
    icon: <Clock size={11} />,
    label: "Schedule task",
    color: "text-amber-400",
  },
  list_tasks: {
    icon: <Clock size={11} />,
    label: "List tasks",
    color: "text-amber-400",
  },
  cancel_task: {
    icon: <Clock size={11} />,
    label: "Cancel task",
    color: "text-amber-400",
  },
  read_memory: {
    icon: <Brain size={11} />,
    label: "Read memory",
    color: "text-violet-400",
  },
  write_memory: {
    icon: <Brain size={11} />,
    label: "Write memory",
    color: "text-violet-400",
  },
  http_request: {
    icon: <Send size={11} />,
    label: "API call",
    color: "text-cyan-400",
  },
};

function getToolMeta(toolName: string) {
  return (
    TOOL_META[toolName] || {
      icon: <Terminal size={11} />,
      label: toolName,
      color: "text-zinc-400",
    }
  );
}

// ===== Component =====

export default function PipelineActivityLog({
  entries,
  isActive,
}: PipelineActivityLogProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  if (entries.length === 0) return null;

  // Calculate the active timeline step (1-based)
  const completedEntries = entries.filter(
    (e) => e.type === "router" || e.type === "timeline" || e.type === "step_done" || e.type === "done",
  ).length;
  const activeValue = completedEntries + 1;

  const toggleToolResult = (key: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Merge entries into display groups:
  // We render a vertical timeline with these entry types as steps
  let timelineStep = 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 my-2">
      <div className="flex items-center gap-2 mb-3">
        <GitBranch size={13} className="text-violet-400" />
        <span className="text-xs font-medium text-zinc-300">Pipeline Activity</span>
        {isActive && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <Loader2 size={10} className="animate-spin" />
            running
          </span>
        )}
      </div>

      <Timeline value={activeValue}>
        {entries.map((entry) => {
          timelineStep++;
          const stepNum = timelineStep;

          // --- Router result ---
          if (entry.type === "router") {
            return (
              <TimelineItem key={entry.id} step={stepNum} className="!pb-3 last:!pb-0">
                <TimelineHeader className="flex items-start gap-0">
                  <TimelineSeparator className="!bg-emerald-500/40" />
                  <TimelineIndicator className="!size-5 flex items-center justify-center !border-0 !bg-emerald-500/20">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                  </TimelineIndicator>
                  <div className="flex-1 min-w-0 ml-1">
                    <TimelineTitle className="flex items-center gap-1.5 !text-xs !font-medium text-zinc-300">
                      <Zap size={11} className="text-amber-400" />
                      <span>Router</span>
                      <span className="ml-1 px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 text-[10px] font-semibold">
                        {entry.taskType?.replace(/_/g, " ")}
                      </span>
                    </TimelineTitle>
                  </div>
                </TimelineHeader>
              </TimelineItem>
            );
          }

          // --- Planner reasoning ---
          if (entry.type === "planning") {
            const isComplete = !entry.isReasoningStreaming;
            const text = entry.reasoningText || "";
            const previewLen = 120;
            const hasLongText = text.length > previewLen;

            return (
              <TimelineItem key={entry.id} step={stepNum} className="!pb-3 last:!pb-0">
                <TimelineHeader className="flex items-start gap-0">
                  <TimelineSeparator
                    className={cn(
                      isComplete ? "!bg-emerald-500/40" : "!bg-zinc-700",
                    )}
                  />
                  <TimelineIndicator
                    className={cn(
                      "!size-5 flex items-center justify-center !border-0",
                      isComplete ? "!bg-emerald-500/20" : "!bg-zinc-700 animate-pulse",
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle2 size={12} className="text-emerald-400" />
                    ) : (
                      <Loader2 size={12} className="text-violet-400 animate-spin" />
                    )}
                  </TimelineIndicator>
                  <div className="flex-1 min-w-0 ml-1">
                    <TimelineTitle className="flex items-center gap-1.5 !text-xs !font-medium text-zinc-300">
                      <Brain size={11} className="text-violet-400" />
                      <span>Planning</span>
                      {!isComplete && (
                        <span className="text-zinc-500 text-[10px] font-normal ml-1">
                          thinking...
                        </span>
                      )}
                    </TimelineTitle>
                  </div>
                </TimelineHeader>
                <TimelineContent className="!mt-1 pl-1">
                  {text && (
                    <div className="mt-1">
                      {hasLongText ? (
                        <>
                          <button
                            onClick={() => setReasoningExpanded(!reasoningExpanded)}
                            className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors mb-1"
                          >
                            {reasoningExpanded ? (
                              <ChevronDown size={10} />
                            ) : (
                              <ChevronRight size={10} />
                            )}
                            <span>
                              {reasoningExpanded ? "Collapse reasoning" : "Show reasoning"}
                            </span>
                          </button>
                          {reasoningExpanded && (
                            <div className="p-2 rounded-lg bg-zinc-800/60 border border-zinc-800 text-[11px] text-zinc-500 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                              {text}
                              {!isComplete && (
                                <span className="inline-block w-1.5 h-3 bg-violet-400/60 animate-pulse ml-0.5 align-middle" />
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                          {text}
                          {!isComplete && (
                            <span className="inline-block w-1.5 h-3 bg-violet-400/60 animate-pulse ml-0.5 align-middle" />
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </TimelineContent>
              </TimelineItem>
            );
          }

          // --- Timeline (plan ready) ---
          if (entry.type === "timeline") {
            return (
              <TimelineItem key={entry.id} step={stepNum} className="!pb-3 last:!pb-0">
                <TimelineHeader className="flex items-start gap-0">
                  <TimelineSeparator className="!bg-emerald-500/40" />
                  <TimelineIndicator className="!size-5 flex items-center justify-center !border-0 !bg-emerald-500/20">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                  </TimelineIndicator>
                  <div className="flex-1 min-w-0 ml-1">
                    <TimelineTitle className="flex items-center gap-1.5 !text-xs !font-medium text-zinc-300">
                      <ListChecks size={11} className="text-cyan-400" />
                      <span>Plan</span>
                      <span className="text-zinc-500 text-[10px] font-normal ml-1">
                        {entry.steps?.length || 0} steps
                      </span>
                    </TimelineTitle>
                  </div>
                </TimelineHeader>
                <TimelineContent className="!mt-1 pl-1">
                  {entry.steps && entry.steps.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {entry.steps.map((s, i) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-1.5 text-[11px] text-zinc-500"
                        >
                          <span className="text-zinc-600 font-mono w-3 text-right shrink-0">
                            {i + 1}.
                          </span>
                          <span>{s.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </TimelineContent>
              </TimelineItem>
            );
          }

          // --- Step start (active execution) ---
          if (entry.type === "step_start") {
            // Determine if this step is done: there's a matching step_done entry
            const isDone = entries.some(
              (e) => e.type === "step_done" && e.stepId === entry.stepId,
            );
            const isStepActive = !isDone;

            return (
              <TimelineItem key={entry.id} step={stepNum} className="!pb-3 last:!pb-0">
                <TimelineHeader className="flex items-start gap-0">
                  <TimelineSeparator
                    className={cn(
                      isDone ? "!bg-emerald-500/40" : "!bg-zinc-700",
                    )}
                  />
                  <TimelineIndicator
                    className={cn(
                      "!size-5 flex items-center justify-center !border-0",
                      isDone
                        ? "!bg-emerald-500/20"
                        : "!bg-zinc-700 animate-pulse",
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 size={12} className="text-emerald-400" />
                    ) : (
                      <Play size={12} className="text-emerald-400 animate-pulse" />
                    )}
                  </TimelineIndicator>
                  <div className="flex-1 min-w-0 ml-1">
                    <TimelineTitle
                      className={cn(
                        "flex items-center gap-1.5 !text-xs !font-medium",
                        isDone ? "text-zinc-300" : "text-white",
                      )}
                    >
                      <span className="text-zinc-500 font-mono text-[10px]">
                        Step {entry.stepId}
                      </span>
                      <span>{entry.stepTitle}</span>
                      {isStepActive && (
                        <span className="text-zinc-500 text-[10px] font-normal ml-1">
                          running...
                        </span>
                      )}
                    </TimelineTitle>
                  </div>
                </TimelineHeader>

                {/* Nested tool activities within this step */}
                {entry.toolActivities && entry.toolActivities.length > 0 && (
                  <TimelineContent className="!mt-1.5 pl-2">
                    <div className="space-y-1 border-l border-zinc-800 pl-2">
                      {entry.toolActivities.map((tool, ti) => {
                        const meta = getToolMeta(tool.toolName);
                        const toolKey = `${entry.id}-tool-${ti}`;
                        const isToolDone = !tool.isActive && tool.toolResult !== undefined;
                        const isToolExpanded = expandedTools.has(toolKey);

                        return (
                          <div key={toolKey} className="text-[11px]">
                            <div className="flex items-center gap-1.5">
                              {isToolDone ? (
                                <CheckCircle2 size={10} className="text-emerald-400/70 shrink-0" />
                              ) : tool.isActive ? (
                                <Loader2 size={10} className="text-emerald-400 animate-spin shrink-0" />
                              ) : (
                                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 shrink-0" />
                              )}
                              <span className={meta.color}>{meta.icon}</span>
                              <span
                                className={cn(
                                  isToolDone ? "text-zinc-500" : tool.isActive ? "text-zinc-300" : "text-zinc-500",
                                )}
                              >
                                {meta.label}
                              </span>
                              {tool.isActive && (
                                <span className="text-zinc-600 text-[10px]">running...</span>
                              )}
                            </div>

                            {/* Expandable tool result */}
                            {isToolDone && tool.toolResult && (
                              <>
                                <button
                                  onClick={() => toggleToolResult(toolKey)}
                                  className="flex items-center gap-1 mt-0.5 ml-5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                                >
                                  {isToolExpanded ? (
                                    <ChevronDown size={9} />
                                  ) : (
                                    <ChevronRight size={9} />
                                  )}
                                  <span>
                                    {isToolExpanded ? "Hide" : "Result"}
                                  </span>
                                </button>
                                {isToolExpanded && (
                                  <div className="mt-1 ml-5 p-1.5 rounded bg-zinc-800/60 border border-zinc-800 text-[10px] text-zinc-500 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                                    {tool.toolResult.slice(0, 1500)}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </TimelineContent>
                )}

                {/* Active step loading skeleton when no tool activities yet */}
                {isStepActive && (!entry.toolActivities || entry.toolActivities.length === 0) && (
                  <TimelineContent className="!mt-1 pl-1">
                    <div className="space-y-1 mt-1">
                      <div className="h-1.5 w-2/3 rounded bg-zinc-800 animate-pulse" />
                      <div
                        className="h-1.5 w-1/2 rounded bg-zinc-800 animate-pulse"
                        style={{ animationDelay: "150ms" }}
                      />
                    </div>
                  </TimelineContent>
                )}
              </TimelineItem>
            );
          }

          // --- Done ---
          if (entry.type === "done") {
            return (
              <TimelineItem key={entry.id} step={stepNum} className="!pb-0">
                <TimelineHeader className="flex items-start gap-0">
                  <TimelineSeparator className="!bg-emerald-500/40" />
                  <TimelineIndicator className="!size-5 flex items-center justify-center !border-0 !bg-emerald-500/20">
                    <Zap size={12} className="text-emerald-400" />
                  </TimelineIndicator>
                  <div className="flex-1 min-w-0 ml-1">
                    <TimelineTitle className="flex items-center gap-1.5 !text-xs !font-medium text-emerald-400">
                      <span>Pipeline complete</span>
                    </TimelineTitle>
                  </div>
                </TimelineHeader>
              </TimelineItem>
            );
          }

          // skip step_done entries (they don't render as their own step —
          // we use them to mark step_start entries as complete)
          timelineStep--;
          return null;
        })}
      </Timeline>
    </div>
  );
}
