import type { FormSubmittedEvent } from "@netlify/functions";
import { pickName } from "#lib/pairing";
import { fetchCommanderPool } from "#lib/scryfall/pool";
import { normalizeSignup, resolveSelfCards, SIGNUP_FIELDS } from "#lib/signup";
import { recordSignup } from "#lib/signups";

/**
 * Mirrors a verified Netlify Forms sign-up into the database.
 *
 * Netlify Forms stays the front door: it runs Akismet, gives the organiser a
 * dashboard and a spam list, and needs no backend code. This function is the
 * bridge from that to data the draw can use — Forms submissions are otherwise
 * reachable only through the UI, the API or a CSV export.
 *
 * The two card picks are resolved to real commanders **here**, on arrival,
 * rather than by name when the draw runs. The legal pool changes when a set is
 * released, so resolving late means a set release between sign-up and draw can
 * invalidate a pick that was perfectly good when it was made. Resolving on
 * arrival pins it.
 *
 * Platform-event functions always run in the background — there is no response
 * the submitter ever sees, and throwing here does not fail their submission.
 * Netlify retries an errored invocation (after 1 minute, then 2), which is why
 * the row's primary key is a hash of its own content: a retry of the same
 * answers collides and is dropped. See `signupContentId`.
 */
const handlers = {
  async formSubmitted(event: FormSubmittedEvent) {
    const data = event.data ?? {};

    // Platform-event handlers fire for every form on the site. There is only
    // one today, but a second one would otherwise arrive here and fail
    // validation as though it were a malformed sign-up.
    const formName = data["form-name"];
    if (formName !== undefined && formName !== "santa-signup") {
      console.log(`Ignoring a submission for form "${formName}".`);
      return;
    }
    if (!(SIGNUP_FIELDS.name in data)) {
      console.log("Ignoring a submission with no name field.");
      return;
    }

    const input = normalizeSignup(data, "This form submission");
    const cards = resolveSelfCards(input, await fetchCommanderPool());
    const { id, stored } = await recordSignup(input, cards);

    // Logged either way: on a retry the "already recorded" line is what tells
    // the organiser the duplicate was deliberate rather than lost.
    console.log(
      stored
        ? `Recorded sign-up ${id} for ${input.name} ` +
            `(${cards.map(pickName).join("; ")}).`
        : `Sign-up ${id} for ${input.name} was already recorded; ignoring this delivery.`
    );
  },
};

export default handlers;
