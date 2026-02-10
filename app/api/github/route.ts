import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

function getClientId(): string {
  return process.env.GITHUB_CLIENT_ID || "";
}

/**
 * POST /api/github
 * Actions: "device_code" | "poll_token" | "logout" | "status"
 *
 * Device Flow:
 *  1. Client calls with { action: "device_code" } → gets user_code + verification_uri
 *  2. User opens verification_uri in browser, enters user_code
 *  3. Client polls with { action: "poll_token", device_code } until token is granted
 *  4. Token is saved to DB as github_pat + copilot_enabled = "true"
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === "device_code") {
    return handleDeviceCode();
  } else if (action === "poll_token") {
    return handlePollToken(body.device_code);
  } else if (action === "logout") {
    return handleLogout();
  } else if (action === "status") {
    return handleStatus();
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** Also support GET for quick status check */
export async function GET() {
  return handleStatus();
}

// --- Step 1: Request a device code ---
async function handleDeviceCode() {
  const clientId = getClientId();
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_CLIENT_ID not configured in environment variables." },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        // Scope: we need access to GitHub Models API
        scope: "",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `GitHub device code request failed: ${errText}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    // Returns: { device_code, user_code, verification_uri, expires_in, interval }
    return NextResponse.json({
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      expires_in: data.expires_in,
      interval: data.interval || 5,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to contact GitHub: ${err}` },
      { status: 500 },
    );
  }
}

// --- Step 2: Poll for the access token ---
async function handlePollToken(deviceCode: string) {
  if (!deviceCode) {
    return NextResponse.json(
      { error: "device_code is required" },
      { status: 400 },
    );
  }

  const clientId = getClientId();
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data = await res.json();

    // GitHub returns different states:
    // - { error: "authorization_pending" } — user hasn't approved yet
    // - { error: "slow_down" } — we're polling too fast
    // - { error: "expired_token" } — device code expired
    // - { access_token, token_type, scope } — success!
    if (data.error) {
      return NextResponse.json({
        status: data.error, // "authorization_pending" | "slow_down" | "expired_token" | etc
        error: data.error_description || data.error,
      });
    }

    if (data.access_token) {
      // Save the token to DB
      db.setSetting("github_pat", data.access_token);
      db.setSetting("copilot_enabled", "true");

      // Fetch the GitHub username for display
      let username = "";
      try {
        const userRes = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          username = userData.login || "";
          if (username) {
            db.setSetting("github_username", username);
          }
        }
      } catch {
        /* ignore — username is optional */
      }

      return NextResponse.json({
        status: "success",
        username,
      });
    }

    return NextResponse.json({
      status: "unknown",
      error: "Unexpected response from GitHub",
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to poll GitHub: ${err}` },
      { status: 500 },
    );
  }
}

// --- Logout: clear GitHub token ---
async function handleLogout() {
  db.setSetting("github_pat", "");
  db.setSetting("copilot_enabled", "false");
  db.setSetting("github_username", "");
  return NextResponse.json({ status: "logged_out" });
}

// --- Status: check if logged in ---
async function handleStatus() {
  const token = db.getSetting("github_pat");
  const enabled = db.getSetting("copilot_enabled") === "true";
  const username = db.getSetting("github_username") || "";

  return NextResponse.json({
    authenticated: !!(token && enabled),
    username,
    copilot_enabled: enabled,
  });
}
