import type {
  ToolDefinition,
  ToolExecutor,
  RegisteredTool,
  ToolExecutionResult,
} from "../types";
import { braveWebSearch, braveSearchDefinition } from "./brave-search";
import {
  browserOpen,
  browserScreenshot,
  browserClick,
  browserFill,
  browserExtractText,
  browserClose,
  browserOpenDefinition,
  browserScreenshotDefinition,
  browserClickDefinition,
  browserFillDefinition,
  browserExtractTextDefinition,
  browserCloseDefinition,
} from "./browser";
import {
  scheduleTask,
  listTasksTool,
  cancelTask,
  pauseTask,
  resumeTask,
  scheduleTaskDefinition,
  listTasksDefinition,
  cancelTaskDefinition,
  pauseTaskDefinition,
  resumeTaskDefinition,
} from "./scheduler";
import {
  readMemory,
  writeMemory,
  readMemoryDefinition,
  writeMemoryDefinition,
} from "./memory";
import { httpRequest, httpRequestDefinition } from "./http";

const toolRegistry = new Map<string, RegisteredTool>();

function register(definition: ToolDefinition, executor: ToolExecutor) {
  toolRegistry.set(definition.function.name, { definition, executor });
}

// Register all tools
register(braveSearchDefinition, braveWebSearch);
register(browserOpenDefinition, browserOpen);
register(browserScreenshotDefinition, browserScreenshot);
register(browserClickDefinition, browserClick);
register(browserFillDefinition, browserFill);
register(browserExtractTextDefinition, browserExtractText);
register(browserCloseDefinition, browserClose);
register(scheduleTaskDefinition, scheduleTask);
register(listTasksDefinition, listTasksTool);
register(cancelTaskDefinition, cancelTask);
register(pauseTaskDefinition, pauseTask);
register(resumeTaskDefinition, resumeTask);
register(readMemoryDefinition, readMemory);
register(writeMemoryDefinition, writeMemory);
register(httpRequestDefinition, httpRequest);

export function getAllToolDefinitions(): ToolDefinition[] {
  return Array.from(toolRegistry.values()).map((t) => t.definition);
}

export async function executeTool(
  name: string,
  argsJson: string,
): Promise<ToolExecutionResult> {
  const tool = toolRegistry.get(name);
  if (!tool) {
    return { success: false, result: `Unknown tool: ${name}` };
  }

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return {
      success: false,
      result: `Invalid tool arguments JSON: ${argsJson}`,
    };
  }

  try {
    return await tool.executor(args);
  } catch (error) {
    return {
      success: false,
      result: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
