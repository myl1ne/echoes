/**
 * Parse and validate LLM action output.
 *
 * The LLM returns JSON: { actions: [...], reasoning: "..." }
 * We validate each action and skip unknown types rather than crashing.
 */

const VALID_TYPES = new Set([
  'speak', 'setExpression', 'resetExpression',
  'lookAt', 'setState', 'blush', 'headTilt', 'headTiltReset',
  'registerPerson',
]);

const REQUIRED_PARAMS = {
  speak:          ['text'],
  setExpression:  ['name'],
  lookAt:         ['target'],
  setState:       ['state'],
  registerPerson: ['name'],
};

/**
 * Parse LLM response text → validated action array.
 * Returns fallback idle action on failure.
 */
function parseActions(responseText) {
  let parsed;
  try {
    // Strip any markdown code fences the model might add
    const cleaned = responseText
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn('[parseActions] JSON parse failed:', e.message);
    console.warn('[parseActions] Raw:', responseText.slice(0, 200));
    return _fallback();
  }

  if (!Array.isArray(parsed.actions)) {
    console.warn('[parseActions] No actions array in response.');
    return _fallback();
  }

  const valid = [];
  for (const action of parsed.actions) {
    if (!action || typeof action.type !== 'string') continue;
    if (!VALID_TYPES.has(action.type)) {
      console.warn('[parseActions] Unknown action type:', action.type);
      continue;
    }
    const required = REQUIRED_PARAMS[action.type] ?? [];
    if (required.some(k => !(k in action))) {
      console.warn('[parseActions] Missing params for', action.type, action);
      continue;
    }
    valid.push(action);
  }

  if (valid.length === 0) return _fallback();

  if (parsed.reasoning) {
    console.log('[agent] Reasoning:', parsed.reasoning);
  }

  return valid;
}

function _fallback() {
  return [{ type: 'setState', state: 'idle' }];
}

module.exports = { parseActions };
