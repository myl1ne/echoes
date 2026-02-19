/**
 * Local filesystem storage provider.
 * Wraps the existing JSON file structure — no changes to the on-disk layout.
 * Used for local development (STORAGE_BACKEND=local or unset).
 *
 * All methods return Promises (async) so the interface is identical to firestoreProvider.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base paths (relative to cassandra/storage/)
const STATE_DIR      = path.join(__dirname, '..', 'state');
const CONV_DIR       = path.join(__dirname, '..', 'conversations');
const STATE_FILE     = path.join(STATE_DIR, 'current.json');
const SUMMARIES_FILE = path.join(STATE_DIR, 'summaries.json');
const VISITORS_DIR   = path.join(STATE_DIR, 'visitors');
const REFLECTIONS_DIR = path.join(STATE_DIR, 'reflections');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── Global state ────────────────────────────────────────────────────────────

export async function getGlobalState() {
  ensureDir(STATE_DIR);
  return readJSON(STATE_FILE);
}

export async function setGlobalState(state) {
  ensureDir(STATE_DIR);
  writeJSON(STATE_FILE, state);
}

// ─── Summaries ───────────────────────────────────────────────────────────────

export async function getSummaries() {
  ensureDir(STATE_DIR);
  return readJSON(SUMMARIES_FILE) || [];
}

export async function saveSummary(date, summary) {
  ensureDir(STATE_DIR);
  const summaries = readJSON(SUMMARIES_FILE) || [];
  const idx = summaries.findIndex(s => s.date === date);
  if (idx >= 0) {
    summaries[idx] = { date, summary };
  } else {
    summaries.push({ date, summary });
  }
  summaries.sort((a, b) => b.date.localeCompare(a.date));
  writeJSON(SUMMARIES_FILE, summaries);
}

// ─── Visitors ─────────────────────────────────────────────────────────────────

export async function getVisitor(visitorId) {
  ensureDir(VISITORS_DIR);
  return readJSON(path.join(VISITORS_DIR, `${visitorId}.json`));
}

export async function setVisitor(visitorId, profile) {
  ensureDir(VISITORS_DIR);
  writeJSON(path.join(VISITORS_DIR, `${visitorId}.json`), profile);
}

export async function listVisitorIds() {
  ensureDir(VISITORS_DIR);
  return fs.readdirSync(VISITORS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .filter(id => UUID_REGEX.test(id));
}

// ─── Conversations ────────────────────────────────────────────────────────────

function visitorConvDir(visitorId) {
  return path.join(CONV_DIR, visitorId);
}

export async function getConversation(visitorId, conversationId) {
  const filePath = path.join(visitorConvDir(visitorId), `${conversationId}.json`);
  return readJSON(filePath);
}

export async function saveConversation(visitorId, conversationId, data) {
  const dir = visitorConvDir(visitorId);
  ensureDir(dir);
  writeJSON(path.join(dir, `${conversationId}.json`), data);
}

export async function listConversationIds(visitorId, date = null) {
  const dir = visitorConvDir(visitorId);
  ensureDir(dir);
  const files = fs.readdirSync(dir);
  return files
    .filter(f => f.endsWith('.json') && (!date || f.startsWith(date)))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
}

export async function listAllConversationDates() {
  ensureDir(CONV_DIR);
  const dates = new Set();

  for (const entry of fs.readdirSync(CONV_DIR)) {
    const fullPath = path.join(CONV_DIR, entry);
    if (UUID_REGEX.test(entry) && fs.statSync(fullPath).isDirectory()) {
      for (const f of fs.readdirSync(fullPath).filter(f => f.endsWith('.json'))) {
        const parts = f.replace('.json', '').split('-');
        if (parts.length >= 3) dates.add(`${parts[0]}-${parts[1]}-${parts[2]}`);
      }
    }
  }

  return Array.from(dates).sort().reverse();
}

export async function listVisitorIdsWithConversations() {
  ensureDir(CONV_DIR);
  return fs.readdirSync(CONV_DIR)
    .filter(entry => {
      if (!UUID_REGEX.test(entry)) return false;
      return fs.statSync(path.join(CONV_DIR, entry)).isDirectory();
    });
}

// ─── Reflections ──────────────────────────────────────────────────────────────

export async function saveReflection(timestamp, content, date) {
  ensureDir(REFLECTIONS_DIR);
  const filepath = path.join(REFLECTIONS_DIR, `${timestamp}.md`);
  fs.writeFileSync(filepath,
    `# Cassandra Reflects\n\n**Generated:** ${new Date().toISOString()}\n**Date:** ${date}\n\n---\n\n${content}\n`
  );
}

export async function listReflections() {
  ensureDir(REFLECTIONS_DIR);
  return fs.readdirSync(REFLECTIONS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .map(f => {
      const content = fs.readFileSync(path.join(REFLECTIONS_DIR, f), 'utf-8');
      return { filename: f, preview: content.substring(0, 300) };
    });
}

export const localProvider = {
  getGlobalState,
  setGlobalState,
  getSummaries,
  saveSummary,
  getVisitor,
  setVisitor,
  listVisitorIds,
  getConversation,
  saveConversation,
  listConversationIds,
  listAllConversationDates,
  listVisitorIdsWithConversations,
  saveReflection,
  listReflections,
};
