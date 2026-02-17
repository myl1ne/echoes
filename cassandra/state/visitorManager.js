/**
 * Visitor profile management for Cassandra
 * Each visitor gets a persistent profile that Cassandra uses to remember them
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VISITORS_DIR = path.join(__dirname, 'visitors');

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
 * Ensure visitors directory exists
 */
function ensureVisitorsDirectory() {
  if (!fs.existsSync(VISITORS_DIR)) {
    fs.mkdirSync(VISITORS_DIR, { recursive: true });
  }
}

/**
 * Get visitor profile file path
 */
function getVisitorPath(visitorId) {
  validateVisitorId(visitorId);
  return path.join(VISITORS_DIR, `${visitorId}.json`);
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
export function loadVisitorProfile(visitorId) {
  ensureVisitorsDirectory();
  const filePath = getVisitorPath(visitorId);

  if (!fs.existsSync(filePath)) {
    return createDefaultProfile(visitorId);
  }

  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading visitor profile ${visitorId}:`, error);
    return createDefaultProfile(visitorId);
  }
}

/**
 * Save visitor profile
 */
export function saveVisitorProfile(visitorId, profile) {
  ensureVisitorsDirectory();
  const filePath = getVisitorPath(visitorId);
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
}

/**
 * Update last seen timestamp and increment conversation count
 */
export function updateVisitorLastSeen(visitorId) {
  const profile = loadVisitorProfile(visitorId);
  profile.lastSeen = new Date().toISOString();
  profile.conversationCount = (profile.conversationCount || 0) + 1;
  saveVisitorProfile(visitorId, profile);
  return profile;
}

/**
 * Set visitor name
 */
export function setVisitorName(visitorId, name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Name must be a non-empty string');
  }
  const trimmed = name.trim().substring(0, 100);
  const profile = loadVisitorProfile(visitorId);
  profile.name = trimmed;
  saveVisitorProfile(visitorId, profile);
  return profile;
}

/**
 * Update visitor profile with summary data from Cassandra's reflection
 */
export function updateVisitorFromSummary(visitorId, summaryData) {
  const profile = loadVisitorProfile(visitorId);

  if (summaryData.relationshipSummary) {
    profile.relationshipSummary = summaryData.relationshipSummary;
  }
  if (summaryData.recentThemes) {
    profile.recentThemes = summaryData.recentThemes;
  }
  if (summaryData.knownFacts) {
    // Merge new facts with existing, deduplicate
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

  saveVisitorProfile(visitorId, profile);
  return profile;
}

/**
 * List all visitor IDs
 */
export function listVisitors() {
  ensureVisitorsDirectory();
  return fs.readdirSync(VISITORS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .filter(id => UUID_REGEX.test(id));
}
