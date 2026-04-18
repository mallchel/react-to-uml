import { writeFileSync } from 'node:fs';

import { graphNodeMetaFileName } from '../const';
import { ensureArrExistence } from '../utils';
import type { BuildOptions, GatheredModuleConnection } from './types';

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
  proxyPathsWithJsx,
  seen = new Set<string>(),
}: {
  fileName: string;
  exportId: string;
  exportedIdsWithJsxByFileName: Map<string, string[]>;
  connectionsByFileName: Map<string, GatheredModuleConnection[]>;
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

  const connections = connectionsByFileName.get(fileName) ?? [];
  for (const connection of connections) {
    if (!connection.connectionIds.includes(exportId)) {
      continue;
    }

    const next = resolveTargetFileByExport({
      fileName: connection.targetFileName,
      exportId,
      exportedIdsWithJsxByFileName,
      connectionsByFileName,
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
  const counterPerFile = new Map<string, number>();
  const usedUserRequests = new Set<string>();

  const calcUsedConnections = ({
    connectionsUserRequest,
  }: {
    connectionsUserRequest?: string[];
  }) => {
    connectionsUserRequest?.forEach((connectionUserRequest) => {
      counterPerFile.set(
        connectionUserRequest,
        (counterPerFile.get(connectionUserRequest) ?? 0) + 1,
      );
      if (treeComponentsGraph.has(connectionUserRequest)) {
        calcUsedConnections({
          connectionsUserRequest: treeComponentsGraph.get(connectionUserRequest),
        });
      }
    });
  };

  const saveUsedUserRequests = ({
    connectionsUserRequest,
  }: {
    connectionsUserRequest?: string[];
  }) => {
    connectionsUserRequest?.forEach((connectionUserRequest) => {
      const currentCount = counterPerFile.get(connectionUserRequest) ?? 0;
      if (currentCount > 0 && currentCount <= repetitiveCountForRemoveFromTree) {
        usedUserRequests.add(connectionUserRequest);
      }
      saveUsedUserRequests({
        connectionsUserRequest: treeComponentsGraph.get(connectionUserRequest),
      });
    });
  };

  calcUsedConnections({
    connectionsUserRequest: treeComponentsGraph.get(shortenedEntryFileName),
  });
  usedUserRequests.add(shortenedEntryFileName);
  saveUsedUserRequests({
    connectionsUserRequest: treeComponentsGraph.get(shortenedEntryFileName),
  });

  return usedUserRequests;
};

export const buildGraphFromGraph = ({
  graph,
  entryFileName,
  outFileName,
  isGroupByParentDirNeeded = false,
  repetitiveCountForRemoveFromTree = 4,
}: BuildOptions) => {
  const connectionsByFileName = new Map(graph.connectionsByFileName);
  const exportedIdsWithJsxByFileName = new Map(graph.exportedIdsWithJsxByFileName);
  const sourceFileNameByGraphPath = new Map(graph.sourceFileNameByGraphPath ?? []);
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
    const shouldIncludeFile = filesWithJsxExports.has(fileName) || fileName === entryFileName;
    if (!shouldIncludeFile) {
      return;
    }
    treeComponentsGraph.set(
      fileName,
      targets.filter((targetFileName) => filesWithJsxExports.has(targetFileName)),
    );
  });
  const effectiveRootFileName = treeComponentsGraph.has(entryFileName)
    ? entryFileName
    : ((treeComponentsGraph.keys().next().value as string | undefined) ?? entryFileName);

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
