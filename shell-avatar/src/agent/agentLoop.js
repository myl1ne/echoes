/**
 * Agent Loop — turn-state machine that gates LLM calls.
 *
 * Turn states:
 *   idle         — no active interaction; wake word required for speech
 *   debouncing   — face detected, waiting dwellThresholdMs before greeting
 *   avatar_turn  — LLM running or dispatcher executing; new triggers suppressed
 *   person_turn  — avatar finished speaking; session open, listening for response
 *
 * Transitions:
 *   idle         + person_entered (proactive allowed) → debouncing
 *   idle         + utterance (wake word hit)          → avatar_turn
 *   debouncing   + timer fires (face still present)   → avatar_turn (greet)
 *   debouncing   + person_left                        → idle (cancel)
 *   debouncing   + utterance                          → avatar_turn (skip greeting)
 *   avatar_turn  + dispatcher idle                    → person_turn (open session)
 *   avatar_turn  + utterance                          → avatar_turn (hard interrupt)
 *   avatar_turn  + person_left                        → idle (end session)
 *   person_turn  + utterance                          → avatar_turn
 *   person_turn  + session timeout                    → idle (end session)
 *   person_turn  + person_left                        → idle (end session)
 */

const anthropicProvider = require('./llm/anthropicProvider');
const { eventBus, worldState, addEvent, setAvatarState,
        startSession, endSession, markProactiveGreet } = require('../state/worldState');
const { buildPrompt }    = require('./buildPrompt');
const { parseActions }   = require('./parseActions');
const { cassandraLink }  = require('../cassandra/cassandraLink');
const { agent: agentConfig, cassandraUrl, episodeSplitThresholdMs } = require('../../config');

const IDLE_TIMEOUT_MS     = agentConfig.idleTimeoutMs;
const DWELL_THRESHOLD_MS  = agentConfig.conversation.dwellThresholdMs;
const SESSION_TIMEOUT_MS  = agentConfig.conversation.sessionTimeoutMs;
const GREETING_COOLDOWN_MS = agentConfig.conversation.greetingCooldownMs;

// Use stub if no API key
const USE_STUB = !process.env.ANTHROPIC_API_KEY;

// Active LLM provider — swap at runtime with agentLoop.setProvider(provider)
let _llmProvider = anthropicProvider;

class AgentLoop {
  constructor() {
    this._turnState    = 'idle'; // 'idle' | 'debouncing' | 'avatar_turn' | 'person_turn'
    this._debounceTimer = null;
    this._sessionTimer  = null;
    this._idleTimer     = null;
    this._dispatcher    = null;

    // Cassandra visitor/episode tracking — per active person
    this._cassandraConvId   = null;  // current Cassandra conversation ID
    this._cassandraVisitorId = null; // face-recognition UUID of active person
    this._lastSessionEndTime = 0;    // timestamp of last _closeSession()

    // Exchange buffer — accumulate utterance + response to log as one round trip
    this._pendingUserText      = null;
    this._pendingSunnyText     = null;
  }

  setProvider(provider) {
    _llmProvider = provider;
    console.log(`[agentLoop] LLM provider switched to: ${provider.name}`);
  }

  start(state, dispatcher) {
    this._dispatcher = dispatcher;

    // Transition avatar_turn → person_turn when dispatcher finishes
    dispatcher.on('idle', () => this._onDispatcherIdle());

    // Capture each spoken line for the exchange buffer
    dispatcher.on('spoke', (text) => {
      this._pendingSunnyText = this._pendingSunnyText
        ? this._pendingSunnyText + ' ' + text
        : text;
    });

    eventBus.on('event', (event) => this._onEvent(event));

    this._resetIdleTimer();
    console.log(`[agentLoop] Started. ${USE_STUB ? '(stub mode — no API key)' : '(Claude API ready)'}`);
  }

  // ─── Event routing ──────────────────────────────────────────────────────────

  _onEvent(event) {
    const t = agentConfig.triggers;
    const enabled = {
      person_entered: t.personEntered,
      person_left:    t.personLeft,
      utterance:      t.utterance,
      gesture:        t.gesture,
      idle_timeout:   t.idleTimeout,
    };
    if (!enabled[event.type]) return;

    this._resetIdleTimer();

    switch (this._turnState) {
      case 'idle':         return this._handleIdle(event);
      case 'debouncing':   return this._handleDebouncing(event);
      case 'avatar_turn':  return this._handleAvatarTurn(event);
      case 'person_turn':  return this._handlePersonTurn(event);
    }
  }

  _handleIdle(event) {
    if (event.type === 'utterance') {
      // Wake word was required and passed — go straight to response
      this._initCassandraSession(); // fire-and-forget
      this._callLLM(event);
      return;
    }
    if (event.type === 'person_entered') {
      if (!this._shouldGreetProactively()) return;
      this._enterDebouncing(event);
      return;
    }
    if (event.type === 'gesture') {
      this._callLLM(event);
    }
  }

  _handleDebouncing(event) {
    if (event.type === 'person_left') {
      // Person left before dwell threshold — cancel
      clearTimeout(this._debounceTimer);
      this._turnState = 'idle';
      console.log('[agentLoop] Person left during dwell window — greeting cancelled.');
      return;
    }
    if (event.type === 'utterance') {
      // Person spoke before we greeted — skip the greeting, respond directly
      clearTimeout(this._debounceTimer);
      this._callLLM(event);
      return;
    }
    // person_entered or other events during debounce: ignore
  }

  _handleAvatarTurn(event) {
    if (event.type === 'utterance') {
      // Person is interrupting — hard interrupt, call LLM with the new utterance
      console.log('[agentLoop] Utterance during avatar_turn — interrupting.');
      this._dispatcher.interrupt();
      this._callLLM(event);
      return;
    }
    if (event.type === 'person_left') {
      // Everyone left mid-speech — stop and reset
      this._dispatcher.interrupt();
      this._closeSession();
      return;
    }
    // person_entered, gesture, idle_timeout during avatar_turn → suppressed
    console.log(`[agentLoop] "${event.type}" suppressed during avatar_turn.`);
  }

  _handlePersonTurn(event) {
    if (event.type === 'utterance') {
      this._resetSessionTimer();
      this._callLLM(event);
      return;
    }
    if (event.type === 'person_left') {
      this._closeSession();
      return;
    }
    if (event.type === 'gesture') {
      this._resetSessionTimer();
      this._callLLM(event);
    }
  }

  // ─── Dispatcher idle → person_turn ──────────────────────────────────────────

  _onDispatcherIdle() {
    if (this._turnState !== 'avatar_turn') return;
    // Flush completed exchange to Cassandra before opening the person turn
    this._flushExchangeToCassandra();
    // Avatar finished its turn — open session window, wait for person
    startSession();
    this._turnState = 'person_turn';
    setAvatarState('listening');
    this._startSessionTimer();
    console.log('[agentLoop] → person_turn');
  }

  // ─── LLM call ───────────────────────────────────────────────────────────────

  _callLLM(triggerEvent) {
    this._turnState = 'avatar_turn';
    setAvatarState('thinking');
    console.log(`[agentLoop] → avatar_turn (trigger: ${triggerEvent?.type})`);

    // Reset per-turn buffers — each turn is one exchange
    this._pendingUserText  = triggerEvent?.type === 'utterance' ? (triggerEvent.data?.text ?? null) : null;
    this._pendingSunnyText = null;

    const doCall = async () => {
      if (USE_STUB) return this._stubResponse(triggerEvent);
      const { system, userContent } = await buildPrompt(worldState);
      try {
        const text = await _llmProvider.complete(system, userContent);
        return parseActions(text);
      } catch (err) {
        console.error(`[agentLoop] LLM error (${_llmProvider.name}):`, err.message);
        return null;
      }
    };

    doCall().then(actions => {
      if (actions && actions.length > 0) {
        // Always restore person-tracking after every response.
        // Prevents lookAt:"away"/"screen" from permanently locking gaze to manual mode.
        actions.push({ type: 'lookAt', target: 'person' });
        this._dispatcher.dispatch(actions);
      } else {
        // No actions → transition to person_turn immediately
        this._onDispatcherIdle();
      }
    }).catch(err => {
      console.error('[agentLoop] Unexpected error:', err.message);
      setAvatarState('idle');
      this._turnState = 'idle';
    });
  }

  // ─── Session management ──────────────────────────────────────────────────────

  _startSessionTimer() {
    clearTimeout(this._sessionTimer);
    this._sessionTimer = setTimeout(() => {
      if (this._turnState === 'person_turn') {
        console.log('[agentLoop] Session timeout — returning to idle.');
        this._closeSession();
      }
    }, SESSION_TIMEOUT_MS);
  }

  _resetSessionTimer() {
    if (this._turnState === 'person_turn') this._startSessionTimer();
  }

  _closeSession() {
    clearTimeout(this._sessionTimer);
    endSession();
    this._turnState = 'idle';
    setAvatarState('idle');
    console.log('[agentLoop] → idle');

    // Flush any buffered exchange to Cassandra
    this._flushExchangeToCassandra();
    this._lastSessionEndTime = Date.now();
  }

  // ─── Cassandra integration ───────────────────────────────────────────────────

  /**
   * Called when a session opens for a recognised (or newly detected) person.
   * Inits the Cassandra visitor conversation and handles episode splitting.
   */
  async _initCassandraSession() {
    const activePerson = worldState.scene.people.find(
      p => p.id === worldState.scene.activePerson
    );
    const visitorId = activePerson?.personId ?? null;
    if (!visitorId) return; // unknown face — can't link until registered

    this._cassandraVisitorId = visitorId;

    // Check episode split: if idle gap since last session > threshold → new episode
    const idleGap = Date.now() - this._lastSessionEndTime;
    const splitThreshold = episodeSplitThresholdMs ?? 30 * 60 * 1000;
    const shouldSplit = this._lastSessionEndTime > 0 && idleGap > splitThreshold;

    const conv = await cassandraLink.initVisitor(visitorId);
    if (!conv) return;

    if (shouldSplit && conv.id) {
      console.log(`[agentLoop] Episode split — ${Math.round(idleGap / 60000)}min gap. Opening new episode.`);
      const newConv = await cassandraLink.newEpisode(visitorId, conv.id);
      this._cassandraConvId = newConv?.id ?? conv.id;
    } else {
      this._cassandraConvId = conv.id;
    }

    console.log(`[agentLoop] Cassandra session: visitor=${visitorId} conv=${this._cassandraConvId}`);
  }

  /**
   * Flush the pending user+Sunny exchange to Cassandra and reset the buffer.
   */
  async _flushExchangeToCassandra() {
    if (!this._cassandraVisitorId || !this._cassandraConvId) return;
    if (!this._pendingUserText && !this._pendingSunnyText) return;

    await cassandraLink.logExchange(
      this._cassandraVisitorId,
      this._cassandraConvId,
      this._pendingUserText,
      this._pendingSunnyText
    );

    this._pendingUserText  = null;
    this._pendingSunnyText = null;
  }

  /**
   * Relay a registerPerson(name) action to Cassandra's visitor profile.
   * Called by actionDispatcher when the LLM emits registerPerson.
   */
  async _onRegisterPerson(name) {
    if (!this._cassandraVisitorId) return;
    await cassandraLink.setVisitorName(this._cassandraVisitorId, name);
    console.log(`[agentLoop] Relayed name "${name}" to Cassandra visitor ${this._cassandraVisitorId}`);
  }

  // ─── Proactive greeting guard ────────────────────────────────────────────────

  _shouldGreetProactively() {
    const last = worldState.conversation.lastProactiveGreetAt;
    if (last && (Date.now() - last) < GREETING_COOLDOWN_MS) {
      const remaining = Math.round((GREETING_COOLDOWN_MS - (Date.now() - last)) / 1000);
      console.log(`[agentLoop] Proactive greet suppressed — cooldown (${remaining}s left).`);
      return false;
    }
    return true;
  }

  _enterDebouncing(triggerEvent) {
    this._turnState = 'debouncing';
    this._debounceTimer = setTimeout(() => {
      // Face is still present after dwell threshold — greet
      if (worldState.scene.people.length === 0) {
        this._turnState = 'idle';
        return;
      }
      markProactiveGreet();
      this._initCassandraSession(); // fire-and-forget
      this._callLLM(triggerEvent);
    }, DWELL_THRESHOLD_MS);
  }

  // ─── Idle timer (ambient behavior) ──────────────────────────────────────────

  _resetIdleTimer() {
    clearTimeout(this._idleTimer);
    if (!agentConfig.triggers.idleTimeout) return;
    this._idleTimer = setTimeout(() => {
      // Only fire ambient trigger if no one is present and not in a session
      if (this._turnState === 'idle' && worldState.scene.people.length === 0) {
        const event = { type: 'idle_timeout', timestamp: Date.now(), data: {} };
        addEvent('idle_timeout', {});
        this._callLLM(event);
      }
    }, IDLE_TIMEOUT_MS);
  }

  // ─── Stub responses (no API key) ────────────────────────────────────────────

  _stubResponse(event) {
    console.log('[agentLoop] Stub — event:', event?.type);
    switch (event?.type) {
      case 'person_entered':
        return [
          { type: 'lookAt', target: 'person' },
          { type: 'setExpression', name: 'happy' },
          { type: 'setState', state: 'speaking' },
          { type: 'speak', text: 'Welcome! Looking for something specific today?' },
        ];
      case 'utterance':
        return [
          { type: 'lookAt', target: 'person' },
          { type: 'speak', text: 'Interesting question! Let me help you with that.' },
        ];
      case 'person_left':
        return [
          { type: 'setExpression', name: 'happy' },
          { type: 'speak', text: 'Have a great day! Come back anytime.' },
          { type: 'setState', state: 'idle' },
        ];
      case 'idle_timeout':
        return [
          { type: 'lookAt', target: 'away' },
          { type: 'setState', state: 'idle' },
        ];
      default:
        return [{ type: 'setState', state: 'idle' }];
    }
  }
}

// Singleton
const agentLoop = new AgentLoop();

// Expose for actionDispatcher — called when registerPerson(name) fires
agentLoop.onRegisterPerson = (name) => agentLoop._onRegisterPerson(name);

module.exports = { agentLoop };
