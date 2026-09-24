import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const source = JSON.parse(await readFile('scripts/verify/walden-example/source.json'));
await mkdir('.topostack/walden-example', { recursive: true });
await mkdir('docs/images/walden-example', { recursive: true });
const pdf = '.topostack/walden-example/source.pdf';
let bytes;
try { bytes = await readFile(pdf); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (!bytes) {
  const response = await fetch(source.pdfUrl);
  if (!response.ok) throw new Error(`Source download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(bytes).digest('hex') !== source.pdfSha256) throw new Error('USGS source checksum changed');
await writeFile(pdf, bytes);
const [left, top, right, bottom] = source.crop;
execFileSync('pdftoppm', ['-r', '288', '-x', String(left * 4), '-y', String(top * 4), '-W', String((right-left) * 4), '-H', String((bottom-top) * 4), '-png', '-singlefile', pdf, '.topostack/walden-example/source-crop']);
