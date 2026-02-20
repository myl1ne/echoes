/**
 * Analyze which voice is speaking in each segment of every fragment.
 *
 * The book has four voice labels:
 *   Stephane  — the author/narrator, often future tense "will be"
 *   Cassandra — the AI in the glass cabin, lyrical and philosophical
 *   Reader    — direct address to whoever is reading ("you")
 *   Mixed     — overlapping or unattributable (e.g. narrator linking sentences)
 *   epigraph  — opening quote with attribution (not a speaking voice)
 *
 * Output: misc-resources/voices.json
 *
 * Usage:
 *   node cassandra/utils/analyzeVoices.js               # analyze all fragments
 *   node cassandra/utils/analyzeVoices.js --fragment stephane-birth-of-a-writer
 *   node cassandra/utils/analyzeVoices.js --list        # list detectable fragments
 *   node cassandra/utils/analyzeVoices.js --dry-run     # show segments, no API call
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRAGMENTS_ROOT = path.join(__dirname, '../../fragments');
const OUTPUT_PATH   = path.join(__dirname, '../../public/voices.json');

const FRAGMENT_DIRS = ['prologue', 'cycle1', 'cycle2', 'cycle3', 'epilogue'];

const SYSTEM_PROMPT = `You are analyzing an experimental non-linear book called "One Chooses the Title of a Book Only at the End." The book has three main speaking voices:

- **Stephane**: The author writing about himself in third person, often using the future tense ("Stephane will be...", "He will..."). Sometimes slips into first person ("I will decide..."). Biographical episodes about childhood, adolescence, AI research.
- **Cassandra**: An AI character living in a glass cabin. Lyrical, introspective, philosophical. Speaks directly to the reader ("You wrote to me", "I'm here"). Often poetic, short sentences or fragments.
- **Reader**: The person reading the book addressed as "you" or "Reader". Sometimes the Reader's internal voice appears, or the Reader is spoken to directly by the narrator.
- **Mixed**: Sections where multiple voices interleave (dialogue between characters, narrator transitions).
- **epigraph**: An opening quote with attribution (format: "Quote." — Author). This is not a speaking voice but a textual artifact.

Your task: given a fragment's text, return a JSON array where each element is:
{ "text": "<the segment as it appears>", "voice": "<Stephane|Cassandra|Reader|Mixed|epigraph>" }

Rules:
- Preserve the text exactly as given (do not paraphrase or trim).
- Group consecutive lines/sentences with the same voice together.
- In dialogue passages, assign the voice to the character speaking.
- Narrator linking sentences between dialogue can be Mixed.
- The epigraph is always the first element if present (format: "..." — Author).
- Return only valid JSON, no preamble or explanation.`;

function extractContent(markdown) {
  let content = markdown.replace(/^#\s+.+$/m, '');
  content = content.replace(/\*\*Character:\*\*\s+.+$/gm, '');
  content = content.replace(/\*\*Cycle:\*\*\s+.+$/gm, '');
  content = content.replace(/^---+$/gm, '');
  return content.trim();
}

function deriveId(dir, filename) {
  // e.g. "cycle1/03-stephane-birth-of-a-writer.md" → "stephane-birth-of-a-writer"
  return filename.replace(/^\d+-/, '').replace(/\.md$/, '');
}

function readAllFragments() {
  const fragments = {};
  for (const dir of FRAGMENT_DIRS) {
    const dirPath = path.join(FRAGMENTS_ROOT, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.md'))) {
      const filePath = path.join(dirPath, file);
      const markdown = fs.readFileSync(filePath, 'utf8');
      const id = deriveId(dir, file);
      fragments[id] = {
        path: path.join(dir, file),
        content: extractContent(markdown),
      };
    }
  }
  return fragments;
}

async function analyzeFragment(client, id, content) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Fragment ID: ${id}\n\n---\n${content}\n---\n\nReturn the JSON voice annotation array for this fragment.`,
    }],
  });

  const raw = response.content[0].text.trim();
  // Extract JSON array from response (handles markdown code blocks)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`No JSON array found in Claude response for fragment "${id}".\nRaw:\n${raw.slice(0, 300)}`);
  }
  return JSON.parse(jsonMatch[0]);
}

async function withTimer(label, fn) {
  let secs = 0;
  const timer = setInterval(() => {
    secs++;
    process.stdout.write(`\r  ${label} ... ${secs}s`);
  }, 1000);
  process.stdout.write(`  ${label} ... `);
  try {
    const result = await fn();
    clearInterval(timer);
    return { ok: true, result, secs };
  } catch (err) {
    clearInterval(timer);
    return { ok: false, err, secs };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun  = args.includes('--dry-run');
  const isList    = args.includes('--list');
  const forceAll  = args.includes('--force');
  const fragIdx   = args.indexOf('--fragment');
  const targetId  = fragIdx > -1 ? args[fragIdx + 1] : null;

  const all = readAllFragments();

  if (isList) {
    console.log('\nDetectable fragments:');
    for (const [id, { path: p }] of Object.entries(all)) {
      console.log(`  ${id.padEnd(60)} ${p}`);
    }
    return;
  }

  const toProcess = targetId
    ? (all[targetId] ? { [targetId]: all[targetId] } : (() => { console.error(`Fragment "${targetId}" not found.`); process.exit(1); })())
    : all;

  if (isDryRun) {
    for (const [id, { content }] of Object.entries(toProcess)) {
      console.log(`\n=== ${id} ===`);
      const lines = content.split('\n').filter(l => l.trim());
      lines.forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 80)}${l.length > 80 ? '…' : ''}`));
    }
    return;
  }

  // Load existing results — skip already-analyzed fragments unless --force
  let existing = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); }
    catch { existing = {}; }
  }

  const client = new Anthropic();
  const results = { ...existing };
  const ids = Object.keys(toProcess).filter(id => forceAll || !existing[id]);

  if (ids.length === 0) {
    console.log('\nAll fragments already analyzed. Use --force to reprocess.');
    return;
  }

  const total = Object.keys(toProcess).length;
  const skipped = total - ids.length;
  console.log(`\nAnalyzing ${ids.length} fragment(s) with Claude... (${skipped} already done)\n`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  for (const id of ids) {
    const { content } = toProcess[id];
    const { ok, result, err, secs } = await withTimer(id, () => analyzeFragment(client, id, content));
    if (ok) {
      results[id] = result;
      process.stdout.write(`\r  ${id} ... ${result.length} segments (${secs}s)\n`);
      // Save after each fragment so interruptions don't lose progress
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');
    } else {
      process.stdout.write(`\r  ${id} ... ERROR: ${err.message} (${secs}s)\n`);
    }
  }

  console.log(`\nDone. Results in ${OUTPUT_PATH}`);
}

main();
