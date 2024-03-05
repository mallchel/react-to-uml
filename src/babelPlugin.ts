import { writeFileSync } from 'fs';
import traverse, { Node, NodePath } from '@babel/traverse';
import {
  isVariableDeclarator,
  isVariableDeclaration,
  isCallExpression,
  ExportNamedDeclaration,
  ExportDefaultDeclaration,
  VariableDeclaration,
  Identifier,
  CallExpression,
  ClassExpression,
  isClassExpression,
  isIdentifier,
  isClassDeclaration,
  isExportDefaultDeclaration,
  isExportNamedDeclaration,
} from '@babel/types';

import { debugLog, ensureArrExistence, excludePackagesPaths, getIsAcceptableModule } from './utils';
import { ConnectionIdsByFileName } from './types';

// variable name in current file
const componentNamePattern = /^[A-Z]\w*/;

export const gatherComponentsByFileName = ({
  outFileName,
  packagesPaths,
  acceptableExts,
}: {
  outFileName: string;
  packagesPaths: RegExp;
  acceptableExts?: string[];
}) => {
  debugLog('gathering components by filename have started');

  const connectionIdsByFileName = new Map();
  const exportedIdsWithJsxByFileName = new Map();
  const varsWithJsx = new Set();
  const varDeclarationsByName = new Map<string, VariableDeclaration>();
  let currentFileName: string | null = null;

  const addConnectionIdByFileName = ({
    map,
    fileName,
    connectionId,
  }: {
    map: ConnectionIdsByFileName;
    fileName: string;
    connectionId: string;
  }) => {
    const shortenedFileName = excludePackagesPaths(fileName, packagesPaths);
    ensureArrExistence(map, shortenedFileName);
    map.get(shortenedFileName)!.push(connectionId);
  };

  const processCurrentState = ({ filename }: { filename: string }) => {
    if (!currentFileName || currentFileName !== filename) {
      currentFileName = filename;
      varsWithJsx.clear();
      varDeclarationsByName.clear();
    }
  };

  return {
    onEnd: () => {
      writeFileSync(
        outFileName,
        JSON.stringify({
          connectionIdsByFileName: [...connectionIdsByFileName.entries()],
          exportedIdsWithJsxByFileName: [...exportedIdsWithJsxByFileName.entries()],
        }),
      );
      debugLog(`gathered components saved in ${outFileName}`);
    },
    plugin: {
      visitor: {
        Program(programPath: NodePath<Node>, state: any) {
          traverse(state.file.ast, {
            ImportDeclaration: {
              exit(path) {
                processCurrentState({ filename: state.filename });

                if (
                  !path.node?.specifiers?.[0] ||
                  !getIsAcceptableModule({
                    filename: state.filename,
                    packagesPaths,
                    acceptableExts,
                  })
                ) {
                  return;
                }

                path.node.specifiers.forEach(({ local, type, ...rest }) => {
                  const importedName =
                    (rest as { imported?: { name?: string } }).imported?.name ?? 'default';

                  if (!componentNamePattern.test(importedName) && importedName !== 'default') {
                    return;
                  }

                  addConnectionIdByFileName({
                    map: connectionIdsByFileName,
                    fileName: state.filename,
                    connectionId: importedName,
                  });
                });
              },
            },

            JSXOpeningElement: {
              exit(path) {
                processCurrentState({ filename: state.filename });
                let targeParentPath: NodePath<Node> | null = path.parentPath;

                while (targeParentPath) {
                  if (
                    (isVariableDeclarator(targeParentPath.node) ||
                      isClassExpression(targeParentPath.node) ||
                      isClassDeclaration(targeParentPath.node)) &&
                    isIdentifier(targeParentPath.node.id) &&
                    targeParentPath.node.id.name
                  ) {
                    varsWithJsx.add(targeParentPath.node.id.name);
                  }
                  targeParentPath = targeParentPath.parentPath;
                }
              },
            },

            VariableDeclaration: {
              exit(path) {
                processCurrentState({ filename: state.filename });

                if (isIdentifier(path.node.declarations[0].id)) {
                  varDeclarationsByName.set(path.node.declarations[0].id.name, path.node);
                }
              },
            },

            ExportDeclaration: {
              exit(path) {
                processCurrentState({ filename: state.filename });

                if (
                  !isExportDefaultDeclaration(path.node) &&
                  !isExportNamedDeclaration(path.node)
                ) {
                  return;
                }

                // suppose it might be a wrapper of var with jsx
                // Cases:
                // VariableDeclaration
                // 1. export const foo = varWithJsx;
                // CallExpression
                // 2. export default hoc(varWithJsx);
                const findVarWithJsx = (
                  node: ExportDefaultDeclaration | ExportNamedDeclaration,
                ) => {
                  const checkIdentifier = (identifier?: Identifier | null) => {
                    if (identifier?.name && varsWithJsx.has(identifier.name)) {
                      return identifier.name;
                    }
                  };

                  const findWithinVarDeclaration = (
                    node: VariableDeclaration,
                  ): string | undefined => {
                    let name: string | undefined;

                    name = checkIdentifier(node.declarations[0].id as Identifier);
                    if (name) {
                      return name;
                    }

                    name = checkIdentifier(node.declarations[0].init as Identifier);
                    if (name) {
                      return name;
                    }

                    const varDeclaration = varDeclarationsByName.get(
                      (node.declarations[0].init as Identifier).name,
                    );

                    if (varDeclaration) {
                      return findWithinVarDeclaration(varDeclaration);
                    }
                  };

                  const findWithinCallExpression = (node: CallExpression) => {
                    let name: string | undefined | null;

                    name =
                      checkIdentifier(node.arguments[0] as Identifier) ||
                      ((node.arguments[0] as ClassExpression | undefined)?.id &&
                        checkIdentifier((node.arguments[0] as ClassExpression).id as Identifier));

                    if (name) {
                      return name;
                    }
                  };

                  let name: string | undefined;
                  if (
                    isIdentifier(node.declaration) &&
                    (name = checkIdentifier(node.declaration))
                  ) {
                    return name;
                  }

                  if (
                    isClassDeclaration(node.declaration) &&
                    (name = checkIdentifier(node.declaration.id))
                  ) {
                    return name;
                  }

                  if (isVariableDeclaration(node.declaration)) {
                    return findWithinVarDeclaration(node.declaration);
                  }

                  if (isCallExpression(node.declaration)) {
                    return findWithinCallExpression(node.declaration);
                  }
                };

                const exportedName = findVarWithJsx(path.node);

                if (!exportedName) {
                  return;
                }

                debugLog('before addConnectionIdByFileName', {
                  exportedName,
                  varsWithJsx,
                  type: path.node.type,
                  'state.filename': state.filename,
                });

                addConnectionIdByFileName({
                  map: exportedIdsWithJsxByFileName,
                  fileName: state.filename,
                  connectionId:
                    path.node.type === 'ExportDefaultDeclaration' ? 'default' : exportedName,
                });
              },
            },
          });
        },
      },
    },
  };
};
