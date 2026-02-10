import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// GET: List all conversations
export async function GET() {
  const conversations = db.listConversations();
  return NextResponse.json(conversations);
}

// POST: Create a new conversation
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, title } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const conversation = db.createConversation(id, title || "New Conversation");
  return NextResponse.json(conversation);
}

// DELETE: Delete a conversation
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  db.deleteConversation(id);
  return NextResponse.json({ success: true });
}
