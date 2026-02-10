import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// GET: Get all settings
export async function GET() {
  const settings = db.getAllSettings();
  return NextResponse.json(settings);
}

// POST: Update settings
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be an object of key-value pairs" },
      { status: 400 },
    );
  }

  for (const [key, value] of Object.entries(body)) {
    db.setSetting(key, String(value));
  }

  return NextResponse.json({ success: true });
}
