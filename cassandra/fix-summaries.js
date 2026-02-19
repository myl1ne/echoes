/**
 * Fix summaries.json to remove conversation-ID-based entries
 * and generate proper date-based summaries
 */

import { getAllMessagesForDate } from './conversations/conversationManager.js';
import { generateEndOfDaySummary } from './cassandraService.js';
import { saveDaySummary } from './state/stateManager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUMMARIES_FILE = path.join(__dirname, 'state', 'summaries.json');

async function fixSummaries() {
  console.log('🔧 Fixing summaries...\n');
  
  // Clear existing summaries
  fs.writeFileSync(SUMMARIES_FILE, '[]');
  console.log('✅ Cleared old summaries\n');
  
  // Generate summary for 2025-12-09
  console.log('📝 Generating summary for 2025-12-09...');
  const messages2025_12_09 = getAllMessagesForDate('2025-12-09');
  if (messages2025_12_09.length > 0) {
    const summary = await generateEndOfDaySummary(messages2025_12_09);
    saveDaySummary('2025-12-09', summary);
    console.log(`✅ Summary for 2025-12-09: ${messages2025_12_09.length} messages\n`);
  }
  
  // Check if we should generate summary for 2025-12-10
  // (only if it's not today)
  const today = new Date().toISOString().split('T')[0];
  if (today !== '2025-12-10') {
    console.log('📝 Generating summary for 2025-12-10...');
    const messages2025_12_10 = getAllMessagesForDate('2025-12-10');
    if (messages2025_12_10.length > 0) {
      const summary = await generateEndOfDaySummary(messages2025_12_10);
      saveDaySummary('2025-12-10', summary);
      console.log(`✅ Summary for 2025-12-10: ${messages2025_12_10.length} messages\n`);
    }
  } else {
    console.log('ℹ️  2025-12-10 is today, skipping summary generation\n');
  }
  
  console.log('✨ Summaries fixed!');
}

fixSummaries().catch(console.error);
