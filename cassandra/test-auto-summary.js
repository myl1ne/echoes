/**
 * Test script to verify auto-summary generation
 * This simulates what happens when a new conversation starts
 */

import { getMissingSummaryDate, saveDaySummary } from './state/stateManager.js';
import { getAllMessagesForDate } from './conversations/conversationManager.js';
import { generateEndOfDaySummary } from './cassandraService.js';

console.log('Testing auto-summary generation...\n');

// Check for missing summaries
const missingSummaryDate = getMissingSummaryDate();

if (missingSummaryDate) {
  console.log(`Found missing summary for: ${missingSummaryDate}`);
  console.log('Generating summary...\n');
  
  const allMessages = getAllMessagesForDate(missingSummaryDate);
  
  if (allMessages && allMessages.length > 0) {
    console.log(`All conversations have ${allMessages.length} total messages`);
    
    try {
      const summary = await generateEndOfDaySummary(allMessages);
      saveDaySummary(missingSummaryDate, summary);
      console.log('\n✅ Summary generated successfully!');
      console.log('\nSummary:');
      console.log(JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error('❌ Error generating summary:', error.message);
    }
  } else {
    console.log('No messages found in conversations');
  }
} else {
  console.log('✅ All conversations have summaries! No action needed.');
}
