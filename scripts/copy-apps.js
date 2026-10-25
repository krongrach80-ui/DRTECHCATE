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
  copyDirSync(src, dest);
}

// Single-App Unification: Copy the unified kiosk app index.html to public/index.html,
// public/admin/index.html, and public/pt/index.html so all legacy direct paths and root
// URL serve the unified application SPA unconditionally.
const kioskIndexHtml = path.join(root, 'dist', 'apps', 'kiosk', 'index.html');
if (fs.existsSync(kioskIndexHtml)) {
  fs.copyFileSync(kioskIndexHtml, path.join(root, 'public', 'index.html'));
  fs.copyFileSync(kioskIndexHtml, path.join(root, 'public', 'admin', 'index.html'));
  fs.copyFileSync(kioskIndexHtml, path.join(root, 'public', 'pt', 'index.html'));
  console.log('✓ Unified SPA index.html copied to public/, public/admin/, and public/pt/');
}

console.log('Successfully copied all apps to public/');
