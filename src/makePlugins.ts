import { gatherComponentsByFileName } from './babelPlugin';
import { MakeUmlFromCode } from './webpackPlugin';

export const makePlugins = ({
  packagesPaths,
  gatheredComponentsFileName,
  outUmlFileName,
  entryFileName,
  acceptableExts,
  isGroupByParentDirNeeded,
  repetitiveCountForRemoveFromTree,
}: {
  packagesPaths: RegExp;
  gatheredComponentsFileName: string;
  outUmlFileName: string;
  entryFileName: string;
  acceptableExts?: string[];
  isGroupByParentDirNeeded?: boolean;
  repetitiveCountForRemoveFromTree?: number;
}) => {
  const { onEnd, plugin: babelPlugin } = gatherComponentsByFileName({
    outFileName: gatheredComponentsFileName,
    packagesPaths,
    acceptableExts,
  });

  return {
    babelPlugin,
    webpackPlugin: new MakeUmlFromCode({
      entryFileName,
      onStart: onEnd,
      packagesPaths,
      outFileName: outUmlFileName,
      gatheredComponentsFileName,
      isGroupByParentDirNeeded,
      repetitiveCountForRemoveFromTree,
    }),
  };
};
