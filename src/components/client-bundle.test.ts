import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Modules that pull in the database client, directly or otherwise.
 *
 * Importing any of these from a `"use client"` component drags `drizzle-orm`
 * and `pg` into the browser bundle, and the build fails with
 * `Can't resolve 'dns'` — pointing at node_modules rather than at the import
 * that caused it. This test names the import instead.
 */
const SERVER_ONLY = ["db/index", "db/schema"];

const IMPORT = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;

/** Resolves a local specifier to a file path, or null if it is a package. */
async function resolveLocal(specifier: string, fromFile: string): Promise<string | null> {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = resolve("src", specifier.slice(2));
  } else if (specifier.startsWith("#lib/")) {
    base = resolve("src/lib", specifier.slice(5));
  } else if (specifier.startsWith("#db/")) {
    base = resolve("db", specifier.slice(4));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    return null;
  }

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Try the next extension.
    }
  }
  return null;
}

/** Walks a module's local imports, returning the chain that reaches a server-only module. */
async function findServerOnlyPath(
  file: string,
  seen = new Set<string>(),
  chain: string[] = []
): Promise<string[] | null> {
  if (seen.has(file)) {
    return null;
  }
  seen.add(file);

  const source = await readFile(file, "utf8");

  // A "use server" module is a boundary, not a leak: Next replaces it with an
  // RPC stub in the client bundle, so what it imports never ships. Server
  // Actions are exactly how a client component is *supposed* to reach the
  // database, so the walk stops here.
  if (/^\s*["']use server["']/.test(source)) {
    return null;
  }

  const here = [...chain, file.replace(`${resolve(".")}/`, "")];

  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1];
    if (SERVER_ONLY.some((mod) => specifier.includes(mod))) {
      return [...here, specifier];
    }
    const resolved = await resolveLocal(specifier, file);
    if (resolved) {
      const found = await findServerOnlyPath(resolved, seen, here);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

describe("client components stay out of the database", () => {
  it("no \"use client\" component reaches db/ through its imports", async () => {
    const dir = resolve("src/components");
    const files = (await readdir(dir)).filter(
      (name) => name.endsWith(".tsx") && !name.includes(".test.")
    );

    const offenders: string[] = [];
    for (const name of files) {
      const file = join(dir, name);
      if (!(await readFile(file, "utf8")).startsWith('"use client"')) {
        continue;
      }
      const path = await findServerOnlyPath(file);
      if (path) {
        offenders.push(path.join("\n    → "));
      }
    }

    expect(offenders).toEqual([]);
  });
});
