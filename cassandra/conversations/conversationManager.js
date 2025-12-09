/**
 * Conversation storage and management
 * Each day gets its own conversation file (episode)
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
 * Get conversation file path for a date
 */
function getConversationPath(date) {
  return path.join(CONVERSATIONS_DIR, `${date}.json`);
}

/**
 * Load conversation for a specific date
 */
export function loadConversation(date = getToday()) {
  ensureConversationsDirectory();
  
  const filePath = getConversationPath(date);
  
  if (!fs.existsSync(filePath)) {
    return {
      date,
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
      date,
      messages: [],
      startTime: new Date().toISOString(),
      lastMessageTime: null,
      error: error.message
    };
  }
}

/**
 * Save conversation for a specific date
 */
export function saveConversation(conversation) {
  ensureConversationsDirectory();
  
  const filePath = getConversationPath(conversation.date);
  
  const conversationToSave = {
    ...conversation,
    lastMessageTime: new Date().toISOString()
  };
  
  fs.writeFileSync(filePath, JSON.stringify(conversationToSave, null, 2));
}

/**
 * Add a message to today's conversation
 */
export function addMessage(role, content) {
  const today = getToday();
  const conversation = loadConversation(today);
  
  conversation.messages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });
  
  saveConversation(conversation);
  
  return conversation;
}

/**
 * Get today's conversation
 */
export function getTodayConversation() {
  return loadConversation(getToday());
}

/**
 * List all conversation dates
 */
export function listConversationDates() {
  ensureConversationsDirectory();
  
  const files = fs.readdirSync(CONVERSATIONS_DIR);
  const dates = files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
  
  return dates;
}

/**
 * Get conversation count
 */
export function getConversationCount() {
  return listConversationDates().length;
}
