# Former Fab Players Winter Secret Santa 2026

A Next.js site for the 2026 winter Secret Santa, deployed on Netlify.

## Status

Foundation only. The page is a placeholder — there is no participant list, no
draw logic, and no database yet. Those decisions are still open; see
[the foundation spec](docs/superpowers/specs/2026-08-15-project-foundation-design.md).

## Stack

| Concern    | Choice                                       |
| ---------- | -------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript |
| Styling    | Tailwind CSS v4                               |
| Unit tests | Vitest + Testing Library (jsdom)              |
| E2E tests  | Playwright (Chromium)                         |
| Hosting    | Netlify (zero-config Next.js runtime)         |

## Getting started

```bash
npm install
npx playwright install chromium   # once, for E2E
npm run dev                       # http://localhost:3000
```

## Scripts

| Script                | Does                                            |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | Next dev server                                  |
| `npm run build`       | Production build                                 |
| `npm run lint`        | ESLint                                           |
| `npm run typecheck`   | `next typegen` then `tsc --noEmit`               |
| `npm test`            | Vitest (unit + component), single run            |
| `npm run test:watch`  | Vitest in watch mode                             |
| `npm run test:e2e`    | Playwright; boots the dev server itself          |
| `npm run netlify:dev` | Netlify Dev, for functions/redirects/env parity  |

CI runs lint → typecheck → unit → E2E on every push and pull request.

## Layout

```
src/app/        routes and layouts (App Router)
src/lib/        framework-free logic; unit-tested (the draw algorithm lands here)
tests/e2e/      Playwright specs
```

Unit tests sit next to their subject (`src/lib/event.ts` → `src/lib/event.test.ts`).

## Netlify

`netlify.toml` pins the build command, publish directory, and Node version.
Netlify installs its Next.js runtime automatically — no adapter package needed.

The Netlify CLI is **not** a dependency: it pins `@opentelemetry/api@~1.8.0`,
which conflicts with Vitest 4's `^1.9.0` and breaks `npm ci`. Run it through
`npx` instead (`npm run netlify:dev`), or install it globally.

To connect this clone to the Netlify project:

```bash
npx --yes netlify-cli login && npx --yes netlify-cli link
```
