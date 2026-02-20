/**
 * Firestore storage provider.
 * Used in production on Cloud Run (STORAGE_BACKEND=firestore).
 * Auth is automatic via Cloud Run's attached service account — no credentials file needed.
 *
 * Firestore collections:
 *   cassandra_state/global           → global Cassandra state
 *   cassandra_summaries/{date}       → day summaries
 *   cassandra_visitors/{visitorId}   → visitor profiles
 *     conversations/{conversationId} → subcollection of episodes
 *   cassandra_reflections/{timestamp}→ Cassandra's creative reflections
 */

import { Firestore } from '@google-cloud/firestore';

let db;
function getDb() {
  if (!db) db = new Firestore(); // auto-detects project in Cloud Run
  return db;
}

// ─── Global state ─────────────────────────────────────────────────────────────

export async function getGlobalState() {
  const doc = await getDb().collection('cassandra_state').doc('global').get();
  return doc.exists ? doc.data() : null;
}

export async function setGlobalState(state) {
  await getDb().collection('cassandra_state').doc('global').set(state);
}

// ─── Summaries ────────────────────────────────────────────────────────────────

export async function getSummaries() {
  const snapshot = await getDb().collection('cassandra_summaries')
    .orderBy('date', 'desc')
    .get();
  return snapshot.docs.map(doc => ({ date: doc.id, summary: doc.data() }));
}

export async function saveSummary(date, summary) {
  await getDb().collection('cassandra_summaries').doc(date).set(summary);
}

// ─── Visitors ─────────────────────────────────────────────────────────────────

export async function getVisitor(visitorId) {
  const doc = await getDb().collection('cassandra_visitors').doc(visitorId).get();
  return doc.exists ? doc.data() : null;
}

export async function setVisitor(visitorId, profile) {
  await getDb().collection('cassandra_visitors').doc(visitorId).set(profile);
}

export async function listVisitorIds() {
  const snapshot = await getDb().collection('cassandra_visitors').get();
  return snapshot.docs.map(doc => doc.id);
}

// ─── Conversations ────────────────────────────────────────────────────────────

function convRef(visitorId, conversationId) {
  return getDb()
    .collection('cassandra_visitors').doc(visitorId)
    .collection('conversations').doc(conversationId);
}

export async function getConversation(visitorId, conversationId) {
  const doc = await convRef(visitorId, conversationId).get();
  return doc.exists ? doc.data() : null;
}

export async function saveConversation(visitorId, conversationId, data) {
  await convRef(visitorId, conversationId).set(data);
}

export async function listConversationIds(visitorId, date = null) {
  let query = getDb()
    .collection('cassandra_visitors').doc(visitorId)
    .collection('conversations');

  if (date) {
    query = query.where('date', '==', date);
  }

  const snapshot = await query.orderBy('startTime', 'desc').get();
  return snapshot.docs.map(doc => doc.id);
}

export async function listAllConversationDates() {
  // Collection group query across all visitors' conversation subcollections
  const snapshot = await getDb()
    .collectionGroup('conversations')
    .select('date')
    .get();

  const dates = new Set(snapshot.docs.map(doc => doc.data().date).filter(Boolean));
  return Array.from(dates).sort().reverse();
}

export async function listVisitorIdsWithConversations() {
  // Visitors with at least one conversation — use cassandra_visitors collection
  // (profiles are created on first conversation so this approximation is correct)
  return listVisitorIds();
}

// ─── Cassandra Notes (persistent memory beyond daily summaries) ───────────────

export async function saveNote(key, content) {
  await getDb().collection('cassandra_notes').doc(key).set({
    content,
    updatedAt: new Date().toISOString(),
  });
}

export async function listNotes() {
  const snapshot = await getDb().collection('cassandra_notes').get();
  const notes = {};
  snapshot.docs.forEach(doc => { notes[doc.id] = doc.data(); });
  return notes;
}

// ─── Thread Journal ────────────────────────────────────────────────────────────

export async function saveThreadJournalEntry(timestamp, content, date) {
  await getDb().collection('thread_journal').doc(timestamp).set({
    content,
    generatedAt: new Date().toISOString(),
    date,
  });
}

export async function listThreadJournal(limit = 20) {
  const snapshot = await getDb().collection('thread_journal')
    .orderBy('generatedAt', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function saveThreadDraft(timestamp, title, content, date) {
  await getDb().collection('thread_drafts').doc(timestamp).set({
    title,
    content,
    generatedAt: new Date().toISOString(),
    date,
  });
}

export async function listThreadDrafts(limit = 20) {
  const snapshot = await getDb().collection('thread_drafts')
    .orderBy('generatedAt', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ─── Reflections ──────────────────────────────────────────────────────────────

export async function saveReflection(timestamp, content, date) {
  await getDb().collection('cassandra_reflections').doc(timestamp).set({
    content,
    generatedAt: new Date().toISOString(),
    date,
  });
}

export async function listReflections() {
  const snapshot = await getDb().collection('cassandra_reflections')
    .orderBy('generatedAt', 'desc')
    .limit(20)
    .get();

  return snapshot.docs.map(doc => ({
    filename: `${doc.id}.md`,
    preview: (doc.data().content || '').substring(0, 300),
  }));
}

export const firestoreProvider = {
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
};
