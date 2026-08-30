import { NextResponse } from "next/server";
import { legalCommanders, toCommanderOptions } from "@/lib/commanders";
import { fetchCommanderPool } from "@/lib/scryfall/pool";

/**
 * Every legal commander, in name order, trimmed to what a picker needs.
 *
 * Feeds the sign-up form's type-to-filter dropdown. Unlike
 * `/api/commanders/sample`, this deliberately takes **no colour-veto
 * parameter** and applies none: the only veto that matters here is the
 * person's own, chosen on the same form, so it is not a secret being kept from
 * them and the client can filter it instantly without a refetch. That also
 * makes one response correct for everybody, which is what allows it to be
 * cached at all — the sample endpoint cannot be, because it must stay random.
 *
 * The ban list *is* applied, because a banned commander is not pickable by
 * anyone and should never appear as an option.
 */
export async function GET() {
  const pool = await fetchCommanderPool();
  // Backgrounds are kept in deliberately: this one response feeds both the
  // commander list and the partner list, and a Background is the second half
  // of a pairing. The client drops them from the primary list with
  // `canBePrimary` — filtering here would leave "Choose a Background"
  // commanders with nothing to pair with.
  const commanders = toCommanderOptions(
    legalCommanders(pool, { primaryOnly: false })
  );

  return NextResponse.json(
    { commanders },
    {
      headers: {
        // The pool only changes when a set is released. The upstream fetch is
        // already cached for a day; this lets the CDN and the browser hold it
        // too, so opening the sign-up page is not 144 KB every time.
        "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
