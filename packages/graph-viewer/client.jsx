import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DEFAULT_REPETITION_LIMIT,
  SEARCH_DEBOUNCE_MS,
  SIMULATION_ALPHA_DECAY,
  SIMULATION_VELOCITY_DECAY,
  NODE_HEIGHT,
  NODE_FONT_SIZE,
  NODE_FILL_DEFAULT,
  NODE_FILL_MATCH,
  NODE_STROKE_DEFAULT,
  NODE_LABEL_COLOR,
  NODE_LABEL_STROKE,
  graphDataPaths,
  graphNodeMetaPaths,
  normalizeGraph,
  computePackageLayout,
  computeHierarchy,
  getFilteredGraphData,
} from './client-utils.js';

const d3 = window.d3;

const useDebouncedValue = (value, delayMs = SEARCH_DEBOUNCE_MS) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
};

const GraphCanvas = ({
  data,
  search,
  layoutMode,
  hierarchyDirection,
  spacingFactor,
  omitBySearch,
  hideLowLevelComponents,
  lowLevelRepetitionLimit,
}) => {
  const svgRef = useRef(null);
  const simulationRef = useRef(null);

  const searchQuery = search.trim().toLowerCase();
  const matchedIds = useMemo(() => {
    if (!searchQuery) {
      return new Set();
    }
    return new Set(
      data.nodes
        .filter((node) => node.id.toLowerCase().includes(searchQuery))
        .map((node) => node.id),
    );
  }, [data.nodes, searchQuery]);

  const renderData = useMemo(() => {
    return getFilteredGraphData({
      data,
      searchQuery,
      omitBySearch,
      hideLowLevelComponents,
      lowLevelRepetitionLimit,
    });
  }, [data, hideLowLevelComponents, lowLevelRepetitionLimit, omitBySearch, searchQuery]);

  useEffect(() => {
    if (!d3) {
      return undefined;
    }

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth || window.innerWidth;
    const height = svgRef.current.clientHeight || window.innerHeight;
    svg.selectAll('*').remove();
    svg.style('transition', 'none');

    const zoomLayer = svg.append('g');
    const groupsLayer = zoomLayer.append('g');
    const linksLayer = zoomLayer.append('g');
    const nodesLayer = zoomLayer.append('g');
    const labelsLayer = zoomLayer.append('g');

    const markerId = `arrow-${Math.random().toString(36).slice(2, 8)}`;
    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', markerId)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 15)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#6f80bd')
      .attr('opacity', 0.95);

    const hierarchy = computeHierarchy(renderData);
    const packageLayout = computePackageLayout({
      nodes: renderData.nodes,
      width: Math.max(width, 960),
      spacingFactor,
      depthById: hierarchy.depthById,
      entryId: renderData.entryId,
      hierarchyDirection: layoutMode === 'grouped' ? 'TB' : hierarchyDirection,
    });
    const maxDepth = Math.max(0, ...hierarchy.depthById.values());
    const verticalPadding = 70;
    const horizontalPadding = 70;
    const depthSpan = Math.max(
      120,
      hierarchyDirection === 'LR' ? width - horizontalPadding * 2 : height - verticalPadding * 2,
    );
    const baseDepthGap = maxDepth === 0 ? 0 : depthSpan / maxDepth;
    const depthGap = Math.min(220, baseDepthGap * spacingFactor);
    const nodesByDepth = new Map();
    const xTargetById = new Map();
    const yTargetById = new Map();
    const getDepthPosition = (nodeId) => {
      const depth = hierarchy.depthById.get(nodeId) ?? 0;
      return (hierarchyDirection === 'LR' ? horizontalPadding : verticalPadding) + depth * depthGap;
    };

    renderData.nodes.forEach((node) => {
      const depth = hierarchy.depthById.get(node.id) ?? 0;
      if (!nodesByDepth.has(depth)) {
        nodesByDepth.set(depth, []);
      }
      nodesByDepth.get(depth).push(node.id);
    });

    nodesByDepth.forEach((nodeIds) => {
      const sortedIds = [...nodeIds].sort();
      const availableCrossSpan =
        hierarchyDirection === 'LR'
          ? Math.max(120, height - verticalPadding * 2)
          : Math.max(120, width - horizontalPadding * 2);
      sortedIds.forEach((id, index) => {
        const position =
          (hierarchyDirection === 'LR' ? verticalPadding : horizontalPadding) +
          ((index + 1) / (sortedIds.length + 1)) * availableCrossSpan;
        if (hierarchyDirection === 'LR') {
          yTargetById.set(id, position);
        } else {
          xTargetById.set(id, position);
        }
      });
    });

    const simulation = d3
      .forceSimulation(renderData.nodes.map((node) => ({ ...node })))
      .alphaDecay(SIMULATION_ALPHA_DECAY)
      .velocityDecay(SIMULATION_VELOCITY_DECAY);
    const linkDistance = 95 * spacingFactor;
    const collisionPadding = 8 * spacingFactor;

    const linkForce = d3
      .forceLink(renderData.links.map((link) => ({ ...link })))
      .id((d) => d.id)
      .distance(linkDistance)
      .strength(layoutMode === 'hierarchy' ? 0.18 : 0.7);

    simulation.force('link', linkForce).force(
      'collide',
      d3.forceCollide((node) => Math.max(node.width, node.height) / 2 + collisionPadding),
    );

    if (layoutMode === 'hierarchy') {
      simulation
        .force('charge', d3.forceManyBody().strength(-140 * spacingFactor))
        .force(
          hierarchyDirection === 'LR' ? 'x' : 'y',
          (hierarchyDirection === 'LR'
            ? d3.forceX((node) => getDepthPosition(node.id))
            : d3.forceY((node) => getDepthPosition(node.id))
          ).strength(1.35),
        )
        .force(
          hierarchyDirection === 'LR' ? 'y' : 'x',
          (hierarchyDirection === 'LR'
            ? d3.forceY((node) => yTargetById.get(node.id) ?? height / 2)
            : d3.forceX((node) => xTargetById.get(node.id) ?? width / 2)
          ).strength(0.35),
        );
    } else if (layoutMode === 'grouped') {
      simulation
        .force('charge', d3.forceManyBody().strength(-55 * spacingFactor))
        .force(
          'x',
          d3
            .forceX((node) => packageLayout.slotsByNodeId.get(node.id)?.x ?? width / 2)
            .strength(1.15),
        )
        .force(
          'y',
          d3
            .forceY((node) => packageLayout.slotsByNodeId.get(node.id)?.y ?? height / 2)
            .strength(1.15),
        );
    } else {
      simulation
        .force('charge', d3.forceManyBody().strength(-350 * spacingFactor))
        .force('center', d3.forceCenter(width / 2, height / 2));
    }

    simulationRef.current = simulation;

    const zoom = d3
      .zoom()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform);
      });

    svg.call(zoom);

    if (layoutMode === 'grouped') {
      const groupItems = [...packageLayout.groupsByPackage.values()];
      // start with the groups' center axis in the middle of the viewport, zoomed out to fit the widest group
      const maxGroupWidth = Math.max(0, ...groupItems.map((group) => group.width));
      const [minScale, maxScale] = zoom.scaleExtent();
      const initialScale = Math.min(maxScale, 1, Math.max(minScale, width / (maxGroupWidth + 48)));
      svg.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width / 2 - packageLayout.centerAxisX * initialScale, 0)
          .scale(initialScale),
      );
      groupsLayer
        .selectAll('rect')
        .data(groupItems)
        .join('rect')
        .attr('x', (group) => group.x)
        .attr('y', (group) => group.y)
        .attr('width', (group) => group.width)
        .attr('height', (group) => group.height)
        .attr('rx', 14)
        .attr('fill', 'rgba(80, 114, 208, 0.14)')
        .attr('stroke', 'rgba(142, 160, 211, 0.38)')
        .attr('stroke-width', 1.1);

      groupsLayer
        .selectAll('text')
        .data(groupItems)
        .join('text')
        .text((group) => `${group.packageName} (${group.nodeCount})`)
        .attr('x', (group) => group.x + 10)
        .attr('y', (group) => group.y + 16)
        .attr('fill', '#9fb0df')
        .attr('font-size', 11)
        .attr('font-weight', 600);
    }

    const linkSelection = linksLayer
      .selectAll('line')
      .data(simulation.force('link').links())
      .join('line')
      .attr('stroke', '#5d6ca0')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.2)
      .attr('marker-end', `url(#${markerId})`)
      .style('transition', 'none');

    const nodeSelection = nodesLayer
      .selectAll('rect')
      .data(simulation.nodes())
      .join('rect')
      .attr('width', (d) => d.width)
      .attr('height', (d) => d.height)
      .attr('rx', 6)
      .attr('fill', NODE_FILL_DEFAULT)
      .attr('stroke', NODE_STROKE_DEFAULT)
      .attr('stroke-width', 1)
      .style('transition', 'none')
      .call(
        d3
          .drag()
          .on('start', (event) => {
            if (!event.active) {
              simulation.alphaTarget(0.3).restart();
            }
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
          })
          .on('drag', (event) => {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
          })
          .on('end', (event) => {
            if (!event.active) {
              simulation.alphaTarget(0);
            }
            event.subject.fx = null;
            event.subject.fy = null;
          }),
      );

    const labelSelection = labelsLayer
      .selectAll('text')
      .data(simulation.nodes())
      .join('text')
      .text((d) => d.label)
      .attr('fill', NODE_LABEL_COLOR)
      .attr('font-size', NODE_FONT_SIZE)
      .attr('font-weight', 600)
      .attr('stroke', NODE_LABEL_STROKE)
      .attr('stroke-width', 0.85)
      .attr('paint-order', 'stroke')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('pointer-events', 'none')
      .style('transition', 'none');

    const applySearchState = () => {
      if (!matchedIds.size) {
        nodeSelection
          .attr('fill', NODE_FILL_DEFAULT)
          .attr('stroke', NODE_STROKE_DEFAULT)
          .attr('opacity', 1)
          .attr('stroke-width', 1);
        labelSelection.attr('opacity', 0.92);
        linkSelection
          .attr('stroke', '#5d6ca0')
          .attr('stroke-opacity', 0.6)
          .attr('stroke-width', 1.2);
        return;
      }

      nodeSelection
        .attr('fill', (d) => (matchedIds.has(d.id) ? NODE_FILL_MATCH : NODE_FILL_DEFAULT))
        .attr('stroke', (d) => (matchedIds.has(d.id) ? '#d4ffef' : NODE_STROKE_DEFAULT))
        .attr('opacity', (d) => (matchedIds.has(d.id) ? 1 : 0.18))
        .attr('stroke-width', (d) => (matchedIds.has(d.id) ? 1.9 : 1));

      labelSelection.attr('opacity', (d) => (matchedIds.has(d.id) ? 1 : 0.12));

      linkSelection
        .attr('stroke', (d) =>
          matchedIds.has(d.source.id) && matchedIds.has(d.target.id) ? '#7cf4c9' : '#5d6ca0',
        )
        .attr('stroke-opacity', (d) =>
          matchedIds.has(d.source.id) && matchedIds.has(d.target.id) ? 0.82 : 0.08,
        )
        .attr('stroke-width', (d) =>
          matchedIds.has(d.source.id) && matchedIds.has(d.target.id) ? 2 : 1.2,
        );
    };

    applySearchState();

    simulation.on('tick', () => {
      if (layoutMode === 'hierarchy') {
        simulation.nodes().forEach((node) => {
          if (hierarchyDirection === 'LR') {
            node.x = getDepthPosition(node.id);
            node.vx = 0;
          } else {
            node.y = getDepthPosition(node.id);
            node.vy = 0;
          }
        });
      } else if (layoutMode === 'grouped') {
        simulation.nodes().forEach((node) => {
          const slot = packageLayout.slotsByNodeId.get(node.id);
          if (!slot) {
            return;
          }
          node.x = slot.x;
          node.y = slot.y;
          node.vx = 0;
          node.vy = 0;
        });
      }

      linkSelection
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

      nodeSelection.attr('x', (d) => d.x - d.width / 2).attr('y', (d) => d.y - d.height / 2);
      labelSelection.attr('x', (d) => d.x).attr('y', (d) => d.y);
    });

    return () => {
      simulation.stop();
    };
  }, [hierarchyDirection, layoutMode, matchedIds, omitBySearch, renderData, spacingFactor]);

  return (
    // fills the space left under the toolbar, which may wrap to several rows
    <svg ref={svgRef} style={{ width: '100%', flex: '1 1 auto', minHeight: 0, display: 'block' }} />
  );
};

const App = () => {
  const [searchInput, setSearchInput] = useState('');
  const [layoutMode, setLayoutMode] = useState('grouped');
  const [hierarchyDirection, setHierarchyDirection] = useState('LR');
  const [spacingFactor, setSpacingFactor] = useState(1.35);
  const [omitBySearch, setOmitBySearch] = useState(false);
  const [hideLowLevelComponents, setHideLowLevelComponents] = useState(true);
  const [lowLevelRepetitionLimit, setLowLevelRepetitionLimit] = useState(DEFAULT_REPETITION_LIMIT);
  const [error, setError] = useState(!d3 ? 'D3 is not loaded in the page.' : '');
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const search = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const isSearchDebouncing = searchInput !== search;
  const visibleStats = useMemo(() => {
    const filteredGraph = getFilteredGraphData({
      data: graph,
      searchQuery: search.trim().toLowerCase(),
      omitBySearch,
      hideLowLevelComponents,
      lowLevelRepetitionLimit,
    });
    return {
      nodes: filteredGraph.nodes.length,
      links: filteredGraph.links.length,
    };
  }, [graph, hideLowLevelComponents, lowLevelRepetitionLimit, omitBySearch, search]);

  useEffect(() => {
    let isMounted = true;

    const loadJson = async (paths) => {
      const errors = [];
      for (const dataPath of paths) {
        try {
          const response = await fetch(dataPath);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const body = await response.text();
          return JSON.parse(body);
        } catch (nextError) {
          errors.push(`${dataPath}: ${String(nextError?.message ?? nextError)}`);
        }
      }
      throw new Error(errors.join('\n'));
    };

    const loadGraphData = async () => {
      try {
        const rawTree = await loadJson(graphDataPaths);
        let nodeMeta = {};
        try {
          nodeMeta = await loadJson(graphNodeMetaPaths);
        } catch {
          nodeMeta = {};
        }

        try {
          // served by the CLI (src/serve.ts); missing in dev mode
          const viewerConfig = await loadJson(['./viewer-config.json']);
          if (isMounted && viewerConfig.repetitionLimit > 0) {
            setLowLevelRepetitionLimit(viewerConfig.repetitionLimit);
          }
        } catch {
          // keep defaults
        }

        if (isMounted) {
          setGraph(normalizeGraph(rawTree, nodeMeta));
          setError('');
        }
      } catch (nextError) {
        if (isMounted) {
          setError(
            `Cannot load graph data. Run react-to-uml in this repo first so JSON files are generated in CWD.\n${String(nextError?.message ?? nextError)}`,
          );
        }
      }
    };

    loadGraphData();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        background:
          'radial-gradient(1300px 820px at 0% 0%, rgba(39,57,126,0.85) 0%, rgba(12,17,36,1) 50%, rgba(5,8,19,1) 100%)',
        color: '#d8e1ff',
        overflow: 'hidden',
        fontFamily:
          'Manrope, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderBottom: '1px solid rgba(142, 160, 211, 0.22)',
          background: 'linear-gradient(180deg, rgba(19,30,59,0.86), rgba(10,16,34,0.72))',
          boxShadow: '0 10px 36px rgba(2, 6, 18, 0.45)',
          backdropFilter: 'blur(8px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#8ea0d3',
          }}
        >
          react-to-uml graph viewer
        </div>
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder='Search node path...'
          style={{
            flex: '1 1 200px',
            minWidth: 160,
            maxWidth: 560,
            border: '1px solid rgba(142,160,211,0.35)',
            background: 'rgba(7,11,24,0.82)',
            color: '#d8e1ff',
            borderRadius: 8,
            padding: '8px 10px',
            outline: 'none',
            boxShadow: 'inset 0 0 0 1px rgba(112,130,190,0.12)',
          }}
        />
        <select
          value={layoutMode}
          onChange={(event) => setLayoutMode(event.target.value)}
          style={{
            border: '1px solid rgba(142,160,211,0.35)',
            background: 'rgba(7,11,24,0.82)',
            color: '#d8e1ff',
            borderRadius: 8,
            padding: '8px 10px',
            outline: 'none',
          }}
          title='Layout mode'
        >
          <option value='grouped'>Package groups</option>
          <option value='hierarchy'>Hierarchy (top-down)</option>
          <option value='force'>Force (free)</option>
        </select>
        <select
          value={hierarchyDirection}
          onChange={(event) => setHierarchyDirection(event.target.value)}
          disabled={layoutMode !== 'hierarchy'}
          style={{
            border: '1px solid rgba(142,160,211,0.35)',
            background: 'rgba(7,11,24,0.82)',
            color: '#d8e1ff',
            borderRadius: 8,
            padding: '8px 10px',
            outline: 'none',
            opacity: layoutMode === 'hierarchy' ? 1 : 0.55,
          }}
          title='Hierarchy direction'
        >
          <option value='TB'>Direction: Top to Bottom</option>
          <option value='LR'>Direction: Left to Right</option>
        </select>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8ea0d3' }}
        >
          <span>Spacing</span>
          <input
            type='range'
            min={1}
            max={2.4}
            step={0.1}
            value={spacingFactor}
            onChange={(event) => setSpacingFactor(Number(event.target.value))}
            title='Node spacing'
          />
        </label>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8ea0d3' }}
        >
          <input
            type='checkbox'
            checked={omitBySearch}
            onChange={(event) => setOmitBySearch(event.target.checked)}
          />
          Omit by search
        </label>
        <button
          type='button'
          onClick={() => setHideLowLevelComponents((prev) => !prev)}
          style={{
            border: '1px solid rgba(142,160,211,0.35)',
            background: hideLowLevelComponents ? 'rgba(46, 126, 255, 0.28)' : 'rgba(7,11,24,0.82)',
            color: '#d8e1ff',
            borderRadius: 8,
            padding: '8px 10px',
            cursor: 'pointer',
          }}
          title='Show only high-level hierarchy'
        >
          {hideLowLevelComponents ? 'Show all components' : 'Hide low-level components'}
        </button>
        {hideLowLevelComponents ? (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: '#8ea0d3',
            }}
          >
            <span>Max repeats</span>
            <input
              type='range'
              min={1}
              max={Math.max(12, lowLevelRepetitionLimit)}
              step={1}
              value={lowLevelRepetitionLimit}
              onChange={(event) => setLowLevelRepetitionLimit(Number(event.target.value))}
              title='Hide nodes imported more than this count'
            />
            <span style={{ minWidth: 16 }}>{lowLevelRepetitionLimit}</span>
          </label>
        ) : null}
        <div
          style={{
            marginLeft: 'auto',
            color: '#8ea0d3',
            fontSize: 12,
            padding: '4px 8px',
            borderRadius: 999,
            border: '1px solid rgba(142,160,211,0.28)',
            background: 'rgba(8,12,26,0.62)',
          }}
        >
          {isSearchDebouncing ? 'Updating... · ' : ''}
          {visibleStats.nodes}
          {visibleStats.nodes !== graph.nodes.length ? `/${graph.nodes.length}` : ''} nodes ·{' '}
          {visibleStats.links}
          {visibleStats.links !== graph.links.length ? `/${graph.links.length}` : ''} links
        </div>
      </div>

      {error ? (
        <div style={{ padding: 16, color: '#ff9ea5', fontFamily: 'monospace' }}>
          {error}
          <div style={{ marginTop: 8, color: '#8ea0d3' }}>
            Run gather/build first: <code>ENTRY=./src/main.tsx npx react-to-uml --serve</code>
          </div>
        </div>
      ) : (
        <GraphCanvas
          data={graph}
          search={search}
          layoutMode={layoutMode}
          hierarchyDirection={hierarchyDirection}
          spacingFactor={spacingFactor}
          omitBySearch={omitBySearch}
          hideLowLevelComponents={hideLowLevelComponents}
          lowLevelRepetitionLimit={lowLevelRepetitionLimit}
        />
      )}
    </div>
  );
};

createRoot(document.getElementById('content')).render(<App />);
