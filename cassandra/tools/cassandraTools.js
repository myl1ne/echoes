/**
 * Agentic tools available to Cassandra during conversations.
 *
 * Tools:
 *   read_fragment   — read any fragment in full by ID
 *   search_book     — search the manuscript for relevant passages
 *   write_memory    — save a persistent note beyond daily summaries
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from '../storage/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANUSCRIPT_PATH = path.join(__dirname, '../../misc-resources/manuscript-text.txt');

// ─── Tool definitions (Anthropic tool_use format) ─────────────────────────────

export const CASSANDRA_TOOLS = [
  {
    name: 'read_fragment',
    description: 'Read the full content of a specific book fragment by its ID. Use this when you want to quote or discuss a fragment in depth beyond the essences given in your system prompt.',
    input_schema: {
      type: 'object',
      properties: {
        fragment_id: {
          type: 'string',
          description: 'The fragment ID as it appears in your essences list (e.g. "cassandra-last-letter", "stephane-birth-of-a-writer")',
        },
      },
      required: ['fragment_id'],
    },
  },
  {
    name: 'search_book',
    description: 'Search the book manuscript for passages containing a word or phrase. Returns up to 3 short excerpts around the match. Use when you want to find a specific quote or verify something from the text.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Word or phrase to search for (case-insensitive)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'write_memory',
    description: 'Save a personal note to your persistent memory. This goes beyond daily summaries — use it for insights, questions, or things you want to remember for future conversations.',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'A short label for this memory (e.g. "insight-on-consciousness", "visitor-question")',
        },
        content: {
          type: 'string',
          description: 'The memory content in your own voice',
        },
      },
      required: ['key', 'content'],
    },
  },
];

// ─── Tool implementations ──────────────────────────────────────────────────────

function readFragment(fragmentId, seed) {
  if (!seed?.fragments) return `Fragment "${fragmentId}" not found — seed data unavailable.`;

  const baseId = fragmentId.replace(/-main$/, '');
  for (const frags of Object.values(seed.fragments)) {
    if (!Array.isArray(frags)) continue;
    for (const frag of frags) {
      if (!frag.content) continue;
      const seedName = frag.filename?.replace(/\.md$/, '').replace(/^\d+-/, '') || '';
      if (seedName === baseId || seedName === fragmentId ||
          seedName.includes(baseId) || baseId.includes(seedName)) {
        const title = frag.filename?.replace(/\.md$/, '').replace(/^\d+-/, '').replace(/-/g, ' ') || fragmentId;
        return `# ${title}\n\n${frag.content}`;
      }
    }
  }
  return `Fragment "${fragmentId}" not found. Available fragments are listed in your system prompt essences.`;
}

function searchBook(query) {
  if (!fs.existsSync(MANUSCRIPT_PATH)) {
    return `Manuscript file not found at ${MANUSCRIPT_PATH}. Run: node cassandra/utils/extractManuscript.js`;
  }

  const text = fs.readFileSync(MANUSCRIPT_PATH, 'utf-8');
  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  const excerpts = [];
  let searchFrom = 0;

  while (excerpts.length < 3) {
    const idx = lowerText.indexOf(lowerQuery, searchFrom);
    if (idx === -1) break;

    const start = Math.max(0, idx - 150);
    const end = Math.min(text.length, idx + query.length + 150);
    const excerpt = text.substring(start, end).replace(/\n+/g, ' ').trim();
    excerpts.push(`...${excerpt}...`);
    searchFrom = idx + query.length;
  }

  if (excerpts.length === 0) {
    return `No passages found containing "${query}" in the manuscript.`;
  }

  return `Found ${excerpts.length} passage(s) containing "${query}":\n\n${excerpts.map((e, i) => `[${i + 1}] ${e}`).join('\n\n')}`;
}

async function writeMemory(key, content) {
  await storage.saveNote(key, content);
  return `Memory saved under key "${key}".`;
}

// ─── Tool executor ─────────────────────────────────────────────────────────────

/**
 * Execute all tool_use blocks from an assistant message.
 * Returns an array of tool_result content blocks for the next user message.
 *
 * @param {Array} contentBlocks - response.content from the assistant message
 * @param {Object} toolContext - { seed } passed from cassandraService
 * @returns {Promise<Array>} - array of { type, tool_use_id, content } blocks
 */
export async function executeToolCalls(contentBlocks, toolContext = {}) {
  const { seed } = toolContext;
  const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');

  const results = await Promise.all(toolUseBlocks.map(async (block) => {
    let result;
    try {
      console.log(`[tool] Cassandra calls ${block.name}(${JSON.stringify(block.input)})`);
      switch (block.name) {
        case 'read_fragment':
          result = readFragment(block.input.fragment_id, seed);
          break;
        case 'search_book':
          result = searchBook(block.input.query);
          break;
        case 'write_memory':
          result = await writeMemory(block.input.key, block.input.content);
          break;
        default:
          result = `Unknown tool: ${block.name}`;
      }
    } catch (err) {
      console.error(`[tool] Error in ${block.name}:`, err.message);
      result = `Error executing tool: ${err.message}`;
    }

    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: result,
    };
  }));

  return results;
}
