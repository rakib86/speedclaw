import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// GET: Get messages for a conversation
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  const messages = db.getMessages(conversationId);
  return NextResponse.json(messages);
}
