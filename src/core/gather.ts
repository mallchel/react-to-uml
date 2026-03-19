import traverse, { Node, NodePath } from '@babel/traverse';
import {
  CallExpression,
  ClassExpression,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  Identifier,
  VariableDeclaration,
  isCallExpression,
  isClassDeclaration,
  isClassExpression,
  isExportDefaultDeclaration,
  isExportNamedDeclaration,
  isIdentifier,
  isVariableDeclaration,
  isVariableDeclarator,
} from '@babel/types';

import { excludePackagesPaths } from '../utils';
import { walkFiles } from './walk';
import type { GatheredModuleConnection, GatheredGraph, GatherOptions } from './types';

const componentNamePattern = /^[A-Z]\w*/;
const { parseSync } = require('@babel/core') as {
  parseSync: (code: string, options: any) => any;
};

const gatherSingleFile = ({
  source,
  fileName,
  packagesPaths,
  resolveImport,
}: {
  source: string;
  fileName: string;
  packagesPaths: RegExp;
  resolveImport: (importPath: string) => string | undefined;
}) => {
  const varsWithJsx = new Set<string>();
  const varDeclarationsByName = new Map<string, VariableDeclaration>();
  const connectionIds: string[] = [];
  const exportedIdsWithJsx: string[] = [];
  const connections: GatheredModuleConnection[] = [];
  const resolvedImportsToTraverse: string[] = [];

  const ast = parseSync(source, {
    filename: fileName,
    configFile: false,
    babelrc: false,
    parserOpts: {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    },
  });

  if (!ast) {
    return { connectionIds, exportedIdsWithJsx, connections, resolvedImportsToTraverse };
  }

  traverse(ast, {
    ImportDeclaration: {
      exit(path) {
        if (!path.node?.specifiers?.length) {
          return;
        }

        const sourceValue = path.node.source.value;
        if (typeof sourceValue !== 'string') {
          return;
        }

        const targetFileName = resolveImport(sourceValue);
        if (!targetFileName) {
          return;
        }
        resolvedImportsToTraverse.push(targetFileName);

        const shortenedTargetFileName = excludePackagesPaths(targetFileName, packagesPaths);
        const connectionIdsByTarget: string[] = [];

        path.node.specifiers.forEach(({ type, ...rest }) => {
          const importedName =
            (rest as { imported?: { name?: string } }).imported?.name ??
            (type === 'ImportDefaultSpecifier' ? 'default' : undefined);

          if (!importedName) {
            return;
          }

          if (!componentNamePattern.test(importedName) && importedName !== 'default') {
            return;
          }

          connectionIds.push(importedName);
          connectionIdsByTarget.push(importedName);
        });

        if (connectionIdsByTarget.length) {
          connections.push({
            targetFileName: shortenedTargetFileName,
            connectionIds: connectionIdsByTarget,
          });
        }
      },
    },

    JSXOpeningElement: {
      exit(path) {
        let targetParentPath: NodePath<Node> | null = path.parentPath;

        while (targetParentPath) {
          if (
            (isVariableDeclarator(targetParentPath.node) ||
              isClassExpression(targetParentPath.node) ||
              isClassDeclaration(targetParentPath.node)) &&
            isIdentifier(targetParentPath.node.id) &&
            targetParentPath.node.id.name
          ) {
            varsWithJsx.add(targetParentPath.node.id.name);
          }
          targetParentPath = targetParentPath.parentPath;
        }
      },
    },

    VariableDeclaration: {
      exit(path) {
        if (isIdentifier(path.node.declarations[0]?.id)) {
          varDeclarationsByName.set(path.node.declarations[0].id.name, path.node);
        }
      },
    },

    ExportDeclaration: {
      exit(path) {
        if (!isExportDefaultDeclaration(path.node) && !isExportNamedDeclaration(path.node)) {
          return;
        }

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
            (node.declarations[0].init as Identifier)?.name,
          );
          if (varDeclaration) {
            return findWithinVarDeclaration(varDeclaration);
          }
        };

        const findWithinCallExpression = (node: CallExpression) => {
          const firstArg = node.arguments[0] as Identifier | ClassExpression | undefined;
          const name =
            checkIdentifier(firstArg as Identifier) ||
            (((firstArg as ClassExpression | undefined)?.id &&
              checkIdentifier((firstArg as ClassExpression).id as Identifier)) as string | undefined);

          if (name) {
            return name;
          }
        };

        const findVarWithJsx = (node: ExportDefaultDeclaration | ExportNamedDeclaration) => {
          let name: string | undefined;

          if (isIdentifier(node.declaration) && (name = checkIdentifier(node.declaration))) {
            return name;
          }

          if (isClassDeclaration(node.declaration) && (name = checkIdentifier(node.declaration.id))) {
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

        exportedIdsWithJsx.push(
          path.node.type === 'ExportDefaultDeclaration' ? 'default' : exportedName,
        );
      },
    },
  });

  return { connectionIds, exportedIdsWithJsx, connections, resolvedImportsToTraverse };
};

export const gatherGraph = ({
  entryFileName,
  packagesPaths,
  acceptableExts,
}: GatherOptions): GatheredGraph => {
  const connectionIdsByFileName = new Map<string, string[]>();
  const exportedIdsWithJsxByFileName = new Map<string, string[]>();
  const connectionsByFileName = new Map<string, GatheredModuleConnection[]>();

  walkFiles({
    entryFileName,
    packagesPaths,
    acceptableExts,
    onFile: ({ fileName, source, resolveImport }) => {
      const shortenedFileName = excludePackagesPaths(fileName, packagesPaths);
      const next = gatherSingleFile({
        source,
        fileName,
        packagesPaths,
        resolveImport,
      });

      if (next.connectionIds.length) {
        connectionIdsByFileName.set(shortenedFileName, next.connectionIds);
      }
      if (next.exportedIdsWithJsx.length) {
        exportedIdsWithJsxByFileName.set(shortenedFileName, next.exportedIdsWithJsx);
      }
      if (next.connections.length) {
        connectionsByFileName.set(shortenedFileName, next.connections);
      }

      return next.resolvedImportsToTraverse;
    },
  });

  return {
    connectionIdsByFileName: [...connectionIdsByFileName.entries()],
    exportedIdsWithJsxByFileName: [...exportedIdsWithJsxByFileName.entries()],
    connectionsByFileName: [...connectionsByFileName.entries()],
  };
};
