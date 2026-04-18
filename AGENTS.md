# AGENTS.md

## Purpose

This repository builds and publishes `react-to-uml`, a TypeScript library that gathers React component usage from source files and emits graph output without requiring Babel/Webpack plugin integration.

Core flow:
1. `src/core/walk.ts` traverses files from an entrypoint.
2. `src/core/gather.ts` parses imports/exports/JSX signals into graph data.
3. `src/core/buildUml.ts` resolves graph edges and writes tree artifacts.
4. `src/index.ts` exposes orchestration helpers (`runGatherInfo`, `runBuildGraph`, `runFromEnv`).

## Repo Layout

- `src/`: library source code
- `src/__tests__/`: Node test files and fixtures
- `packages/`: local demo/workspace packages
- `lib/`: publish output from `build-lib` (generated, not committed)
- `audits/`: local scripts/utilities

## Package Manager and Commands

Use Yarn in this repository (lockfile is `yarn.lock`).

- Install: `yarn`
- Dev server/demo build: `yarn start`
- Local production-like build: `yarn build`
- Library build (publish artifact): `yarn build-lib`
- Tests (default watch mode): `yarn test`
- Tests (one-shot, preferred for agents/CI-like runs): `node --require tsm --test ./src/**/*-test.ts`

Note: `prepublishOnly` runs `yarn build-lib`.

## Testing Conventions

- Test runner is Node's built-in `node:test`.
- Only `src/**/*-test.ts` files are executed by the configured script.
- Keep fixtures in `src/__tests__/`, but ensure runnable tests use the `*-test.ts` suffix.
- When adding behavior in `src/core/*`, add or update tests whenever practical.

## TypeScript and Build Conventions

- Project uses `module: "NodeNext"` / `moduleResolution: "NodeNext"`.
- Prefer `import type` for type-only imports.
- Keep library entrypoints and exports stable (`src/index.ts` -> `lib/index.js`).
- `tsconfig.lib.json` excludes `**/__tests__/**`; do not rely on tests being emitted to `lib/`.

## Change Guidelines for Agents

### Do

- Make focused, minimal edits that preserve public API shape unless a breaking change is explicitly requested.
- Keep gather/build data contracts in sync when modifying shared graph structures.
- Preserve option defaults and behavior documented in `README.md` (`acceptableExts`, grouping, repetition filtering, env vars).
- Run relevant validation after substantive edits: `yarn build-lib` and one-shot tests.
- Update docs when changing user-facing options or output files.

### Don't

- Do not commit generated `lib/` artifacts.
- Do not rename or remove public `runGatherInfo`/`runBuildGraph` options without explicit approval.
- Do not introduce unrelated refactors in `src/core/buildUml.ts` or `src/core/gather.ts` while fixing focused issues.
- Do not assume lint/CI will catch regressions (no dedicated lint or CI workflow is configured).

## Risky Areas

Exercise extra care in:
- `src/core/buildUml.ts`: proxy resolution and repeated-node filtering.
- `src/core/gather.ts`: AST traversal and export/import inference edge cases.
- `src/core/walk.ts`: path resolution behavior (relative imports, extensions).
- Path resolution in `walk.ts`: small path/extension changes can silently exclude files.

When changing these files, prefer incremental edits, preserve existing behavior, and validate with a real/demo build.

## Debugging

- Verbose internal logging is toggled by `--debug` (see `src/utils.ts` and README troubleshooting).
- For build/debug reproduction, run the same command with `--debug` and inspect generated JSON artifacts.

## Documentation and Licensing

- Keep README examples aligned with API behavior and option names.
- Preserve project license and attribution metadata (`GPL-3.0-only` in `package.json`).
