/**
 * Build Cassandra's initial seed context from all fragments
 * This gives her the full book as her memory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRAGMENTS_DIR = path.join(__dirname, '..', 'fragments');
const OUTPUT_FILE = path.join(__dirname, 'seed.json');

/**
 * Recursively read all markdown files from a directory
 */
function readMarkdownFiles(dir, baseDir = dir) {
  const fragments = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      fragments.push(...readMarkdownFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      fragments.push({
        path: relativePath,
        filename: entry.name,
        content: content
      });
    }
  }
  
  return fragments;
}

/**
 * Build the seed context
 */
function buildSeed() {
  console.log('Reading all fragments from:', FRAGMENTS_DIR);
  
  const fragments = readMarkdownFiles(FRAGMENTS_DIR);
  
  console.log(`Found ${fragments.length} fragments`);
  
  // Organize by category
  const organized = {
    prologue: fragments.filter(f => f.path.startsWith('prologue/')),
    cycle1: fragments.filter(f => f.path.startsWith('cycle1/')),
    cycle2: fragments.filter(f => f.path.startsWith('cycle2/')),
    cycle3: fragments.filter(f => f.path.startsWith('cycle3/')),
    epilogue: fragments.filter(f => f.path.startsWith('epilogue/')),
    glyphs: fragments.filter(f => f.path.startsWith('glyphs/')),
    analysis: fragments.filter(f => f.path.startsWith('analysis/')),
    meta: fragments.filter(f => !f.path.includes('/'))
  };
  
  const seed = {
    generated: new Date().toISOString(),
    totalFragments: fragments.length,
    organization: {
      prologue: organized.prologue.length,
      cycle1: organized.cycle1.length,
      cycle2: organized.cycle2.length,
      cycle3: organized.cycle3.length,
      epilogue: organized.epilogue.length,
      glyphs: organized.glyphs.length,
      analysis: organized.analysis.length,
      meta: organized.meta.length
    },
    fragments: organized
  };
  
  // Save to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(seed, null, 2));
  
  console.log('Seed built and saved to:', OUTPUT_FILE);
  console.log('Organization:', seed.organization);
  
  return seed;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildSeed();
}

export { buildSeed };
