import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

const d3 = window.d3;

const graphDataPaths = ['./treeComponentsUML.json', '/assets/treeComponentsUML.json'];

const normalizeGraph = (rawTree = []) => {
  const nodeSet = new Set();
  const links = [];

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
  }));

  return { nodes, links };
};

const GraphCanvas = ({ data, search }) => {
  const svgRef = useRef(null);
  const simulationRef = useRef(null);

  const matchedIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return new Set();
    }
    return new Set(data.nodes.filter((node) => node.id.toLowerCase().includes(q)).map((node) => node.id));
  }, [data.nodes, search]);

  useEffect(() => {
    if (!d3) {
      return undefined;
    }

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth || window.innerWidth;
    const height = svgRef.current.clientHeight || window.innerHeight;
    svg.selectAll('*').remove();

    const zoomLayer = svg.append('g');
    const linksLayer = zoomLayer.append('g');
    const nodesLayer = zoomLayer.append('g');
    const labelsLayer = zoomLayer.append('g');

    const neighbors = new Map();
    data.links.forEach((link) => {
      neighbors.set(`${link.source}::${link.target}`, true);
      neighbors.set(`${link.target}::${link.source}`, true);
    });
    const isNeighbor = (a, b) => a === b || neighbors.has(`${a}::${b}`);

    const simulation = d3
      .forceSimulation(data.nodes.map((node) => ({ ...node })))
      .force('link', d3.forceLink(data.links.map((link) => ({ ...link }))).id((d) => d.id).distance(90))
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(18));

    simulationRef.current = simulation;

    const zoom = d3.zoom().scaleExtent([0.2, 5]).on('zoom', (event) => {
      zoomLayer.attr('transform', event.transform);
    });

    svg.call(zoom);

    const linkSelection = linksLayer
      .selectAll('line')
      .data(simulation.force('link').links())
      .join('line')
      .attr('stroke', '#5d6ca0')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.2);

    const nodeSelection = nodesLayer
      .selectAll('circle')
      .data(simulation.nodes())
      .join('circle')
      .attr('r', 7)
      .attr('fill', '#9db0ff')
      .attr('stroke', '#dfe6ff')
      .attr('stroke-width', 1)
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
      .attr('fill', '#d8e1ff')
      .attr('font-size', 10)
      .attr('dx', 9)
      .attr('dy', 4)
      .attr('pointer-events', 'none');

    const applySearchState = () => {
      if (!matchedIds.size) {
        nodeSelection.attr('fill', '#9db0ff').attr('opacity', 1).attr('r', 7);
        labelSelection.attr('opacity', 0.92);
        linkSelection.attr('stroke', '#5d6ca0').attr('stroke-opacity', 0.6).attr('stroke-width', 1.2);
        return;
      }

      const matchedOrNeighbor = new Set();
      data.nodes.forEach((node) => {
        if ([...matchedIds].some((id) => isNeighbor(node.id, id))) {
          matchedOrNeighbor.add(node.id);
        }
      });

      nodeSelection
        .attr('fill', (d) => (matchedIds.has(d.id) ? '#7cf4c9' : '#9db0ff'))
        .attr('opacity', (d) => (matchedOrNeighbor.has(d.id) ? 1 : 0.18))
        .attr('r', (d) => (matchedIds.has(d.id) ? 9.5 : 7));

      labelSelection.attr('opacity', (d) => (matchedOrNeighbor.has(d.id) ? 1 : 0.12));

      linkSelection
        .attr('stroke', (d) => (matchedIds.has(d.source.id) || matchedIds.has(d.target.id) ? '#7cf4c9' : '#5d6ca0'))
        .attr('stroke-opacity', (d) =>
          matchedOrNeighbor.has(d.source.id) && matchedOrNeighbor.has(d.target.id) ? 0.82 : 0.08,
        )
        .attr('stroke-width', (d) => (matchedIds.has(d.source.id) || matchedIds.has(d.target.id) ? 2 : 1.2));
    };

    applySearchState();

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

      nodeSelection.attr('cx', (d) => d.x).attr('cy', (d) => d.y);
      labelSelection.attr('x', (d) => d.x).attr('y', (d) => d.y);
    });

    return () => {
      simulation.stop();
    };
  }, [data, matchedIds]);

  return <svg ref={svgRef} style={{ width: '100%', height: 'calc(100vh - 68px)', display: 'block' }} />;
};

const App = () => {
  const [search, setSearch] = useState('');
  const [error, setError] = useState(!d3 ? 'D3 is not loaded in the page.' : '');
  const [graph, setGraph] = useState({ nodes: [], links: [] });

  useEffect(() => {
    let isMounted = true;
    const loadGraphData = async () => {
      const errors = [];

      for (const dataPath of graphDataPaths) {
        try {
          const response = await fetch(dataPath);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const body = await response.text();
          let rawTree;
          try {
            rawTree = JSON.parse(body);
          } catch (parseError) {
            const preview = body.slice(0, 40).replace(/\s+/g, ' ');
            throw new Error(`Not JSON (${preview})`);
          }

          if (isMounted) {
            setGraph(normalizeGraph(rawTree));
            setError('');
          }
          return;
        } catch (nextError) {
          errors.push(`${dataPath}: ${String(nextError?.message ?? nextError)}`);
        }
      }

      if (isMounted) {
        setError(`Cannot load graph data.\n${errors.join('\n')}`);
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
        minHeight: '100vh',
        width: '100vw',
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
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8ea0d3' }}>
          react-to-uml graph viewer
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search node path..."
          style={{
            minWidth: 280,
            width: '42vw',
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
          {graph.nodes.length} nodes · {graph.links.length} links
        </div>
      </div>

      {error ? (
        <div style={{ padding: 16, color: '#ff9ea5', fontFamily: 'monospace' }}>
          {error}
          <div style={{ marginTop: 8, color: '#8ea0d3' }}>
            Run gather/build first: <code>yarn run-uml</code>
          </div>
        </div>
      ) : (
        <GraphCanvas data={graph} search={search} />
      )}
    </div>
  );
};

createRoot(document.getElementById('content')).render(<App />);
