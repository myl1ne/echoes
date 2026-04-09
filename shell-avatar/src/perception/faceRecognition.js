/**
 * Face Recognition — face-api.js wrapper.
 *
 * Runs at config.recognition.intervalMs (default 2s), independent of the
 * MediaPipe detection loop. MediaPipe handles real-time tracking; this module
 * enriches tracked faces with identity.
 *
 * Pipeline: TinyFaceDetector → 68-point landmarks → 128D descriptor → people store match.
 *
 * Models must be downloaded to shell-avatar/models/face-api/ before first run.
 * Run: node scripts/download-face-models.js
 * Or download manually from: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
 *   - tiny_face_detector_model-weights_manifest.json + shard
 *   - face_landmark_68_model-weights_manifest.json + shard
 *   - face_recognition_model-weights_manifest.json + shard
 */

const path = require('path');
const { recognition: recConfig } = require('../../config');
const { peopleStore } = require('../state/people/peopleStore');

// face-api.js is loaded as a global script tag in index.html → window.faceapi
let _fa = null;

let _videoEl     = null;
let _running     = false;
let _initialized = false;
let _intervalId  = null;

// Map of pos-key → { screenPos, descriptor, personId, personName }
const _results = new Map();

// Descriptor of the largest (closest) face in the last recognition pass
let _activeDescriptor = null;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start the recognition loop.
 * @param {HTMLVideoElement} videoEl — the camera feed element
 */
async function start(videoEl) {
  _videoEl = videoEl;

  if (!recConfig.enabled) {
    console.log('[recognition] Disabled in config.');
    return;
  }

  _fa = window.faceapi;
  if (!_fa) {
    console.warn('[recognition] face-api.js not loaded — recognition disabled.');
    return;
  }

  // Electron-specific: disable WebGL packing to avoid canvas constructor issues
  if (_fa.tf?.ENV) {
    _fa.tf.ENV.set('WEBGL_PACK', false);
  }

  // Resolve model path as a file:// URL for Electron
  // __dirname = shell-avatar/src/perception/
  const modelsPath = path.join(__dirname, '../..', recConfig.modelsPath);
  const modelsUri  = 'file:///' + modelsPath.replace(/\\/g, '/');

  try {
    await Promise.all([
      _fa.nets.tinyFaceDetector.loadFromUri(modelsUri),
      _fa.nets.faceLandmark68Net.loadFromUri(modelsUri),
      _fa.nets.faceRecognitionNet.loadFromUri(modelsUri),
    ]);
    _initialized = true;
    console.log('[recognition] Models loaded. Running every', recConfig.intervalMs, 'ms.');
  } catch (err) {
    console.warn('[recognition] Model load failed — recognition disabled:', err.message);
    return;
  }

  _running    = true;
  _intervalId = setInterval(_recognize, recConfig.intervalMs);
}

/**
 * Query the recognition result for a face at the given screen position.
 * Returns { personId, personName, descriptor } or null if no nearby result.
 */
function getRecognitionFor(screenPos) {
  let best     = null;
  let bestDist = 0.2; // max matching radius (normalized screen space)

  for (const result of _results.values()) {
    const d = Math.hypot(
      screenPos.x - result.screenPos.x,
      screenPos.y - result.screenPos.y,
    );
    if (d < bestDist) {
      best     = result;
      bestDist = d;
    }
  }
  return best;
}

/** Returns the descriptor of the largest face from the last recognition pass. */
function getActiveDescriptor() {
  return _activeDescriptor;
}

function stop() {
  _running = false;
  clearInterval(_intervalId);
}

// ─── Recognition loop ────────────────────────────────────────────────────────

async function _recognize() {
  if (!_running || !_initialized || !_videoEl || _videoEl.readyState < 2) return;

  try {
    const detections = await _fa
      .detectAllFaces(_videoEl, new _fa.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();

    _results.clear();
    _activeDescriptor = null;

    const vw = _videoEl.videoWidth  || 640;
    const vh = _videoEl.videoHeight || 480;
    let largestArea = 0;

    for (const det of detections) {
      const box = det.detection.box;
      const screenPos = {
        x: (box.x + box.width  / 2) / vw,
        y: (box.y + box.height / 2) / vh,
      };

      const descriptor = det.descriptor; // Float32Array[128]
      const person     = peopleStore.findByDescriptor(descriptor, recConfig.threshold);

      _results.set(_posKey(screenPos), {
        screenPos,
        descriptor,
        personId:   person?.id   ?? null,
        personName: person?.name ?? null,
      });

      if (person) {
        console.log(`[recognition] Recognized: "${person.name}"`);
        peopleStore.addDescriptorSample(person.id, descriptor, recConfig.maxSamples);
      } else {
        console.log(`[recognition] Unknown face at (${screenPos.x.toFixed(2)}, ${screenPos.y.toFixed(2)})`);
      }

      // Track largest (closest) face
      const area = box.width * box.height;
      if (area > largestArea) {
        largestArea       = area;
        _activeDescriptor = descriptor;
      }
    }
  } catch (err) {
    console.warn('[recognition] Detection error:', err.message);
  }
}

function _posKey(pos) {
  return `${Math.round(pos.x * 8)},${Math.round(pos.y * 8)}`;
}

module.exports = { start, stop, getRecognitionFor, getActiveDescriptor };
