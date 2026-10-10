import path from 'node:path';
import traverse, { Node, NodePath } from '@babel/traverse';
import type { Node as BabelNode } from '@babel/types';
import {
  ExportDeclaration,
  Identifier,
  ImportDeclaration,
  StringLiteral,
  isArrowFunctionExpression,
  isCallExpression,
  isClassDeclaration,
  isClassExpression,
  isExportAllDeclaration,
  isExportDefaultDeclaration,
  isExportNamedDeclaration,
  isExportSpecifier,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isImportDefaultSpecifier,
  isImportNamespaceSpecifier,
  isParenthesizedExpression,
  isTSAsExpression,
  isTSNonNullExpression,
  isTSSatisfiesExpression,
  isVariableDeclaration,
  isVariableDeclarator,
} from '@babel/types';

import { walkFiles } from './walk';
import type {
  GatheredModuleConnection,
  GatheredGraph,
  GatheredReExport,
  GatherOptions,
} from './types';

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

type ResolvedExport =
  | { kind: 'jsx' }
  | { kind: 'reexport'; targetFileName: string; importedId: string };

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
  // every AST node that has JSX somewhere inside it
  const nodesWithJsx = new WeakSet<object>();
  const initByVarName = new Map<string, BabelNode | null | undefined>();
  const importBindings = new Map<string, { targetFileName: string; importedId: string }>();
  // @babel/traverse ships its own @babel/types copy, so nodes are cast to the direct dependency's types
  const exportNodes: ExportDeclaration[] = [];
  const connectionIds: string[] = [];
  const exportedIdsWithJsx: string[] = [];
  const connections: GatheredModuleConnection[] = [];
  const reExports: GatheredReExport[] = [];
  const resolvedImportsToTraverse: string[] = [];
  const emptyResult = {
    connectionIds,
    exportedIdsWithJsx,
    connections,
    reExports,
    resolvedImportsToTraverse,
  };

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
    return emptyResult;
  }

  if (!ast) {
    return emptyResult;
  }

  const getModuleExportName = (node: Identifier | StringLiteral) =>
    isIdentifier(node) ? node.name : node.value;

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

        (path.node as unknown as ImportDeclaration).specifiers.forEach((specifier) => {
          if (isImportNamespaceSpecifier(specifier)) {
            return;
          }
          const importedName = isImportDefaultSpecifier(specifier)
            ? 'default'
            : getModuleExportName(specifier.imported);
          importBindings.set(specifier.local.name, { targetFileName, importedId: importedName });

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
          nodesWithJsx.add(targetParentPath.node);
          if (
            (isVariableDeclarator(targetParentPath.node) ||
              isClassExpression(targetParentPath.node) ||
              isClassDeclaration(targetParentPath.node) ||
              isFunctionDeclaration(targetParentPath.node)) &&
            isIdentifier(targetParentPath.node.id) &&
            targetParentPath.node.id.name
          ) {
            varsWithJsx.add(targetParentPath.node.id.name);
          }
          targetParentPath = targetParentPath.parentPath;
        }
      },
    },

    VariableDeclarator: {
      exit(path) {
        if (isIdentifier(path.node.id)) {
          initByVarName.set(path.node.id.name, path.node.init as BabelNode | null | undefined);
        }
      },
    },

    // handled after traversal, when every declaration and JSX usage in the file is known
    ExportDeclaration: {
      exit(path) {
        exportNodes.push(path.node as unknown as ExportDeclaration);
      },
    },
  });

  // what an exported expression is: a component of this file, or a component re-exported
  // from another file (directly or wrapped in HOCs like connect()(X), memo(X), compose(...)(X))
  const resolveExport = (
    node: BabelNode | null | undefined,
    seen = new Set<string>(),
  ): ResolvedExport | undefined => {
    if (!node) {
      return undefined;
    }

    if (isIdentifier(node)) {
      if (varsWithJsx.has(node.name)) {
        return { kind: 'jsx' };
      }
      const binding = importBindings.get(node.name);
      if (binding) {
        return { kind: 'reexport', ...binding };
      }
      if (initByVarName.has(node.name) && !seen.has(node.name)) {
        seen.add(node.name);
        return resolveExport(initByVarName.get(node.name), seen);
      }
      return undefined;
    }

    if (isCallExpression(node)) {
      for (const arg of node.arguments) {
        const resolved = resolveExport(arg, seen);
        if (resolved) {
          return resolved;
        }
      }
      return undefined;
    }

    if (
      isTSAsExpression(node) ||
      isTSSatisfiesExpression(node) ||
      isTSNonNullExpression(node) ||
      isParenthesizedExpression(node)
    ) {
      return resolveExport(node.expression, seen);
    }

    if (
      (isArrowFunctionExpression(node) ||
        isFunctionExpression(node) ||
        isFunctionDeclaration(node) ||
        isClassExpression(node) ||
        isClassDeclaration(node)) &&
      nodesWithJsx.has(node)
    ) {
      return { kind: 'jsx' };
    }

    return undefined;
  };

  const addExport = (exportedId: string, resolved: ResolvedExport | undefined) => {
    if (resolved?.kind === 'jsx') {
      exportedIdsWithJsx.push(exportedId);
    } else if (resolved?.kind === 'reexport') {
      reExports.push({
        exportedId,
        targetFileName: resolved.targetFileName,
        importedId: resolved.importedId,
      });
    }
  };

  exportNodes.forEach((node) => {
    if (isExportDefaultDeclaration(node)) {
      addExport('default', resolveExport(node.declaration));
      return;
    }

    // export { A, default as B } from './x' / export * from './x'
    if ((isExportNamedDeclaration(node) || isExportAllDeclaration(node)) && node.source) {
      const targetFileName = resolveImport(node.source.value);
      if (!targetFileName) {
        return;
      }
      resolvedImportsToTraverse.push(targetFileName);

      if (isExportAllDeclaration(node)) {
        reExports.push({ exportedId: '*', targetFileName, importedId: '*' });
        return;
      }
      node.specifiers.forEach((specifier) => {
        if (isExportSpecifier(specifier)) {
          reExports.push({
            exportedId: getModuleExportName(specifier.exported),
            targetFileName,
            importedId: specifier.local.name,
          });
        }
      });
      return;
    }

    if (!isExportNamedDeclaration(node)) {
      return;
    }

    const { declaration } = node;
    if (isVariableDeclaration(declaration)) {
      declaration.declarations.forEach((declarator) => {
        if (isIdentifier(declarator.id)) {
          addExport(
            declarator.id.name,
            varsWithJsx.has(declarator.id.name) ? { kind: 'jsx' } : resolveExport(declarator.init),
          );
        }
      });
      return;
    }

    if ((isFunctionDeclaration(declaration) || isClassDeclaration(declaration)) && declaration.id) {
      addExport(declaration.id.name, resolveExport(declaration));
      return;
    }

    // export { A, B as C }
    node.specifiers.forEach((specifier) => {
      if (isExportSpecifier(specifier)) {
        addExport(getModuleExportName(specifier.exported), resolveExport(specifier.local));
      }
    });
  });

  return emptyResult;
};

export const gatherGraph = ({ entryFileName, acceptableExts }: GatherOptions): GatheredGraph => {
  // collected with absolute paths first, shortened once all walked files are known
  const connectionIdsByFileName = new Map<string, string[]>();
  const exportedIdsWithJsxByFileName = new Map<string, string[]>();
  const connectionsByFileName = new Map<string, GatheredModuleConnection[]>();
  const reExportsByFileName = new Map<string, GatheredReExport[]>();
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
      if (next.reExports.length) {
        reExportsByFileName.set(fileName, next.reExports);
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
    reExportsByFileName: shortenKeys(reExportsByFileName).map(([fileName, reExports]) => [
      fileName,
      reExports.map((reExport) => ({
        ...reExport,
        targetFileName: shorten(reExport.targetFileName),
      })),
    ]),
    sourceFileNameByGraphPath: walkedFileNames.map((fileName) => [shorten(fileName), fileName]),
    rootDir,
    entryGraphPath: walkedFileNames.length ? shorten(walkedFileNames[0]) : undefined,
  };
};
