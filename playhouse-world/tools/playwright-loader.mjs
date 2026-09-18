// Finds Playwright whether it is installed locally or globally.
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  'playwright',
  '/opt/node22/lib/node_modules/playwright/index.js',
  '/usr/lib/node_modules/playwright/index.js',
  '/usr/local/lib/node_modules/playwright/index.js',
];

export async function loadPlaywright() {
  for (const candidate of CANDIDATES) {
    try {
      const specifier = candidate.startsWith('/')
        ? (existsSync(candidate) ? pathToFileURL(candidate).href : null)
        : candidate;
      if (!specifier) continue;
      const mod = await import(specifier);
      // CommonJS builds arrive under `default`.
      const api = mod.chromium ? mod : mod.default;
      if (api?.chromium) return api;
    } catch { /* try the next one */ }
  }
  throw new Error('Playwright not found. Install it with: npm i -D playwright');
}
