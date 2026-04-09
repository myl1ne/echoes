/**
 * TTS Action — text → speech via a pluggable provider.
 *
 * Provider interface:
 *   speak(text, { onAmplitude, ...opts }) → Promise<void>
 *   interrupt()
 *   name
 *
 * Default provider: ElevenLabs if ELEVENLABS_API_KEY is set, else Web Speech.
 * Override at runtime with ttsAction.setProvider(provider).
 */

const config             = require('../../config');
const elevenLabsProvider = require('./tts/elevenLabsProvider');
const webSpeechProvider  = require('./tts/webSpeechProvider');

function _selectProvider() {
  const want = config.tts.provider;
  if (want === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) return elevenLabsProvider;
  if (want === 'elevenlabs') console.warn('[tts] elevenlabs selected but ELEVENLABS_API_KEY missing — falling back to webSpeech');
  return webSpeechProvider;
}

class TTSAction {
  constructor() {
    this._provider = _selectProvider();
    console.log(`[tts] Provider: ${this._provider.name}`);
  }

  /**
   * Speak text. Resolves when audio finishes (or is interrupted).
   * @param {string} text
   * @param {AvatarController} avatar — receives setMouthOpen(0–1) for lip sync
   * @param {object} options — forwarded to provider (rate, pitch, stability…)
   */
  speak(text, avatar, options = {}) {
    return this._provider.speak(text, {
      ...options,
      onAmplitude: (v) => avatar.setMouthOpen(v),
    });
  }

  interrupt() {
    this._provider.interrupt();
  }

  setProvider(provider) {
    this._provider.interrupt();
    this._provider = provider;
    console.log(`[tts] Provider switched to: ${provider.name}`);
  }
}

// Singleton
const ttsAction = new TTSAction();
module.exports = { ttsAction, elevenLabsProvider, webSpeechProvider };
