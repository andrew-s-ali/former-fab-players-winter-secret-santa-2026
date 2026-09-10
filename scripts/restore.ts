import { fileURLToPath } from "node:url";
import {
  describeSummary,
  formatTakenAt,
  isRestorable,
  summarizeSnapshot,
} from "#lib/restore";
import {
  describeTarget,
  listBackupKeys,
  readBackup,
  readEvent,
  writeEvent,
} from "#lib/store";

const USAGE =
  "Usage:\n" +
  "  npm run restore                          list the snapshots, change nothing\n" +
  "  npm run restore -- <key> --yes           write that snapshot over the event\n" +
  "\n" +
  "  Note the `--`. Without it npm keeps the flag for itself and the script\n" +
  "  never sees it — so a lost separator costs you a listing, not the event.";

/** Flags this script understands. */
const KNOWN_FLAGS = ["yes", "dry-run"] as const;

/**
 * Rejects anything this script does not recognise, rather than ignoring it.
 *
 * Same reasoning as the draw: a safety flag that fails open is worse than no
 * safety flag, and here an ignored argument is the difference between reading
 * the snapshots and overwriting the event with one.
 */
function checkArguments(flags: string[], keys: string[]): void {
  for (const flag of flags) {
    const name = flag.slice(2);
    if (!KNOWN_FLAGS.includes(name as (typeof KNOWN_FLAGS)[number])) {
      throw new Error(
        `Unrecognised option "${flag}".\n` +
          `Known: ${KNOWN_FLAGS.map((f) => `--${f}`).join(", ")}.\n${USAGE}`
      );
    }
  }
  if (keys.length > 1) {
    throw new Error(
      `Expected at most one snapshot key, got ${keys.length}: ` +
        `${keys.map((key) => `"${key}"`).join(", ")}.\n${USAGE}`
    );
  }
}

/**
 * Usage: see USAGE.
 *
 * Lists by default and writes only for `--yes`, the way the draw does. This is
 * the more destructive of the two in one respect: the draw refuses to run over
 * an existing event without `--force`, and a restore is *always* over one.
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const flags = args.filter((arg) => arg.startsWith("--"));
  const keys = args.filter((arg) => !arg.startsWith("--"));
  checkArguments(flags, keys);

  const [key] = keys;
  const write = flags.includes("--yes");

  console.log(describeTarget());

  if (write && !key) {
    throw new Error(`--yes needs a snapshot to restore.\n${USAGE}`);
  }

  const snapshots = await listBackupKeys();
  if (snapshots.length === 0) {
    console.log(
      "\nNo snapshots. One is taken automatically before every write to the " +
        "event, so the first will appear the first time the event changes " +
        "after a draw."
    );
    return;
  }

  if (!key) {
    await list(snapshots);
    return;
  }

  const snapshot = await readBackup(key);
  if (!snapshot) {
    throw new Error(
      `No snapshot called "${key}" in this store. Run \`npm run restore\` with ` +
        "no arguments to see what is there — and check the target line above, " +
        "since local and live have different snapshots."
    );
  }

  const summary = summarizeSnapshot(snapshot);
  console.log(`\n${key}`);
  console.log(`  taken ${formatTakenAt(key)} · ${describeSummary(summary)}`);
  console.log(`  ${summary.names.join(", ")}`);

  if (!isRestorable(summary)) {
    throw new Error(
      "That snapshot has no participants in it. Restoring it would empty the " +
        "event rather than recover it."
    );
  }
  if (summary.ringProblem !== null || !summary.tokensIntact) {
    console.warn(
      "\n⚠  This snapshot is damaged (see above). Restoring it is still " +
        "allowed —\n   a broken copy beats none when the event is already " +
        "gone — but check the\n   others first, and expect to fix it " +
        "afterwards with update-participant.\n"
    );
  }

  if (!write) {
    console.log(
      "\nNothing has been written. To restore this one:\n" +
        `  npm run restore -- ${key} --yes\n` +
        "\nThe event as it stands now is snapshotted first, so this is itself " +
        "undoable."
    );
    return;
  }

  const current = summarizeSnapshot(await readEvent());
  await writeEvent(snapshot);

  console.log(`\nRestored ${summary.participants} participants from ${key}.`);
  if (current.participants > 0) {
    console.log(
      `What was there — ${describeSummary(current)} — was snapshotted first; ` +
        "run `npm run restore` to see it in the list."
    );
  }
  console.log(
    "\nPrivate links are unchanged, because the tokens came back with the " +
      "snapshot. Anything saved since it was taken is not in it: check the " +
      "console before telling anybody the event is back."
  );
}

async function list(snapshots: string[]): Promise<void> {
  const current = summarizeSnapshot(await readEvent());
  console.log(`\nNow: ${describeSummary(current)}\n`);

  console.log(`${snapshots.length} snapshot${snapshots.length === 1 ? "" : "s"}, newest first:\n`);
  for (const key of [...snapshots].reverse()) {
    const snapshot = await readBackup(key);
    if (!snapshot) {
      // Listed a moment ago and gone now: worth saying, not worth stopping for.
      console.log(`  ${key}\n      could not be read\n`);
      continue;
    }
    const summary = summarizeSnapshot(snapshot);
    console.log(`  ${key}`);
    console.log(`      taken ${formatTakenAt(key)} · ${describeSummary(summary)}`);
    console.log(`      ${summary.names.join(", ") || "(nobody)"}\n`);
  }

  console.log(
    "To look at one:  npm run restore -- <key>\n" +
      "To restore it:   npm run restore -- <key> --yes\n" +
      "\nNo tokens are printed here. Restoring brings back the ones the " +
      "snapshot holds, so links already sent keep working."
  );
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("scripts/restore.ts") ||
    process.argv[1].endsWith("restore.ts"));

if (isDirectRun && process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
