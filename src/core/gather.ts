import path from 'node:path';
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

import { walkFiles } from './walk';
import type { GatheredModuleConnection, GatheredGraph, GatherOptions } from './types';

const componentNamePattern = /^[A-Z]\w*/;
const { parseSync } = require('@babel/core') as {
  parseSync: (code: string, options: any) => any;
};

const toGraphPath = ({ fileName, rootDir }: { fileName: string; rootDir: string }) => {
  const relativePath = path.relative(rootDir, fileName).split(path.sep).join('/');
  return `/${relativePath}`;
};

// deepest directory that contains every given file
export const getCommonParentDir = (fileNames: string[]) => {
  if (!fileNames.length) {
    return path.parse(process.cwd()).root;
  }

  const [first, ...rest] = fileNames.map((fileName) => path.dirname(fileName).split(path.sep));
  let commonLength = first.length;

  rest.forEach((segments) => {
    let index = 0;
    while (index < commonLength && index < segments.length && segments[index] === first[index]) {
      index += 1;
    }
    commonLength = index;
  });

  return first.slice(0, commonLength).join(path.sep) || path.parse(fileNames[0]).root;
};

const gatherSingleFile = ({
  source,
  fileName,
  resolveImport,
}: {
  source: string;
  fileName: string;
  resolveImport: (importPath: string) => string | undefined;
}) => {
  const varsWithJsx = new Set<string>();
  const varDeclarationsByName = new Map<string, VariableDeclaration>();
  const connectionIds: string[] = [];
  const exportedIdsWithJsx: string[] = [];
  const connections: GatheredModuleConnection[] = [];
  const resolvedImportsToTraverse: string[] = [];

  // .ts files can't contain JSX, and `<Type>value` casts there break the jsx plugin
  const isPlainTs = /\.[mc]?ts$/.test(fileName);
  let ast;
  try {
    ast = parseSync(source, {
      filename: fileName,
      configFile: false,
      babelrc: false,
      parserOpts: {
        sourceType: 'module',
        plugins: isPlainTs ? ['typescript'] : ['jsx', 'typescript'],
      },
    });
  } catch (error) {
    console.warn(`Skipped ${fileName}: ${(error as Error).message.split('\n')[0]}`);
    return { connectionIds, exportedIdsWithJsx, connections, resolvedImportsToTraverse };
  }

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
            targetFileName,
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

        const findWithinVarDeclaration = (node: VariableDeclaration): string | undefined => {
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
              checkIdentifier((firstArg as ClassExpression).id as Identifier)) as
              | string
              | undefined);

          if (name) {
            return name;
          }
        };

        const findVarWithJsx = (node: ExportDefaultDeclaration | ExportNamedDeclaration) => {
          let name: string | undefined;

          if (isIdentifier(node.declaration) && (name = checkIdentifier(node.declaration))) {
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

        exportedIdsWithJsx.push(
          path.node.type === 'ExportDefaultDeclaration' ? 'default' : exportedName,
        );
      },
    },
  });

  return { connectionIds, exportedIdsWithJsx, connections, resolvedImportsToTraverse };
};

export const gatherGraph = ({ entryFileName, acceptableExts }: GatherOptions): GatheredGraph => {
  // collected with absolute paths first, shortened once all walked files are known
  const connectionIdsByFileName = new Map<string, string[]>();
  const exportedIdsWithJsxByFileName = new Map<string, string[]>();
  const connectionsByFileName = new Map<string, GatheredModuleConnection[]>();
  const walkedFileNames: string[] = [];

  walkFiles({
    entryFileName,
    acceptableExts,
    onFile: ({ fileName, source, resolveImport }) => {
      walkedFileNames.push(fileName);
      const next = gatherSingleFile({
        source,
        fileName,
        resolveImport,
      });

      if (next.connectionIds.length) {
        connectionIdsByFileName.set(fileName, next.connectionIds);
      }
      if (next.exportedIdsWithJsx.length) {
        exportedIdsWithJsxByFileName.set(fileName, next.exportedIdsWithJsx);
      }
      if (next.connections.length) {
        connectionsByFileName.set(fileName, next.connections);
      }

      return next.resolvedImportsToTraverse;
    },
  });

  const rootDir = getCommonParentDir(walkedFileNames);
  const shorten = (fileName: string) => toGraphPath({ fileName, rootDir });

  const shortenKeys = <T>(map: Map<string, T>): Array<[string, T]> =>
    [...map.entries()].map(([fileName, value]) => [shorten(fileName), value]);

  return {
    connectionIdsByFileName: shortenKeys(connectionIdsByFileName),
    exportedIdsWithJsxByFileName: shortenKeys(exportedIdsWithJsxByFileName),
    connectionsByFileName: shortenKeys(connectionsByFileName).map(([fileName, connections]) => [
      fileName,
      connections.map((connection) => ({
        ...connection,
        targetFileName: shorten(connection.targetFileName),
      })),
    ]),
    sourceFileNameByGraphPath: walkedFileNames.map((fileName) => [shorten(fileName), fileName]),
    rootDir,
    entryGraphPath: walkedFileNames.length ? shorten(walkedFileNames[0]) : undefined,
  };
};
