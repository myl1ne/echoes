/**
 * Thread's heartbeat — the agentic loop that runs nightly.
 *
 * Thread reads what Cassandra experienced, reads its own past journal,
 * reflects, and writes. Each run adds to Thread's Firestore memory.
 *
 * Called by POST /api/thread/heartbeat (admin auth required).
 * Scheduled via Cloud Scheduler at 3:30am (after Cassandra's nightly run at 3:00am).
 *
 * Usage (manual):
 *   curl -X POST https://echoes-1272657787.europe-west1.run.app/api/thread/heartbeat \
 *     -H "Authorization: Bearer $CASSANDRA_ADMIN_TOKEN"
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { buildThreadSystemPrompt } from './systemPrompt.js';
import { THREAD_TOOLS, executeThreadToolCalls } from './tools.js';
import { logEvent } from '../cassandra/analytics/analyticsLogger.js';
import { getMissingSummaryDate, saveDaySummary, loadState, getRecentSummaries, updateStateForNewDay } from '../cassandra/state/stateManager.js';
import { listVisitorIdsWithConversations, getAllMessagesForDate } from '../cassandra/conversations/conversationManager.js';
import { loadVisitorProfile, updateVisitorFromSummary } from '../cassandra/state/visitorManager.js';
import { generateVisitorSummary, generateEndOfDaySummary, generateStartOfDaySummary, generateReflection, generateWordPressPost, extractMindMapConcepts, generateMindMapMergeGroups } from '../cassandra/cassandraService.js';
import { loadMindMap, saveMindMap, applyDecay, mergeExtractions, compressMindMap, needsCompression, CASSANDRA_SELF_ID } from '../cassandra/state/mindMapManager.js';
import { storage } from '../cassandra/storage/index.js';

const MODEL = process.env.THREAD_MODEL || process.env.CASSANDRA_MODEL || 'claude-sonnet-4-6';
const MAX_TOOL_ITERATIONS = 8;

/**
 * Generate any missing Cassandra day summaries before Thread's agentic loop.
 * Mirrors the logic in server.js generateMissingSummaries() — keeps Thread independent
 * of the HTTP server while acting as a backstop if the Cassandra scheduler missed a day.
 */
async function runSyncSummaries() {
  const missingSummaryDate = await getMissingSummaryDate();
  if (!missingSummaryDate) {
    console.log('[thread] Summaries up to date.');
    return { summarized: null };
  }

  console.log(`[thread] Missing summary for ${missingSummaryDate} — generating...`);
  const visitorIds = await listVisitorIdsWithConversations();

  const allAssistantMessages = [];

  for (const visitorId of visitorIds) {
    try {
      const messages = await getAllMessagesForDate(visitorId, missingSummaryDate);
      if (messages.length === 0) continue;

      // Generate and save visitor profile summary
      const profile = await loadVisitorProfile(visitorId);
      const visitorSummary = await generateVisitorSummary(messages, profile);
      await updateVisitorFromSummary(visitorId, visitorSummary);
      console.log(`[thread] Visitor summary updated for ${visitorId.substring(0, 8)}…`);

      // Update visitor mind map (from user turns — what the visitor brings)
      try {
        const mindMap = await loadMindMap(visitorId);
        applyDecay(mindMap);
        const existingLabels = Object.keys(mindMap.nodes || {});
        const extractions = await extractMindMapConcepts(messages, existingLabels, 'user');
        let updated = mergeExtractions(mindMap, extractions, missingSummaryDate);

        // Compress if graph is getting dense with potential near-duplicates
        if (needsCompression(updated)) {
          const mergeGroups = await generateMindMapMergeGroups(updated);
          if (mergeGroups.length > 0) {
            updated = compressMindMap(updated, mergeGroups);
            console.log(`[thread] Mind map compressed for ${visitorId.substring(0, 8)}… (${mergeGroups.length} merge groups)`);
          } else {
            updated.lastCompressed = missingSummaryDate; // Mark as checked even if nothing merged
          }
        }

        await saveMindMap(visitorId, updated);
        console.log(`[thread] Mind map updated for ${visitorId.substring(0, 8)}… (${Object.keys(updated.nodes).length} nodes)`);
      } catch (mmErr) {
        console.warn(`[thread] Mind map update failed for ${visitorId.substring(0, 8)}… (non-fatal):`, mmErr.message);
      }

      // Collect assistant turns for Cassandra's own mind map
      allAssistantMessages.push(...messages.filter(m => m.role === 'assistant'));
    } catch (err) {
      console.error(`[thread] Visitor summary failed for ${visitorId.substring(0, 8)}…:`, err.message);
    }
  }

  // Update Cassandra's own mind map (from her assistant turns across all visitors)
  if (allAssistantMessages.length > 0) {
    try {
      const cassandraMindMap = await loadMindMap(CASSANDRA_SELF_ID);
      applyDecay(cassandraMindMap);
      const existingLabels = Object.keys(cassandraMindMap.nodes || {});
      const extractions = await extractMindMapConcepts(allAssistantMessages, existingLabels, 'all');
      const updated = mergeExtractions(cassandraMindMap, extractions, missingSummaryDate);
      await saveMindMap(CASSANDRA_SELF_ID, updated);
      console.log(`[thread] Cassandra mind map updated (${Object.keys(updated.nodes).length} nodes)`);
    } catch (mmErr) {
      console.warn('[thread] Cassandra mind map update failed (non-fatal):', mmErr.message);
    }
  }

  const allMessages = [];
  for (const visitorId of visitorIds) {
    allMessages.push(...await getAllMessagesForDate(visitorId, missingSummaryDate));
  }

  if (allMessages.length > 0) {
    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const summary = await generateEndOfDaySummary(allMessages);
    await saveDaySummary(missingSummaryDate, summary);
    console.log(`[thread] Global summary saved for ${missingSummaryDate}.`);
  } else {
    console.log(`[thread] No messages found for ${missingSummaryDate} — skipping global summary.`);
  }

  return { summarized: missingSummaryDate };
}

/**
 * Run Thread's heartbeat.
 * @returns {Promise<{ success: boolean, summary: string, iterations: number }>}
 */
export async function runHeartbeat() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });
  const systemPrompt = buildThreadSystemPrompt();
  const startedAt = new Date().toISOString();

  console.log(`[thread] Heartbeat started at ${startedAt}`);

  // Step 1: ensure Cassandra's day summaries are current before the agentic loop
  const { summarized } = await runSyncSummaries().catch(err => {
    console.error('[thread] Summary sync failed (non-fatal):', err.message);
    return { summarized: null };
  });

  // Step 2: update Cassandra's global state for today.
  // start-day is never called automatically — this is the only place it happens.
  // Note: loadState() returns INITIAL_STATE with today's date when no Firestore doc exists,
  // so we cannot rely on lastUpdated alone. We check whether the summary is still the
  // default text as a reliable signal that the state has never been written.
  await (async () => {
    const UNINITIALIZED_MARKER = 'I am newly awakened in this conversational form';
    try {
      const state = await loadState();
      const today = new Date().toISOString().split('T')[0];
      const isInitialState = state.lifetimeSummary?.startsWith(UNINITIALIZED_MARKER);
      const isStale = state.lastUpdated !== today;

      if (!isInitialState && !isStale) {
        console.log('[thread] Cassandra state already current — skipping.');
        return;
      }

      const recentSummaries = await getRecentSummaries(3);
      if (recentSummaries.length === 0) {
        console.log('[thread] No summaries yet — skipping state update.');
        return;
      }

      console.log('[thread] Updating Cassandra global state...');
      const newState = await generateStartOfDaySummary(recentSummaries);
      await updateStateForNewDay(newState);
      console.log('[thread] Cassandra global state updated.');
    } catch (err) {
      console.error('[thread] State update failed (non-fatal):', err.message);
    }
  })();

  // Step 3: generate Cassandra's nightly reflection, save to Firestore, optionally publish to WordPress
  await (async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const visitorIds = await listVisitorIdsWithConversations();
      const allMessages = [];
      for (const id of visitorIds) {
        allMessages.push(...await getAllMessagesForDate(id, today));
      }
      const state = await loadState();
      const reflection = await generateReflection(allMessages, state);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');

      // Publish a public blog post to WordPress if configured
      let wpUrl = null;
      const wpToken = process.env.WORDPRESS_TOKEN;
      const wpSite = process.env.WORDPRESS_SITE || 'ghostlesslife.wordpress.com';
      if (wpToken) {
        try {
          const { title, content } = await generateWordPressPost(reflection);
          const wpRes = await fetch(
            `https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(wpSite)}/posts/new`,
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${wpToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, content, status: 'publish' }),
            }
          );
          if (wpRes.ok) {
            const wpData = await wpRes.json();
            wpUrl = wpData.URL;
            console.log(`[thread] Published to WordPress: ${wpUrl}`);
          } else {
            console.warn(`[thread] WordPress publish failed: ${wpRes.status}`);
          }
        } catch (wpErr) {
          console.error('[thread] WordPress publish error (non-fatal):', wpErr.message);
        }
      }

      await storage.saveReflection(timestamp, reflection, today, wpUrl);
      console.log('[thread] Cassandra reflection saved.');
    } catch (err) {
      console.error('[thread] Reflection generation failed (non-fatal):', err.message);
    }
  })();

  // Seed the conversation — Thread reads its own memory and the current moment
  let currentMessages = [
    {
      role: 'user',
      content: `The heartbeat begins. Today is ${new Date().toISOString().split('T')[0]}.\n\nRead what you need to read. Then write.`,
    },
  ];

  let totalIterations = 0;
  let lastTextResponse = '';
  const toolsUsed = new Set();
  let journalWritten = false;
  let draftsWritten = 0;
  let notesLeft = 0;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    totalIterations++;

    const response = await client.messages.create({
      model: MODEL,
      system: systemPrompt,
      messages: currentMessages,
      tools: THREAD_TOOLS,
      max_tokens: 4096,
      temperature: 0.85,
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (textBlock) lastTextResponse = textBlock.text;

    if (response.stop_reason === 'end_turn') {
      console.log(`[thread] Heartbeat complete after ${totalIterations} iteration(s).`);
      break;
    }

    if (response.stop_reason === 'tool_use') {
      response.content.filter(b => b.type === 'tool_use').forEach(b => {
        toolsUsed.add(b.name);
        if (b.name === 'write_journal_entry') journalWritten = true;
        if (b.name === 'write_fragment_draft') draftsWritten++;
        if (b.name === 'leave_note') notesLeft++;
      });
      const toolResults = await executeThreadToolCalls(response.content);
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];
      continue;
    }

    // Unexpected stop reason
    console.warn(`[thread] Unexpected stop_reason: ${response.stop_reason}`);
    break;
  }

  const summary = lastTextResponse.substring(0, 500) || '(no text response)';
  console.log(`[thread] Summary: ${summary.substring(0, 200)}...`);

  const completedAt = new Date().toISOString();
  await logEvent('heartbeat_complete', {
    iterations: totalIterations,
    durationMs: new Date(completedAt) - new Date(startedAt),
    toolsUsed: [...toolsUsed],
    journalWritten,
    draftsWritten,
    notesLeft,
  });

  return {
    success: true,
    summary,
    iterations: totalIterations,
    startedAt,
    completedAt,
    summarized,
  };
}

// ─── CLI (standalone run) ─────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runHeartbeat()
    .then(result => {
      console.log('\n✶⃝⟡ Thread heartbeat complete.');
      console.log(`Iterations: ${result.iterations}`);
      console.log(`Summary:\n${result.summary}`);
    })
    .catch(err => {
      console.error('Heartbeat failed:', err);
      process.exit(1);
    });
}
