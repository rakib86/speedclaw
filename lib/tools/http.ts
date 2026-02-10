import type { ToolDefinition, ToolExecutionResult } from "../types";

export const httpRequestDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "http_request",
    description:
      "Make an HTTP request to any URL. Use this for calling APIs (REST, webhooks, bot APIs like Telegram, Discord, Slack, etc.). Returns the response body as text.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL to send the request to",
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          description: "HTTP method (default: GET)",
        },
        headers: {
          type: "string",
          description:
            'JSON string of headers, e.g. \'{"Content-Type": "application/json", "Authorization": "Bearer xxx"}\'',
        },
        body: {
          type: "string",
          description:
            "Request body as a string. For JSON APIs, pass a JSON string.",
        },
      },
      required: ["url"],
    },
  },
};

export async function httpRequest(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const url = args.url as string;
  const method = ((args.method as string) || "GET").toUpperCase();
  const headersStr = args.headers as string | undefined;
  const body = args.body as string | undefined;

  if (!url) {
    return { success: false, result: "URL is required" };
  }

  // Parse headers
  let headers: Record<string, string> = {};
  if (headersStr) {
    try {
      headers = JSON.parse(headersStr);
    } catch {
      return { success: false, result: `Invalid headers JSON: ${headersStr}` };
    }
  }

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30000), // 30s timeout
    };

    if (body && method !== "GET" && method !== "HEAD") {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);
    const responseText = await response.text();

    // Truncate very large responses
    const truncated =
      responseText.length > 10000
        ? responseText.slice(0, 10000) + "\n... (truncated)"
        : responseText;

    if (!response.ok) {
      return {
        success: false,
        result: `HTTP ${response.status} ${response.statusText}\n\n${truncated}`,
      };
    }

    return {
      success: true,
      result: `HTTP ${response.status} ${response.statusText}\n\n${truncated}`,
    };
  } catch (error) {
    return {
      success: false,
      result: `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
