import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
  if (!importPath.startsWith('.')) {
    return undefined;
  }

  const basePath = path.resolve(path.dirname(fromFileName), importPath);
  const ext = path.extname(basePath).replace('.', '');

  if (ext && acceptableExts.includes(ext) && existsSync(basePath)) {
    return basePath;
  }

  for (const acceptableExt of acceptableExts) {
    const filePath = `${basePath}.${acceptableExt}`;
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  for (const acceptableExt of acceptableExts) {
    const indexFilePath = path.join(basePath, `index.${acceptableExt}`);
    if (existsSync(indexFilePath)) {
      return indexFilePath;
    }
  }

  return undefined;
};

export const walkFiles = ({
  entryFileName,
  packagesPaths,
  acceptableExts = ['jsx', 'js', 'tsx', 'ts'],
  onFile,
}: {
  entryFileName: string;
  packagesPaths: RegExp;
  acceptableExts?: string[];
  onFile: (params: {
    fileName: string;
    source: string;
    resolveImport: (importPath: string) => string | undefined;
  }) => string[];
}) => {
  const queue = [entryFileName];
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

    if (!getIsAcceptableModule({ filename: fileName, packagesPaths, acceptableExts })) {
      continue;
    }

    const source = readFileSync(fileName, 'utf8');
    const resolvedImports = onFile({
      fileName,
      source,
      resolveImport: (importPath: string) => {
        const resolved = resolveImportPath({
          importPath,
          fromFileName: fileName,
          acceptableExts,
        });

        if (
          resolved &&
          getIsAcceptableModule({
            filename: resolved,
            packagesPaths,
            acceptableExts,
          })
        ) {
          return resolved;
        }

        return undefined;
      },
    });

    resolvedImports.forEach((resolvedImport) => {
      if (!visited.has(resolvedImport)) {
        queue.push(resolvedImport);
      }
    });
  }
};
