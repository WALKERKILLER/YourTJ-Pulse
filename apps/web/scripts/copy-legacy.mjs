import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const webRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(webRoot, '../..');
const distRoot = resolve(webRoot, 'dist');
const legacyAssets = resolve(distRoot, 'legacy-assets');

await mkdir(legacyAssets, { recursive: true });
await cp(resolve(repositoryRoot, 'public/assets'), legacyAssets, { recursive: true });
await mkdir(resolve(distRoot, 'brand'), { recursive: true });
await cp(resolve(repositoryRoot, 'repo-logo.png'), resolve(distRoot, 'brand/logo.png'));

const pages = [
  ['index.html', 'legacy-map'],
  ['editor.html', 'legacy-editor'],
  ['admin.html', 'legacy-admin'],
];

for (const [sourceName, routeName] of pages) {
  const source = await readFile(resolve(repositoryRoot, 'public', sourceName), 'utf8');
  const rewritten = source
    .replaceAll('assets/', '/legacy-assets/')
    .replaceAll('href="/editor.html"', 'href="/legacy-editor"');
  const target = resolve(distRoot, routeName);
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, 'index.html'), rewritten, 'utf8');
  await writeFile(resolve(distRoot, `${routeName}.html`), rewritten, 'utf8');
}
