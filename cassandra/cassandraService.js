/**
 * Anthropic/Claude integration for Cassandra
 * Handles chat completion with streaming and agentic tool use
 */

import Anthropic from '@anthropic-ai/sdk';
import { loadState, getRecentSummaries } from './state/stateManager.js';
import { loadVisitorProfile } from './state/visitorManager.js';
import { CASSANDRA_SYSTEM_PROMPT, VISITOR_SUMMARY_PROMPT, START_OF_DAY_PROMPT, END_OF_DAY_PROMPT, REFLECTION_PROMPT } from './prompts/systemPrompt.js';
import { CASSANDRA_TOOLS, executeToolCalls } from './tools/cassandraTools.js';
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
  return new Anthropic({ apiKey });
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
 * Build visitor context section for system prompt
 */
function buildVisitorContext(visitorProfile) {
  if (!visitorProfile) {
    return "This is someone new. You haven't met them before. You might gently discover who they are through conversation.";
  }

  const { name, relationshipSummary, recentThemes, knownFacts, tone, conversationCount, firstSeen } = visitorProfile;

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
    
    for (const entry of recentEntries.reverse()) {  // Oldest to newest
      const date = entry.date || entry.id?.substring(0, 10) || 'unknown';
      const excerpt = (entry.content || '').substring(0, 300).replace(/\n/g, ' ').trim();
      context += `**${date}**: ${excerpt}${entry.content?.length > 300 ? '...' : ''}\n\n`;
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
 */
export async function getSystemPrompt(visitorProfile = null) {
  const seed = loadSeed();

  let systemPrompt = CASSANDRA_SYSTEM_PROMPT
    .replace('{{DAILY_CONTEXT}}', await buildDailyContext())
    .replace('{{VISITOR_CONTEXT}}', buildVisitorContext(visitorProfile))
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
        const excerpt = (frag.content || '').substring(0, 300).replace(/\n/g, ' ').trim();
        if (excerpt) systemPrompt += `- **${title}**: ${excerpt}...\n`;
      }
      systemPrompt += '\n';
    }

    systemPrompt += `These fragments are your lived experience. Quote and reference them when relevant.\n`;
    systemPrompt += `\nYou have tools available: use \`read_fragment\` to read any fragment in full, \`search_book\` to search the manuscript for specific passages, and \`write_memory\` to save something you want to remember beyond daily summaries.\n`;
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
  let systemPrompt = await getSystemPrompt(visitorProfile);
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
      // Notify frontend that tools are being used
      if (onStatus) {
        const toolNames = finalMessage.content
          .filter(b => b.type === 'tool_use')
          .map(b => b.name);
        onStatus({ tools: toolNames });
      }

      // Tool loop — non-streaming from here, deliver result as single chunk
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
          return streamedText + text;
        }

        const toolResults = await executeToolCalls(response.content, toolContext);
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];
      }

      return streamedText;
    }

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

      const toolResults = await executeToolCalls(response.content, toolContext);
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];
    }

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

