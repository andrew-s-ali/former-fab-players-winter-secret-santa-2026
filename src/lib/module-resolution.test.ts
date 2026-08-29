import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A relative import that Node's type stripping cannot resolve.
 *
 * `import { x } from "./y"` has no extension, so `node --experimental-strip-types`
 * fails on it — which is why `#lib/*` exists. Next and Vitest both resolve it
 * happily, so a relative import inside `src/lib` is invisible until an
 * operator runs a script, and then it takes out `npm run draw`,
 * `update-participant` or `reveal` with a module-not-found stack.
 *
 * `import type` is exempt: it is erased before Node ever sees it.
 */

/** Dynamic `import("./x")` has the same problem and is not erased. */
const RELATIVE_DYNAMIC_IMPORT = /\bimport\(\s*["'](\.[^"']*)["']\s*\)/g;

/**
 * Splits the source into whole import statements.
 *
 * A single regex over the file spans from one statement's `import` to a later
 * statement's `from`, which makes every `import type` after a value import
 * look like a violation. Statements are gathered line by line instead.
 */
function importStatements(source: string): string[] {
  const statements: string[] = [];
  let current: string | null = null;

  for (const line of source.split("\n")) {
    if (current === null && /^import\s/.test(line)) {
      current = line;
    } else if (current !== null) {
      current += ` ${line.trim()}`;
    }
    if (current !== null && /\sfrom\s+["'][^"']+["'];?\s*$/.test(current)) {
      statements.push(current);
      current = null;
    }
  }
  return statements;
}

/** The relative specifier a value import names, or null. */
function relativeValueImport(statement: string): string | null {
  if (/^import\s+type\s/.test(statement)) {
    return null;
  }
  const match = statement.match(/\sfrom\s+["'](\.[^"']*)["']/);
  return match ? match[1] : null;
}

async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await sourceFiles(path)));
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      found.push(path);
    }
  }
  return found;
}

describe("src/lib stays loadable by the operator scripts", () => {
  it("uses #lib/* rather than relative paths for value imports", async () => {
    const offenders: string[] = [];

    for (const path of await sourceFiles("src/lib")) {
      const source = await readFile(path, "utf8");

      for (const statement of importStatements(source)) {
        const specifier = relativeValueImport(statement);
        if (specifier) {
          offenders.push(`${path}: ${specifier}`);
        }
      }

      RELATIVE_DYNAMIC_IMPORT.lastIndex = 0;
      for (const match of source.matchAll(RELATIVE_DYNAMIC_IMPORT)) {
        offenders.push(`${path}: import(${match[1]})`);
      }
    }

    // Named individually so the message says what to change, not just that
    // something is wrong.
    expect(offenders).toEqual([]);
  });
});
