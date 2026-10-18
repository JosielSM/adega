import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
// Only these public files are deployed. SQL, secrets and source stay private.
for (const file of ['index.html', 'styles.css', 'app.js']) {
  await copyFile(file, `dist/${file}`);
}
