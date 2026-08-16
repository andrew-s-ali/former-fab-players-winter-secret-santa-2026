import { readFile } from "node:fs/promises";
import type { EventData } from "./participants";

const STORE_NAME = "secret-santa";
const BLOB_KEY = "event.json";

const EMPTY: EventData = { participants: [] };

/** Netlify injects NETLIFY_SITE_ID at runtime; locally we fall back to a file. */
function shouldUseBlobs(): boolean {
  return Boolean(process.env.NETLIFY_SITE_ID);
}

function localPath(): string {
  return process.env.EVENT_DATA_PATH ?? "data/event.local.json";
}

/**
 * Reads the event data.
 *
 * Server-side only — this contains every assignment, and must never be
 * imported into a client component.
 */
export async function readEvent(): Promise<EventData> {
  if (shouldUseBlobs()) {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE_NAME);
    const data = await store.get(BLOB_KEY, { type: "json" });
    return (data as EventData) ?? EMPTY;
  }

  try {
    return JSON.parse(await readFile(localPath(), "utf8")) as EventData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return EMPTY;
    }
    throw error;
  }
}

/** Writes the event data. Used by scripts, never by the deployed site. */
export async function writeEvent(event: EventData): Promise<void> {
  if (shouldUseBlobs()) {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE_NAME);
    await store.setJSON(BLOB_KEY, event);
    return;
  }

  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(localPath()), { recursive: true });
  await writeFile(localPath(), JSON.stringify(event, null, 2));
}
