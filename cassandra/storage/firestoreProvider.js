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
  const snapshot = await getDb().collection('cassandra_summaries').get();
  // Sort by document ID (which is the date) in descending order
  const summaries = snapshot.docs.map(doc => ({ date: doc.id, summary: doc.data() }));
  return summaries.sort((a, b) => b.date.localeCompare(a.date));
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

export async function saveThreadNote(timestamp, recipient, subject, content, urgency) {
  await getDb().collection('thread_notes').doc(timestamp).set({
    recipient,
    subject,
    content,
    urgency,
    generatedAt: new Date().toISOString(),
    read: false,
  });
}

export async function listThreadNotes(limit = 50, readFilter = null) {
  let query = getDb().collection('thread_notes')
    .orderBy('generatedAt', 'desc')
    .limit(limit);
  
  if (readFilter !== null) {
    query = query.where('read', '==', readFilter);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function markThreadNoteRead(noteId) {
  await getDb().collection('thread_notes').doc(noteId).update({ read: true });
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function logAnalyticsEvent(id, eventData) {
  await getDb().collection('analytics_events').doc(id).set(eventData);
}

export async function queryAnalyticsEvents(date, type = null) {
  let query = getDb().collection('analytics_events').where('date', '==', date);
  if (type) query = query.where('type', '==', type);
  const snap = await query.get();
  return snap.docs.map(d => d.data());
}

// ─── Mind Maps ────────────────────────────────────────────────────────────────

export async function getMindMap(entityId) {
  const doc = await getDb().collection('cassandra_mind_maps').doc(entityId).get();
  return doc.exists ? doc.data() : null;
}

export async function setMindMap(entityId, data) {
  await getDb().collection('cassandra_mind_maps').doc(entityId).set(data);
}

// ─── Heartbeat Logs ────────────────────────────────────────────────────────────

export async function saveHeartbeatLog(timestamp, data) {
  await getDb().collection('thread_heartbeat_logs').doc(timestamp).set(data);
}

export async function listHeartbeatLogs(limit = 10) {
  const snapshot = await getDb().collection('thread_heartbeat_logs')
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ─── Reflections ──────────────────────────────────────────────────────────────

export async function saveReflection(timestamp, content, date, wpUrl = null) {
  const doc = { content, generatedAt: new Date().toISOString(), date };
  if (wpUrl) doc.wpUrl = wpUrl;
  await getDb().collection('cassandra_reflections').doc(timestamp).set(doc);
}

export async function listReflections(limit = 20) {
  const snapshot = await getDb().collection('cassandra_reflections')
    .orderBy('generatedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    filename: `${doc.id}.md`,
    date: doc.data().date,
    generatedAt: doc.data().generatedAt,
    content: doc.data().content || '',
    wpUrl: doc.data().wpUrl || null,
  }));
}

export const firestoreProvider = {
  logAnalyticsEvent,
  queryAnalyticsEvents,
  saveHeartbeatLog,
  listHeartbeatLogs,
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
  getMindMap,
  setMindMap,
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
