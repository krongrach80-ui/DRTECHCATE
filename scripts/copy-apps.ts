import fs from 'fs';
import path from 'path';

function copyDirSync(src: string, dest: string) {
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

console.log('Successfully copied all apps to public/');
