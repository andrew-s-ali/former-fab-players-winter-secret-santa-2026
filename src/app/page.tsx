import { EventHome } from "@/components/EventHome";
import { SplashPage } from "@/components/SplashPage";
import { siteNow } from "@/lib/clock";
import { SIGNUPS_OPEN_AT } from "@/lib/event";
import { registrationOpen } from "@/lib/launch";

/**
 * Rendered per request rather than at build time.
 *
 * Both things this page decides — splash or real home page, and which
 * milestone the countdown names — turn over on a date. A statically rendered
 * page would keep serving the splash after opening day until something else
 * happened to trigger a rebuild.
 */
export const dynamic = "force-dynamic";

export default function Home() {
  const now = siteNow();

  return registrationOpen(now, SIGNUPS_OPEN_AT) ? (
    <EventHome />
  ) : (
    <SplashPage now={now} />
  );
}
