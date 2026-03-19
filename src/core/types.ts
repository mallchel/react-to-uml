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
};

export type GatherOptions = {
  entryFileName: string;
  packagesPaths: RegExp;
  acceptableExts?: string[];
};

export type BuildOptions = {
  graph: GatheredGraph;
  entryFileName: string;
  packagesPaths: RegExp;
  outFileName: string;
  isGroupByParentDirNeeded?: boolean;
  repetitiveCountForRemoveFromTree?: number;
};
