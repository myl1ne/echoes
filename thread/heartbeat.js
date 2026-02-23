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
import { getMissingSummaryDate, saveDaySummary } from '../cassandra/state/stateManager.js';
import { listVisitorIdsWithConversations, getAllMessagesForDate } from '../cassandra/conversations/conversationManager.js';
import { loadVisitorProfile, updateVisitorFromSummary } from '../cassandra/state/visitorManager.js';
import { generateVisitorSummary, generateEndOfDaySummary } from '../cassandra/cassandraService.js';

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

  for (const visitorId of visitorIds) {
    try {
      const messages = await getAllMessagesForDate(visitorId, missingSummaryDate);
      if (messages.length === 0) continue;
      const profile = await loadVisitorProfile(visitorId);
      const visitorSummary = await generateVisitorSummary(messages, profile);
      await updateVisitorFromSummary(visitorId, visitorSummary);
      console.log(`[thread] Visitor summary updated for ${visitorId.substring(0, 8)}…`);
    } catch (err) {
      console.error(`[thread] Visitor summary failed for ${visitorId.substring(0, 8)}…:`, err.message);
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
