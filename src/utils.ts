export const debugLog = (...args: any[]) => {
  if (process.argv.includes('--debug')) {
    console.log(...args);
  }
};

export const getIsAcceptableModule = ({
  filename,
  acceptableExts = ['jsx', 'js', 'tsx', 'ts'],
}: {
  filename: string;
  acceptableExts?: string[];
}) => {
  const normalizedFileName = filename.replace(/\\/g, '/');

  if (normalizedFileName.includes('/node_modules/')) {
    return false;
  }

  if (/\.d\.(ts|tsx|mts|cts)$/i.test(filename)) {
    return false;
  }

  return acceptableExts.some((acceptableExt) => {
    return filename.endsWith(`.${acceptableExt}`);
  });
};

export const ensureArrExistence = <T>(map: Map<string, T[]>, key: string) => {
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

