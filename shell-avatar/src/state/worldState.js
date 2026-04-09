/**
 * World State — single source of truth for everything the avatar perceives.
 *
 * Updated by perception modules, read by the agent loop.
 * Event log is a rolling buffer of significant happenings.
 */

const EventEmitter = require('events');

const MAX_EVENTS = 20;
const MAX_UTTERANCES = 5;
const MAX_GESTURES = 3;

// The live state object
const worldState = {
  scene: {
    people: [],
    activePerson: null, // face_id of the largest/closest person
  },
  speech: {
    isListening: false,
    partialTranscript: '',
    recentUtterances: [], // [{ text, timestamp, confidence }]
  },
  touch: {
    lastGesture: null, // { type, position, timestamp }
    recentGestures: [],
  },
  avatar: {
    physicalState: 'idle', // idle | listening | speaking | thinking | reacting
    currentExpression: 'neutral',
    gazeTarget: { type: 'screen' },
  },
  // Conversation session — tracks wake word remanence and proactive greeting pacing.
  conversation: {
    sessionActive: false,         // true = wake word not required for incoming speech
    sessionStartedAt: null,       // timestamp when current session opened
    lastProactiveGreetAt: null,   // timestamp of last unsolicited greeting (cooldown)
  },
  events: [], // [{ timestamp, type, data }]
};

// Event bus for perception → agent notifications
const eventBus = new EventEmitter();

/**
 * Add a significant event to the log and emit it for the agent loop.
 * @param {string} type — 'person_entered' | 'person_left' | 'utterance' | 'gesture' | 'idle_timeout'
 * @param {object} data
 */
function addEvent(type, data = {}) {
  const event = { timestamp: Date.now(), type, data };
  worldState.events.push(event);
  if (worldState.events.length > MAX_EVENTS) {
    worldState.events.shift();
  }
  eventBus.emit('event', event);
}

/** Update the people list from a camera frame. Emits person_entered / person_left. */
function updatePeople(detectedFaces) {
  const prevIds = new Set(worldState.scene.people.map(p => p.id));
  const newIds = new Set(detectedFaces.map(f => f.id));

  // Detect entries and exits
  for (const face of detectedFaces) {
    if (!prevIds.has(face.id)) {
      addEvent('person_entered', {
        id: face.id,
        estimatedDistance: face.estimatedDistance,
        position:   _describePosition(face),
        personName: face.personName ?? null,
      });
    }
  }
  for (const prev of worldState.scene.people) {
    if (!newIds.has(prev.id)) {
      addEvent('person_left', { id: prev.id });
    }
  }

  worldState.scene.people = detectedFaces;
  // Active = largest face (closest)
  if (detectedFaces.length > 0) {
    const sorted = [...detectedFaces].sort((a, b) =>
      (b.bbox.width * b.bbox.height) - (a.bbox.width * a.bbox.height)
    );
    worldState.scene.activePerson = sorted[0].id;
  } else {
    worldState.scene.activePerson = null;
  }
}

/** Add a completed utterance. */
function addUtterance(text, confidence = 1) {
  const entry = { text, timestamp: Date.now(), confidence };
  worldState.speech.recentUtterances.push(entry);
  if (worldState.speech.recentUtterances.length > MAX_UTTERANCES) {
    worldState.speech.recentUtterances.shift();
  }
  worldState.speech.partialTranscript = '';
  addEvent('utterance', { text });
}

/** Add a gesture event. */
function addGesture(type, position) {
  const g = { type, position, timestamp: Date.now() };
  worldState.touch.lastGesture = g;
  worldState.touch.recentGestures.push(g);
  if (worldState.touch.recentGestures.length > MAX_GESTURES) {
    worldState.touch.recentGestures.shift();
  }
  addEvent('gesture', { type, position });
}

/** Update avatar state (called by action dispatcher). */
function setAvatarState(state) {
  worldState.avatar.physicalState = state;
}

/** Update avatar expression (called by action dispatcher). */
function setAvatarExpression(name) {
  worldState.avatar.currentExpression = name;
}

/** Open a conversation session — wake word no longer required for incoming speech. */
function startSession() {
  worldState.conversation.sessionActive = true;
  worldState.conversation.sessionStartedAt = Date.now();
  console.log('[conversation] Session opened.');
}

/** Close the conversation session — wake word required again. */
function endSession() {
  worldState.conversation.sessionActive = false;
  worldState.conversation.sessionStartedAt = null;
  console.log('[conversation] Session closed.');
}

/** Record that a proactive (unsolicited) greeting just fired. Used for cooldown. */
function markProactiveGreet() {
  worldState.conversation.lastProactiveGreetAt = Date.now();
}

function _describePosition(face) {
  const cx = face.screenPosition?.x ?? 0.5;
  if (cx < 0.35) return 'left';
  if (cx > 0.65) return 'right';
  return 'center';
}

module.exports = {
  worldState,
  eventBus,
  addEvent,
  updatePeople,
  addUtterance,
  addGesture,
  setAvatarState,
  setAvatarExpression,
  startSession,
  endSession,
  markProactiveGreet,
};
