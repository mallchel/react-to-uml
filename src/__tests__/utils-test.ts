import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createArray,
  ensureArrExistence,
  ensureMapExistence,
  ensureObjExistence,
  getIsAcceptableModule,
} from '../utils';

describe('utils', () => {
  test('getIsAcceptableModule checks extensions', () => {
    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/packages/app/src/App.tsx',
      }),
      true,
    );

    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/packages/app/src/App.css',
      }),
      false,
    );

    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/src/App.tsx',
      }),
      true,
    );

    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/packages/app/src/App.tsx',
        acceptableExts: ['js'],
      }),
      false,
    );

    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/node_modules/pdfjs-dist-next/types/src/display/api.d.ts',
      }),
      false,
    );

    assert.equal(
      getIsAcceptableModule({
        filename: '/repo/node_modules/some-lib/src/Widget.tsx',
      }),
      false,
    );
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
