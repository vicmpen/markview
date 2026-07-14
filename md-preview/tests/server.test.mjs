import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'skills', 'md-preview', 'server.mjs'
);

function startServer(dir, env = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(process.execPath, [serverPath, dir], {
      env: { ...process.env, PORT: '0', ...env }
    });
    let output = '';
    const timer = setTimeout(() => {
      proc.kill();
      rejectPromise(new Error('Server did not start in time. Output: ' + output));
    }, 5000);
    proc.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/running at (http:\/\/[^\s]+\/)/);
      if (match) {
        clearTimeout(timer);
        resolvePromise({ proc, url: match[1] });
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      rejectPromise(new Error('Server exited early with code ' + code + '. Output: ' + output));
    });
  });
}

let fixtureDir;

before(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'md-preview-test-'));
  await writeFile(join(fixtureDir, 'root.md'), '# Root Doc\n\n## Section One\n\nHello.\n');
  await mkdir(join(fixtureDir, 'docs'), { recursive: true });
  await writeFile(join(fixtureDir, 'docs', 'nested.md'), 'No heading here.\n');
  await mkdir(join(fixtureDir, '.hidden'), { recursive: true });
  await writeFile(join(fixtureDir, '.hidden', 'secret.md'), '# Secret\n');
  await mkdir(join(fixtureDir, 'node_modules', 'pkg'), { recursive: true });
  await writeFile(join(fixtureDir, 'node_modules', 'pkg', 'readme.md'), '# Dep Readme\n');
});

after(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

test('API lists markdown files recursively, skipping dot-dirs and node_modules', async () => {
  const { proc, url } = await startServer(fixtureDir);
  try {
    const response = await fetch(new URL('/api/markdown-files', url));
    assert.equal(response.status, 200);
    const documents = await response.json();
    assert.deepEqual(
      documents.map((doc) => doc.filename),
      ['docs/nested.md', 'root.md']
    );
    const root = documents.find((doc) => doc.filename === 'root.md');
    assert.equal(root.title, 'Root Doc');
    assert.equal(root.sectionCount, 1);
    assert.equal(root.id, 'root');
    const nested = documents.find((doc) => doc.filename === 'docs/nested.md');
    assert.equal(nested.title, 'Nested');
    assert.equal(nested.id, 'docs-nested');
    assert.equal(nested.lineCount, 2);
  } finally {
    proc.kill();
  }
});

test('serves bundled viewer and vendor scripts from the plugin directory', async () => {
  const { proc, url } = await startServer(fixtureDir);
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /\/vendor\/marked\.umd\.js/);
    assert.match(html, /\/vendor\/purify\.min\.js/);
    assert.doesNotMatch(html, /jsdelivr/);
    for (const path of ['/vendor/marked.umd.js', '/vendor/purify.min.js']) {
      const script = await fetch(new URL(path, url));
      assert.equal(script.status, 200);
      assert.match(script.headers.get('content-type'), /javascript/);
    }
  } finally {
    proc.kill();
  }
});

test('unknown paths return 404', async () => {
  const { proc, url } = await startServer(fixtureDir);
  try {
    const response = await fetch(new URL('/etc/passwd', url));
    assert.equal(response.status, 404);
  } finally {
    proc.kill();
  }
});

test('falls back to the next port when the requested one is busy', async () => {
  const first = await startServer(fixtureDir, { PORT: '4198' });
  try {
    assert.equal(new URL(first.url).port, '4198');
    const second = await startServer(fixtureDir, { PORT: '4198' });
    try {
      assert.equal(new URL(second.url).port, '4199');
    } finally {
      second.proc.kill();
    }
  } finally {
    first.proc.kill();
  }
});
