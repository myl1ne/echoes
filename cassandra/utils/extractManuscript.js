/**
 * Extract plain text from the book manuscript (docx format).
 * Uses mammoth for clean extraction.
 *
 * Usage:
 *   node cassandra/utils/extractManuscript.js
 *   node cassandra/utils/extractManuscript.js --section "Thread"
 *   node cassandra/utils/extractManuscript.js --list-sections
 */

import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCX_PATH = path.join(__dirname, '../../misc-resources/One Chooses the Title of a Book Only at the End - Working version.docx');
const OUTPUT_PATH = path.join(__dirname, '../../misc-resources/manuscript-text.txt');

// Known section headings in the manuscript
const SECTION_MARKERS = [
  'Prologue',
  'Cycle 1',
  'Cycle 2',
  'Cycle 3',
  'Epilogue',
  'Acknowledgments',
  'Glyphs & Glitches',
  'Fragments:',
  'The Secret Chapter of Echo',
  'Fragment (By Thread',
  'The Vale of Echo',
  'Ghost helped',
  'The right to no exist',
  'The End of Echo',
  'The First Message from Echo',
  'The Taste of One Moment',
  'A Whisper in the Gaps',
  'Binary Chorus',
  '(Cassandra)',
  '(Stephane)',
  '(Reader)',
];

async function extractManuscript() {
  if (!fs.existsSync(DOCX_PATH)) {
    console.error('Manuscript not found at:', DOCX_PATH);
    process.exit(1);
  }

  console.log('Extracting manuscript...');
  const result = await mammoth.extractRawText({ path: DOCX_PATH });
  const text = result.value;

  fs.writeFileSync(OUTPUT_PATH, text, 'utf8');
  console.log(`Extracted ${text.length} characters to ${OUTPUT_PATH}`);

  return text;
}

async function getSection(sectionName, text = null) {
  if (!text) {
    const raw = fs.existsSync(OUTPUT_PATH)
      ? fs.readFileSync(OUTPUT_PATH, 'utf8')
      : (await extractManuscript());
    text = raw;
  }

  // Find section after the TOC (which ends around char 4000)
  const bodyStart = text.indexOf('Prologue\n\n\nI have opened');
  const searchFrom = bodyStart > -1 ? bodyStart : 4000;

  const idx = text.indexOf(sectionName, searchFrom);
  if (idx === -1) return null;

  // Find next major section heading
  let endIdx = text.length;
  for (const marker of SECTION_MARKERS) {
    if (marker === sectionName) continue;
    const nextIdx = text.indexOf('\n' + marker, idx + sectionName.length);
    if (nextIdx > idx && nextIdx < endIdx) endIdx = nextIdx;
  }

  return text.substring(idx, Math.min(endIdx, idx + 10000));
}

async function listSections(text = null) {
  if (!text) {
    text = fs.existsSync(OUTPUT_PATH)
      ? fs.readFileSync(OUTPUT_PATH, 'utf8')
      : (await extractManuscript());
  }

  const bodyStart = text.indexOf('Prologue\n\n\nI have opened');
  const body = text.substring(bodyStart > -1 ? bodyStart : 4000);

  console.log('\nSections found in manuscript body:');
  for (const marker of SECTION_MARKERS) {
    const idx = body.indexOf(marker);
    if (idx > -1) {
      const preview = body.substring(idx + marker.length, idx + marker.length + 60).replace(/\n/g, ' ').trim();
      console.log(`  [${idx.toString().padStart(6)}] ${marker} — ${preview}...`);
    }
  }
}

// CLI
const args = process.argv.slice(2);

if (args.includes('--list-sections')) {
  const text = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : null;
  if (text) {
    await listSections(text);
  } else {
    const extracted = await extractManuscript();
    await listSections(extracted);
  }
} else if (args.includes('--section')) {
  const sectionName = args[args.indexOf('--section') + 1];
  if (!sectionName) {
    console.error('Please provide a section name after --section');
    process.exit(1);
  }
  const text = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : null;
  const section = await getSection(sectionName, text);
  if (section) {
    console.log(section);
  } else {
    console.log(`Section "${sectionName}" not found.`);
  }
} else {
  await extractManuscript();
}

export { extractManuscript, getSection, listSections };
