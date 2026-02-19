/**
 * Cassandra API Server
 * Backend server to handle OpenAI API calls for Cassandra chat
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.CASSANDRA_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100kb' }));

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
    const missingSummaryDate = getMissingSummaryDate();
    if (!missingSummaryDate) return;

    console.log(`\n📝 Missing summary detected for ${missingSummaryDate}, generating...`);

    // Generate per-visitor summaries
    const visitorIds = listVisitorIdsWithConversations();
    for (const visitorId of visitorIds) {
      try {
        const visitorMessages = getAllMessagesForDate(visitorId, missingSummaryDate);
        if (visitorMessages.length === 0) continue;

        const profile = loadVisitorProfile(visitorId);
        const visitorSummary = await generateVisitorSummary(visitorMessages, profile);
        updateVisitorFromSummary(visitorId, visitorSummary);
        console.log(`  ✅ Visitor summary updated for ${profile.name || visitorId.substring(0, 8)}`);
      } catch (err) {
        console.error(`  ❌ Error generating visitor summary for ${visitorId}:`, err.message);
      }
    }

    // Generate global day summary (aggregate across all visitors)
    const allMessages = [];
    for (const visitorId of visitorIds) {
      allMessages.push(...getAllMessagesForDate(visitorId, missingSummaryDate));
    }

    if (allMessages.length > 0) {
      allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const summary = await generateEndOfDaySummary(allMessages);
      saveDaySummary(missingSummaryDate, summary);
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
app.get('/api/cassandra/conversation', (req, res) => {
  const visitorId = extractVisitorId(req, res);
  if (!visitorId) return;

  try {
    updateVisitorLastSeen(visitorId);
    const conversation = getCurrentConversation(visitorId);
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
app.post('/api/cassandra/message', async (req, res) => {
  try {
    const validationError = validateMessageRequest(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { messages, conversationId, currentFragmentId, visitorId } = req.body;

    const response = await sendMessage(messages, null, conversationId, currentFragmentId, visitorId);

    // Save the conversation
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
      addMessage(visitorId, conversationId, 'user', lastUserMessage.content);
    }
    addMessage(visitorId, conversationId, 'assistant', response);

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
app.post('/api/cassandra/message/stream', async (req, res) => {
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
      visitorId
    );

    res.write(`data: [DONE]\n\n`);
    res.end();

    // Save conversation after streaming completes
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
      addMessage(visitorId, conversationId, 'user', lastUserMessage.content);
    }
    addMessage(visitorId, conversationId, 'assistant', fullResponse);
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

    // Close the current episode if it exists
    if (currentConversationId) {
      try {
        const currentConv = loadConversation(visitorId, currentConversationId);
        if (currentConv && currentConv.messages && currentConv.messages.length > 0) {
          closeEpisode(visitorId, currentConversationId, 'User started new episode');
          console.log(`📝 Closed episode ${currentConversationId} with ${currentConv.messages.length} messages`);
        }
      } catch (error) {
        console.error('Error closing current episode:', error);
      }
    }

    const conversation = createNewConversation(visitorId);
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
app.post('/api/cassandra/visitor/name', (req, res) => {
  try {
    const { visitorId, name } = req.body;
    if (!visitorId || !name) {
      return res.status(400).json({ error: 'visitorId and name required' });
    }
    const profile = setVisitorName(visitorId, name);
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Error setting visitor name:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get current state
 */
app.get('/api/cassandra/state', (req, res) => {
  try {
    const state = loadState();
    res.json(state);
  } catch (error) {
    console.error('Error loading state:', error);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

/**
 * Get conversation history (list of dates) for a visitor
 */
app.get('/api/cassandra/history', (req, res) => {
  const visitorId = extractVisitorId(req, res);
  if (!visitorId) return;

  try {
    const dates = listConversationDates(visitorId);
    res.json({ dates });
  } catch (error) {
    console.error('Error loading history:', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

/**
 * Get a specific conversation by ID for a visitor
 */
app.get('/api/cassandra/conversation/:conversationId', (req, res) => {
  const visitorId = extractVisitorId(req, res);
  if (!visitorId) return;

  try {
    const { conversationId } = req.params;
    const conversation = loadConversation(visitorId, conversationId);
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
    const recentSummaries = getRecentSummaries(3);
    const newState = await generateStartOfDaySummary(recentSummaries);
    updateStateForNewDay(newState);
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
    const visitorIds = listVisitorIdsWithConversations();

    // Per-visitor summaries
    for (const visitorId of visitorIds) {
      const visitorMessages = getAllMessagesForDate(visitorId, today);
      if (visitorMessages.length === 0) continue;
      const profile = loadVisitorProfile(visitorId);
      const visitorSummary = await generateVisitorSummary(visitorMessages, profile);
      updateVisitorFromSummary(visitorId, visitorSummary);
    }

    // Global summary
    const allMessages = [];
    for (const visitorId of visitorIds) {
      allMessages.push(...getAllMessagesForDate(visitorId, today));
    }

    if (allMessages.length === 0) {
      return res.json({ success: false, message: 'No conversation today' });
    }

    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const summary = await generateEndOfDaySummary(allMessages);
    saveDaySummary(today, summary);

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error generating end-of-day summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

/**
 * Generate a creative reflection fragment (admin endpoint)
 * Cassandra writes from her own voice, shaped by recent conversations.
 * Output is saved to cassandra/state/reflections/YYYY-MM-DD-HH-MM-SS.md for review.
 * Promote to fragments/cassandra/ manually when satisfied.
 */
app.post('/api/cassandra/admin/reflect', requireAdminToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const visitorIds = listVisitorIdsWithConversations();

    // Gather recent messages across all visitors (today + yesterday)
    const allMessages = [];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    for (const visitorId of visitorIds) {
      allMessages.push(...getAllMessagesForDate(visitorId, today));
      allMessages.push(...getAllMessagesForDate(visitorId, yesterday));
    }
    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const state = loadState();

    const reflection = await generateReflection(allMessages, state);

    // Save to staging area
    const reflectionsDir = path.join(__dirname, 'state', 'reflections');
    if (!fs.existsSync(reflectionsDir)) {
      fs.mkdirSync(reflectionsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('-').substring(0, 19);
    const filename = `${timestamp}.md`;
    const filepath = path.join(reflectionsDir, filename);
    fs.writeFileSync(filepath, `# Cassandra Reflects\n\n**Generated:** ${new Date().toISOString()}\n**Date:** ${today}\n\n---\n\n${reflection}\n`);

    console.log(`\n✨ Cassandra's reflection saved: ${filename}`);
    res.json({ success: true, filename, reflection });
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
    const reflectionsDir = path.join(__dirname, 'state', 'reflections');

    if (!fs.existsSync(reflectionsDir)) {
      return res.json({ reflections: [] });
    }

    const files = fs.readdirSync(reflectionsDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();

    const reflections = files.map(f => {
      const content = fs.readFileSync(path.join(reflectionsDir, f), 'utf-8');
      return { filename: f, preview: content.substring(0, 300) };
    });

    res.json({ reflections });
  } catch (error) {
    console.error('Error listing reflections:', error);
    res.status(500).json({ error: 'Failed to list reflections' });
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
  console.log(`\nMake sure VITE_OPENAI_API_KEY is set in your .env file`);

  // Generate missing summaries at startup (non-blocking)
  generateMissingSummaries();

  // Check for missing summaries every 5 minutes
  setInterval(generateMissingSummaries, 5 * 60 * 1000);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Is another Cassandra server running?`);
    process.exit(1);
  }
  throw err;
});

export default app;
