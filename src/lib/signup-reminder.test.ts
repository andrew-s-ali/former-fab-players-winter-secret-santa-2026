import { describe, expect, it } from "vitest";
import { SIGNUPS_CLOSE_AT, SIGNUPS_OPEN_AT } from "./event";
import {
  REMINDER_THRESHOLDS,
  alertsChannel,
  currentReminder,
  reminderMessage,
  shouldPostReminder,
} from "./signup-reminder";

/** The real window: seven days, midnight Eastern to midnight Eastern. */
const WINDOW = {
  opensAt: "2026-09-01T04:00:00Z", // midnight ET, 1 September
  closesAt: "2026-09-08T04:00:00Z", // midnight ET, 8 September
};
const at = (iso: string) => new Date(iso);

describe("currentReminder", () => {
  it("says nothing before sign-ups open", () => {
    expect(currentReminder(at("2026-08-31T23:00:00Z"), WINDOW)).toBeNull();
    // To the minute: the window opens at midnight Eastern, not the evening
    // before.
    expect(currentReminder(at("2026-09-01T03:59:00Z"), WINDOW)).toBeNull();
    expect(currentReminder(at("2026-09-01T04:00:00Z"), WINDOW)).not.toBeNull();
  });

  it("says nothing once they have closed", () => {
    // A reminder to sign up for something that is over is worse than silence.
    expect(currentReminder(at("2026-09-08T03:59:00Z"), WINDOW)).not.toBeNull();
    expect(currentReminder(at("2026-09-08T04:00:00Z"), WINDOW)).toBeNull();
    expect(currentReminder(at("2026-09-12T12:00:00Z"), WINDOW)).toBeNull();
  });

  it("says nothing at all when no opening date is set", () => {
    expect(
      currentReminder(at("2026-09-03T12:00:00Z"), { ...WINDOW, opensAt: null })
    ).toBeNull();
  });

  it("opens with the announcement, then walks the milestones", () => {
    // 12:00Z is 8am Eastern, the hour the schedule fires.
    const keyAt = (day: string) => currentReminder(at(`2026-09-${day}T12:00:00Z`), WINDOW)?.key;

    const days = (key: string | undefined) => key?.replace(`@${WINDOW.closesAt}`, "");

    expect(days(keyAt("01"))).toBe("opening");
    expect(days(keyAt("02"))).toBe("opening");
    expect(days(keyAt("03"))).toBe("days-5");
    expect(days(keyAt("04"))).toBe("days-5");
    expect(days(keyAt("05"))).toBe("days-3");
    expect(days(keyAt("06"))).toBe("days-3");
    expect(days(keyAt("07"))).toBe("days-1");
    expect(keyAt("08")).toBeUndefined();
  });

  it("never leaves a threshold that cannot fire", () => {
    // A threshold at or above the window length would either never be the
    // current milestone or collide with the opening announcement.
    const windowDays =
      (Date.parse(WINDOW.closesAt) - Date.parse(WINDOW.opensAt)) / 86_400_000;

    expect(Math.max(...REMINDER_THRESHOLDS)).toBeLessThan(windowDays);
  });

  it("reports where things stand, not the mark it passed", () => {
    // Four days left is still the "five days" milestone — so a cron that
    // missed a day posts something true rather than something stale.
    const four = currentReminder(at("2026-09-04T12:00:00Z"), WINDOW)!;
    expect(four.key).toBe(`days-5@${WINDOW.closesAt}`);
    expect(four.daysLeft).toBe(4);
  });

  it("marks only the smallest threshold as the final call", () => {
    expect(currentReminder(at("2026-09-07T12:00:00Z"), WINDOW)!.kind).toBe("final");
    expect(currentReminder(at("2026-09-05T12:00:00Z"), WINDOW)!.kind).toBe("countdown");
    expect(Math.min(...REMINDER_THRESHOLDS)).toBe(1);
  });
});

describe("shouldPostReminder", () => {
  const reminder = currentReminder(at("2026-09-03T12:00:00Z"), WINDOW);

  it("posts a milestone that has not gone yet", () => {
    expect(shouldPostReminder(reminder, null)).toBe(true);
    expect(shouldPostReminder(reminder, { postedKeys: ["opening"] })).toBe(true);
  });

  it("posts each milestone exactly once, however often the cron runs", () => {
    expect(
      shouldPostReminder(reminder, {
        postedKeys: ["opening", `days-5@${WINDOW.closesAt}`],
      })
    ).toBe(false);
  });

  it("never posts when there is no milestone", () => {
    expect(shouldPostReminder(null, null)).toBe(false);
  });
});

describe("reminderMessage", () => {
  const opening = currentReminder(at("2026-09-01T12:00:00Z"), WINDOW)!;
  const final = currentReminder(at("2026-09-07T12:00:00Z"), WINDOW)!;
  const base = { closesAt: WINDOW.closesAt, url: "https://santa.example.com" };

  it("names the last day people can actually act, not the boundary date", () => {
    // The deadline is midnight as the 8th begins. "Closes on 8 September"
    // reads as "the 8th is your last day"; "midnight on 8 September" is
    // correct but half the room hears "the night of the 8th". Naming Monday
    // the 7th leaves nothing to interpret.
    const message = reminderMessage(opening, { ...base, signupCount: 3 });

    expect(message).toContain("the end of Monday, 7 September 2026");
    expect(message).not.toContain("8 September");
  });

  it("links the home page, not /signup", () => {
    // On opening day the home page stops being a splash and becomes the rules,
    // the ban list and the sign-up link — so it answers "what is this?" as
    // well as "where do I join?".
    const message = reminderMessage(opening, { ...base, signupCount: 3 });

    expect(message).toContain("https://santa.example.com");
    expect(message).not.toContain("/signup");
  });

  it("omits the link when no site URL is known", () => {
    expect(
      reminderMessage(opening, { ...base, url: null, signupCount: 3 })
    ).not.toContain("Rules and sign-up:");
  });

  it("counts people, and says so in the singular", () => {
    expect(reminderMessage(opening, { ...base, signupCount: 1 })).toContain(
      "1 person has signed up"
    );
    expect(reminderMessage(opening, { ...base, signupCount: 4 })).toContain(
      "4 people have signed up"
    );
  });

  it("invites the first sign-up rather than reporting zero", () => {
    expect(reminderMessage(opening, { ...base, signupCount: 0 })).toContain(
      "be the first"
    );
  });

  it("still goes out when the count could not be read", () => {
    // The deadline is the point of the message; a database blip is a poor
    // reason to let a milestone pass in silence.
    const message = reminderMessage(final, { ...base, signupCount: null });

    expect(message).toContain("Last chance");
    expect(message).not.toContain("signed up so far");
  });

  it("says what closing actually means, on the last day", () => {
    expect(reminderMessage(final, { ...base, signupCount: 9 })).toContain(
      "no adding people later"
    );
  });
});

describe("alertsChannel", () => {
  const reminderAt = (day: string) =>
    currentReminder(at(`2026-09-${day}T12:00:00Z`), WINDOW)!;

  it("pings the channel on the announcement and the last call", () => {
    expect(alertsChannel(reminderAt("01"))).toBe(true);
    expect(alertsChannel(reminderAt("07"))).toBe(true);
  });

  it("leaves the midweek nudges unpinged", () => {
    // Four channel-wide alerts in seven days is how a bot gets muted — and a
    // muted bot is silent on the last day too.
    expect(alertsChannel(reminderAt("03"))).toBe(false);
    expect(alertsChannel(reminderAt("05"))).toBe(false);
  });

  it("puts @here in the text of exactly the pinged messages", () => {
    const text = (day: string) =>
      reminderMessage(reminderAt(day), {
        signupCount: 3,
        closesAt: WINDOW.closesAt,
        url: null,
      });

    expect(text("01")).toContain("@here");
    expect(text("07")).toContain("@here");
    expect(text("03")).not.toContain("@here");
  });
});

describe("the configured window", () => {
  it("is long enough for every milestone to fire", () => {
    // The local WINDOW above tests the rule; this tests the real dates, which
    // have moved once already. A threshold at or above the window length
    // either never becomes the current milestone or collides with the opening
    // announcement — and the symptom is a reminder that silently never goes
    // out, which nobody notices until the deadline passes.
    const days =
      (Date.parse(SIGNUPS_CLOSE_AT) - Date.parse(SIGNUPS_OPEN_AT!)) / 86_400_000;

    expect(SIGNUPS_OPEN_AT).not.toBeNull();
    expect(Math.max(...REMINDER_THRESHOLDS)).toBeLessThan(days);
  });

  it("reaches the final call before closing", () => {
    const lastMorning = new Date(Date.parse(SIGNUPS_CLOSE_AT) - 16 * 3_600_000);
    const reminder = currentReminder(lastMorning, {
      opensAt: SIGNUPS_OPEN_AT,
      closesAt: SIGNUPS_CLOSE_AT,
    });

    expect(reminder?.kind).toBe("final");
    expect(alertsChannel(reminder!)).toBe(true);
  });
});

describe("moving the deadline re-arms the countdown", () => {
  const moved = { ...WINDOW, closesAt: "2026-09-11T04:00:00Z" };
  const morning = at("2026-09-06T12:00:00Z");

  it("treats the same milestone against a new deadline as unsaid", () => {
    // Extending used to silence the schedule for exactly the days it was
    // extended by: every milestone the new window reaches had been spent on
    // the old one, leaving the group holding a date announced as something
    // else.
    const spentOnTheOldDeadline = {
      postedKeys: ["opening", `days-5@${WINDOW.closesAt}`, `days-3@${WINDOW.closesAt}`],
    };

    const reminder = currentReminder(morning, moved)!;

    expect(reminder.key).toBe(`days-5@${moved.closesAt}`);
    expect(shouldPostReminder(reminder, spentOnTheOldDeadline)).toBe(true);
  });

  it("still says each milestone once per deadline", () => {
    const reminder = currentReminder(morning, moved)!;

    expect(
      shouldPostReminder(reminder, { postedKeys: [reminder.key] })
    ).toBe(false);
  });

  it("never re-welcomes the group when a date moves", () => {
    // The opening announcement is news about the event opening, and it opens
    // once. A far-future deadline puts `opening` back in front, and it must
    // still be recognised as already said.
    const faraway = { ...WINDOW, closesAt: "2026-10-30T04:00:00Z" };
    const reminder = currentReminder(morning, faraway)!;

    expect(reminder.kind).toBe("opening");
    expect(reminder.key).toBe("opening");
    expect(shouldPostReminder(reminder, { postedKeys: ["opening"] })).toBe(false);
  });
});
