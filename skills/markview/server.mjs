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
const DOCUMENT_EXTENSIONS = new Set(['.md', '.html']);

const RAW_CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType
  });
  response.end(body);
}

function fallbackTitle(relativePath) {
  const basename = relativePath.split('/').pop();
  return basename
    .replace(/\.(md|html)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleFromSource(relativePath, source) {
  if (extname(relativePath).toLowerCase() === '.html') {
    const titleTag = source.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleTag && titleTag[1].trim()) {
      return titleTag[1].trim();
    }
    return fallbackTitle(relativePath);
  }

  const heading = source.match(/^#\s+(.+)$/m);
  if (heading) {
    return heading[1].trim();
  }

  return fallbackTitle(relativePath);
}

function idFromPath(relativePath) {
  return relativePath
    .toLowerCase()
    .replace(/\.(md|html)$/i, '')
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
    } else if (entry.isFile() && DOCUMENT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
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
    const source = await readFile(join(targetDir, relativePath), 'utf8');
    const isHtml = extname(relativePath).toLowerCase() === '.html';
    documents.push({
      id: idFromPath(relativePath),
      filename: relativePath,
      title: titleFromSource(relativePath, source),
      lineCount: source.split(/\r?\n/).length,
      sectionCount: isHtml
        ? (source.match(/<h2[\s>]/gi) || []).length
        : (source.match(/^##\s+/gm) || []).length,
      markdown: source
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

  if (url.pathname.startsWith('/raw/')) {
    const relativePath = decodeURIComponent(url.pathname.slice('/raw/'.length));
    const fullPath = resolve(join(targetDir, relativePath));
    if (fullPath !== targetDir && !fullPath.startsWith(targetDir + '/')) {
      send(response, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }
    let body;
    try {
      body = await readFile(fullPath);
    } catch {
      send(response, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }
    const contentType = RAW_CONTENT_TYPES[extname(fullPath).toLowerCase()] || 'application/octet-stream';
    send(response, 200, body, contentType);
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
