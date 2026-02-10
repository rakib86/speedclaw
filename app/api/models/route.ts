import { NextResponse } from "next/server";
import { fetchModels } from "@/lib/openrouter";

export async function GET() {
  const models = await fetchModels();
  return NextResponse.json(models);
}
