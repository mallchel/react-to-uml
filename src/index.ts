import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { gatherGraph } from './core/gather';
import { buildGraphFromGraph } from './core/buildGraph';
import { startViewer } from './serve';
import type { GatheredGraph } from './core/types';
import { defaultExtensions, gatheredGraphFileName, treeComponentsFileName } from './const';

export { gatherGraph, buildGraphFromGraph, startViewer };
export type { ViewerConfig } from './serve';
export type {
  BuildOptions,
  GatheredGraph,
  GatheredModuleConnection,
  GatherOptions,
} from './core/types';

export const runGatherInfo = ({
  entryFileName,
  acceptableExts = defaultExtensions,
  outFileName,
}: {
  entryFileName: string;
  acceptableExts?: string[];
  outFileName: string;
}) => {
  const normalizedEntryFileName = path.isAbsolute(entryFileName)
    ? entryFileName
    : path.resolve(process.cwd(), entryFileName);
  const normalizedOutFileName = path.isAbsolute(outFileName)
    ? outFileName
    : path.resolve(process.cwd(), outFileName);

  const graph = gatherGraph({
    entryFileName: normalizedEntryFileName,
    acceptableExts,
  });
  mkdirSync(path.dirname(normalizedOutFileName), { recursive: true });
  writeFileSync(normalizedOutFileName, JSON.stringify(graph));

  return graph;
};

export const runBuildGraph = ({
  entryFileName,
  gatheredGraphFilePath,
  outGraphFileName,
  repetitiveCountForRemoveFromTree,
}: {
  entryFileName: string;
  gatheredGraphFilePath: string;
  outGraphFileName: string;
  repetitiveCountForRemoveFromTree?: number;
}) => {
  const normalizedEntryFileName = path.isAbsolute(entryFileName)
    ? entryFileName
    : path.resolve(process.cwd(), entryFileName);
  const normalizedGatheredGraphFilePath = path.isAbsolute(gatheredGraphFilePath)
    ? gatheredGraphFilePath
    : path.resolve(process.cwd(), gatheredGraphFilePath);
  const normalizedOutGraphFileName = path.isAbsolute(outGraphFileName)
    ? outGraphFileName
    : path.resolve(process.cwd(), outGraphFileName);

  const graph = JSON.parse(readFileSync(normalizedGatheredGraphFilePath, 'utf8')) as GatheredGraph;
  mkdirSync(path.dirname(normalizedOutGraphFileName), { recursive: true });

  return buildGraphFromGraph({
    graph,
    entryFileName: normalizedEntryFileName,
    outFileName: normalizedOutGraphFileName,
    repetitiveCountForRemoveFromTree,
  });
};

/**
 * Reads options from env vars and runs the gather and/or build steps.
 * Without IS_GATHER_INFO / IS_BUILD_GRAPH both steps run.
 * Returns the directory with generated graph files.
 */
export const runFromEnv = () => {
  const parseBooleanEnv = (value: string | undefined, defaultValue: boolean) => {
    if (value === undefined) {
      return defaultValue;
    }
    return value === 'true';
  };
  const resolveFromCwd = (fileName: string) =>
    path.isAbsolute(fileName) ? fileName : path.resolve(process.cwd(), fileName);

  const entryFileName = resolveFromCwd(process.env.ENTRY ?? 'packages/app/client.js');
  const acceptableExts = (process.env.EXTENSIONS ?? defaultExtensions.join(','))
    .split(',')
    .map((item) => item.replace(/^\./, '').trim())
    .filter(Boolean);
  const dumpDir = resolveFromCwd(process.env.DUMP_DIR ?? 'assets');
  const gatheredGraphFilePath = resolveFromCwd(
    process.env.GATHERED_GRAPH_FILE ?? path.join(dumpDir, gatheredGraphFileName),
  );
  const outGraphFileName = resolveFromCwd(
    process.env.OUT_GRAPH_FILE ?? path.join(dumpDir, treeComponentsFileName),
  );
  const hasStageFlag =
    process.env.IS_GATHER_INFO !== undefined || process.env.IS_BUILD_GRAPH !== undefined;
  const shouldRunGather = parseBooleanEnv(process.env.IS_GATHER_INFO, !hasStageFlag);
  const shouldRunBuild = parseBooleanEnv(process.env.IS_BUILD_GRAPH, !hasStageFlag);

  if (shouldRunGather) {
    if (!existsSync(entryFileName)) {
      throw new Error(`Entry file not found: ${entryFileName}. Set ENTRY to your app entry file.`);
    }
    runGatherInfo({
      entryFileName,
      acceptableExts,
      outFileName: gatheredGraphFilePath,
    });
    console.log(`Gathered graph data: ${gatheredGraphFilePath}`);
  }

  if (shouldRunBuild) {
    runBuildGraph({
      entryFileName,
      gatheredGraphFilePath,
      outGraphFileName,
    });
    console.log(`Built graph: ${outGraphFileName}`);
  }

  return { outputDir: path.dirname(outGraphFileName) };
};
