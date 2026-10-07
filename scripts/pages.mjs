import { copyFile, mkdir, writeFile } from 'node:fs/promises';

await mkdir('docs', { recursive: true });
await mkdir('downloads', { recursive: true });
await copyFile('dist/index.html', 'docs/index.html');
await copyFile('dist/THIRD_PARTY_NOTICES.txt', 'docs/THIRD_PARTY_NOTICES.txt');
await writeFile('docs/.nojekyll', '');
await copyFile('release/Roadly.zip', 'downloads/Roadly.zip');
await copyFile('release/Roadly-GitHub-Pages.zip', 'downloads/Roadly-GitHub-Pages.zip');
console.log('Prepared docs/ for GitHub Pages and downloads/ for browser downloads.');
