import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

await mkdir('release', { recursive: true });
await copyFile('dist/index.html', 'release/Roadly.html');
await copyFile('dist/THIRD_PARTY_NOTICES.txt', 'release/THIRD_PARTY_NOTICES.txt');
const readme = await readFile('README.md', 'utf8');
await writeFile('release/START-HERE.txt', readme.split('## Для разработки')[0]);
execFileSync('python3', ['-c', `import pathlib, zipfile
root = pathlib.Path('release')
with zipfile.ZipFile(root / 'Roadly.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in ['Roadly.html', 'START-HERE.txt', 'THIRD_PARTY_NOTICES.txt']:
        archive.write(root / name, arcname=name)
with zipfile.ZipFile(root / 'Roadly-GitHub-Pages.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.write(root / 'Roadly.html', arcname='index.html')
    archive.write(root / 'THIRD_PARTY_NOTICES.txt', arcname='THIRD_PARTY_NOTICES.txt')
    archive.writestr('.nojekyll', '')
`], { stdio: 'inherit' });
console.log('Created release/Roadly.zip, release/Roadly.html and release/Roadly-GitHub-Pages.zip');
