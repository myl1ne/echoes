/**
 * WebSpeechProvider — cloud-based ASR via the Web Speech API.
 *
 * Uses Google's cloud ASR under the hood — requires network access.
 * Suitable as a fallback when Whisper is unavailable or during development.
 *
 * Implements the provider interface: { start(callbacks), stop(), name }
 * where callbacks = { onPartial(text), onFinal(text, confidence), onError(type, message) }
 */

const BACKOFF_BASE      = 300;    // ms
const BACKOFF_MAX       = 30000;  // ms
const MAX_NETWORK_FAILS = 5;      // give up after this many consecutive network errors

let _recognition    = null;
let _running        = false;
let _callbacks      = null;
let _restartDelay   = BACKOFF_BASE;
let _networkFails   = 0;

function start(callbacks) {
  _callbacks = callbacks;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn('[webSpeech] Web Speech API not available in this environment.');
    callbacks.onError('unavailable', 'Web Speech API not available');
    return;
  }

  _running      = true;
  _recognition  = new SR();
  _recognition.continuous     = true;
  _recognition.interimResults = true;
  _recognition.lang           = 'en-US';
  _recognition.maxAlternatives = 1;

  _recognition.onstart = () => {
    console.log('[webSpeech] Listening...');
    // Backoff resets only on actual results, not just on connection
  };

  _recognition.onend = () => {
    _callbacks?.onPartial('');      // clear any partial transcript
    if (_running) {
      setTimeout(() => {
        try { _recognition.start(); } catch (_) {}
      }, _restartDelay);
    }
  };

  _recognition.onresult = (event) => {
    _restartDelay = BACKOFF_BASE;   // reset backoff — we're actually getting results
    _networkFails = 0;
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        if (text) {
          _callbacks?.onFinal(text, r[0].confidence);
          console.log(`[webSpeech] "${text}" (${(r[0].confidence * 100).toFixed(0)}%)`);
        }
      } else {
        interim += r[0].transcript;
      }
    }
    _callbacks?.onPartial(interim);
  };

  _recognition.onerror = (e) => {
    if (e.error === 'not-allowed') {
      console.error('[webSpeech] Microphone permission denied.');
      _callbacks?.onError('not-allowed', 'Microphone permission denied');
      _running = false;
    } else if (e.error === 'network') {
      _networkFails++;
      _restartDelay = Math.min(_restartDelay * 4, BACKOFF_MAX);
      if (_networkFails >= MAX_NETWORK_FAILS) {
        console.warn('[webSpeech] Network ASR unavailable in this environment — giving up.');
        _callbacks?.onError('network', 'Cloud ASR unavailable (no network path to Google)');
        _running = false;
      } else {
        console.warn(`[webSpeech] Network error (${_networkFails}/${MAX_NETWORK_FAILS}) — retry in ${(_restartDelay / 1000).toFixed(1)}s`);
      }
    } else {
      console.warn('[webSpeech] ASR error:', e.error);
    }
  };

  _recognition.start();
}

function stop() {
  _running = false;
  _recognition?.stop();
}

const name = 'webSpeech';
module.exports = { start, stop, name };
