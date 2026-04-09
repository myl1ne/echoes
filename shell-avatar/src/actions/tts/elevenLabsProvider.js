/**
 * ElevenLabs TTS provider.
 *
 * Fetches audio from the ElevenLabs REST API, plays it via Web Audio API,
 * and drives lip sync by calling onAmplitude(0–1) each animation frame.
 *
 * Env vars:
 *   ELEVENLABS_API_KEY  — required
 *   ELEVENLABS_VOICE_ID — optional, defaults to Rachel (clear, natural English)
 *   ELEVENLABS_MODEL_ID — optional, defaults to eleven_turbo_v2_5
 */

const { tts: ttsConfig } = require('../../../config');

const API_BASE = 'https://api.elevenlabs.io/v1';

let _audioCtx = null;
let _source   = null;
let _frameId  = null;

function _getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
  }
  return _audioCtx;
}

function _stopCurrent() {
  if (_frameId) { cancelAnimationFrame(_frameId); _frameId = null; }
  if (_source)  { try { _source.stop(); } catch (_) {} _source = null; }
}

/**
 * Speak text via ElevenLabs.
 * @param {string} text
 * @param {{ onAmplitude?: (v: number) => void, stability?: number, similarity_boost?: number }} opts
 * @returns {Promise<void>} resolves when audio finishes playing
 */
async function speak(text, { onAmplitude = () => {}, stability = null, similarity_boost = null } = {}) {
  _stopCurrent();

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const cfg      = ttsConfig.elevenlabs;
  const voiceId  = process.env.ELEVENLABS_VOICE_ID || cfg.voiceId;
  const modelId  = process.env.ELEVENLABS_MODEL_ID || cfg.modelId;
  const stabVal  = stability       ?? cfg.stability;
  const simBoost = similarity_boost ?? cfg.similarityBoost;

  const response = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key':   apiKey,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id:       modelId,
      voice_settings: { stability: stabVal, similarity_boost: simBoost },
    }),
  });

  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs ${response.status}: ${msg}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const ctx         = _getAudioCtx();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  return new Promise((resolve) => {
    const analyser = ctx.createAnalyser();
    analyser.fftSize               = 256;
    analyser.smoothingTimeConstant = 0.5;
    analyser.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    _source = source;

    const data = new Float32Array(analyser.frequencyBinCount);

    function loop() {
      _frameId = requestAnimationFrame(loop);
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] ** 2;
      onAmplitude(Math.min(1, Math.sqrt(sum / data.length) * 8));
    }

    source.onended = () => {
      if (_frameId) { cancelAnimationFrame(_frameId); _frameId = null; }
      onAmplitude(0);
      try { analyser.disconnect(); } catch (_) {}
      _source = null;
      resolve();
    };

    source.start();
    loop();
  });
}

function interrupt() {
  _stopCurrent();
}

const name = 'elevenlabs';
module.exports = { speak, interrupt, name };
