/**
 * Planner — reasoning + timeline generator for the planner-executor pipeline.
 *
 * This is the second stage of the 3-layer architecture:
 *   Router → Planner → Executor
 *
 * It streams reasoning (thinking) to the frontend, then produces a structured
 * timeline of steps for the executor to run.
 */

import { callOpenRouterStream } from "./openrouter";
import { getSetting } from "./db";
import type { PlannerStep, PlannerTimeline, TaskType } from "./types";

const PLANNER_SYSTEM_PROMPT = `You are a concise, structured reasoning planner.
First, think step-by-step (stream this as <think> tags).
Then produce a JSON timeline with this exact schema:

{
  "steps": [
    {
      "id": 1,
      "title": "Short step title",
      "action": "search | browse | http | schedule | memory | final_answer",
      "description": "What you will do in this step"
    }
  ]
}

Keep steps between 2 and 6 max.
The last step should almost always be "final_answer" — where you synthesize everything.

Rules:
- "search" = use web search to find information
- "browse" = open a website and extract data
- "http" = make an API call (REST, webhook, bot API)
- "schedule" = create a scheduled/recurring task
- "memory" = read or write persistent memory
- "final_answer" = synthesize and respond to the user

Output ONLY the <think>...</think> block followed by the JSON. No other text.`;

/**
 * Returns the model ID to use for the planner.
 * Falls back to the default model if no planner_model is set.
 */
function getPlannerModel(): string {
  return (
    getSetting("planner_model") ||
    getSetting("default_model") ||
    process.env.DEFAULT_MODEL ||
    "openai/gpt-4.1"
  );
}

export { getPlannerModel };

interface PlannerCallbacks {
  onReasoning: (text: string) => void;
  onTimeline: (timeline: PlannerTimeline) => void;
}

/**
 * Run the planner with streaming reasoning output.
 * Returns the parsed timeline, or null if parsing failed.
 */
export async function runPlannerStreaming({
  message,
  taskType,
  onReasoning,
  onTimeline,
}: {
  message: string;
  taskType: TaskType;
  onReasoning: PlannerCallbacks["onReasoning"];
  onTimeline: PlannerCallbacks["onTimeline"];
}): Promise<PlannerTimeline | null> {
  const model = getPlannerModel();

  const userPrompt = `Task type classified as: ${taskType}

User message: "${message}"

Think step-by-step, then output a JSON timeline.`;

  let fullContent = "";

  try {
    await new Promise<void>((resolve, reject) => {
      callOpenRouterStream({
        model,
        messages: [
          { role: "system", content: PLANNER_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        // No tools for planner — it only reasons and outputs JSON
        callbacks: {
          onToken: (token) => {
            fullContent += token;
          },
          onReasoning: (token) => {
            onReasoning(token);
          },
          onToolCall: () => {
            // Planner should not call tools — ignore
          },
          onDone: () => resolve(),
          onError: (err) => reject(new Error(err)),
        },
      });
    });
  } catch (err) {
    console.error("[Planner] Streaming error:", err);
    return null;
  }

  // Parse the timeline JSON from the content
  const timeline = parseTimeline(fullContent);
  if (timeline) {
    onTimeline(timeline);
  }
  return timeline;
}

/**
 * Extract and parse the JSON timeline from the planner's output.
 * The output may contain reasoning text before/after the JSON block.
 */
function parseTimeline(content: string): PlannerTimeline | null {
  try {
    // Try to find a JSON block in the content
    // Look for { "steps": [...] } pattern
    const jsonMatch = content.match(/\{[\s\S]*"steps"\s*:\s*\[[\s\S]*\]\s*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as PlannerTimeline;
      if (
        parsed.steps &&
        Array.isArray(parsed.steps) &&
        parsed.steps.length > 0
      ) {
        // Validate step structure
        const validSteps = parsed.steps.filter(
          (s) =>
            typeof s.id === "number" &&
            typeof s.title === "string" &&
            typeof s.action === "string" &&
            typeof s.description === "string",
        );
        if (validSteps.length > 0) {
          return { steps: validSteps };
        }
      }
    }
  } catch {
    // JSON parse failed — try harder
  }

  // Fallback: try to find any JSON array that looks like steps
  try {
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const arr = JSON.parse(arrayMatch[0]);
      if (Array.isArray(arr) && arr.length > 0 && arr[0].id && arr[0].title) {
        return { steps: arr };
      }
    }
  } catch {
    // Give up
  }

  console.warn("[Planner] Could not parse timeline from output:", content);
  return null;
}
