/**
 * Visitor profile management for Cassandra
 * Each visitor gets a persistent profile that Cassandra uses to remember them
 */

import { storage } from '../storage/index.js';

// UUID v4 format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate visitor ID format (UUID)
 */
export function validateVisitorId(visitorId) {
  if (!visitorId || typeof visitorId !== 'string') {
    throw new Error('Visitor ID required');
  }
  if (!UUID_REGEX.test(visitorId)) {
    throw new Error(`Invalid visitor ID format: ${visitorId}`);
  }
  return visitorId;
}

/**
 * Create a default profile for a new visitor
 */
function createDefaultProfile(visitorId) {
  const now = new Date().toISOString();
  return {
    visitorId,
    name: null,
    firstSeen: now,
    lastSeen: now,
    conversationCount: 0,
    relationshipSummary: null,
    recentThemes: [],
    knownFacts: [],
    tone: null
  };
}

/**
 * Load visitor profile (creates default if not found)
 */
export async function loadVisitorProfile(visitorId) {
  validateVisitorId(visitorId);
  const profile = await storage.getVisitor(visitorId);
  return profile || createDefaultProfile(visitorId);
}

/**
 * Save visitor profile
 */
export async function saveVisitorProfile(visitorId, profile) {
  validateVisitorId(visitorId);
  await storage.setVisitor(visitorId, profile);
}

/**
 * Update last seen timestamp and increment conversation count
 */
export async function updateVisitorLastSeen(visitorId) {
  const profile = await loadVisitorProfile(visitorId);
  profile.lastSeen = new Date().toISOString();
  profile.conversationCount = (profile.conversationCount || 0) + 1;
  await saveVisitorProfile(visitorId, profile);
  return profile;
}

/**
 * Set visitor name
 */
export async function setVisitorName(visitorId, name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Name must be a non-empty string');
  }
  const trimmed = name.trim().substring(0, 100);
  const profile = await loadVisitorProfile(visitorId);
  profile.name = trimmed;
  await saveVisitorProfile(visitorId, profile);
  return profile;
}

/**
 * Update visitor profile with summary data from Cassandra's reflection
 */
export async function updateVisitorFromSummary(visitorId, summaryData) {
  const profile = await loadVisitorProfile(visitorId);

  if (summaryData.relationshipSummary) {
    profile.relationshipSummary = summaryData.relationshipSummary;
  }
  if (summaryData.recentThemes) {
    profile.recentThemes = summaryData.recentThemes;
  }
  if (summaryData.knownFacts) {
    const existingFacts = new Set(profile.knownFacts || []);
    for (const fact of summaryData.knownFacts) {
      existingFacts.add(fact);
    }
    profile.knownFacts = Array.from(existingFacts);
  }
  if (summaryData.tone) {
    profile.tone = summaryData.tone;
  }
  if (summaryData.name && !profile.name) {
    profile.name = summaryData.name;
  }

  await saveVisitorProfile(visitorId, profile);
  return profile;
}

/**
 * List all visitor IDs
 */
export async function listVisitors() {
  return storage.listVisitorIds();
}
