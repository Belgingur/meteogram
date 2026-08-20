# Repository instructions

## Project

`bel-meteogram` is a framework-agnostic TypeScript web component built with
Vite. It is distributed as one ES module and must remain free of runtime
dependencies.

Use Node 22 and npm. The minimum supported Node version is 20.19.

## Before changing code

- Read the relevant source, tests, `README.md`, and `CONTRIBUTING.md`.
- Keep changes focused on the issue and follow existing TypeScript conventions.
- Do not add runtime dependencies. A development dependency needs a clear
  testing or tooling purpose.
- Do not change APIs, deployment configuration, release behavior, or
  credentials unless the issue explicitly requires it.
- Preserve the CC BY 4.0 attribution banner added to the built module by
  `vite.config.ts`.

## Source map

- `src/bel-meteogram.ts`: custom element, loading, modes, and interactions
- `src/api.ts`: API URL construction and data loading
- `src/transform.ts`: API-to-rendering data transformation
- `src/sample.ts`: offline sample data used for development and browser tests
- `src/landing.ts`: full-mode interface
- `src/graph-card.ts`: inline graph card
- `src/map-panel-graph.ts`: desktop map-panel graph
- `src/render.ts`: SVG rendering
- `src/styles.ts`: component styles and design tokens
- `src/i18n.ts`: Icelandic and English text
- `tests/`: Vitest unit tests for pure behavior
- `e2e/`: deterministic Playwright fixture and browser smoke tests

## Required validation

Run all of these before opening a pull request:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Add or update Vitest tests for behavior changes. For visible or interactive
changes, also update the Playwright smoke coverage when applicable.

## Browser tests

- Use the sample-only fixture in `e2e/fixture.html`; do not depend on the live
  WOD API.
- Freeze browser time and clear local storage so runs are repeatable.
- Cover affected mobile and desktop layouts when responsive behavior changes.
- Playwright captures screenshots and traces on failure; use those artifacts as
  visual evidence when diagnosing CI.

## Pull requests

Include:

- the issue being resolved
- what changed and why
- validation performed
- screenshots or other visual evidence when useful
- limitations or follow-up work

Never merge the pull request yourself. Leave final review and merge approval to
a human maintainer.
