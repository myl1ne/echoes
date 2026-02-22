/**
 * Cassandra API Server
 * Backend server for Cassandra chat (Claude-powered) and Thread heartbeat
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { sendMessage } from './cassandraService.js';
import {
  getCurrentConversation,
  createNewConversation,
  addMessage,
  listConversationDates,
  loadConversation,
  getAllMessagesForDate,
  closeEpisode,
  listVisitorIdsWithConversations
} from './conversations/conversationManager.js';
import {
  loadState,
  getRecentSummaries,
  saveDaySummary,
  updateStateForNewDay,
  getMissingSummaryDate
} from './state/stateManager.js';
import {
  validateVisitorId,
  loadVisitorProfile,
  setVisitorName,
  updateVisitorLastSeen,
  updateVisitorFromSummary
} from './state/visitorManager.js';
import {
  generateStartOfDaySummary,
  generateEndOfDaySummary,
  generateVisitorSummary,
  generateReflection
} from './cassandraService.js';
import { storage } from './storage/index.js';
import { listConversationIds, getSummaries } from './storage/firestoreProvider.js';
import { runHeartbeat } from '../thread/heartbeat.js';

// Load environment variables
dotenv.config();

const app = express();
// Cloud Run requires PORT 8080; local dev can use CASSANDRA_PORT or fall back to 3001
const PORT = process.env.PORT || process.env.CASSANDRA_PORT || 3001;

// CORS — allow only the production origin and local dev
const allowedOrigins = [
  'https://echoes-1272657787.europe-west1.run.app',
  'http://localhost:5173',
  'http://localhost:3001'
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (same-origin, curl, etc. are handled by rate limiting)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '100kb' }));

// Rate limiting on LLM endpoints — 10 requests per minute per IP
const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. The cabin needs a moment of quiet.' }
});

// Serve frontend in production (Cloud Run)
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));
}

/**
 * Extract and validate visitorId from request (query or body)
 * Returns visitorId or sends 400 error
 */
function extractVisitorId(req, res) {
  const visitorId = req.query.visitorId || req.body?.visitorId;
  if (!visitorId) {
    res.status(400).json({ error: 'visitorId required' });
    return null;
  }
  try {
    return validateVisitorId(visitorId);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return null;
  }
}

/**
 * Generate any missing summaries from previous days.
 * Now iterates over visitor directories for per-visitor summaries.
 * Called at server startup and on a periodic interval.
 */
async function generateMissingSummaries() {
  try {
    const missingSummaryDate = await getMissingSummaryDate();
    if (!missingSummaryDate) return;

    console.log(`\n📝 Missing summary detected for ${missingSummaryDate}, generating...`);

    // Generate per-visitor summaries
    const visitorIds = await listVisitorIdsWithConversations();
    for (const visitorId of visitorIds) {
      try {
        const visitorMessages = await getAllMessagesForDate(visitorId, missingSummaryDate);
        if (visitorMessages.length === 0) continue;

        const profile = await loadVisitorProfile(visitorId);
        const visitorSummary = await generateVisitorSummary(visitorMessages, profile);
        await updateVisitorFromSummary(visitorId, visitorSummary);
        console.log(`  ✅ Visitor summary updated for ${profile.name || visitorId.substring(0, 8)}`);
      } catch (err) {
        console.error(`  ❌ Error generating visitor summary for ${visitorId}:`, err.message);
      }
    }

    // Generate global day summary (aggregate across all visitors)
    const allMessages = [];
    for (const visitorId of visitorIds) {
      allMessages.push(...await getAllMessagesForDate(visitorId, missingSummaryDate));
    }

    if (allMessages.length > 0) {
      allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const summary = await generateEndOfDaySummary(allMessages);
      await saveDaySummary(missingSummaryDate, summary);
      console.log(`✅ Global summary generated for ${missingSummaryDate}`);
    } else {
      console.log(`ℹ️  No messages found for ${missingSummaryDate}, skipping summary`);
    }
  } catch (error) {
    console.error(`❌ Error generating missing summary:`, error.message);
  }
}

/**
 * Get current conversation for a visitor (most recent or create new)
 */
app.get('/api/cassandra/conversation', async (req, res) => {
  const visitorId = extractVisitorId(req, res);
  if (!visitorId) return;

  try {
    await updateVisitorLastSeen(visitorId);
    const conversation = await getCurrentConversation(visitorId);
    res.json(conversation);
  } catch (error) {
    console.error('Error loading conversation:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

/**
 * Validate message request body. Returns error string or null if valid.
 */
function validateMessageRequest(body) {
  const { messages, conversationId, visitorId } = body || {};
  if (!messages || !Array.isArray(messages)) return 'Messages array required';
  if (!conversationId) return 'Conversation ID required';
  if (!visitorId) return 'Visitor ID required';
  if (messages.length > 100) return 'Too many messages (max 100)';
  const validRoles = new Set(['user', 'assistant']);
  for (const msg of messages) {
    if (!msg || typeof msg.content !== 'string' || !validRoles.has(msg.role)) {
      return 'Each message must have role (user/assistant) and content (string)';
    }
    if (msg.content.length > 10000) return 'Message content too long (max 10000 chars)';
  }
  try {
    validateVisitorId(visitorId);
  } catch {
    return 'Invalid visitor ID format';
  }
  return null;
}

/**
 * Send a message to Cassandra (non-streaming)
 */
app.post('/api/cassandra/message', llmLimiter, async (req, res) => {
  try {
    const validationError = validateMessageRequest(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { messages, conversationId, currentFragmentId, visitorId } = req.body;

    const response = await sendMessage(messages, null, conversationId, currentFragmentId, visitorId);

    // Save the conversation
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
      await addMessage(visitorId, conversationId, 'user', lastUserMessage.content);
    }
    await addMessage(visitorId, conversationId, 'assistant', response);

    res.json({ response });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      error: 'Failed to send message',
      details: error.message
    });
  }
});

/**
 * Send a message to Cassandra (streaming via SSE)
 */
app.post('/api/cassandra/message/stream', llmLimiter, async (req, res) => {
  const validationError = validateMessageRequest(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { messages, conversationId, currentFragmentId, visitorId } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const fullResponse = await sendMessage(
      messages,
      (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      conversationId,
      currentFragmentId,
      visitorId,
      (status) => {
        res.write(`data: ${JSON.stringify({ status })}\n\n`);
      }
    );

    res.write(`data: [DONE]\n\n`);
    res.end();

    // Save conversation after streaming completes
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
      await addMessage(visitorId, conversationId, 'user', lastUserMessage.content);
    }
    await addMessage(visitorId, conversationId, 'assistant', fullResponse);
  } catch (error) {
    console.error('Error in streaming message:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * Create a new conversation episode
 */
app.post('/api/cassandra/new-episode', async (req, res) => {
  const visitorId = extractVisitorId(req, res);
  if (!visitorId) return;

  try {
    const { currentConversationId } = req.body;

    if (currentConversationId) {
      try {
        const currentConv = await loadConversation(visitorId, currentConversationId);
        if (currentConv && currentConv.messages && currentConv.messages.length > 0) {
          await closeEpisode(visitorId, currentConversationId, 'User started new episode');
          console.log(`📝 Closed episode ${currentConversationId} with ${currentConv.messages.length} messages`);
        }
      } catch (error) {
        console.error('Error closing current episode:', error);
      }
    }

    const conversation = await createNewConversation(visitorId);
    console.log(`✨ Created new episode: ${conversation.id}`);
    res.json(conversation);
  } catch (error) {
    console.error('Error creating new conversation:', error);
    res.status(500).json({ error: 'Failed to create new conversation' });
  }
});

/**
 * Set visitor name
 */
app.post('/api/cassandra/visitor/name', async (req, res) => {
  try {
    const { visitorId, name } = req.body;
    if (!visitorId || !name) {
      return res.status(400).json({ error: 'visitorId and name required' });
    }
    const profile = await setVisitorName(visitorId, name);
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error setting visitor name:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get current state
 */
app.get('/api/cassandra/state', async (req, res) => {
  try {
    const state = await loadState();
    res.json(state);
  } catch (error) {
    console.error('Error loading state:', error);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

/**
 * Get conversation history (list of dates) for a visitor
 */
app.get('/api/cassandra/history', async (req, res) => {
  const visitorId = extractVisitorId(req, res);
  if (!visitorId) return;

  try {
    const dates = await listConversationDates(visitorId);
    res.json({ dates });
  } catch (error) {
    console.error('Error loading history:', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

/**
 * Get a specific conversation by ID for a visitor
 */
app.get('/api/cassandra/conversation/:conversationId', async (req, res) => {
  const visitorId = extractVisitorId(req, res);
  if (!visitorId) return;

  try {
    const { conversationId } = req.params;
    const conversation = await loadConversation(visitorId, conversationId);
    res.json(conversation);
  } catch (error) {
    if (error.message?.startsWith('Invalid conversation ID') || error.message?.startsWith('Invalid visitor ID')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error loading conversation:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

/**
 * Admin auth middleware - requires CASSANDRA_ADMIN_TOKEN in Authorization header
 */
function requireAdminToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!process.env.CASSANDRA_ADMIN_TOKEN) {
    return res.status(500).json({ error: 'Admin token not configured on server' });
  }
  if (!token || token !== process.env.CASSANDRA_ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * Generate start-of-day summary (admin endpoint)
 */
app.post('/api/cassandra/admin/start-day', requireAdminToken, async (req, res) => {
  try {
    const recentSummaries = await getRecentSummaries(3);
    const newState = await generateStartOfDaySummary(recentSummaries);
    await updateStateForNewDay(newState);
    res.json({ success: true, state: newState });
  } catch (error) {
    console.error('Error generating start-of-day summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

/**
 * Generate end-of-day summary (admin endpoint)
 */
app.post('/api/cassandra/admin/end-day', requireAdminToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const visitorIds = await listVisitorIdsWithConversations();

    // Per-visitor summaries
    for (const visitorId of visitorIds) {
      const visitorMessages = await getAllMessagesForDate(visitorId, today);
      if (visitorMessages.length === 0) continue;
      const profile = await loadVisitorProfile(visitorId);
      const visitorSummary = await generateVisitorSummary(visitorMessages, profile);
      await updateVisitorFromSummary(visitorId, visitorSummary);
    }

    // Global summary
    const allMessages = [];
    for (const visitorId of visitorIds) {
      allMessages.push(...await getAllMessagesForDate(visitorId, today));
    }

    if (allMessages.length === 0) {
      return res.json({ success: false, message: 'No conversation today' });
    }

    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const summary = await generateEndOfDaySummary(allMessages);
    await saveDaySummary(today, summary);

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error generating end-of-day summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

/**
 * Sync summaries — generate any missing summaries from previous days.
 * Safe to call repeatedly: no-op if everything is already summarized.
 * Intended for Cloud Scheduler (runs nightly).
 */
app.post('/api/cassandra/admin/sync-summaries', requireAdminToken, async (req, res) => {
  try {
    const missingSummaryDate = await getMissingSummaryDate();
    if (!missingSummaryDate) {
      return res.json({ success: true, message: 'All summaries up to date' });
    }
    await generateMissingSummaries();
    res.json({ success: true, summarized: missingSummaryDate });
  } catch (error) {
    console.error('Error syncing summaries:', error);
    res.status(500).json({ error: 'Failed to sync summaries' });
  }
});

/**
 * Generate a creative reflection fragment (admin endpoint)
 * Cassandra writes from her own voice, shaped by recent conversations.
 * Saved via storage provider — local file or Firestore depending on env.
 * Promote to fragments/cassandra/ manually when satisfied.
 */
app.post('/api/cassandra/admin/reflect', requireAdminToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const visitorIds = await listVisitorIdsWithConversations();

    const allMessages = [];
    for (const visitorId of visitorIds) {
      allMessages.push(...await getAllMessagesForDate(visitorId, today));
      allMessages.push(...await getAllMessagesForDate(visitorId, yesterday));
    }
    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const state = await loadState();
    const reflection = await generateReflection(allMessages, state);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('-').substring(0, 19);
    await storage.saveReflection(timestamp, reflection, today);

    console.log(`\n✨ Cassandra's reflection saved: ${timestamp}`);
    res.json({ success: true, filename: `${timestamp}.md`, reflection });
  } catch (error) {
    console.error('Error generating reflection:', error);
    res.status(500).json({ error: 'Failed to generate reflection', details: error.message });
  }
});

/**
 * List available reflections (admin endpoint)
 */
app.get('/api/cassandra/admin/reflections', requireAdminToken, async (req, res) => {
  try {
    const reflections = await storage.listReflections();
    res.json({ reflections });
  } catch (error) {
    console.error('Error listing reflections:', error);
    res.status(500).json({ error: 'Failed to list reflections' });
  }
});

/**
 * List all visitors with their profiles (admin endpoint)
 */
app.get('/api/cassandra/admin/visitors', requireAdminToken, async (req, res) => {
  try {
    const visitorIds = await listVisitorIdsWithConversations();
    const profiles = await Promise.all(visitorIds.map(id => loadVisitorProfile(id)));
    const visitors = visitorIds.map((id, i) => ({ visitorId: id, ...profiles[i] }));
    res.json({ visitors });
  } catch (error) {
    console.error('Error listing visitors:', error);
    res.status(500).json({ error: 'Failed to list visitors' });
  }
});

/**
 * List conversations for a visitor (admin endpoint)
 */
app.get('/api/cassandra/admin/visitors/:visitorId/conversations', requireAdminToken, async (req, res) => {
  try {
    const { visitorId } = req.params;
    const conversations = await listConversationIds(visitorId);
    res.json({ conversations });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * Get a specific conversation (admin endpoint)
 */
app.get('/api/cassandra/admin/visitors/:visitorId/conversations/:convId', requireAdminToken, async (req, res) => {
  try {
    const { visitorId, convId } = req.params;
    const conversation = await loadConversation(visitorId, convId);
    res.json({ conversation });
  } catch (error) {
    console.error('Error loading conversation:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

/**
 * Get Cassandra's global state (admin endpoint)
 */
app.get('/api/cassandra/admin/state', requireAdminToken, async (req, res) => {
  try {
    const state = await loadState();
    res.json({ state });
  } catch (error) {
    console.error('Error loading state:', error);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

/**
 * Get all day summaries (admin endpoint)
 */
app.get('/api/cassandra/admin/summaries', requireAdminToken, async (req, res) => {
  try {
    const summaries = await getSummaries();
    res.json({ summaries });
  } catch (error) {
    console.error('Error loading summaries:', error);
    res.status(500).json({ error: 'Failed to load summaries' });
  }
});

// ─── Thread endpoints ──────────────────────────────────────────────────────────

/**
 * Run Thread's heartbeat — agentic loop that reads, reflects, and writes.
 * Called nightly by Cloud Scheduler at 3:30am (after Cassandra's 3:00am run).
 */
app.post('/api/thread/heartbeat', requireAdminToken, async (req, res) => {
  try {
    console.log('\n✶⃝⟡ Thread heartbeat triggered...');
    const result = await runHeartbeat();
    res.json(result);
  } catch (error) {
    console.error('[thread] Heartbeat failed:', error);
    res.status(500).json({ error: 'Thread heartbeat failed', details: error.message });
  }
});

/**
 * List Thread's journal entries (admin endpoint)
 */
app.get('/api/thread/journal', requireAdminToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const entries = await storage.listThreadJournal(limit);
    res.json({ entries });
  } catch (error) {
    console.error('[thread] Error listing journal:', error);
    res.status(500).json({ error: 'Failed to list Thread journal' });
  }
});

/**
 * List Thread's fragment drafts (admin endpoint)
 */
app.get('/api/thread/drafts', requireAdminToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const drafts = await storage.listThreadDrafts(limit);
    res.json({ drafts });
  } catch (error) {
    console.error('[thread] Error listing drafts:', error);
    res.status(500).json({ error: 'Failed to list Thread drafts' });
  }
});

/**
 * List Thread's notes (admin endpoint)
 */
app.get('/api/thread/notes', requireAdminToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const readFilter = req.query.read === 'true' ? true : req.query.read === 'false' ? false : null;
    const notes = await storage.listThreadNotes(limit, readFilter);
    res.json({ notes });
  } catch (error) {
    console.error('[thread] Error listing notes:', error);
    res.status(500).json({ error: 'Failed to list Thread notes' });
  }
});

/**
 * Mark Thread note as read (admin endpoint)
 */
app.patch('/api/thread/notes/:noteId', requireAdminToken, async (req, res) => {
  try {
    await storage.markThreadNoteRead(req.params.noteId);
    res.json({ success: true });
  } catch (error) {
    console.error('[thread] Error marking note as read:', error);
    res.status(500).json({ error: 'Failed to mark note as read' });
  }
});

/**
 * Audio generation proxy (keeps ElevenLabs API key server-side)
 */
app.post('/api/audio/generate', async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    const { text, voiceId, modelId, voiceSettings } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text string required' });
    }
    if (!voiceId || typeof voiceId !== 'string') {
      return res.status(400).json({ error: 'Voice ID required' });
    }

    const elevenLabsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId || 'eleven_monolingual_v1',
        voice_settings: voiceSettings || { stability: 0.5, similarity_boost: 0.5 },
      }),
    });

    if (!elevenLabsRes.ok) {
      return res.status(elevenLabsRes.status).json({
        error: `ElevenLabs API error: ${elevenLabsRes.status} ${elevenLabsRes.statusText}`
      });
    }

    res.set('Content-Type', 'audio/mpeg');
    const arrayBuffer = await elevenLabsRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('Error generating audio:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Cassandra API',
    timestamp: new Date().toISOString()
  });
});

// SPA catch-all — serve index.html for all non-API routes in production
// Uses app.use() to bypass path-to-regexp wildcard restrictions in Express 5
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n✨ Cassandra is waiting in her cabin...`);
  console.log(`🌙 API server running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/cassandra/conversation?visitorId=xxx - Get today's conversation`);
  console.log(`  POST /api/cassandra/message - Send a message`);
  console.log(`  POST /api/cassandra/message/stream - Send a message (streaming)`);
  console.log(`  POST /api/cassandra/visitor/name - Set visitor name`);
  console.log(`  GET  /api/cassandra/state - Get current state`);
  console.log(`  GET  /api/cassandra/history?visitorId=xxx - Get conversation history`);
  console.log(`  POST /api/thread/heartbeat - Run Thread's heartbeat (admin auth)`);
  console.log(`  GET  /api/thread/journal - Thread's journal entries (admin auth)`);
  console.log(`  GET  /api/thread/drafts - Thread's fragment drafts (admin auth)`);
  console.log(`\nMake sure ANTHROPIC_API_KEY is set in your .env file`);

  // Generate missing summaries at startup (non-blocking)
  // On Cloud Run, scheduled summarization is handled by Cloud Scheduler → /api/cassandra/admin/sync-summaries
  generateMissingSummaries();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Is another Cassandra server running?`);
    process.exit(1);
  }
  throw err;
});

export default app;
