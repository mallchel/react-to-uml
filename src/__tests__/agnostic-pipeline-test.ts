import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { graphNodeMetaFileName } from '../const';
import { buildGraphFromGraph } from '../core/buildGraph';
import { gatherGraph, getCommonParentDir } from '../core/gather';

describe('agnostic pipeline', () => {
  test('gathers graph and builds tree from filesystem traversal', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'react-to-uml-agnostic-test-'));

    try {
      const appDir = path.join(tempDir, 'packages', 'app');
      const uiDir = path.join(tempDir, 'packages', 'ui');
      const componentsDir = path.join(appDir, 'components');
      mkdirSync(uiDir, { recursive: true });
      mkdirSync(componentsDir, { recursive: true });

      const entryFileName = path.join(appDir, 'client.tsx');
      const rootFileName = path.join(appDir, 'Root.tsx');
      const buttonFileName = path.join(componentsDir, 'Button.tsx');
      const uiButtonFileName = path.join(uiDir, 'UiButton.tsx');

      writeFileSync(
        entryFileName,
        `import Root from './Root'; export default function Entry() { return <Root />; }`,
      );
      writeFileSync(
        rootFileName,
        `import { Button } from './components/Button'; import { UiButton } from '../ui/UiButton'; const Root = () => <><Button /><UiButton /></>; export default Root;`,
      );
      writeFileSync(
        buttonFileName,
        `export const Button = () => <button/>; export default Button;`,
      );
      writeFileSync(
        uiButtonFileName,
        `export const UiButton = () => <button/>; export default UiButton;`,
      );

      const graph = gatherGraph({
        entryFileName,
      });

      assert.ok(graph.connectionsByFileName.length > 0);
      assert.ok(graph.exportedIdsWithJsxByFileName.length > 0);

      const outFileName = path.join(tempDir, 'build', 'assets', 'treeComponentsGraph.json');
      mkdirSync(path.dirname(outFileName), { recursive: true });

      const { treeComponentsGraph } = buildGraphFromGraph({
        graph,
        entryFileName,
        outFileName,
      });

      // paths are relative to the shared parent dir of all walked files (packages/)
      const shortenedEntry = '/app/client.tsx';
      const shortenedRoot = '/app/Root.tsx';
      const shortenedButton = '/app/components/Button.tsx';
      const shortenedUiButton = '/ui/UiButton.tsx';

      assert.equal(graph.entryGraphPath, shortenedEntry);
      assert.ok(treeComponentsGraph.get(shortenedEntry)?.includes(shortenedRoot));

      assert.ok(treeComponentsGraph.has(shortenedRoot));
      assert.ok(treeComponentsGraph.get(shortenedRoot)?.includes(shortenedButton));
      assert.ok(treeComponentsGraph.get(shortenedRoot)?.includes(shortenedUiButton));

      const writtenTree = JSON.parse(readFileSync(outFileName, 'utf8')) as Array<
        [string, string[]]
      >;
      assert.ok(writtenTree.length > 0);

      const metaFilePath = path.join(path.dirname(outFileName), graphNodeMetaFileName);
      const graphNodeMetaByFileName = JSON.parse(
        readFileSync(metaFilePath, 'utf8'),
      ) as Record<string, { packageName: string; dirs: string[] }>;

      assert.equal(graphNodeMetaByFileName[shortenedRoot]?.packageName, 'app');
      assert.deepEqual(graphNodeMetaByFileName[shortenedRoot]?.dirs, ['app']);
      assert.equal(graphNodeMetaByFileName[shortenedButton]?.packageName, 'app');
      assert.deepEqual(graphNodeMetaByFileName[shortenedButton]?.dirs, ['app', 'components']);
      assert.equal(graphNodeMetaByFileName[shortenedUiButton]?.packageName, 'ui');
      assert.deepEqual(graphNodeMetaByFileName[shortenedUiButton]?.dirs, ['ui']);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('resolves aliased package imports through node_modules symlinks', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'react-to-uml-agnostic-alias-test-'));

    try {
      const appDir = path.join(tempDir, 'packages', 'app');
      const uiDir = path.join(tempDir, 'packages', 'ui');
      const aliasDir = path.join(tempDir, 'node_modules', '@scope');
      mkdirSync(appDir, { recursive: true });
      mkdirSync(uiDir, { recursive: true });
      mkdirSync(aliasDir, { recursive: true });
      symlinkSync(uiDir, path.join(aliasDir, 'ui'), 'dir');

      const entryFileName = path.join(appDir, 'client.tsx');
      const rootFileName = path.join(appDir, 'Root.tsx');
      const uiButtonFileName = path.join(uiDir, 'UiButton.tsx');

      writeFileSync(
        entryFileName,
        `import Root from './Root'; export default function Entry() { return <Root />; }`,
      );
      writeFileSync(
        rootFileName,
        `import { UiButton } from '@scope/ui/UiButton'; const Root = () => <UiButton />; export default Root;`,
      );
      writeFileSync(
        uiButtonFileName,
        `export const UiButton = () => <button/>; export default UiButton;`,
      );

      const graph = gatherGraph({
        entryFileName,
      });
      const outFileName = path.join(tempDir, 'build', 'assets', 'treeComponentsGraph.json');
      mkdirSync(path.dirname(outFileName), { recursive: true });
      const { treeComponentsGraph } = buildGraphFromGraph({
        graph,
        entryFileName,
        outFileName,
      });

      const shortenedRoot = '/app/Root.tsx';
      const rootTargets = treeComponentsGraph.get(shortenedRoot) ?? [];
      const shortenedUiButton = rootTargets.find((target) => target.endsWith('/UiButton.tsx'));
      assert.ok(treeComponentsGraph.has(shortenedRoot));
      assert.equal(shortenedUiButton, '/ui/UiButton.tsx');

      const metaFilePath = path.join(path.dirname(outFileName), graphNodeMetaFileName);
      const graphNodeMetaByFileName = JSON.parse(
        readFileSync(metaFilePath, 'utf8'),
      ) as Record<string, { packageName: string; dirs: string[] }>;
      assert.equal(graphNodeMetaByFileName[shortenedUiButton]?.packageName, 'ui');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('ignores resolved files from node_modules', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'react-to-uml-agnostic-node-modules-test-'));

    try {
      const appDir = path.join(tempDir, 'packages', 'app');
      const thirdPartyDir = path.join(tempDir, 'node_modules', '@scope', 'third-party');
      mkdirSync(appDir, { recursive: true });
      mkdirSync(thirdPartyDir, { recursive: true });

      const entryFileName = path.join(appDir, 'client.tsx');
      const rootFileName = path.join(appDir, 'Root.tsx');
      const thirdPartyFileName = path.join(thirdPartyDir, 'ThirdParty.tsx');
      const thirdPartyPkgJson = path.join(thirdPartyDir, 'package.json');

      writeFileSync(
        entryFileName,
        `import Root from './Root'; export default function Entry() { return <Root />; }`,
      );
      writeFileSync(
        rootFileName,
        `import { ThirdParty } from '@scope/third-party/ThirdParty'; const Root = () => <ThirdParty />; export default Root;`,
      );
      writeFileSync(
        thirdPartyFileName,
        `export const ThirdParty = () => <button/>; export default ThirdParty;`,
      );
      writeFileSync(
        thirdPartyPkgJson,
        JSON.stringify({ name: '@scope/third-party', main: 'ThirdParty.tsx' }),
      );

      const graph = gatherGraph({
        entryFileName,
      });
      const outFileName = path.join(tempDir, 'build', 'assets', 'treeComponentsGraph.json');
      mkdirSync(path.dirname(outFileName), { recursive: true });
      const { treeComponentsGraph } = buildGraphFromGraph({
        graph,
        entryFileName,
        outFileName,
      });

      const allTargets = [...treeComponentsGraph.values()].flat();
      assert.equal(
        allTargets.some((target) => target.includes('ThirdParty.tsx')),
        false,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('uses entry dir as graph root when all files live under it', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'react-to-uml-entry-root-test-'));

    try {
      const appDir = path.join(tempDir, 'packages', 'app');
      const headerDir = path.join(appDir, 'components', 'layout');
      mkdirSync(headerDir, { recursive: true });

      const entryFileName = path.join(appDir, 'client.tsx');
      const headerFileName = path.join(headerDir, 'Header.tsx');

      writeFileSync(
        entryFileName,
        `import { Header } from './components/layout/Header'; export const App = () => <Header />;`,
      );
      writeFileSync(
        headerFileName,
        `export const Header = () => <header/>; export default Header;`,
      );

      const graph = gatherGraph({
        entryFileName,
      });

      assert.equal(graph.entryGraphPath, '/client.tsx');
      assert.deepEqual(
        graph.sourceFileNameByGraphPath?.map(([graphPath]) => graphPath),
        ['/client.tsx', '/components/layout/Header.tsx'],
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('getCommonParentDir', () => {
  test('returns deepest shared dir', () => {
    assert.equal(
      getCommonParentDir(['/repo/packages/app/a.ts', '/repo/packages/ui/b.ts']),
      '/repo/packages',
    );
  });

  test('does not match partial dir names', () => {
    assert.equal(getCommonParentDir(['/repo/app/a.ts', '/repo/app-ui/b.ts']), '/repo');
  });

  test('returns file dir for a single file', () => {
    assert.equal(getCommonParentDir(['/repo/app/a.ts']), '/repo/app');
  });

  test('falls back to filesystem root', () => {
    assert.equal(getCommonParentDir(['/a/x.ts', '/b/y.ts']), '/');
  });
});
