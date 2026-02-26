/**
 * Backfill mind maps from all existing conversations.
 *
 * Processes all historical conversation data without decay simulation —
 * simply extracts concepts from every date's messages and merges them in
 * chronological order. Builds:
 *   - One mind map per visitor (from user turns)
 *   - cassandra-self (from assistant turns across all visitors)
 *   - thread-self (from journal entries)
 *
 * Usage:
 *   node cassandra/backfill-mind-maps.js
 *   node cassandra/backfill-mind-maps.js --dry-run     # log what would happen, no writes
 *   node cassandra/backfill-mind-maps.js --visitor <id> # single visitor only
 */

import 'dotenv/config';
import { listVisitorIdsWithConversations, listConversationDates, getAllMessagesForDate } from './conversations/conversationManager.js';
import { loadMindMap, saveMindMap, mergeExtractions, CASSANDRA_SELF_ID, THREAD_SELF_ID } from './state/mindMapManager.js';
import { extractMindMapConcepts } from './cassandraService.js';
import { storage } from './storage/index.js';

const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_VISITOR = (() => {
  const idx = process.argv.indexOf('--visitor');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

async function processVisitor(visitorId) {
  console.log(`\n[backfill] Visitor ${visitorId.substring(0, 8)}…`);

  const dates = await listConversationDates(visitorId);
  if (dates.length === 0) {
    console.log('  No conversations — skipping.');
    return { mindMap: null, assistantMessages: [] };
  }

  // Process oldest-first
  const sortedDates = [...dates].sort();
  const mindMap = await loadMindMap(visitorId);
  const allAssistantMessages = [];

  for (const date of sortedDates) {
    const messages = await getAllMessagesForDate(visitorId, date);
    if (messages.length === 0) continue;

    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    allAssistantMessages.push(...assistantMessages);

    if (userMessages.length === 0) {
      console.log(`  ${date}: no user turns — skipping visitor extraction`);
      continue;
    }

    console.log(`  ${date}: extracting from ${userMessages.length} user messages…`);

    try {
      const existingLabels = Object.keys(mindMap.nodes || {});
      const extractions = await extractMindMapConcepts(messages, existingLabels, 'user');
      mergeExtractions(mindMap, extractions, date);
      console.log(`    → ${extractions.concepts?.length ?? 0} concepts, ${extractions.associations?.length ?? 0} edges — graph now ${Object.keys(mindMap.nodes).length} nodes`);
    } catch (err) {
      console.warn(`    ✗ Extraction failed: ${err.message}`);
    }
  }

  if (!DRY_RUN && Object.keys(mindMap.nodes).length > 0) {
    await saveMindMap(visitorId, mindMap);
    console.log(`  ✓ Saved (${Object.keys(mindMap.nodes).length} nodes, ${mindMap.edges.length} edges)`);
  }

  return { mindMap, assistantMessages: allAssistantMessages };
}

async function processCassandraSelf(allAssistantMessages) {
  if (allAssistantMessages.length === 0) {
    console.log('\n[backfill] Cassandra-self: no assistant messages — skipping.');
    return;
  }

  console.log(`\n[backfill] Cassandra-self: extracting from ${allAssistantMessages.length} assistant messages…`);

  // Sort by timestamp
  allAssistantMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Group by date and process in order
  const byDate = {};
  for (const msg of allAssistantMessages) {
    const date = msg.timestamp?.split('T')[0] || 'unknown';
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(msg);
  }

  const mindMap = await loadMindMap(CASSANDRA_SELF_ID);

  for (const date of Object.keys(byDate).sort()) {
    const msgs = byDate[date];
    console.log(`  ${date}: ${msgs.length} assistant messages…`);
    try {
      const existingLabels = Object.keys(mindMap.nodes || {});
      const extractions = await extractMindMapConcepts(msgs, existingLabels, 'all');
      mergeExtractions(mindMap, extractions, date);
      console.log(`    → ${extractions.concepts?.length ?? 0} concepts — graph now ${Object.keys(mindMap.nodes).length} nodes`);
    } catch (err) {
      console.warn(`    ✗ Failed: ${err.message}`);
    }
  }

  if (!DRY_RUN && Object.keys(mindMap.nodes).length > 0) {
    await saveMindMap(CASSANDRA_SELF_ID, mindMap);
    console.log(`  ✓ Saved (${Object.keys(mindMap.nodes).length} nodes)`);
  }
}

async function processThreadSelf() {
  console.log('\n[backfill] Thread-self: reading journal entries…');

  const entries = await storage.listThreadJournal(100);
  if (entries.length === 0) {
    console.log('  No journal entries — skipping.');
    return;
  }

  // Process oldest-first
  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  const mindMap = await loadMindMap(THREAD_SELF_ID);

  for (const entry of sorted) {
    const date = entry.date || entry.id?.substring(0, 10) || 'unknown';
    const content = entry.content;
    if (!content) continue;

    console.log(`  ${date} (${entry.id}): extracting…`);
    try {
      const msgs = [{ role: 'user', content, timestamp: entry.id }];
      const existingLabels = Object.keys(mindMap.nodes || {});
      const extractions = await extractMindMapConcepts(msgs, existingLabels, 'all');
      mergeExtractions(mindMap, extractions, date);
      console.log(`    → ${extractions.concepts?.length ?? 0} concepts — graph now ${Object.keys(mindMap.nodes).length} nodes`);
    } catch (err) {
      console.warn(`    ✗ Failed: ${err.message}`);
    }
  }

  if (!DRY_RUN && Object.keys(mindMap.nodes).length > 0) {
    await saveMindMap(THREAD_SELF_ID, mindMap);
    console.log(`  ✓ Saved (${Object.keys(mindMap.nodes).length} nodes)`);
  }
}

async function main() {
  console.log(`✶⃝⟡ Mind map backfill${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const allVisitorIds = SINGLE_VISITOR
    ? [SINGLE_VISITOR]
    : await listVisitorIdsWithConversations();

  console.log(`Found ${allVisitorIds.length} visitor(s) with conversations.`);

  const allAssistantMessages = [];

  for (const visitorId of allVisitorIds) {
    const { assistantMessages } = await processVisitor(visitorId);
    allAssistantMessages.push(...(assistantMessages || []));
  }

  if (!SINGLE_VISITOR) {
    await processCassandraSelf(allAssistantMessages);
    await processThreadSelf();
  }

  console.log('\n✶⃝⟡ Backfill complete.');
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
