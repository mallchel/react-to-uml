import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const resolveViewerDir = (): string | null => {
  const candidates = [
    path.resolve(process.cwd(), 'lib/graph-viewer'),
    path.resolve(__dirname, 'graph-viewer'),
    path.resolve(__dirname, '../lib/graph-viewer'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
};

const resolveAndGuard = (base: string, requested: string): string | null => {
  const resolved = path.resolve(base, requested);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return null;
  }
  return resolved;
};

const serveFile = (filePath: string, res: http.ServerResponse) => {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
};

export type ViewerConfig = {
  // initial "Max repeats" value of the viewer's runtime filter
  repetitionLimit?: number;
};

export const startViewer = ({
  port = 8207,
  dumpDir,
  viewerConfig = {},
}: {
  port?: number;
  dumpDir: string;
  viewerConfig?: ViewerConfig;
}) => {
  const viewerDir = resolveViewerDir();
  if (!viewerDir) {
    throw new Error(
      'Graph viewer assets are missing. Build them first with "yarn build:viewer".',
    );
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/viewer-config.json') {
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.json'] });
      res.end(JSON.stringify(viewerConfig));
      return;
    }

    // Serve JSON data files from dumpDir
    if (pathname.endsWith('.json')) {
      const safePath = resolveAndGuard(dumpDir, path.basename(pathname));
      if (!safePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }
      serveFile(safePath, res);
      return;
    }

    if (pathname === '/') {
      pathname = '/index.html';
    }

    const safePath = resolveAndGuard(viewerDir, '.' + pathname);
    if (!safePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    serveFile(safePath, res);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Pass another one with --port=<number>.`);
      process.exit(1);
    }
    throw error;
  });

  server.listen(port, () => {
    console.log(`\n  Graph viewer is running at http://localhost:${port}\n  Press Ctrl+C to stop.\n`);
  });

  return server;
};
