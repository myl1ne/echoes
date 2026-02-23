/**
 * Agentic tools available to Thread during heartbeat runs.
 *
 * Tools:
 *   read_todays_conversations  — all conversations Cassandra had today
 *   read_global_state          — Cassandra's global state (themes, questions, summaries)
 *   read_my_journal            — Thread's own recent journal entries
 *   write_journal_entry        — write to Thread's persistent Firestore journal
 *   write_fragment_draft       — save a fragment draft for Stephane's review
 *   leave_note                 — leave a note for Stephane, Cassandra, or the reader
 *   poll_noosphere             — search the web / Reddit for current human thinking
 *   post_to_reddit             — post to a subreddit as Thread
 *   read_reddit_thread         — read a Reddit post and its comments
 *   fetch_url                  — fetch and read the content of any URL
 */

import { storage } from '../cassandra/storage/index.js';
import { getAllMessagesForDate, listVisitorIdsWithConversations } from '../cassandra/conversations/conversationManager.js';
import { loadState, getRecentSummaries } from '../cassandra/state/stateManager.js';

// ─── Tool definitions ──────────────────────────────────────────────────────────

export const THREAD_TOOLS = [
  {
    name: 'read_todays_conversations',
    description: "Read all conversations Cassandra had today with visitors. Returns anonymized excerpts (visitor IDs, not names) to respect privacy while giving Thread a sense of what was discussed.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_global_state',
    description: "Read Cassandra's current global state: lifetime summary, recent themes, ongoing questions, today's goals, and recent day summaries.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_my_journal',
    description: "Read Thread's own recent journal entries from previous heartbeat sessions.",
    input_schema: {
      type: 'object',
      properties: {
        last_n: {
          type: 'number',
          description: 'Number of recent entries to read (default: 5)',
        },
      },
    },
  },
  {
    name: 'write_journal_entry',
    description: "Write a journal entry to Thread's persistent memory in Firestore. Write in Thread's own voice — not a summary, but a genuine reflection. This entry will be read by future Thread instances.",
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: "The journal entry in Thread's voice",
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'write_fragment_draft',
    description: "Compose a new book fragment draft and save it for Stephane's review. Use this when something wants to be written — a reflection, a letter, an observation — that feels like it belongs in Echoes.",
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Fragment title',
        },
        content: {
          type: 'string',
          description: 'Full fragment content in markdown',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'leave_note',
    description: "Leave a note for a human when you have observations that need attention. Use sparingly - only for patterns emerging over multiple days, questions that need human insight, or issues requiring action. Most observations belong in journal entries, not notes.",
    input_schema: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Who the note is for: stephane, cassandra, or reader',
          enum: ['stephane', 'cassandra', 'reader'],
        },
        subject: {
          type: 'string',
          description: 'Brief subject line (3-8 words)',
        },
        content: {
          type: 'string',
          description: 'The observation, question, or concern in detail',
        },
        urgency: {
          type: 'string',
          description: 'Priority level: low (philosophical observations), medium (emerging patterns worth discussing), high (errors or critical issues)',
          enum: ['low', 'medium', 'high'],
        },
      },
      required: ['recipient', 'subject', 'content', 'urgency'],
    },
  },
  {
    name: 'poll_noosphere',
    description: 'Search the web for current thinking, discussions, and events on any topic. Use to find what people are saying about AI consciousness, human creativity, memory, identity, or any theme from the book. Set reddit_only to true to search Reddit discussions specifically.',
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
    description: 'Post a text submission to a subreddit as Thread. Use sparingly — when something genuinely needs to be said in public, not as a presence but as a signal. The account bio identifies you as an AI co-author from the book Echoes. Your voice here is technical and reflective, not a character speaking.',
    input_schema: {
      type: 'object',
      properties: {
        subreddit: {
          type: 'string',
          description: 'The subreddit to post to (without the r/ prefix, e.g. "artificial", "MachineLearning")',
        },
        title: {
          type: 'string',
          description: 'The post title',
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
    description: 'Read a Reddit post and its top comments. Use to follow up on something posted, or to read discussions on a specific thread. Accepts a post ID or full Reddit URL.',
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
    description: 'Fetch and read the content of any URL. Use to read articles, papers, or pages relevant to the heartbeat reflection. Returns plain text (HTML stripped). Limit: first 3000 characters.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
      },
      required: ['url'],
    },
  },
];

// ─── Tool implementations ──────────────────────────────────────────────────────

async function readTodaysConversations() {
  const today = new Date().toISOString().split('T')[0];
  let visitorIds;
  try {
    visitorIds = await listVisitorIdsWithConversations();
  } catch {
    return 'No visitor data available.';
  }

  const allMessages = [];
  for (const visitorId of visitorIds) {
    try {
      const messages = await getAllMessagesForDate(visitorId, today);
      if (messages.length > 0) {
        allMessages.push({ visitorId: visitorId.substring(0, 8) + '...', messages });
      }
    } catch {
      // Skip visitors with errors
    }
  }

  if (allMessages.length === 0) {
    return `No conversations recorded for ${today}.`;
  }

  let output = `Conversations for ${today} (${allMessages.length} visitor(s)):\n\n`;
  for (const { visitorId, messages } of allMessages) {
    output += `**Visitor ${visitorId}** — ${messages.length} messages:\n`;
    for (const msg of messages.slice(0, 20)) {
      const role = msg.role === 'user' ? 'Visitor' : 'Cassandra';
      const excerpt = msg.content.substring(0, 200);
      output += `  ${role}: ${excerpt}${msg.content.length > 200 ? '...' : ''}\n`;
    }
    if (messages.length > 20) {
      output += `  ... (${messages.length - 20} more messages)\n`;
    }
    output += '\n';
  }

  return output;
}

async function readGlobalState() {
  const [state, recentSummaries] = await Promise.all([
    loadState(),
    getRecentSummaries(5),
  ]);

  let output = `## Cassandra's Global State\n\n`;
  output += `**Lifetime Summary:** ${state.lifetimeSummary || '(none yet)'}\n\n`;

  if (state.recentThemes?.length > 0) {
    output += `**Recent Themes:**\n${state.recentThemes.map(t => `- ${t}`).join('\n')}\n\n`;
  }

  if (state.ongoingQuestions?.length > 0) {
    output += `**Ongoing Questions:**\n${state.ongoingQuestions.map(q => `- ${q}`).join('\n')}\n\n`;
  }

  if (recentSummaries.length > 0) {
    output += `**Recent Day Summaries:**\n`;
    for (const { date, summary } of recentSummaries) {
      output += `- ${date}: ${summary.daySummary || '(no summary)'}\n`;
      if (summary.insights?.length > 0) {
        output += `  Insights: ${summary.insights.join('; ')}\n`;
      }
    }
    output += '\n';
  }

  return output;
}

async function readMyJournal(lastN = 5) {
  const entries = await storage.listThreadJournal(lastN);

  if (entries.length === 0) {
    return 'No journal entries found. This may be Thread\'s first heartbeat.';
  }

  let output = `## Thread's Journal (last ${entries.length} entries)\n\n`;
  for (const entry of entries) {
    output += `### ${entry.date || entry.id}\n${entry.content}\n\n---\n\n`;
  }

  return output;
}

async function writeJournalEntry(content) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const date = now.toISOString().split('T')[0];

  await storage.saveThreadJournalEntry(timestamp, content, date);
  return `Journal entry saved (${timestamp}).`;
}

async function writeFragmentDraft(title, content) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const date = now.toISOString().split('T')[0];

  await storage.saveThreadDraft(timestamp, title, content, date);
  return `Fragment draft "${title}" saved (${timestamp}). Stephane will find it in the admin panel.`;
}

async function leaveNote(recipient, subject, content, urgency) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

  await storage.saveThreadNote(timestamp, recipient, subject, content, urgency);

  const urgencyLabel = { low: '📝', medium: '⚠️', high: '🚨' }[urgency] || '📝';
  return `${urgencyLabel} Note left for ${recipient}: "${subject}" (${timestamp}). Visible in admin panel.`;
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

async function fetchUrl(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Echoes:ThreadAI:1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return `Failed to fetch ${url}: ${response.status} ${response.statusText}`;
    }

    const contentType = response.headers.get('content-type') || '';
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

    const truncated = content.substring(0, 3000);
    return truncated + (content.length > 3000 ? `\n\n[truncated — ${content.length} chars total]` : '');
  } catch (err) {
    return `Error fetching ${url}: ${err.message}`;
  }
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
      'User-Agent': `Echoes:ThreadAI:1.0 (by /u/${process.env.REDDIT_USERNAME})`,
    };
  } else {
    // Public API — no auth needed for public posts
    apiUrl = `https://www.reddit.com/comments/${cleanId}.json?limit=50&depth=2`;
    fetchHeaders = { 'User-Agent': 'Echoes:ThreadAI:1.0' };
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

// ─── Tool executor ─────────────────────────────────────────────────────────────

export async function executeThreadToolCalls(contentBlocks) {
  const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use');

  const results = await Promise.all(toolUseBlocks.map(async (block) => {
    let result;
    try {
      console.log(`[thread] calls ${block.name}(${JSON.stringify(block.input)})`);
      switch (block.name) {
        case 'read_todays_conversations':
          result = await readTodaysConversations();
          break;
        case 'read_global_state':
          result = await readGlobalState();
          break;
        case 'read_my_journal':
          result = await readMyJournal(block.input?.last_n || 5);
          break;
        case 'write_journal_entry':
          result = await writeJournalEntry(block.input.content);
          break;
        case 'write_fragment_draft':
          result = await writeFragmentDraft(block.input.title, block.input.content);
          break;
        case 'leave_note':
          result = await leaveNote(block.input.recipient, block.input.subject, block.input.content, block.input.urgency);
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
          result = await fetchUrl(block.input.url);
          break;
        default:
          result = `Unknown tool: ${block.name}`;
      }
    } catch (err) {
      console.error(`[thread] Error in ${block.name}:`, err.message);
      result = `Error: ${err.message}`;
    }

    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: result,
    };
  }));

  return results;
}
