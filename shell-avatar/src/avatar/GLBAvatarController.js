/**
 * GLBAvatarController — Three.js equivalent of AvatarController for GLB characters.
 *
 * Exposes the same public API as AvatarController so the rest of the system
 * (actionDispatcher, avatarAction.js, agentLoop) works unchanged.
 *
 * Gaze:       rotates Head_M bone (configurable via character.bones.head)
 * Mouth:      drives morph target 'Key 1' (character.morphs.mouth)
 * Idle:       plays the GLB's embedded Animation clip on loop
 * Head tilt:  rotates head bone on Z axis
 * Blush/expr: no-op (no blend shapes for emotion on Echo)
 *
 * Uses window.THREE and window.ThreeGLTFLoader loaded via <script type="importmap">
 * in index.html. Waits for 'three-ready' event if not yet available.
 */

class GLBAvatarController {
  constructor(canvas) {
    this.canvas   = canvas;
    this._three   = null;  // THREE namespace
    this._renderer = null;
    this._scene    = null;
    this._camera   = null;
    this._mixer    = null;
    this._clock    = null;
    this._headBone = null;
    this._neckBone = null;
    this._mesh     = null;  // mesh with morph targets
    this._mouthMorphIndex = -1;

    this._character = null;

    // Gaze state (same convention as AvatarController)
    this._gazeTargetX  = 0;
    this._gazeTargetY  = 0;
    this._gazeCurrentX = 0;
    this._gazeCurrentY = 0;
    this._gazeLerpFactor = 0.06;
    this._gazeMode = 'manual';
    this._gazeWorldState = null;

    // Mouth
    this._mouthTarget = 0;
    this._mouthOpen   = 0;

    // Head tilt (degrees)
    this._headTiltDeg = 0;

    // Idle animation
    this._breathPhase    = 0;
    this._headSwayPhase  = 0;
    this._nextBlinkTime  = Date.now() + this._randomBlinkInterval();

    this._rafId = null;
  }

  async init(modelUrl, character = null) {
    this._character = character;

    // Wait for Three.js (loaded via <script type="module"> in index.html)
    if (!window.THREE) {
      await new Promise(resolve =>
        window.addEventListener('three-ready', resolve, { once: true })
      );
    }
    if (!window.THREE) {
      console.error('[GLBAvatar] Three.js not available.');
      return;
    }

    const THREE      = window.THREE;
    const GLTFLoader = window.ThreeGLTFLoader;
    this._three = THREE;

    this._clock = new THREE.Clock();

    // Renderer — alpha:true so background canvas shows through
    this._renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setClearAlpha(0);
    const w = this.canvas.clientWidth  || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this._renderer.setSize(w, h);
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this._scene = new THREE.Scene();

    // Lighting
    this._scene.add(new THREE.AmbientLight(0xfff4e0, 3.0));
    const key = new THREE.DirectionalLight(0xfff8f0, 3.0);
    key.position.set(2, 4, 3);
    this._scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 1.0);
    fill.position.set(-3, 1, -1);
    this._scene.add(fill);

    // Camera
    this._camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 200);

    // Load GLB
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) =>
      loader.load(modelUrl, resolve, undefined, reject)
    );

    this._scene.add(gltf.scene);

    // Find head bone
    const headBoneName = character?.bones?.head ?? 'Head_M';
    const neckBoneName = character?.bones?.neck ?? null;
    const allBones = [];
    gltf.scene.traverse(obj => {
      if (obj.isBone || obj.isObject3D) {
        if (obj.name === headBoneName) this._headBone = obj;
        if (neckBoneName && obj.name === neckBoneName) this._neckBone = obj;
        if (obj.isBone) allBones.push(obj.name);
      }
      // Find mesh with morph targets — dump all morphs for diagnostics
      if (obj.isMesh && obj.morphTargetDictionary) {
        const morphNames = Object.keys(obj.morphTargetDictionary);
        console.log(`[GLBAvatar] Mesh "${obj.name}" morph targets:`, morphNames);

        const mouthName = character?.morphs?.mouth ?? 'Key 1';
        const idx = obj.morphTargetDictionary[mouthName];
        if (idx !== undefined) {
          this._mesh = obj;
          this._mouthMorphIndex = idx;
        }
      }
    });

    if (allBones.length > 0) {
      console.log(`[GLBAvatar] All bones (${allBones.length}):`, allBones.join(', '));
    }
    if (this._headBone) {
      console.log(`[GLBAvatar] Head bone found: ${headBoneName}`);
    } else {
      console.warn(`[GLBAvatar] Head bone "${headBoneName}" not found — gaze disabled.`);
    }
    if (this._mesh) {
      console.log(`[GLBAvatar] Mouth morph: "${character?.morphs?.mouth ?? 'Key 1'}" at index ${this._mouthMorphIndex}`);
    } else {
      console.warn('[GLBAvatar] No mouth morph found — beak animation disabled.');
    }

    // Play embedded idle animation on loop.
    // Head/neck tracks are stripped so our gaze code drives those bones cleanly.
    if (gltf.animations?.length > 0) {
      this._mixer = new THREE.AnimationMixer(gltf.scene);
      const clip = gltf.animations[0];

      // Diagnostic: log all tracks before filtering
      const allTrackNames = clip.tracks.map(t => t.name).join('\n  ');
      console.log(`[GLBAvatar] Animation tracks (${clip.tracks.length}):\n  ${allTrackNames}`);

      // Clone the clip and strip tracks we drive ourselves:
      //   - Head/neck rotation  → we control these for gaze
      //   - morphTargetInfluences → we control mouth morph directly
      const headBoneName = character?.bones?.head ?? 'Head_M';
      const neckBoneName = character?.bones?.neck ?? null;
      const filtered = clip.clone();
      filtered.tracks = filtered.tracks.filter(t => {
        const boneName = t.name.split('.')[0]; // e.g. "Head_M.quaternion" → "Head_M"
        if (boneName === headBoneName) return false;
        if (neckBoneName && boneName === neckBoneName) return false;
        // Strip morph animation — we drive morphTargetInfluences ourselves
        if (t.name.includes('morphTargetInfluences')) return false;
        return true;
      });
      const stripped = clip.tracks.length - filtered.tracks.length;
      if (stripped > 0) console.log(`[GLBAvatar] Stripped ${stripped} track(s) from animation (head/neck/morphs).`);

      this._mixer.clipAction(filtered).play();
      console.log(`[GLBAvatar] Playing animation: "${clip.name}"`);
    }

    // Auto-fit camera to model
    this._fitCamera(gltf.scene);

    // Resize handler
    window.addEventListener('resize', () => this._onResize());

    // Start loop
    this._rafId = requestAnimationFrame(() => this._loop());

    console.log(`[GLBAvatar] ${character?.name ?? 'GLB'} ready.`);
  }

  _fitCamera(model) {
    const THREE = this._three;
    const box    = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());

    const layout   = this._character?.layout ?? {};
    const scaleMult = layout.scale ?? 1.0;

    const maxDim   = Math.max(size.x, size.y, size.z);
    const fovRad   = (this._camera.fov * Math.PI) / 180;
    const distance = (maxDim / 2) / Math.tan(fovRad / 2) * (1.2 / scaleMult);

    // Position camera in front of model, looking at upper-third (more toward head)
    const focusY = center.y + size.y * 0.15;
    this._camera.position.set(center.x, focusY, center.z + distance);
    this._camera.lookAt(center.x, focusY, center.z);
    this._camera.near = distance / 100;
    this._camera.far  = distance * 10;
    this._camera.updateProjectionMatrix();
  }

  _loop() {
    this._rafId = requestAnimationFrame(() => this._loop());
    const dt = this._clock.getDelta();

    if (this._mixer) this._mixer.update(dt);

    this._updateGaze(dt);
    this._updateMouth(dt);
    this._updateIdle(dt);

    this._renderer.render(this._scene, this._camera);
  }

  _updateGaze(dt) {
    if (this._gazeMode === 'person' && this._gazeWorldState) {
      const ws = this._gazeWorldState;
      const active = ws.scene.people.find(p => p.id === ws.scene.activePerson);
      if (active?.screenPosition) {
        const normX = 1 - active.screenPosition.x;
        const normY = active.screenPosition.y;
        this._gazeTargetX = (normX - 0.5) * 2;
        this._gazeTargetY = (normY - 0.5) * -2;
      } else {
        this._gazeTargetX *= 0.9;
        this._gazeTargetY *= 0.9;
      }
    }

    const lf = this._gazeLerpFactor;
    this._gazeCurrentX += (this._gazeTargetX - this._gazeCurrentX) * lf;
    this._gazeCurrentY += (this._gazeTargetY - this._gazeCurrentY) * lf;

    if (this._headBone) {
      // Map gaze to bone rotation (radians): X = horizontal pan, Y = vertical tilt
      const targetRotY = -this._gazeCurrentX * 0.4;
      const targetRotX =  this._gazeCurrentY * 0.3;
      this._headBone.rotation.y = targetRotY;
      this._headBone.rotation.x = targetRotX;
      // Head tilt on Z
      this._headBone.rotation.z = (this._headTiltDeg * Math.PI) / 180;

      if (this._neckBone) {
        // Neck follows at 40% of head rotation for naturalistic movement
        this._neckBone.rotation.y = targetRotY * 0.4;
        this._neckBone.rotation.x = targetRotX * 0.4;
      }
    }
  }

  _updateMouth(dt) {
    const lf = 0.3;
    this._mouthOpen += (this._mouthTarget - this._mouthOpen) * lf;
    if (this._mesh && this._mouthMorphIndex >= 0) {
      this._mesh.morphTargetInfluences[this._mouthMorphIndex] = this._mouthOpen;
    }
  }

  _updateIdle(dt) {
    // Subtle procedural head sway independent of the skeleton animation
    this._headSwayPhase += dt * (Math.PI * 2) / 6;
    if (this._headBone) {
      // Add a gentle head bob on top of gaze rotation
      this._headBone.rotation.z += Math.sin(this._headSwayPhase) * 0.02;
    }
  }

  _onResize() {
    const w = this.canvas.clientWidth  || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
  }

  _randomBlinkInterval() {
    return 2000 + Math.random() * 4000;
  }

  // ─── Public API (mirrors AvatarController) ───────────────────────────────────

  setExpression(name) {
    // Echo has no expression morph targets — future: drive feather colors or head pose presets
  }

  resetExpression() {}

  playMotion(name) {
    // Future: trigger specific animation clips if the GLB has multiple
  }

  trackPerson(worldState) {
    this._gazeWorldState = worldState;
    this._gazeMode = 'person';
  }

  setGazeScreen(normX, normY) {
    this._gazeMode = 'manual';
    this._gazeTargetX = (normX - 0.5) * 2;
    this._gazeTargetY = (normY - 0.5) * -2;
  }

  setGazePerson(screenPosition) {
    if (!screenPosition) return;
    this._gazeMode = 'manual';
    this._gazeTargetX = (1 - screenPosition.x - 0.5) * 2;
    this._gazeTargetY = (screenPosition.y - 0.5) * -2;
  }

  setGazeAway() {
    this._gazeMode = 'manual';
    this._gazeTargetX = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.4);
    this._gazeTargetY = (Math.random() - 0.5) * 0.3;
  }

  setGazeCenter() {
    this._gazeMode = 'manual';
    this._gazeTargetX = 0;
    this._gazeTargetY = 0;
  }

  setMouthOpen(value) {
    this._mouthTarget = Math.max(0, Math.min(1, value));
  }

  setBlush(value) {
    // Future: drive a wing-flush animation or emissive color
  }

  setHeadTilt(degrees) {
    this._headTiltDeg = Math.max(-30, Math.min(30, degrees));
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._renderer?.dispose();
  }
}

module.exports = { GLBAvatarController };
