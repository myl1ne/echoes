/**
 * Conversation storage and management
 * Multiple conversations per day supported, scoped by visitor
 * Format: conversations/{visitorId}/YYYY-MM-DD-HH-MM-SS.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateVisitorId } from '../state/visitorManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONVERSATIONS_DIR = path.join(__dirname);

/**
 * Validate conversation ID format to prevent path traversal attacks.
 * IDs must match YYYY-MM-DD-HH-MM-SS format.
 */
function validateConversationId(id) {
  if (!id || typeof id !== 'string' || !/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(id)) {
    throw new Error(`Invalid conversation ID format: ${id}`);
  }
  return id;
}

/**
 * Validate date format (YYYY-MM-DD) for date-based lookups.
 */
function validateDate(date) {
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: ${date}`);
  }
  return date;
}

/**
 * Get visitor-scoped conversations directory
 */
function getVisitorDir(visitorId) {
  validateVisitorId(visitorId);
  return path.join(CONVERSATIONS_DIR, visitorId);
}

/**
 * Ensure visitor conversations directory exists
 */
function ensureVisitorDirectory(visitorId) {
  const dir = getVisitorDir(visitorId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Ensure base conversations directory exists (for legacy compat)
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
 * Get conversation file path (visitor-scoped)
 */
function getConversationPath(visitorId, conversationId) {
  validateConversationId(conversationId);
  const dir = ensureVisitorDirectory(visitorId);
  return path.join(dir, `${conversationId}.json`);
}

/**
 * Load conversation by ID
 */
export function loadConversation(visitorId, conversationId) {
  const filePath = getConversationPath(visitorId, conversationId);

  if (!fs.existsSync(filePath)) {
    return {
      id: conversationId,
      visitorId,
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
      visitorId,
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
export function saveConversation(visitorId, conversation) {
  const filePath = getConversationPath(visitorId, conversation.id);

  const conversationToSave = {
    ...conversation,
    visitorId,
    lastMessageTime: new Date().toISOString()
  };

  fs.writeFileSync(filePath, JSON.stringify(conversationToSave, null, 2));
}

/**
 * Close an episode (mark as completed, optionally add notes)
 */
export function closeEpisode(visitorId, conversationId, notes = null) {
  const conversation = loadConversation(visitorId, conversationId);

  conversation.closed = true;
  conversation.closedAt = new Date().toISOString();
  if (notes) {
    conversation.closingNotes = notes;
  }

  saveConversation(visitorId, conversation);
  return conversation;
}

/**
 * Create a new conversation for a visitor
 */
export function createNewConversation(visitorId) {
  validateVisitorId(visitorId);
  const id = generateConversationId();
  const conversation = {
    id,
    visitorId,
    date: getToday(),
    messages: [],
    startTime: new Date().toISOString(),
    lastMessageTime: null
  };

  saveConversation(visitorId, conversation);
  return conversation;
}

/**
 * Add a message to a conversation
 */
export function addMessage(visitorId, conversationId, role, content) {
  const conversation = loadConversation(visitorId, conversationId);

  conversation.messages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });

  saveConversation(visitorId, conversation);

  return conversation;
}

/**
 * Get the most recent conversation for a visitor (today or create new)
 */
export function getCurrentConversation(visitorId) {
  validateVisitorId(visitorId);
  const conversations = listTodayConversations(visitorId);

  if (conversations.length > 0) {
    return loadConversation(visitorId, conversations[0]);
  }

  return createNewConversation(visitorId);
}

/**
 * List all conversations for a visitor today
 */
export function listTodayConversations(visitorId) {
  validateVisitorId(visitorId);
  const dir = ensureVisitorDirectory(visitorId);
  const today = getToday();

  const files = fs.readdirSync(dir);
  return files
    .filter(f => f.endsWith('.json') && f.startsWith(today))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
}

/**
 * List all conversations for a visitor on a specific date
 */
export function listConversationsForDate(visitorId, date) {
  validateVisitorId(visitorId);
  validateDate(date);
  const dir = ensureVisitorDirectory(visitorId);

  const files = fs.readdirSync(dir);
  return files
    .filter(f => f.endsWith('.json') && f.startsWith(date))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
}

/**
 * List all conversation dates for a visitor
 */
export function listConversationDates(visitorId) {
  validateVisitorId(visitorId);
  const dir = ensureVisitorDirectory(visitorId);

  const files = fs.readdirSync(dir);
  const dates = new Set();

  files
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      const parts = f.replace('.json', '').split('-');
      if (parts.length >= 3) {
        dates.add(`${parts[0]}-${parts[1]}-${parts[2]}`);
      }
    });

  return Array.from(dates).sort().reverse();
}

/**
 * Get all messages from all conversations for a visitor on a given date
 */
export function getAllMessagesForDate(visitorId, date) {
  const conversationIds = listConversationsForDate(visitorId, date);
  const allMessages = [];

  conversationIds.forEach(id => {
    const conversation = loadConversation(visitorId, id);
    if (conversation.messages) {
      allMessages.push(...conversation.messages);
    }
  });

  allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return allMessages;
}

/**
 * Get conversation count for a visitor
 */
export function getConversationCount(visitorId) {
  validateVisitorId(visitorId);
  const dir = ensureVisitorDirectory(visitorId);
  const files = fs.readdirSync(dir);
  return files.filter(f => f.endsWith('.json')).length;
}

/**
 * List all visitor IDs that have conversations
 */
export function listVisitorIdsWithConversations() {
  ensureConversationsDirectory();
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return fs.readdirSync(CONVERSATIONS_DIR)
    .filter(entry => {
      if (!UUID_REGEX.test(entry)) return false;
      const fullPath = path.join(CONVERSATIONS_DIR, entry);
      return fs.statSync(fullPath).isDirectory();
    });
}
