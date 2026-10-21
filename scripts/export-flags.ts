// Export flag artwork (pieces/shader/flag-wave/flags.ts) as PNGs for Blender.
//   npx tsx scripts/export-flags.ts [code…] [--width 8192]
// Drawn in a headless browser through the same code the shader piece uses,
// so emblems sit where they belong. Writes blender/flag/flags/<code>.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const wi = args.indexOf('--width');
const width = wi >= 0 ? Number(args.splice(wi, 2)[1]) : 8192;
const outDir = 'blender/flag/flags';

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'error', server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls!.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url);
  const root = process.cwd();
  const codes: string[] = args.length
    ? args
    : await page.evaluate(async (root) => (await import(`/@fs${root}/pieces/shader/flag-wave/flags.ts`)).flagCodes, root);
  mkdirSync(outDir, { recursive: true });
  for (const code of codes) {
    const b64 = await page.evaluate(
      async ({ root, code, width }) => {
        const { flagCanvas, flags } = await import(`/@fs${root}/pieces/shader/flag-wave/flags.ts`);
        const flag = flags[code as keyof typeof flags];
        if (!flag) throw new Error(`Unknown flag "${code}"`);
        const blob = await flagCanvas(flag, width).convertToBlob({ type: 'image/png' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      },
      { root, code, width },
    );
    const file = `${outDir}/${code}.png`;
    writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(file);
  }
} finally {
  await browser.close();
  await server.close();
}
