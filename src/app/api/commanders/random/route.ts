import { NextResponse } from "next/server";
import { pickCommander, type ColorCode } from "@/lib/commanders";
import { fetchCommanderPool } from "@/lib/scryfall/pool";

const COLORS = new Set(["W", "U", "B", "R", "G"]);

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("exclude");
  const colorVeto = raw && COLORS.has(raw) ? (raw as ColorCode) : null;

  const pool = await fetchCommanderPool();
  const suggestion = pickCommander(pool, { colorVeto });

  if (!suggestion) {
    return NextResponse.json(
      { error: "No legal commander matches those filters." },
      { status: 404 }
    );
  }

  // Never cache: each request must roll a fresh commander.
  return NextResponse.json(suggestion, {
    headers: { "cache-control": "no-store" },
  });
}
