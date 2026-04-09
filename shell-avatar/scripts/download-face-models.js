/**
 * Download face-api.js model weights to shell-avatar/models/face-api/
 *
 * Run once before starting the app:
 *   node scripts/download-face-models.js
 *
 * Models downloaded (~7MB total):
 *   - tiny_face_detector   — fast face detection for alignment
 *   - face_landmark_68     — 68-point landmarks (needed for aligned descriptor)
 *   - face_recognition     — 128D identity descriptor
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const OUT_DIR  = path.join(__dirname, '../models/face-api');
const BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

const FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
];

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function download(filename) {
  const url      = `${BASE_URL}/${filename}`;
  const destPath = path.join(OUT_DIR, filename);

  if (fs.existsSync(destPath)) {
    console.log(`  [skip] ${filename} already exists`);
    return;
  }

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        const size = fs.statSync(destPath).size;
        console.log(`  [ok]   ${filename} (${(size / 1024).toFixed(0)}KB)`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

(async () => {
  console.log(`Downloading face-api.js models to ${OUT_DIR}\n`);
  for (const file of FILES) {
    try {
      await download(file);
    } catch (err) {
      console.error(`  [fail] ${file}: ${err.message}`);
    }
  }
  console.log('\nDone. Start the app: npm start');
})();
