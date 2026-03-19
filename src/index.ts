import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { gatherGraph } from './core/gather';
import { buildUmlFromGraph } from './core/buildUml';
import type { GatheredGraph } from './core/types';
import { defaultExtensions, gatheredGraphFileName, treeComponentsFileName } from './const';

export { gatherGraph, buildUmlFromGraph };

export const runGatherInfo = ({
  entryFileName,
  packagesPaths,
  acceptableExts = defaultExtensions,
  outFileName,
}: {
  entryFileName: string;
  packagesPaths: RegExp;
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
    packagesPaths,
    acceptableExts,
  });
  mkdirSync(path.dirname(normalizedOutFileName), { recursive: true });
  writeFileSync(normalizedOutFileName, JSON.stringify(graph));

  return graph;
};

export const runBuildUml = ({
  entryFileName,
  packagesPaths,
  gatheredGraphFilePath,
  outUmlFileName,
  isGroupByParentDirNeeded,
  repetitiveCountForRemoveFromTree,
}: {
  entryFileName: string;
  packagesPaths: RegExp;
  gatheredGraphFilePath: string;
  outUmlFileName: string;
  isGroupByParentDirNeeded?: boolean;
  repetitiveCountForRemoveFromTree?: number;
}) => {
  const normalizedEntryFileName = path.isAbsolute(entryFileName)
    ? entryFileName
    : path.resolve(process.cwd(), entryFileName);
  const normalizedGatheredGraphFilePath = path.isAbsolute(gatheredGraphFilePath)
    ? gatheredGraphFilePath
    : path.resolve(process.cwd(), gatheredGraphFilePath);
  const normalizedOutUmlFileName = path.isAbsolute(outUmlFileName)
    ? outUmlFileName
    : path.resolve(process.cwd(), outUmlFileName);

  const graph = JSON.parse(readFileSync(normalizedGatheredGraphFilePath, 'utf8')) as GatheredGraph;

  return buildUmlFromGraph({
    graph,
    entryFileName: normalizedEntryFileName,
    packagesPaths,
    outFileName: normalizedOutUmlFileName,
    isGroupByParentDirNeeded,
    repetitiveCountForRemoveFromTree,
  });
};

export const runFromEnv = () => {
  const rootPath = process.cwd();
  const rawEntryFileName = process.env.ENTRY ?? path.join(rootPath, 'packages/app/client.js');
  const entryFileName = path.isAbsolute(rawEntryFileName)
    ? rawEntryFileName
    : path.resolve(rootPath, rawEntryFileName);
  const packagesPathPattern = process.env.PACKAGES_PATHS_REGEX ?? `${rootPath}/(packages)`;
  const packagesPaths = new RegExp(packagesPathPattern);
  const acceptableExts = (process.env.EXTENSIONS ?? defaultExtensions.join(','))
    .split(',')
    .map((item) => item.replace(/^\./, '').trim())
    .filter(Boolean);
  const dumpDir = process.env.DUMP_DIR ?? path.join(rootPath, 'build/assets');
  const gatheredGraphFilePath = process.env.GATHERED_GRAPH_FILE ?? path.join(dumpDir, gatheredGraphFileName);
  const outUmlFileName = process.env.OUT_UML_FILE ?? path.join(dumpDir, treeComponentsFileName);
  const hasGatherFlag = process.env.IS_GATHER_INFO !== undefined;
  const hasBuildFlag = process.env.IS_BUILD_UML !== undefined;
  const hasAnyFlag = hasGatherFlag || hasBuildFlag;
  const shouldRunGather = hasAnyFlag ? process.env.IS_GATHER_INFO === 'true' : true;
  const shouldRunBuild = hasAnyFlag
    ? hasBuildFlag
      ? process.env.IS_BUILD_UML === 'true'
      : true
    : true;

  if (shouldRunGather) {
    runGatherInfo({
      entryFileName,
      packagesPaths,
      acceptableExts,
      outFileName: gatheredGraphFilePath,
    });
  }

  if (shouldRunBuild) {
    runBuildUml({
      entryFileName,
      packagesPaths,
      gatheredGraphFilePath,
      outUmlFileName,
      isGroupByParentDirNeeded: process.env.IS_GROUP_BY_PARENT_DIR === 'true',
      repetitiveCountForRemoveFromTree: process.env.REPETITIVE_COUNT_FOR_REMOVE_FROM_TREE
        ? Number(process.env.REPETITIVE_COUNT_FOR_REMOVE_FROM_TREE)
        : undefined,
    });
  }
};
