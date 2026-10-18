import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
// Only these public files are deployed. SQL, secrets and source stay private.
for (const file of ['index.html', 'styles.css', 'auth.css', 'app.js', 'auth.js', 'visual.js']) {
  await copyFile(file, `dist/${file}`);
}
await mkdir('dist/assets', { recursive: true });
await copyFile('assets/adega-bar.png', 'dist/assets/adega-bar.png');

await copyFile('assets/logo.svg', 'dist/assets/logo.svg');

for (const file of ['manifest.webmanifest', 'sw.js', 'offline.html', 'pwa.js']) await copyFile(file, 'dist/' + file);
for (const size of [192,512]) await copyFile('assets/icon-' + size + '.png', 'dist/assets/icon-' + size + '.png');
