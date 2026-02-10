import type { ToolDefinition, ToolExecutionResult } from "../types";
import fs from "fs";
import path from "path";

const MEMORY_PATH = path.join(process.cwd(), "memory.md");

export const readMemoryDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "read_memory",
    description:
      "Read the persistent memory file. Use this to recall information the user asked you to remember.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

export const writeMemoryDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "write_memory",
    description:
      "Update the persistent memory file. Use this when the user asks you to remember something. You can append new information or rewrite sections.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "The new content for the memory file (full replacement). Include all existing content you want to keep plus new additions.",
        },
      },
      required: ["content"],
    },
  },
};

export function getMemoryContent(): string {
  try {
    if (fs.existsSync(MEMORY_PATH)) {
      return fs.readFileSync(MEMORY_PATH, "utf-8");
    }
  } catch {
    /* ignore */
  }
  return "(No memory stored yet)";
}

export async function readMemory(
  _args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const content = getMemoryContent();
  return { success: true, result: content };
}

export async function writeMemory(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const content = args.content as string;
  if (!content) {
    return { success: false, result: "Content is required" };
  }

  try {
    fs.writeFileSync(MEMORY_PATH, content, "utf-8");
    return { success: true, result: "Memory updated successfully." };
  } catch (error) {
    return {
      success: false,
      result: `Failed to write memory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
