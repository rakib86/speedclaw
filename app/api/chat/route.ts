import { NextRequest } from "next/server";
import { runAgentLoopStreaming } from "@/lib/agent";
import { classifyIntent } from "@/lib/router";
import { runPlannerStreaming } from "@/lib/planner";
import { startScheduler } from "@/lib/scheduler";
import { getSetting } from "@/lib/db";
import * as db from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { PlannerTimeline } from "@/lib/types";

// Start the scheduler on first API call
let schedulerStarted = false;
function ensureScheduler() {
  if (!schedulerStarted) {
    startScheduler();
    schedulerStarted = true;
  }
}

/**
 * Helper: get the executor model (falls back to default_model).
 */
function getExecutorModel(): string | undefined {
  return (
    getSetting("executor_model") || getSetting("default_model") || undefined
  );
}

/**
 * Helper: emit an SSE event to the stream.
 */
function emitSSE(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: Record<string, unknown>,
) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

export async function POST(request: NextRequest) {
  ensureScheduler();

  const body = await request.json();
  const { message, conversationId, model: modelOverride } = body;

  if (!message) {
    return new Response(JSON.stringify({ error: "Message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const convId = conversationId || uuidv4();

  // Create a ReadableStream for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ==========================================================
        // STAGE 1: ROUTER — classify intent
        // ==========================================================
        let taskType: string;
        try {
          const classification = await classifyIntent(message);
          taskType = classification.taskType;
        } catch (err) {
          console.warn("[Pipeline] Router failed, defaulting to COMPLEX_REASONING:", err);
          taskType = "COMPLEX_REASONING";
        }

        emitSSE(controller, encoder, {
          type: "router_result",
          data: taskType,
          payload: { taskType },
        });

        // For SIMPLE_QA, skip the planner and go directly to the executor
        // (no need for a multi-step plan for simple questions)
        if (taskType === "SIMPLE_QA") {
          await runDirectExecution(controller, encoder, convId, message, modelOverride);
          return;
        }

        // ==========================================================
        // STAGE 2: PLANNER — stream reasoning + generate timeline
        // ==========================================================
        let timeline: PlannerTimeline | null = null;
        try {
          timeline = await runPlannerStreaming({
            message,
            taskType: taskType as import("@/lib/types").TaskType,
            onReasoning: (text) => {
              emitSSE(controller, encoder, {
                type: "reasoning",
                data: text,
              });
            },
            onTimeline: (tl) => {
              emitSSE(controller, encoder, {
                type: "timeline",
                data: JSON.stringify(tl),
                payload: tl,
              });
            },
          });
        } catch (err) {
          console.warn("[Pipeline] Planner failed, falling back to direct execution:", err);
        }

        // SAFETY: If planner failed or returned empty timeline, fall back to old behavior
        if (!timeline || timeline.steps.length === 0) {
          console.info("[Pipeline] No timeline produced, running direct execution fallback.");
          await runDirectExecution(controller, encoder, convId, message, modelOverride);
          return;
        }

        // ==========================================================
        // STAGE 3: EXECUTOR — run agent loop per step
        // ==========================================================
        // Ensure conversation exists and save user message ONCE before executing steps
        let convo = db.getConversation(convId);
        if (!convo) {
          const title =
            message.slice(0, 50) + (message.length > 50 ? "..." : "");
          db.createConversation(convId, title);
        }
        db.addMessage(convId, "user", message);

        const executorModel = modelOverride || getExecutorModel();

        for (const step of timeline.steps) {
          // Emit step_start event so the frontend can highlight the current step
          emitSSE(controller, encoder, {
            type: "step_start",
            data: step.title,
            payload: { stepId: step.id, title: step.title },
          });

          // Build the user message for this step — the agent will see the
          // original user message + step context injected via system prompt
          const stepMessage =
            step.action === "final_answer"
              ? `Based on the information gathered above, provide a comprehensive final answer to the user's original request: "${message}"`
              : `Execute step ${step.id}: ${step.title} — ${step.description}`;

          let retryCount = 0;
          const MAX_RETRIES = 1;

          while (retryCount <= MAX_RETRIES) {
            try {
              await runAgentLoopStreaming(
                convId,
                stepMessage,
                (event) => {
                  emitSSE(controller, encoder, event);
                },
                {
                  stepId: step.id,
                  stepTitle: step.title,
                  stepContext: step.description,
                  modelOverride: executorModel,
                },
              );
              break; // Success — move to next step
            } catch (err) {
              retryCount++;
              if (retryCount > MAX_RETRIES) {
                // SAFETY: Retry exhausted — emit error and continue to next step
                console.error(`[Pipeline] Step ${step.id} failed after retry:`, err);
                emitSSE(controller, encoder, {
                  type: "error",
                  data: `Step ${step.id} ("${step.title}") failed: ${err instanceof Error ? err.message : "Unknown error"}. Continuing...`,
                });
                break;
              }
              console.warn(`[Pipeline] Step ${step.id} failed, retrying (${retryCount}/${MAX_RETRIES}):`, err);
            }
          }
        }
      } catch (error) {
        const errorEvent = JSON.stringify({
          type: "error",
          data: error instanceof Error ? error.message : "Unknown error",
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
      } finally {
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Fallback: run the old direct execution path (no planner, no step mode).
 * Used when:
 *  - Task type is SIMPLE_QA
 *  - Planner fails
 *  - Timeline has 0 steps
 */
async function runDirectExecution(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  convId: string,
  message: string,
  modelOverride?: string,
) {
  await runAgentLoopStreaming(
    convId,
    message,
    (event) => {
      emitSSE(controller, encoder, event);
    },
    modelOverride ? { modelOverride } : undefined,
  );
}
