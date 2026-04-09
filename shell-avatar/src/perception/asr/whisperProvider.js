/**
 * WhisperProvider — offline ASR via @xenova/transformers, running in the
 * Electron main process and accessed from the renderer via IPC.
 *
 * Why IPC?  @xenova/transformers imports bare specifiers like "@huggingface/jinja"
 * that Chromium's module loader can't resolve.  Node.js dynamic import() in the
 * main process resolves them correctly from node_modules.
 *
 * Architecture:
 *   Renderer (this file): getUserMedia → AudioContext → VAD → audio buffer
 *   Main process (main.js): @xenova/transformers pipeline → transcript
 *   IPC: renderer sends Float32Array, gets back { text }
 *
 * Model: set in config.js → asr.whisper.model (default: whisper-tiny.en ~39 MB).
 *        Downloads once to the OS cache.
 */

const { ipcRenderer } = require('electron');
const { asr: asrConfig } = require('../../../config');

const SAMPLE_RATE      = 16000;                       // Whisper requires 16 kHz (fixed)
const VAD_THRESHOLD    = asrConfig.vad.threshold;
const VAD_ONSET_MS     = asrConfig.vad.onsetMs;
const VAD_SILENCE_MS   = asrConfig.vad.silenceMs;
const INTERIM_EVERY_MS = asrConfig.vad.interimMs;
const MAX_SPEECH_MS    = asrConfig.vad.maxSpeechMs;
const PRE_BUFFER_FRAMES = asrConfig.vad.preRollFrames;
const TTS_TAIL_MS      = asrConfig.ttsTailMs;

let _callbacks     = null;   // { onPartial, onFinal, onError }
let _stream        = null;   // MediaStream (mic)
let _audioCtx      = null;   // AudioContext
let _processor     = null;   // ScriptProcessorNode
let _pipelineReady = false;
let _running       = false;

// TTS gate — suppresses VAD while the avatar is speaking so it can't hear itself
let _gated     = false;
let _gateTimer = null;

// VAD state
let _vadState     = 'silence';  // 'silence' | 'speech'
let _aboveCount   = 0;
let _belowCount   = 0;
let _speechBuffer = [];         // Float32Array[] — downsampled chunks at 16 kHz
let _preBuffer    = [];         // rolling window of recent silence frames (pre-roll)
let _speechStart  = 0;
let _lastInterim  = 0;

// ─── Audio helpers ────────────────────────────────────────────────────────────

function _rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Downsample Float32Array from sourceSR → 16 kHz by averaging. */
function _downsample(input, sourceSR) {
  if (sourceSR === SAMPLE_RATE) return input;
  const ratio  = sourceSR / SAMPLE_RATE;
  const outLen = Math.floor(input.length / ratio);
  const output = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end   = Math.floor((i + 1) * ratio);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    output[i] = sum / (end - start);
  }
  return output;
}

/** Concatenate all Float32Array chunks into one. */
function _flatten(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out   = new Float32Array(total);
  let offset  = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

// ─── Inference via IPC ────────────────────────────────────────────────────────

async function _runWhisper(audioData, isFinal) {
  if (!_pipelineReady || audioData.length < SAMPLE_RATE * 0.3) return; // min 300 ms
  try {
    const result = await ipcRenderer.invoke('asr:transcribe', audioData);
    const text   = result?.text;
    if (!text) return;

    if (isFinal) {
      _callbacks?.onFinal(text, 0.9);   // Whisper doesn't expose confidence natively
    } else {
      _callbacks?.onPartial(text);
    }
  } catch (err) {
    console.warn('[whisper] IPC transcription error:', err.message);
  }
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────

async function start(callbacks) {
  if (_running) return;
  _callbacks = callbacks;
  _running   = true;

  // 1. Ask main process to load the Whisper pipeline.
  //    This is deduplicated — safe to call before a previous init finishes.
  ipcRenderer.invoke('asr:init').then(result => {
    if (result.ok) {
      _pipelineReady = true;
      console.log('[whisper] Pipeline ready (main process).');
    } else {
      console.error('[whisper] Pipeline init failed:', result.error);
      _callbacks?.onError('init', result.error);
      _running = false;
    }
  }).catch(err => {
    console.error('[whisper] IPC error during init:', err.message);
    _callbacks?.onError('init', err.message);
    _running = false;
  });

  // 2. Open microphone with echo cancellation so TTS output doesn't feed back.
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (err) {
    console.error('[whisper] Mic access denied:', err.message);
    _callbacks?.onError('not-allowed', err.message);
    _running = false;
    return;
  }

  _audioCtx       = new AudioContext();
  const sourceSR  = _audioCtx.sampleRate;
  const source    = _audioCtx.createMediaStreamSource(_stream);
  const CHUNK     = 4096;
  _processor      = _audioCtx.createScriptProcessor(CHUNK, 1, 1);

  // Muted gain keeps the graph connected without playing mic audio back
  const mute = _audioCtx.createGain();
  mute.gain.value = 0;
  source.connect(_processor);
  _processor.connect(mute);
  mute.connect(_audioCtx.destination);

  const frameMs          = (CHUNK / sourceSR) * 1000;
  const framesForOnset   = Math.ceil(VAD_ONSET_MS   / frameMs);
  const framesForSilence = Math.ceil(VAD_SILENCE_MS / frameMs);

  _processor.onaudioprocess = (e) => {
    if (!_running || _gated) return;  // skip entirely while avatar is speaking
    const inputData   = e.inputBuffer.getChannelData(0);
    const downsampled = _downsample(new Float32Array(inputData), sourceSR);
    const amplitude   = _rms(inputData);

    if (_vadState === 'silence') {
      // Always accumulate a rolling pre-roll window so onset frames aren't lost
      _preBuffer.push(downsampled);
      if (_preBuffer.length > PRE_BUFFER_FRAMES) _preBuffer.shift();

      if (amplitude > VAD_THRESHOLD) {
        _aboveCount++;
        if (_aboveCount >= framesForOnset) {
          _vadState    = 'speech';
          _speechStart = Date.now();
          _lastInterim = Date.now();
          // Seed buffer with pre-roll so the first word isn't clipped
          _speechBuffer = [..._preBuffer];
          _preBuffer    = [];
          _belowCount   = 0;
          console.log('[whisper] Speech started');
        }
      } else {
        _aboveCount = 0;
      }
    } else {
      _speechBuffer.push(downsampled);

      if (amplitude < VAD_THRESHOLD) {
        _belowCount++;
        if (_belowCount >= framesForSilence) {
          _vadState = 'silence';
          _aboveCount = 0;
          const audio = _flatten(_speechBuffer);
          _speechBuffer = [];
          _callbacks?.onPartial('');  // clear partial display
          console.log(`[whisper] Utterance ended (${(audio.length / SAMPLE_RATE).toFixed(1)}s)`);
          if (_pipelineReady) _runWhisper(audio, true);
          else console.log('[whisper] Pipeline not ready yet — utterance dropped');
        }
      } else {
        _belowCount = 0;

        // Periodic interim transcription while speaking
        if (_pipelineReady && Date.now() - _lastInterim > INTERIM_EVERY_MS) {
          _lastInterim = Date.now();
          _runWhisper(_flatten(_speechBuffer), false);
        }

        // Hard cap — prevents exceeding Whisper's context window
        if (Date.now() - _speechStart > MAX_SPEECH_MS) {
          _vadState = 'silence';
          const audio = _flatten(_speechBuffer);
          _speechBuffer = [];
          if (_pipelineReady) _runWhisper(audio, true);
        }
      }
    }
  };

  console.log('[whisper] Mic open, listening...');
}

function stop() {
  _running = false;
  if (_processor) { _processor.disconnect(); _processor = null; }
  if (_audioCtx)  { _audioCtx.close().catch(() => {}); _audioCtx = null; }
  if (_stream)    { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
  _vadState     = 'silence';
  _speechBuffer = [];
  _preBuffer    = [];
  console.log('[whisper] Stopped.');
}

/**
 * Gate the VAD while TTS is active.
 * Call gate(true) when TTS starts, gate(false) when it ends.
 * A short tail keeps the gate closed until the speaker echo decays.
 */
function gate(active) {
  clearTimeout(_gateTimer);
  if (active) {
    _gated = true;
    // Reset any in-progress detection so a half-heard word isn't queued
    _vadState     = 'silence';
    _aboveCount   = 0;
    _speechBuffer = [];
  } else {
    _gateTimer = setTimeout(() => { _gated = false; }, TTS_TAIL_MS);
  }
}

const name = 'whisper';
module.exports = { start, stop, gate, name };
