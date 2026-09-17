import type { Config } from "@netlify/functions";
import { runNudge } from "#lib/nudge-run";
import { runUnlockAnnouncement } from "#lib/unlock-run";

/**
 * Posts a nudge to Discord when somebody still owes card picks.
 *
 * The exchange cannot start until every participant has picked one commander
 * for every other participant, which is deliberate — but it makes one slow
 * person invisible unless somebody goes looking at the organiser console. This
 * puts them where the group already talks.
 *
 * It is quiet by design: `runNudge` posts when the picture has changed since
 * last time, and otherwise at most every few days. A bot that speaks daily
 * regardless gets muted, and a muted bot is worse than none on the day it
 * matters. Nothing is posted at all once everybody has finished.
 *
 * Scheduled functions only fire on **published production deploys** — never on
 * Deploy Previews or branch deploys — so this cannot post from a preview.
 * There is no local schedule either; invoke it once with
 * `netlify functions:invoke nudge`, or use `npm run nudge -- --dry-run`, which
 * runs the same code path.
 */
const nudge = async () => {
  const result = await runNudge();

  // The only visibility a scheduled function has is its log.
  console.log(
    `${result.status.picksIn}/${result.status.picksRequired} picks in; ` +
      `waiting on ${result.status.outstanding.length}. ` +
      `${result.posted ? "Posted." : "Did not post."} ${result.reason}`
  );

  // The fallback for the assignments-open announcement, which normally goes
  // out from the save of the last pick. A no-op once it has been said.
  if (result.status.complete) {
    const unlock = await runUnlockAnnouncement();
    console.log(`Unlock announcement: ${unlock.reason}`);
  }
};

export default nudge;

export const config: Config = {
  // 23:00 UTC — 6pm US Eastern in winter, when this event runs. Cron is always
  // UTC, so this drifts to 7pm Eastern if it ever runs through the summer.
  schedule: "0 23 * * *",
};
