/**
 * Renderer entry point.
 * Bootstraps all systems and wires them together.
 */

const { ipcRenderer } = require('electron');
const { AvatarController }    = require('./src/avatar/avatarController');
const { GLBAvatarController } = require('./src/avatar/GLBAvatarController');
const { CHARACTERS } = require('./src/avatar/characters');
const config = require('./config');
const { worldState, addEvent } = require('./src/state/worldState');
const { actionDispatcher } = require('./src/actions/actionDispatcher');
const { agentLoop } = require('./src/agent/agentLoop');
const speechUI = require('./src/ui/speechUI');
const { peopleStore } = require('./src/state/people/peopleStore');
const faceRecognition  = require('./src/perception/faceRecognition');
const { backgroundRenderer } = require('./src/bg/backgroundRenderer');
const { cassandraLink }      = require('./src/cassandra/cassandraLink');

// Character — localStorage overrides config (set by the dev model switcher, persists on reload)
const _savedChar = typeof localStorage !== 'undefined' && localStorage.getItem('character');
const character = CHARACTERS[_savedChar || config.character || 'airi'] ?? CHARACTERS['airi'];

const canvas    = document.getElementById('avatar-canvas');
const bgCanvas  = document.getElementById('bg-canvas');
const debugOverlay = document.getElementById('debug-overlay');

const isDev = process.env.NODE_ENV === 'development';

// References to debug panels (set during init, toggled later)
let _debugPanelEl = null;
let _charSwitcherEl = null;

async function init() {
  // Cassandra link — init early so fetchState() is warm before first LLM call
  cassandraLink.init(
    config.cassandraUrl,
    process.env.CASSANDRA_ADMIN_TOKEN
  );

  const isGLB = character.type === 'glb';

  // Cubism Core is only needed for Live2D characters
  if (!isGLB) {
    if (!window.Live2DCubismCore) {
      console.error(
        '[renderer] Live2D Cubism Core not found (window.Live2DCubismCore is undefined).\n' +
        'Check that lib/CubismSdkForWeb-5-r.4/Core/live2dcubismcore.min.js loaded without errors.'
      );
      return;
    }
    console.log('[renderer] Cubism Core OK:', window.Live2DCubismCore.VERSION);
  }

  // 0. Background — load GLB behind the avatar canvas
  if (config.background) {
    backgroundRenderer.init(bgCanvas, config.background, config.backgroundZoom ?? 1.0).catch(err =>
      console.warn('[renderer] Background load failed:', err.message)
    );
  }

  // 1. Avatar — pick controller based on character type
  console.log(`[renderer] Loading character "${character.name}" (${character.type ?? 'live2d'}) from ${character.modelPath}`);
  const avatar = isGLB ? new GLBAvatarController(canvas) : new AvatarController(canvas);
  await avatar.init(character.modelPath, character);
  avatar.trackPerson(worldState);
  console.log('[renderer] Avatar ready.');

  // 2. Action dispatcher — knows how to execute actions
  actionDispatcher.setAvatar(avatar);

  // 3. Agent loop — watches world state events, calls LLM
  agentLoop.start(worldState, actionDispatcher);

  // 4. People store — load from userData before perception starts
  const userDataPath = await ipcRenderer.invoke('app:getUserDataPath');
  peopleStore.load(userDataPath);

  // 5. Perception modules
  // Note: ./src/ prefix because __dirname in script-tag context = project root (shell-avatar/)
  const camera = require('./src/perception/cameraPerception');
  camera.start();

  // 6. Face recognition — runs on its own 2s interval; checks videoEl.readyState each tick
  const videoEl = document.getElementById('camera-feed');
  faceRecognition.start(videoEl);

  const speech = require('./src/perception/speechPerception');
  speech.start();

  // 5. Speech UI — must init before any speak actions fire
  speechUI.init();

  // ─── Debug UI ────────────────────────────────────────────────────────────────
  // Always initialized (hidden by default); toggled by backtick or long-press corner.

  // Text overlay — runs always; only meaningful when visible
  setInterval(() => {
    if (!debugOverlay.classList.contains('visible')) return;
    const s = worldState;
    const gx = avatar._gazeTargetX.toFixed(2);
    const gy = avatar._gazeTargetY.toFixed(2);
    const activePerson = s.scene.people.find(p => p.id === s.scene.activePerson);
    const activeLabel  = activePerson?.personName ?? activePerson?.id ?? 'none';
    debugOverlay.textContent = [
      `char: ${character.name}  people: ${s.scene.people.length}  active: ${activeLabel}`,
      `state: ${s.avatar.physicalState}  expr: ${s.avatar.currentExpression}`,
      `gaze: [${avatar._gazeMode}] x=${gx} y=${gy}`,
      `session: ${s.conversation.sessionActive ? 'active' : 'idle'}  events: ${s.events.length}`,
      `speech: ${s.speech.partialTranscript || '—'}`,
    ].join('\n');
  }, 200);

  // Camera + scene debug panels
  _initDebugPanel(avatar);

  // Model switcher
  _initCharacterSwitcher();

  // Show debug on start in dev mode
  if (isDev) _toggleDebug();

  // Dev-only: expression / gaze / action keyboard shortcuts
  if (isDev) {
    document.addEventListener('keydown', (e) => {
      switch (e.key) {
        case '1': avatar.setExpression('blush');    break;
        case '2': avatar.setExpression('happy');    break;
        case '3': avatar.setExpression('thinking'); break;
        case '4': avatar.setExpression('angry');    break;
        case '5': avatar.setExpression('sad');      break;
        case '6': avatar.setExpression('silly');    break; // Airi: gangimari; CIOKun: falls back
        case '0': avatar.resetExpression(); break;
        case 'g': avatar.setGazeScreen(0.5, 0.5); break; // look center
        case 'l': avatar.setGazeScreen(0.1, 0.5); break; // look left
        case 'r': avatar.setGazeScreen(0.9, 0.5); break; // look right
        case 'a': avatar.setGazeAway(); break;
        case 't':
          actionDispatcher.dispatch([
            { type: 'setExpression', name: 'happy' },
            { type: 'speak', text: 'Hello, welcome! How can I help you today?' },
          ]);
          break;
        case 'w':
          addEvent('person_entered', { estimatedDistance: 'near', position: 'center' });
          break;
        case 'm': {
          // Toggle mouth open for testing (GLB beak / Live2D mouth morph)
          const isOpen = avatar._mouthTarget > 0.1;
          avatar.setMouthOpen(isOpen ? 0 : 1);
          console.log(`[debug] mouth ${isOpen ? 'closed' : 'opened'}`);
          break;
        }
      }
    });
  }
}

// ─── Debug toggle ─────────────────────────────────────────────────────────────

function _toggleDebug() {
  const show = !debugOverlay.classList.contains('visible');
  debugOverlay.classList.toggle('visible', show);
  if (_debugPanelEl)    _debugPanelEl.style.display    = show ? 'flex' : 'none';
  if (_charSwitcherEl)  _charSwitcherEl.style.display  = show ? 'flex' : 'none';
}

// Keyboard toggle: backtick
document.addEventListener('keydown', (e) => {
  if (e.key === '`') _toggleDebug();
});

// Touch toggle: 2s long-press on the bottom-left corner (60×60px).
// Hidden from the user — doesn't interfere with normal touch interaction.
let _longPressTimer = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (t.clientX < 60 && t.clientY > window.innerHeight - 60) {
    _longPressTimer = setTimeout(() => {
      _toggleDebug();
      // Brief haptic if supported
      if (navigator.vibrate) navigator.vibrate(50);
    }, 2000);
  }
}, { passive: true });
document.addEventListener('touchend',  () => clearTimeout(_longPressTimer), { passive: true });
document.addEventListener('touchmove', () => clearTimeout(_longPressTimer), { passive: true });


/**
 * Camera feed + scene diagram panels in the top-right corner.
 * Hidden by default; shown via _toggleDebug().
 *
 * Camera panel: raw video with face bboxes (camera coords, note: X is mirrored vs display).
 * Scene panel:  front-view schematic with person dots (display coords, X corrected)
 *               and a gaze arrow from avatar.
 */
function _initDebugPanel(avatar) {
  const videoEl = document.getElementById('camera-feed');

  // Container — hidden until _toggleDebug() shows it
  const panel = document.createElement('div');
  panel.style.cssText = `
    display: none; flex-direction: column; gap: 6px;
    position: fixed; top: 10px; right: 10px; z-index: 10;
    pointer-events: none;
    font-family: monospace; font-size: 9px;
    color: rgba(255,200,100,0.7);
  `;
  document.body.appendChild(panel);
  _debugPanelEl = panel;

  function makeLabel(text) {
    const el = document.createElement('div');
    el.textContent = text;
    panel.appendChild(el);
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.style.cssText = `
      width: ${w}px; height: ${h}px; display: block;
      border: 1px solid rgba(255,255,255,0.12); border-radius: 2px;
    `;
    panel.appendChild(c);
    return c.getContext('2d');
  }

  makeLabel('▸ camera (raw — X mirrored vs display)');
  const camCtx = makeCanvas(240, 180);

  makeLabel('▸ scene / gaze (display coords)');
  const sceneCtx = makeCanvas(240, 120);

  setInterval(() => {
    if (_debugPanelEl.style.display === 'none') return;
    _drawCamera(camCtx, videoEl, 240, 180);
    _drawScene(sceneCtx, avatar, 240, 120);
  }, 100);
}

function _drawCamera(ctx, videoEl, W, H) {
  // Video frame
  if (videoEl && videoEl.readyState >= 2) {
    ctx.drawImage(videoEl, 0, 0, W, H);
  } else {
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px monospace';
    ctx.fillText('camera not ready', 8, H / 2);
  }

  // Face bboxes
  for (const p of worldState.scene.people) {
    const isActive = p.id === worldState.scene.activePerson;
    ctx.strokeStyle = isActive ? '#ff8800' : '#00cc44';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.strokeRect(p.bbox.x * W, p.bbox.y * H, p.bbox.width * W, p.bbox.height * H);

    ctx.fillStyle = isActive ? '#ff8800' : '#00cc44';
    ctx.font = '9px monospace';
    ctx.fillText(
      `${p.personName ?? p.id} ${p.estimatedDistance} ${(p.bbox.height).toFixed(2)}h`,
      p.bbox.x * W + 2,
      p.bbox.y * H - 2
    );
  }

  if (worldState.scene.people.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px monospace';
    ctx.fillText('no faces detected', 8, H - 8);
  }
}

function _drawScene(ctx, avatar, W, H) {
  // Background + grid
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Centre line
  ctx.strokeStyle = '#222';
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();

  // Detected people — display coords (X mirrored from camera)
  for (const p of worldState.scene.people) {
    const isActive = p.id === worldState.scene.activePerson;
    const px = (1 - p.screenPosition.x) * W;
    const py = p.screenPosition.y * H;

    ctx.fillStyle = isActive ? '#ff8800' : '#339933';
    ctx.beginPath();
    ctx.arc(px, py, isActive ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isActive ? '#ffaa44' : '#55aa55';
    ctx.font = '8px monospace';
    ctx.fillText(p.personName ?? p.id, px + 8, py + 3);
  }

  // Avatar at bottom-centre
  const ax = W / 2, ay = H - 12;
  ctx.fillStyle = '#4488ff';
  ctx.beginPath();
  ctx.arc(ax, ay, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#aaccff';
  ctx.font = '8px monospace';
  ctx.fillText('AV', ax - 6, ay + 3);

  // Gaze arrow
  // _gazeTargetX: -1=left +1=right; _gazeTargetY: +1=up(Live2D) -1=down
  const gx = avatar._gazeTargetX;
  const gy = avatar._gazeTargetY;
  const arrowX = ax + gx * 45;
  const arrowY = ay - gy * 45; // flip Y for screen space

  ctx.strokeStyle = '#ffff44';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(arrowX, arrowY);
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(arrowY - ay, arrowX - ax);
  ctx.beginPath();
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(arrowX - 7 * Math.cos(angle - 0.4), arrowY - 7 * Math.sin(angle - 0.4));
  ctx.moveTo(arrowX, arrowY);
  ctx.lineTo(arrowX - 7 * Math.cos(angle + 0.4), arrowY - 7 * Math.sin(angle + 0.4));
  ctx.stroke();

  // Status line
  ctx.fillStyle = 'rgba(255,200,100,0.5)';
  ctx.font = '8px monospace';
  ctx.fillText(
    `[${avatar._gazeMode}] gx=${gx.toFixed(2)} gy=${gy.toFixed(2)}`,
    4, H - 4
  );
}

/**
 * Floating character switcher in the bottom-right corner.
 * Hidden by default; shown via _toggleDebug().
 * Clicking a button stores the selection in localStorage and reloads.
 */
function _initCharacterSwitcher() {
  const panel = document.createElement('div');
  panel.style.cssText = `
    display: none; gap: 5px; align-items: center;
    position: fixed; bottom: 10px; right: 10px; z-index: 10;
    font-family: monospace; font-size: 10px;
    color: rgba(255,200,100,0.5);
  `;
  document.body.appendChild(panel);
  _charSwitcherEl = panel;

  const label = document.createElement('span');
  label.textContent = 'char:';
  panel.appendChild(label);

  for (const [id, char] of Object.entries(CHARACTERS)) {
    const isActive = id === character.id;
    const btn = document.createElement('button');
    btn.textContent = char.name;
    btn.style.cssText = `
      padding: 3px 9px;
      background: ${isActive ? 'rgba(255,170,0,0.25)' : 'rgba(0,0,0,0.35)'};
      border: 1px solid ${isActive ? 'rgba(255,170,0,0.55)' : 'rgba(255,255,255,0.12)'};
      color: ${isActive ? '#ffaa00' : 'rgba(255,255,255,0.4)'};
      border-radius: 3px; cursor: pointer;
      font-family: monospace; font-size: 10px;
    `;
    btn.addEventListener('click', () => {
      localStorage.setItem('character', id);
      location.reload();
    });
    panel.appendChild(btn);
  }
}

init().catch(err => {
  console.error('[renderer] Init failed:', err);
});
