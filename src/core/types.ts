export type GatheredModuleConnection = {
  targetFileName: string;
  connectionIds: string[];
};

// `export { importedId as exportedId } from targetFileName`, also when written as
// import + export, or wrapped in HOCs; `*` stands for `export * from`
export type GatheredReExport = {
  exportedId: string;
  targetFileName: string;
  importedId: string;
};

export type GatheredGraph = {
  // legacy shape kept for compatibility/debug
  connectionIdsByFileName: Array<[string, string[]]>;
  exportedIdsWithJsxByFileName: Array<[string, string[]]>;
  // agnostic shape used by the new build pipeline
  connectionsByFileName: Array<[string, GatheredModuleConnection[]]>;
  // components each file re-exports from other files
  reExportsByFileName?: Array<[string, GatheredReExport[]]>;
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
