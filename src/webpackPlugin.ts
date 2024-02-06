import { readFileSync, writeFileSync } from 'fs';
import { Compilation, Compiler, ExternalModule, Module, ModuleGraphConnection } from 'webpack';

import {
  createArray,
  ensureMapExistence,
  ensureObjExistence,
  ensureArrExistence,
  excludePackagesPaths,
  getIsAcceptableModule,
  // ensureSetExistence,
  debugLog,
} from './utils';
import type { ConnectionIdsByFileName, ModuleExtended } from './types';

const pluginName = 'MakeUmlFromCode';

export class MakeUmlFromCode {
  treeComponentsUML: Map<string, Array<string>> = new Map();
  isGroupByParentDirNeeded?: boolean;
  repetitiveCountForRemoveFromTree: number;
  entryFileName: string;
  shortenedEntryFileName: string;
  onStart: () => void;
  packagesPaths: RegExp;
  outFileName: string;
  gatheredComponentsFileName: string;
  connectionIdsByFileName: ConnectionIdsByFileName;
  exportedIdsWithJsxByFileName: ConnectionIdsByFileName;
  usedUserRequests: Set<string> = new Set();
  visitedKey = Symbol('visited-key');
  proxyPathsWithJsx: Map<string, Map<string, string>> = new Map();
  lineColors = [
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

  constructor({
    entryFileName,
    onStart,
    packagesPaths,
    outFileName,
    gatheredComponentsFileName,
    isGroupByParentDirNeeded,
    repetitiveCountForRemoveFromTree = 4,
  }: {
    entryFileName: string;
    onStart: () => void;
    packagesPaths: RegExp;
    outFileName: string;
    gatheredComponentsFileName: string;
    isGroupByParentDirNeeded?: boolean;
    repetitiveCountForRemoveFromTree?: number;
  }) {
    this.entryFileName = entryFileName;
    this.onStart = onStart;
    this.packagesPaths = packagesPaths;
    this.repetitiveCountForRemoveFromTree = repetitiveCountForRemoveFromTree;
    this.outFileName = outFileName;
    this.gatheredComponentsFileName = gatheredComponentsFileName;
    this.shortenedEntryFileName = this.excludePackagesPaths(this.entryFileName);
    this.isGroupByParentDirNeeded = isGroupByParentDirNeeded;
  }

  excludePackagesPaths = (fileName = '') => {
    return excludePackagesPaths(fileName, this.packagesPaths);
  };

  getExportConnectionIdPair = ({ dependency }: { dependency: unknown }) => {
    const nextDependency = dependency as {
      ids?: string[];
      name?: string;
      usedByExports?: Set<string> | false | true;
      activeExports?: Set<string>;
    };

    if (!nextDependency.ids?.[0] || !nextDependency.name) {
      return undefined;
    }

    const connectionId = nextDependency.ids[0];

    if (connectionId === 'default') {
      return {
        connectionId,
        // 1. check if it was exported as default
        exportId: (nextDependency.usedByExports as Set<string>)?.has?.(connectionId)
          ? connectionId
          : // 2. check by local name in named exports
          nextDependency.activeExports?.has(nextDependency.name)
          ? nextDependency.name
          : undefined,
      };
    }

    return {
      connectionId,
      // name is the export name here
      exportId: nextDependency.name,
    };
  };

  getTargetUserRequest = ({
    shortenedConnectionUserRequest,
    exportId,
  }: {
    shortenedConnectionUserRequest: string;
    exportId: string;
  }) => {
    return this.exportedIdsWithJsxByFileName.get(shortenedConnectionUserRequest)?.includes(exportId)
      ? shortenedConnectionUserRequest
      : this.proxyPathsWithJsx.get(shortenedConnectionUserRequest)?.get(exportId);
  };

  // FIXME: remove proxy paths from tree to avoid redundant used count
  // FIXME: remove connections from treeUML without root parent
  tryToAddToTree = ({
    userRequest,
    shortenedConnectionUserRequest,
    connectionId,
  }: {
    userRequest: string;
    shortenedConnectionUserRequest: string;
    connectionId: string;
  }) => {
    const shortModuleUserRequest = this.excludePackagesPaths(userRequest);

    ensureArrExistence(this.treeComponentsUML, shortModuleUserRequest);

    const targetConnectionUserRequest = this.getTargetUserRequest({
      shortenedConnectionUserRequest,
      exportId: connectionId,
    });

    if (targetConnectionUserRequest) {
      debugLog('tryToAddToTree', {
        userRequest,
        targetConnectionUserRequest,
        connectionId,
      });
      const shortConnectionUserRequest = this.excludePackagesPaths(targetConnectionUserRequest);
      const subtree = this.treeComponentsUML.get(shortModuleUserRequest);

      // TODO: replace with the Set
      if (
        subtree &&
        // avoid duplicates when there are several uses of the same component
        !subtree.includes(shortConnectionUserRequest)
      ) {
        subtree.push(this.excludePackagesPaths(shortConnectionUserRequest));
      }
    }
  };

  mapUniqModuleUserRequests = ({
    module,
    compilation,
    callback,
  }: {
    module: ModuleExtended;
    compilation: Compilation;
    callback: (params: {
      shortenedConnectionUserRequest: string;
      connectionResolvedModule: ModuleExtended;
      exportConnectionIdPairs: Array<{
        exportId?: string;
        connectionId: string;
      }>;
    }) => void;
  }) => {
    // gathering imports
    const connections = compilation.moduleGraph.getOutgoingConnections(module);
    const gatheredConnections = new Map<
      string,
      {
        connection: ModuleGraphConnection;
        exportConnectionIdPairs: Array<{
          exportId?: string;
          connectionId: string;
        }>;
      }
    >();

    for (const connection of connections) {
      const { userRequest: connectionUserRequest } = connection.resolvedModule as ModuleExtended;

      if (
        !getIsAcceptableModule({
          packagesPaths: this.packagesPaths,
          filename: connectionUserRequest,
        })
      ) {
        continue;
      }

      const exportConnectionIdPair = this.getExportConnectionIdPair({
        dependency: connection.dependency,
      });

      if (!exportConnectionIdPair) {
        continue;
      }

      ensureObjExistence(gatheredConnections, connectionUserRequest, {
        connection: {},
        exportConnectionIdPairs: [],
      });

      const connectionData = gatheredConnections.get(connectionUserRequest)!;
      connectionData.connection = connection;
      connectionData.exportConnectionIdPairs.push(exportConnectionIdPair);
    }

    gatheredConnections.forEach(
      ({ connection, exportConnectionIdPairs }, connectionUserRequest) => {
        callback({
          shortenedConnectionUserRequest: this.excludePackagesPaths(connectionUserRequest),
          connectionResolvedModule: connection.resolvedModule as ModuleExtended,
          exportConnectionIdPairs,
        });
      },
    );
  };

  mapModuleConnectionIds = ({
    module,
    compilation,
    callback,
  }: {
    module: ModuleExtended;
    compilation: Compilation;
    callback: (params: {
      connectionId: string;
      shortenedConnectionUserRequest: string;
      connectionResolvedModule: Module;
    }) => void;
  }) => {
    this.mapUniqModuleUserRequests({
      module,
      compilation,
      callback: ({
        connectionResolvedModule,
        exportConnectionIdPairs,
        shortenedConnectionUserRequest,
      }) => {
        exportConnectionIdPairs.forEach(({ connectionId }) => {
          callback({
            connectionId,
            shortenedConnectionUserRequest,
            connectionResolvedModule,
          });
        });
      },
    });
  };

  tryToAddToProxyPathsWithJsx = ({
    shortenedModuleUserRequest,
    connectionId,
    exportId,
    shortenedConnectionUserRequest,
  }: {
    shortenedModuleUserRequest: string;
    connectionId: string;
    exportId: string;
    shortenedConnectionUserRequest: string;
  }) => {
    debugLog('tryToAddToProxyPathsWithJsx', {
      shortenedModuleUserRequest,
      connectionId,
      exportId,
      shortenedConnectionUserRequest,
    });

    const addProxyPath = ({
      shortenedModuleUserRequest,
      exportId,
      shortenedConnectionUserRequest,
    }: {
      shortenedModuleUserRequest: string;
      exportId: string;
      shortenedConnectionUserRequest: string;
    }) => {
      debugLog('addProxyPath', {
        shortenedModuleUserRequest,
        exportId,
        shortenedConnectionUserRequest,
      });
      ensureMapExistence(this.proxyPathsWithJsx, shortenedModuleUserRequest);
      this.proxyPathsWithJsx
        .get(shortenedModuleUserRequest)!
        .set(exportId, shortenedConnectionUserRequest);
    };

    const targetConnectionUserRequest = this.getTargetUserRequest({
      shortenedConnectionUserRequest,
      exportId: connectionId,
    });

    if (targetConnectionUserRequest) {
      addProxyPath({
        shortenedModuleUserRequest,
        exportId,
        shortenedConnectionUserRequest: targetConnectionUserRequest,
      });
    }
  };

  onResolvedConnection = (connectionData: {
    exportConnectionIdPairs: Array<{ connectionId: string; exportId?: string }>;
    shortenedModuleUserRequest: string;
    shortenedConnectionUserRequest: string;
  }) => {
    debugLog('onResolvedConnection', {
      connectionData,
      exportConnectionIdPairs: connectionData.exportConnectionIdPairs,
    });

    connectionData.exportConnectionIdPairs.forEach(({ connectionId, exportId }) => {
      if (!exportId) {
        return;
      }

      this.tryToAddToProxyPathsWithJsx({
        shortenedModuleUserRequest: connectionData.shortenedModuleUserRequest,
        connectionId,
        exportId,
        shortenedConnectionUserRequest: connectionData.shortenedConnectionUserRequest,
      });
    });
  };

  resolveProxyFile = ({
    compilation,
    module,
    shortenedModuleUserRequest,
  }: {
    compilation: Compilation;
    module: ModuleExtended;
    shortenedModuleUserRequest: string;
  }) => {
    const possibleConnectionsWithExportedJsx = new Map<
      string,
      {
        module: ModuleExtended;
        // Array because we might have multiple exports by different id of the same connectionId
        exportConnectionIdPairs: Array<{ connectionId: string; exportId: string }>;
        exportIds: Set<string>;
        connectionIds: Set<string>;
        exportIdByConnection: Map<string, string>;
      }
    >();
    debugLog('resolveProxyFile', {
      shortenedModuleUserRequest,
    });

    this.mapUniqModuleUserRequests({
      module,
      compilation,
      callback: ({
        shortenedConnectionUserRequest,
        connectionResolvedModule,
        exportConnectionIdPairs,
      }) => {
        exportConnectionIdPairs.forEach(({ exportId, connectionId }) => {
          if (!exportId) {
            return;
          }

          ensureObjExistence(possibleConnectionsWithExportedJsx, shortenedConnectionUserRequest, {
            module: undefined,
            exportConnectionIdPairs: [],
            exportIdByConnection: new Map(),
            exportIds: new Set(),
            connectionIds: new Set(),
          });

          const connectionDataToResolve = possibleConnectionsWithExportedJsx.get(
            shortenedConnectionUserRequest,
          )!;
          connectionDataToResolve.module = connectionResolvedModule;
          connectionDataToResolve.exportConnectionIdPairs.push({ connectionId, exportId });
          connectionDataToResolve.exportIdByConnection.set(connectionId, exportId);
          connectionDataToResolve.exportIds.add(exportId);
          connectionDataToResolve.connectionIds.add(connectionId);
        });
      },
    });

    possibleConnectionsWithExportedJsx.forEach((value, shortenedConnectionUserRequest) => {
      debugLog('possibleConnectionsWithExportedJsx.forEach', {
        shortenedConnectionUserRequest,
        exportConnectionIdPairs: value.exportConnectionIdPairs,
        connectionIds: value.connectionIds,
        shortenedModuleUserRequest,
      });

      // resolve nested
      this.resolveConnectionProxyPath({
        compilation,
        module: value.module,
        shortenedModuleUserRequest: shortenedConnectionUserRequest,
        parentModule: module,
        shortenedParentUserRequest: shortenedModuleUserRequest,
        parentExportConnectionIdPairs: value.exportConnectionIdPairs,
      });

      // resolve current
      value.connectionIds.forEach((connectionId) => {
        this.tryToAddToProxyPathsWithJsx({
          shortenedModuleUserRequest,
          connectionId,
          exportId: value.exportIdByConnection.get(connectionId)!,
          shortenedConnectionUserRequest: shortenedConnectionUserRequest,
        });
      });
    });
  };

  resolvedConnectionsSet = new Set();

  resolveConnectionProxyPath = ({
    compilation,
    module,
    shortenedModuleUserRequest = this.excludePackagesPaths(module.userRequest),
    parentModule = undefined,
    shortenedParentUserRequest = undefined,
    parentExportConnectionIdPairs = undefined,
    onResolvedConnection = this.onResolvedConnection,
  }: {
    compilation: Compilation;
    module: ModuleExtended;
    shortenedModuleUserRequest?: string;
    parentModule?: ModuleExtended;
    shortenedParentUserRequest?: string;
    parentExportConnectionIdPairs?: Array<{ connectionId: string; exportId: string }>;
    onResolvedConnection?: (params: {
      shortenedConnectionUserRequest: string;
      shortenedModuleUserRequest: string;
      exportConnectionIdPairs: Array<{
        exportId?: string;
        connectionId: string;
      }>;
    }) => void;
  }) => {
    debugLog('resolveConnectionProxyPath', {
      shortenedModuleUserRequest,
      shortenedParentUserRequest,
    });

    if (parentModule && parentExportConnectionIdPairs) {
      const shortenedModuleUserRequest = this.excludePackagesPaths(module.userRequest);
      const resolvedKey =
        this.excludePackagesPaths(parentModule.userRequest) +
        shortenedModuleUserRequest +
        parentExportConnectionIdPairs
          .reduce((acc, { connectionId, exportId }) => {
            acc.push(connectionId);
            acc.push(exportId);

            return acc;
          }, [] as Array<string>)
          .join();

      if (this.resolvedConnectionsSet.has(resolvedKey)) {
        debugLog('this.resolvedConnectionsSet.has', {
          userRequest: module.userRequest,
          'parentModule?.userRequest': parentModule?.userRequest,
          resolvedKey,
          // proxyPathsWithJsx: this.proxyPathsWithJsx,
        });
        return;
      }

      this.resolvedConnectionsSet.add(resolvedKey);
    }

    const possibleProxyModulesByUserRequest = new Map<
      string,
      {
        connectionIds: Array<string>;
        connectionModule: ModuleExtended;
        shortenedConnectionUserRequest: string;
      }
    >();
    this.mapUniqModuleUserRequests({
      module,
      compilation,
      callback: ({
        shortenedConnectionUserRequest,
        connectionResolvedModule,
        exportConnectionIdPairs,
      }) => {
        // find original module (it seems to be re-export file)
        if (
          // exportedIdsWithJsxByFileName is fully finished at the time
          !this.exportedIdsWithJsxByFileName.has(shortenedConnectionUserRequest) &&
          // 1. proxyPathsWithJsx is in filling, so check the certain exportId
          // 2. is enough to check only one of them to decide that all of them were resolved
          !this.proxyPathsWithJsx
            .get(shortenedConnectionUserRequest)
            ?.has(exportConnectionIdPairs[0].connectionId)
        ) {
          ensureObjExistence(possibleProxyModulesByUserRequest, shortenedConnectionUserRequest);
          const connectionModuleData = possibleProxyModulesByUserRequest.get(
            shortenedConnectionUserRequest,
          )!;
          connectionModuleData.connectionModule = connectionResolvedModule as ModuleExtended;
          connectionModuleData.shortenedConnectionUserRequest = shortenedConnectionUserRequest;

          return;
        }

        onResolvedConnection?.({
          shortenedConnectionUserRequest,
          exportConnectionIdPairs,
          shortenedModuleUserRequest,
        });
      },
    });

    possibleProxyModulesByUserRequest.forEach(
      ({ connectionModule, shortenedConnectionUserRequest }) => {
        this.resolveProxyFile({
          compilation,
          // parentModule: module,
          module: connectionModule,
          shortenedModuleUserRequest: shortenedConnectionUserRequest,
        });
      },
    );
  };

  assignImports = ({
    compilation,
    module,
  }: {
    compilation: Compilation;
    module: ModuleExtended;
  }) => {
    debugLog('assignImports', { userRequest: module.userRequest });
    this.resolveConnectionProxyPath({
      compilation,
      module,
    });

    this.mapModuleConnectionIds({
      compilation,
      module,
      callback: ({ connectionId, shortenedConnectionUserRequest, connectionResolvedModule }) => {
        this.tryToAddToTree({
          userRequest: module.userRequest,
          connectionId,
          shortenedConnectionUserRequest,
        });
      },
    });
  };

  /**
   * @description Creates the following structure
   * {
   *   "Root": {
   *   "Application": {"ThumbnailsProvider": null},
   *   "ApplicationProvider": null
   *  }
   * }
   */
  parseModule = ({ module, compilation }: { module: ModuleExtended; compilation: Compilation }) => {
    this.assignImports({
      module: module,
      compilation,
    });
  };

  counterPerFile = new Map();

  calcUsedConnections = ({
    connectionsUserRequest,
  }: {
    connectionsUserRequest?: Array<string>;
  }) => {
    connectionsUserRequest?.forEach((connectionUserRequest) => {
      this.counterPerFile.set(
        connectionUserRequest,
        (this.counterPerFile.get(connectionUserRequest) ?? 0) + 1,
      );

      if (this.treeComponentsUML.has(connectionUserRequest)) {
        this.calcUsedConnections({
          connectionsUserRequest: this.treeComponentsUML.get(connectionUserRequest),
        });
      }
    });
  };

  saveUsedUserRequests = ({
    connectionsUserRequest,
  }: {
    connectionsUserRequest?: Array<string>;
  }) => {
    connectionsUserRequest?.forEach((connectionUserRequest) => {
      let currentCount = this.counterPerFile.get(connectionUserRequest);

      // TODO: replace 4 with param
      if (currentCount > 0 && currentCount <= this.repetitiveCountForRemoveFromTree) {
        this.usedUserRequests.add(connectionUserRequest);
      }

      this.saveUsedUserRequests({
        connectionsUserRequest: this.treeComponentsUML.get(connectionUserRequest),
      });
    });
  };

  calcUsedUserRequest = () => {
    this.calcUsedConnections({
      connectionsUserRequest: this.treeComponentsUML.get(this.shortenedEntryFileName),
    });
    this.usedUserRequests.add(this.shortenedEntryFileName);
    this.saveUsedUserRequests({
      connectionsUserRequest: this.treeComponentsUML.get(this.shortenedEntryFileName),
    });

    debugLog('result before removing', {
      'this.treeComponentsUML': this.treeComponentsUML,
      entryFileName: this.entryFileName,
      usedUserRequests: this.usedUserRequests,
      // proxyPathsWithJsx: this.proxyPathsWithJsx,
      counterPerFile: this.counterPerFile,
    });
  };

  loadTree = () => {
    return JSON.parse(readFileSync(this.outFileName, 'utf-8'));
  };

  writeTree = () => {
    writeFileSync(this.outFileName, JSON.stringify([...this.treeComponentsUML.entries()]));
  };

  writeProxyPaths = () => {
    writeFileSync(
      this.outFileName.split('/').slice(0, -1).join('/') + '/proxyPathsWithJsx.json',
      JSON.stringify([...this.proxyPathsWithJsx.entries()], (key, value) => {
        if (!(value instanceof Map)) {
          return value;
        }

        return [...value.entries()];
      }),
    );
  };

  writeUml = () => {
    const joinChunks = (arr: string[]) => {
      return arr.join('');
    };
    /**
     * @Note
     * frame "packageName" {
     *   rectangle "Component.js" {
     *   }
     * }
     */
    const createFrame = (framePath: string, rects: string[]) => {
      return `frame "${framePath}" {\n  ${joinChunks(rects)}\n }\n`;
    };
    /**
     * @Note
     * rectangle "Component.js" {
     * }
     */
    const createRect = (rectPath: string) => {
      return `rectangle "${rectPath}" {\n}\n`;
    };
    const hasBeenWritten: Record<string, boolean> = {};
    const addRect = ({ rectPath, userRequest }: { rectPath: string; userRequest: string }) => {
      if (!hasBeenWritten[userRequest] && this.usedUserRequests.has(userRequest)) {
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
      connectionsPathTo: Array<string>;
      connectionsUserRequest: Array<string>;
    }) => {
      const chunks = connectionsUserRequest.map((connectionUserRequest, index) => {
        const connectionPathTo = connectionsPathTo[index];

        if (!connectionPathTo || !this.usedUserRequests.has(connectionUserRequest)) {
          return '';
        }

        // [module.js] --> [connection.ts]
        return `[${connectionPathFrom}] -[${
          this.lineColors[index % this.lineColors.length]
        }]-> [${connectionPathTo}]\n`;
      });

      return joinChunks(chunks);
    };
    const getFrameRectPaths = (userRequest: string) => {
      const chunks = userRequest.split('/');

      if (chunks.length <= 2) {
        return { framePath: '', rectPath: chunks.join('/') };
      }

      const [, framePath, ...restPath] = chunks;
      const rectPath = restPath.join('/');

      return { framePath, rectPath };
    };
    const rectsByFrame = new Map<string, string[]>();
    const rectsWithoutFrame: string[] = [];
    const writeRect = (userRequest: string) => {
      const { framePath, rectPath } = getFrameRectPaths(userRequest);
      const rect = addRect({ rectPath, userRequest });

      if (!framePath || !this.isGroupByParentDirNeeded) {
        rectsWithoutFrame.push(rect);

        return { framePath, rectPath };
      }

      ensureArrExistence(rectsByFrame, framePath);

      if (rect) {
        rectsByFrame.get(framePath)!.push(rect);
      }

      return { rectPath };
    };
    const mapToSetRectsByFrame = (fileNames: Array<string>) => {
      return fileNames.map((fileName) => {
        const { rectPath } = writeRect(fileName);

        return rectPath;
      });
    };
    const startChunk = '@startuml\nleft to right direction\n';
    const endChunk = '@enduml';
    const connections: string[] = [];

    this.treeComponentsUML.forEach((connectionsUserRequest, userRequest) => {
      if (!this.usedUserRequests.has(userRequest)) {
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

    writeFileSync(
      this.outFileName.split('.')[0] + '.uml',
      joinChunks([
        startChunk,
        joinChunks(frames),
        joinChunks(rectsWithoutFrame),
        joinChunks(connections),
        endChunk,
      ]),
    );
  };

  apply(compiler: Compiler) {
    compiler.hooks.done.tap(pluginName, ({ compilation }) => {
      try {
        debugLog(`\n${pluginName} has started`);
        this.onStart();
        const { connectionIdsByFileName, exportedIdsWithJsxByFileName } = JSON.parse(
          readFileSync(this.gatheredComponentsFileName, 'utf-8'),
        );

        this.connectionIdsByFileName = new Map(connectionIdsByFileName);
        this.exportedIdsWithJsxByFileName = new Map(exportedIdsWithJsxByFileName);

        for (const module of compilation.modules) {
          const isRoot = (module as any).rootModule;
          const nextModule: ModuleExtended = isRoot ? (module as any).rootModule : module;

          if (this.connectionIdsByFileName.has(this.excludePackagesPaths(nextModule.userRequest))) {
            this.parseModule({
              module: nextModule,
              compilation,
            });
          }
        }

        this.calcUsedUserRequest();
        this.writeTree();
        this.writeUml();
        this.writeProxyPaths();
      } catch (e) {
        console.error(e);
      }
    });
  }
}
