// Renders icons/icon.svg to the PNG sizes iOS and the manifest need.
//   node tools/make-icons.mjs          (needs Playwright + Chromium)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './playwright-loader.mjs';

const { chromium } = await loadPlaywright();

const here = dirname(fileURLToPath(import.meta.url));
const iconDir = resolve(here, '../icons');
const svg = readFileSync(resolve(iconDir, 'icon.svg'), 'utf8');

const TARGETS = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0, square: true },
  { file: 'icon-maskable-512.png', size: 512, pad: 64 },
];

const browser = await chromium.launch();
for (const target of TARGETS) {
  const page = await browser.newPage({ viewport: { width: target.size, height: target.size } });
  const inner = target.square ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<style>html,body{margin:0;background:#ffd166}
    svg{display:block;width:${target.size - target.pad * 2}px;height:${target.size - target.pad * 2}px;margin:${target.pad}px}</style>${inner}`);
  const shot = await page.screenshot({ omitBackground: false });
  writeFileSync(resolve(iconDir, target.file), shot);
  console.log('wrote', target.file, shot.length, 'bytes');
  await page.close();
}
await browser.close();
