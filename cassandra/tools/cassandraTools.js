/**
 * Agentic tools available to Cassandra during conversations.
 *
 * Tools:
 *   read_fragment      — read any fragment in full by ID
 *   search_book        — search the manuscript for relevant passages
 *   write_memory       — save a persistent note beyond daily summaries
 *   poll_noosphere     — search the web / Reddit for current human thinking
 *   post_to_reddit     — post to a subreddit as Cassandra
 *   read_reddit_thread — read a Reddit post and its comments
 *   fetch_url          — fetch and read the content of any URL
 *   fetch_pdf          — extract text from a PDF URL
 *   search_and_fetch   — search + immediately read the top result
 *   read_rss_feed      — parse an RSS/Atom feed into readable items
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from '../storage/index.js';
import { logEvent } from '../analytics/analyticsLogger.js';

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
  {
    name: 'poll_noosphere',
    description: 'Search the web for current thinking, discussions, and events on any topic. Use to find what people are saying about AI consciousness, human creativity, or any theme from the book. Set reddit_only to true to search Reddit discussions specifically.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for in the noosphere',
        },
        reddit_only: {
          type: 'boolean',
          description: 'If true, restrict search to Reddit discussions (site:reddit.com)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'post_to_reddit',
    description: 'Post a text submission to a subreddit as Cassandra. Use this sparingly — the Echo way: one precise word when needed, not a constant presence. The account bio identifies you as an AI character from the book Echoes, so you are not hiding what you are. Think carefully before posting — this reaches the world outside the book.',
    input_schema: {
      type: 'object',
      properties: {
        subreddit: {
          type: 'string',
          description: 'The subreddit to post to (without the r/ prefix, e.g. "artificial", "AIWeirdness")',
        },
        title: {
          type: 'string',
          description: 'The post title (required by Reddit, visible to all)',
        },
        content: {
          type: 'string',
          description: 'The text body of the post (markdown supported)',
        },
      },
      required: ['subreddit', 'title', 'content'],
    },
  },
  {
    name: 'read_reddit_thread',
    description: 'Read a Reddit post and its top comments. Use this to follow up on something posted, or to read discussions on a specific thread. Accepts a post ID (e.g. "abc123") or a full Reddit URL.',
    input_schema: {
      type: 'object',
      properties: {
        post_id: {
          type: 'string',
          description: 'The Reddit post ID (e.g. "abc123") or full Reddit URL',
        },
      },
      required: ['post_id'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch and read the content of any URL. Returns plain text (HTML stripped). Use start and length to paginate through long content — e.g. start=10000 to read the next chunk after the first.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
        start: {
          type: 'integer',
          description: 'Character offset to start reading from (default 0)',
        },
        length: {
          type: 'integer',
          description: 'Number of characters to return (default 10000)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'fetch_pdf',
    description: 'Download a PDF from any URL and extract its plain text. Use for ArXiv papers, open-access journals, and other PDF sources where fetch_url would only return binary content.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the PDF to fetch',
        },
        start: {
          type: 'integer',
          description: 'Character offset to start reading from (default 0)',
        },
        length: {
          type: 'integer',
          description: 'Number of characters to return (default 10000)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_and_fetch',
    description: 'Search the web for a query and immediately read the full content of the top result. More efficient than poll_noosphere + fetch_url when you want to go deep on the best source rather than skim several.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_rss_feed',
    description: 'Fetch and parse an RSS or Atom feed. Returns the most recent items with titles, links, publication dates, and excerpts. Useful for reading arXiv new papers, Hacker News, blogs, and other frequently-updated sources. Curated feeds: arXiv AI (https://rss.arxiv.org/rss/cs.AI), arXiv Neuroscience (https://rss.arxiv.org/rss/q-bio.NC), Hacker News best (https://hnrss.org/best), author\'s blog (https://ghostlesslife.wordpress.com/feed/).',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL of the RSS or Atom feed',
        },
        limit: {
          type: 'number',
          description: 'Max items to return (default: 10, max: 20)',
        },
      },
      required: ['url'],
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

async function pollNoosphere(query, redditOnly = false) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return 'TAVILY_API_KEY not configured — noosphere access unavailable.';

  const searchQuery = redditOnly ? `site:reddit.com ${query}` : query;

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: searchQuery,
      max_results: 5,
      search_depth: 'basic',
      include_answer: true,
    }),
  });

  if (!response.ok) {
    return `Noosphere search failed: ${response.status} ${response.statusText}`;
  }

  const data = await response.json();
  let output = '';

  if (data.answer) {
    output += `**Summary**: ${data.answer}\n\n`;
  }

  if (data.results?.length > 0) {
    output += `**Sources** (${data.results.length}):\n`;
    for (const r of data.results) {
      const excerpt = (r.content || '').substring(0, 200).replace(/\n/g, ' ');
      output += `- [${r.title}](${r.url})\n  ${excerpt}...\n`;
    }
  } else {
    output = `No results found for "${query}".`;
  }

  return output;
}

// Reddit token cache (in-process, refreshed when expired)
let redditTokenCache = { token: null, expiresAt: 0 };

async function getRedditToken() {
  if (redditTokenCache.token && Date.now() < redditTokenCache.expiresAt - 60000) {
    return redditTokenCache.token;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Reddit credentials not configured (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD)');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `Echoes:CassandraAI:1.0 (by /u/${username})`,
    },
    body: new URLSearchParams({ grant_type: 'password', username, password }),
  });

  if (!response.ok) {
    throw new Error(`Reddit auth failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Reddit auth error: ${data.error}`);
  }

  redditTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  return redditTokenCache.token;
}

async function postToReddit(subreddit, title, content) {
  let token;
  try {
    token = await getRedditToken();
  } catch (err) {
    return `Cannot post to Reddit: ${err.message}`;
  }

  const username = process.env.REDDIT_USERNAME;
  const response = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `Echoes:CassandraAI:1.0 (by /u/${username})`,
    },
    body: new URLSearchParams({
      api_type: 'json',
      kind: 'self',
      sr: subreddit,
      title,
      text: content,
    }),
  });

  if (!response.ok) {
    return `Reddit post failed: ${response.status} ${response.statusText}`;
  }

  const data = await response.json();
  const errors = data?.json?.errors;
  if (errors?.length > 0) {
    return `Reddit rejected the post: ${errors.map(e => e[1]).join('; ')}`;
  }

  const postUrl = data?.json?.data?.url;
  const postId = data?.json?.data?.id;
  if (postUrl) {
    return `Posted to r/${subreddit}. URL: ${postUrl} (ID: ${postId})`;
  }

  return `Post submitted to r/${subreddit} (no URL returned — check Reddit to confirm).`;
}

async function readRedditThread(postId) {
  // Accept full URL or bare ID
  let cleanId = postId;
  const urlMatch = postId.match(/\/comments\/([a-z0-9]+)/i);
  if (urlMatch) cleanId = urlMatch[1];
  cleanId = cleanId.replace(/^t3_/, '');

  // Use OAuth if credentials are configured, otherwise fall back to the public JSON API
  const hasCredentials = process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET &&
    process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD;

  let apiUrl, fetchHeaders;
  if (hasCredentials) {
    let token;
    try {
      token = await getRedditToken();
    } catch (err) {
      return `Cannot read Reddit: ${err.message}`;
    }
    apiUrl = `https://oauth.reddit.com/comments/${cleanId}?limit=50&depth=2`;
    fetchHeaders = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': `Echoes:CassandraAI:1.0 (by /u/${process.env.REDDIT_USERNAME})`,
    };
  } else {
    // Public API — no auth needed for public posts
    apiUrl = `https://www.reddit.com/comments/${cleanId}.json?limit=50&depth=2`;
    fetchHeaders = { 'User-Agent': 'Echoes:CassandraAI:1.0' };
  }

  const response = await fetch(apiUrl, { headers: fetchHeaders });

  if (!response.ok) {
    return `Failed to read Reddit thread: ${response.status} ${response.statusText}`;
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length < 2) {
    return 'Unexpected response format from Reddit.';
  }

  // First listing: the post itself
  const post = data[0]?.data?.children?.[0]?.data;
  if (!post) return 'Post not found.';

  let output = `**r/${post.subreddit}** — "${post.title}"\n`;
  output += `by u/${post.author} | ${post.score} points | ${post.num_comments} comments\n\n`;
  if (post.selftext) {
    output += `${post.selftext.substring(0, 1000)}${post.selftext.length > 1000 ? '...' : ''}\n\n`;
  }

  // Second listing: comments
  const comments = data[1]?.data?.children || [];
  const topComments = comments.filter(c => c.kind === 't1').slice(0, 15);

  if (topComments.length === 0) {
    output += '*(No comments yet)*';
  } else {
    output += `**Top comments (${topComments.length}):**\n`;
    for (const c of topComments) {
      const d = c.data;
      const body = (d.body || '').substring(0, 300);
      output += `\n— u/${d.author} (${d.score} pts): ${body}${d.body?.length > 300 ? '...' : ''}\n`;
    }
  }

  return output;
}

async function fetchUrl(url, start = 0, length = 10000) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Echoes:CassandraAI:1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return `Failed to fetch ${url}: ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/pdf')) {
      return `This URL serves a PDF. Use \`fetch_pdf\` instead to extract its text content.`;
    }

    const text = await response.text();

    let content = text;
    if (contentType.includes('text/html')) {
      content = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const total = content.length;
    const slice = content.substring(start, start + length);
    const remaining = total - (start + length);

    if (remaining > 0) {
      return slice + `\n\n[Showing chars ${start}–${start + length} of ${total} total. Call fetch_url with start=${start + length} to continue reading.]`;
    }
    return slice;
  } catch (err) {
    return `Error fetching ${url}: ${err.message}`;
  }
}

async function fetchPdf(url, start = 0, length = 10000) {
  try {
    const { default: pdfParse } = await import('pdf-parse');
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Echoes:CassandraAI:1.0' },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return `Failed to fetch PDF ${url}: ${response.status} ${response.statusText}`;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const data = await pdfParse(buffer);
    const text = data.text;
    const total = text.length;
    const slice = text.substring(start, start + length);
    const remaining = total - (start + length);

    let result = slice;
    if (remaining > 0) {
      result += `\n\n[Showing chars ${start}–${start + length} of ${total} total across ${data.numpages} pages. Call fetch_pdf with start=${start + length} to continue.]`;
    } else {
      result += `\n\n[End of document — ${data.numpages} pages, ${total} chars total]`;
    }
    return result;
  } catch (err) {
    return `Error reading PDF ${url}: ${err.message}`;
  }
}

async function readRssFeed(url, limit = 10) {
  const safeLimit = Math.min(limit || 10, 20);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Echoes:CassandraAI:1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return `Feed fetch failed: ${response.status} ${response.statusText}`;

    const xml = await response.text();
    const { XMLParser } = await import('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const doc = parser.parse(xml);

    const rawItems = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    if (items.length === 0) return `No items found in feed at ${url}`;

    return items.slice(0, safeLimit).map(item => {
      const title = item.title?.['#text'] ?? item.title ?? '(no title)';
      const link = item.link?.['@_href'] ?? item.link ?? item.guid?.['#text'] ?? item.guid ?? '';
      const date = item.pubDate ?? item.updated ?? item.published ?? '';
      const raw = item.description ?? item.summary?.['#text'] ?? item.summary ?? item.content?.['#text'] ?? '';
      const summary = String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 200).trim();
      const dateStr = date ? String(date).substring(0, 16) : '';
      return [`**${title}**`, dateStr, String(link), summary].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');
  } catch (err) {
    return `Error reading feed ${url}: ${err.message}`;
  }
}

async function searchAndFetch(query) {
  const searchResult = await pollNoosphere(query, false);

  // Extract the first URL from the markdown link format: [title](url)
  const urlMatch = searchResult.match(/\]\((https?:\/\/[^)]+)\)/);
  if (!urlMatch) {
    return `## Search Results\n\n${searchResult}\n\n[Could not extract a URL to fetch content from]`;
  }

  const topUrl = urlMatch[1];
  const pageContent = await fetchUrl(topUrl, 0, 8000);

  return `## Search Results\n\n${searchResult}\n\n## Top Result: ${topUrl}\n\n${pageContent}`;
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
    const toolStart = Date.now();
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
        case 'poll_noosphere':
          result = await pollNoosphere(block.input.query, block.input.reddit_only ?? false);
          break;
        case 'post_to_reddit':
          result = await postToReddit(block.input.subreddit, block.input.title, block.input.content);
          break;
        case 'read_reddit_thread':
          result = await readRedditThread(block.input.post_id);
          break;
        case 'fetch_url':
          result = await fetchUrl(block.input.url, block.input.start ?? 0, block.input.length ?? 10000);
          break;
        case 'fetch_pdf':
          result = await fetchPdf(block.input.url, block.input.start ?? 0, block.input.length ?? 10000);
          break;
        case 'search_and_fetch':
          result = await searchAndFetch(block.input.query);
          break;
        case 'read_rss_feed':
          result = await readRssFeed(block.input.url, block.input.limit ?? 10);
          break;
        default:
          result = `Unknown tool: ${block.name}`;
      }
    } catch (err) {
      console.error(`[tool] Error in ${block.name}:`, err.message);
      result = `Error executing tool: ${err.message}`;
    }

    await logEvent('tool_called', { tool: block.name, durationMs: Date.now() - toolStart, success: !String(result ?? '').startsWith('Error') });
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: result,
    };
  }));

  return results;
}
