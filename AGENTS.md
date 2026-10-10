# AGENTS.md

## Purpose

This repository builds and publishes `react-to-uml`, a TypeScript library that gathers React component usage from source files and emits graph output without requiring Babel/Webpack plugin integration.

Core flow:
1. `src/core/walk.ts` traverses files from an entrypoint.
2. `src/core/gather.ts` parses imports/exports/JSX signals into graph data.
3. `src/core/buildGraph.ts` resolves graph edges and writes tree artifacts.
4. `src/index.ts` exposes orchestration helpers (`runGatherInfo`, `runBuildGraph`, `runFromEnv`, `startViewer`).
5. `src/cli.ts` is the `react-to-uml` bin (env-driven, `--serve` starts `src/serve.ts`).

## Repo Layout

- `src/`: library source code
- `src/__tests__/`: Node test files and fixtures
- `packages/`: local demo/workspace packages
- `lib/`: publish output from `yarn build` (library + `lib/graph-viewer`) (generated, not committed)
- `audits/`: local scripts/utilities

## Package Manager and Commands

Use Yarn in this repository (lockfile is `yarn.lock`).

- Install: `yarn`
- Sample repo (`packages/app`): `yarn sample` (or `sample:gather` / `sample:graph`); run the sample app with `yarn sample:app`
- Target repo from `.env` `ENTRY`: `yarn target` (or `target:gather` / `target:graph`)
- Viewer dev mode: `yarn dev:viewer`
- Publish build: `yarn build` (clean + `build:lib` + `build:viewer`)
- Tests (one-shot): `yarn test`; watch mode: `yarn test:watch`

Note: `prepublishOnly` runs `yarn test && yarn build`. No yarn workspaces (they force `private: true`); the sample library is linked via the `@ui/kit` `link:` devDependency.

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
- Run relevant validation after substantive edits: `yarn build` and `yarn test`.
- Update docs when changing user-facing options or output files.

### Don't

- Do not commit generated `lib/` artifacts.
- Do not rename or remove public `runGatherInfo`/`runBuildGraph` options without explicit approval.
- Do not introduce unrelated refactors in `src/core/buildGraph.ts` or `src/core/gather.ts` while fixing focused issues.
- Do not assume lint/CI will catch regressions (no dedicated lint or CI workflow is configured).

## Risky Areas

Exercise extra care in:
- `src/core/buildGraph.ts`: proxy resolution and repeated-node filtering.
- `src/core/gather.ts`: AST traversal and export/import inference edge cases.
- `src/core/walk.ts`: path resolution behavior (relative imports, extensions).
- Path resolution in `walk.ts`: small path/extension changes can silently exclude files.

When changing these files, prefer incremental edits, preserve existing behavior, and validate with a real/demo build.

## Debugging

- Reproduce with `yarn sample:gather` / `yarn target:gather` and inspect the generated JSON in `DUMP_DIR` (default `./assets`).
- Graph node ids are paths relative to the shared parent dir of all walked files (`GatheredGraph.rootDir`); `sourceFileNameByGraphPath` maps them back.

## Documentation and Licensing

- Keep README examples aligned with API behavior and option names.
- Preserve project license and attribution metadata (`GPL-3.0-only` in `package.json`).
