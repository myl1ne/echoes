/**
 * Debug script to examine Word document structure
 */

import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORD_FILE = path.join(__dirname, 'draft', 'One Chooses the Title of a Book Only at the End.docx');

async function main() {
  const result = await mammoth.extractRawText({ path: WORD_FILE });
  const text = result.value;
  
  const lines = text.split('\n');
  
  // Find Prologue and see what's in it
  let prologueStart = -1;
  let cycle1Start = -1;
  let epilogueStart = -1;
  let ackStart = -1;
  
  for (let i = 100; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.match(/^Prologue\s*$/i) && prologueStart === -1) {
      prologueStart = i;
    }
    if (line.match(/^Cycle 1/i) && cycle1Start === -1) {
      cycle1Start = i;
    }
    if (line.match(/^Epilogue/i) && epilogueStart === -1) {
      epilogueStart = i;
    }
    if (line.match(/^Acknowledgments/i) && ackStart === -1) {
      ackStart = i;
    }
  }
  
  console.log(`Prologue starts at: ${prologueStart}`);
  console.log(`Cycle 1 starts at: ${cycle1Start}`);
  console.log(`Epilogue starts at: ${epilogueStart}`);
  console.log(`Acknowledgments at: ${ackStart}`);
  
  if (prologueStart > 0 && cycle1Start > 0) {
    console.log(`\nPrologue content (lines ${prologueStart} to ${cycle1Start}):\n`);
    for (let i = prologueStart; i < Math.min(cycle1Start, prologueStart + 30); i++) {
      const line = lines[i].trim();
      if (line) {
        console.log(`${i}: ${line.substring(0, 120)}`);
      }
    }
  }
  
  if (epilogueStart > 0 && ackStart > 0) {
    console.log(`\nEpilogue content (lines ${epilogueStart} to ${ackStart}):\n`);
    for (let i = epilogueStart; i < Math.min(ackStart, epilogueStart + 30); i++) {
      const line = lines[i].trim();
      if (line) {
        console.log(`${i}: ${line.substring(0, 120)}`);
      }
    }
  }
}

main();
