export const DEFAULT_REPETITION_LIMIT = 4;
export const SEARCH_DEBOUNCE_MS = 120;
export const SIMULATION_ALPHA_DECAY = 0.06;
export const SIMULATION_VELOCITY_DECAY = 0.45;
export const NODE_HEIGHT = 26;
export const NODE_FONT_SIZE = 11;
export const NODE_CHAR_WIDTH_ESTIMATE = 6.8;
export const NODE_HORIZONTAL_PADDING = 16;
export const GROUP_HEADER_HEIGHT = 24;
export const GROUP_OUTER_PADDING = 20;
export const NODE_FILL_DEFAULT = '#2f4fc9';
export const NODE_FILL_MATCH = '#0a8a62';
export const NODE_STROKE_DEFAULT = '#dbe5ff';
export const NODE_LABEL_COLOR = '#ffffff';
export const NODE_LABEL_STROKE = 'rgba(6, 10, 24, 0.95)';

const DEFAULT_GRAPH_FILE = 'treeComponentsGraph.json';
const DEFAULT_NODE_META_FILE = 'graphNodeMetaByFileName.json';

const getQueryParam = (key) => {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return new URLSearchParams(window.location.search).get(key) ?? '';
  } catch {
    return '';
  }
};

const buildJsonPathCandidates = (fileName) => {
  const normalized = String(fileName || '').replace(/^\/+/, '');
  if (!normalized) {
    return [];
  }

  const baseName = normalized.split('/').slice(-1)[0];
  return [...new Set([`./${normalized}`, `/${normalized}`, `./${baseName}`, `/${baseName}`])];
};

export const getGraphDataPaths = () => {
  const configured = getQueryParam('graph');
  return buildJsonPathCandidates(configured || DEFAULT_GRAPH_FILE);
};

export const getGraphNodeMetaPaths = () => {
  const configured = getQueryParam('meta');
  return buildJsonPathCandidates(configured || DEFAULT_NODE_META_FILE);
};

export const graphDataPaths = getGraphDataPaths();
export const graphNodeMetaPaths = getGraphNodeMetaPaths();

export const estimateNodeWidth = (label) => {
  const textWidth = label.length * NODE_CHAR_WIDTH_ESTIMATE;
  return Math.max(84, Math.min(320, Math.ceil(textWidth + NODE_HORIZONTAL_PADDING * 2)));
};

export const normalizeGraph = (rawTree = [], nodeMetaByFileName = {}) => {
  const nodeSet = new Set();
  const links = [];
  const entryId = rawTree[0]?.[0];

  rawTree.forEach(([source, targets]) => {
    nodeSet.add(source);
    (targets ?? []).forEach((target) => {
      nodeSet.add(target);
      links.push({ source, target });
    });
  });

  const nodes = [...nodeSet].map((id) => ({
    id,
    label: id.split('/').slice(-1)[0] || id,
    packageName: nodeMetaByFileName[id]?.packageName ?? 'root',
    width: estimateNodeWidth(id.split('/').at(-1) || id),
    height: NODE_HEIGHT,
  }));

  return { nodes, links, entryId };
};

export const computePackageLayout = ({
  nodes,
  width,
  spacingFactor,
  depthById,
  entryId,
  hierarchyDirection = 'LR',
}) => {
  const groupsByPackage = new Map();
  const slotsByNodeId = new Map();
  const nodesByPackage = new Map();
  const nodeGapX = 16 * spacingFactor;
  const levelGapY = 22 * spacingFactor;
  const groupGapX = 38 * spacingFactor;
  const groupGapY = 26 * spacingFactor;
  const groupPadding = GROUP_OUTER_PADDING * spacingFactor;
  const edgePaddingX = 24;
  const edgePaddingY = 16;
  const maxDepth = Math.max(0, ...depthById.values());
  const depthRowStep = NODE_HEIGHT + levelGapY;
  const depthContentTopY = edgePaddingY + GROUP_HEADER_HEIGHT + groupPadding;
  const sharedGroupHeight =
    GROUP_HEADER_HEIGHT + groupPadding * 2 + (maxDepth + 1) * NODE_HEIGHT + maxDepth * levelGapY;

  nodes.forEach((node) => {
    if (!nodesByPackage.has(node.packageName)) {
      nodesByPackage.set(node.packageName, []);
    }
    nodesByPackage.get(node.packageName).push(node);
  });

  const packageMetrics = [...nodesByPackage.entries()].map(([packageName, packageNodes]) => {
    const depths = packageNodes.map((node) => depthById.get(node.id) ?? maxDepth + 1);
    const minDepth = Math.min(...depths);
    const hasEntry = packageNodes.some((node) => node.id === entryId);
    const nodesAtDepth = new Map();
    packageNodes.forEach((node) => {
      const depth = depthById.get(node.id) ?? maxDepth + 1;
      if (!nodesAtDepth.has(depth)) {
        nodesAtDepth.set(depth, []);
      }
      nodesAtDepth.get(depth).push(node);
    });

    const maxNodeWidth = Math.max(84, ...packageNodes.map((node) => node.width));
    const maxNodesInSingleDepth = Math.max(
      1,
      ...[...nodesAtDepth.values()].map((depthNodes) => depthNodes.length),
    );
    const innerWidth = maxNodesInSingleDepth * maxNodeWidth + (maxNodesInSingleDepth - 1) * nodeGapX;
    return {
      packageName,
      packageNodes,
      nodesAtDepth,
      minDepth,
      hasEntry,
      maxNodeWidth,
      innerWidth,
      groupWidth: groupPadding * 2 + innerWidth,
    };
  });

  // nodes come in import order (BFS from the entry), so a group's first node index is its import order
  const firstNodeIndexByPackage = new Map();
  nodes.forEach((node, index) => {
    if (!firstNodeIndexByPackage.has(node.packageName)) {
      firstNodeIndexByPackage.set(node.packageName, index);
    }
  });
  const orderedPackageMetrics = packageMetrics.sort((a, b) => {
    if (a.hasEntry !== b.hasEntry) {
      return a.hasEntry ? -1 : 1;
    }
    return firstNodeIndexByPackage.get(a.packageName) - firstNodeIndexByPackage.get(b.packageName);
  });

  const totalRowWidth =
    orderedPackageMetrics.reduce((acc, metric) => acc + metric.groupWidth, 0) +
    Math.max(0, orderedPackageMetrics.length - 1) * groupGapX;
  const groupHeightByDirection = sharedGroupHeight;
  const totalColumnHeight =
    orderedPackageMetrics.length * groupHeightByDirection +
    Math.max(0, orderedPackageMetrics.length - 1) * groupGapY;
  const maxGroupWidth = Math.max(0, ...orderedPackageMetrics.map((metric) => metric.groupWidth));
  // TB: every group is centered on one vertical axis, wide enough for the widest group
  const centerAxisX = Math.max(width, maxGroupWidth + edgePaddingX * 2) / 2;
  let cursorX = Math.max(edgePaddingX, (width - totalRowWidth) / 2);
  let cursorY = edgePaddingY;
  if (hierarchyDirection === 'TB') {
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : totalColumnHeight;
    cursorY = Math.max(edgePaddingY, (viewportHeight - totalColumnHeight) / 2);
  }

  orderedPackageMetrics.forEach((metric) => {
    const packageNodes = metric.packageNodes
      .slice()
      .sort((a, b) => {
        if (a.id === entryId || b.id === entryId) {
          return a.id === entryId ? -1 : 1;
        }
        const depthA = depthById.get(a.id) ?? maxDepth + 1;
        const depthB = depthById.get(b.id) ?? maxDepth + 1;
        if (depthA !== depthB) {
          return depthA - depthB;
        }
        return a.label.localeCompare(b.label);
      });

    const groupX = hierarchyDirection === 'TB' ? centerAxisX - metric.groupWidth / 2 : cursorX;
    const groupY = hierarchyDirection === 'TB' ? cursorY : edgePaddingY;
    groupsByPackage.set(metric.packageName, {
      packageName: metric.packageName,
      nodeCount: packageNodes.length,
      x: groupX,
      y: groupY,
      width: metric.groupWidth,
      height: sharedGroupHeight,
      centerX: groupX + metric.groupWidth / 2,
      centerY: groupY + sharedGroupHeight / 2,
    });

    metric.nodesAtDepth.forEach((depthNodes, depth) => {
      const sortedDepthNodes = depthNodes
        .slice()
        .sort((a, b) => {
          if (a.id === entryId || b.id === entryId) {
            return a.id === entryId ? -1 : 1;
          }
          return a.label.localeCompare(b.label);
        });
      const depthRowWidth =
        sortedDepthNodes.length * metric.maxNodeWidth +
        (sortedDepthNodes.length - 1) * nodeGapX;
      const rowStartX = groupX + groupPadding + (metric.innerWidth - depthRowWidth) / 2;
      const rowY = groupY + depthContentTopY + depth * depthRowStep;

      sortedDepthNodes.forEach((node, index) => {
        const cellX = rowStartX + index * (metric.maxNodeWidth + nodeGapX);
        slotsByNodeId.set(node.id, {
          x: cellX + metric.maxNodeWidth / 2,
          y: rowY + NODE_HEIGHT / 2,
        });
      });
    });

    if (hierarchyDirection === 'TB') {
      cursorY += sharedGroupHeight + groupGapY;
    } else {
      cursorX += metric.groupWidth + groupGapX;
    }
  });

  return { groupsByPackage, slotsByNodeId, centerAxisX };
};

export const computeHierarchy = (data) => {
  const outgoingById = new Map();
  const incomingCountById = new Map();

  data.nodes.forEach((node) => {
    outgoingById.set(node.id, []);
    incomingCountById.set(node.id, 0);
  });

  data.links.forEach((link) => {
    if (!outgoingById.has(link.source)) {
      outgoingById.set(link.source, []);
    }
    outgoingById.get(link.source).push(link.target);
    incomingCountById.set(link.target, (incomingCountById.get(link.target) ?? 0) + 1);
  });

  const roots = data.nodes
    .filter((node) => (incomingCountById.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const depthById = new Map();
  const queue = [];
  const visited = new Set();

  const enqueueWithDepth = (startId, startDepth) => {
    if (!startId || visited.has(startId)) {
      return;
    }
    queue.push(startId);
    depthById.set(startId, startDepth);

    while (queue.length) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);
      const currentDepth = depthById.get(currentId) ?? startDepth;
      const nextTargets = outgoingById.get(currentId) ?? [];

      nextTargets.forEach((targetId) => {
        const nextDepth = currentDepth + 1;
        const savedDepth = depthById.get(targetId);
        if (savedDepth === undefined || nextDepth < savedDepth) {
          depthById.set(targetId, nextDepth);
        }
        if (!visited.has(targetId)) {
          queue.push(targetId);
        }
      });
    }
  };

  const preferredRootId =
    data.entryId && outgoingById.has(data.entryId) ? data.entryId : (roots[0] ?? data.nodes[0]?.id);
  enqueueWithDepth(preferredRootId, 0);

  let nextComponentDepth = Math.max(0, ...depthById.values()) + 1;
  roots.forEach((rootId) => {
    if (!visited.has(rootId)) {
      enqueueWithDepth(rootId, nextComponentDepth);
      nextComponentDepth = Math.max(nextComponentDepth, ...depthById.values()) + 1;
    }
  });

  data.nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      enqueueWithDepth(node.id, nextComponentDepth);
      nextComponentDepth = Math.max(nextComponentDepth, ...depthById.values()) + 1;
    }
  });

  return { depthById, roots };
};

export const getHighLevelNodeIds = ({ data, repetitionLimit }) => {
  const connectionsBySource = new Map();
  data.links.forEach((link) => {
    if (!connectionsBySource.has(link.source)) {
      connectionsBySource.set(link.source, []);
    }
    connectionsBySource.get(link.source).push(link.target);
  });

  const rootId =
    data.entryId && data.nodes.some((node) => node.id === data.entryId)
      ? data.entryId
      : data.nodes[0]?.id;
  if (!rootId) {
    return new Set();
  }

  // counts how many times each node is reached when the tree is expanded from the root
  // (cycles are cut per branch). Counting stops once a node passes the limit: everything
  // below it would pass the limit too, so it is marked at once. Walking every path instead
  // explodes on large graphs and freezes the page.
  const counterPerFile = new Map();
  const overLimit = new Set();
  const branch = new Set([rootId]);

  const markOverLimit = (id) => {
    const queue = [id];
    while (queue.length) {
      const next = queue.pop();
      if (overLimit.has(next)) {
        continue;
      }
      overLimit.add(next);
      queue.push(...(connectionsBySource.get(next) ?? []));
    }
  };

  const countConnections = (fromId) => {
    (connectionsBySource.get(fromId) ?? []).forEach((targetId) => {
      if (overLimit.has(targetId)) {
        return;
      }
      const count = (counterPerFile.get(targetId) ?? 0) + 1;
      counterPerFile.set(targetId, count);
      if (count > repetitionLimit) {
        markOverLimit(targetId);
        return;
      }
      if (branch.has(targetId)) {
        return;
      }
      branch.add(targetId);
      countConnections(targetId);
      branch.delete(targetId);
    });
  };

  countConnections(rootId);

  const usedIds = new Set([rootId]);
  counterPerFile.forEach((count, id) => {
    if (!overLimit.has(id) && count <= repetitionLimit) {
      usedIds.add(id);
    }
  });

  return usedIds;
};

export const getFilteredGraphData = ({
  data,
  searchQuery,
  omitBySearch,
  hideLowLevelComponents,
  lowLevelRepetitionLimit,
}) => {
  let nextData = data;

  if (hideLowLevelComponents) {
    const keepIds = getHighLevelNodeIds({
      data: nextData,
      repetitionLimit: lowLevelRepetitionLimit,
    });
    const nodes = nextData.nodes.filter((node) => keepIds.has(node.id));
    const links = nextData.links.filter(
      (link) => keepIds.has(link.source) && keepIds.has(link.target),
    );
    nextData = { ...nextData, nodes, links };
  }

  if (omitBySearch && searchQuery) {
    const matchedIds = new Set(
      nextData.nodes
        .filter((node) => node.id.toLowerCase().includes(searchQuery))
        .map((node) => node.id),
    );
    const nodes = nextData.nodes.filter((node) => matchedIds.has(node.id));
    const links = nextData.links.filter(
      (link) => matchedIds.has(link.source) && matchedIds.has(link.target),
    );
    nextData = { ...nextData, nodes, links };
  }

  return nextData;
};
