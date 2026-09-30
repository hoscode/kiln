// Dev-server endpoint for PNG-sequence exports:
//   PUT /api/frames/<name>/<00000>.png  →  renders/<name>/00000.png
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Plugin } from 'vite';

const PATH = /^\/([\w-]+)\/(\d{5}\.png)$/;

export function framesPlugin(dir: string): Plugin {
  return {
    name: 'kiln-frames',
    configureServer(server) {
      server.middlewares.use('/api/frames', (req, res) => {
        const m = PATH.exec(req.url ?? '');
        if (req.method !== 'PUT' || !m) {
          res.statusCode = 404;
          return res.end();
        }
        const folder = join(dir, m[1]);
        mkdir(folder, { recursive: true })
          .then(() => pipeline(req, createWriteStream(join(folder, m[2]))))
          .then(() => res.end(JSON.stringify({ path: `renders/${m[1]}/${m[2]}` })))
          .catch((e) => {
            res.statusCode = 500;
            res.end(String(e));
          });
      });
    },
  };
}
