import fs from 'fs';
import path from 'path';
import https from 'https';

async function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return download(res.headers.location, dest).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
        }
        const fileStream = fs.createWriteStream(dest);
        res.pipe(fileStream);
        fileStream.on('finish', () => fileStream.close(() => resolve()));
        fileStream.on('error', reject);
      })
      .on('error', reject);
  });
}

export async function ensureModelsDownloaded(): Promise<void> {
  const publicModels = path.resolve(process.cwd(), 'public', 'models');
  fs.mkdirSync(publicModels, { recursive: true });

  const models = [
    {
      name: 'face_landmarker.task',
      url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
    },
    {
      name: 'hand_landmarker.task',
      url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
    },
    {
      name: 'pose_landmarker.task',
      url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
    },
  ];

  for (const model of models) {
    const dest = path.join(publicModels, model.name);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
      console.log(`Downloading ${model.name}...`);
      await download(model.url, dest);
      console.log(`Downloaded ${model.name} (${fs.statSync(dest).size} bytes)`);
    } else {
      console.log(`Model ${model.name} already exists (${fs.statSync(dest).size} bytes)`);
    }
  }

  // Copy wasm
  const srcWasm = path.resolve(process.cwd(), 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  const appTargets = [
    path.resolve(process.cwd(), 'public', 'models'),
    path.resolve(process.cwd(), 'apps', 'kiosk', 'public', 'models'),
    path.resolve(process.cwd(), 'apps', 'pt', 'public', 'models'),
    path.resolve(process.cwd(), 'apps', 'admin', 'public', 'models'),
  ];

  for (const targetDir of appTargets) {
    fs.mkdirSync(targetDir, { recursive: true });
    // Copy models
    for (const model of models) {
      const srcFile = path.join(publicModels, model.name);
      const destFile = path.join(targetDir, model.name);
      if (srcFile !== destFile) {
        fs.copyFileSync(srcFile, destFile);
      }
    }

    // Copy wasm subfolder
    if (fs.existsSync(srcWasm)) {
      const wasmDest = path.join(targetDir, 'wasm');
      fs.mkdirSync(wasmDest, { recursive: true });
      for (const wFile of fs.readdirSync(srcWasm)) {
        fs.copyFileSync(path.join(srcWasm, wFile), path.join(wasmDest, wFile));
      }
    }
  }

  console.log('Successfully installed all models and WASM files to all public targets.');
}

if (process.argv[1] && process.argv[1].endsWith('download-models.ts')) {
  ensureModelsDownloaded().catch((err) => {
    console.error('Download models failed:', err);
    process.exit(1);
  });
}
