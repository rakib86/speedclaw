"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, ChevronDown } from "lucide-react";
import MessageBubble from "./MessageBubble";
import PipelineActivityLog, {
  type PipelineLogEntry,
  type PipelineToolActivity,
} from "./PipelineActivityLog";
import { v4 as uuidv4 } from "uuid";

interface ToolUse {
  toolName: string;
  toolArgs?: string;
  toolResult?: string;
  isActive?: boolean;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolUses?: ToolUse[];
  isStreaming?: boolean;
}

interface ChatAreaProps {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
}

export default function ChatArea({
  conversationId,
  onConversationCreated,
}: ChatAreaProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Pipeline Activity Log state ---
  const [pipelineLogEntries, setPipelineLogEntries] = useState<PipelineLogEntry[]>([]);
  const [pipelineActive, setPipelineActive] = useState(false);

  // --- Inline model picker state (for Copilot) ---
  const [copilotEnabled, setCopilotEnabled] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  // Load existing messages when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      // Reset pipeline state when switching conversations
      setPipelineLogEntries([]);
      setPipelineActive(false);
      return;
    }

    // Don't reload messages if we're currently streaming (new chat was just created)
    if (isLoading) return;

    const loadMessages = async () => {
      try {
        const res = await fetch(
          `/api/messages?conversationId=${conversationId}`,
        );
        if (res.ok) {
          const data = await res.json();
          // Convert DB messages to display messages
          const displayMsgs: DisplayMessage[] = [];
          let currentAssistantMsg: DisplayMessage | null = null;

          for (const msg of data) {
            if (msg.role === "user") {
              displayMsgs.push({
                id: String(msg.id),
                role: "user",
                content: msg.content || "",
              });
              currentAssistantMsg = null;
            } else if (msg.role === "assistant") {
              currentAssistantMsg = {
                id: String(msg.id),
                role: "assistant",
                content: msg.content || "",
                toolUses: [],
              };
              // If the message has tool_calls, we'll pair them with tool results
              if (msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                  currentAssistantMsg.toolUses!.push({
                    toolName: tc.function.name,
                    toolArgs: tc.function.arguments,
                    isActive: false,
                  });
                }
              }
              displayMsgs.push(currentAssistantMsg);
            } else if (msg.role === "tool") {
              // Attach tool result to the last assistant message's tool use
              if (currentAssistantMsg && currentAssistantMsg.toolUses) {
                const toolUse = currentAssistantMsg.toolUses.find(
                  (t) => !t.toolResult,
                );
                if (toolUse) {
                  toolUse.toolResult = msg.content || "";
                }
              }
            }
          }

          setMessages(displayMsgs);
        }
      } catch {
        /* ignore */
      }
    };

    loadMessages();
  }, [conversationId, isLoading]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Load copilot state and models
  useEffect(() => {
    const loadCopilotState = async () => {
      try {
        const settingsRes = await fetch("/api/settings");
        if (!settingsRes.ok) return;
        const settings = await settingsRes.json();
        const enabled = settings.copilot_enabled === "true" && !!settings.github_pat;
        setCopilotEnabled(enabled);

        if (enabled) {
          const modelsRes = await fetch("/api/models");
          if (modelsRes.ok) {
            const allModels = await modelsRes.json();
            const copilotModels = allModels.filter((m: { id: string }) => m.id.startsWith("copilot/"));
            setAvailableModels(copilotModels);
          }
        }
      } catch {
        /* ignore */
      }
    };
    loadCopilotState();
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const convId = conversationId || uuidv4();
    if (!conversationId) {
      onConversationCreated(convId);
    }

    setInput("");
    setIsLoading(true);
    // Reset pipeline state for new message
    setPipelineLogEntries([]);
    setPipelineActive(true);

    // Add user message
    const userMsg: DisplayMessage = {
      id: uuidv4(),
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Create streaming assistant message
    const assistantMsgId = uuidv4();
    const assistantMsg: DisplayMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      toolUses: [],
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId: convId,
          ...(selectedModel ? { model: selectedModel } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream reader");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;
          const data = trimmedLine.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);

            // --- Pipeline Activity Log events ---
            if (event.type === "router_result") {
              const taskType = event.payload?.taskType || event.data;
              setPipelineLogEntries((prev) => [
                ...prev,
                {
                  id: `router-${Date.now()}`,
                  type: "router" as const,
                  timestamp: Date.now(),
                  taskType,
                },
              ]);
            } else if (event.type === "reasoning") {
              // Append to message thinking field (for MessageBubble)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, thinking: (m.thinking || "") + event.data }
                    : m,
                ),
              );
              // Also append to the planning log entry
              setPipelineLogEntries((prev) => {
                const planningIdx = prev.findIndex((e) => e.type === "planning");
                if (planningIdx === -1) {
                  // Create a new planning entry
                  return [
                    ...prev,
                    {
                      id: `planning-${Date.now()}`,
                      type: "planning" as const,
                      timestamp: Date.now(),
                      reasoningText: event.data,
                      isReasoningStreaming: true,
                    },
                  ];
                }
                // Append to existing
                const updated = [...prev];
                updated[planningIdx] = {
                  ...updated[planningIdx],
                  reasoningText: (updated[planningIdx].reasoningText || "") + event.data,
                };
                return updated;
              });
            } else if (event.type === "timeline") {
              // Mark planning as done
              setPipelineLogEntries((prev) => {
                const updated = prev.map((e) =>
                  e.type === "planning" ? { ...e, isReasoningStreaming: false } : e,
                );
                // Parse step list
                let steps: Array<{ id: number; title: string; action: string; description: string }> = [];
                try {
                  const tl =
                    typeof event.payload === "object"
                      ? event.payload
                      : JSON.parse(event.data);
                  if (tl?.steps) steps = tl.steps;
                } catch {
                  /* ignore */
                }
                return [
                  ...updated,
                  {
                    id: `timeline-${Date.now()}`,
                    type: "timeline" as const,
                    timestamp: Date.now(),
                    steps,
                  },
                ];
              });
            } else if (event.type === "step_start") {
              const stepId = event.payload?.stepId;
              const stepTitle = event.payload?.title || event.data;
              setPipelineLogEntries((prev) => {
                // Mark previous active step_start as done
                const updated = prev.map((e) => {
                  if (e.type === "step_start" && !prev.some((d) => d.type === "step_done" && d.stepId === e.stepId)) {
                    // This is the previously active step — add step_done before inserting new step_start
                  }
                  return e;
                });
                // Insert step_done for previous step if exists
                const prevActiveStep = updated.find(
                  (e) => e.type === "step_start" && !updated.some((d) => d.type === "step_done" && d.stepId === e.stepId),
                );
                const withDone = prevActiveStep
                  ? [
                      ...updated,
                      {
                        id: `step-done-${prevActiveStep.stepId}-${Date.now()}`,
                        type: "step_done" as const,
                        timestamp: Date.now(),
                        stepId: prevActiveStep.stepId,
                      },
                    ]
                  : updated;

                return [
                  ...withDone,
                  {
                    id: `step-${stepId}-${Date.now()}`,
                    type: "step_start" as const,
                    timestamp: Date.now(),
                    stepId,
                    stepTitle,
                    toolActivities: [],
                  },
                ];
              });
            } else if (event.type === "token") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + event.data }
                    : m,
                ),
              );
            } else if (event.type === "tool_start") {
              // Add to message toolUses (for ActivityTimeline in MessageBubble)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolUses: [
                          ...(m.toolUses || []),
                          {
                            toolName: event.toolName || event.data,
                            toolArgs: event.toolArgs,
                            isActive: true,
                          },
                        ],
                      }
                    : m,
                ),
              );
              // Also add to the current active step in the pipeline log
              setPipelineLogEntries((prev) => {
                const updated = [...prev];
                // Find the last step_start that has no matching step_done
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (
                    updated[i].type === "step_start" &&
                    !updated.some((d) => d.type === "step_done" && d.stepId === updated[i].stepId)
                  ) {
                    updated[i] = {
                      ...updated[i],
                      toolActivities: [
                        ...(updated[i].toolActivities || []),
                        {
                          toolName: event.toolName || event.data,
                          toolArgs: event.toolArgs,
                          isActive: true,
                        },
                      ],
                    };
                    break;
                  }
                }
                return updated;
              });
            } else if (event.type === "tool_end") {
              // Update message toolUses
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMsgId) return m;
                  const toolUses = [...(m.toolUses || [])];
                  const lastActive = [...toolUses]
                    .reverse()
                    .find((t) => t.isActive);
                  if (lastActive) {
                    lastActive.toolResult = event.data;
                    lastActive.isActive = false;
                  }
                  return { ...m, toolUses };
                }),
              );
              // Also update in pipeline log
              setPipelineLogEntries((prev) => {
                const updated = [...prev];
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].type === "step_start" && updated[i].toolActivities) {
                    const tools = [...(updated[i].toolActivities || [])];
                    const lastActiveTool = [...tools].reverse().find((t) => t.isActive);
                    if (lastActiveTool) {
                      lastActiveTool.toolResult = event.data;
                      lastActiveTool.isActive = false;
                      updated[i] = { ...updated[i], toolActivities: tools };
                      break;
                    }
                  }
                }
                return updated;
              });
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: m.content + `\n\n⚠️ Error: ${event.data}`,
                        isStreaming: false,
                      }
                    : m,
                ),
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
                ),
              );
              // Mark any remaining active step as done, add pipeline complete entry
              setPipelineLogEntries((prev) => {
                const lastActiveStep = prev.find(
                  (e) => e.type === "step_start" && !prev.some((d) => d.type === "step_done" && d.stepId === e.stepId),
                );
                const withDone = lastActiveStep
                  ? [
                      ...prev,
                      {
                        id: `step-done-${lastActiveStep.stepId}-${Date.now()}`,
                        type: "step_done" as const,
                        timestamp: Date.now(),
                        stepId: lastActiveStep.stepId,
                      },
                    ]
                  : prev;
                // Only add "done" entry if we had pipeline entries (not direct execution)
                if (withDone.length > 0 && withDone.some((e) => e.type === "router")) {
                  return [
                    ...withDone,
                    {
                      id: `done-${Date.now()}`,
                      type: "done" as const,
                      timestamp: Date.now(),
                    },
                  ];
                }
                return withDone;
              });
              setPipelineActive(false);
            }
          } catch {
            /* ignore malformed events */
          }
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: `⚠️ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                isStreaming: false,
              }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
      // Mark streaming done
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
        ),
      );
    }
  }, [input, isLoading, conversationId, onConversationCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-4">⚡</div>
              <h2 className="text-2xl font-bold text-white mb-2">NexusAgent</h2>
              <p className="text-zinc-400 max-w-md">
                Your personal AI assistant. I can search the web, browse
                websites, schedule tasks, and remember things for you.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 max-w-lg mx-auto">
                {[
                  "Search for the latest tech news",
                  "Go to github.com and find trending repos",
                  "Schedule a daily morning briefing at 8am",
                  "Remember that my favorite language is TypeScript",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      textareaRef.current?.focus();
                    }}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto py-4">
            {/* --- Pipeline Activity Log --- */}
            {pipelineLogEntries.length > 0 && (
              <div className="mb-4 px-4">
                <PipelineActivityLog
                  entries={pipelineLogEntries}
                  isActive={pipelineActive}
                />
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                thinking={msg.thinking}
                toolUses={msg.toolUses}
                isStreaming={msg.isStreaming}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Copilot inline model picker */}
          {copilotEnabled && availableModels.length > 0 && (
            <div className="relative mb-2">
              <button
                onClick={() => setModelPickerOpen(!modelPickerOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-300 transition-colors"
              >
                <span className="text-purple-400 font-medium">
                  {selectedModel
                    ? selectedModel.replace("copilot/", "")
                    : "Default model"}
                </span>
                <ChevronDown size={12} className="text-zinc-500" />
              </button>
              {modelPickerOpen && (
                <div className="absolute bottom-full left-0 mb-1 w-72 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50">
                  <button
                    onClick={() => {
                      setSelectedModel("");
                      setModelPickerOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-700 transition-colors ${
                      !selectedModel ? "text-emerald-400 bg-zinc-700/50" : "text-zinc-300"
                    }`}
                  >
                    Default model (from settings)
                  </button>
                  {availableModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelectedModel(m.id);
                        setModelPickerOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-700 transition-colors ${
                        selectedModel === m.id ? "text-emerald-400 bg-zinc-700/50" : "text-zinc-300"
                      }`}
                    >
                      <span className="text-purple-400 mr-1">GH</span>
                      {m.id.replace("copilot/", "")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-end gap-2 bg-zinc-900 rounded-2xl border border-zinc-800 px-4 py-3 focus-within:border-emerald-600 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message NexusAgent..."
              rows={1}
              className="flex-1 bg-transparent outline-none text-white placeholder-zinc-500 text-sm resize-none max-h-[200px]"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="shrink-0 p-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white transition-colors"
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
          <p className="text-xs text-zinc-600 text-center mt-2">
            NexusAgent can browse the web, search, and schedule tasks. Powered
            by OpenRouter.
          </p>
        </div>
      </div>
    </div>
  );
}
