/**
 * Router — lightweight intent classifier for the planner-executor pipeline.
 *
 * This is the first stage of the 3-layer architecture:
 *   Router → Planner → Executor
 *
 * It classifies the user's message into a task type so the planner can
 * decide how many steps are needed and which tools to use.
 */

export type TaskType =
  | "SIMPLE_QA"
  | "TOOL_TASK"
  | "RESEARCH_TASK"
  | "COMPLEX_REASONING"
  | "LONG_RUNNING";

const TOOL_KEYWORDS = [
  "send",
  "schedule",
  "post",
  "create task",
  "remind",
  "telegram",
  "discord",
  "slack",
  "webhook",
  "http request",
  "api call",
  "set a reminder",
  "cancel task",
  "pause task",
  "resume task",
  "remember",
  "save to memory",
];

const RESEARCH_KEYWORDS = [
  "search",
  "find",
  "latest",
  "news",
  "price",
  "look up",
  "browse",
  "open the page",
  "go to",
  "visit",
  "what is the current",
  "who won",
  "trending",
];

const LONG_RUNNING_KEYWORDS = [
  "monitor",
  "every day",
  "every hour",
  "every minute",
  "recurring",
  "keep checking",
  "daily",
  "weekly",
  "cron",
];

/**
 * Classify user intent using keyword heuristics.
 * This is intentionally lightweight — no LLM call needed.
 * Can be upgraded to an LLM-based classifier later.
 */
export async function classifyIntent(
  message: string,
): Promise<{ taskType: TaskType }> {
  const lower = message.toLowerCase().trim();

  // Check long-running first (it's a superset of TOOL_TASK)
  for (const keyword of LONG_RUNNING_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { taskType: "LONG_RUNNING" };
    }
  }

  // Check tool-calling tasks
  for (const keyword of TOOL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { taskType: "TOOL_TASK" };
    }
  }

  // Check research tasks
  for (const keyword of RESEARCH_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { taskType: "RESEARCH_TASK" };
    }
  }

  // Short question-like messages → simple QA
  const isQuestion =
    lower.endsWith("?") ||
    lower.startsWith("what") ||
    lower.startsWith("who") ||
    lower.startsWith("how") ||
    lower.startsWith("why") ||
    lower.startsWith("when") ||
    lower.startsWith("where") ||
    lower.startsWith("is ") ||
    lower.startsWith("are ") ||
    lower.startsWith("can ") ||
    lower.startsWith("does ") ||
    lower.startsWith("do ");

  if (message.length < 120 && isQuestion) {
    return { taskType: "SIMPLE_QA" };
  }

  // Default: complex reasoning
  return { taskType: "COMPLEX_REASONING" };
}
