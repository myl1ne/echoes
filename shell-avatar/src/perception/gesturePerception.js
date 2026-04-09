/**
 * Gesture Perception — touchscreen events → world state updates.
 *
 * STEP 7: Wire this in renderer.js by calling start().
 * Requires hammerjs.
 */

const { addGesture } = require('../state/worldState');

function start(targetEl) {
  targetEl = targetEl ?? document.getElementById('avatar-canvas');
  if (!targetEl) return;

  const Hammer = require('hammerjs');
  const mc = new Hammer.Manager(targetEl);

  mc.add(new Hammer.Tap({ event: 'doubletap', taps: 2 }));
  mc.add(new Hammer.Tap({ event: 'tap' }));
  mc.add(new Hammer.Press({ event: 'longpress', time: 800 }));
  mc.add(new Hammer.Swipe({ direction: Hammer.DIRECTION_ALL }));

  // Ensure doubletap fires before tap
  mc.get('doubletap').recognizeWith('tap');
  mc.get('tap').requireFailure('doubletap');

  mc.on('tap', (e) => {
    addGesture('tap', _normalizePos(e.center, targetEl));
  });
  mc.on('doubletap', (e) => {
    addGesture('doubletap', _normalizePos(e.center, targetEl));
  });
  mc.on('longpress', (e) => {
    addGesture('longpress', _normalizePos(e.center, targetEl));
  });
  mc.on('swipeleft', () => addGesture('swipe_left', null));
  mc.on('swiperight', () => addGesture('swipe_right', null));
  mc.on('swipeup', () => addGesture('swipe_up', null));
  mc.on('swipedown', () => addGesture('swipe_down', null));

  console.log('[gesture] Hammer.js gesture recognition started.');
}

function _normalizePos(center, el) {
  const rect = el.getBoundingClientRect();
  return {
    x: (center.x - rect.left) / rect.width,
    y: (center.y - rect.top) / rect.height,
  };
}

module.exports = { start };
