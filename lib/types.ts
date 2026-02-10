// ===== OpenRouter / Chat Types =====

export interface Message {
  id?: number;
  conversation_id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[] | null;
  tool_call_id?: string | null;
  created_at?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: string;
          description?: string;
          enum?: string[];
          default?: unknown;
        }
      >;
      required?: string[];
    };
  };
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledTask {
  id: number;
  conversation_id: string | null;
  prompt: string;
  schedule_type: "cron" | "once" | "interval";
  schedule_value: string;
  status: "active" | "paused" | "completed" | "error";
  notify: boolean;
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  created_at: string;
}

export interface TaskRunLog {
  id: number;
  task_id: number;
  run_at: string;
  duration_ms: number;
  status: "success" | "error";
  result: string | null;
  error: string | null;
}

export interface Settings {
  key: string;
  value: string;
}

// ===== Pipeline Types (Router → Planner → Executor) =====

export type TaskType =
  | "SIMPLE_QA"
  | "TOOL_TASK"
  | "RESEARCH_TASK"
  | "COMPLEX_REASONING"
  | "LONG_RUNNING";

export type PlannerStepAction =
  | "search"
  | "browse"
  | "http"
  | "schedule"
  | "memory"
  | "final_answer";

export interface PlannerStep {
  id: number;
  title: string;
  action: PlannerStepAction;
  description: string;
}

export interface PlannerTimeline {
  steps: PlannerStep[];
}

// ===== Streaming Types =====

export interface StreamEvent {
  type:
    | "token"
    | "tool_start"
    | "tool_end"
    | "done"
    | "error"
    // New pipeline events
    | "router_result"
    | "reasoning"
    | "timeline"
    | "step_start";
  data: string;
  toolName?: string;
  toolArgs?: string;
  toolResult?: string;
  // New pipeline payloads (serialized as JSON in data field)
  payload?: unknown;
}

// ===== OpenRouter API Types =====

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
  }>;
  tools?: ToolDefinition[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface OpenRouterChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string | null;
}

export interface OpenRouterResponse {
  id: string;
  choices: OpenRouterChoice[];
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterStreamDelta {
  role?: string;
  content?: string | null;
  reasoning?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

export interface OpenRouterStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: OpenRouterStreamDelta;
    finish_reason: string | null;
  }>;
}

// ===== Tool Execution Types =====

export interface ToolExecutionResult {
  success: boolean;
  result: string;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
) => Promise<ToolExecutionResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}
