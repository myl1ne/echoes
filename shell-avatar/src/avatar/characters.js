/**
 * Character definitions — model paths + semantic expression/motion mappings.
 *
 * type: 'live2d' (default) — pixi-live2d-display / Cubism 4
 *       'glb'              — Three.js GLB, driven by GLBAvatarController
 *
 * Live2D fields:
 *   expressions: semantic name → .exp3.json filename (null = reset)
 *   motions:     semantic name → { group, index } from model3.json
 *   params:      standard Cubism param ID → model-specific ID override
 *
 * GLB fields:
 *   expressions: semantic name → morph target name (null = reset, 'n/a' = unsupported)
 *   bones:       { head, jaw } — skeleton node names for gaze + mouth
 *   morphs:      { mouth } — morph target name for mouth open
 *
 * layout — optional positioning (both types):
 *   scale:   multiplier on auto-fit scale (default 1.0)
 *   yOffset: shift in canvas-height fractions — negative = up (default 0)
 *
 * To switch characters: set config.character = 'airi' | 'ciokun' | 'echo'.
 */

const CHARACTERS = {

  echo: {
    id:        'echo',
    name:      'Echo',
    type:      'glb',
    modelPath: './Characters/Echo/source/bluebird mouth.glb',

    // Echo has one morph target for mouth (Key 1) — no expression blend shapes.
    // Emotions are conveyed through head movement and the idle animation.
    expressions: {
      neutral:  null,
      happy:    null,
      sad:      null,
      angry:    null,
      thinking: null,
    },

    // Bone names from the GLB skeleton (found via parameter dump):
    bones: {
      head: 'Head_M',  // rotated for gaze (X = up/down, Y = left/right, Z = tilt)
      neck: 'Neck_M',  // secondary gaze influence
    },

    // Morph target for mouth open (index 0 in the mesh, name 'Key 1')
    morphs: {
      mouth: 'Key 1',
    },

    // Camera framing: slightly above center so the bird's head is prominent
    layout: { scale: 1.0, yOffset: 0 },
  },

  airi: {
    id:        'airi',
    name:      'Airi',
    modelPath: './Characters/Airi/VOLsAI/volsai.model3.json',

    // Semantic name → expression filename (null = reset to default)
    expressions: {
      neutral:  null,
      happy:    'exp_02_smile.exp3.json',
      sad:      'exp_05_sad.exp3.json',
      angry:    'exp_04_angry.exp3.json',
      thinking: 'exp_03_pale.exp3.json',
      blush:    'exp_01_dere.exp3.json',
      silly:    'exp_06_gangimari.exp3.json',  // Airi-specific — giddy/dazed
    },

    // Airi's model3.json has no Motions groups — no motion() calls available.
    motions: {},

    // layout: default (fill canvas height, y=0)
  },

  ciokun: {
    id:        'ciokun',
    name:      'CIOKun',
    modelPath: './Characters/CIOKun/hosinoko.model3.json',

    expressions: {
      neutral:  'reset.exp3.json',
      happy:    'warai1.exp3.json',
      sad:      'komari.exp3.json',
      angry:    'warai2.exp3.json',
      thinking: 'metoji.exp3.json',   // eyes-closed / contemplative
      blush:    'yorokobi.exp3.json', // joy/delight
      smug:     'doya.exp3.json',     // CIOKun-specific — doyagao
    },

    // model3.json Motions group "Emotion": [ozigi(0), raise(1), hikaru(2)]
    motions: {
      bow:     { group: 'Emotion', index: 0 },  // ozigi — greeting bow
      raise:   { group: 'Emotion', index: 1 },  // raise arms
      sparkle: { group: 'Emotion', index: 2 },  // hikaru — light up
    },

    // Adjust if model appears cut off — scale down slightly and shift up
    layout: { scale: 0.8, yOffset: -0.1 },

    // Parameter name overrides — map standard Cubism IDs to this model's actual IDs.
    // Run npm run dev with CIOKun selected and check the console for the full parameter list.
    // Standard names (used as keys):  ParamEyeBallX, ParamEyeBallY, ParamAngleX, ParamAngleY,
    //   ParamAngleZ, ParamMouthOpenY, ParamBreath, ParamEyeROpen, ParamEyeLOpen,
    //   ParamBodyAngleX, ParamBodyAngleZ, ParamCheek
    // Example: params: { ParamEyeBallX: 'PARAM_EYE_BALL_X', ParamAngleX: 'PARAM_ANGLE_X' }
    params: {},
  },

};

module.exports = { CHARACTERS };
