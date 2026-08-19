import { readFile } from "node:fs/promises";
import type { EventData } from "./participants";

const STORE_NAME = "secret-santa";
const BLOB_KEY = "event.json";

const EMPTY: EventData = { participants: [], revealedAt: null };

/** Stored data predating revealedAt must not break; default it to null. */
function withDefaults(data: EventData | null): EventData {
  if (!data) {
    return EMPTY;
  }
  return { participants: data.participants ?? [], revealedAt: data.revealedAt ?? null };
}

type BlobsMode =
  | { kind: "explicit"; siteID: string; token: string }
  | { kind: "automatic" }
  | { kind: "local" };

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
    return { kind: "automatic" };
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
      return "Using Netlify Blobs (automatic Netlify runtime context)";
    case "local":
      return `Using local file ${localPath()}`;
  }
}

async function openStore(
  mode: Extract<BlobsMode, { kind: "explicit" } | { kind: "automatic" }>
) {
  const { getStore } = await import("@netlify/blobs");
  if (mode.kind === "explicit") {
    return getStore({ name: STORE_NAME, siteID: mode.siteID, token: mode.token });
  }
  return getStore(STORE_NAME);
}

/** Timestamped backup key/filename — no rotation, no cleanup, just a way back. */
function backupKey(now: Date = new Date()): string {
  return `event.backup-${now.toISOString().replace(/[:.]/g, "-")}.json`;
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
