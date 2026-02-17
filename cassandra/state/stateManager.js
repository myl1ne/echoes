/**
 * State management for Cassandra's daily conversations
 * Handles lifetime summaries, recent summaries, goals, and aspirations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { INITIAL_STATE } from '../prompts/systemPrompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_DIR = path.join(__dirname, '..');
const STATE_FILE = path.join(STATE_DIR, 'state', 'current.json');
const SUMMARIES_FILE = path.join(STATE_DIR, 'state', 'summaries.json');

/**
 * Ensure state directory exists
 */
function ensureStateDirectory() {
  const stateDir = path.dirname(STATE_FILE);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
}

/**
 * Get current date as YYYY-MM-DD
 */
function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Load current state
 */
export function loadState() {
  ensureStateDirectory();
  
  if (!fs.existsSync(STATE_FILE)) {
    return {
      ...INITIAL_STATE,
      lastUpdated: getToday()
    };
  }
  
  try {
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading state:', error);
    return {
      ...INITIAL_STATE,
      lastUpdated: getToday()
    };
  }
}

/**
 * Save current state
 */
export function saveState(state) {
  ensureStateDirectory();
  
  const stateToSave = {
    ...state,
    lastUpdated: getToday()
  };
  
  fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
}

/**
 * Load conversation summaries history
 */
export function loadSummaries() {
  ensureStateDirectory();
  
  if (!fs.existsSync(SUMMARIES_FILE)) {
    return [];
  }
  
  try {
    const data = fs.readFileSync(SUMMARIES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading summaries:', error);
    return [];
  }
}

/**
 * Save a day's summary
 */
export function saveDaySummary(date, summary) {
  ensureStateDirectory();
  
  const summaries = loadSummaries();
  
  // Add or update summary for this date
  const existingIndex = summaries.findIndex(s => s.date === date);
  if (existingIndex >= 0) {
    summaries[existingIndex] = { date, summary };
  } else {
    summaries.push({ date, summary });
  }
  
  // Sort by date descending
  summaries.sort((a, b) => b.date.localeCompare(a.date));
  
  fs.writeFileSync(SUMMARIES_FILE, JSON.stringify(summaries, null, 2));
}

/**
 * Get recent summaries (last N days)
 */
export function getRecentSummaries(days = 3) {
  const summaries = loadSummaries();
  return summaries.slice(0, days);
}

/**
 * Check if a summary exists for a given date
 */
export function hasSummary(date) {
  const summaries = loadSummaries();
  return summaries.some(s => s.date === date);
}

/**
 * Get missing summary info: { visitorId, date } pairs that need summaries.
 * Scans all visitor conversation directories.
 * Returns the first missing entry, or null if all are summarized.
 */
export function getMissingSummaryDate() {
  const today = getToday();
  const summaries = loadSummaries();
  const summaryDates = new Set(summaries.map(s => s.date));

  const conversationsDir = path.join(__dirname, '..', 'conversations');
  if (!fs.existsSync(conversationsDir)) {
    return null;
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Scan visitor directories
  const entries = fs.readdirSync(conversationsDir);
  const dates = new Set();

  for (const entry of entries) {
    const fullPath = path.join(conversationsDir, entry);

    if (UUID_REGEX.test(entry) && fs.statSync(fullPath).isDirectory()) {
      // Visitor directory — scan for conversation files
      const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.json'));
      for (const f of files) {
        const parts = f.replace('.json', '').split('-');
        if (parts.length >= 3) {
          dates.add(`${parts[0]}-${parts[1]}-${parts[2]}`);
        }
      }
    } else if (entry.endsWith('.json') && entry !== '.gitkeep') {
      // Legacy root-level conversation file
      const parts = entry.replace('.json', '').split('-');
      if (parts.length >= 3) {
        dates.add(`${parts[0]}-${parts[1]}-${parts[2]}`);
      }
    }
  }

  const uniqueDates = Array.from(dates).sort().reverse();

  for (const date of uniqueDates) {
    if (date !== today && !summaryDates.has(date)) {
      return date;
    }
  }

  return null;
}

/**
 * Update state with new day's information
 */
export function updateStateForNewDay(newState) {
  saveState(newState);
}
