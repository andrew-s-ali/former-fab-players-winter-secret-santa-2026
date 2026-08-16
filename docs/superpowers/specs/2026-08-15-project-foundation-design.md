# Project Foundation Design

**Date:** 2026-08-15
**Status:** Implemented

## Purpose

Stand up a deployable, tested Next.js foundation for the 2026 winter Secret
Santa site. The event's actual features are undecided, so this spec covers the
shell only and names the seam where the real logic will attach.

## Context

Netlify created the GitHub repo from its Express MCP-server example template
(one commit, `13a3d8d`). That template is unrelated to this project and was
replaced wholesale; it remains recoverable in git history.

## Decisions

| Decision      | Choice                                              | Why                                                                                                  |
| ------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16, App Router, TypeScript                   | Best-documented option, first-class on Netlify, and server logic (route handlers) is available later without a migration. |
| Styling       | Tailwind CSS v4                                      | Already familiar; ships with the scaffold.                                                            |
| Location      | `~/Projects/former-fab-players-winter-secret-santa-2026` | Kept out of `~/Herd`, which is for PHP sites.                                                     |
| Unit tests    | Vitest + Testing Library, jsdom                      | Fast; shares Vite's transform pipeline.                                                               |
| E2E tests     | Playwright, Chromium only                            | One browser is enough until the UI exists.                                                            |
| CI            | GitHub Actions: lint → typecheck → unit → E2E        | Same gate locally and remotely.                                                                       |
| Netlify CLI   | Run via `npx`, **not** a devDependency               | See "Dependency conflict" below.                                                                      |

## Architecture

```
src/app/     App Router routes and layouts. Thin: presentation only.
src/lib/     Framework-free logic. Unit-tested in isolation.
tests/e2e/   Playwright specs, run against a real dev server.
```

The `src/lib` boundary is the point of the structure. The Secret Santa draw is
pure logic — a participant list and exclusion rules in, pairings out — so it
belongs there, testable without React, Next, or a database. Anything requiring
persistence or email attaches at the route-handler layer above it.

`src/lib/event.ts` exists today as the single source of the event's display
copy, consumed by both the page heading and the document metadata.

## Testing strategy

- Unit tests live beside their subject (`event.ts` → `event.test.ts`), scoped by
  Vitest's `include` to `src/**` so Playwright's specs are never picked up.
- Vitest config is `.mts` so it loads as ESM; path aliases come from
  `resolve.tsconfigPaths`, which supersedes the `vite-tsconfig-paths` plugin.
- `typecheck` runs `next typegen` first: Next generates `LayoutProps` and other
  route types into `.next/types`, and bare `tsc --noEmit` fails without them on
  a clean checkout.
- Playwright starts the dev server itself (`webServer`), so E2E needs no manual
  setup and behaves identically in CI.

## Dependency conflict (Netlify CLI)

`netlify-cli@27` requires `@opentelemetry/api@~1.8.0`; `vitest@4` requires
`^1.9.0`. Installing both fails `npm install` and would fail `npm ci` in CI.
Forcing resolution with `--legacy-peer-deps` or an `overrides` entry would push
a version the CLI's telemetry code does not expect, to no benefit — the CLI is a
tool, not library code. It is therefore invoked through `npx`, and
`npm run netlify:dev` wraps that. Revisit if the CLI relaxes its pin.

## Deliberately out of scope

Database, email provider, authentication, the draw algorithm, participant data,
and all visual design. Each needs its own spec.

## Verification

Run on completion, all passing: `npm run lint`, `npm run typecheck`,
`npm test` (3 tests), `npm run build`, `npm run test:e2e` (1 test).
