/**
 * Speech Perception — ASR provider → world state updates.
 *
 * Provider is selected from config.asr.provider, or passed explicitly.
 * Wake word filtering (if enabled in config) is applied here before
 * forwarding transcripts to the agent.
 *
 * Wake word matching uses token-level Levenshtein distance so that Whisper's
 * spelling variations of proper nouns ("Eco", "Acho", "echo.") still match.
 */

const config = require('../../config');
const { addUtterance, worldState } = require('../state/worldState');

let _provider = null;

// ─── Fuzzy wake-word matching ─────────────────────────────────────────────────

function _lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[a.length][b.length];
}

// Allow 1 error for short words (≤4 chars), 2 for longer ones.
function _maxDist(word) { return word.length <= 4 ? 1 : 2; }

/**
 * Try to match a wake phrase (space-separated tokens) starting at position
 * `start` in the transcript token array, using per-token fuzzy matching.
 */
function _matchAt(tTokens, wTokens, start) {
  if (start + wTokens.length > tTokens.length) return false;
  return wTokens.every((wt, i) => {
    const tt = tTokens[start + i].replace(/[^a-z]/g, '');  // strip punctuation
    return _lev(tt, wt) <= _maxDist(wt);
  });
}

/**
 * Check whether any configured wake phrase occurs in the transcript.
 * Returns { stripped } with the wake phrase tokens removed, or null if no match.
 */
function _wakeWordMatch(text, wakeWords) {
  const tTokens = text.toLowerCase().trim().split(/\s+/);

  for (const phrase of wakeWords) {
    const wTokens = phrase.toLowerCase().split(/\s+/);
    for (let i = 0; i <= tTokens.length - wTokens.length; i++) {
      if (_matchAt(tTokens, wTokens, i)) {
        const rest = [...tTokens.slice(0, i), ...tTokens.slice(i + wTokens.length)]
          .join(' ')
          .replace(/^[\s,;.]+/, '')
          .trim();
        return { matched: phrase, stripped: rest || null };
      }
    }
  }
  return null;
}

// ─── Start / stop ─────────────────────────────────────────────────────────────

function start(provider) {
  if (!provider) {
    provider = config.asr.provider === 'webSpeech'
      ? require('./asr/webSpeechProvider')
      : require('./asr/whisperProvider');
  }

  _provider = provider;
  console.log(`[speech] Starting ASR: ${provider.name}` +
    (config.asr.wakeWord.enabled
      ? ` (wake word: "${config.asr.wakeWord.words.join('", "')}")`
      : ''));
  worldState.speech.isListening = true;

  provider.start({
    onPartial(text) {
      worldState.speech.partialTranscript = text;
    },

    onFinal(text, confidence) {
      if (!text) return;

      const ww = config.asr.wakeWord;
      if (ww.enabled) {
        const result = _wakeWordMatch(text, ww.words);
        if (result) {
          // Wake word present — strip it and forward regardless of session state
          text = result.stripped || text;
          console.log(`[speech] Wake word "${result.matched}" → "${text}" (${(confidence * 100).toFixed(0)}%)`);
        } else if (worldState.conversation.sessionActive) {
          // No wake word, but we're in an active session — forward as-is
          console.log(`[speech] (session) "${text}" (${(confidence * 100).toFixed(0)}%)`);
        } else {
          // No wake word, no session — drop
          console.log(`[speech] (no wake word) "${text}"`);
          return;
        }
      } else {
        console.log(`[speech] "${text}" (${(confidence * 100).toFixed(0)}%)`);
      }

      addUtterance(text, confidence);
    },

    onError(type, message) {
      if (type === 'not-allowed') {
        console.error('[speech] Microphone permission denied — ASR disabled.');
        worldState.speech.isListening = false;
      } else if (type === 'network') {
        console.warn('[speech] Cloud ASR unavailable — speech recognition disabled.');
        worldState.speech.isListening = false;
      } else {
        console.warn(`[speech] ASR error [${type}]: ${message}`);
      }
    },
  });
}

function stop() {
  _provider?.stop();
  worldState.speech.isListening      = false;
  worldState.speech.partialTranscript = '';
}

module.exports = { start, stop };
