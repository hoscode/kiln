// Dev-server API that stores gallery snapshots as plain files in the repo:
//   gallery/<id>.json  piece, seed, params
//   gallery/<id>.jpg   thumbnail
// Plain files so favorites can be versioned, and read by Claude.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const ID = /^[\w-]+$/;
const MAX_BODY = 5_000_000;

export function galleryPlugin(dir: string): Plugin {
  return {
    name: 'kiln-gallery',
    configureServer(server) {
      server.middlewares.use('/api/gallery', (req, res) => {
        handle(dir, req, res).catch((e) => send(res, 500, { error: String(e) }));
      });
    },
  };
}

async function handle(dir: string, req: IncomingMessage, res: ServerResponse) {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]).slice(1);

  if (req.method === 'GET' && path === '') {
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'));
    const items = await Promise.all(
      files.map(async (f) => ({
        ...JSON.parse(await readFile(join(dir, f), 'utf8')),
        thumb: `/api/gallery/${f.replace(/\.json$/, '.jpg')}`,
      })),
    );
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return send(res, 200, items);
  }

  if (req.method === 'GET' && path.endsWith('.jpg') && ID.test(path.slice(0, -4))) {
    const data = await readFile(join(dir, path)).catch(() => null);
    if (!data) return send(res, 404, { error: 'not found' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.end(data);
    return;
  }

  if (req.method === 'POST' && path === '') {
    const { pieceId, seed, values, thumb } = JSON.parse(await readBody(req));
    if (typeof pieceId !== 'string' || !ID.test(pieceId)) return send(res, 400, { error: 'bad pieceId' });
    const item = {
      id: `${pieceId}-${Date.now().toString(36)}`,
      pieceId,
      seed,
      values,
      createdAt: new Date().toISOString(),
    };
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${item.id}.json`), JSON.stringify(item, null, 2) + '\n');
    if (typeof thumb === 'string' && thumb.startsWith('data:image/jpeg;base64,')) {
      await writeFile(join(dir, `${item.id}.jpg`), Buffer.from(thumb.split(',')[1], 'base64'));
    }
    return send(res, 200, { ...item, thumb: `/api/gallery/${item.id}.jpg` });
  }

  if (req.method === 'DELETE' && ID.test(path)) {
    await Promise.all([rm(join(dir, `${path}.json`), { force: true }), rm(join(dir, `${path}.jpg`), { force: true })]);
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'not found' });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) reject(new Error('body too large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
