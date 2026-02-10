import type { ToolDefinition, ToolExecutionResult } from "../types";
import { getSetting } from "../db";

export const braveSearchDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "brave_web_search",
    description:
      "Search the web using Brave Search API. Use this for finding current information, facts, news, URLs, or any real-time data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
        count: {
          type: "number",
          description: "Number of results to return (default 5, max 20)",
        },
      },
      required: ["query"],
    },
  },
};

export async function braveWebSearch(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const query = args.query as string;
  const count = Math.min((args.count as number) || 5, 20);

  const apiKey = getSetting("brave_api_key") || process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      result: "Brave Search API key not configured. Please set it in Settings.",
    };
  }

  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        result: `Brave Search error (${response.status}): ${errText}`,
      };
    }

    const data = await response.json();
    const results = data.web?.results || [];

    if (results.length === 0) {
      return { success: true, result: "No search results found." };
    }

    const formatted = results
      .map(
        (r: { title: string; url: string; description: string }, i: number) =>
          `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.description}`,
      )
      .join("\n\n");

    return {
      success: true,
      result: `Search results for "${query}":\n\n${formatted}`,
    };
  } catch (error) {
    return {
      success: false,
      result: `Brave Search error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
