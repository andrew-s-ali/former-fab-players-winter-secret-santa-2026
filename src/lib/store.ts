import { readFile } from "node:fs/promises";
import { getContext } from "@netlify/functions";
import type { NudgeState } from "./nudge";
import type { ReminderState } from "./signup-reminder";
import type { EventData, Participant } from "./participants";

const STORE_NAME = "secret-santa";
const BLOB_KEY = "event.json";
const NUDGE_KEY = "nudge.json";
const REMINDER_KEY = "signup-reminder.json";

const EMPTY: EventData = { participants: [], revealedAt: null };

/** Stored data predating revealedAt must not break; default it to null. */
function withDefaults(data: EventData | null): EventData {
  if (!data) {
    return EMPTY;
  }
  return {
    participants: (data.participants ?? []).map(withParticipantDefaults),
    revealedAt: data.revealedAt ?? null,
  };
}

/**
 * Fields added to a participant after an event was already drawn.
 *
 * A blob written before `discord` or `exchangeRanking` existed has no such
 * key, and `undefined`
 * where the type promises `string | null` is the kind of difference that
 * surfaces as one odd render months later. Normalised on the way in instead.
 */
function withParticipantDefaults(participant: Participant): Participant {
  return {
    ...participant,
    discord: participant.discord ?? null,
    exchangeRanking: participant.exchangeRanking ?? null,
  };
}

type BlobsMode =
  | { kind: "explicit"; siteID: string; token: string }
  | { kind: "automatic"; production: boolean; context: string }
  | { kind: "local" };

/**
 * Netlify's name for the deploy context: "production", "deploy-preview",
 * "branch-deploy", "dev". Anything that is not exactly "production" — including
 * a missing value — gets a deploy-scoped store. See `openStore`.
 */
const PRODUCTION_CONTEXT = "production";

/**
 * Which deploy context this code is running in, and where that came from.
 *
 * **The request, first.** Every request Netlify hands a function — the Next.js
 * server handler included — carries `deploy.context`, and `getContext()` reads
 * it. That is the platform describing the deploy that is actually serving, so
 * it is the one to believe.
 *
 * `CONTEXT` is only the fallback, and this used to rely on it alone. It is a
 * **build** variable: Netlify sets it while the site is built and not in the
 * runtime that serves it. So every production request resolved to "unset",
 * failed closed to the deploy-scoped store, and read an empty event — for ten
 * days, silently. The admin console showed nobody, the sign-up reminder kept
 * its memory per deploy, and on the night of the draw all seven private links
 * returned 404, because the draw had written the one store the site never
 * looked in. It is kept for `netlify dev`, which does set it.
 *
 * `getContext()` throws outside a request (the CLI, a build step); that is not
 * an error here, just the absence of the better answer.
 */
function deployContext(): { context: string; source: "request" | "CONTEXT" } | null {
  try {
    const context = getContext().deploy?.context;
    if (context) {
      return { context, source: "request" };
    }
  } catch {
    // Not inside a Netlify request. Fall through to the build variable.
  }
  const fromBuild = process.env.CONTEXT;
  return fromBuild ? { context: fromBuild, source: "CONTEXT" } : null;
}

/**
 * Decides where event data lives.
 *
 * `getStore(name)` called with a bare string only resolves credentials from
 * `NETLIFY_BLOBS_CONTEXT` (auto-injected by Netlify inside Functions, Edge
 * Functions, and — per Netlify's docs — the Next.js server runtime once
 * deployed there). It does **not** read `NETLIFY_SITE_ID` / `NETLIFY_AUTH_TOKEN`
 * — those must be passed explicitly as `{ siteID, token }`, which is the form
 * the organiser's local scripts need. See the finding this fixes:
 * `NETLIFY_SITE_ID=x NETLIFY_AUTH_TOKEN=y node -e '...getStore("name")...'`
 * throws; `getStore({ name, siteID, token })` does not.
 *
 * - Both `NETLIFY_SITE_ID` and `NETLIFY_AUTH_TOKEN` set → Blobs, explicit
 *   credentials (local script run against a real/deployed store).
 * - Only one of the two set → misconfiguration; fail loudly rather than
 *   silently falling back to the local file (which would look like success).
 * - `NETLIFY_BLOBS_CONTEXT` set → Blobs, automatic credentials (this is the
 *   deployed-on-Netlify case; no manual credentials needed or wanted there).
 *   The deploy context then decides *which* store — see `deployContext` for
 *   where that comes from, and `openStore` for why it matters.
 * - Neither → local JSON file (`npm run dev`, Playwright E2E).
 */
function resolveMode(): BlobsMode {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (siteID && token) {
    return { kind: "explicit", siteID, token };
  }
  if (siteID || token) {
    throw new Error(
      "Both NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN must be set together to " +
        "use Netlify Blobs manually; only one was found in the environment."
    );
  }
  if (process.env.NETLIFY_BLOBS_CONTEXT) {
    const resolved = deployContext();
    return {
      kind: "automatic",
      production: resolved?.context === PRODUCTION_CONTEXT,
      context: resolved ? `${resolved.context} (from ${resolved.source})` : "(unknown)",
    };
  }
  return { kind: "local" };
}

function localPath(): string {
  return process.env.EVENT_DATA_PATH ?? "data/event.local.json";
}

/** Human-readable description of the resolved read/write target, for CLI scripts to print. */
export function describeTarget(): string {
  const mode = resolveMode();
  switch (mode.kind) {
    case "explicit":
      return `Using Netlify Blobs (site ${mode.siteID}, explicit credentials)`;
    case "automatic":
      return mode.production
        ? "Using Netlify Blobs (automatic Netlify runtime context, production store)"
        : `Using Netlify Blobs (deploy-scoped store; context ${mode.context}) — ` +
          "this deploy cannot see or change production event data";
    case "local":
      return `Using local file ${localPath()}`;
  }
}

/**
 * Opens the right store for where this code is running.
 *
 * `getStore` is scoped to the *site*, so it is shared by every deploy —
 * production, every Deploy Preview, every branch deploy. That is wrong for
 * this project in one specific and expensive way: the organiser console at
 * `/admin` would offer a working "unlock /reveal" button on a public preview
 * URL that writes to the real event, publishing the whole ring early. Reads
 * are less exposed (a reveal link still needs its unguessable token) but a
 * preview would serve the full ring once reveal day had passed.
 *
 * So only production gets the shared store. Anything else gets a deploy-scoped
 * one, which starts empty: previews render "no draw yet", `/s/<token>` 404s,
 * and the console has nothing to unlock. Same structural isolation the `/demo`
 * routes already have, arrived at a different way.
 *
 * **An unknown context fails closed**, to the deploy-scoped store. That is
 * still the right direction — a preview must never write to live data — but
 * this comment used to promise the failure would be "loud, obvious, fixed in
 * minutes", and it was none of those. Production ran against an empty store for
 * ten days and nothing looked broken until a private link 404'd, because an
 * empty event is also exactly what a correct site shows before the draw. The
 * lesson is in `deployContext`: the signal has to be one the runtime actually
 * has, not one that only exists while building.
 *
 * The operator's CLI is unaffected: it authenticates with explicit
 * credentials, which always mean the real store.
 */
async function openStore(
  mode: Extract<BlobsMode, { kind: "explicit" } | { kind: "automatic" }>
) {
  const { getDeployStore, getStore } = await import("@netlify/blobs");

  if (mode.kind === "explicit") {
    return getStore({ name: STORE_NAME, siteID: mode.siteID, token: mode.token });
  }
  return mode.production ? getStore(STORE_NAME) : getDeployStore(STORE_NAME);
}

/** Timestamped backup key/filename — no rotation, no cleanup, just a way back. */
function backupKey(now: Date = new Date()): string {
  return `event.backup-${now.toISOString().replace(/[:.]/g, "-")}.json`;
}

/**
 * The shape of a key `writeEvent` produced, and the only shape `readBackup`
 * will open.
 *
 * Anchored, and checked on the way in rather than trusted: on the local path a
 * key becomes a filename, and a key the caller made up could otherwise walk
 * out of the data directory and read whatever it liked.
 */
const BACKUP_KEY = /^event\.backup-[0-9TZ-]+\.json$/;

export function isBackupKey(key: string): boolean {
  return BACKUP_KEY.test(key);
}

/**
 * Every snapshot `writeEvent` has taken, oldest first.
 *
 * The keys carry an ISO timestamp, so sorting them as strings sorts them by
 * time — which is why the format is worth keeping even though nothing parses
 * it to sort.
 */
export async function listBackupKeys(): Promise<string[]> {
  const mode = resolveMode();

  if (mode.kind !== "local") {
    const store = await openStore(mode);
    const { blobs } = await store.list();
    return blobs.map((blob) => blob.key).filter(isBackupKey).sort();
  }

  const { readdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  try {
    return (await readdir(dirname(localPath()))).filter(isBackupKey).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * Reads one snapshot without making it the event.
 *
 * Null when there is no such snapshot, so a caller can tell "you named a key
 * that is not there" from "the snapshot is empty" — which are different
 * mistakes with different fixes.
 */
export async function readBackup(key: string): Promise<EventData | null> {
  if (!isBackupKey(key)) {
    throw new Error(
      `"${key}" is not a snapshot key. They look like ` +
        "event.backup-2026-09-11T04-12-33-119Z.json — list them with " +
        "`npm run restore`."
    );
  }
  const mode = resolveMode();

  if (mode.kind !== "local") {
    const store = await openStore(mode);
    const data = await store.get(key, { type: "json" });
    return data ? withDefaults(data as EventData) : null;
  }

  const { join, dirname } = await import("node:path");
  try {
    return withDefaults(
      JSON.parse(
        await readFile(join(dirname(localPath()), key), "utf8")
      ) as EventData
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Reads the event data.
 *
 * Server-side only — this contains every assignment, and must never be
 * imported into a client component.
 */
export async function readEvent(): Promise<EventData> {
  const mode = resolveMode();

  if (mode.kind !== "local") {
    const store = await openStore(mode);
    const data = await store.get(BLOB_KEY, { type: "json" });
    return withDefaults(data as EventData | null);
  }

  try {
    return withDefaults(
      JSON.parse(
        await readFile(/* turbopackIgnore: true */ localPath(), "utf8")
      ) as EventData
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return EMPTY;
    }
    throw error;
  }
}

/**
 * What the last Discord nudge said, or null if none has been sent.
 *
 * Kept beside the event rather than in Postgres because it is operational
 * trivia about a side channel: losing it costs one duplicate post, and the
 * scheduled function that reads it already has Blobs credentials whether or
 * not the database is reachable.
 */
export async function readNudgeState(): Promise<NudgeState | null> {
  return readSibling<NudgeState>(NUDGE_KEY);
}

export async function writeNudgeState(state: NudgeState): Promise<void> {
  await writeSibling(NUDGE_KEY, state);
}

/** Beside the local event file, whatever that file is called. */
async function siblingPath(key: string): Promise<string> {
  const { dirname, join } = await import("node:path");
  return join(dirname(localPath()), key);
}

/**
 * Which sign-up reminders have already been posted.
 *
 * Kept beside the event for the same reason as `nudge.json`, and under its own
 * key so the two schedules cannot overwrite each other's state.
 */
export async function readReminderState(): Promise<ReminderState | null> {
  return readSibling<ReminderState>(REMINDER_KEY);
}

export async function writeReminderState(state: ReminderState): Promise<void> {
  await writeSibling(REMINDER_KEY, state);
}

async function readSibling<T>(key: string): Promise<T | null> {
  const mode = resolveMode();

  if (mode.kind !== "local") {
    const store = await openStore(mode);
    return (await store.get(key, { type: "json" })) as T | null;
  }

  try {
    return JSON.parse(
      await readFile(/* turbopackIgnore: true */ await siblingPath(key), "utf8")
    ) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeSibling(key: string, value: unknown): Promise<void> {
  const mode = resolveMode();

  if (mode.kind !== "local") {
    const store = await openStore(mode);
    await store.setJSON(key, value);
    return;
  }

  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const path = await siblingPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
}

/**
 * Deletes the event data and every backup snapshot of it.
 *
 * The backups are the reason this exists rather than a one-line `delete`.
 * `writeEvent` snapshots before every write and never cleans up, so an event
 * that has been edited a handful of times has several complete copies of
 * everyone's name, address and private token sitting beside it. Deleting
 * `event.json` on its own would look like erasure and be nothing of the sort.
 *
 * Returns the keys it removed, so the caller can print what actually went
 * rather than claiming success. There is no undo — the backups are part of
 * what this deletes.
 */
export async function deleteEventData(): Promise<string[]> {
  const mode = resolveMode();
  // nudge.json is in here because its digest lists participants by name; the
  // reminder state holds no personal data but is event state all the same, and
  // a wipe that keeps souvenirs is not a wipe.
  const isEventKey = (key: string) =>
    key === BLOB_KEY ||
    key === NUDGE_KEY ||
    key === REMINDER_KEY ||
    /^event\.backup-.*\.json$/.test(key);

  if (mode.kind !== "local") {
    const store = await openStore(mode);
    const { blobs } = await store.list();
    const keys = blobs.map((blob) => blob.key).filter(isEventKey).sort();
    for (const key of keys) {
      await store.delete(key);
    }
    return keys;
  }

  const { readdir, rm } = await import("node:fs/promises");
  const { basename, dirname, join } = await import("node:path");
  const path = localPath();
  const dir = dirname(path);

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  // The live file is whatever EVENT_DATA_PATH points at, which need not be
  // named event.json; the backups beside it always follow the pattern.
  const names = entries
    .filter((entry) => entry === basename(path) || isEventKey(entry))
    .sort();
  for (const name of names) {
    await rm(join(dir, name), { force: true });
  }
  return names;
}

/**
 * Writes the event data. Used by scripts, never by the deployed site.
 *
 * If data already exists, it is snapshotted first under a timestamped
 * sibling key/path — protection against a careless `--force` redraw or a
 * mid-write crash destroying the only copy of every assignment and token.
 * Keep it simple: no rotation policy, no cleanup of old backups.
 */
export async function writeEvent(event: EventData): Promise<void> {
  const mode = resolveMode();

  if (mode.kind !== "local") {
    const store = await openStore(mode);
    const existing = (await store.get(BLOB_KEY, {
      type: "json",
    })) as EventData | null;
    if (existing && existing.participants.length > 0) {
      await store.setJSON(backupKey(), existing);
    }
    await store.setJSON(BLOB_KEY, event);
    return;
  }

  const { mkdir, rename, writeFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const path = localPath();
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });

  const existing = await readEvent();
  if (existing.participants.length > 0) {
    await writeFile(
      join(dir, backupKey()),
      JSON.stringify(existing, null, 2)
    );
  }

  // Crash-safe: write to a temp file, then rename. A mid-write crash never
  // leaves a truncated event.json behind — the rename is atomic.
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, JSON.stringify(event, null, 2));
  await rename(tmpPath, path);
}
