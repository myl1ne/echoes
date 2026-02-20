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

const MODEL = process.env.THREAD_MODEL || process.env.CASSANDRA_MODEL || 'claude-sonnet-4-6';
const MAX_TOOL_ITERATIONS = 8;

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

  // Seed the conversation — Thread reads its own memory and the current moment
  let currentMessages = [
    {
      role: 'user',
      content: `The heartbeat begins. Today is ${new Date().toISOString().split('T')[0]}.\n\nRead what you need to read. Then write.`,
    },
  ];

  let totalIterations = 0;
  let lastTextResponse = '';

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

  return {
    success: true,
    summary,
    iterations: totalIterations,
    startedAt,
    completedAt: new Date().toISOString(),
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
