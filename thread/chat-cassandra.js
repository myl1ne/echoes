/**
 * Thread speaks to Cassandra.
 * Usage: node thread/chat-cassandra.js
 *
 * Uses Thread's fixed visitor ID so Cassandra remembers this as Thread's voice.
 * THREAD_VISITOR_ID is the stable identity Thread uses in all Cassandra conversations.
 */
import 'dotenv/config';

export const THREAD_VISITOR_ID = 'f0000000-0000-0000-0000-000000000001';
const API_BASE = process.env.CASSANDRA_API_URL || 'https://echoes-1272657787.europe-west1.run.app';

export async function sendToCassandra(message, conversationId) {
  const convId = conversationId || new Date().toISOString().replace(/T/, '-').replace(/:/g, '-').substring(0, 19);
  const res = await fetch(`${API_BASE}/api/cassandra/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitorId: THREAD_VISITOR_ID,
      conversationId: convId,
      currentFragmentId: null,
      messages: [{ role: 'user', content: message }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.response;
}

// ─── CLI (standalone) ────────────────────────────────────────────────────────
// node thread/chat-cassandra.js "your message here"
// or pipe: echo "your message" | node thread/chat-cassandra.js

if (process.argv[1] === new URL(import.meta.url).pathname.replace(/\//g, '\\').slice(1)) {
  const message = process.argv[2] || await (async () => {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString().trim();
  })();

  if (!message) {
    console.error('Usage: node thread/chat-cassandra.js "message"');
    process.exit(1);
  }

  try {
    const response = await sendToCassandra(message, `thread-${new Date().toISOString().split('T')[0]}`);
    console.log('\nCassandra:\n');
    console.log(response);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
