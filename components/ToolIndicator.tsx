"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Globe,
  Clock,
  Brain,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolIndicatorProps {
  toolName: string;
  toolArgs?: string;
  toolResult?: string;
  isActive?: boolean;
}

const TOOL_ICONS: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  brave_web_search: {
    icon: <Search size={14} />,
    label: "Searching the web",
    color: "text-blue-400",
  },
  browser_open: {
    icon: <Globe size={14} />,
    label: "Opening page",
    color: "text-green-400",
  },
  browser_screenshot: {
    icon: <Globe size={14} />,
    label: "Taking screenshot",
    color: "text-green-400",
  },
  browser_click: {
    icon: <Globe size={14} />,
    label: "Clicking element",
    color: "text-green-400",
  },
  browser_fill: {
    icon: <Globe size={14} />,
    label: "Filling form",
    color: "text-green-400",
  },
  browser_extract_text: {
    icon: <Globe size={14} />,
    label: "Extracting text",
    color: "text-green-400",
  },
  browser_close: {
    icon: <Globe size={14} />,
    label: "Closing browser",
    color: "text-green-400",
  },
  schedule_task: {
    icon: <Clock size={14} />,
    label: "Scheduling task",
    color: "text-amber-400",
  },
  list_tasks: {
    icon: <Clock size={14} />,
    label: "Listing tasks",
    color: "text-amber-400",
  },
  cancel_task: {
    icon: <Clock size={14} />,
    label: "Cancelling task",
    color: "text-amber-400",
  },
  pause_task: {
    icon: <Clock size={14} />,
    label: "Pausing task",
    color: "text-amber-400",
  },
  resume_task: {
    icon: <Clock size={14} />,
    label: "Resuming task",
    color: "text-amber-400",
  },
  read_memory: {
    icon: <Brain size={14} />,
    label: "Reading memory",
    color: "text-purple-400",
  },
  write_memory: {
    icon: <Brain size={14} />,
    label: "Updating memory",
    color: "text-purple-400",
  },
};

export default function ToolIndicator({
  toolName,
  toolArgs,
  toolResult,
  isActive,
}: ToolIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  const toolInfo = TOOL_ICONS[toolName] || {
    icon: <Terminal size={14} />,
    label: toolName,
    color: "text-zinc-400",
  };

  let parsedArgs = "";
  if (toolArgs) {
    try {
      const args = JSON.parse(toolArgs);
      parsedArgs = Object.entries(args)
        .map(
          ([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
        )
        .join(", ");
    } catch {
      parsedArgs = toolArgs;
    }
  }

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
          isActive
            ? "bg-zinc-800 border border-zinc-700 animate-pulse"
            : "bg-zinc-800/50 border border-zinc-800 hover:border-zinc-700",
        )}
      >
        <span className={toolInfo.color}>{toolInfo.icon}</span>
        <span className={cn(toolInfo.color)}>
          {isActive ? `${toolInfo.label}...` : toolInfo.label}
        </span>
        {parsedArgs && (
          <span className="text-zinc-500 truncate max-w-[200px]">
            ({parsedArgs})
          </span>
        )}
        {toolResult &&
          (expanded ? (
            <ChevronDown size={12} className="text-zinc-500" />
          ) : (
            <ChevronRight size={12} className="text-zinc-500" />
          ))}
      </button>
      {expanded && toolResult && (
        <div className="mt-1 ml-4 p-2 rounded-lg bg-zinc-800/50 border border-zinc-800 text-xs text-zinc-400 max-h-48 overflow-y-auto whitespace-pre-wrap">
          {toolResult}
        </div>
      )}
    </div>
  );
}
