import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetRoot = dirname(fileURLToPath(import.meta.url));
const targetDir = resolve(process.argv[2] || process.cwd());
const startPort = Number.parseInt(process.env.PORT || '4173', 10);
const host = '127.0.0.1';
const MAX_PORT_ATTEMPTS = 20;

const VENDOR_PATHS = new Set(['/vendor/marked.umd.js', '/vendor/purify.min.js']);

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType
  });
  response.end(body);
}

function titleFromMarkdown(relativePath, markdown) {
  const heading = markdown.match(/^#\s+(.+)$/m);
  if (heading) {
    return heading[1].trim();
  }

  const basename = relativePath.split('/').pop();
  return basename
    .replace(/\.md$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function idFromPath(relativePath) {
  return relativePath
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document';
}

async function collectMarkdownPaths(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await collectMarkdownPaths(fullPath));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      paths.push(fullPath);
    }
  }

  return paths;
}

async function scanMarkdownFiles() {
  const relativePaths = (await collectMarkdownPaths(targetDir))
    .map((path) => relative(targetDir, path))
    .sort((a, b) => a.localeCompare(b));

  const documents = [];

  for (const relativePath of relativePaths) {
    const markdown = await readFile(join(targetDir, relativePath), 'utf8');
    documents.push({
      id: idFromPath(relativePath),
      filename: relativePath,
      title: titleFromMarkdown(relativePath, markdown),
      lineCount: markdown.split(/\r?\n/).length,
      sectionCount: (markdown.match(/^##\s+/gm) || []).length,
      markdown
    });
  }

  return documents;
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/api/markdown-files') {
    const documents = await scanMarkdownFiles();
    send(response, 200, JSON.stringify(documents), 'application/json; charset=utf-8');
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = await readFile(join(assetRoot, 'index.html'), 'utf8');
    send(response, 200, html, 'text/html; charset=utf-8');
    return;
  }

  if (VENDOR_PATHS.has(url.pathname)) {
    const script = await readFile(join(assetRoot, url.pathname.slice(1)), 'utf8');
    send(response, 200, script, 'text/javascript; charset=utf-8');
    return;
  }

  send(response, 404, 'Not found', 'text/plain; charset=utf-8');
}

function listen(port, attemptsLeft) {
  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      send(response, 500, error.stack || String(error), 'text/plain; charset=utf-8');
    });
  });

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error(error.message);
      process.exit(1);
    }
  });

  server.listen(port, host, () => {
    const actualPort = server.address().port;
    console.log(`Markdown reader for ${targetDir} running at http://${host}:${actualPort}/`);
  });
}

listen(startPort, MAX_PORT_ATTEMPTS);
