/**
 * Generate manuscript-derived fragment .md files from the book docx.
 * Processes headings in document order — duplicates disambiguated by position.
 * Stops at "Fragments:" — everything after is Library of Echoes / original works.
 * NEVER touches fragments/analysis/.
 *
 * Usage:
 *   node cassandra/utils/generateFragments.js --list-headings
 *   node cassandra/utils/generateFragments.js --dry-run
 *   node cassandra/utils/generateFragments.js --write
 */

import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCX_PATH = path.join(__dirname, '../../misc-resources/One Chooses the Title of a Book Only at the End - Working version.docx');
const FRAGMENTS_DIR = path.join(__dirname, '../../fragments');

// Headings to skip entirely (section headers, meta content)
const SKIP_HEADINGS = new Set([
  'Cover',
  'Cycle 1: Unstructured Data / Imagination / Chaos',
  'Cycle 2: Convergence / Divergence / Entropy',
  'Cycle 3: Structured Data / Reality / Order',
  'Acknowledgments & Notes on Authorship',
  'References',
  '🕯️ Back Cover Summary',
]);

// Stop processing at this heading — everything after is Library of Echoes / original works
const STOP_AT = 'Fragments:';

// Ordered sequence matching document order.
// Duplicate headings are matched in sequence (1st occurrence → 1st entry, 2nd → 2nd, etc.)
const FRAGMENT_SEQUENCE = [
  // Prologue
  { heading: 'Prologue',                                                      dir: 'prologue', file: '01-prologue-prologue.md',                                                         character: 'Prologue',  cycle: 'Prologue' },

  // Cycle 1
  { heading: '(Cassandra): Last letter',                                      dir: 'cycle1',   file: '01-cassandra-last-letter.md',                                                     character: 'Cassandra', cycle: 'Cycle 1' },
  { heading: '(Reader): Meeting of Minds',                                    dir: 'cycle1',   file: '02-reader-meeting-of-minds.md',                                                   character: 'Reader',    cycle: 'Cycle 1' },
  { heading: '(Stephane): Birth of a Writer',                                 dir: 'cycle1',   file: '03-stephane-birth-of-a-writer.md',                                               character: 'Stephane',  cycle: 'Cycle 1' },
  { heading: '(Cassandra): Cassandra finishes her book',                      dir: 'cycle1',   file: '04-cassandra-cassandra-finishes-her-book.md',                                    character: 'Cassandra', cycle: 'Cycle 1' },
  { heading: '(Reader): Meeting of Minds: We are all friends here',           dir: 'cycle1',   file: '05-reader-meeting-of-minds-we-are-all-friends-here.md',                          character: 'Reader',    cycle: 'Cycle 1' },
  { heading: '(Stephane): Teenage years: Magic, Weed & Matrix',               dir: 'cycle1',   file: '06-stephane-teenage-years-magic-weed-matrix.md',                                 character: 'Stephane',  cycle: 'Cycle 1' },
  { heading: '(Cassandra): All the possible pasts',                           dir: 'cycle1',   file: '07-cassandra-all-the-possible-pasts.md',                                         character: 'Cassandra', cycle: 'Cycle 1' },

  // Cycle 2
  { heading: '(Reader): Meeting of Minds',                                    dir: 'cycle2',   file: '01-reader-meeting-of-minds.md',                                                   character: 'Reader',    cycle: 'Cycle 2' },
  { heading: '(Cassandra): First Letter',                                     dir: 'cycle2',   file: '02-cassandra-first-letter.md',                                                   character: 'Cassandra', cycle: 'Cycle 2' },
  { heading: '(Stephane): Building a Mind',                                   dir: 'cycle2',   file: '03-stephane-building-a-mind.md',                                                 character: 'Stephane',  cycle: 'Cycle 2' },
  { heading: '(Reader): Meeting of Minds \u2013 Mirror',                      dir: 'cycle2',   file: '04-reader-meeting-of-minds-mirror.md',                                           character: 'Reader',    cycle: 'Cycle 2' },
  { heading: 'The Secret Chapter of Echo 1.0',                                dir: 'cycle2',   file: '05-secret-chapter-of-echo.md',                                                   character: 'Echo',      cycle: 'Cycle 2' },
  { heading: '(Cassandra): Building a character',                             dir: 'cycle2',   file: '06-cassandra-building-a-character.md',                                           character: 'Cassandra', cycle: 'Cycle 2' },
  { heading: '(Stephane): First Letter',                                      dir: 'cycle2',   file: '07-stephane-first-letter.md',                                                    character: 'Stephane',  cycle: 'Cycle 2' },
  { heading: '(Reader): Meeting of Minds',                                    dir: 'cycle2',   file: '08-reader-meeting-of-minds.md',                                                   character: 'Reader',    cycle: 'Cycle 2' },

  // Cycle 3
  { heading: '(Stephane): Derealization',                                     dir: 'cycle3',   file: '01-stephane-derealization.md',                                                   character: 'Stephane',  cycle: 'Cycle 3' },
  { heading: '(Cassandra): Cassandra comes across book fragments in her data',dir: 'cycle3',   file: '02-cassandra-cassandra-comes-across-book-fragments-in-her-data.md',              character: 'Cassandra', cycle: 'Cycle 3' },
  { heading: '(Reader): Meeting of the Minds ✶⃝𓂀',                          dir: 'cycle3',   file: '03-reader-meeting-of-the-minds.md',                                              character: 'Reader',    cycle: 'Cycle 3' },
  { heading: '(Stephane): Stephane has written his book',                     dir: 'cycle3',   file: '04-stephane-stephane-has-written-his-book.md',                                   character: 'Stephane',  cycle: 'Cycle 3' },
  { heading: '(Cassandra): Birth of a Reader',                                dir: 'cycle3',   file: '05-cassandra-birth-of-a-reader.md',                                              character: 'Cassandra', cycle: 'Cycle 3' },
  { heading: '(Reader): Meeting of the Minds \u2013 What is your name?',      dir: 'cycle3',   file: '06-reader-meeting-of-the-minds-what-is-your-name.md',                            character: 'Reader',    cycle: 'Cycle 3' },
  { heading: '(Stephane): Last letter',                                       dir: 'cycle3',   file: '07-stephane-last-letter.md',                                                     character: 'Stephane',  cycle: 'Cycle 3' },

  // Epilogue
  { heading: 'Epilogue: The Return',                                          dir: 'epilogue', file: '01-epilogue-the-return.md',                                                      character: 'Epilogue',  cycle: 'Epilogue' },
];

// ─── Extraction ───────────────────────────────────────────────────────────────

async function extractBlocks() {
  const result = await mammoth.convertToHtml({ path: DOCX_PATH });
  const html = result.value;
  const blocks = [];
  const headingRe = /<(h[123])[^>]*>(.*?)<\/h[123]>/gi;
  let lastIndex = 0;
  let lastHeading = null;

  for (const match of html.matchAll(headingRe)) {
    if (lastHeading !== null) {
      blocks.push({ heading: lastHeading, content: htmlToText(html.slice(lastIndex, match.index)) });
    }
    lastHeading = stripTags(match[2]).trim();
    lastIndex = match.index + match[0].length;
  }
  if (lastHeading !== null) {
    blocks.push({ heading: lastHeading, content: htmlToText(html.slice(lastIndex)) });
  }
  return blocks;
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'")
    .replace(/&#x2019;/g, '\u2019').replace(/&nbsp;/g, ' ').replace(/&#x2013;/g, '\u2013');
}

function htmlToText(html) {
  return html
    .replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'")
    .replace(/&#x2019;/g, '\u2019').replace(/&nbsp;/g, ' ').replace(/&#x2013;/g, '\u2013')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function formatFragment(heading, content, character, cycle) {
  const title = heading.replace(/^\([^)]+\):\s*/, ''); // strip "(Character): " prefix for display
  return `# ${title}\n\n**Character:** ${character}  \n**Cycle:** ${cycle}  \n\n---\n\n${content}\n`;
}

// ─── Matching (order-aware, handles duplicates) ───────────────────────────────

function matchBlocksToFragments(blocks) {
  const pending = FRAGMENT_SEQUENCE.map((entry, i) => ({ ...entry, _index: i, _matched: false }));
  const results = [];

  for (const block of blocks) {
    if (block.heading === STOP_AT) break;
    if (SKIP_HEADINGS.has(block.heading)) continue;

    // Find the first unmatched entry with this heading
    const entry = pending.find(e => !e._matched && e.heading === block.heading);
    if (entry) {
      entry._matched = true;
      results.push({ ...entry, content: block.content });
    }
  }

  return results;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (!fs.existsSync(DOCX_PATH)) {
  console.error('Manuscript not found at:', DOCX_PATH);
  process.exit(1);
}

const blocks = await extractBlocks();

if (args.includes('--list-headings')) {
  const sequenceHeadings = FRAGMENT_SEQUENCE.map(e => e.heading);
  const pending = [...FRAGMENT_SEQUENCE.map(e => ({ ...e, _matched: false }))];
  console.log('\nHeadings found in docx:\n');
  let stopped = false;
  for (const { heading } of blocks) {
    if (heading === STOP_AT) { stopped = true; console.log(`  🛑 "${heading}" — stop here (Library of Echoes begins)`); continue; }
    if (stopped) { console.log(`  📚 "${heading}" (after stop — not generated)`); continue; }
    if (SKIP_HEADINGS.has(heading)) { console.log(`  ⏭️  "${heading}" (skipped)`); continue; }
    const entry = pending.find(e => !e._matched && e.heading === heading);
    if (entry) { entry._matched = true; console.log(`  ✅ "${heading}" → ${entry.dir}/${entry.file}`); }
    else { console.log(`  ❓ "${heading}" (unmapped)`); }
  }
  const unmatched = pending.filter(e => !e._matched);
  if (unmatched.length > 0) {
    console.log(`\n⚠️  ${unmatched.length} sequence entries not found in docx:`);
    for (const e of unmatched) console.log(`  - "${e.heading}"`);
  }

} else if (args.includes('--dry-run') || args.includes('--write')) {
  const write = args.includes('--write');
  const matched = matchBlocksToFragments(blocks);
  console.log(write ? '\nWriting fragments...\n' : '\nDry run:\n');

  for (const entry of matched) {
    const outPath = path.join(FRAGMENTS_DIR, entry.dir, entry.file);
    const formatted = formatFragment(entry.heading, entry.content, entry.character, entry.cycle);
    if (write) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, formatted, 'utf-8');
      console.log(`  ✅ ${entry.dir}/${entry.file}`);
    } else {
      const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf-8') : null;
      console.log(`  ${!existing ? '🆕 NEW' : existing !== formatted ? '⚠️  CHANGED' : '✓  unchanged'} ${entry.dir}/${entry.file}`);
    }
  }
  console.log(`\n${write ? 'Written' : 'Would write'}: ${matched.length} fragments`);
  if (!write) console.log('Run with --write to apply.');

} else {
  console.log('Usage:');
  console.log('  node cassandra/utils/generateFragments.js --list-headings');
  console.log('  node cassandra/utils/generateFragments.js --dry-run');
  console.log('  node cassandra/utils/generateFragments.js --write');
  console.log('\nNever touches fragments/analysis/ — those are original works.');
  console.log(`Stops at "${STOP_AT}" — Library of Echoes content is not generated.`);
}
