import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateNodeWidth,
  normalizeGraph,
  computeHierarchy,
  computePackageLayout,
  getHighLevelNodeIds,
  getFilteredGraphData,
  getGraphDataPaths,
  getGraphNodeMetaPaths,
  NODE_HEIGHT,
  NODE_CHAR_WIDTH_ESTIMATE,
  NODE_HORIZONTAL_PADDING,
} from '../client-utils.js';

describe('graph JSON path resolution', () => {
  it('returns default graph data JSON candidates', () => {
    const paths = getGraphDataPaths();
    assert.ok(paths.includes('./treeComponentsGraph.json'));
    assert.ok(paths.includes('/treeComponentsGraph.json'));
  });

  it('returns default node meta JSON candidates', () => {
    const paths = getGraphNodeMetaPaths();
    assert.ok(paths.includes('./graphNodeMetaByFileName.json'));
    assert.ok(paths.includes('/graphNodeMetaByFileName.json'));
  });
});

// ---------------------------------------------------------------------------
// estimateNodeWidth
// ---------------------------------------------------------------------------
describe('estimateNodeWidth', () => {
  it('returns minimum 84 for short labels', () => {
    assert.equal(estimateNodeWidth('A'), 84);
    assert.equal(estimateNodeWidth(''), 84);
  });

  it('grows with label length', () => {
    const short = estimateNodeWidth('Button');
    const long = estimateNodeWidth('ApplicationProvider');
    assert.ok(long > short, `expected ${long} > ${short}`);
  });

  it('caps at 320 for very long labels', () => {
    const veryLong = 'A'.repeat(200);
    assert.equal(estimateNodeWidth(veryLong), 320);
  });

  it('computes expected value for a known label', () => {
    const label = 'MyComponent';
    const expected = Math.max(
      84,
      Math.min(320, Math.ceil(label.length * NODE_CHAR_WIDTH_ESTIMATE + NODE_HORIZONTAL_PADDING * 2)),
    );
    assert.equal(estimateNodeWidth(label), expected);
  });
});

// ---------------------------------------------------------------------------
// normalizeGraph
// ---------------------------------------------------------------------------
describe('normalizeGraph', () => {
  it('returns empty graph for empty input', () => {
    const result = normalizeGraph();
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.links, []);
    assert.equal(result.entryId, undefined);
  });

  it('sets entryId from first element of rawTree', () => {
    const rawTree = [['src/App', ['src/Header', 'src/Footer']]];
    const result = normalizeGraph(rawTree);
    assert.equal(result.entryId, 'src/App');
  });

  it('creates nodes for all unique ids', () => {
    const rawTree = [
      ['src/App', ['src/Header', 'src/Footer']],
      ['src/Header', ['src/Logo']],
    ];
    const result = normalizeGraph(rawTree);
    const ids = result.nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ['src/App', 'src/Footer', 'src/Header', 'src/Logo']);
  });

  it('creates correct links', () => {
    const rawTree = [['A', ['B', 'C']]];
    const result = normalizeGraph(rawTree);
    assert.equal(result.links.length, 2);
    assert.deepEqual(result.links[0], { source: 'A', target: 'B' });
    assert.deepEqual(result.links[1], { source: 'A', target: 'C' });
  });

  it('uses last path segment as label', () => {
    const rawTree = [['src/components/Button', null]];
    const result = normalizeGraph(rawTree);
    assert.equal(result.nodes[0].label, 'Button');
  });

  it('uses full id as label when there is no slash', () => {
    const rawTree = [['Button', null]];
    const result = normalizeGraph(rawTree);
    assert.equal(result.nodes[0].label, 'Button');
  });

  it('assigns packageName from nodeMeta', () => {
    const rawTree = [['src/Button', null]];
    const meta = { 'src/Button': { packageName: 'my-lib' } };
    const result = normalizeGraph(rawTree, meta);
    assert.equal(result.nodes[0].packageName, 'my-lib');
  });

  it('defaults packageName to "root" when meta is missing', () => {
    const rawTree = [['src/Button', null]];
    const result = normalizeGraph(rawTree);
    assert.equal(result.nodes[0].packageName, 'root');
  });

  it('sets correct width and height on nodes', () => {
    const rawTree = [['src/Button', null]];
    const result = normalizeGraph(rawTree);
    const node = result.nodes[0];
    assert.equal(node.height, NODE_HEIGHT);
    assert.equal(node.width, estimateNodeWidth('Button'));
  });

  it('handles source with null targets', () => {
    const rawTree = [['A', null]];
    const result = normalizeGraph(rawTree);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.links.length, 0);
  });

  it('deduplicates nodes across multiple entries', () => {
    const rawTree = [
      ['A', ['B']],
      ['B', ['C']],
      ['A', ['C']],
    ];
    const result = normalizeGraph(rawTree);
    const ids = result.nodes.map((n) => n.id).sort();
    assert.deepEqual(ids, ['A', 'B', 'C']);
  });
});

// ---------------------------------------------------------------------------
// computeHierarchy
// ---------------------------------------------------------------------------
describe('computeHierarchy', () => {
  const mkData = (nodeIds, links, entryId) => ({
    nodes: nodeIds.map((id) => ({ id })),
    links,
    entryId,
  });

  it('returns empty maps for empty graph', () => {
    const result = computeHierarchy({ nodes: [], links: [] });
    assert.equal(result.depthById.size, 0);
    assert.deepEqual(result.roots, []);
  });

  it('assigns depth 0 to root node', () => {
    const data = mkData(['A', 'B'], [{ source: 'A', target: 'B' }], 'A');
    const result = computeHierarchy(data);
    assert.equal(result.depthById.get('A'), 0);
    assert.equal(result.depthById.get('B'), 1);
  });

  it('identifies root nodes (no incoming edges)', () => {
    const data = mkData(['A', 'B', 'C'], [{ source: 'A', target: 'B' }]);
    const result = computeHierarchy(data);
    assert.ok(result.roots.includes('A'));
    assert.ok(result.roots.includes('C'));
    assert.ok(!result.roots.includes('B'));
  });

  it('assigns incrementing depth through a chain', () => {
    const data = mkData(
      ['A', 'B', 'C', 'D'],
      [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'D' },
      ],
      'A',
    );
    const result = computeHierarchy(data);
    assert.equal(result.depthById.get('A'), 0);
    assert.equal(result.depthById.get('B'), 1);
    assert.equal(result.depthById.get('C'), 2);
    assert.equal(result.depthById.get('D'), 3);
  });

  it('uses entryId as preferred root when available', () => {
    const data = mkData(
      ['X', 'Y', 'Z'],
      [
        { source: 'X', target: 'Y' },
        { source: 'X', target: 'Z' },
      ],
      'X',
    );
    const result = computeHierarchy(data);
    assert.equal(result.depthById.get('X'), 0);
  });

  it('handles diamond dependencies (shortest path wins)', () => {
    // A -> B -> D
    // A -> C -> D
    const data = mkData(
      ['A', 'B', 'C', 'D'],
      [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'C' },
        { source: 'B', target: 'D' },
        { source: 'C', target: 'D' },
      ],
      'A',
    );
    const result = computeHierarchy(data);
    assert.equal(result.depthById.get('D'), 2);
  });

  it('handles disconnected components', () => {
    const data = mkData(
      ['A', 'B', 'X', 'Y'],
      [
        { source: 'A', target: 'B' },
        { source: 'X', target: 'Y' },
      ],
      'A',
    );
    const result = computeHierarchy(data);
    // All nodes should have a depth assigned
    assert.equal(result.depthById.size, 4);
    // Disconnected component gets higher depth
    assert.ok(result.depthById.get('X') > result.depthById.get('B'));
  });

  it('handles cycles without infinite loop', () => {
    const data = mkData(
      ['A', 'B', 'C'],
      [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'A' },
      ],
      'A',
    );
    const result = computeHierarchy(data);
    assert.equal(result.depthById.size, 3);
    assert.equal(result.depthById.get('A'), 0);
  });

  it('assigns depth to single-node graph', () => {
    const data = mkData(['Solo'], []);
    const result = computeHierarchy(data);
    assert.equal(result.depthById.get('Solo'), 0);
    assert.deepEqual(result.roots, ['Solo']);
  });
});

// ---------------------------------------------------------------------------
// getHighLevelNodeIds
// ---------------------------------------------------------------------------
describe('getHighLevelNodeIds', () => {
  it('returns empty set for empty data', () => {
    const result = getHighLevelNodeIds({
      data: { nodes: [], links: [], entryId: undefined },
      repetitionLimit: 4,
    });
    assert.equal(result.size, 0);
  });

  it('always includes root node', () => {
    const data = {
      nodes: [{ id: 'A' }, { id: 'B' }],
      links: [{ source: 'A', target: 'B' }],
      entryId: 'A',
    };
    const result = getHighLevelNodeIds({ data, repetitionLimit: 4 });
    assert.ok(result.has('A'));
  });

  it('includes nodes referenced within repetition limit', () => {
    const data = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      links: [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'C' },
      ],
      entryId: 'A',
    };
    const result = getHighLevelNodeIds({ data, repetitionLimit: 4 });
    assert.ok(result.has('B'));
    assert.ok(result.has('C'));
  });

  it('excludes nodes referenced more than repetition limit', () => {
    // B is referenced by A, C, D, E, F — 5 times
    const data = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' }, { id: 'F' }],
      links: [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'C' },
        { source: 'A', target: 'D' },
        { source: 'A', target: 'E' },
        { source: 'A', target: 'F' },
        { source: 'C', target: 'B' },
        { source: 'D', target: 'B' },
        { source: 'E', target: 'B' },
        { source: 'F', target: 'B' },
      ],
      entryId: 'A',
    };
    const result = getHighLevelNodeIds({ data, repetitionLimit: 2 });
    assert.ok(!result.has('B'), 'B should be excluded when referenced more than limit');
  });

  it('uses first node as root when entryId is missing', () => {
    const data = {
      nodes: [{ id: 'X' }, { id: 'Y' }],
      links: [{ source: 'X', target: 'Y' }],
    };
    const result = getHighLevelNodeIds({ data, repetitionLimit: 4 });
    assert.ok(result.has('X'));
  });
});

// ---------------------------------------------------------------------------
// getFilteredGraphData
// ---------------------------------------------------------------------------
describe('getFilteredGraphData', () => {
  const baseData = {
    nodes: [{ id: 'src/App' }, { id: 'src/Header' }, { id: 'src/Footer' }],
    links: [
      { source: 'src/App', target: 'src/Header' },
      { source: 'src/App', target: 'src/Footer' },
    ],
    entryId: 'src/App',
  };

  it('returns data unchanged when no filters active', () => {
    const result = getFilteredGraphData({
      data: baseData,
      searchQuery: '',
      omitBySearch: false,
      hideLowLevelComponents: false,
      lowLevelRepetitionLimit: 4,
    });
    assert.equal(result.nodes.length, 3);
    assert.equal(result.links.length, 2);
  });

  it('filters nodes by search when omitBySearch is true', () => {
    const result = getFilteredGraphData({
      data: baseData,
      searchQuery: 'header',
      omitBySearch: true,
      hideLowLevelComponents: false,
      lowLevelRepetitionLimit: 4,
    });
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].id, 'src/Header');
  });

  it('does not filter by search when omitBySearch is false', () => {
    const result = getFilteredGraphData({
      data: baseData,
      searchQuery: 'header',
      omitBySearch: false,
      hideLowLevelComponents: false,
      lowLevelRepetitionLimit: 4,
    });
    assert.equal(result.nodes.length, 3);
  });

  it('does not filter when searchQuery is empty even with omitBySearch', () => {
    const result = getFilteredGraphData({
      data: baseData,
      searchQuery: '',
      omitBySearch: true,
      hideLowLevelComponents: false,
      lowLevelRepetitionLimit: 4,
    });
    assert.equal(result.nodes.length, 3);
  });

  it('removes links to filtered-out nodes when searching', () => {
    const result = getFilteredGraphData({
      data: baseData,
      searchQuery: 'header',
      omitBySearch: true,
      hideLowLevelComponents: false,
      lowLevelRepetitionLimit: 4,
    });
    assert.equal(result.links.length, 0);
  });

  it('preserves links between matched nodes', () => {
    const data = {
      nodes: [{ id: 'A' }, { id: 'AB' }, { id: 'C' }],
      links: [
        { source: 'A', target: 'AB' },
        { source: 'A', target: 'C' },
      ],
      entryId: 'A',
    };
    const result = getFilteredGraphData({
      data,
      searchQuery: 'a',
      omitBySearch: true,
      hideLowLevelComponents: false,
      lowLevelRepetitionLimit: 4,
    });
    assert.equal(result.nodes.length, 2); // A, AB
    assert.equal(result.links.length, 1); // A -> AB
  });

  it('applies hideLowLevelComponents filter', () => {
    const result = getFilteredGraphData({
      data: baseData,
      searchQuery: '',
      omitBySearch: false,
      hideLowLevelComponents: true,
      lowLevelRepetitionLimit: 4,
    });
    // With repetition limit 4, all nodes should remain (each referenced once)
    assert.ok(result.nodes.length <= baseData.nodes.length);
  });

  it('combines hideLowLevelComponents and search filters', () => {
    const result = getFilteredGraphData({
      data: baseData,
      searchQuery: 'app',
      omitBySearch: true,
      hideLowLevelComponents: true,
      lowLevelRepetitionLimit: 4,
    });
    assert.ok(result.nodes.every((n) => n.id.toLowerCase().includes('app')));
  });

  it('search matches case-insensitively (query is pre-lowercased by caller)', () => {
    const result = getFilteredGraphData({
      data: baseData,
      searchQuery: 'header', // caller lowercases; match against mixed-case id
      omitBySearch: true,
      hideLowLevelComponents: false,
      lowLevelRepetitionLimit: 4,
    });
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].id, 'src/Header');
  });
});

// ---------------------------------------------------------------------------
// computePackageLayout
// ---------------------------------------------------------------------------
describe('computePackageLayout', () => {
  const makeNodes = (ids, packageName = 'root') =>
    ids.map((id) => ({
      id,
      label: id,
      packageName,
      width: estimateNodeWidth(id),
      height: NODE_HEIGHT,
    }));

  it('returns maps for a simple graph', () => {
    const nodes = makeNodes(['A', 'B']);
    const depthById = new Map([
      ['A', 0],
      ['B', 1],
    ]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'A',
    });
    assert.ok(result.groupsByPackage instanceof Map);
    assert.ok(result.slotsByNodeId instanceof Map);
    assert.equal(result.groupsByPackage.size, 1);
    assert.equal(result.slotsByNodeId.size, 2);
  });

  it('assigns slot positions to all nodes', () => {
    const nodes = makeNodes(['A', 'B', 'C']);
    const depthById = new Map([
      ['A', 0],
      ['B', 1],
      ['C', 1],
    ]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'A',
    });
    for (const id of ['A', 'B', 'C']) {
      const slot = result.slotsByNodeId.get(id);
      assert.ok(slot, `slot for ${id} should exist`);
      assert.ok(typeof slot.x === 'number');
      assert.ok(typeof slot.y === 'number');
    }
  });

  it('groups nodes by package', () => {
    const nodes = [
      ...makeNodes(['A'], 'pkg-a'),
      ...makeNodes(['B'], 'pkg-b'),
    ];
    const depthById = new Map([
      ['A', 0],
      ['B', 0],
    ]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'A',
    });
    assert.equal(result.groupsByPackage.size, 2);
    assert.ok(result.groupsByPackage.has('pkg-a'));
    assert.ok(result.groupsByPackage.has('pkg-b'));
  });

  it('group containing entryId is positioned first (leftmost)', () => {
    const nodes = [
      ...makeNodes(['Z'], 'pkg-z'),
      ...makeNodes(['Entry'], 'pkg-entry'),
    ];
    const depthById = new Map([
      ['Z', 0],
      ['Entry', 0],
    ]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'Entry',
    });
    const entryGroupX = result.groupsByPackage.get('pkg-entry').x;
    const otherGroupX = result.groupsByPackage.get('pkg-z').x;
    assert.ok(entryGroupX < otherGroupX, 'entry group should be left of other group');
  });

  it('group dimensions are positive', () => {
    const nodes = makeNodes(['A', 'B']);
    const depthById = new Map([
      ['A', 0],
      ['B', 1],
    ]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'A',
    });
    const group = result.groupsByPackage.get('root');
    assert.ok(group.width > 0);
    assert.ok(group.height > 0);
  });

  it('nodes at different depths have different y positions', () => {
    const nodes = makeNodes(['A', 'B']);
    const depthById = new Map([
      ['A', 0],
      ['B', 1],
    ]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'A',
    });
    const slotA = result.slotsByNodeId.get('A');
    const slotB = result.slotsByNodeId.get('B');
    assert.ok(slotA.y < slotB.y, 'deeper node should have larger y');
  });

  it('spacing factor scales the layout', () => {
    const nodes = makeNodes(['A', 'B']);
    const depthById = new Map([
      ['A', 0],
      ['B', 1],
    ]);
    const result1 = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'A',
    });
    const result2 = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 2,
      depthById,
      entryId: 'A',
    });
    const dy1 = result1.slotsByNodeId.get('B').y - result1.slotsByNodeId.get('A').y;
    const dy2 = result2.slotsByNodeId.get('B').y - result2.slotsByNodeId.get('A').y;
    assert.ok(dy2 > dy1, 'larger spacing factor should produce larger vertical gap');
  });

  it('stacks package groups top-to-bottom when hierarchyDirection is TB', () => {
    const nodes = [
      ...makeNodes(['Entry'], 'pkg-entry'),
      ...makeNodes(['Child'], 'pkg-child'),
    ];
    const depthById = new Map([
      ['Entry', 0],
      ['Child', 1],
    ]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'Entry',
      hierarchyDirection: 'TB',
    });
    const entryGroup = result.groupsByPackage.get('pkg-entry');
    const childGroup = result.groupsByPackage.get('pkg-child');
    assert.ok(entryGroup.y < childGroup.y, 'entry group should be above child group');
  });

  it('keeps package groups in one centered column when hierarchyDirection is TB', () => {
    const nodes = [
      ...makeNodes(['A'], 'pkg-a'),
      ...makeNodes(['B'], 'pkg-b'),
    ];
    const depthById = new Map([
      ['A', 0],
      ['B', 0],
    ]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'A',
      hierarchyDirection: 'TB',
    });
    const groupA = result.groupsByPackage.get('pkg-a');
    const groupB = result.groupsByPackage.get('pkg-b');
    assert.equal(groupA.x, groupB.x, 'groups should share the same x position');
  });

  it('orders groups by import order after the entry group', () => {
    const nodes = [
      ...makeNodes(['Entry'], 'pkg-entry'),
      ...makeNodes(['Small'], 'pkg-small'),
      ...makeNodes(['Big1', 'Big2', 'Big3'], 'pkg-big'),
    ];
    const depthById = new Map([
      ['Entry', 0],
      ['Small', 2],
      ['Big1', 1],
      ['Big2', 1],
      ['Big3', 1],
    ]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'Entry',
      hierarchyDirection: 'TB',
    });
    const order = [...result.groupsByPackage.values()]
      .sort((a, b) => a.y - b.y)
      .map((group) => group.packageName);
    assert.deepEqual(order, ['pkg-entry', 'pkg-small', 'pkg-big']);
  });

  it('centers groups of different widths on one axis when hierarchyDirection is TB', () => {
    const wideIds = Array.from({ length: 30 }, (_, index) => `Wide${index}`);
    const nodes = [...makeNodes(['A'], 'pkg-a'), ...makeNodes(wideIds, 'pkg-wide')];
    const depthById = new Map([['A', 0], ...wideIds.map((id) => [id, 1])]);
    const result = computePackageLayout({
      nodes,
      width: 960,
      spacingFactor: 1,
      depthById,
      entryId: 'A',
      hierarchyDirection: 'TB',
    });
    const groupA = result.groupsByPackage.get('pkg-a');
    const groupWide = result.groupsByPackage.get('pkg-wide');
    assert.ok(groupWide.width > 960, 'wide group should be wider than the viewport');
    assert.equal(groupA.centerX, groupWide.centerX);
    assert.equal(groupA.centerX, result.centerAxisX);
    assert.ok(groupWide.x >= 0, 'wide group should not start off-canvas');
  });
});
