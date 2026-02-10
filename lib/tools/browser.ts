import type { ToolDefinition, ToolExecutionResult } from "../types";
import { chromium, Browser, Page } from "playwright";

let browser: Browser | null = null;
let page: Page | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const IDLE_TIMEOUT = 60000; // 1 minute

async function ensureBrowser(): Promise<Page> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    page = await context.newPage();
  }
  if (!page || page.isClosed()) {
    const context = browser.contexts()[0] || (await browser.newContext());
    page = await context.newPage();
  }
  resetIdleTimer();
  return page;
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
    browser = null;
    page = null;
  }, IDLE_TIMEOUT);
}

export async function closeBrowser() {
  if (idleTimer) clearTimeout(idleTimer);
  try {
    await browser?.close();
  } catch {
    /* ignore */
  }
  browser = null;
  page = null;
}

// ===== Tool Definitions =====

export const browserOpenDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "browser_open",
    description:
      "Open a URL in a headless browser and get the page content. Returns the page title, URL, and text content.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
  },
};

export const browserScreenshotDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "browser_screenshot",
    description:
      "Take a screenshot of the current browser page. Returns description of what is visible.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

export const browserClickDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "browser_click",
    description: "Click an element on the page by CSS selector or text content",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "CSS selector or text content to click (e.g., 'button.submit' or 'text=Sign In')",
        },
      },
      required: ["selector"],
    },
  },
};

export const browserFillDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "browser_fill",
    description: "Fill a form field on the current page",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the input element",
        },
        value: {
          type: "string",
          description: "Text to type into the field",
        },
      },
      required: ["selector", "value"],
    },
  },
};

export const browserExtractTextDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "browser_extract_text",
    description:
      "Extract text content from the current page or a specific element",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "Optional CSS selector. If omitted, extracts full page text.",
        },
      },
    },
  },
};

export const browserCloseDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "browser_close",
    description: "Close the current browser session to free resources",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

// ===== Tool Executors =====

export async function browserOpen(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const url = args.url as string;
  if (!url) {
    return { success: false, result: "URL is required" };
  }

  try {
    const p = await ensureBrowser();
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait a bit for dynamic content
    await p.waitForTimeout(2000);
    const title = await p.title();
    let text = "";
    try {
      text = await p.innerText("body");
    } catch {
      text = await p.content();
    }
    // Truncate to avoid blowing up the context
    const truncated = text.slice(0, 5000);
    const hasMore = text.length > 5000;

    return {
      success: true,
      result: `Page: ${title}\nURL: ${p.url()}\n\nContent (${hasMore ? "first 5000 chars" : "full"}):\n${truncated}${hasMore ? "\n\n[Content truncated. Use browser_extract_text with a specific selector to get more specific content.]" : ""}`,
    };
  } catch (error) {
    return {
      success: false,
      result: `Failed to open ${url}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function browserScreenshot(
  _args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  try {
    const p = await ensureBrowser();
    const screenshotBuffer = await p.screenshot({
      type: "png",
      fullPage: false,
    });
    const base64 = screenshotBuffer.toString("base64");

    // Save screenshot to disk as a fallback
    const fs = require("fs");
    const path = require("path");
    const screenshotDir = path.join(process.cwd(), "store", "screenshots");
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const filename = `screenshot-${Date.now()}.png`;
    const filepath = path.join(screenshotDir, filename);
    fs.writeFileSync(filepath, screenshotBuffer);

    return {
      success: true,
      result: `Screenshot saved to ${filepath}. The page title is "${await p.title()}" at URL ${p.url()}. Screenshot is ${Math.round(screenshotBuffer.length / 1024)}KB.`,
    };
  } catch (error) {
    return {
      success: false,
      result: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function browserClick(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const selector = args.selector as string;
  if (!selector) {
    return { success: false, result: "Selector is required" };
  }

  try {
    const p = await ensureBrowser();

    // Try CSS selector first, then text-based
    try {
      await p.click(selector, { timeout: 5000 });
    } catch {
      // Try text-based click
      await p.click(`text=${selector}`, { timeout: 5000 });
    }

    await p.waitForTimeout(1500);
    const title = await p.title();
    return {
      success: true,
      result: `Clicked "${selector}". Current page: ${title} (${p.url()})`,
    };
  } catch (error) {
    return {
      success: false,
      result: `Click failed for "${selector}": ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function browserFill(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const selector = args.selector as string;
  const value = args.value as string;
  if (!selector || value === undefined) {
    return { success: false, result: "Selector and value are required" };
  }

  try {
    const p = await ensureBrowser();
    await p.fill(selector, value, { timeout: 5000 });
    return {
      success: true,
      result: `Filled "${selector}" with "${value}"`,
    };
  } catch (error) {
    return {
      success: false,
      result: `Fill failed for "${selector}": ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function browserExtractText(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const selector = args.selector as string | undefined;

  try {
    const p = await ensureBrowser();
    let text: string;

    if (selector) {
      text = await p.innerText(selector, { timeout: 5000 });
    } else {
      text = await p.innerText("body");
    }

    const truncated = text.slice(0, 8000);
    const hasMore = text.length > 8000;

    return {
      success: true,
      result: `${truncated}${hasMore ? "\n\n[Content truncated at 8000 chars]" : ""}`,
    };
  } catch (error) {
    return {
      success: false,
      result: `Text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function browserClose(
  _args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  await closeBrowser();
  return { success: true, result: "Browser session closed." };
}
