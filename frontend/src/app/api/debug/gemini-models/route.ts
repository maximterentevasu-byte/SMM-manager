import { NextResponse } from "next/server";

export async function GET() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api")
    .replace(/\/api\/?$/, "");
  try {
    const res = await fetch(`${base}/api/debug/gemini-models`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
