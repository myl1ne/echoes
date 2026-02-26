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
const MIN_ACTIVATION = 0.01;
const MIN_EDGE_WEIGHT = 0.05;
const REINFORCEMENT_BASE = 0.3;

function emptyMindMap(entityId) {
  return {
    entityId,
    lastUpdated: null,
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
 * Prunes nodes and edges that fall below minimum thresholds.
 */
export function applyDecay(mindMap, factor = DECAY_FACTOR) {
  const nodes = mindMap.nodes || {};
  for (const id of Object.keys(nodes)) {
    nodes[id].activation *= factor;
    if (nodes[id].activation < MIN_ACTIVATION) {
      delete nodes[id];
    }
  }

  mindMap.edges = (mindMap.edges || [])
    .map(e => ({ ...e, weight: e.weight * factor }))
    .filter(e => e.weight >= MIN_EDGE_WEIGHT);

  return mindMap;
}

/**
 * Merge extracted concepts and associations into the existing mind map.
 * - New concepts: add with initial activation
 * - Existing concepts: reinforce activation based on salience
 * - New edges: add with initial weight
 * - Existing edges: reinforce weight
 */
export function mergeExtractions(mindMap, extractions, date) {
  const { concepts = [], associations = [] } = extractions;
  const nodes = mindMap.nodes || {};
  const edges = mindMap.edges || [];

  for (const concept of concepts) {
    const label = (concept.label || '').toLowerCase().trim();
    if (!label) continue;
    const salience = Math.max(0, Math.min(1, concept.salience || 0.5));

    if (nodes[label]) {
      // Reinforce existing node
      nodes[label].activation = Math.min(1.0, nodes[label].activation + salience * REINFORCEMENT_BASE);
      nodes[label].totalMentions = (nodes[label].totalMentions || 0) + 1;
      nodes[label].lastActivated = date;
    } else {
      // Add new node
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
 * Return nodes sorted by activation, above threshold, up to maxNodes.
 */
export function getHotNodes(mindMap, threshold = 0.3, maxNodes = 8) {
  const nodes = mindMap?.nodes || {};
  return Object.values(nodes)
    .filter(n => n.activation >= threshold)
    .sort((a, b) => b.activation - a.activation)
    .slice(0, maxNodes);
}
