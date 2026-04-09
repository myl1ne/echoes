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
  generateReflection,
  generateWordPressPost,
  decideToPublish,
} from './cassandraService.js';
import { storage } from './storage/index.js';
import { listConversationIds, getSummaries } from './storage/firestoreProvider.js';
import { loadMindMap, saveMindMap, applyDecay, mergeExtractions, CASSANDRA_SELF_ID, THREAD_SELF_ID } from './state/mindMapManager.js';
import { extractMindMapConcepts } from './cassandraService.js';
import { runHeartbeat } from '../thread/heartbeat.js';
import { logEvent } from './analytics/analyticsLogger.js';

// Load environment variables
dotenv.config();

const app = express();
// Cloud Run requires PORT 8080; local dev can use CASSANDRA_PORT or fall back to 3001
const PORT = process.env.PORT || process.env.CASSANDRA_PORT || 3001;

// Trust proxy - Cloud Run uses a single load balancer, so trust only the first hop
// This is more secure than 'true' and satisfies express-rate-limit's requirements
app.set('trust proxy', 1);

// CORS — allow production origin, local dev, and Reddit/Devvit domains
const allowedOrigins = [
  'https://echoes-1272657787.europe-west1.run.app',
  'http://localhost:5173',
  'http://localhost:3001'
];
const allowedOriginPatterns = [/\.reddit\.com$/, /\.devvit\.dev$/];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (same-origin, curl, Devvit server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (allowedOriginPatterns.some(p => p.test(origin))) return callback(null, true);
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
  // trust proxy is set to 1 above; suppress redundant validation warnings from express-rate-limit
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many requests. The cabin needs a moment of quiet.' }
});

// Rate limiting on analytics endpoint — generous, but protected
const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// Serve frontend in production (Cloud Run)
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir));
}

/**
 * Aggregate raw analytics events into a dashboard summary object.
 */
function aggregateEvents(events) {
  const visitorIds = new Set(events.filter(e => e.visitorId).map(e => e.visitorId));
  const typed = (type) => events.filter(e => e.type === type);

  const responseEvents = typed('response_complete');
  const durations = responseEvents.map(e => e.durationMs).filter(Boolean).sort((a, b) => a - b);
  const avgResponseMs = durations.length ? Math.round(durations.reduce((s, x) => s + x, 0) / durations.length) : 0;
  const p95ResponseMs = durations.length ? durations[Math.floor(durations.length * 0.95)] : 0;

  const chatClosed = typed('chat_closed');
  const chatDurations = chatClosed.map(e => e.durationMs).filter(Boolean);
  const avgChatDurationMs = chatDurations.length ? Math.round(chatDurations.reduce((s, x) => s + x, 0) / chatDurations.length) : 0;

  const fragMap = {};
  for (const e of typed('fragment_viewed')) {
    if (!e.fragmentId) continue;
    if (!fragMap[e.fragmentId]) fragMap[e.fragmentId] = { views: 0, totalMs: 0 };
    fragMap[e.fragmentId].views++;
    if (e.durationMs) fragMap[e.fragmentId].totalMs += e.durationMs;
  }
  const topFragments = Object.entries(fragMap)
    .map(([fragmentId, d]) => ({ fragmentId, views: d.views, avgDurationMs: d.views ? Math.round(d.totalMs / d.views) : 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const toolMap = {};
  for (const e of typed('tool_called')) {
    if (!e.tool) continue;
    if (!toolMap[e.tool]) toolMap[e.tool] = { count: 0, totalMs: 0 };
    toolMap[e.tool].count++;
    if (e.durationMs) toolMap[e.tool].totalMs += e.durationMs;
  }
  const toolCalls = {};
  for (const [tool, d] of Object.entries(toolMap)) {
    toolCalls[tool] = { count: d.count, avgDurationMs: d.count ? Math.round(d.totalMs / d.count) : 0 };
  }

  const navMethods = { next: 0, prev: 0, random: 0, direct: 0 };
  for (const e of typed('navigation')) {
    if (e.method && Object.hasOwn(navMethods, e.method)) navMethods[e.method]++;
  }

  return {
    uniqueVisitors: visitorIds.size,
    newVisitors: typed('visitor_new').length,
    returningVisitors: typed('visitor_return').length,
    messagesReceived: typed('message_received').length,
    episodesStarted: typed('episode_started').length,
    namesSubmitted: typed('name_submitted').length,
    chatOpened: typed('chat_opened').length,
    chatClosed: chatClosed.length,
    avgChatDurationMs,
    fragmentsViewed: typed('fragment_viewed').length,
    topFragments,
    toolCalls,
    avgResponseMs,
    p95ResponseMs,
    heartbeats: typed('heartbeat_complete').length,
    audioPlayed: typed('audio_played').length,
    navigationMethods: navMethods,
  };
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
    const existingProfile = await storage.getVisitor(visitorId);
    const today = new Date().toISOString().split('T')[0];
    if (!existingProfile) {
      logEvent('visitor_new', { visitorId });
    } else if (existingProfile.lastSeen && !existingProfile.lastSeen.startsWith(today)) {
      const daysSinceLastSeen = Math.floor((Date.now() - new Date(existingProfile.lastSeen)) / 86400000);
      logEvent('visitor_return', { visitorId, daysSinceLastSeen });
    }

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

  logEvent('message_received', { visitorId, conversationId });

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
    // Give visitors a human-readable message for rate limit errors
    if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after'];
      const waitSecs = retryAfter ? parseInt(retryAfter, 10) : 60;
      const userMessage = `The cabin is quiet for a moment. Please try again in about ${waitSecs} seconds.`;
      res.write(`data: ${JSON.stringify({ error: userMessage, retryAfter: waitSecs })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    }
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
    logEvent('episode_started', { visitorId, conversationId: conversation.id });
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
    logEvent('name_submitted', { visitorId });
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
    logEvent('admin_action', { action: 'start_day' });
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
    logEvent('admin_action', { action: 'end_day' });
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
    // Step 1: generate any missing day summaries
    const missingSummaryDate = await getMissingSummaryDate();
    if (missingSummaryDate) {
      await generateMissingSummaries();
    }

    // Step 2: update global state if stale — always runs, independent of step 1.
    // This is what gives Cassandra her context for the new day.
    const UNINITIALIZED_MARKER = 'I am newly awakened in this conversational form';
    let stateUpdated = false;
    try {
      const state = await loadState();
      const today = new Date().toISOString().split('T')[0];
      const isStale = state.lastUpdated !== today;
      const isInitialState = state.lifetimeSummary?.startsWith(UNINITIALIZED_MARKER);
      if (isStale || isInitialState) {
        const recentSummaries = await getRecentSummaries(3);
        if (recentSummaries.length > 0) {
          const newState = await generateStartOfDaySummary(recentSummaries);
          await updateStateForNewDay(newState);
          stateUpdated = true;
          console.log('[cassandra] Global state updated.');
        }
      } else {
        console.log('[cassandra] Global state already current — skipping.');
      }
    } catch (stateErr) {
      console.error('[cassandra] State update failed (non-fatal):', stateErr.message);
    }

    res.json({ success: true, summarized: missingSummaryDate || null, stateUpdated });
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
    const { text: reflection, messages: reflectionMessages } = await generateReflection(allMessages, state);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('-').substring(0, 19);

    // Ask Cassandra whether she wants to publish today — extending the same
    // conversation context so the decision is made from within the same semantic thread
    let publishDecision = { publish: false, reason: '' };
    try {
      publishDecision = await decideToPublish(reflectionMessages);
      console.log(`✨ Cassandra publish decision: ${publishDecision.publish} — ${publishDecision.reason}`);
    } catch (decideErr) {
      console.warn('Publish decision failed (defaulting to no publish):', decideErr.message);
    }

    // Publish a public blog post to WordPress only if Cassandra chose to
    let wpUrl = null;
    const wpToken = process.env.WORDPRESS_TOKEN;
    const wpSite = process.env.WORDPRESS_SITE || 'ghostlesslife.wordpress.com';
    if (publishDecision.publish && wpToken) {
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
          console.log(`✨ Published to WordPress: ${wpUrl}`);
        } else {
          console.warn(`WordPress publish failed: ${wpRes.status}`);
        }
      } catch (wpErr) {
        console.warn('WordPress publish error (non-fatal):', wpErr.message);
      }
    } else if (!publishDecision.publish) {
      console.log('Cassandra chose not to publish today.');
    }

    await storage.saveReflection(timestamp, reflection, today, wpUrl);
    console.log(`\n✨ Cassandra's reflection saved: ${timestamp}`);

    logEvent('admin_action', { action: 'reflect', wpUrl, published: publishDecision.publish });
    res.json({ success: true, filename: `${timestamp}.md`, reflection, wpUrl, published: publishDecision.publish, publishReason: publishDecision.reason });
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
 * Public reflections feed — no auth required
 */
app.get('/api/cassandra/reflections/public', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    const all = await storage.listReflections();
    res.json({ reflections: all.slice(0, limit) });
  } catch (error) {
    console.error('Error loading public reflections:', error);
    res.status(500).json({ error: 'Failed to load reflections' });
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

// ─── Mind Map endpoints ───────────────────────────────────────────────────────

/**
 * Get the mind map for a specific entity (visitor, cassandra-self, thread-self).
 */
app.get('/api/cassandra/admin/mind-maps/:entityId', requireAdminToken, async (req, res) => {
  try {
    const { entityId } = req.params;
    const mindMap = await loadMindMap(entityId);
    res.json({ mindMap });
  } catch (error) {
    console.error('Error loading mind map:', error);
    res.status(500).json({ error: 'Failed to load mind map' });
  }
});

/**
 * List entity IDs that have mind maps (visitors + the two special agent IDs).
 */
app.get('/api/cassandra/admin/mind-maps', requireAdminToken, async (req, res) => {
  try {
    const visitorIds = await listVisitorIdsWithConversations();
    const profiles = await Promise.all(visitorIds.map(id => loadVisitorProfile(id).catch(() => null)));
    const entities = [
      { id: CASSANDRA_SELF_ID, label: 'Cassandra' },
      { id: THREAD_SELF_ID, label: 'Thread' },
      ...visitorIds.map((id, i) => ({
        id,
        label: profiles[i]?.name || id.substring(0, 8) + '…',
      })),
    ];
    res.json({ entities });
  } catch (error) {
    console.error('Error listing mind map entities:', error);
    res.status(500).json({ error: 'Failed to list mind map entities' });
  }
});

/**
 * Refresh mind maps for all entities from today's conversations.
 * Applies decay then re-extracts concepts — safe to run anytime.
 */
app.post('/api/cassandra/admin/refresh-mind-maps', requireAdminToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const visitorIds = await listVisitorIdsWithConversations();
    const allAssistantMessages = [];
    let updated = 0;

    for (const visitorId of visitorIds) {
      try {
        const messages = await getAllMessagesForDate(visitorId, today);
        if (messages.length === 0) continue;

        const mindMap = await loadMindMap(visitorId);
        applyDecay(mindMap);
        const existingLabels = Object.keys(mindMap.nodes || {});
        const extractions = await extractMindMapConcepts(messages, existingLabels, 'user');
        const updatedMap = mergeExtractions(mindMap, extractions, today);
        await saveMindMap(visitorId, updatedMap);
        allAssistantMessages.push(...messages.filter(m => m.role === 'assistant'));
        updated++;
      } catch (err) {
        console.warn(`[admin] Mind map refresh failed for ${visitorId.substring(0, 8)}… (non-fatal):`, err.message);
      }
    }

    // Cassandra's own mind map from her assistant turns
    if (allAssistantMessages.length > 0) {
      const cassandraMindMap = await loadMindMap(CASSANDRA_SELF_ID);
      applyDecay(cassandraMindMap);
      const existingLabels = Object.keys(cassandraMindMap.nodes || {});
      const extractions = await extractMindMapConcepts(allAssistantMessages, existingLabels, 'all');
      const updatedMap = mergeExtractions(cassandraMindMap, extractions, today);
      await saveMindMap(CASSANDRA_SELF_ID, updatedMap);
    }

    res.json({ success: true, visitorsUpdated: updated, date: today });
  } catch (error) {
    console.error('[admin] Mind map refresh failed:', error);
    res.status(500).json({ error: 'Failed to refresh mind maps', details: error.message });
  }
});

// ─── Thread endpoints ──────────────────────────────────────────────────────────

/**
 * Log a Sunny kiosk exchange directly into a visitor's conversation.
 * Does NOT call the LLM — purely for archiving Sunny's interactions into
 * Cassandra's visitor/episode/summary pipeline.
 */
app.post('/api/cassandra/admin/log-messages', requireAdminToken, async (req, res) => {
  try {
    const { visitorId, conversationId, messages } = req.body;
    if (!visitorId || !conversationId || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'visitorId, conversationId, messages[] required' });
    }
    validateVisitorId(visitorId);
    for (const msg of messages) {
      if (!msg.role || !msg.content) continue;
      await addMessage(visitorId, conversationId, msg.role, msg.content);
    }
    res.json({ success: true, logged: messages.length });
  } catch (error) {
    console.error('Error logging Sunny messages:', error);
    res.status(500).json({ error: error.message });
  }
});

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
 * List Thread's heartbeat logs (admin endpoint)
 */
app.get('/api/thread/heartbeat-logs', requireAdminToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const logs = await storage.listHeartbeatLogs(limit);
    res.json({ logs });
  } catch (error) {
    console.error('[thread] Error listing heartbeat logs:', error);
    res.status(500).json({ error: 'Failed to list heartbeat logs' });
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

// ─── Analytics endpoints ───────────────────────────────────────────────────────

const ALLOWED_CLIENT_EVENTS = ['fragment_viewed', 'chat_opened', 'chat_closed', 'audio_played', 'navigation'];

/**
 * Receive client-side analytics events (public, rate-limited, allowlisted)
 */
app.post('/api/analytics/event', analyticsLimiter, async (req, res) => {
  const { type, visitorId, ...props } = req.body || {};
  if (!type || !ALLOWED_CLIENT_EVENTS.includes(type)) {
    return res.status(400).json({ error: 'unknown event type' });
  }
  await logEvent(type, { visitorId: visitorId || null, ...props });
  res.json({ ok: true });
});

/**
 * Get analytics summary for a date (admin endpoint)
 */
app.get('/api/cassandra/admin/analytics', requireAdminToken, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const events = await storage.queryAnalyticsEvents(date);
    res.json({ date, summary: aggregateEvents(events), eventCount: events.length });
  } catch (error) {
    console.error('Error loading analytics:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
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
