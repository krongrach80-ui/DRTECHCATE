const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'),
  path.join(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.js'),
];

for (const t of targets) {
  if (fs.existsSync(t)) {
    let content = fs.readFileSync(t, 'utf8');
    if (content.includes('odml.pa.googleapis.com')) {
      content = content.replace(/https:\/\/odml\.pa\.googleapis\.com\/v1\/log/g, '/api/health');
      fs.writeFileSync(t, content, 'utf8');
      console.log(`✓ Neutralized GFW-blocked Google telemetry endpoint in ${t}`);
    }
  }
}
