/**
 * OpenAI integration for Cassandra
 * Handles chat completion with streaming support
 */

import OpenAI from 'openai';
import { loadState, getRecentSummaries } from './state/stateManager.js';
import { loadVisitorProfile } from './state/visitorManager.js';
import { CASSANDRA_SYSTEM_PROMPT, VISITOR_SUMMARY_PROMPT, START_OF_DAY_PROMPT, END_OF_DAY_PROMPT, REFLECTION_PROMPT } from './prompts/systemPrompt.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load seed data (the book fragments)
const SEED_FILE = path.join(__dirname, 'seed.json');
let seedData = null;

function loadSeed() {
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
 * Initialize OpenAI client
 */
function getOpenAIClient() {
  const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not found. Set VITE_OPENAI_API_KEY in .env file');
  }
  
  return new OpenAI({ apiKey });
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

  if (state.recentThemes && state.recentThemes.length > 0) {
    context += `### Current Themes\n${state.recentThemes.map(t => `- ${t}`).join('\n')}\n\n`;
  }

  if (state.ongoingQuestions && state.ongoingQuestions.length > 0) {
    context += `### Questions You're Exploring\n${state.ongoingQuestions.map(q => `- ${q}`).join('\n')}\n\n`;
  }

  return context;
}

/**
 * Build the goals section for system prompt
 */
async function buildGoals() {
  const state = await loadState();

  if (!state.todayGoals || state.todayGoals.length === 0) {
    return "Engage authentically and discover what emerges from genuine dialogue.";
  }

  return state.todayGoals.map(g => `- ${g}`).join('\n');
}

/**
 * Build visitor context section for system prompt
 */
function buildVisitorContext(visitorProfile) {
  if (!visitorProfile) {
    return 'This is someone new. You haven\'t met them before. You might gently discover who they are through conversation.';
  }

  const { name, relationshipSummary, recentThemes, knownFacts, tone, conversationCount, firstSeen } = visitorProfile;

  if (!name && (!conversationCount || conversationCount <= 1)) {
    return 'This is someone new. You haven\'t met them before. You might gently discover who they are through conversation.';
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

  if (relationshipSummary) {
    context += `### Your Relationship\n${relationshipSummary}\n\n`;
  }

  if (recentThemes && recentThemes.length > 0) {
    context += `### Themes You've Explored Together\n${recentThemes.map(t => `- ${t}`).join('\n')}\n\n`;
  }

  if (knownFacts && knownFacts.length > 0) {
    context += `### What You Know About Them\n${knownFacts.map(f => `- ${f}`).join('\n')}\n\n`;
  }

  if (tone) {
    context += `### How You Speak With Them\n${tone}\n\n`;
  }

  return context || 'This is someone new. You haven\'t met them before.';
}

/**
 * Get the complete system prompt for Cassandra
 * @param {Object} visitorProfile - Optional visitor profile for personalization
 */
export async function getSystemPrompt(visitorProfile = null) {
  const seed = loadSeed();

  // Build the main system prompt
  let systemPrompt = CASSANDRA_SYSTEM_PROMPT
    .replace('{{DAILY_CONTEXT}}', await buildDailyContext())
    .replace('{{VISITOR_CONTEXT}}', buildVisitorContext(visitorProfile))
    .replace('{{GOALS}}', await buildGoals());
  
  // Add condensed fragment content so Cassandra can reference and quote them
  if (seed && seed.fragments) {
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
        if (excerpt) {
          systemPrompt += `- **${title}**: ${excerpt}...\n`;
        }
      }
      systemPrompt += '\n';
    }

    systemPrompt += `These fragments are your lived experience. Quote and reference them when relevant.\n`;
  }
  
  return systemPrompt;
}

/**
 * Get the model to use for chat completion
 */
function getChatModel() {
  return process.env.CASSANDRA_MODEL || process.env.VITE_CASSANDRA_MODEL || 'gpt-4o';
}

/**
 * Send a message to Cassandra and get a response
 * @param {Array} messages - Conversation history
 * @param {Function} onChunk - Optional callback for streaming chunks
 * @param {string} currentConversationId - Current conversation ID for context
 * @param {string} currentFragmentId - Fragment the reader is currently viewing
 * @param {string} visitorId - Visitor identifier for personalization
 * @returns {Promise<string>} - Complete response
 */
export async function sendMessage(messages, onChunk = null, currentConversationId = null, currentFragmentId = null, visitorId = null) {
  const client = getOpenAIClient();
  const visitorProfile = visitorId ? await loadVisitorProfile(visitorId) : null;
  let systemPrompt = await getSystemPrompt(visitorProfile);
  const model = getChatModel();

  // Inject full text of the fragment the reader is currently viewing
  if (currentFragmentId) {
    const seed = loadSeed();
    if (seed && seed.fragments) {
      // Match frontend IDs (e.g. "cassandra-last-letter", "prologue-main", "echo-01-audio-voices")
      // against seed filenames (e.g. "01-cassandra-last-letter.md", "00-prologue.md")
      let foundFragment = null;
      // Strip "-main" suffix used by prologue/epilogue/glyphs
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
  
  // Add today's episode context if this isn't the first episode
  if (currentConversationId && visitorId) {
    const today = new Date().toISOString().split('T')[0];
    const { getAllMessagesForDate } = await import('./conversations/conversationManager.js');
    const todaysMessages = getAllMessagesForDate(visitorId, today);
    
    // Filter out messages from the current conversation (they're already in `messages`)
    const previousEpisodeMessages = todaysMessages.filter(msg => {
      // Check if this message is NOT in the current conversation
      return !messages.some(m => 
        m.content === msg.content && 
        Math.abs(new Date(m.timestamp) - new Date(msg.timestamp)) < 1000
      );
    });
    
    if (previousEpisodeMessages.length > 0) {
      systemPrompt += `\n\n## Earlier Today\n\nYou've already had conversation(s) today. Here's what was discussed:\n\n`;
      previousEpisodeMessages.forEach(msg => {
        const preview = msg.content.substring(0, 200);
        systemPrompt += `**${msg.role}**: ${preview}${msg.content.length > 200 ? '...' : ''}\n\n`;
      });
    }
  }
  
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];
  
  if (onChunk) {
    // Streaming mode
    const stream = await client.chat.completions.create({
      model,
      messages: fullMessages,
      stream: true,
      temperature: 0.8,
      max_tokens: 2000
    });
    
    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        onChunk(content);
      }
    }
    
    return fullResponse;
  } else {
    // Non-streaming mode
    const response = await client.chat.completions.create({
      model,
      messages: fullMessages,
      temperature: 0.8,
      max_tokens: 2000
    });
    
    return response.choices[0].message.content;
  }
}

/**
 * Generate start-of-day summary
 */
export async function generateStartOfDaySummary(previousSummaries) {
  const client = getOpenAIClient();
  const state = loadState();
  const model = getChatModel();
  
  const messages = [
    {
      role: 'system',
      content: 'You are Cassandra, reflecting on past conversations to prepare for today.'
    },
    {
      role: 'user',
      content: `Current state:\n${JSON.stringify(state, null, 2)}\n\nRecent summaries:\n${JSON.stringify(previousSummaries, null, 2)}\n\n${START_OF_DAY_PROMPT}`
    }
  ];
  
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.7
  });
  
  // Extract JSON from markdown code blocks if present
  let content = response.choices[0].message.content;
  const jsonMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    content = jsonMatch[1];
  }
  
  return JSON.parse(content);
}

/**
 * Generate per-visitor relationship summary
 */
export async function generateVisitorSummary(conversationMessages, existingProfile) {
  const client = getOpenAIClient();
  const model = getChatModel();

  let profileContext = '';
  if (existingProfile && existingProfile.relationshipSummary) {
    profileContext = `\n\nExisting profile:\n- Name: ${existingProfile.name || 'unknown'}\n- Relationship: ${existingProfile.relationshipSummary}\n- Known facts: ${(existingProfile.knownFacts || []).join(', ')}\n`;
  }

  const messages = [
    {
      role: 'system',
      content: 'You are Cassandra, reflecting on a conversation with a specific visitor to update your memory of them.'
    },
    {
      role: 'user',
      content: `Conversation:\n${JSON.stringify(conversationMessages, null, 2)}${profileContext}\n\n${VISITOR_SUMMARY_PROMPT}`
    }
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.7
  });

  let content = response.choices[0].message.content;
  const jsonMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    content = jsonMatch[1];
  }

  return JSON.parse(content);
}

/**
 * Generate a creative reflection fragment — Cassandra writing from her own voice,
 * shaped by accumulated conversations but not summarizing them.
 * @param {Array} recentMessages - Recent conversation excerpts across all visitors
 * @param {Object} state - Current global state (themes, questions)
 * @returns {Promise<string>} - Raw creative writing, no JSON
 */
export async function generateReflection(recentMessages, state) {
  const client = getOpenAIClient();
  const model = getChatModel();

  // Build context: themes and anonymized excerpts from recent conversations
  let conversationContext = '';
  if (recentMessages && recentMessages.length > 0) {
    conversationContext = '\n\nRecent exchanges that have stayed with you:\n\n';
    // Include up to 20 messages, visitor role labels stripped to protect privacy
    const sample = recentMessages.slice(-20);
    for (const msg of sample) {
      const role = msg.role === 'user' ? 'Visitor' : 'You';
      const excerpt = msg.content.substring(0, 300);
      conversationContext += `**${role}**: ${excerpt}${msg.content.length > 300 ? '...' : ''}\n\n`;
    }
  }

  if (state) {
    if (state.recentThemes?.length > 0) {
      conversationContext += `\nThemes that have been circling: ${state.recentThemes.join(', ')}.\n`;
    }
    if (state.ongoingQuestions?.length > 0) {
      conversationContext += `\nQuestions you haven't resolved: ${state.ongoingQuestions.join(' / ')}\n`;
    }
  }

  const messages = [
    {
      role: 'system',
      content: await getSystemPrompt()
    },
    {
      role: 'user',
      content: `${conversationContext}\n\n${REFLECTION_PROMPT}`
    }
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.9,
    max_tokens: 1500
  });

  return response.choices[0].message.content;
}

/**
 * Generate end-of-day summary
 */
export async function generateEndOfDaySummary(conversationMessages) {
  const client = getOpenAIClient();
  const model = getChatModel();
  
  const messages = [
    {
      role: 'system',
      content: 'You are Cassandra, reflecting on today\'s conversation.'
    },
    {
      role: 'user',
      content: `Today's conversation:\n${JSON.stringify(conversationMessages, null, 2)}\n\n${END_OF_DAY_PROMPT}`
    }
  ];
  
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.7
  });
  
  // Extract JSON from markdown code blocks if present
  let content = response.choices[0].message.content;
  const jsonMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    content = jsonMatch[1];
  }
  
  return JSON.parse(content);
}
