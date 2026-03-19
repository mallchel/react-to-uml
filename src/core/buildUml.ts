import { writeFileSync } from 'node:fs';

import { ensureArrExistence, excludePackagesPaths } from '../utils';
import type { BuildOptions, GatheredModuleConnection } from './types';

const lineColors = [
  '#006400',
  '#000000',
  '#0000FF',
  '#8A2BE2',
  '#A52A2A',
  '#DEB887',
  '#5F9EA0',
  '#D2691E',
  '#8B008B',
  '#483D8B',
];

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
  treeComponentsUML,
  shortenedEntryFileName,
  repetitiveCountForRemoveFromTree,
}: {
  treeComponentsUML: Map<string, string[]>;
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
      if (treeComponentsUML.has(connectionUserRequest)) {
        calcUsedConnections({
          connectionsUserRequest: treeComponentsUML.get(connectionUserRequest),
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
        connectionsUserRequest: treeComponentsUML.get(connectionUserRequest),
      });
    });
  };

  calcUsedConnections({
    connectionsUserRequest: treeComponentsUML.get(shortenedEntryFileName),
  });
  usedUserRequests.add(shortenedEntryFileName);
  saveUsedUserRequests({
    connectionsUserRequest: treeComponentsUML.get(shortenedEntryFileName),
  });

  return usedUserRequests;
};

const buildUmlText = ({
  treeComponentsUML,
  usedUserRequests,
  isGroupByParentDirNeeded,
}: {
  treeComponentsUML: Map<string, string[]>;
  usedUserRequests: Set<string>;
  isGroupByParentDirNeeded?: boolean;
}) => {
  const joinChunks = (arr: string[]) => arr.join('');
  const createFrame = (framePath: string, rects: string[]) =>
    `frame "${framePath}" {\n  ${joinChunks(rects)}\n }\n`;
  const createRect = (rectPath: string) => `rectangle "${rectPath}" {\n}\n`;
  const hasBeenWritten: Record<string, boolean> = {};
  const addRect = ({ rectPath, userRequest }: { rectPath: string; userRequest: string }) => {
    if (!hasBeenWritten[userRequest] && usedUserRequests.has(userRequest)) {
      hasBeenWritten[userRequest] = true;
      return createRect(rectPath);
    }
    return '';
  };

  const addConnection = ({
    connectionPathFrom,
    connectionsPathTo,
    connectionsUserRequest,
  }: {
    connectionPathFrom: string;
    connectionsPathTo: string[];
    connectionsUserRequest: string[];
  }) => {
    return joinChunks(
      connectionsUserRequest.map((connectionUserRequest, index) => {
        const connectionPathTo = connectionsPathTo[index];
        if (!connectionPathTo || !usedUserRequests.has(connectionUserRequest)) {
          return '';
        }
        return `[${connectionPathFrom}] -[${lineColors[index % lineColors.length]}]-> [${connectionPathTo}]\n`;
      }),
    );
  };

  const getFrameRectPaths = (userRequest: string) => {
    const chunks = userRequest.split('/');
    if (chunks.length <= 2) {
      return { framePath: '', rectPath: chunks.join('/') };
    }
    const [, framePath, ...restPath] = chunks;
    return { framePath, rectPath: restPath.join('/') };
  };

  const rectsByFrame = new Map<string, string[]>();
  const rectsWithoutFrame: string[] = [];
  const writeRect = (userRequest: string) => {
    const { framePath, rectPath } = getFrameRectPaths(userRequest);
    const rect = addRect({ rectPath, userRequest });
    if (!framePath || !isGroupByParentDirNeeded) {
      rectsWithoutFrame.push(rect);
      return { rectPath };
    }
    ensureArrExistence(rectsByFrame, framePath);
    if (rect) {
      rectsByFrame.get(framePath)!.push(rect);
    }
    return { rectPath };
  };

  const mapToSetRectsByFrame = (fileNames: string[]) =>
    fileNames.map((fileName) => writeRect(fileName).rectPath);
  const connections: string[] = [];

  treeComponentsUML.forEach((connectionsUserRequest, userRequest) => {
    if (!usedUserRequests.has(userRequest)) {
      return;
    }
    const { rectPath: nextUserRequest } = writeRect(userRequest);
    const nextConnectionsUserRequest = mapToSetRectsByFrame(connectionsUserRequest);
    connections.push(
      addConnection({
        connectionPathFrom: nextUserRequest,
        connectionsPathTo: nextConnectionsUserRequest,
        connectionsUserRequest,
      }),
    );
  });

  const frames: string[] = [];
  rectsByFrame.forEach((rects, framePath) => {
    frames.push(createFrame(framePath, rects));
  });

  return joinChunks([
    '@startuml\nleft to right direction\n',
    joinChunks(frames),
    joinChunks(rectsWithoutFrame),
    joinChunks(connections),
    '@enduml',
  ]);
};

export const buildUmlFromGraph = ({
  graph,
  entryFileName,
  packagesPaths,
  outFileName,
  isGroupByParentDirNeeded,
  repetitiveCountForRemoveFromTree = 4,
}: BuildOptions) => {
  const connectionsByFileName = new Map(graph.connectionsByFileName);
  const exportedIdsWithJsxByFileName = new Map(graph.exportedIdsWithJsxByFileName);
  const proxyPathsWithJsx = new Map<string, Map<string, string>>();
  const treeComponentsUML = new Map<string, string[]>();

  connectionsByFileName.forEach((connections, fileName) => {
    ensureArrExistence(treeComponentsUML, fileName);

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

        const subtree = treeComponentsUML.get(fileName)!;
        if (!subtree.includes(targetFileName)) {
          subtree.push(targetFileName);
        }
      });
    });
  });

  const shortenedEntryFileName = excludePackagesPaths(entryFileName, packagesPaths);
  const usedUserRequests = calcUsedUserRequests({
    treeComponentsUML,
    shortenedEntryFileName,
    repetitiveCountForRemoveFromTree,
  });
  const uml = buildUmlText({
    treeComponentsUML,
    usedUserRequests,
    isGroupByParentDirNeeded,
  });
  writeFileSync(outFileName, JSON.stringify([...treeComponentsUML.entries()]));
  writeFileSync(outFileName.split('.')[0] + '.uml', uml);
  writeFileSync(
    outFileName.split('/').slice(0, -1).join('/') + '/proxyPathsWithJsx.json',
    JSON.stringify([...proxyPathsWithJsx.entries()], (key, value) => {
      if (value instanceof Map) {
        return [...value.entries()];
      }
      return value;
    }),
  );

  return { treeComponentsUML, proxyPathsWithJsx, usedUserRequests };
};
