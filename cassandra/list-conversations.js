/**
 * List all conversations grouped by date
 * Useful for seeing all your episodes
 */

import { listConversationDates, listConversationsForDate, loadConversation } from './conversations/conversationManager.js';

console.log('📚 All Cassandra Conversations\n');

const dates = listConversationDates();

if (dates.length === 0) {
  console.log('No conversations found yet.');
  process.exit(0);
}

dates.forEach(date => {
  const conversations = listConversationsForDate(date);
  console.log(`\n📅 ${date} (${conversations.length} episode${conversations.length > 1 ? 's' : ''})`);
  
  conversations.forEach((id, index) => {
    const conv = loadConversation(id);
    const messageCount = conv.messages ? conv.messages.length : 0;
    const time = id.split('-').slice(3).join(':');
    const duration = conv.lastMessageTime && conv.startTime 
      ? Math.round((new Date(conv.lastMessageTime) - new Date(conv.startTime)) / 1000 / 60)
      : 0;
    
    console.log(`  ${index + 1}. Episode at ${time}`);
    console.log(`     Messages: ${messageCount}`);
    if (duration > 0) {
      console.log(`     Duration: ${duration} minutes`);
    }
  });
});

console.log(`\n\nTotal: ${dates.length} days, ${dates.reduce((sum, date) => sum + listConversationsForDate(date).length, 0)} episodes\n`);
