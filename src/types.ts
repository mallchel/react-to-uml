import type { Module } from 'webpack';

// TODO: replace Array with Set
export type ConnectionIdsByFileName = Map<string, Array<string>>;

export type ModuleExtended = Module & {
  // full file path
  userRequest: string;
};
