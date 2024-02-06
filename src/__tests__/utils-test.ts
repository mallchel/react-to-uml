import test, { describe } from 'node:test';
import path from 'node:path';

import { MakeUmlFromCode } from '../webpackPlugin';
import { treeComponentsUMLMap } from './calcUsedImportsData';

describe('MakeUmlFromCode', () => {
  const rootPath = path.resolve(process.cwd());
  const entryFileName = rootPath + '/packages/app/client.js';
  const makeUmlFromCode = new MakeUmlFromCode({
    entryFileName,
    packagesPaths: new RegExp(rootPath + '/(packages)'),
  } as any);

  test('calcUsedImports', () => {
    makeUmlFromCode.treeComponentsUML = treeComponentsUMLMap;
    // makeUmlFromCode.calcUsedImports();
  });
});
