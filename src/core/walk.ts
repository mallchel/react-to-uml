import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import resolve from 'resolve';

import { getIsAcceptableModule } from '../utils';

const resolveImportPath = ({
  importPath,
  fromFileName,
  acceptableExts,
}: {
  importPath: string;
  fromFileName: string;
  acceptableExts: string[];
}) => {
  const getAcceptedFileName = (candidateFileName: string) => {
    if (!existsSync(candidateFileName)) {
      return undefined;
    }
    // real paths keep symlinked and relative imports of the same file under one key
    const realFileName = realpathSync(candidateFileName);
    return getIsAcceptableModule({ filename: realFileName, acceptableExts })
      ? realFileName
      : undefined;
  };

  if (!importPath.startsWith('.') && !path.isAbsolute(importPath)) {
    try {
      const resolved = resolve.sync(importPath, {
        basedir: path.dirname(fromFileName),
        extensions: acceptableExts.map((ext) => `.${ext}`),
        preserveSymlinks: false,
      });
      return getAcceptedFileName(resolved);
    } catch {
      return undefined;
    }
  }

  const basePath = path.resolve(path.dirname(fromFileName), importPath);
  const directFileName = getAcceptedFileName(basePath);
  if (directFileName) {
    return directFileName;
  }

  for (const acceptableExt of acceptableExts) {
    const filePath = `${basePath}.${acceptableExt}`;
    const nextFileName = getAcceptedFileName(filePath);
    if (nextFileName) {
      return nextFileName;
    }
  }

  for (const acceptableExt of acceptableExts) {
    const indexFilePath = path.join(basePath, `index.${acceptableExt}`);
    const nextFileName = getAcceptedFileName(indexFilePath);
    if (nextFileName) {
      return nextFileName;
    }
  }

  return undefined;
};

export const walkFiles = ({
  entryFileName,
  acceptableExts = ['jsx', 'js', 'tsx', 'ts'],
  onFile,
}: {
  entryFileName: string;
  acceptableExts?: string[];
  onFile: (params: {
    fileName: string;
    source: string;
    resolveImport: (importPath: string) => string | undefined;
  }) => string[];
}) => {
  const queue = [existsSync(entryFileName) ? realpathSync(entryFileName) : entryFileName];
  const visited = new Set<string>();

  while (queue.length) {
    const fileName = queue.shift()!;
    if (visited.has(fileName)) {
      continue;
    }
    visited.add(fileName);

    if (!existsSync(fileName)) {
      continue;
    }

    if (!getIsAcceptableModule({ filename: fileName, acceptableExts })) {
      continue;
    }

    const source = readFileSync(fileName, 'utf8');
    const resolvedImports = onFile({
      fileName,
      source,
      resolveImport: (importPath: string) =>
        resolveImportPath({
          importPath,
          fromFileName: fileName,
          acceptableExts,
        }),
    });

    resolvedImports.forEach((resolvedImport) => {
      if (!visited.has(resolvedImport)) {
        queue.push(resolvedImport);
      }
    });
  }
};
