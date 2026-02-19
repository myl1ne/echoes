/**
 * Generate summary for a past conversation day
 * Now supports multiple conversations per day
 * Usage: node generate-summary.js [YYYY-MM-DD]
 */

import { getAllMessagesForDate } from './conversations/conversationManager.js';
import { generateEndOfDaySummary } from './cassandraService.js';
import { saveDaySummary } from './state/stateManager.js';

const date = process.argv[2] || new Date().toISOString().split('T')[0];

console.log(`Generating summary for ${date}...`);

try {
  const allMessages = getAllMessagesForDate(date);
  
  if (!allMessages || allMessages.length === 0) {
    console.log(`No messages found for ${date}`);
    process.exit(0);
  }
  
  console.log(`Found ${allMessages.length} messages across all conversations`);
  
  const summary = await generateEndOfDaySummary(allMessages);
  
  saveDaySummary(date, summary);
  
  console.log('\nSummary generated successfully:');
  console.log(JSON.stringify(summary, null, 2));
  
} catch (error) {
  console.error('Error generating summary:', error);
  process.exit(1);
}
