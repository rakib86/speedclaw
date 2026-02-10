import type {
  Message,
  ToolDefinition,
  ToolCall,
  OpenRouterStreamChunk,
} from "./types";
import { getSetting } from "./db";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const COPILOT_CHAT_URL = "https://models.github.ai/inference/chat/completions";
const COPILOT_MODELS_URL = "https://models.github.ai/catalog/models";

function getApiKey(): string {
  return (
    getSetting("openrouter_api_key") || process.env.OPENROUTER_API_KEY || ""
  );
}

function getOllamaUrl(): string {
  return (
    getSetting("ollama_url") ||
    process.env.OLLAMA_URL ||
    "http://localhost:11434"
  );
}

function isOllamaModel(model: string): boolean {
  return model.startsWith("ollama/");
}

function getOllamaModelName(model: string): string {
  return model.replace(/^ollama\//, "");
}

// --- GitHub Copilot (GitHub Models API) helpers ---

function isCopilotModel(model: string): boolean {
  return model.startsWith("copilot/");
}

function getCopilotModelName(model: string): string {
  // copilot/openai/gpt-4.1 → openai/gpt-4.1
  return model.replace(/^copilot\//, "");
}

function getCopilotToken(): string {
  return getSetting("github_pat") || "";
}

function isCopilotEnabled(): boolean {
  return getSetting("copilot_enabled") === "true" && !!getCopilotToken();
}

// Models that do NOT support tool/function calling
const NO_TOOL_SUPPORT_PATTERNS = [
  "deepseek-r1",
  "deepseek/deepseek-r1",
  "perplexity",
  "o1-mini",
  "o1-preview",
  "o3-mini",
  "qwen/qwen3-235b-a22b:free",
];

function modelSupportsTools(model: string): boolean {
  if (isOllamaModel(model)) return false;
  // Copilot models generally support tool calling (OpenAI-compatible API)
  if (isCopilotModel(model)) return true;
  const lower = model.toLowerCase();
  return !NO_TOOL_SUPPORT_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

function getDefaultModel(): string {
  return (
    getSetting("default_model") ||
    process.env.DEFAULT_MODEL ||
    "arcee-ai/trinity-large-preview:free"
  );
}

export function getModel(): string {
  return getDefaultModel();
}

interface StreamCallbacks {
  onToken: (token: string) => void;
  onReasoning: (token: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onDone: (message: {
    role: "assistant";
    content: string | null;
    tool_calls: ToolCall[] | null;
  }) => void;
  onError: (error: string) => void;
}

export async function callOpenRouterStream(params: {
  model?: string;
  messages: Array<{
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }>;
  tools?: ToolDefinition[];
  callbacks: StreamCallbacks;
}) {
  const apiKey = getApiKey();
  const model = params.model || getDefaultModel();
  const useOllama = isOllamaModel(model);
  const useCopilot = isCopilotModel(model);

  if (!useOllama && !useCopilot && !apiKey) {
    params.callbacks.onError(
      "OpenRouter API key not configured. Please set it in Settings.",
    );
    return;
  }

  if (useCopilot && !getCopilotToken()) {
    params.callbacks.onError(
      "GitHub PAT not configured. Please set it in Settings and enable Copilot.",
    );
    return;
  }

  const actualModel = useOllama
    ? getOllamaModelName(model)
    : useCopilot
      ? getCopilotModelName(model)
      : model;
  const apiUrl = useOllama
    ? `${getOllamaUrl()}/v1/chat/completions`
    : useCopilot
      ? COPILOT_CHAT_URL
      : OPENROUTER_URL;
  const canUseTools = modelSupportsTools(model);

  const body: Record<string, unknown> = {
    model: actualModel,
    messages: params.messages
      .filter((m) => canUseTools || (m.role !== "tool" && !m.tool_calls))
      .map((m) => {
        const msg: Record<string, unknown> = {
          role: m.role,
          content: m.content,
        };
        if (canUseTools && m.tool_calls) msg.tool_calls = m.tool_calls;
        if (canUseTools && m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
    stream: true,
    max_tokens: 2048,
  };

  if (canUseTools && params.tools && params.tools.length > 0) {
    body.tools = params.tools;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (useCopilot) {
    headers["Authorization"] = `Bearer ${getCopilotToken()}`;
  } else if (!useOllama) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "NexusAgent";
  }

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const provider = useCopilot ? "GitHub Models" : useOllama ? "Ollama" : "OpenRouter";
    params.callbacks.onError(
      `Network error calling ${provider}: ${err}`,
    );
    return;
  }

  // If we got a 404 about tool use, retry without tools
  if (!response.ok) {
    const errorText = await response.text();
    if (
      response.status === 404 &&
      errorText.includes("tool use") &&
      body.tools
    ) {
      console.warn(
        `[OpenRouter] Model ${model} does not support tools, retrying without tools...`,
      );
      delete body.tools;
      body.messages = params.messages
        .filter((m) => m.role !== "tool" && !m.tool_calls)
        .map((m) => ({ role: m.role, content: m.content }));
      try {
        response = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      } catch (err) {
        params.callbacks.onError(`Network error on retry: ${err}`);
        return;
      }
      if (!response.ok) {
        const retryError = await response.text();
        params.callbacks.onError(
          `OpenRouter error (${response.status}): ${retryError}`,
        );
        return;
      }
    } else {
      params.callbacks.onError(
        `OpenRouter error (${response.status}): ${errorText}`,
      );
      return;
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    params.callbacks.onError("No response stream from OpenRouter");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let insideThinkTag = false;
  const toolCallsMap = new Map<
    number,
    { id: string; type: string; name: string; arguments: string }
  >();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        let chunk: OpenRouterStreamChunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Handle reasoning/thinking tokens (dedicated field from OpenRouter)
        if (delta.reasoning) {
          params.callbacks.onReasoning(delta.reasoning);
        }

        // Handle content tokens — also detect <think> tags inline
        if (delta.content) {
          let text = delta.content;

          // Check for <think> open tag
          if (text.includes("<think>")) {
            insideThinkTag = true;
            text = text.replace("<think>", "");
          }

          // Check for </think> close tag
          if (text.includes("</think>")) {
            insideThinkTag = false;
            const parts = text.split("</think>");
            // Everything before </think> is still thinking
            if (parts[0]) {
              params.callbacks.onReasoning(parts[0]);
            }
            // Everything after </think> is content
            const afterThink = parts.slice(1).join("</think>");
            if (afterThink) {
              fullContent += afterThink;
              params.callbacks.onToken(afterThink);
            }
            continue;
          }

          if (insideThinkTag) {
            params.callbacks.onReasoning(text);
          } else {
            fullContent += text;
            params.callbacks.onToken(text);
          }
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallsMap.has(idx)) {
              toolCallsMap.set(idx, {
                id: tc.id || "",
                type: tc.type || "function",
                name: tc.function?.name || "",
                arguments: "",
              });
            }
            const existing = toolCallsMap.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments)
              existing.arguments += tc.function.arguments;
          }
        }

        // Check for finish
        if (
          choice.finish_reason === "tool_calls" ||
          choice.finish_reason === "stop"
        ) {
          // done processing
        }
      }
    }
  } catch (err) {
    params.callbacks.onError(`Stream reading error: ${err}`);
    return;
  }

  // Build final tool calls array
  const toolCalls: ToolCall[] = [];
  for (const [, tc] of toolCallsMap) {
    const toolCall: ToolCall = {
      id: tc.id,
      type: "function",
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    };
    toolCalls.push(toolCall);
    params.callbacks.onToolCall(toolCall);
  }

  params.callbacks.onDone({
    role: "assistant",
    content: fullContent || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : null,
  });
}

// Non-streaming call for background tasks
export async function callOpenRouter(params: {
  model?: string;
  messages: Array<{
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }>;
  tools?: ToolDefinition[];
}): Promise<{
  role: "assistant";
  content: string | null;
  tool_calls: ToolCall[] | null;
}> {
  const apiKey = getApiKey();
  const model = params.model || getDefaultModel();
  const useOllama = isOllamaModel(model);
  const useCopilot = isCopilotModel(model);

  if (!useOllama && !useCopilot && !apiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  if (useCopilot && !getCopilotToken()) {
    throw new Error("GitHub PAT not configured. Enable Copilot in Settings.");
  }

  const actualModel = useOllama
    ? getOllamaModelName(model)
    : useCopilot
      ? getCopilotModelName(model)
      : model;
  const apiUrl = useOllama
    ? `${getOllamaUrl()}/v1/chat/completions`
    : useCopilot
      ? COPILOT_CHAT_URL
      : OPENROUTER_URL;
  const canUseTools = modelSupportsTools(model);

  const body: Record<string, unknown> = {
    model: actualModel,
    messages: params.messages
      .filter((m) => canUseTools || (m.role !== "tool" && !m.tool_calls))
      .map((m) => {
        const msg: Record<string, unknown> = {
          role: m.role,
          content: m.content,
        };
        if (canUseTools && m.tool_calls) msg.tool_calls = m.tool_calls;
        if (canUseTools && m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
    max_tokens: 2048,
  };

  if (canUseTools && params.tools && params.tools.length > 0) {
    body.tools = params.tools;
  }

  const headers2: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (useCopilot) {
    headers2["Authorization"] = `Bearer ${getCopilotToken()}`;
  } else if (!useOllama) {
    headers2["Authorization"] = `Bearer ${apiKey}`;
    headers2["HTTP-Referer"] = "http://localhost:3000";
    headers2["X-Title"] = "NexusAgent";
  }

  let response = await fetch(apiUrl, {
    method: "POST",
    headers: headers2,
    body: JSON.stringify(body),
  });

  // If we got a 404 about tool use, retry without tools
  if (!response.ok) {
    const errorText = await response.text();
    if (
      response.status === 404 &&
      errorText.includes("tool use") &&
      body.tools
    ) {
      console.warn(
        `[OpenRouter] Model ${model} does not support tools, retrying without tools...`,
      );
      delete body.tools;
      body.messages = params.messages
        .filter((m) => m.role !== "tool" && !m.tool_calls)
        .map((m) => ({ role: m.role, content: m.content }));
      response = await fetch(apiUrl, {
        method: "POST",
        headers: headers2,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const retryError = await response.text();
        throw new Error(`OpenRouter error (${response.status}): ${retryError}`);
      }
    } else {
      throw new Error(`OpenRouter error (${response.status}): ${errorText}`);
    }
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  return {
    role: "assistant",
    content: choice?.message?.content || null,
    tool_calls: choice?.message?.tool_calls || null,
  };
}

// Fetch available models from OpenRouter + Ollama + GitHub Copilot
export async function fetchModels(): Promise<
  Array<{ id: string; name: string; context_length: number }>
> {
  const models: Array<{ id: string; name: string; context_length: number }> =
    [];

  // Fetch from Ollama
  try {
    const ollamaUrl = getOllamaUrl();
    const ollamaRes = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (ollamaRes.ok) {
      const ollamaData = await ollamaRes.json();
      for (const m of ollamaData.models || []) {
        models.push({
          id: `ollama/${m.name}`,
          name: `🖥️ ${m.name} (Local)`,
          context_length: 0,
        });
      }
    }
  } catch {
    /* Ollama not running, skip */
  }

  // Fetch from GitHub Copilot (GitHub Models API)
  if (isCopilotEnabled()) {
    try {
      const copilotRes = await fetch(COPILOT_MODELS_URL, {
        headers: {
          Authorization: `Bearer ${getCopilotToken()}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (copilotRes.ok) {
        const copilotData = await copilotRes.json();
        // The catalog returns an array of model objects
        const catalog = Array.isArray(copilotData)
          ? copilotData
          : copilotData.data || copilotData.models || [];
        for (const m of catalog) {
          const modelId = m.id || `${m.publisher}/${m.name}`;
          models.push({
            id: `copilot/${modelId}`,
            name: `⚡ ${m.friendly_name || m.name || modelId} (GitHub)`,
            context_length: m.limits?.max_input_tokens || m.max_input_tokens || 0,
          });
        }
      }
    } catch {
      /* GitHub Models API not reachable, skip */
    }
  }

  // Fetch from OpenRouter
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      for (const m of data.data || []) {
        models.push({
          id: m.id as string,
          name: (m.name || m.id) as string,
          context_length: (m.context_length || 0) as number,
        });
      }
    }
  } catch {
    /* ignore */
  }

  return models;
}
