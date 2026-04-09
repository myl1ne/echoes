/**
 * Avatar actions — execute individual action types against the avatar controller.
 *
 * Each action resolves immediately (fire-and-forget) except 'speak',
 * which resolves when TTS completes.
 */

const { ttsAction }      = require('./ttsAction');
const { setAvatarState, setAvatarExpression, worldState } = require('../state/worldState');
const speechUI           = require('../ui/speechUI');
const whisperProvider    = require('../perception/asr/whisperProvider');
const faceRecognition    = require('../perception/faceRecognition');
const { peopleStore }    = require('../state/people/peopleStore');
const { cassandraLink }  = require('../cassandra/cassandraLink');

/**
 * Execute a single action object.
 * @param {{ type: string, [key: string]: any }} action
 * @param {AvatarController} avatar
 * @returns {Promise<void>}
 */
async function executeAction(action, avatar) {
  switch (action.type) {
    case 'speak': {
      speechUI.showAvatarSpeech(action.text);
      setAvatarState('speaking');
      whisperProvider.gate(true);   // stop listening while we talk
      await ttsAction.speak(action.text, avatar, action.options ?? {});
      whisperProvider.gate(false);  // re-open after echo tail (600 ms)
      setAvatarState('idle');
      speechUI.clearAvatarSpeech();
      break;
    }

    case 'setExpression': {
      avatar.setExpression(action.name);
      setAvatarExpression(action.name);
      break;
    }

    case 'resetExpression': {
      avatar.resetExpression();
      setAvatarExpression('neutral');
      break;
    }

    case 'lookAt': {
      const target = action.target;
      if (target === 'person') {
        // Continuous tracking — avatar follows the active person each tick
        avatar.trackPerson(worldState);
      } else if (target === 'screen') {
        avatar.setGazeCenter();
      } else if (target === 'away') {
        avatar.setGazeAway();
      } else if (typeof target === 'object' && 'x' in target) {
        avatar.setGazeScreen(target.x, target.y);
      }
      break;
    }

    case 'setState': {
      setAvatarState(action.state);
      break;
    }

    case 'blush': {
      avatar.setBlush(action.intensity ?? 0.8);
      // Auto-reset after 3 seconds
      setTimeout(() => avatar.setBlush(0), 3000);
      break;
    }

    case 'headTilt': {
      avatar.setHeadTilt(action.degrees ?? 10);
      break;
    }

    case 'headTiltReset': {
      avatar.setHeadTilt(0);
      break;
    }

    case 'registerPerson': {
      const descriptor = faceRecognition.getActiveDescriptor();
      if (!descriptor) {
        console.warn('[avatarAction] registerPerson: no active face descriptor available.');
        break;
      }
      // Check for existing match before creating a new entry — prevents duplicate
      // registrations when face tracking re-assigns IDs mid-session or when the
      // LLM emits registerPerson more than once.
      const { recognition: recConfig } = require('../../config');
      const existing = peopleStore.findByDescriptor(descriptor, recConfig.threshold * 1.3);
      let person;
      if (existing) {
        // Update name on the existing person rather than creating a new one
        existing.name = action.name;
        peopleStore.save();
        person = existing;
        console.log(`[avatarAction] Updated existing person: "${person.name}" (id: ${person.id})`);
      } else {
        person = peopleStore.register(descriptor, action.name);
        console.log(`[avatarAction] Registered new person: "${person.name}" (id: ${person.id})`);
      }
      // Update the active person entry in worldState in-place
      const activeId = worldState.scene.activePerson;
      for (const p of worldState.scene.people) {
        if (p.id === activeId) {
          p.personId   = person.id;
          p.personName = person.name;
          p.isKnown    = true;
          break;
        }
      }
      // Relay name to Cassandra visitor profile — fire-and-forget
      cassandraLink.setVisitorName(person.id, person.name);
      break;
    }

    default:
      console.warn('[avatarAction] Unknown action type:', action.type);
  }
}

module.exports = { executeAction };
