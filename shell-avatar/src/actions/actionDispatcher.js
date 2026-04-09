/**
 * Action Dispatcher — queues and executes LLM action sequences in order.
 *
 * Actions execute sequentially. 'speak' is async (waits for TTS to finish).
 * Motion/expression/gaze actions are fire-and-forget (resolve immediately).
 *
 * interrupt() cancels ongoing speech and flushes the queue.
 *
 * Emits 'idle' when the queue drains — agentLoop listens to transition
 * from avatar_turn → person_turn.
 */

const EventEmitter = require('events');
const { executeAction } = require('./avatarAction');
const { ttsAction } = require('./ttsAction');

class ActionDispatcher extends EventEmitter {
  constructor() {
    super();
    this._avatar = null;
    this._running = false;
    this._interrupted = false;
    this._interruptTimer = null;
    this._queue = [];
  }

  setAvatar(avatar) {
    this._avatar = avatar;
  }

  /**
   * Dispatch an array of action objects, replacing any pending queue.
   * Cancels ongoing speech so the current action resolves promptly,
   * then the while loop picks up the new queue naturally.
   */
  async dispatch(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return;

    // Cancel any pending interrupt reset and clear the flag — we're starting fresh
    clearTimeout(this._interruptTimer);
    this._interrupted = false;

    // Cancel ongoing speech (current executeAction resolves, loop continues)
    ttsAction.interrupt();
    this._queue = [...actions];

    if (!this._running) {
      this._runQueue();
    }
    // If already running: TTS resolved, while loop picks up the new queue
  }

  /**
   * Cancel current speech and stop the queue entirely.
   * Called externally (e.g. person_left mid-greeting).
   */
  interrupt() {
    clearTimeout(this._interruptTimer);
    this._interrupted = true;
    ttsAction.interrupt();
    this._queue = [];
    this._interruptTimer = setTimeout(() => { this._interrupted = false; }, 50);
  }

  async _runQueue() {
    this._running = true;
    while (this._queue.length > 0 && !this._interrupted) {
      const action = this._queue.shift();
      try {
        await executeAction(action, this._avatar);
        if (action.type === 'speak' && action.text) {
          this.emit('spoke', action.text);
        }
      } catch (err) {
        console.error('[dispatcher] Action failed:', action, err);
      }
    }
    this._running = false;
    // Notify agentLoop that the avatar has finished its turn
    if (!this._interrupted) this.emit('idle');
  }
}

// Singleton
const actionDispatcher = new ActionDispatcher();
module.exports = { actionDispatcher };
