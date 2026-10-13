import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const files = [
  'src/ming-editor-core.js',
  'src/ming-markdown-import.js',
  'src/ming-markdown-renderer.js',
  'src/ming-long-editor.js',
  'src/ming-long-editor.css',
  'demo/index.html',
  'README.md',
  'LICENSE'
];
for (const file of files) await access(new URL(`../${file}`, import.meta.url));

const [core, importer, renderer, wrapper, css, readme] = await Promise.all([
  readFile(new URL('../src/ming-editor-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/ming-markdown-import.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/ming-markdown-renderer.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/ming-long-editor.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/ming-long-editor.css', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8')
]);
for (const file of ['src/ming-editor-core.js', 'src/ming-markdown-import.js', 'src/ming-markdown-renderer.js', 'src/ming-long-editor.js']) {
  await run(process.execPath, ['--check', fileURLToPath(new URL(`../${file}`, import.meta.url))]);
}
assert.match(core, /MingLongEditorCore/);
assert.match(core, /md-is-fullscreen/);
assert.match(importer, /MingLongMarkdownImport/);
assert.match(renderer, /data-source-line/);
assert.match(renderer, /escape/);
assert.match(wrapper, /MingLongEditor = \{ mount/);
assert.match(wrapper, /uploadPdf/);
assert.match(css, /md-box\.md-is-fullscreen/);
assert.match(readme, /图床/);
assert.match(readme, /PDF/);
assert.doesNotMatch(core + importer + renderer + wrapper + readme, /api\.giraffeming\.online|GH_TOKEN|sk-[a-zA-Z0-9]{20,}/);
console.log('ming-long-editor smoke checks passed');
