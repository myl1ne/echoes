import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const CATEGORY_COLORS = {
  emotion:    '#e07070',  // warm red
  value:      '#7096e0',  // blue
  experience: '#70b870',  // green
  person:     '#a070d0',  // purple
  place:      '#50b8b8',  // teal
  idea:       '#d0a030',  // amber
  question:   '#d070a0',  // pink
};

const CATEGORY_ORDER = ['emotion', 'value', 'experience', 'person', 'place', 'idea', 'question'];

function categoryColor(category) {
  return CATEGORY_COLORS[category] || '#888';
}

function strengthLabel(activation) {
  if (activation >= 0.7) return 'strong';
  if (activation >= 0.4) return 'moderate';
  if (activation >= 0.15) return 'fading';
  return 'dim';
}

export default function MindMapViewer({ apiFetch }) {
  const [entities, setEntities] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [mindMap, setMindMap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 560 });

  // Load entity list on mount
  useEffect(() => {
    apiFetch('/api/cassandra/admin/mind-maps')
      .then(d => setEntities(d.entities || []))
      .catch(() => setEntities([]));
  }, [apiFetch]);

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.max(400, width), height: Math.max(300, height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const loadMindMap = useCallback(async (entityId) => {
    setLoading(true);
    setMindMap(null);
    setSelectedNode(null);
    setHoveredNode(null);
    try {
      const data = await apiFetch(`/api/cassandra/admin/mind-maps/${entityId}`);
      setMindMap(data.mindMap);
    } catch {
      setMindMap(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const handleSelect = (entityId) => {
    setSelectedId(entityId);
    loadMindMap(entityId);
  };

  // Transform mind map data into force-graph format
  const graphData = mindMap ? (() => {
    const nodes = Object.values(mindMap.nodes || {}).map(n => ({
      id: n.label,
      label: n.label,
      category: n.category || 'idea',
      activation: n.activation || 0,
      totalMentions: n.totalMentions || 0,
      lastActivated: n.lastActivated,
      val: Math.max(1, n.activation * 12),  // node size
    }));

    const nodeIds = new Set(nodes.map(n => n.id));
    const links = (mindMap.edges || [])
      .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map(e => ({
        source: e.from,
        target: e.to,
        type: e.type,
        weight: e.weight || 0.3,
      }));

    return { nodes, links };
  })() : { nodes: [], links: [] };

  const nodeCount = graphData.nodes.length;
  const edgeCount = graphData.links.length;

  // Category breakdown for legend
  const categoryCounts = {};
  for (const n of graphData.nodes) {
    categoryCounts[n.category] = (categoryCounts[n.category] || 0) + 1;
  }

  const displayNode = selectedNode || hoveredNode;

  return (
    <div className="mindmap-viewer">
      {/* Entity selector */}
      <div className="mindmap-toolbar">
        <select
          className="admin-select"
          value={selectedId || ''}
          onChange={e => handleSelect(e.target.value)}
          disabled={!entities}
        >
          <option value="">— select an entity —</option>
          {entities?.map(e => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>

        {mindMap && (
          <span className="mindmap-stats">
            {nodeCount} nodes · {edgeCount} edges
            {mindMap.lastUpdated && ` · updated ${mindMap.lastUpdated}`}
            {mindMap.lastCompressed && ` · compressed ${mindMap.lastCompressed}`}
          </span>
        )}
      </div>

      {loading && <div className="admin-loading" style={{ padding: '2rem' }}>Loading mind map…</div>}

      {!selectedId && !loading && (
        <div className="admin-muted" style={{ padding: '2rem' }}>
          Select an entity to view its concept graph.
        </div>
      )}

      {mindMap && nodeCount === 0 && (
        <div className="admin-muted" style={{ padding: '2rem' }}>
          No concepts yet — mind map will be built during the next heartbeat.
        </div>
      )}

      {mindMap && nodeCount > 0 && (
        <div className="mindmap-layout">
          {/* Graph */}
          <div className="mindmap-graph-wrap" ref={containerRef}>
            <ForceGraph2D
              graphData={graphData}
              width={dimensions.width}
              height={dimensions.height}
              backgroundColor="#0d0d0d"
              nodeLabel=""
              nodeColor={n => categoryColor(n.category)}
              nodeVal={n => n.val}
              nodeCanvasObjectMode={() => 'after'}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const label = node.label;
                const fontSize = Math.max(8, Math.min(13, 10 / Math.sqrt(nodeCount / 10)));
                ctx.font = `${fontSize}px sans-serif`;
                ctx.fillStyle = node.activation >= 0.3 ? '#fff' : 'rgba(255,255,255,0.45)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, node.x, node.y + Math.sqrt(node.val) * 2 + fontSize * 0.7);
              }}
              linkWidth={l => Math.max(0.5, l.weight * 2.5)}
              linkColor={l => {
                const colors = {
                  'co-occurs': 'rgba(150,150,150,0.35)',
                  'deepens':   'rgba(100,160,255,0.45)',
                  'causes':    'rgba(255,160,80,0.45)',
                  'contrasts': 'rgba(220,80,120,0.45)',
                };
                return colors[l.type] || 'rgba(150,150,150,0.3)';
              }}
              linkDirectionalArrowLength={l => l.type !== 'co-occurs' ? 4 : 0}
              linkDirectionalArrowRelPos={0.85}
              onNodeHover={node => setHoveredNode(node || null)}
              onNodeClick={node => setSelectedNode(n => n?.id === node?.id ? null : node)}
              cooldownTicks={120}
            />
          </div>

          {/* Sidebar: legend + node detail */}
          <div className="mindmap-sidebar">
            {/* Legend */}
            <div className="mindmap-legend">
              <div className="mindmap-legend-title">Categories</div>
              {CATEGORY_ORDER.filter(c => categoryCounts[c]).map(cat => (
                <div key={cat} className="mindmap-legend-item">
                  <span className="mindmap-legend-dot" style={{ background: categoryColor(cat) }} />
                  <span className="mindmap-legend-label">{cat}</span>
                  <span className="mindmap-legend-count">{categoryCounts[cat]}</span>
                </div>
              ))}
              <div className="mindmap-legend-title" style={{ marginTop: '1rem' }}>Edge types</div>
              {[
                { type: 'co-occurs', color: 'rgba(150,150,150,0.7)', label: 'co-occurs' },
                { type: 'deepens',   color: 'rgba(100,160,255,0.8)', label: 'deepens' },
                { type: 'causes',    color: 'rgba(255,160,80,0.8)',  label: 'causes' },
                { type: 'contrasts', color: 'rgba(220,80,120,0.8)',  label: 'contrasts' },
              ].map(({ type, color, label }) => (
                <div key={type} className="mindmap-legend-item">
                  <span className="mindmap-legend-dash" style={{ background: color }} />
                  <span className="mindmap-legend-label">{label}</span>
                </div>
              ))}
            </div>

            {/* Node detail panel */}
            {displayNode && (
              <div className="mindmap-node-detail">
                <div className="mindmap-node-label">{displayNode.label}</div>
                <div className="mindmap-node-category" style={{ color: categoryColor(displayNode.category) }}>
                  {displayNode.category}
                </div>
                <div className="mindmap-node-row">
                  <span>Activation</span>
                  <span>{(displayNode.activation * 100).toFixed(1)}% · {strengthLabel(displayNode.activation)}</span>
                </div>
                <div className="mindmap-node-bar">
                  <div
                    className="mindmap-node-bar-fill"
                    style={{
                      width: `${displayNode.activation * 100}%`,
                      background: categoryColor(displayNode.category)
                    }}
                  />
                </div>
                <div className="mindmap-node-row">
                  <span>Mentions</span>
                  <span>{displayNode.totalMentions}</span>
                </div>
                {displayNode.lastActivated && (
                  <div className="mindmap-node-row">
                    <span>Last active</span>
                    <span>{displayNode.lastActivated}</span>
                  </div>
                )}
                {/* Connected nodes */}
                {(() => {
                  const connected = graphData.links
                    .filter(l => l.source?.id === displayNode.id || l.target?.id === displayNode.id)
                    .map(l => ({
                      label: l.source?.id === displayNode.id ? l.target?.label || l.target : l.source?.label || l.source,
                      type: l.type,
                      weight: l.weight,
                      dir: l.source?.id === displayNode.id ? '→' : '←',
                    }))
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 6);
                  if (connected.length === 0) return null;
                  return (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div className="mindmap-node-row-label">Connections</div>
                      {connected.map((c, i) => (
                        <div key={i} className="mindmap-node-connection">
                          <span className="mindmap-connection-type">{c.type}</span>
                          <span className="mindmap-connection-dir">{c.dir}</span>
                          <span className="mindmap-connection-target">{c.label}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {!displayNode && (
              <div className="admin-muted" style={{ fontSize: '0.78rem', marginTop: '1rem' }}>
                Click or hover a node to inspect it.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
