/**
 * Cassandra API Server
 * Backend server to handle OpenAI API calls for Cassandra chat
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sendMessage } from './cassandraService.js';
import { 
  getCurrentConversation,
  createNewConversation,
  addMessage,
  listConversationDates,
  listTodayConversations,
  loadConversation,
  getAllMessagesForDate,
  closeEpisode
} from './conversations/conversationManager.js';
import { 
  loadState, 
  getRecentSummaries,
  saveDaySummary,
  updateStateForNewDay,
  getMissingSummaryDate 
} from './state/stateManager.js';
import { 
  generateStartOfDaySummary, 
  generateEndOfDaySummary 
} from './cassandraService.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.CASSANDRA_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Get current conversation (most recent or create new)
 * Auto-generates missing summaries from previous days
 */
app.get('/api/cassandra/conversation', async (req, res) => {
  try {
    // Check if yesterday's summary is missing and generate it
    const missingSummaryDate = getMissingSummaryDate();
    if (missingSummaryDate) {
      console.log(`\n📝 Missing summary detected for ${missingSummaryDate}, generating...`);
      try {
        // Get all messages from all conversations on that date
        const allMessages = getAllMessagesForDate(missingSummaryDate);
        if (allMessages.length > 0) {
          const summary = await generateEndOfDaySummary(allMessages);
          saveDaySummary(missingSummaryDate, summary);
          console.log(`✅ Summary generated for ${missingSummaryDate}`);
        } else {
          console.log(`ℹ️  No messages found for ${missingSummaryDate}, skipping summary`);
        }
      } catch (error) {
        console.error(`❌ Error generating summary for ${missingSummaryDate}:`, error.message);
        // Continue anyway - we don't want to block the conversation
      }
    }
    
    const conversation = getCurrentConversation();
    res.json(conversation);
  } catch (error) {
    console.error('Error loading conversation:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

/**
 * Send a message to Cassandra
 */
app.post('/api/cassandra/message', async (req, res) => {
  try {
    const { messages, conversationId } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }
    
    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID required' });
    }
    
    // Get response from Cassandra (pass conversationId for within-day context)
    const response = await sendMessage(messages, null, conversationId);
    
    // Save the conversation
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
      addMessage(conversationId, 'user', lastUserMessage.content);
    }
    addMessage(conversationId, 'assistant', response);
    
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
 * Create a new conversation episode
 * Closes the current episode if provided
 */
app.post('/api/cassandra/new-episode', async (req, res) => {
  try {
    const { currentConversationId } = req.body;
    
    // Close the current episode if it exists
    if (currentConversationId) {
      try {
        const currentConv = loadConversation(currentConversationId);
        if (currentConv && currentConv.messages && currentConv.messages.length > 0) {
          closeEpisode(currentConversationId, 'User started new episode');
          console.log(`📝 Closed episode ${currentConversationId} with ${currentConv.messages.length} messages`);
        }
      } catch (error) {
        console.error('Error closing current episode:', error);
        // Continue anyway - don't block new episode creation
      }
    }
    
    const conversation = createNewConversation();
    console.log(`✨ Created new episode: ${conversation.id}`);
    res.json(conversation);
  } catch (error) {
    console.error('Error creating new conversation:', error);
    res.status(500).json({ error: 'Failed to create new conversation' });
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
 * Get conversation history (list of dates)
 */
app.get('/api/cassandra/history', (req, res) => {
  try {
    const dates = listConversationDates();
    res.json({ dates });
  } catch (error) {
    console.error('Error loading history:', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

/**
 * Get a specific conversation by date
 */
app.get('/api/cassandra/conversation/:date', (req, res) => {
  try {
    const { date } = req.params;
    const conversation = loadConversation(date);
    res.json(conversation);
  } catch (error) {
    console.error('Error loading conversation:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

/**
 * Generate start-of-day summary (admin endpoint)
 */
app.post('/api/cassandra/admin/start-day', async (req, res) => {
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
app.post('/api/cassandra/admin/end-day', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const allMessages = getAllMessagesForDate(today);
    
    if (allMessages.length === 0) {
      return res.json({ success: false, message: 'No conversation today' });
    }
    
    const summary = await generateEndOfDaySummary(allMessages);
    saveDaySummary(today, summary);
    
    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error generating end-of-day summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
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
app.listen(PORT, () => {
  console.log(`\n✨ Cassandra is waiting in her cabin...`);
  console.log(`🌙 API server running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/cassandra/conversation - Get today's conversation (auto-generates missing summaries)`);
  console.log(`  POST /api/cassandra/message - Send a message`);
  console.log(`  GET  /api/cassandra/state - Get current state`);
  console.log(`  GET  /api/cassandra/history - Get conversation history`);
  console.log(`\nMake sure VITE_OPENAI_API_KEY is set in your .env file`);
  console.log(`💡 Missing summaries will be auto-generated when you start a new conversation\n`);
});

export default app;
