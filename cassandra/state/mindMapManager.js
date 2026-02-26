/**
 * Per-visitor concept graph — the digital twin.
 *
 * Each visitor (and Cassandra and Thread themselves) has a living concept graph:
 *   nodes: concepts with activation levels that decay and reinforce over time
 *   edges: associations between concepts with weighted relationships
 *
 * Built nightly in the heartbeat from conversation messages.
 * Visitor mind maps extract from user turns (what the visitor brings).
 * Agent mind maps (Cassandra, Thread) extract from assistant/journal turns.
 *
 * Special IDs:
 *   'cassandra-self'  — Cassandra's own mind map (built from her assistant turns)
 *   'thread-self'     — Thread's mind map (built from journal entries)
 */

import { storage } from '../storage/index.js';

export const CASSANDRA_SELF_ID = 'cassandra-self';
export const THREAD_SELF_ID = 'thread-self';

const DECAY_FACTOR = 0.85;
const ACTIVATION_FLOOR = 0.001;  // Never deleted — just dims to a memory
const MIN_EDGE_WEIGHT = 0.05;
const REINFORCEMENT_BASE = 0.3;
const NODE_CAP = 60;              // New low-salience nodes not added when above this
const COMPRESS_THRESHOLD = 40;   // Trigger compression candidate check
const COMPRESS_INTERVAL_DAYS = 7; // At most once per week

function emptyMindMap(entityId) {
  return {
    entityId,
    lastUpdated: null,
    lastCompressed: null,
    nodes: {},
    edges: [],
  };
}

export async function loadMindMap(entityId) {
  const data = await storage.getMindMap(entityId);
  return data || emptyMindMap(entityId);
}

export async function saveMindMap(entityId, mindMap) {
  await storage.setMindMap(entityId, mindMap);
}

/**
 * Apply daily activation decay to all nodes and edges.
 * Nodes decay to a floor — they are never deleted (they persist as dim memories).
 * Edges below minimum weight are pruned (edges are cheaper to rebuild than nodes).
 */
export function applyDecay(mindMap, factor = DECAY_FACTOR) {
  const nodes = mindMap.nodes || {};
  for (const id of Object.keys(nodes)) {
    nodes[id].activation = Math.max(ACTIVATION_FLOOR, nodes[id].activation * factor);
  }

  mindMap.edges = (mindMap.edges || [])
    .map(e => ({ ...e, weight: e.weight * factor }))
    .filter(e => e.weight >= MIN_EDGE_WEIGHT);

  return mindMap;
}

/**
 * Merge extracted concepts and associations into the existing mind map.
 * - New concepts: add with initial activation (respects node cap for low-salience)
 * - Existing concepts: reinforce activation based on salience
 * - New edges: add with initial weight
 * - Existing edges: reinforce weight
 */
export function mergeExtractions(mindMap, extractions, date) {
  const { concepts = [], associations = [] } = extractions;
  const nodes = mindMap.nodes || {};
  const edges = mindMap.edges || [];
  const nodeCount = Object.keys(nodes).length;

  for (const concept of concepts) {
    const label = (concept.label || '').toLowerCase().trim();
    if (!label) continue;
    const salience = Math.max(0, Math.min(1, concept.salience || 0.5));

    if (nodes[label]) {
      // Reinforce existing node — always allowed regardless of cap
      nodes[label].activation = Math.min(1.0, nodes[label].activation + salience * REINFORCEMENT_BASE);
      nodes[label].totalMentions = (nodes[label].totalMentions || 0) + 1;
      nodes[label].lastActivated = date;
    } else if (nodeCount < NODE_CAP || salience >= 0.7) {
      // Add new node only if under cap, or concept is highly salient
      nodes[label] = {
        label,
        category: concept.category || 'idea',
        activation: salience * REINFORCEMENT_BASE,
        lastActivated: date,
        totalMentions: 1,
      };
    }
  }

  for (const assoc of associations) {
    const from = (assoc.from || '').toLowerCase().trim();
    const to = (assoc.to || '').toLowerCase().trim();
    const type = assoc.type || 'co-occurs';
    if (!from || !to || !nodes[from] || !nodes[to]) continue;

    const existing = edges.find(e => e.from === from && e.to === to && e.type === type);
    if (existing) {
      existing.weight = Math.min(1.0, existing.weight + 0.15);
    } else {
      edges.push({ from, to, type, weight: 0.3 });
    }
  }

  mindMap.nodes = nodes;
  mindMap.edges = edges;
  mindMap.lastUpdated = date;

  return mindMap;
}

/**
 * Merge semantic near-duplicates identified by Claude.
 * Each group is [label_to_keep, ...labels_to_merge_in].
 * Transfers activation + mentions, redirects edges, deduplicates.
 */
export function compressMindMap(mindMap, mergeGroups) {
  const nodes = mindMap.nodes || {};
  const edges = mindMap.edges || [];

  for (const group of mergeGroups) {
    if (!group || group.length < 2) continue;
    const [keepLabel, ...mergeLabels] = group.map(l => (l || '').toLowerCase().trim());
    if (!keepLabel || !nodes[keepLabel]) continue;

    for (const mergeLabel of mergeLabels) {
      if (!mergeLabel || !nodes[mergeLabel] || mergeLabel === keepLabel) continue;

      // Transfer activation and mention count to the surviving node
      nodes[keepLabel].activation = Math.min(1.0,
        nodes[keepLabel].activation + nodes[mergeLabel].activation
      );
      nodes[keepLabel].totalMentions =
        (nodes[keepLabel].totalMentions || 0) + (nodes[mergeLabel].totalMentions || 0);

      // Redirect all edges referencing the merged-away node
      for (const edge of edges) {
        if (edge.from === mergeLabel) edge.from = keepLabel;
        if (edge.to === mergeLabel) edge.to = keepLabel;
      }

      delete nodes[mergeLabel];
    }
  }

  // Deduplicate edges: same (from, to, type) → keep higher weight; drop self-loops
  const edgeMap = new Map();
  for (const edge of edges) {
    if (edge.from === edge.to) continue;
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    const existing = edgeMap.get(key);
    if (!existing || edge.weight > existing.weight) {
      edgeMap.set(key, edge);
    }
  }

  mindMap.nodes = nodes;
  mindMap.edges = Array.from(edgeMap.values());
  mindMap.lastCompressed = new Date().toISOString().split('T')[0];

  return mindMap;
}

/**
 * Return true if this mind map should be compressed.
 * Triggers when node count is above threshold and it hasn't been compressed recently.
 */
export function needsCompression(mindMap) {
  const nodeCount = Object.keys(mindMap?.nodes || {}).length;
  if (nodeCount < COMPRESS_THRESHOLD) return false;

  const lastCompressed = mindMap.lastCompressed;
  if (!lastCompressed) return true;

  const daysSince = (Date.now() - new Date(lastCompressed).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= COMPRESS_INTERVAL_DAYS;
}

/**
 * Return nodes sorted by activation, above threshold, up to maxNodes.
 */
export function getHotNodes(mindMap, threshold = 0.3, maxNodes = 8) {
  const nodes = mindMap?.nodes || {};
  return Object.values(nodes)
    .filter(n => n.activation >= threshold)
    .sort((a, b) => b.activation - a.activation)
    .slice(0, maxNodes);
}
