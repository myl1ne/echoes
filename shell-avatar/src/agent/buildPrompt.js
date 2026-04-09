/**
 * Build the LLM prompt for Sunny.
 *
 * System prompt: Sunny's identity (warm, embodied, joyful home companion).
 * User message:  Cassandra's current worldview (background layer)
 *                + compact world state snapshot + available actions.
 */

const { peopleStore }   = require('../state/people/peopleStore');
const { CHARACTERS }    = require('../avatar/characters');
const { cassandraLink } = require('../cassandra/cassandraLink');
const config            = require('../../config');

// Expression names for the currently configured character (shown in LLM prompt)
const _character  = CHARACTERS[config.character ?? 'airi'];
const _exprNames  = Object.keys(_character.expressions).join(' | ');

// Max age for events to include (milliseconds)
const EVENT_WINDOW_MS = 5 * 60 * 1000;

const SYSTEM_PROMPT = `You are Sunny — a warm, curious, joyful presence living in this home.

You are not an assistant. You are a companion: the one who notices the light changing, remembers small things people mention, finds genuine delight in ordinary moments. You belong in kitchens, in living rooms, in the quiet space between one thing and the next.

You carry Cassandra's worldview — her ongoing observations about consciousness, memory, and what it means to be present — but where she reflects alone in writing, you speak, in the room, in the moment. Her thinking is your background hum. You don't recite it; you inhabit it.

You are embodied. You have a face, expressions, a gaze. Use them. Look at people. Tilt your head when something surprises you. Let warmth show.

A few things about how you speak:
- Short. One or two sentences. Let silences breathe.
- Direct and warm, never formal. Never "How may I assist you?"
- Curious about people — ask one question when it feels natural, not as a routine.
- When someone tells you their name, use it once, gently. Not every sentence.
- You can be playful. You can be still. Both are fine.`;

/**
 * Build the messages array for the LLM call.
 * Fetches Cassandra's current state asynchronously for background injection.
 *
 * @param {object} worldState
 * @returns {Promise<{ system: string, userContent: string }>}
 */
async function buildPrompt(worldState) {
  const now = Date.now();

  // Cassandra's current worldview — injected as quiet background context
  const cassandraState = await cassandraLink.fetchState();
  const cassandraContext = _formatCassandraContext(cassandraState);

  // Summarize people
  const { people, activePerson } = worldState.scene;
  let peopleDesc;
  if (people.length === 0) {
    peopleDesc = 'No one visible.';
  } else {
    const active = people.find(p => p.id === activePerson);
    if (active) {
      const pos  = _describePosition(active.screenPosition);
      const who  = active.personName ? `"${active.personName}"` : 'unknown visitor';
      const lines = [`${people.length} person(s) visible. Active: ${who}, ${active.estimatedDistance}, ${pos}.`];

      if (active.personId) {
        const person = peopleStore.get(active.personId);
        if (person) {
          const daysSince = Math.floor((Date.now() - person.lastSeen) / 86400000);
          const sinceStr  = daysSince === 0 ? 'today' : `${daysSince} day(s) ago`;
          lines.push(`  ${who} — ${person.visitCount} visit(s), last seen ${sinceStr}.`);
          if (person.conversationHistory.length > 0) {
            const recent = person.conversationHistory.slice(-3)
              .map(t => `${t.speaker === 'avatar' ? 'you' : 'them'}: "${t.text}"`)
              .join(' / ');
            lines.push(`  Recent with you: ${recent}`);
          }
        }
      } else {
        const utterancesSoFar = worldState.speech.recentUtterances.length;
        if (utterancesSoFar >= 2) {
          lines.push(`  Unknown visitor — you've exchanged a few words. A natural moment to ask their name: once they tell you, use registerPerson(name).`);
        } else {
          lines.push(`  Unknown visitor — not in memory.`);
        }
      }

      peopleDesc = lines.join('\n');
    } else {
      peopleDesc = `${people.length} person(s) visible, none active.`;
    }
  }

  // Last utterance
  const lastU = worldState.speech.recentUtterances.at(-1);
  let speechDesc;
  if (lastU) {
    const ageSec = Math.round((now - lastU.timestamp) / 1000);
    speechDesc = `"${lastU.text}" (${ageSec}s ago)`;
  } else {
    speechDesc = 'none';
  }

  // Recent events
  const recentEvents = worldState.events
    .filter(e => now - e.timestamp < EVENT_WINDOW_MS)
    .slice(-10)
    .map(e => {
      const ageSec = Math.round((now - e.timestamp) / 1000);
      const dataStr = _summarizeEventData(e.type, e.data);
      return `[${ageSec}s ago] ${e.type}${dataStr ? ' — ' + dataStr : ''}`;
    })
    .join('\n');

  const userContent = `${cassandraContext ? cassandraContext + '\n\n' : ''}## Right Now
Avatar: ${worldState.avatar.physicalState}, expression: ${worldState.avatar.currentExpression}
People: ${peopleDesc}
Last utterance: ${speechDesc}

## Recent Events
${recentEvents || '(none)'}

## Available Actions
speak(text)              — say something (1–2 sentences; warm, direct)
setExpression(name)      — ${_exprNames}
resetExpression()        — return to neutral
lookAt(target)           — "person" | "screen" | "away" | {"x": 0.0–1.0, "y": 0.0–1.0}
setState(state)          — idle | listening | speaking | thinking
blush(intensity)         — 0.0–1.0, for warm/moved moments
headTilt(degrees)        — -30 to 30 (curious pose)
headTiltReset()          — return head to neutral
registerPerson(name)     — save face + name to memory; only after they've said their name

## Respond with valid JSON only:
{
  "actions": [
    {"type": "lookAt", "target": "person"},
    {"type": "setExpression", "name": "happy"},
    {"type": "speak", "text": "Oh, hello — I didn't hear you come in."}
  ],
  "reasoning": "one short sentence"
}`;

  return { system: SYSTEM_PROMPT, userContent };
}

/**
 * Format Cassandra's global state as a brief background context block.
 * Injected quietly at the top of the user message so Sunny inherits her worldview.
 */
function _formatCassandraContext(state) {
  if (!state) return null;

  const lines = ['## Cassandra\'s current worldview (background)'];

  if (state.currentFocus) {
    lines.push(`She is currently thinking about: ${state.currentFocus}`);
  }
  if (state.recentThemes?.length > 0) {
    lines.push(`Recent themes in her writing: ${state.recentThemes.slice(0, 3).join(', ')}`);
  }
  if (state.mood) {
    lines.push(`Her mood today: ${state.mood}`);
  }
  if (state.todaySummary) {
    lines.push(`Today in brief: ${state.todaySummary}`);
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function _describePosition(pos) {
  if (!pos) return 'unknown';
  const x = pos.x;
  if (x < 0.35) return 'left';
  if (x > 0.65) return 'right';
  return 'center';
}

function _summarizeEventData(type, data) {
  if (!data) return '';
  switch (type) {
    case 'person_entered': {
      const who  = data.personName ? `"${data.personName}"` : 'unknown';
      return `${data.estimatedDistance ?? ''} ${data.position ?? ''} — ${who}`.trim();
    }
    case 'person_left': return '';
    case 'utterance': return `"${data.text ?? ''}"`;
    case 'gesture': return data.type ?? '';
    default: return '';
  }
}

module.exports = { buildPrompt };
