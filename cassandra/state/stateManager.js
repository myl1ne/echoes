/**
 * State management for Cassandra's daily conversations
 * Handles lifetime summaries, recent summaries, goals, and aspirations
 */

import { storage } from '../storage/index.js';
import { INITIAL_STATE } from '../prompts/systemPrompt.js';

function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Load current global state
 */
export async function loadState() {
  const state = await storage.getGlobalState();
  if (!state) {
    return { ...INITIAL_STATE, lastUpdated: getToday() };
  }
  return state;
}

/**
 * Save current global state
 */
export async function saveState(state) {
  await storage.setGlobalState({ ...state, lastUpdated: getToday() });
}

/**
 * Load all conversation summaries
 */
export async function loadSummaries() {
  return storage.getSummaries();
}

/**
 * Save a day's summary
 */
export async function saveDaySummary(date, summary) {
  await storage.saveSummary(date, summary);
}

/**
 * Get recent summaries (last N days)
 */
export async function getRecentSummaries(days = 3) {
  const summaries = await storage.getSummaries();
  return summaries.slice(0, days);
}

/**
 * Check if a summary exists for a given date
 */
export async function hasSummary(date) {
  const summaries = await storage.getSummaries();
  return summaries.some(s => s.date === date);
}

/**
 * Return the oldest date that has conversations but no summary yet.
 * Returns null if everything is up to date.
 */
export async function getMissingSummaryDate() {
  const today = getToday();
  const summaries = await storage.getSummaries();
  const summaryDates = new Set(summaries.map(s => s.date));

  const allDates = await storage.listAllConversationDates();

  for (const date of allDates) {
    if (date !== today && !summaryDates.has(date)) {
      return date;
    }
  }
  return null;
}

/**
 * Update state with new day's information
 */
export async function updateStateForNewDay(newState) {
  await saveState(newState);
}
