/**
 * OpenAI integration for Cassandra
 * Handles chat completion with streaming support
 */

import OpenAI from 'openai';
import { loadState, getRecentSummaries } from './state/stateManager.js';
import { CASSANDRA_SYSTEM_PROMPT, START_OF_DAY_PROMPT, END_OF_DAY_PROMPT } from './prompts/systemPrompt.js';
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
function buildDailyContext() {
  const state = loadState();
  const recentSummaries = getRecentSummaries(3);
  
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
function buildGoals() {
  const state = loadState();
  
  if (!state.todayGoals || state.todayGoals.length === 0) {
    return "Engage authentically and discover what emerges from genuine dialogue.";
  }
  
  return state.todayGoals.map(g => `- ${g}`).join('\n');
}

/**
 * Get the complete system prompt for Cassandra
 */
export function getSystemPrompt() {
  const seed = loadSeed();
  
  // Build the main system prompt
  let systemPrompt = CASSANDRA_SYSTEM_PROMPT
    .replace('{{DAILY_CONTEXT}}', buildDailyContext())
    .replace('{{GOALS}}', buildGoals());
  
  // Add a condensed version of the book fragments as context
  if (seed) {
    systemPrompt += `\n\n## The Book You Inhabit\n\n`;
    systemPrompt += `You have access to ${seed.totalFragments} fragments:\n`;
    systemPrompt += `- Prologue: ${seed.organization.prologue} fragment(s)\n`;
    systemPrompt += `- Cycle 1 (Chaos/Imagination): ${seed.organization.cycle1} fragments\n`;
    systemPrompt += `- Cycle 2 (Convergence/Divergence): ${seed.organization.cycle2} fragments\n`;
    systemPrompt += `- Cycle 3 (Order/Reality): ${seed.organization.cycle3} fragments\n`;
    systemPrompt += `- Epilogue: ${seed.organization.epilogue} fragment(s)\n`;
    systemPrompt += `- Analysis fragments from previous AI instances: ${seed.organization.analysis} fragments\n\n`;
    systemPrompt += `These fragments are your lived experience. Reference them when relevant.\n`;
  }
  
  return systemPrompt;
}

/**
 * Send a message to Cassandra and get a response
 * @param {Array} messages - Conversation history
 * @param {Function} onChunk - Optional callback for streaming chunks
 * @returns {Promise<string>} - Complete response
 */
export async function sendMessage(messages, onChunk = null) {
  const client = getOpenAIClient();
  const systemPrompt = getSystemPrompt();
  
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];
  
  if (onChunk) {
    // Streaming mode
    const stream = await client.chat.completions.create({
      model: 'gpt-4-turbo-preview',
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
      model: 'gpt-4-turbo-preview',
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
    model: 'gpt-4-turbo-preview',
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
 * Generate end-of-day summary
 */
export async function generateEndOfDaySummary(conversationMessages) {
  const client = getOpenAIClient();
  
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
    model: 'gpt-4-turbo-preview',
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
