/**
 * Speech UI — production overlay showing recognized and spoken text.
 *
 * Avatar speech: subtitle style at bottom, fades after TTS ends.
 * User speech:   pill bubble above subtitles, shows partial (dim) → final (bright) → fades.
 *
 * Call init() once from renderer. Then use showAvatarSpeech() / clearAvatarSpeech()
 * from the speak action. User speech is handled internally via eventBus.
 */

const { eventBus, worldState } = require('../state/worldState');

const AVATAR_LINGER_MS = 1200;  // how long subtitle stays after speech ends
const AVATAR_FADE_MS   = 500;   // CSS transition duration (must match CSS)
const USER_LINGER_MS   = 3500;  // how long final user text stays visible

let _avatarEl = null;
let _userEl   = null;
let _avatarLingerTimer = null;
let _avatarClearTimer  = null;
let _userFadeTimer     = null;
let _lastPartial = '';

function init() {
  const container = document.createElement('div');
  container.id = 'speech-ui';
  document.body.appendChild(container);

  _userEl = document.createElement('div');
  _userEl.id = 'user-speech';
  container.appendChild(_userEl);

  _avatarEl = document.createElement('div');
  _avatarEl.id = 'avatar-speech';
  container.appendChild(_avatarEl);

  // Final utterances from ASR
  eventBus.on('event', (event) => {
    if (event.type === 'utterance') {
      _setUserText(`"${event.data.text}"`, false);
    }
  });

  // Partial transcript polling (updated by speechPerception every ~100ms)
  setInterval(() => {
    const partial = worldState.speech.partialTranscript;
    if (partial && partial !== _lastPartial) {
      _lastPartial = partial;
      _setUserText(partial, true);
    } else if (!partial && _lastPartial) {
      _lastPartial = '';
      // partialTranscript cleared = utterance finalized; final event handles display
    }
  }, 100);
}

/** Show avatar speech subtitle. Cancels any pending fade. */
function showAvatarSpeech(text) {
  clearTimeout(_avatarLingerTimer);
  clearTimeout(_avatarClearTimer);
  _avatarEl.textContent = text;
  // Force reflow so transition fires even if we're re-showing the same text
  _avatarEl.style.opacity = '0';
  requestAnimationFrame(() => { _avatarEl.style.opacity = '1'; });
}

/** Begin fade sequence after TTS ends. */
function clearAvatarSpeech() {
  clearTimeout(_avatarLingerTimer);
  clearTimeout(_avatarClearTimer);
  _avatarLingerTimer = setTimeout(() => {
    _avatarEl.style.opacity = '0';
    _avatarClearTimer = setTimeout(() => {
      _avatarEl.textContent = '';
    }, AVATAR_FADE_MS);
  }, AVATAR_LINGER_MS);
}

function _setUserText(text, isPartial) {
  clearTimeout(_userFadeTimer);
  _userEl.textContent = text;
  _userEl.style.opacity = isPartial ? '0.45' : '0.85';

  if (!isPartial) {
    _userFadeTimer = setTimeout(() => {
      _userEl.style.opacity = '0';
    }, USER_LINGER_MS);
  }
}

module.exports = { init, showAvatarSpeech, clearAvatarSpeech };
