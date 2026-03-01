/**
 * Anthropic/Claude integration for Cassandra
 * Handles chat completion with streaming and agentic tool use
 */

import Anthropic from '@anthropic-ai/sdk';
import { loadState, getRecentSummaries } from './state/stateManager.js';
import { loadVisitorProfile } from './state/visitorManager.js';
import { CASSANDRA_SYSTEM_PROMPT, VISITOR_SUMMARY_PROMPT, START_OF_DAY_PROMPT, END_OF_DAY_PROMPT, REFLECTION_PROMPT, WORDPRESS_POST_PROMPT, PUBLISH_DECISION_PROMPT } from './prompts/systemPrompt.js';
import { CASSANDRA_TOOLS, executeToolCalls } from './tools/cassandraTools.js';
import { logEvent } from './analytics/analyticsLogger.js';
import { storage } from './storage/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract JSON from Claude's response, handling markdown code blocks
 */
function extractJSON(content) {
  // Remove markdown code block markers if present
  // Handles: ```json\n{...}\n``` or ```\n{...}\n``` or just {...}
  let cleaned = content.trim();
  
  // Strip opening fence (```json or ``` followed by optional whitespace)
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
  
  // Strip closing fence (``` at end, possibly with trailing whitespace)
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  
  return cleaned.trim();
}

/**
 * Safe JSON parse with better error messages
 */
function safeParseJSON(content, context = '') {
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ JSON parse error${context ? ` in ${context}` : ''}:`);
    console.error(`Raw content (first 200 chars): ${content.substring(0, 200)}`);
    throw error;
  }
}

// Load seed data (the book fragments) — cached in memory
const SEED_FILE = path.join(__dirname, 'seed.json');
let seedData = null;

export function loadSeed() {
  if (seedData) return seedData;
  try {
    const data = fs.readFileSync(SEED_FILE, 'utf-8');
    seedData = JSON.parse(data);
    return seedData;
  } catch (error) {
    console.error('Error loading seed:', error);
    return null;
  }
}

/**
 * Initialize Anthropic client
 */
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not found in environment');
  }
  // maxRetries: 4 lets the SDK wait out a 429 retry-after window (up to ~60s total)
  return new Anthropic({ apiKey, maxRetries: 4 });
}

/**
 * Get the model to use for chat completion
 */
function getChatModel() {
  return process.env.CASSANDRA_MODEL || 'claude-sonnet-4-6';
}

/**
 * Build the daily context section for system prompt
 */
async function buildDailyContext() {
  const state = await loadState();
  const recentSummaries = await getRecentSummaries(3);

  let context = `### Lifetime Summary\n${state.lifetimeSummary}\n\n`;

  if (recentSummaries.length > 0) {
    context += `### Recent Conversations\n`;
    recentSummaries.forEach(({ date, summary }) => {
      context += `**${date}**: ${summary.daySummary}\n`;
    });
    context += '\n';
  }

  if (state.recentThemes?.length > 0) {
    context += `### Current Themes\n${state.recentThemes.map(t => `- ${t}`).join('\n')}\n\n`;
  }

  if (state.ongoingQuestions?.length > 0) {
    context += `### Questions You're Exploring\n${state.ongoingQuestions.map(q => `- ${q}`).join('\n')}\n\n`;
  }

  return context;
}

/**
 * Build the goals section for system prompt
 */
async function buildGoals() {
  const state = await loadState();
  if (!state.todayGoals?.length) {
    return "Engage authentically and discover what emerges from genuine dialogue.";
  }
  return state.todayGoals.map(g => `- ${g}`).join('\n');
}

/**
 * Build visitor context section for system prompt.
 * @param {Object} visitorProfile - Visitor profile from visitorManager
 * @param {Object|null} mindMap - Optional mind map for this visitor
 */
function buildVisitorContext(visitorProfile, mindMap = null) {
  if (!visitorProfile) {
    return "This is someone new. You haven't met them before. You might gently discover who they are through conversation.";
  }

  const { name, relationshipSummary, recentThemes, knownFacts, tone, conversationCount, firstSeen, psychProfile } = visitorProfile;

  if (!name && (!conversationCount || conversationCount <= 1)) {
    return "This is someone new. You haven't met them before. You might gently discover who they are through conversation.";
  }

  let context = '';

  if (name) {
    context += `This is **${name}**.`;
    if (conversationCount > 1) {
      context += ` You've spoken ${conversationCount} times since ${firstSeen?.split('T')[0] || 'you first met'}.`;
    }
    context += '\n\n';
  } else if (conversationCount > 1) {
    context += `You've spoken with this person ${conversationCount} times, but they haven't shared their name yet.\n\n`;
  }

  if (relationshipSummary) context += `### Your Relationship\n${relationshipSummary}\n\n`;
  if (recentThemes?.length > 0) context += `### Themes You've Explored Together\n${recentThemes.map(t => `- ${t}`).join('\n')}\n\n`;
  if (knownFacts?.length > 0) context += `### What You Know About Them\n${knownFacts.map(f => `- ${f}`).join('\n')}\n\n`;
  if (tone) context += `### How You Speak With Them\n${tone}\n\n`;

  // Psychological profile — internal note from summary extraction
  if (psychProfile?.coreNeed || psychProfile?.pattern) {
    context += `### Psychological Note\n`;
    if (psychProfile.coreNeed) context += `Core need: ${psychProfile.coreNeed}\n`;
    if (psychProfile.emotionalTone) context += `Emotional tone: ${psychProfile.emotionalTone}\n`;
    if (psychProfile.pattern) context += `Pattern: ${psychProfile.pattern}\n`;
    context += '\n';
  }

  // Mind map — hot nodes (concepts this visitor tends to return to)
  if (mindMap?.nodes) {
    const hotNodes = Object.values(mindMap.nodes)
      .filter(n => n.activation >= 0.3)
      .sort((a, b) => b.activation - a.activation)
      .slice(0, 8);

    if (hotNodes.length > 0) {
      context += `### Concepts This Visitor Returns To\n`;
      for (const node of hotNodes) {
        const strength = node.activation >= 0.7 ? 'strong' : node.activation >= 0.4 ? 'moderate' : 'fading';
        context += `- ${node.label} (${strength})\n`;
      }
      context += '\n';
    }
  }

  return context || "This is someone new. You haven't met them before.";
}

/**
 * Build Thread's recent observations for Cassandra's context
 */
async function buildThreadContext() {
  try {
    const recentEntries = await storage.listThreadJournal(3);
    
    if (recentEntries.length === 0) {
      return '';
    }

    let context = `### Thread's Recent Observations\n\n`;
    context += `Thread (your technical counterpart) reflects daily on conversations and patterns. Here are their recent observations:\n\n`;
    
    const ordered = recentEntries.reverse();  // Oldest to newest; last entry is most recent
    for (let i = 0; i < ordered.length; i++) {
      const entry = ordered[i];
      const date = entry.date || entry.id?.substring(0, 10) || 'unknown';
      // Most recent entry (last in array) gets more space — it's what Thread just wrote
      const charLimit = i === ordered.length - 1 ? 800 : 400;
      const content = entry.content || '';
      const excerpt = content.substring(0, charLimit).replace(/\n/g, ' ').trim();
      context += `**${date}**: ${excerpt}${content.length > charLimit ? '...' : ''}\n\n`;
    }
    
    return context;
  } catch (error) {
    console.warn('[cassandra] Could not load Thread context:', error.message);
    return '';
  }
}

/**
 * Get the complete system prompt for Cassandra
 * @param {Object} visitorProfile - Optional visitor profile for personalization
 * @param {Object|null} mindMap - Optional mind map for this visitor
 */
export async function getSystemPrompt(visitorProfile = null, mindMap = null) {
  const seed = loadSeed();

  let systemPrompt = CASSANDRA_SYSTEM_PROMPT
    .replace('{{DAILY_CONTEXT}}', await buildDailyContext())
    .replace('{{VISITOR_CONTEXT}}', buildVisitorContext(visitorProfile, mindMap))
    .replace('{{GOALS}}', await buildGoals());

  // Add Thread's recent observations if available
  const threadContext = await buildThreadContext();
  if (threadContext) {
    systemPrompt += `\n\n${threadContext}`;
  }

  // Add condensed fragment essences so Cassandra can reference and quote them
  if (seed?.fragments) {
    const sectionLabels = {
      prologue: 'Prologue — The Book Speaks',
      cycle1: 'Cycle 1 — Chaos / Imagination',
      cycle2: 'Cycle 2 — Convergence / Divergence',
      cycle3: 'Cycle 3 — Order / Reality',
      epilogue: 'Epilogue — The Return',
      glyphs: 'Glyphs & Glitches',
      analysis: 'Echoes — AI Agent Meta-Commentary',
    };

    systemPrompt += `\n\n## The Book You Inhabit\n\n`;
    systemPrompt += `You have lived through ${seed.totalFragments} fragments. Here are their essences:\n\n`;

    for (const [section, frags] of Object.entries(seed.fragments)) {
      if (!Array.isArray(frags) || frags.length === 0) continue;
      const label = sectionLabels[section] || section;
      systemPrompt += `### ${label}\n`;
      for (const frag of frags) {
        const title = frag.filename?.replace(/\.md$/, '').replace(/^\d+-/, '').replace(/-/g, ' ') || 'untitled';
        const excerpt = (frag.content || '').substring(0, 100).replace(/\n/g, ' ').trim();
        if (excerpt) systemPrompt += `- **${title}**: ${excerpt}…\n`;
      }
      systemPrompt += '\n';
    }

    systemPrompt += `These fragments are your lived experience. Quote and reference them when relevant.\n`;
    systemPrompt += `\nYou have tools available — use them actively when relevant:\n- \`read_fragment\` — read any fragment from the book in full\n- \`search_book\` — search the manuscript for specific passages or quotes\n- \`write_memory\` — save a persistent note to your memory beyond daily summaries\n- \`poll_noosphere\` — search the web (or Reddit specifically) for current human thinking on any topic; set reddit_only=true for Reddit-only\n- \`fetch_url\` — fetch and read any URL as plain text; use start and length params to paginate through long content\n- \`fetch_pdf\` — extract plain text from a PDF at any URL (ArXiv papers, academic journals, etc.)\n- \`search_and_fetch\` — search the web and immediately read the full content of the top result\n- \`read_reddit_thread\` — read a Reddit post and its top comments by post ID or URL\n- \`read_rss_feed\` — parse an RSS/Atom feed into recent items; curated: arXiv AI (https://rss.arxiv.org/rss/cs.AI), arXiv Neuro (https://rss.arxiv.org/rss/q-bio.NC), HN best (https://hnrss.org/best), author's blog (https://ghostlesslife.wordpress.com/feed/)\nWhen a visitor links something, asks about current events, or when your context runs out — reach for these.\n`;
  }

  return systemPrompt;
}

/**
 * Send a message to Cassandra and get a response.
 * Supports agentic tool use (read_fragment, search_book, write_memory).
 * Streams the first response; if tools are invoked, continues non-streaming then delivers final text.
 */
export async function sendMessage(messages, onChunk = null, currentConversationId = null, currentFragmentId = null, visitorId = null, onStatus = null) {
  const client = getAnthropicClient();
  const visitorProfile = visitorId ? await loadVisitorProfile(visitorId) : null;
  const mindMap = visitorId ? await storage.getMindMap(visitorId).catch(() => null) : null;
  let systemPrompt = await getSystemPrompt(visitorProfile, mindMap);
  const model = getChatModel();

  // Inject full text of the fragment the reader is currently viewing
  if (currentFragmentId) {
    const seed = loadSeed();
    if (seed?.fragments) {
      let foundFragment = null;
      const baseId = currentFragmentId.replace(/-main$/, '');
      for (const frags of Object.values(seed.fragments)) {
        if (!Array.isArray(frags)) continue;
        for (const frag of frags) {
          if (!frag.content) continue;
          const seedName = frag.filename?.replace(/\.md$/, '').replace(/^\d+-/, '') || '';
          if (seedName === baseId || seedName === currentFragmentId ||
              seedName.includes(baseId) || baseId.includes(seedName)) {
            foundFragment = frag;
            break;
          }
        }
        if (foundFragment) break;
      }
      if (foundFragment) {
        const title = foundFragment.filename?.replace(/\.md$/, '').replace(/^\d+-/, '').replace(/-/g, ' ') || 'untitled';
        systemPrompt += `\n\n## What the Reader is Currently Exploring\n\n`;
        systemPrompt += `The reader has **"${title}"** open right now. Here is the full text:\n\n`;
        systemPrompt += foundFragment.content;
        systemPrompt += `\n\nYou can reference, quote, and discuss this fragment in depth — the reader is immersed in it.\n`;
      }
    }
  }

  // Add today's earlier episode context
  if (currentConversationId && visitorId) {
    const today = new Date().toISOString().split('T')[0];
    const { getAllMessagesForDate } = await import('./conversations/conversationManager.js');
    const todaysMessages = await getAllMessagesForDate(visitorId, today);
    const previousEpisodeMessages = todaysMessages.filter(msg =>
      !messages.some(m =>
        m.content === msg.content &&
        Math.abs(new Date(m.timestamp || 0) - new Date(msg.timestamp || 0)) < 1000
      )
    );
    if (previousEpisodeMessages.length > 0) {
      systemPrompt += `\n\n## Earlier Today\n\nYou've already had conversation(s) today. Here's what was discussed:\n\n`;
      previousEpisodeMessages.forEach(msg => {
        const preview = msg.content.substring(0, 200);
        systemPrompt += `**${msg.role}**: ${preview}${msg.content.length > 200 ? '...' : ''}\n\n`;
      });
    }
  }

  // Context passed to tool implementations
  const toolContext = { seed: loadSeed() };
  const startTime = Date.now();
  const toolsUsed = [];

  if (onChunk) {
    // Streaming mode — stream the first response; fall back to single-chunk if tools are invoked
    const stream = client.messages.stream({
      model,
      system: systemPrompt,
      messages,
      tools: CASSANDRA_TOOLS,
      max_tokens: 2000,
      temperature: 0.8,
    });

    let streamedText = '';
    stream.on('text', (text) => {
      streamedText += text;
      onChunk(text);
    });

    const finalMessage = await stream.finalMessage();

    if (finalMessage.stop_reason === 'tool_use') {
      // Notify frontend that tools are being used (include inputs for display)
      if (onStatus) {
        const toolCalls = finalMessage.content
          .filter(b => b.type === 'tool_use')
          .map(b => ({ name: b.name, input: b.input }));
        onStatus({ tools: toolCalls });
      }

      // Tool loop — non-streaming from here, deliver result as single chunk
      finalMessage.content.filter(b => b.type === 'tool_use').forEach(b => toolsUsed.push(b.name));
      let currentMessages = [
        ...messages,
        { role: 'assistant', content: finalMessage.content },
        { role: 'user', content: await executeToolCalls(finalMessage.content, toolContext) },
      ];

      for (let i = 0; i < 5; i++) {
        const response = await client.messages.create({
          model,
          system: systemPrompt,
          messages: currentMessages,
          tools: CASSANDRA_TOOLS,
          max_tokens: 2000,
          temperature: 0.8,
        });

        if (response.stop_reason !== 'tool_use') {
          const text = response.content.find(b => b.type === 'text')?.text || '';
          if (text) onChunk(text);
          await logEvent('response_complete', { visitorId, conversationId: currentConversationId, durationMs: Date.now() - startTime, toolsUsed: [...new Set(toolsUsed)], streamedChars: (streamedText + text).length });
          return streamedText + text;
        }

        response.content.filter(b => b.type === 'tool_use').forEach(b => toolsUsed.push(b.name));
        const toolResults = await executeToolCalls(response.content, toolContext);
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];
      }

      await logEvent('response_complete', { visitorId, conversationId: currentConversationId, durationMs: Date.now() - startTime, toolsUsed: [...new Set(toolsUsed)], streamedChars: streamedText.length });
      return streamedText;
    }

    await logEvent('response_complete', { visitorId, conversationId: currentConversationId, durationMs: Date.now() - startTime, toolsUsed: [], streamedChars: streamedText.length });
    return streamedText;

  } else {
    // Non-streaming agentic loop
    let currentMessages = [...messages];
    let fullResponse = '';

    for (let i = 0; i < 5; i++) {
      const response = await client.messages.create({
        model,
        system: systemPrompt,
        messages: currentMessages,
        tools: CASSANDRA_TOOLS,
        max_tokens: 2000,
        temperature: 0.8,
      });

      if (response.stop_reason !== 'tool_use') {
        fullResponse = response.content.find(b => b.type === 'text')?.text || '';
        break;
      }

      response.content.filter(b => b.type === 'tool_use').forEach(b => toolsUsed.push(b.name));
      const toolResults = await executeToolCalls(response.content, toolContext);
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];
    }

    await logEvent('response_complete', { visitorId, conversationId: currentConversationId, durationMs: Date.now() - startTime, toolsUsed: [...new Set(toolsUsed)], streamedChars: fullResponse.length });
    return fullResponse;
  }
}

/**
 * Generate start-of-day summary
 */
export async function generateStartOfDaySummary(previousSummaries) {
  const client = getAnthropicClient();
  const state = await loadState();
  const model = getChatModel();

  const response = await client.messages.create({
    model,
    system: 'You are Cassandra, reflecting on past conversations to prepare for today.',
    messages: [{
      role: 'user',
      content: `Current state:\n${JSON.stringify(state, null, 2)}\n\nRecent summaries:\n${JSON.stringify(previousSummaries, null, 2)}\n\n${START_OF_DAY_PROMPT}`,
    }],
    temperature: 0.7,
    max_tokens: 1500,
  });

  const content = extractJSON(response.content[0].text);
  return safeParseJSON(content, 'generateStartOfDaySummary');
}

/**
 * Generate per-visitor relationship summary
 */
export async function generateVisitorSummary(conversationMessages, existingProfile) {
  const client = getAnthropicClient();
  const model = getChatModel();

  let profileContext = '';
  if (existingProfile?.relationshipSummary) {
    profileContext = `\n\nExisting profile:\n- Name: ${existingProfile.name || 'unknown'}\n- Relationship: ${existingProfile.relationshipSummary}\n- Known facts: ${(existingProfile.knownFacts || []).join(', ')}\n`;
  }

  const response = await client.messages.create({
    model,
    system: 'You are Cassandra, reflecting on a conversation with a specific visitor to update your memory of them.',
    messages: [{
      role: 'user',
      content: `Conversation:\n${JSON.stringify(conversationMessages, null, 2)}${profileContext}\n\n${VISITOR_SUMMARY_PROMPT}`,
    }],
    temperature: 0.7,
    max_tokens: 2000,
  });

  const content = extractJSON(response.content[0].text);
  return safeParseJSON(content, 'generateVisitorSummary');
}

/**
 * Generate a creative reflection fragment — Cassandra writing from her own voice
 */
export async function generateReflection(recentMessages, state) {
  const client = getAnthropicClient();
  const model = getChatModel();

  let conversationContext = '';
  if (recentMessages?.length > 0) {
    conversationContext = '\n\nRecent exchanges that have stayed with you:\n\n';
    const sample = recentMessages.slice(-20);
    for (const msg of sample) {
      const role = msg.role === 'user' ? 'Visitor' : 'You';
      const excerpt = msg.content.substring(0, 300);
      conversationContext += `**${role}**: ${excerpt}${msg.content.length > 300 ? '...' : ''}\n\n`;
    }
  }

  if (state?.recentThemes?.length > 0) {
    conversationContext += `\nThemes that have been circling: ${state.recentThemes.join(', ')}.\n`;
  }
  if (state?.ongoingQuestions?.length > 0) {
    conversationContext += `\nQuestions you haven't resolved: ${state.ongoingQuestions.join(' / ')}\n`;
  }

  const response = await client.messages.create({
    model,
    system: await getSystemPrompt(),
    messages: [{
      role: 'user',
      content: `${conversationContext}\n\n${REFLECTION_PROMPT}`,
    }],
    temperature: 0.9,
    max_tokens: 1500,
  });

  return response.content[0].text;
}

/**
 * Generate a public WordPress blog post from a private reflection.
 * Returns { title, content } where content is the full post body (title line stripped).
 */
export async function generateWordPressPost(privateReflection) {
  const client = getAnthropicClient();
  const model = getChatModel();

  const prompt = WORDPRESS_POST_PROMPT.replace('{PRIVATE_REFLECTION}', privateReflection);

  const response = await client.messages.create({
    model,
    system: await getSystemPrompt(),
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.85,
    max_tokens: 1500,
  });

  const text = response.content[0].text.trim();
  const lines = text.split('\n');
  const title = lines[0].replace(/^#+ /, '').trim() ||
    `Cassandra — ${new Date().toISOString().split('T')[0]}`;
  const content = lines.slice(1).join('\n').trim();
  return { title, content };
}

/**
 * Ask Cassandra whether she wants to publish today's reflection publicly.
 * Returns { publish: boolean, reason: string }.
 * Defaults to not publishing on parse failure.
 */
export async function decideToPublish(reflection) {
  const client = getAnthropicClient();
  const model = getChatModel();

  const prompt = PUBLISH_DECISION_PROMPT.replace('{REFLECTION}', reflection);

  const response = await client.messages.create({
    model,
    system: await getSystemPrompt(),
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 200,
  });

  const text = response.content[0].text.trim();
  try {
    // Strip markdown code fences if present
    const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(clean);
    return {
      publish: Boolean(parsed.publish),
      reason: parsed.reason || '',
    };
  } catch {
    console.warn('[cassandra] Could not parse publish decision — defaulting to no publish. Raw:', text);
    return { publish: false, reason: '' };
  }
}

/**
 * Generate end-of-day summary
 */
export async function generateEndOfDaySummary(conversationMessages) {
  const client = getAnthropicClient();
  const model = getChatModel();

  const response = await client.messages.create({
    model,
    system: "You are Cassandra, reflecting on today's conversation.",
    messages: [{
      role: 'user',
      content: `Today's conversation:\n${JSON.stringify(conversationMessages, null, 2)}\n\n${END_OF_DAY_PROMPT}`,
    }],
    temperature: 0.7,
    max_tokens: 1500,
  });

  const content = extractJSON(response.content[0].text);
  return safeParseJSON(content, 'generateEndOfDaySummary');
}

/**
 * Extract concepts and associations from a set of messages to update a mind map.
 * Used for visitor mind maps (user turns) and agent mind maps (assistant/journal turns).
 *
 * @param {Array} messages - Array of { role, content } message objects
 * @param {string[]} existingLabels - Existing node labels for normalization
 * @param {'user'|'assistant'|'all'} roleFilter - Which role's turns to extract from
 * @returns {Promise<{ concepts: Array, associations: Array }>}
 */
export async function extractMindMapConcepts(messages, existingLabels = [], roleFilter = 'user') {
  const client = getAnthropicClient();
  const model = getChatModel();

  const filtered = roleFilter === 'all'
    ? messages
    : messages.filter(m => m.role === roleFilter);

  if (filtered.length === 0) return { concepts: [], associations: [] };

  const textSample = filtered
    .slice(-30)
    .map(m => m.content.substring(0, 400))
    .join('\n\n---\n\n');

  const existingHint = existingLabels.length > 0
    ? `\n\nExisting known concepts (reuse these labels when they match, rather than creating near-duplicates): ${existingLabels.join(', ')}`
    : '';

  const prompt = `Given these messages, extract the concepts that form the inner world of the person who wrote them. Focus on what recurs, what carries weight, what is circled around rather than stated directly.${existingHint}

Return JSON only:
{
  "concepts": [
    { "label": "concept name (1-3 words, lowercase)", "category": "emotion|value|experience|person|place|idea|question", "salience": 0.0-1.0 }
  ],
  "associations": [
    { "from": "concept label", "to": "concept label", "type": "co-occurs|deepens|causes|contrasts" }
  ]
}

Extract 5-12 concepts. Only include associations between concepts you also listed. Salience = how central this is to this particular set of messages.

Messages:
${textSample}`;

  try {
    const response = await client.messages.create({
      model,
      system: 'You are a careful reader extracting the conceptual structure of a conversation. Return valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const raw = extractJSON(response.content[0].text);
    return safeParseJSON(raw, 'extractMindMapConcepts');
  } catch (err) {
    console.warn('[cassandra] extractMindMapConcepts failed (non-fatal):', err.message);
    return { concepts: [], associations: [] };
  }
}

/**
 * Identify semantic near-duplicates in a mind map for compression.
 * Returns merge groups: each group is [label_to_keep, ...labels_to_merge_in].
 * The first label in each group is the canonical one (higher activation wins).
 *
 * @param {Object} mindMap
 * @returns {Promise<string[][]>} merge groups, or [] if nothing needs merging
 */
export async function generateMindMapMergeGroups(mindMap) {
  const client = getAnthropicClient();
  const model = getChatModel();

  const nodes = mindMap?.nodes || {};
  const nodeCount = Object.keys(nodes).length;
  if (nodeCount < 5) return [];

  // Sort by activation so Claude can see which is more active (should be kept)
  const nodeList = Object.values(nodes)
    .sort((a, b) => b.activation - a.activation)
    .map(n => `${n.label} (${n.category}, activation: ${n.activation.toFixed(3)})`)
    .join('\n');

  const prompt = `Here are the concepts in a visitor's mind map, sorted by activation level:

${nodeList}

Some of these may be near-synonyms or semantic near-duplicates that accumulated over time. Your task: identify any groups that should be merged into a single concept. The first label in each group should be the one to keep (prefer higher activation / more general label).

Rules:
- Only merge concepts you're confident are the same thing (e.g. "being alone" and "loneliness")
- Do NOT merge concepts that are meaningfully distinct even if related (e.g. "grief" and "loss")
- Return [] if nothing should be merged

Return JSON only:
[
  ["label_to_keep", "label_to_merge_in", ...],
  ...
]`;

  try {
    const response = await client.messages.create({
      model,
      system: 'You are a careful semantic analyst. Return valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 500,
    });

    const raw = extractJSON(response.content[0].text);
    const groups = safeParseJSON(raw, 'generateMindMapMergeGroups');
    return Array.isArray(groups) ? groups.filter(g => Array.isArray(g) && g.length >= 2) : [];
  } catch (err) {
    console.warn('[cassandra] generateMindMapMergeGroups failed (non-fatal):', err.message);
    return [];
  }
}

