import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createArray,
  ensureArrExistence,
  ensureMapExistence,
  ensureObjExistence,
  excludePackagesPaths,
  getIsAcceptableModule,
} from '../utils';

describe('utils', () => {
  test('getIsAcceptableModule checks package path and extensions', () => {
    const packagesPaths = /\/packages\//;

    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/packages/app/src/App.tsx',
        packagesPaths,
      }),
      true,
    );

    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/packages/app/src/App.css',
        packagesPaths,
      }),
      false,
    );

    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/src/App.tsx',
        packagesPaths,
      }),
      false,
    );

    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/packages/app/src/App.tsx',
        packagesPaths,
        acceptableExts: ['js'],
      }),
      false,
    );
  });

  test('excludePackagesPaths removes the matched package prefix', () => {
    const fileName = '/repo/packages/app/src/App.tsx';
    const packagesPaths = /\/repo\/packages/;

    assert.equal(excludePackagesPaths(fileName, packagesPaths), '/app/src/App.tsx');
  });

  test('ensure and create helpers initialize values only once', () => {
    const arrMap = new Map<string, string[]>();
    ensureArrExistence(arrMap, 'k1');
    arrMap.get('k1')!.push('x');
    ensureArrExistence(arrMap, 'k1');
    assert.deepEqual(arrMap.get('k1'), ['x']);

    const nestedMap = new Map<string, Map<unknown, unknown>>();
    ensureMapExistence(nestedMap, 'k2');
    const firstNested = nestedMap.get('k2');
    ensureMapExistence(nestedMap, 'k2');
    assert.equal(nestedMap.get('k2'), firstNested);

    const objMap = new Map<string, object>();
    const initialObj = { a: 1 };
    ensureObjExistence(objMap, 'k3', initialObj);
    ensureObjExistence(objMap, 'k3', { a: 2 });
    assert.equal(objMap.get('k3'), initialObj);

    const target: Record<string, unknown> = {};
    createArray(target, 'items');
    (target.items as string[]).push('one');
    createArray(target, 'items');
    assert.deepEqual(target.items, ['one']);
  });
});
