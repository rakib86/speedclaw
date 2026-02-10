import { callOpenRouterStream, callOpenRouter, getModel } from "./openrouter";
import { getAllToolDefinitions, executeTool } from "./tools/index";
import { getMemoryContent } from "./tools/memory";
import { getSkillsPrompt } from "./skills";
import * as db from "./db";
import type { ToolCall } from "./types";

const MAX_TOOL_LOOPS = 15;

/**
 * Options for step-scoped execution in the planner-executor pipeline.
 * When provided, the agent loop runs in "step mode" — it injects
 * step context into the system prompt so the LLM focuses on one step at a time.
 */
export interface StepExecutionOptions {
  stepId?: number;
  stepTitle?: string;
  stepContext?: string;
  /** Override the model used for this execution (e.g. executor_model). */
  modelOverride?: string;
}

function buildSystemPrompt(stepOptions?: StepExecutionOptions): string {
  const now = new Date().toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const memory = getMemoryContent();
  const skills = getSkillsPrompt();

  return `You are NexusAgent, a personal AI assistant with the ability to browse the web, search for information, schedule tasks, and call external APIs.

Current date/time: ${now}

## Your Memory
${memory}

## Capabilities
- Search the web using Brave Search (brave_web_search)
- Browse any website (browser_open, browser_click, browser_fill, browser_extract_text, browser_screenshot, browser_close)
- Schedule tasks to run later: one-time, recurring via cron, or at intervals (schedule_task)
- Manage scheduled tasks (list_tasks, pause_task, resume_task, cancel_task)
- Read and update your persistent memory (read_memory, write_memory)
- Make HTTP requests to any API — REST, webhooks, bot APIs like Telegram, Discord, Slack, etc. (http_request)
${skills}

## Guidelines
- When asked to find live/current information, use brave_web_search or browser tools
- When asked to browse a specific site, use browser_open then extract what's needed
- When asked to schedule something, use schedule_task with the right schedule_type
- When asked to remember something, first read_memory, then write_memory with the updated content
- Always show your work — tell the user what you're doing ("Let me search for that...", "Opening the page...")
- For browsing: open page → extract text/screenshot → close browser. Don't leave browsers open unnecessarily.
- Be concise but thorough in your answers.
- Use markdown formatting for readability.

## CRITICAL: Scheduling Rules
Pay very close attention to whether the user wants a ONE-TIME or RECURRING action:

### ONE-TIME (schedule_type: "once")
Use "once" when the user says things like:
- "after 1 minute", "in 5 minutes", "in 2 hours"
- "at 3pm", "at 8:00 tomorrow", "on Friday at noon"
- "again after 1 min" — this means ONCE more, not recurring
- "remind me in 30 minutes"
- "do X later", "do X at <specific time>"
For "once", the schedule_value must be an ISO timestamp. Calculate it from the current date/time.
Example: If current time is 2026-02-09T18:30:00, and user says "after 1 min", set schedule_value to "2026-02-09T18:31:00.000Z".

### RECURRING (schedule_type: "interval")
Use "interval" ONLY when the user explicitly says:
- "every 5 minutes", "every hour", "every 30 seconds"
- "repeatedly", "keep doing this"
For "interval", schedule_value is milliseconds (e.g. "60000" = 1 minute, "300000" = 5 minutes).

### RECURRING CRON (schedule_type: "cron")
Use "cron" ONLY when the user explicitly says:
- "every day at 8am", "every Monday", "weekly", "daily", "monthly"
- "at 9am every weekday"
For "cron", schedule_value is a cron expression (e.g. "0 8 * * *" = daily at 8am).

### Key rule: When in doubt, default to "once". Words like "after", "in", "at", "again" almost always mean one-time.`

  // --- Step mode injection (planner-executor pipeline) ---
  // When running as part of a planned timeline, inject the current step context
  // so the LLM focuses on completing just this step.
  + (stepOptions?.stepContext
    ? `\n\n## CURRENT EXECUTION STEP
STEP ${stepOptions.stepId ?? "?"}: ${stepOptions.stepTitle ?? ""}
GOAL OF THIS STEP: ${stepOptions.stepContext}

Focus ONLY on completing this specific step. Be concise and action-oriented.`
    : "");
}

// Streaming agent loop (for real-time chat)
// When options.stepContext is provided, runs in "step mode" for the planner-executor pipeline.
// Otherwise, behaves exactly as before (backward compatible).
export async function runAgentLoopStreaming(
  conversationId: string,
  userMessage: string,
  onEvent: (event: {
    type: string;
    data: string;
    toolName?: string;
    toolArgs?: string;
  }) => void,
  options?: StepExecutionOptions,
): Promise<string> {
  // In step mode, the pipeline already created the conversation and saved the user message.
  // Only do these for normal (non-step) calls.
  if (!options?.stepContext) {
    // Ensure conversation exists
    let convo = db.getConversation(conversationId);
    if (!convo) {
      // Auto-generate title from first 50 chars of user message
      const title =
        userMessage.slice(0, 50) + (userMessage.length > 50 ? "..." : "");
      db.createConversation(conversationId, title);
    }

    // Save user message
    db.addMessage(conversationId, "user", userMessage);
  }

  // Build messages array
  // Pass step options so system prompt includes step context when in step mode
  const systemPrompt = buildSystemPrompt(options);
  const dbMessages = db.getMessages(conversationId);

  const messages: Array<{
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }> = [{ role: "system", content: systemPrompt }];

  // Add conversation history (limit to last 50 messages to avoid context overflow)
  const recentMessages = dbMessages.slice(-50);
  for (const msg of recentMessages) {
    const m: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
      tool_call_id?: string;
    } = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.tool_calls) m.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
    messages.push(m);
  }

  const tools = getAllToolDefinitions();
  // Use model override from step options (executor_model) if provided
  const model = options?.modelOverride || getModel();
  let finalResponse = "";
  let loopCount = 0;

  while (loopCount < MAX_TOOL_LOOPS) {
    loopCount++;

    const assistantMessage = await new Promise<{
      role: "assistant";
      content: string | null;
      tool_calls: ToolCall[] | null;
    }>((resolve, reject) => {
      callOpenRouterStream({
        model,
        messages,
        tools,
        callbacks: {
          onToken: (token) => {
            onEvent({ type: "token", data: token });
          },
          onReasoning: (token) => {
            onEvent({ type: "reasoning", data: token });
          },
          onToolCall: (toolCall) => {
            onEvent({
              type: "tool_start",
              data: toolCall.function.name,
              toolName: toolCall.function.name,
              toolArgs: toolCall.function.arguments,
            });
          },
          onDone: (msg) => resolve(msg),
          onError: (err) => reject(new Error(err)),
        },
      });
    });

    // Save assistant message
    db.addMessage(
      conversationId,
      "assistant",
      assistantMessage.content,
      assistantMessage.tool_calls,
      null,
    );

    messages.push({
      role: "assistant",
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls || undefined,
    });

    // If there are tool calls, execute them
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        const result = await executeTool(
          toolCall.function.name,
          toolCall.function.arguments,
        );

        onEvent({
          type: "tool_end",
          data: result.result,
          toolName: toolCall.function.name,
        });

        // Save tool result
        db.addMessage(conversationId, "tool", result.result, null, toolCall.id);

        messages.push({
          role: "tool",
          content: result.result,
          tool_call_id: toolCall.id,
        });
      }
      // Continue the loop for the next LLM response
      continue;
    }

    // No tool calls — final response
    finalResponse = assistantMessage.content || "";
    break;
  }

  if (loopCount >= MAX_TOOL_LOOPS) {
    const msg = "\n\n[Reached maximum tool call limit. Stopping here.]";
    onEvent({ type: "token", data: msg });
    finalResponse += msg;
  }

  onEvent({ type: "done", data: finalResponse });
  return finalResponse;
}

// Non-streaming agent loop (for scheduled tasks)
export async function runAgentLoop(
  conversationId: string,
  prompt: string,
): Promise<string> {
  // Ensure conversation exists
  let convo = db.getConversation(conversationId);
  if (!convo) {
    db.createConversation(conversationId, `Task: ${prompt.slice(0, 40)}`);
  }

  db.addMessage(conversationId, "user", prompt);

  const systemPrompt = buildSystemPrompt();
  const dbMessages = db.getMessages(conversationId);

  const messages: Array<{
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }> = [{ role: "system", content: systemPrompt }];

  const recentMessages = dbMessages.slice(-50);
  for (const msg of recentMessages) {
    const m: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
      tool_call_id?: string;
    } = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.tool_calls) m.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
    messages.push(m);
  }

  const tools = getAllToolDefinitions();
  let finalResponse = "";
  let loopCount = 0;

  while (loopCount < MAX_TOOL_LOOPS) {
    loopCount++;

    const assistantMessage = await callOpenRouter({
      model: getModel(),
      messages,
      tools,
    });

    db.addMessage(
      conversationId,
      "assistant",
      assistantMessage.content,
      assistantMessage.tool_calls,
      null,
    );

    messages.push({
      role: "assistant",
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls || undefined,
    });

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      for (const toolCall of assistantMessage.tool_calls) {
        const result = await executeTool(
          toolCall.function.name,
          toolCall.function.arguments,
        );

        db.addMessage(conversationId, "tool", result.result, null, toolCall.id);
        messages.push({
          role: "tool",
          content: result.result,
          tool_call_id: toolCall.id,
        });
      }
      continue;
    }

    finalResponse = assistantMessage.content || "";
    break;
  }

  return finalResponse;
}
