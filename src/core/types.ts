export type GatheredModuleConnection = {
  targetFileName: string;
  connectionIds: string[];
};

export type GatheredGraph = {
  // legacy shape kept for compatibility/debug
  connectionIdsByFileName: Array<[string, string[]]>;
  exportedIdsWithJsxByFileName: Array<[string, string[]]>;
  // agnostic shape used by the new build pipeline
  connectionsByFileName: Array<[string, GatheredModuleConnection[]]>;
  // maps shortened graph path back to original filesystem path
  sourceFileNameByGraphPath?: Array<[string, string]>;
  // shared parent dir of all walked files; graph paths are relative to it
  rootDir?: string;
  // graph path of the entry file
  entryGraphPath?: string;
};

export type GatherOptions = {
  entryFileName: string;
  acceptableExts?: string[];
};

export type BuildOptions = {
  graph: GatheredGraph;
  entryFileName: string;
  outFileName: string;
  repetitiveCountForRemoveFromTree?: number;
};
