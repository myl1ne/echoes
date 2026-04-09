/**
 * Camera Perception — MediaPipe face detection → world state updates.
 *
 * STEP 2: Wire this in renderer.js by calling start().
 *
 * Detects faces in the camera feed, estimates distance from bbox height,
 * updates worldState.scene, and emits person_entered/person_left events.
 */

const { updatePeople, worldState } = require('../state/worldState');
const { camera: camConfig } = require('../../config');
const faceRecognition = require('./faceRecognition');
const { peopleStore }  = require('../state/people/peopleStore');

const UPDATE_INTERVAL_MS = camConfig.updateIntervalMs;

let _detector = null;
let _videoEl = null;
let _running = false;
let _lastUpdateTime = 0;
let _faceIdCounter = 0;
// Track face IDs across frames by proximity
const _trackedFaces = new Map(); // id → last bbox

/**
 * Wait for window.MediaPipeVision — set by <script type="module"> in index.html.
 * Needed because dynamic import() from a CDN URL inside a Node.js CJS module
 * (loaded via require()) uses Node's ESM loader, which crashes the renderer.
 */
function _waitForMediaPipe(timeoutMs = 20000) {
  if (window.MediaPipeVision) return Promise.resolve(window.MediaPipeVision);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MediaPipe load timeout')), timeoutMs);
    window.addEventListener('mediapipe-ready', () => {
      clearTimeout(timer);
      resolve(window.MediaPipeVision || null);
    }, { once: true });
  });
}

async function start() {
  _videoEl = document.getElementById('camera-feed');
  if (!_videoEl) {
    console.warn('[camera] No #camera-feed element found.');
    return;
  }

  // Request camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 640, height: 480 },
      audio: false,
    });
    _videoEl.srcObject = stream;
    await new Promise(r => { _videoEl.onloadedmetadata = r; });
  } catch (err) {
    console.warn('[camera] Camera access denied:', err.message);
    return;
  }

  // Wait for MediaPipe globals — loaded in browser context by index.html module script
  let mpVision;
  try {
    mpVision = await _waitForMediaPipe();
    if (!mpVision) {
      console.warn('[camera] MediaPipe not available — camera disabled.');
      return;
    }
  } catch (err) {
    console.warn('[camera] MediaPipe wait failed:', err.message);
    return;
  }

  const { FaceDetector, FilesetResolver, wasmPath } = mpVision;
  try {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    _detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: camConfig.detectionConfidence,
    });
    console.log('[camera] MediaPipe face detector ready.');
  } catch (err) {
    console.warn('[camera] MediaPipe init failed:', err.message);
    return;
  }

  _running = true;
  _detectLoop();
}

function stop() {
  _running = false;
}

function _detectLoop() {
  if (!_running) return;
  requestAnimationFrame(_detectLoop);

  const now = performance.now();
  if (now - _lastUpdateTime < UPDATE_INTERVAL_MS) return;
  _lastUpdateTime = now;

  if (!_detector || _videoEl.readyState < 2) return;

  const results    = _detector.detectForVideo(_videoEl, now);
  const detections = results.detections ?? [];

  // Snapshot previous people before update (to detect departures of known persons)
  const prevPeople = [...worldState.scene.people];

  // Parse MediaPipe detections → face objects
  const faces = detections.map(d => _parseFace(d));

  // Enrich each face with recognition identity (runs at its own 2s interval)
  for (const face of faces) {
    const match = faceRecognition.getRecognitionFor(face.screenPosition);
    face.personId   = match?.personId   ?? null;
    face.personName = match?.personName ?? null;
    face.isKnown    = !!(match?.personId);
  }

  // Record visits for recognized persons who just left frame
  const newIds = new Set(faces.map(f => f.id));
  for (const prev of prevPeople) {
    if (!newIds.has(prev.id) && prev.personId) {
      peopleStore.recordVisit(prev.personId);
    }
  }

  updatePeople(faces);
}

function _parseFace(detection) {
  const bb = detection.boundingBox;
  const vw = _videoEl.videoWidth || 640;
  const vh = _videoEl.videoHeight || 480;

  // Normalize bbox to 0–1
  const bbox = {
    x: bb.originX / vw,
    y: bb.originY / vh,
    width: bb.width / vw,
    height: bb.height / vh,
  };

  const screenPosition = {
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2,
  };

  // Distance estimate from face height in frame
  let estimatedDistance = 'far';
  if (bbox.height > camConfig.distance.close) estimatedDistance = 'close';
  else if (bbox.height > camConfig.distance.near) estimatedDistance = 'near';

  // Simple ID assignment by proximity to tracked faces
  const id = _assignId(screenPosition);

  return { id, bbox, screenPosition, estimatedDistance, lastSeen: Date.now() };
}

function _assignId(pos) {
  // Match to nearest tracked face within threshold
  let nearest = null;
  let nearestDist = 0.15; // max matching distance
  for (const [id, last] of _trackedFaces) {
    const d = Math.hypot(pos.x - last.x, pos.y - last.y);
    if (d < nearestDist) {
      nearest = id;
      nearestDist = d;
    }
  }
  if (nearest) {
    _trackedFaces.set(nearest, pos);
    return nearest;
  }
  // New face
  const newId = `face_${_faceIdCounter++}`;
  _trackedFaces.set(newId, pos);
  return newId;
}

module.exports = { start, stop };
