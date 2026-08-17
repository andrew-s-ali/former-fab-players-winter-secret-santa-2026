import { NextResponse } from "next/server";
import { sampleCommanders, type ColorCode } from "@/lib/commanders";
import { fetchCommanderPool } from "@/lib/scryfall/pool";

const COLORS = new Set(["W", "U", "B", "R", "G"]);
const DEFAULT_SIZE = 9;
const MAX_SIZE = 24;

/** Parses "WU" into ["W","U"], silently dropping anything unrecognised. */
function parseColors(raw: string | null): ColorCode[] {
  if (!raw) {
    return [];
  }
  return [...raw.toUpperCase()].filter((c) => COLORS.has(c)) as ColorCode[];
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const rawExclude = params.get("exclude");
  const colorVeto =
    rawExclude && COLORS.has(rawExclude) ? (rawExclude as ColorCode) : null;

  const size = Number(params.get("n") ?? DEFAULT_SIZE);
  const n = Number.isFinite(size) ? Math.min(Math.max(Math.trunc(size), 1), MAX_SIZE) : DEFAULT_SIZE;

  const pool = await fetchCommanderPool();
  const commanders = sampleCommanders(
    pool,
    {
      colorVeto,
      colors: parseColors(params.get("colors")),
      query: params.get("q") ?? "",
      pairsOnly: params.get("pairs") === "1",
    },
    n
  );

  // Never cache: each request must roll a fresh sample.
  return NextResponse.json(
    { commanders },
    { headers: { "cache-control": "no-store" } }
  );
}
