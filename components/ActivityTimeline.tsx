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
  Clock,
  Brain,
  Terminal,
  ChevronDown,
  ChevronRight,
  Send,
  CheckCircle2,
  Loader2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolStep {
  toolName: string;
  toolArgs?: string;
  toolResult?: string;
  isActive?: boolean;
}

interface ActivityTimelineProps {
  steps: ToolStep[];
  isStreaming?: boolean;
}

const TOOL_META: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  brave_web_search: {
    icon: <Search size={12} />,
    label: "Searching the web",
    color: "text-blue-400",
  },
  browser_open: {
    icon: <Globe size={12} />,
    label: "Opening page",
    color: "text-green-400",
  },
  browser_screenshot: {
    icon: <Globe size={12} />,
    label: "Taking screenshot",
    color: "text-green-400",
  },
  browser_click: {
    icon: <Globe size={12} />,
    label: "Clicking element",
    color: "text-green-400",
  },
  browser_fill: {
    icon: <Globe size={12} />,
    label: "Filling form",
    color: "text-green-400",
  },
  browser_extract_text: {
    icon: <Globe size={12} />,
    label: "Extracting text",
    color: "text-green-400",
  },
  browser_close: {
    icon: <Globe size={12} />,
    label: "Closing browser",
    color: "text-green-400",
  },
  schedule_task: {
    icon: <Clock size={12} />,
    label: "Scheduling task",
    color: "text-amber-400",
  },
  list_tasks: {
    icon: <Clock size={12} />,
    label: "Listing tasks",
    color: "text-amber-400",
  },
  cancel_task: {
    icon: <Clock size={12} />,
    label: "Cancelling task",
    color: "text-amber-400",
  },
  pause_task: {
    icon: <Clock size={12} />,
    label: "Pausing task",
    color: "text-amber-400",
  },
  resume_task: {
    icon: <Clock size={12} />,
    label: "Resuming task",
    color: "text-amber-400",
  },
  read_memory: {
    icon: <Brain size={12} />,
    label: "Reading memory",
    color: "text-violet-400",
  },
  write_memory: {
    icon: <Brain size={12} />,
    label: "Updating memory",
    color: "text-violet-400",
  },
  http_request: {
    icon: <Send size={12} />,
    label: "Making API call",
    color: "text-cyan-400",
  },
};

function getToolMeta(toolName: string) {
  return (
    TOOL_META[toolName] || {
      icon: <Terminal size={12} />,
      label: toolName,
      color: "text-zinc-400",
    }
  );
}

function parseArgs(toolArgs?: string): string {
  if (!toolArgs) return "";
  try {
    const args = JSON.parse(toolArgs);
    // Show the most relevant arg value
    if (args.query) return args.query;
    if (args.url) return args.url;
    if (args.prompt) return args.prompt.slice(0, 60);
    if (args.content) return args.content.slice(0, 60);
    if (args.selector) return args.selector;
    const vals = Object.values(args).filter(
      (v) => typeof v === "string",
    ) as string[];
    return vals[0]?.slice(0, 60) || "";
  } catch {
    return "";
  }
}

export default function ActivityTimeline({
  steps,
  isStreaming,
}: ActivityTimelineProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (steps.length === 0) return null;

  // Calculate the active step index (1-based for the Timeline component)
  const completedCount = steps.filter(
    (s) => !s.isActive && s.toolResult !== undefined,
  ).length;
  const activeValue = completedCount + 1;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 my-1">
      <Timeline value={activeValue}>
        {steps.map((step, i) => {
          const meta = getToolMeta(step.toolName);
          const stepNum = i + 1;
          const isCompleted = !step.isActive && step.toolResult !== undefined;
          const isActive = step.isActive;
          const argSummary = parseArgs(step.toolArgs);
          const isExpanded = expandedStep === i;

          return (
            <TimelineItem key={i} step={stepNum} className="!pb-4 last:!pb-0">
              <TimelineHeader className="flex items-start gap-0">
                <TimelineSeparator
                  className={cn(
                    isCompleted && "!bg-emerald-500/40",
                    isActive && "!bg-zinc-700",
                  )}
                />
                <TimelineIndicator
                  className={cn(
                    "!size-5 flex items-center justify-center !border-0",
                    isCompleted && "!bg-emerald-500/20",
                    isActive && "!bg-zinc-700 animate-pulse",
                    !isCompleted && !isActive && "!bg-zinc-800",
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={12} className="text-emerald-400" />
                  ) : isActive ? (
                    <Loader2
                      size={12}
                      className="text-emerald-400 animate-spin"
                    />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-zinc-600" />
                  )}
                </TimelineIndicator>
                <div className="flex-1 min-w-0 ml-1">
                  <TimelineTitle
                    className={cn(
                      "flex items-center gap-1.5 !text-xs !font-medium",
                      isCompleted && "text-zinc-300",
                      isActive && "text-white",
                      !isCompleted && !isActive && "text-zinc-500",
                    )}
                  >
                    <span className={meta.color}>{meta.icon}</span>
                    <span>{meta.label}</span>
                    {isActive && (
                      <span className="text-zinc-500 text-[10px] font-normal ml-1">
                        running...
                      </span>
                    )}
                  </TimelineTitle>
                </div>
              </TimelineHeader>

              <TimelineContent className="!mt-1 pl-1">
                {/* Active skeleton */}
                {isActive && (
                  <div className="space-y-1.5 mt-1">
                    {argSummary && (
                      <p className="text-[11px] text-zinc-500 truncate">
                        {argSummary}
                      </p>
                    )}
                    <div className="space-y-1">
                      <div className="h-2 w-3/4 rounded bg-zinc-800 animate-pulse" />
                      <div
                        className="h-2 w-1/2 rounded bg-zinc-800 animate-pulse"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="h-2 w-2/3 rounded bg-zinc-800 animate-pulse"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                )}

                {/* Completed — show arg summary + clickable result */}
                {isCompleted && (
                  <div className="mt-0.5">
                    {argSummary && (
                      <p className="text-[11px] text-zinc-500 truncate">
                        {argSummary}
                      </p>
                    )}
                    {step.toolResult && (
                      <button
                        onClick={() => setExpandedStep(isExpanded ? null : i)}
                        className="flex items-center gap-1 mt-1 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown size={10} />
                        ) : (
                          <ChevronRight size={10} />
                        )}
                        <span>
                          {isExpanded ? "Hide result" : "View result"}
                        </span>
                      </button>
                    )}
                    {isExpanded && step.toolResult && (
                      <div className="mt-1.5 p-2 rounded-lg bg-zinc-800/60 border border-zinc-800 text-[11px] text-zinc-400 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                        {step.toolResult.slice(0, 2000)}
                      </div>
                    )}
                  </div>
                )}
              </TimelineContent>
            </TimelineItem>
          );
        })}

        {/* "Generating response" step at the end when all tools are done but still streaming */}
        {isStreaming && steps.length > 0 && steps.every((s) => !s.isActive) && (
          <TimelineItem step={steps.length + 1} className="!pb-0">
            <TimelineHeader className="flex items-start gap-0">
              <TimelineSeparator className="!bg-zinc-700" />
              <TimelineIndicator className="!size-5 flex items-center justify-center !border-0 !bg-zinc-700 animate-pulse">
                <Zap size={12} className="text-emerald-400 animate-pulse" />
              </TimelineIndicator>
              <div className="flex-1 min-w-0 ml-1">
                <TimelineTitle className="flex items-center gap-1.5 !text-xs !font-medium text-white">
                  <Zap size={12} className="text-emerald-400" />
                  <span>Generating response</span>
                  <span className="text-zinc-500 text-[10px] font-normal ml-1">
                    writing...
                  </span>
                </TimelineTitle>
              </div>
            </TimelineHeader>
            <TimelineContent className="!mt-1 pl-1">
              <div className="space-y-1 mt-1">
                <div className="h-2 w-2/3 rounded bg-zinc-800 animate-pulse" />
                <div
                  className="h-2 w-1/2 rounded bg-zinc-800 animate-pulse"
                  style={{ animationDelay: "150ms" }}
                />
              </div>
            </TimelineContent>
          </TimelineItem>
        )}
      </Timeline>
    </div>
  );
}
