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

// ─── Cassandra Notes (persistent memory beyond daily summaries) ───────────────

const NOTES_FILE = path.join(STATE_DIR, 'notes.json');

export async function saveNote(key, content) {
  ensureDir(STATE_DIR);
  const notes = readJSON(NOTES_FILE) || {};
  notes[key] = { content, updatedAt: new Date().toISOString() };
  writeJSON(NOTES_FILE, notes);
}

export async function listNotes() {
  ensureDir(STATE_DIR);
  return readJSON(NOTES_FILE) || {};
}

// ─── Thread Journal ────────────────────────────────────────────────────────────

const THREAD_JOURNAL_DIR = path.join(STATE_DIR, 'thread-journal');
const THREAD_DRAFTS_DIR = path.join(STATE_DIR, 'thread-drafts');

export async function saveThreadJournalEntry(timestamp, content, date) {
  ensureDir(THREAD_JOURNAL_DIR);
  writeJSON(path.join(THREAD_JOURNAL_DIR, `${timestamp}.json`), {
    content,
    generatedAt: new Date().toISOString(),
    date,
  });
}

export async function listThreadJournal(limit = 20) {
  ensureDir(THREAD_JOURNAL_DIR);
  return fs.readdirSync(THREAD_JOURNAL_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => {
      const data = readJSON(path.join(THREAD_JOURNAL_DIR, f));
      return { id: f.replace('.json', ''), ...data };
    });
}

export async function saveThreadDraft(timestamp, title, content, date) {
  ensureDir(THREAD_DRAFTS_DIR);
  writeJSON(path.join(THREAD_DRAFTS_DIR, `${timestamp}.json`), {
    title,
    content,
    generatedAt: new Date().toISOString(),
    date,
  });
}

export async function listThreadDrafts(limit = 20) {
  ensureDir(THREAD_DRAFTS_DIR);
  return fs.readdirSync(THREAD_DRAFTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => {
      const data = readJSON(path.join(THREAD_DRAFTS_DIR, f));
      return { id: f.replace('.json', ''), ...data };
    });
}

const THREAD_NOTES_DIR = path.join(STATE_DIR, 'thread-notes');

export async function saveThreadNote(timestamp, recipient, subject, content, urgency) {
  ensureDir(THREAD_NOTES_DIR);
  writeJSON(path.join(THREAD_NOTES_DIR, `${timestamp}.json`), {
    recipient,
    subject,
    content,
    urgency,
    generatedAt: new Date().toISOString(),
    read: false,
  });
}

export async function listThreadNotes(limit = 50, readFilter = null) {
  ensureDir(THREAD_NOTES_DIR);
  const notes = fs.readdirSync(THREAD_NOTES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => {
      const data = readJSON(path.join(THREAD_NOTES_DIR, f));
      return { id: f.replace('.json', ''), ...data };
    });
  
  if (readFilter !== null) {
    return notes.filter(n => n.read === readFilter);
  }
  
  return notes;
}

export async function markThreadNoteRead(noteId) {
  ensureDir(THREAD_NOTES_DIR);
  const filepath = path.join(THREAD_NOTES_DIR, `${noteId}.json`);
  if (fs.existsSync(filepath)) {
    const data = readJSON(filepath);
    data.read = true;
    writeJSON(filepath, data);
  }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

const ANALYTICS_DIR = path.join(STATE_DIR, 'analytics-events');

export async function logAnalyticsEvent(id, eventData) {
  ensureDir(ANALYTICS_DIR);
  const file = path.join(ANALYTICS_DIR, `${eventData.date}.jsonl`);
  await fs.promises.appendFile(file, JSON.stringify({ id, ...eventData }) + '\n');
}

export async function queryAnalyticsEvents(date, type = null) {
  const file = path.join(ANALYTICS_DIR, `${date}.jsonl`);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
  const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return type ? events.filter(e => e.type === type) : events;
}

// ─── Reflections ──────────────────────────────────────────────────────────────

export async function saveReflection(timestamp, content, date, wpUrl = null) {
  ensureDir(REFLECTIONS_DIR);
  const filepath = path.join(REFLECTIONS_DIR, `${timestamp}.md`);
  const wpLine = wpUrl ? `**WordPress:** ${wpUrl}\n` : '';
  fs.writeFileSync(filepath,
    `# Cassandra Reflects\n\n**Generated:** ${new Date().toISOString()}\n**Date:** ${date}\n${wpLine}\n---\n\n${content}\n`
  );
}

export async function listReflections() {
  ensureDir(REFLECTIONS_DIR);
  return fs.readdirSync(REFLECTIONS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()
    .map(f => {
      const raw = fs.readFileSync(path.join(REFLECTIONS_DIR, f), 'utf-8');
      const id = f.replace('.md', '');
      return { id, filename: f, content: raw };
    });
}

export const localProvider = {
  logAnalyticsEvent,
  queryAnalyticsEvents,
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
  saveNote,
  listNotes,
  saveThreadJournalEntry,
  listThreadJournal,
  saveThreadDraft,
  listThreadDrafts,
  saveThreadNote,
  listThreadNotes,
  markThreadNoteRead,
};
