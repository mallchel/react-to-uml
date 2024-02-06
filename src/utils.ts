import { ConnectionIdsByFileName } from './types';

export const debugLog = (...args: any[]) => {
  if (process.argv.includes('--debug')) {
    console.log(...args);
  }
};

export const getIsAcceptableModule = ({
  filename,
  packagesPaths,
  acceptableExts = ['jsx', 'js', 'tsx', 'ts'],
}: {
  filename: string;
  packagesPaths: RegExp;
  acceptableExts?: string[];
}) => {
  return (
    packagesPaths.test(filename) &&
    acceptableExts.some((acceptableExt) => {
      return filename.endsWith(`.${acceptableExt}`);
    })
  );
};

export const ensureArrExistence = (map: ConnectionIdsByFileName, key: string) => {
  if (!map.has(key)) {
    map.set(key, []);
  }
};

// export const ensureSetExistence = (map: Map<string, Set<string>>, key: string) => {
//   if (!map.has(key)) {
//     map.set(key, new Set());
//   }
// };

export const ensureMapExistence = (map: Map<string, Map<unknown, unknown>>, key: string) => {
  if (!map.has(key)) {
    map.set(key, new Map());
  }
};

export const ensureObjExistence = (map: Map<string, object>, key: string, value: object = {}) => {
  if (!map.has(key)) {
    map.set(key, value);
  }
};

export const createArray = (obj: Record<string, unknown>, key: string) => {
  if (!obj[key]) {
    obj[key] = [];
  }
};

export const excludePackagesPaths = (fileName = '', packagesPaths: RegExp) => {
  return fileName.replace(packagesPaths, '');
};
