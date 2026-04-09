/**
 * AvatarController — wraps pixi-live2d-display.
 *
 * Exposes a clean API for expressions, motions, gaze, mouth (lip sync), and idle animation.
 * Directly drives Live2D parameters for real-time responsiveness.
 *
 * Accepts a character definition from src/avatar/characters.js — expression and motion
 * names are semantic (e.g. 'happy', 'bow') and mapped to character-specific filenames.
 *
 * Key parameters:
 *   ParamEyeBallX/Y     — gaze direction (-1 to 1)
 *   ParamAngleX/Y/Z     — head rotation
 *   ParamMouthOpenY     — mouth open (0–1, lip sync)
 *   ParamBreath         — breathing cycle (0–1)
 *   ParamEyeROpen       — right eye open (0–1)
 *   ParamEyeLOpen       — left eye open (0–1)
 *   ParamBodyAngleX/Y/Z — body rotation
 *   ParamCheek          — blush intensity (0–1)
 */

const PIXI = require('pixi.js');
// pixi-live2d-display requires window.PIXI before loading
window.PIXI = PIXI;
// Use the cubism4-only bundle — avoids the Cubism 2 runtime requirement.
// Requires window.LIVE2DCUBISMCORE (live2dcubismcore.min.js) to be loaded via <script> in HTML.
const { Live2DModel } = require('pixi-live2d-display/cubism4');

// Register PIXI ticker so Live2D animations update
Live2DModel.registerTicker(PIXI.Ticker);

class AvatarController {
  constructor(canvas) {
    this.canvas = canvas;
    this.app    = null;
    this.model  = null;

    // Character definition from characters.js (set in init)
    this._character = null;

    // Smooth gaze target (lerped per frame)
    this._gazeTargetX = 0;
    this._gazeTargetY = 0;
    this._gazeCurrentX = 0;
    this._gazeCurrentY = 0;
    this._gazeLerpFactor = 0.08;

    // 'manual' = target set once; 'person' = track activePerson each tick
    this._gazeMode = 'manual';
    this._gazeWorldState = null;

    // Idle animation state
    this._breathPhase = 0;
    this._headSwayPhase = 0;
    this._nextBlinkTime = Date.now() + this._randomBlinkInterval();

    // Mouth (set externally by lip sync)
    this._mouthOpen = 0;
    this._mouthTarget = 0;
  }

  async init(modelUrl, character = null) {
    this._character = character;
    this.app = new PIXI.Application({
      view: this.canvas,
      transparent: true,
      resizeTo: this.canvas,
      antialias: true,
    });

    this.model = await Live2DModel.from(modelUrl, {
      autoInteract: false, // we handle interaction ourselves
    });

    this.app.stage.addChild(this.model);
    this._fitToCanvas();

    // Dev: log all parameter IDs so non-standard models can be mapped in characters.js.
    // The framework coreModel doesn't expose getParameterId; use the raw WASM model instead.
    if (process.env.NODE_ENV === 'development') {
      try {
        const nativeParams = this.model.internalModel.coreModel._model?.parameters;
        if (nativeParams) {
          const ids = Array.from({ length: nativeParams.count }, (_, i) => nativeParams.ids[i]);
          console.log(`[avatar] ${character?.name ?? 'model'} parameters (${ids.length}):`, ids.join(', '));
        } else {
          console.warn('[avatar] Parameter dump: _model.parameters not accessible.');
        }
      } catch (err) {
        console.warn('[avatar] Parameter dump failed:', err.message);
      }
    }

    // Run per-frame idle + gaze loop
    this.app.ticker.add(() => this._tick());

    // Resize handler
    window.addEventListener('resize', () => this._fitToCanvas());
  }

  _fitToCanvas() {
    if (!this.model) return;
    const { width, height } = this.app.screen;

    const modelNaturalH = this.model.internalModel.height;
    const modelNaturalW = this.model.internalModel.width;

    // Per-character layout overrides (tunable in characters.js)
    const layout     = this._character?.layout ?? {};
    const scaleMult  = layout.scale   ?? 1;
    const yOffsetPct = layout.yOffset ?? 0;  // fraction of canvas height

    const scale = (height / modelNaturalH) * scaleMult;

    this.model.scale.set(scale);
    this.model.x = (width  - modelNaturalW * scale) / 2;
    this.model.y = yOffsetPct * height;

    console.log(`[avatar] fit: model=${modelNaturalW}x${modelNaturalH} scale=${scale.toFixed(3)} x=${this.model.x.toFixed(0)} y=${this.model.y.toFixed(0)}`);
  }

  _tick() {
    if (!this.model) return;
    const dt = this.app.ticker.deltaMS / 1000; // seconds

    this._updateGaze(dt);
    this._updateIdle(dt);
    this._updateMouth(dt);
    this._checkBlink();
  }

  _updateGaze(dt) {
    if (this._gazeMode === 'person' && this._gazeWorldState) {
      const ws = this._gazeWorldState;
      const active = ws.scene.people.find(p => p.id === ws.scene.activePerson);
      if (active?.screenPosition) {
        // Mirror X: front-facing camera is horizontally flipped relative to display.
        // Camera x=0.2 (person on camera-left) = person on screen-right = avatar looks right.
        const normX = 1 - active.screenPosition.x;
        const normY = active.screenPosition.y;
        this._gazeTargetX = (normX - 0.5) * 2;
        this._gazeTargetY = (normY - 0.5) * -2;
      } else {
        // No person visible — drift back to center
        this._gazeTargetX *= 0.9;
        this._gazeTargetY *= 0.9;
      }
    }

    // Lerp current gaze toward target
    const lf = this._gazeLerpFactor;
    this._gazeCurrentX += (this._gazeTargetX - this._gazeCurrentX) * lf;
    this._gazeCurrentY += (this._gazeTargetY - this._gazeCurrentY) * lf;

    this._setParam('ParamEyeBallX', this._gazeCurrentX);
    this._setParam('ParamEyeBallY', this._gazeCurrentY);
    // Head follows gaze slightly
    this._setParam('ParamAngleX', this._gazeCurrentX * 15);
    this._setParam('ParamAngleY', this._gazeCurrentY * -10);
  }

  _updateIdle(dt) {
    // Breathing: 4-second cycle
    this._breathPhase += dt * (Math.PI * 2) / 4;
    const breath = (Math.sin(this._breathPhase) + 1) / 2; // 0–1
    this._setParam('ParamBreath', breath);
    // Subtle body sway from breath
    this._setParam('ParamBodyAngleZ', Math.sin(this._breathPhase * 0.5) * 1.5);

    // Very subtle head sway: 8-second cycle
    this._headSwayPhase += dt * (Math.PI * 2) / 8;
    const sway = Math.sin(this._headSwayPhase) * 2; // ±2 degrees
    // Blend with gaze-driven angle
    const currentAngleZ = this._getParam('ParamAngleZ') ?? 0;
    this._setParam('ParamAngleZ', sway * 0.3);
  }

  _updateMouth(dt) {
    // Smooth mouth open toward target (set by lip sync)
    const lf = 0.3;
    this._mouthOpen += (this._mouthTarget - this._mouthOpen) * lf;
    this._setParam('ParamMouthOpenY', this._mouthOpen);
  }

  _checkBlink() {
    const now = Date.now();
    if (now >= this._nextBlinkTime) {
      this._blink();
      this._nextBlinkTime = now + this._randomBlinkInterval();
    }
  }

  _blink() {
    // Close eyes over 80ms, open over 100ms
    let t = 0;
    const close = setInterval(() => {
      t += 16;
      const v = 1 - Math.min(t / 80, 1);
      this._setParam('ParamEyeROpen', v);
      this._setParam('ParamEyeLOpen', v);
      if (t >= 80) {
        clearInterval(close);
        t = 0;
        const open = setInterval(() => {
          t += 16;
          const v2 = Math.min(t / 100, 1);
          this._setParam('ParamEyeROpen', v2);
          this._setParam('ParamEyeLOpen', v2);
          if (t >= 100) clearInterval(open);
        }, 16);
      }
    }, 16);
  }

  _randomBlinkInterval() {
    return 2000 + Math.random() * 4000; // 2–6 seconds
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Set expression by semantic name ('happy', 'sad', etc.) as defined in characters.js.
   * Falls back to treating the name as a raw filename if not found in the character map.
   */
  setExpression(name) {
    if (!this.model) return;
    const map = this._character?.expressions;
    if (map && name in map) {
      const filename = map[name];
      filename === null ? this.model.expression() : this.model.expression(filename);
    } else {
      this.model.expression(name); // raw filename fallback
    }
  }

  /**
   * Reset to default expression.
   */
  resetExpression() {
    if (!this.model) return;
    this.model.expression(); // no arg = reset
  }

  /**
   * Play a named motion from the character's motion map.
   * Motion must be defined in the character's model3.json Motions section.
   * No-op with warning if the character has no such motion.
   */
  playMotion(name) {
    if (!this.model) return;
    const m = this._character?.motions?.[name];
    if (!m) {
      console.warn(`[avatar] playMotion: no motion "${name}" for ${this._character?.id ?? 'character'}`);
      return;
    }
    this.model.motion(m.group, m.index);
  }

  /**
   * Continuously track the active person from worldState (updated each tick).
   * Front-facing camera X is mirrored — handled internally.
   */
  trackPerson(worldState) {
    this._gazeWorldState = worldState;
    this._gazeMode = 'person';
  }

  /**
   * Set gaze toward a normalized screen position (0–1, 0–1). One-shot.
   * x=0 is left, x=1 is right, y=0 is top, y=1 is bottom.
   */
  setGazeScreen(normX, normY) {
    this._gazeMode = 'manual';
    this._gazeTargetX = (normX - 0.5) * 2;
    this._gazeTargetY = (normY - 0.5) * -2;
  }

  /**
   * Look at a person by their face screenPosition {x, y} (normalized 0–1). One-shot.
   */
  setGazePerson(screenPosition) {
    if (!screenPosition) return;
    this._gazeMode = 'manual';
    this._gazeTargetX = (1 - screenPosition.x - 0.5) * 2;  // mirror X
    this._gazeTargetY = (screenPosition.y - 0.5) * -2;
  }

  /**
   * Look away (gaze drifts off to the side).
   */
  setGazeAway() {
    this._gazeMode = 'manual';
    this._gazeTargetX = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.4);
    this._gazeTargetY = (Math.random() - 0.5) * 0.4;
  }

  /**
   * Look straight at camera / viewer.
   */
  setGazeCenter() {
    this._gazeMode = 'manual';
    this._gazeTargetX = 0;
    this._gazeTargetY = 0;
  }

  /**
   * Set mouth open value for lip sync (0–1).
   * Called continuously during speech.
   */
  setMouthOpen(value) {
    this._mouthTarget = Math.max(0, Math.min(1, value));
  }

  /**
   * Set blush intensity (0–1).
   */
  setBlush(value) {
    this._setParam('ParamCheek', Math.max(0, Math.min(1, value)));
  }

  /**
   * Tilt head — e.g. curious listening pose.
   * angle in degrees, -30 to 30.
   */
  setHeadTilt(degrees) {
    this._setParam('ParamAngleZ', Math.max(-30, Math.min(30, degrees)));
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  _setParam(id, value) {
    // Allow per-character parameter name overrides (set in characters.js params: {})
    const mappedId = this._character?.params?.[id] ?? id;
    try {
      this.model?.internalModel.coreModel.setParameterValueById(mappedId, value);
    } catch (_) {
      // param not found — ignore
    }
  }

  _getParam(id) {
    const mappedId = this._character?.params?.[id] ?? id;
    try {
      return this.model?.internalModel.coreModel.getParameterValueById(mappedId);
    } catch (_) {
      return null;
    }
  }
}

module.exports = { AvatarController };
