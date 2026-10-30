const fs = require('fs');
const path = require('path');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Source directory does not exist: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const root = path.resolve(__dirname, '..');
const apps = ['admin', 'pt', 'kiosk'];

for (const app of apps) {
  const src = path.join(root, 'dist', 'apps', app);
  const dest = path.join(root, 'public', app);
  console.log(`Copying ${src} -> ${dest}`);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  copyDirSync(src, dest);
}

// Root URL Single Page App entry: Copy kiosk index.html to public/index.html
const kioskIndexHtml = path.join(root, 'dist', 'apps', 'kiosk', 'index.html');
if (fs.existsSync(kioskIndexHtml)) {
  fs.copyFileSync(kioskIndexHtml, path.join(root, 'public', 'index.html'));
  console.log('✓ Root SPA entry index.html copied to public/');
}

// Ensure Self-Hosted Models & WASM (China GFW Immunity)
const srcWasm = path.resolve(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const publicModels = path.resolve(root, 'public', 'models');
const publicWasm = path.resolve(root, 'public', 'wasm');

// 1. Create pose_landmarker_lite.task alias if needed
const poseModel = path.join(publicModels, 'pose_landmarker.task');
const poseLiteModel = path.join(publicModels, 'pose_landmarker_lite.task');
if (fs.existsSync(poseModel) && !fs.existsSync(poseLiteModel)) {
  fs.copyFileSync(poseModel, poseLiteModel);
  console.log('✓ Created pose_landmarker_lite.task alias from pose_landmarker.task');
}

// 2. Ensure /wasm exists in public
if (fs.existsSync(srcWasm)) {
  copyDirSync(srcWasm, publicWasm);
  copyDirSync(srcWasm, path.join(publicModels, 'wasm'));
} else if (fs.existsSync(path.join(publicModels, 'wasm'))) {
  copyDirSync(path.join(publicModels, 'wasm'), publicWasm);
}

// 3. Mirror models and wasm into portal directories
for (const app of apps) {
  const appModels = path.join(root, 'public', app, 'models');
  const appWasm = path.join(root, 'public', app, 'wasm');
  if (fs.existsSync(publicModels)) {
    copyDirSync(publicModels, appModels);
  }
  if (fs.existsSync(publicWasm)) {
    copyDirSync(publicWasm, appWasm);
  }
}

console.log('✓ Successfully assembled all multi-portal production bundles and local GFW assets in public/');
