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
 * Update state with new day's information
 */
export function updateStateForNewDay(newState) {
  saveState(newState);
}
