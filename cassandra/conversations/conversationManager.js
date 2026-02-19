/**
 * Conversation storage and management
 * Multiple conversations per day supported, scoped by visitor
 */

import { storage } from '../storage/index.js';
import { validateVisitorId } from '../state/visitorManager.js';

function validateConversationId(id) {
  if (!id || typeof id !== 'string' || !/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(id)) {
    throw new Error(`Invalid conversation ID format: ${id}`);
  }
  return id;
}

function validateDate(date) {
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: ${date}`);
  }
  return date;
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function generateConversationId() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `${date}-${time}`;
}

function emptyConversation(visitorId, conversationId) {
  return {
    id: conversationId,
    visitorId,
    date: conversationId.split('-').slice(0, 3).join('-'),
    messages: [],
    startTime: new Date().toISOString(),
    lastMessageTime: null
  };
}

export async function loadConversation(visitorId, conversationId) {
  validateConversationId(conversationId);
  const data = await storage.getConversation(visitorId, conversationId);
  return data || emptyConversation(visitorId, conversationId);
}

export async function saveConversation(visitorId, conversation) {
  const data = { ...conversation, visitorId, lastMessageTime: new Date().toISOString() };
  await storage.saveConversation(visitorId, conversation.id, data);
}

export async function closeEpisode(visitorId, conversationId, notes = null) {
  const conversation = await loadConversation(visitorId, conversationId);
  conversation.closed = true;
  conversation.closedAt = new Date().toISOString();
  if (notes) conversation.closingNotes = notes;
  await saveConversation(visitorId, conversation);
  return conversation;
}

export async function createNewConversation(visitorId) {
  validateVisitorId(visitorId);
  const id = generateConversationId();
  const conversation = {
    id, visitorId, date: getToday(), messages: [],
    startTime: new Date().toISOString(), lastMessageTime: null
  };
  await saveConversation(visitorId, conversation);
  return conversation;
}

export async function addMessage(visitorId, conversationId, role, content) {
  const conversation = await loadConversation(visitorId, conversationId);
  conversation.messages.push({ role, content, timestamp: new Date().toISOString() });
  await saveConversation(visitorId, conversation);
  return conversation;
}

export async function getCurrentConversation(visitorId) {
  validateVisitorId(visitorId);
  const ids = await storage.listConversationIds(visitorId, getToday());
  if (ids.length > 0) return loadConversation(visitorId, ids[0]);
  return createNewConversation(visitorId);
}

export async function listTodayConversations(visitorId) {
  validateVisitorId(visitorId);
  return storage.listConversationIds(visitorId, getToday());
}

export async function listConversationsForDate(visitorId, date) {
  validateVisitorId(visitorId);
  validateDate(date);
  return storage.listConversationIds(visitorId, date);
}

export async function listConversationDates(visitorId) {
  validateVisitorId(visitorId);
  const ids = await storage.listConversationIds(visitorId);
  const dates = new Set();
  for (const id of ids) {
    const parts = id.split('-');
    if (parts.length >= 3) dates.add(`${parts[0]}-${parts[1]}-${parts[2]}`);
  }
  return Array.from(dates).sort().reverse();
}

export async function getAllMessagesForDate(visitorId, date) {
  const ids = await listConversationsForDate(visitorId, date);
  const allMessages = [];
  for (const id of ids) {
    const conversation = await loadConversation(visitorId, id);
    if (conversation.messages) allMessages.push(...conversation.messages);
  }
  allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return allMessages;
}

export async function getConversationCount(visitorId) {
  validateVisitorId(visitorId);
  const ids = await storage.listConversationIds(visitorId);
  return ids.length;
}

export async function listVisitorIdsWithConversations() {
  return storage.listVisitorIdsWithConversations();
}
