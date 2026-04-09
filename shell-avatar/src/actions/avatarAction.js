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
      const activeId     = worldState.scene.activePerson;
      const activeFace   = worldState.scene.people.find(p => p.id === activeId);
      const descriptor   = faceRecognition.getActiveDescriptor();

      let person = null;

      // Priority 1: worldState already has a personId for this face (recognition ran)
      // → use that exact entry, just update the name
      if (activeFace?.personId) {
        person = peopleStore.get(activeFace.personId);
        if (person) {
          person.name = action.name;
          peopleStore.save();
          console.log(`[avatarAction] Named existing person: "${person.name}" (id: ${person.id})`);
        }
      }

      // Priority 2: no personId yet — try descriptor match, then create new
      if (!person && descriptor) {
        const { recognition: recConfig } = require('../../config');
        const existing = peopleStore.findByDescriptor(descriptor, recConfig.threshold * 1.3);
        if (existing) {
          existing.name = action.name;
          peopleStore.save();
          person = existing;
          console.log(`[avatarAction] Named by descriptor match: "${person.name}" (id: ${person.id})`);
        } else {
          person = peopleStore.register(descriptor, action.name);
          console.log(`[avatarAction] Registered new person: "${person.name}" (id: ${person.id})`);
        }
      }

      if (!person) {
        console.warn('[avatarAction] registerPerson: could not resolve person — no face data available.');
        break;
      }

      // Update worldState in-place
      if (activeFace) {
        activeFace.personId   = person.id;
        activeFace.personName = person.name;
        activeFace.isKnown    = true;
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
