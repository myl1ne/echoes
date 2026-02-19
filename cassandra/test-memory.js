/**
 * Test the memory system to verify:
 * 1. Previous day summaries are loaded
 * 2. Today's episodes are remembered within the day
 */

import { getSystemPrompt } from './cassandraService.js';
import { getAllMessagesForDate } from './conversations/conversationManager.js';

console.log('🧠 Testing Memory System\n');

console.log('=== System Prompt (includes yesterday\'s summary) ===\n');
const prompt = getSystemPrompt();
console.log(prompt);

console.log('\n\n=== Today\'s Messages (all episodes) ===\n');
const today = '2025-12-10';
const messages = getAllMessagesForDate(today);
console.log(`Found ${messages.length} messages across all episodes today:\n`);

messages.forEach((msg, i) => {
  console.log(`${i + 1}. [${msg.role}] ${msg.content.substring(0, 100)}...`);
});
