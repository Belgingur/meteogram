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
npm run lint       # eslint
npm test           # vitest
npm run build      # dist/bel-meteogram.js (single ES module)
npm run test:e2e   # Playwright browser smoke tests
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
- CI runs `typecheck`, `lint`, unit tests, the build, and browser smoke tests on
  every pull request; all checks must pass.

## Agent-assisted changes

For a task suitable for GitHub Copilot coding agent:

1. Create an **Agent-ready change** issue and provide testable acceptance
   criteria, technical boundaries, and visual expectations.
2. Confirm the task contains no secrets or private security information, then
   assign the issue to Copilot from the issue sidebar.
3. Let Copilot open a pull request. Review the implementation, CI results, and
   failure artifacts or other UI evidence.
4. Keep final approval and merging human-owned.

Do not assign vague, security-sensitive, release, credential, or production
infrastructure work to the agent without additional human planning and review.

Repository maintainers should protect `main` by requiring pull requests, the
**Typecheck, lint, test, and build** and **Playwright smoke tests** checks, and at
least one human approval. Automated agent assignment and automatic merging are
intentionally not part of this workflow.

## Relationship to Mímir

The [Mímir](https://github.com/Belgingur/Mimir) weather-map viewer embeds this
widget by vendoring the built `dist/bel-meteogram.js` bundle, pinned to a
tagged release. When you cut a new release here, Mímir re-syncs and pins to it.
