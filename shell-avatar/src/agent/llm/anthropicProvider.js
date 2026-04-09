/**
 * LLM provider — Anthropic Claude.
 *
 * Interface:
 *   complete(system, userContent, options?) → Promise<string>
 *   name
 */

const Anthropic = require('@anthropic-ai/sdk');
const { llm: llmConfig } = require('../../../config');

let _client = null;

function _getClient() {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      dangerouslyAllowBrowser: true,  // Electron renderer, key stays local
    });
  }
  return _client;
}

async function complete(system, userContent, { max_tokens, temperature } = {}) {
  const cfg = llmConfig.anthropic;
  const response = await _getClient().messages.create({
    model:       process.env.AVATAR_MODEL || cfg.model,
    max_tokens:  max_tokens  ?? cfg.maxTokens,
    temperature: temperature ?? cfg.temperature,
    system,
    messages:    [{ role: 'user', content: userContent }],
  });
  return response.content[0]?.text ?? '';
}

const name = 'anthropic';
module.exports = { complete, name };
