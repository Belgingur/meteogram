# Contributing

Thanks for your interest in `bel-meteogram`.

## Development setup

Node **20.19+** is required (see `.nvmrc`; the project is built and tested on
Node 22).

```bash
nvm use            # or: nvm install
npm install
npm run dev        # demo page (full + graph modes) at http://localhost:5173
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # dist/bel-meteogram.js (single ES module)
```

## Guidelines

- **Keep the bundle dependency-free.** The widget ships as one self-contained
  ES module — styles and the weather-symbol SVGs are inlined. Please don't add
  runtime dependencies.
- **Add tests for behaviour changes.** The pure modules (`transform.ts`,
  `symbol-code.ts`) are covered by `vitest`; extend those suites when you change
  their logic.
- **Commit messages** follow
  [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
  `fix:`, `test:`, `docs:`, `chore:`, `ci:`).
- CI runs `typecheck`, `test` and `build` on every pull request; all three must
  pass.

## Relationship to Mímir

The [Mímir](https://github.com/Belgingur/Mimir) weather-map viewer embeds this
widget by vendoring the built `dist/bel-meteogram.js` bundle, pinned to a
tagged release. When you cut a new release here, Mímir re-syncs and pins to it.
