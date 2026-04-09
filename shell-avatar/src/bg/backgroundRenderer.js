/**
 * Background renderer — Three.js GLB scene rendered behind the Live2D avatar.
 *
 * Three.js and GLTFLoader are loaded via <script type="module"> in index.html
 * (window.THREE / window.ThreeGLTFLoader), dispatching 'three-ready' when done.
 * This avoids the CJS/ESM conflict that occurs when importing three addons
 * via require() in Electron's renderer process.
 *
 * Any animations embedded in the GLB are auto-played.
 * Camera is auto-fitted to the model's bounding box on load and on resize.
 */

class BackgroundRenderer {
  constructor() {
    this._renderer  = null;
    this._scene     = null;
    this._camera    = null;
    this._mixer     = null;
    this._clock     = null;
    this._rafId     = null;
  }

  async init(canvas, glbPath, zoom = 1.0) {
    this._zoom = zoom;
    // Wait for Three.js to finish loading via <script type="module"> in index.html
    if (!window.THREE) {
      await new Promise(resolve =>
        window.addEventListener('three-ready', resolve, { once: true })
      );
    }
    if (!window.THREE) {
      console.warn('[bg] Three.js not available — background disabled.');
      return;
    }

    const THREE      = window.THREE;
    const GLTFLoader = window.ThreeGLTFLoader;

    this._clock = new THREE.Clock();

    // Renderer
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this._renderer.setSize(w, h);
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this._scene = new THREE.Scene();

    // Lights — warm ambient + directional fill
    this._scene.add(new THREE.AmbientLight(0xfff4e0, 2.0));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.5);
    sun.position.set(3, 6, 4);
    this._scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.8);
    fill.position.set(-4, 2, -2);
    this._scene.add(fill);

    // Camera
    this._camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 200);

    // Load GLB
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) =>
      loader.load(glbPath, resolve, undefined, reject)
    );

    this._scene.add(gltf.scene);
    this._fitCamera(gltf.scene, THREE);

    // Play embedded animations if any
    if (gltf.animations?.length > 0) {
      this._mixer = new THREE.AnimationMixer(gltf.scene);
      for (const clip of gltf.animations) {
        this._mixer.clipAction(clip).play();
      }
      console.log(`[bg] Playing ${gltf.animations.length} animation(s) from GLB.`);
    }

    window.addEventListener('resize', () => this._onResize());
    this._animate();

    console.log(`[bg] Background loaded: ${glbPath}`);
  }

  _fitCamera(model, THREE) {
    const box    = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());

    const maxDim   = Math.max(size.x, size.y, size.z);
    const fovRad   = (this._camera.fov * Math.PI) / 180;
    const distance = (maxDim / 2) / Math.tan(fovRad / 2) * (this._zoom ?? 1.0);

    this._camera.position.set(center.x, center.y, center.z + distance);
    this._camera.lookAt(center);
    this._camera.near = distance / 100;
    this._camera.far  = distance * 10;
    this._camera.updateProjectionMatrix();
  }

  _animate() {
    this._rafId = requestAnimationFrame(() => this._animate());
    const dt = this._clock.getDelta();
    if (this._mixer) this._mixer.update(dt);
    this._renderer.render(this._scene, this._camera);
  }

  _onResize() {
    const canvas = this._renderer.domElement;
    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._renderer?.dispose();
  }
}

const backgroundRenderer = new BackgroundRenderer();
module.exports = { backgroundRenderer };
