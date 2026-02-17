/**
 * Conversation storage and management
 * Multiple conversations per day supported
 * Format: YYYY-MM-DD-HH-MM-SS.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONVERSATIONS_DIR = path.join(__dirname, '..', 'conversations');

/**
 * Ensure conversations directory exists
 */
function ensureConversationsDirectory() {
  if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
  }
}

/**
 * Get current date as YYYY-MM-DD
 */
function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate conversation ID (timestamp-based)
 */
function generateConversationId() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `${date}-${time}`;
}

/**
 * Get conversation file path
 */
function getConversationPath(conversationId) {
  return path.join(CONVERSATIONS_DIR, `${conversationId}.json`);
}

/**
 * Load conversation by ID
 */
export function loadConversation(conversationId) {
  ensureConversationsDirectory();
  
  const filePath = getConversationPath(conversationId);
  
  if (!fs.existsSync(filePath)) {
    return {
      id: conversationId,
      date: conversationId.split('-').slice(0, 3).join('-'),
      messages: [],
      startTime: new Date().toISOString(),
      lastMessageTime: null
    };
  }
  
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading conversation:', error);
    return {
      id: conversationId,
      date: conversationId.split('-').slice(0, 3).join('-'),
      messages: [],
      startTime: new Date().toISOString(),
      lastMessageTime: null,
      error: error.message
    };
  }
}

/**
 * Save conversation
 */
export function saveConversation(conversation) {
  ensureConversationsDirectory();
  
  const filePath = getConversationPath(conversation.id);
  
  const conversationToSave = {
    ...conversation,
    lastMessageTime: new Date().toISOString()
  };
  
  fs.writeFileSync(filePath, JSON.stringify(conversationToSave, null, 2));
}

/**
 * Close an episode (mark as completed, optionally add notes)
 */
export function closeEpisode(conversationId, notes = null) {
  const conversation = loadConversation(conversationId);
  
  conversation.closed = true;
  conversation.closedAt = new Date().toISOString();
  if (notes) {
    conversation.closingNotes = notes;
  }
  
  saveConversation(conversation);
  return conversation;
}

/**
 * Create a new conversation
 */
export function createNewConversation() {
  const id = generateConversationId();
  const conversation = {
    id,
    date: getToday(),
    messages: [],
    startTime: new Date().toISOString(),
    lastMessageTime: null
  };
  
  saveConversation(conversation);
  return conversation;
}

/**
 * Add a message to a conversation
 */
export function addMessage(conversationId, role, content) {
  const conversation = loadConversation(conversationId);
  
  conversation.messages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });
  
  saveConversation(conversation);
  
  return conversation;
}

/**
 * Get the most recent conversation (today or create new)
 */
export function getCurrentConversation() {
  const conversations = listTodayConversations();
  
  if (conversations.length > 0) {
    // Return the most recent conversation
    return loadConversation(conversations[0]);
  }
  
  // Create a new conversation
  return createNewConversation();
}

/**
 * List all conversations for today
 */
export function listTodayConversations() {
  ensureConversationsDirectory();
  const today = getToday();
  
  const files = fs.readdirSync(CONVERSATIONS_DIR);
  const todayConversations = files
    .filter(f => f.endsWith('.json') && f.startsWith(today))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse(); // Most recent first
  
  return todayConversations;
}

/**
 * List all conversations for a specific date
 */
export function listConversationsForDate(date) {
  ensureConversationsDirectory();
  
  const files = fs.readdirSync(CONVERSATIONS_DIR);
  const dateConversations = files
    .filter(f => f.endsWith('.json') && f.startsWith(date))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
  
  return dateConversations;
}

/**
 * List all conversation dates
 */
export function listConversationDates() {
  ensureConversationsDirectory();
  
  const files = fs.readdirSync(CONVERSATIONS_DIR);
  const dates = new Set();
  
  files
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      // Extract YYYY-MM-DD from filename
      const parts = f.replace('.json', '').split('-');
      if (parts.length >= 3) {
        dates.add(`${parts[0]}-${parts[1]}-${parts[2]}`);
      }
    });
  
  return Array.from(dates).sort().reverse();
}

/**
 * Get all messages from all conversations on a given date
 */
export function getAllMessagesForDate(date) {
  const conversationIds = listConversationsForDate(date);
  const allMessages = [];
  
  conversationIds.forEach(id => {
    const conversation = loadConversation(id);
    if (conversation.messages) {
      allMessages.push(...conversation.messages);
    }
  });
  
  // Sort by timestamp
  allMessages.sort((a, b) => {
    return new Date(a.timestamp) - new Date(b.timestamp);
  });
  
  return allMessages;
}

/**
 * Get conversation count
 */
export function getConversationCount() {
  ensureConversationsDirectory();
  const files = fs.readdirSync(CONVERSATIONS_DIR);
  return files.filter(f => f.endsWith('.json')).length;
}
