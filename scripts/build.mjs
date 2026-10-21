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
await copyFile('navigation.js', 'dist/navigation.js');
await copyFile('profile.js', 'dist/profile.js');
await copyFile('sync.js', 'dist/sync.js');
for (const file of ['catalog.html','catalog.css','catalog.js','catalog-settings.js']) await copyFile(file, 'dist/' + file);
await copyFile('cart.js', 'dist/cart.js');
await copyFile('no-zoom.js', 'dist/no-zoom.js');
for (const file of ['controls.js','controls.css']) await copyFile(file, 'dist/' + file);

await copyFile('product-form.js', 'dist/product-form.js');

await copyFile('money-inputs.js', 'dist/money-inputs.js');

await copyFile('product-images.js', 'dist/product-images.js');
