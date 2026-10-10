import { writeFileSync } from 'node:fs';

import { graphNodeMetaFileName } from '../const';
import { ensureArrExistence } from '../utils';
import type { BuildOptions, GatheredModuleConnection, GatheredReExport } from './types';

const getPathSegments = (fileName: string) => {
  return fileName.split('/').filter((chunk) => chunk && chunk !== '.');
};

const getPackageFromWorkspacePath = (fileName: string) => {
  const segments = fileName
    .replace(/\\/g, '/')
    .split('/')
    .filter((chunk) => chunk && chunk !== '.');
  const packagesIdx = segments.findIndex((segment) => segment === 'packages');
  return packagesIdx >= 0 ? segments[packagesIdx + 1] : undefined;
};

const getNodeMeta = ({
  fileName,
  originalFileName,
  defaultPackageName,
}: {
  fileName: string;
  originalFileName?: string;
  defaultPackageName?: string;
}) => {
  const segments = getPathSegments(fileName);
  const dirs = segments.slice(0, -1);
  const packageFromWorkspace =
    getPackageFromWorkspacePath(originalFileName ?? '') ?? getPackageFromWorkspacePath(fileName);

  return {
    packageName: packageFromWorkspace ?? defaultPackageName ?? dirs[0] ?? 'root',
    dirs,
  };
};

const resolveTargetFileByExport = ({
  fileName,
  exportId,
  exportedIdsWithJsxByFileName,
  connectionsByFileName,
  reExportsByFileName,
  proxyPathsWithJsx,
  seen = new Set<string>(),
}: {
  fileName: string;
  exportId: string;
  exportedIdsWithJsxByFileName: Map<string, string[]>;
  connectionsByFileName: Map<string, GatheredModuleConnection[]>;
  reExportsByFileName?: Map<string, GatheredReExport[]>;
  proxyPathsWithJsx: Map<string, Map<string, string>>;
  seen?: Set<string>;
}): string | undefined => {
  const key = `${fileName}:${exportId}`;
  if (seen.has(key)) {
    return proxyPathsWithJsx.get(fileName)?.get(exportId);
  }
  seen.add(key);

  if (exportedIdsWithJsxByFileName.get(fileName)?.includes(exportId)) {
    proxyPathsWithJsx.set(
      fileName,
      (proxyPathsWithJsx.get(fileName) ?? new Map()).set(exportId, fileName),
    );
    return fileName;
  }

  // follow only real re-exports; graphs gathered before re-exports were recorded
  // fall back to treating any import with the same id as a re-export
  const hops = reExportsByFileName
    ? (reExportsByFileName.get(fileName) ?? []).flatMap((reExport) => {
        if (reExport.exportedId === exportId) {
          return [{ targetFileName: reExport.targetFileName, targetExportId: reExport.importedId }];
        }
        if (reExport.exportedId === '*' && exportId !== 'default') {
          return [{ targetFileName: reExport.targetFileName, targetExportId: exportId }];
        }
        return [];
      })
    : (connectionsByFileName.get(fileName) ?? [])
        .filter((connection) => connection.connectionIds.includes(exportId))
        .map((connection) => ({ targetFileName: connection.targetFileName, targetExportId: exportId }));

  for (const { targetFileName, targetExportId } of hops) {
    const next = resolveTargetFileByExport({
      fileName: targetFileName,
      exportId: targetExportId,
      exportedIdsWithJsxByFileName,
      connectionsByFileName,
      reExportsByFileName,
      proxyPathsWithJsx,
      seen,
    });

    if (next) {
      if (!proxyPathsWithJsx.has(fileName)) {
        proxyPathsWithJsx.set(fileName, new Map());
      }
      proxyPathsWithJsx.get(fileName)!.set(exportId, next);
      return next;
    }
  }

  return undefined;
};

const calcUsedUserRequests = ({
  treeComponentsGraph,
  shortenedEntryFileName,
  repetitiveCountForRemoveFromTree,
}: {
  treeComponentsGraph: Map<string, string[]>;
  shortenedEntryFileName: string;
  repetitiveCountForRemoveFromTree: number;
}) => {
  // counts how many times each node is reached when the tree is expanded from the entry
  // (cycles are cut per branch). Counting stops once a node passes the limit: everything
  // below it would pass the limit too, so it is marked at once. This keeps the work bounded
  // instead of walking every path, which explodes on large graphs.
  const counterPerFile = new Map<string, number>();
  const overLimit = new Set<string>();
  const branch = new Set<string>([shortenedEntryFileName]);

  const markOverLimit = (fileName: string) => {
    const queue = [fileName];
    while (queue.length) {
      const next = queue.pop()!;
      if (overLimit.has(next)) {
        continue;
      }
      overLimit.add(next);
      queue.push(...(treeComponentsGraph.get(next) ?? []));
    }
  };

  const countConnections = (fromFileName: string) => {
    (treeComponentsGraph.get(fromFileName) ?? []).forEach((target) => {
      if (overLimit.has(target)) {
        return;
      }
      const count = (counterPerFile.get(target) ?? 0) + 1;
      counterPerFile.set(target, count);
      if (count > repetitiveCountForRemoveFromTree) {
        markOverLimit(target);
        return;
      }
      if (branch.has(target)) {
        return;
      }
      branch.add(target);
      countConnections(target);
      branch.delete(target);
    });
  };

  countConnections(shortenedEntryFileName);

  const usedUserRequests = new Set<string>([shortenedEntryFileName]);
  counterPerFile.forEach((count, fileName) => {
    if (!overLimit.has(fileName) && count <= repetitiveCountForRemoveFromTree) {
      usedUserRequests.add(fileName);
    }
  });

  return usedUserRequests;
};

export const buildGraphFromGraph = ({
  graph,
  entryFileName,
  outFileName,
  repetitiveCountForRemoveFromTree = 4,
}: BuildOptions) => {
  const connectionsByFileName = new Map(graph.connectionsByFileName);
  const exportedIdsWithJsxByFileName = new Map(graph.exportedIdsWithJsxByFileName);
  const sourceFileNameByGraphPath = new Map(graph.sourceFileNameByGraphPath ?? []);
  const reExportsByFileName = graph.reExportsByFileName
    ? new Map(graph.reExportsByFileName)
    : undefined;
  // graph keys are shortened paths, so map the filesystem entry onto its graph path
  const entryGraphPath =
    graph.entryGraphPath ??
    [...sourceFileNameByGraphPath.entries()].find(
      ([, sourceFileName]) => sourceFileName === entryFileName,
    )?.[0] ??
    entryFileName;
  const filesWithJsxExports = new Set(exportedIdsWithJsxByFileName.keys());
  const proxyPathsWithJsx = new Map<string, Map<string, string>>();
  const treeComponentsGraphAll = new Map<string, string[]>();

  connectionsByFileName.forEach((connections, fileName) => {
    ensureArrExistence(treeComponentsGraphAll, fileName);

    connections.forEach((connection) => {
      connection.connectionIds.forEach((connectionId) => {
        const targetFileName = resolveTargetFileByExport({
          fileName: connection.targetFileName,
          exportId: connectionId,
          exportedIdsWithJsxByFileName,
          connectionsByFileName,
          reExportsByFileName,
          proxyPathsWithJsx,
        });

        if (!targetFileName) {
          return;
        }

        const subtree = treeComponentsGraphAll.get(fileName)!;
        if (!subtree.includes(targetFileName)) {
          subtree.push(targetFileName);
        }
      });
    });
  });

  const treeComponentsGraph = new Map<string, string[]>();
  treeComponentsGraphAll.forEach((targets, fileName) => {
    const shouldIncludeFile = filesWithJsxExports.has(fileName) || fileName === entryGraphPath;
    if (!shouldIncludeFile) {
      return;
    }
    treeComponentsGraph.set(
      fileName,
      targets.filter((targetFileName) => filesWithJsxExports.has(targetFileName)),
    );
  });
  const effectiveRootFileName = treeComponentsGraph.has(entryGraphPath)
    ? entryGraphPath
    : ((treeComponentsGraph.keys().next().value as string | undefined) ?? entryGraphPath);

  const usedUserRequests = calcUsedUserRequests({
    treeComponentsGraph,
    shortenedEntryFileName: effectiveRootFileName,
    repetitiveCountForRemoveFromTree,
  });
  const defaultPackageName = getPackageFromWorkspacePath(entryFileName);
  const graphNodeMetaByFileName: Record<string, { packageName: string; dirs: string[] }> = {};
  const allFileNames = new Set<string>();

  treeComponentsGraph.forEach((targets, fileName) => {
    allFileNames.add(fileName);
    targets.forEach((targetFileName) => {
      allFileNames.add(targetFileName);
    });
  });

  allFileNames.forEach((fileName) => {
    graphNodeMetaByFileName[fileName] = getNodeMeta({
      fileName,
      originalFileName: sourceFileNameByGraphPath.get(fileName),
      defaultPackageName,
    });
  });

  writeFileSync(outFileName, JSON.stringify([...treeComponentsGraph.entries()]));
  writeFileSync(
    outFileName.split('/').slice(0, -1).join('/') + '/proxyPathsWithJsx.json',
    JSON.stringify([...proxyPathsWithJsx.entries()], (key, value) => {
      if (value instanceof Map) {
        return [...value.entries()];
      }
      return value;
    }),
  );
  writeFileSync(
    outFileName.split('/').slice(0, -1).join('/') + `/${graphNodeMetaFileName}`,
    JSON.stringify(graphNodeMetaByFileName),
  );

  return { treeComponentsGraph, proxyPathsWithJsx, usedUserRequests };
};
