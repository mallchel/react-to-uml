import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildUmlFromGraph } from '../core/buildUml';
import { gatherGraph } from '../core/gather';

describe('agnostic pipeline', () => {
  test('gathers graph and builds uml from filesystem traversal', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'react-to-uml-agnostic-test-'));

    try {
      const appDir = path.join(tempDir, 'packages', 'app');
      const componentsDir = path.join(appDir, 'components');
      mkdirSync(componentsDir, { recursive: true });

      const entryFileName = path.join(appDir, 'client.tsx');
      const rootFileName = path.join(appDir, 'Root.tsx');
      const buttonFileName = path.join(componentsDir, 'Button.tsx');

      writeFileSync(
        entryFileName,
        `import Root from './Root'; export default function Entry() { return <Root />; }`,
      );
      writeFileSync(
        rootFileName,
        `import { Button } from './components/Button'; const Root = () => <Button />; export default Root;`,
      );
      writeFileSync(
        buttonFileName,
        `export const Button = () => <button/>; export default Button;`,
      );

      const packagesPaths = new RegExp(`${path.join(tempDir, 'packages')}`);
      const graph = gatherGraph({
        entryFileName,
        packagesPaths,
      });

      assert.ok(graph.connectionsByFileName.length > 0);
      assert.ok(graph.exportedIdsWithJsxByFileName.length > 0);

      const outFileName = path.join(tempDir, 'build', 'assets', 'treeComponentsUML.json');
      mkdirSync(path.dirname(outFileName), { recursive: true });

      const { treeComponentsUML } = buildUmlFromGraph({
        graph,
        entryFileName,
        packagesPaths,
        outFileName,
      });

      const shortenedEntry = '/app/client.tsx';
      const shortenedRoot = '/app/Root.tsx';

      assert.ok(treeComponentsUML.has(shortenedEntry));
      assert.ok(treeComponentsUML.get(shortenedEntry)?.includes(shortenedRoot));

      const writtenTree = JSON.parse(readFileSync(outFileName, 'utf8')) as Array<[string, string[]]>;
      assert.ok(writtenTree.length > 0);
      assert.ok(readFileSync(outFileName.replace('.json', '.uml'), 'utf8').includes('@startuml'));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
