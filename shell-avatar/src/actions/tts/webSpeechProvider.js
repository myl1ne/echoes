/**
 * Web Speech TTS provider (offline fallback).
 *
 * Uses the browser's SpeechSynthesis API. Since Web Speech doesn't expose
 * an AudioNode, lip sync is simulated with a sine wave via onAmplitude.
 */

let _synth     = null;
let _utterance = null;
let _interval  = null;

function _getSynth() {
  if (!_synth) _synth = window.speechSynthesis;
  return _synth;
}

function interrupt() {
  if (_interval) { clearInterval(_interval); _interval = null; }
  _getSynth().cancel();
  _utterance = null;
}

async function speak(text, { onAmplitude = () => {}, rate = null, pitch = null, volume = 1.0, lang = null } = {}) {
  const { tts: ttsConfig } = require('../../../config');
  rate  = rate  ?? ttsConfig.webSpeech.rate;
  pitch = pitch ?? ttsConfig.webSpeech.pitch;
  lang  = lang  ?? ttsConfig.webSpeech.lang;
  interrupt();

  return new Promise((resolve) => {
    const utterance    = new SpeechSynthesisUtterance(text);
    utterance.rate     = rate;
    utterance.pitch    = pitch;
    utterance.volume   = volume;
    utterance.lang     = lang;
    _utterance         = utterance;

    utterance.onstart = () => {
      let phase = 0;
      _interval = setInterval(() => {
        phase += 0.3;
        onAmplitude(Math.max(0, Math.min(1, 0.4 + Math.sin(phase) * 0.3 + Math.random() * 0.15)));
      }, 50);
    };

    const done = () => {
      if (_interval) { clearInterval(_interval); _interval = null; }
      onAmplitude(0);
      _utterance = null;
      resolve();
    };

    utterance.onend   = done;
    utterance.onerror = (e) => {
      if (e.error !== 'interrupted') console.warn('[webSpeech] TTS error:', e.error);
      done();
    };

    _getSynth().speak(utterance);
  });
}

const name = 'webSpeech';
module.exports = { speak, interrupt, name };
