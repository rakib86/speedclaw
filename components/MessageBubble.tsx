"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import ActivityTimeline from "./ActivityTimeline";
import { User, Bot, ChevronDown, ChevronRight, Brain } from "lucide-react";

interface ToolUse {
  toolName: string;
  toolArgs?: string;
  toolResult?: string;
  isActive?: boolean;
}

interface MessageBubbleProps {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  thinking?: string;
  toolUses?: ToolUse[];
  isStreaming?: boolean;
}

export default function MessageBubble({
  role,
  content,
  thinking,
  toolUses,
  isStreaming,
}: MessageBubbleProps) {
  const [thinkingExpanded, setThinkingExpanded] = useState(true);
  const isThinkingActive = isStreaming && !content && !!thinking;

  // Auto-expand when new reasoning starts streaming in
  useEffect(() => {
    if (thinking && isStreaming) {
      setThinkingExpanded(true);
    }
  }, [thinking, isStreaming]);

  if (role === "tool" || role === "system") return null;

  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 py-4 px-4",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 mt-1">
          <Bot size={16} className="text-white" />
        </div>
      )}

      <div className={cn("max-w-[75%] space-y-1", isUser && "order-first")}>
        {/* Activity timeline for tool usage */}
        {toolUses && toolUses.length > 0 && (
          <ActivityTimeline steps={toolUses} isStreaming={isStreaming} />
        )}

        {/* Thinking/reasoning block */}
        {thinking && (
          <div className={cn(
            "rounded-xl border overflow-hidden transition-colors duration-300",
            isThinkingActive
              ? "border-violet-500/40 bg-violet-950/30"
              : "border-zinc-800 bg-zinc-900/50"
          )}>
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            >
              <Brain
                size={14}
                className={cn(
                  "text-violet-400",
                  isThinkingActive && "animate-pulse"
                )}
              />
              <span className="font-medium">
                {isThinkingActive ? (
                  <span className="flex items-center gap-1.5">
                    Reasoning
                    <span className="inline-flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  </span>
                ) : (
                  "Reasoning"
                )}
              </span>
              <span className="ml-auto">
                {thinkingExpanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </span>
            </button>
            <div
              className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                thinkingExpanded ? "max-h-125 opacity-100" : "max-h-0 opacity-0"
              )}
            >
              <div className="px-3 pb-3 text-xs text-zinc-400 leading-relaxed overflow-y-auto max-h-115 border-t border-zinc-800/50">
                <div className="pt-2 whitespace-pre-wrap font-mono">
                  {thinking}
                  {isThinkingActive && (
                    <span className="inline-block w-1.5 h-3 bg-violet-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Message content */}
        {content && (
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-sm leading-relaxed",
              isUser
                ? "bg-emerald-600 text-white rounded-br-md"
                : "bg-zinc-800 text-zinc-100 rounded-bl-md",
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{content}</p>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-2 prose-code:text-emerald-300 prose-a:text-emerald-400">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-1" />
                )}
              </div>
            )}
          </div>
        )}

        {/* Streaming indicator when only thinking (no content yet) */}
        {isThinkingActive && !thinkingExpanded && (
          <div className="flex items-center gap-2 px-3 py-1 text-xs text-zinc-500">
            <span className="flex gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </span>
            <span className="text-violet-400/70">Processing in background...</span>
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 mt-1">
          <User size={16} className="text-zinc-300" />
        </div>
      )}
    </div>
  );
}
