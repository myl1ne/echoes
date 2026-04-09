const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Load .env — path differs between dev and packaged builds.
// Dev:      __dirname = shell-avatar/, .env is one level up in the repo root
// Packaged: __dirname is inside asar; .env should live in resources/ next to app.asar
const _envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.resolve(__dirname, '../.env');
require('dotenv').config({ path: _envPath });

const config = require('./config');
let mainWindow;

// ─── Whisper ASR (main process) ───────────────────────────────────────────────
// @xenova/transformers is ESM-only. Node.js dynamic import() resolves bare
// specifiers (e.g. "@huggingface/jinja") from node_modules correctly —
// unlike Chromium's module loader, which would reject them.
let _asrPipeline    = null;
let _asrInitPromise = null;

async function _initAsr() {
  try {
    console.log('[asr] Loading Whisper pipeline...');
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowRemoteModels = true;
    _asrPipeline = await pipeline(
      'automatic-speech-recognition',
      config.asr.whisper.model,
      { quantized: true }
    );
    console.log('[asr] Whisper pipeline ready.');
    return { ok: true };
  } catch (err) {
    console.error('[asr] Pipeline init failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// People store — expose userData path to renderer for people.json persistence.
ipcMain.handle('app:getUserDataPath', () => app.getPath('userData'));

// Deduplicated: multiple calls before resolution all share the same promise.
ipcMain.handle('asr:init', () => {
  if (!_asrInitPromise) _asrInitPromise = _initAsr();
  return _asrInitPromise;
});

ipcMain.handle('asr:transcribe', async (_event, floatArray) => {
  if (!_asrPipeline) return { text: null };
  try {
    // floatArray is a Float32Array cloned via structured-clone over IPC
    const audio  = floatArray instanceof Float32Array ? floatArray : new Float32Array(floatArray);
    const result = await _asrPipeline(audio, { sampling_rate: 16000 });
    return { text: result?.text?.trim() || null };
  } catch (err) {
    console.warn('[asr] Transcription error:', err.message);
    return { text: null, error: err.message };
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 1600,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // allow local file:// assets (model textures)
    },
  });

  mainWindow.loadFile('index.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
