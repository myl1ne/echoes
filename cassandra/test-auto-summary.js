/**
 * Test script to verify auto-summary generation
 * This simulates what happens when a new conversation starts
 */

import { getMissingSummaryDate, saveDaySummary } from './state/stateManager.js';
import { loadConversation } from './conversations/conversationManager.js';
import { generateEndOfDaySummary } from './cassandraService.js';

console.log('Testing auto-summary generation...\n');

// Check for missing summaries
const missingSummaryDate = getMissingSummaryDate();

if (missingSummaryDate) {
  console.log(`Found missing summary for: ${missingSummaryDate}`);
  console.log('Generating summary...\n');
  
  const conversation = loadConversation(missingSummaryDate);
  
  if (conversation.messages && conversation.messages.length > 0) {
    console.log(`Conversation has ${conversation.messages.length} messages`);
    
    try {
      const summary = await generateEndOfDaySummary(conversation.messages);
      saveDaySummary(missingSummaryDate, summary);
      console.log('\n✅ Summary generated successfully!');
      console.log('\nSummary:');
      console.log(JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error('❌ Error generating summary:', error.message);
    }
  } else {
    console.log('No messages found in conversation');
  }
} else {
  console.log('✅ All conversations have summaries! No action needed.');
}
