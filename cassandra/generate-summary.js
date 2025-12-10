/**
 * Generate summary for a past conversation
 * Usage: node generate-summary.js [YYYY-MM-DD]
 */

import { loadConversation } from './conversations/conversationManager.js';
import { generateEndOfDaySummary } from './cassandraService.js';
import { saveDaySummary } from './state/stateManager.js';

const date = process.argv[2] || new Date().toISOString().split('T')[0];

console.log(`Generating summary for ${date}...`);

try {
  const conversation = loadConversation(date);
  
  if (!conversation.messages || conversation.messages.length === 0) {
    console.log(`No messages found for ${date}`);
    process.exit(0);
  }
  
  console.log(`Found ${conversation.messages.length} messages`);
  
  const summary = await generateEndOfDaySummary(conversation.messages);
  
  saveDaySummary(date, summary);
  
  console.log('\nSummary generated successfully:');
  console.log(JSON.stringify(summary, null, 2));
  
} catch (error) {
  console.error('Error generating summary:', error);
  process.exit(1);
}
