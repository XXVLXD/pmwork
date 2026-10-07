import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = ['Roadly — third-party software notices\n'];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev) continue;
  const folder = await readdir(path).catch(() => []);
  const licenses = folder.filter(name => /^(license|licence|copying|ofl)(\.|$)/i.test(name));
  notices.push(`\n${'='.repeat(72)}\n${path.replace(/^node_modules\//, '')} ${info.version}\nLicense: ${info.license ?? 'See below'}\n`);
  for (const license of licenses) notices.push(await readFile(join(path, license), 'utf8'));
}
notices.push('\nDejaVu Sans (embedded PDF font)\n', await readFile('public/fonts/LICENSE-DejaVu.txt', 'utf8'));
await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n'));
