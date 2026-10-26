/**
 * One-off generator for Expo app icons. Run from repo root:
 *   node apps/mobile/scripts/generate-icons.mjs
 * Requires: npm install sharp --no-save (or devDependency)
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'assets', 'images');

const ACCENT_TOP = '#6B5CE8';
const ACCENT_BOTTOM = '#4A3EE0';
const ACCENT_WEAK = '#EFEDFF';

function fullIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${ACCENT_TOP}"/>
      <stop offset="100%" stop-color="${ACCENT_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="228" fill="url(#bg)"/>
  ${markPaths({ stroke: 'white', fill: 'white' })}
</svg>`;
}

function markPaths({ stroke, fill }) {
  return `
  <rect x="248" y="192" width="528" height="640" rx="52" fill="none" stroke="${stroke}" stroke-width="52"/>
  <rect x="318" y="348" width="88" height="336" rx="44" fill="${fill}" opacity="0.88"/>
  <rect x="468" y="268" width="88" height="416" rx="44" fill="${fill}"/>
  <rect x="618" y="388" width="88" height="296" rx="44" fill="${fill}" opacity="0.88"/>
  `;
}

function foregroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${markPaths({ stroke: 'white', fill: 'white' })}
</svg>`;
}

function backgroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F5F3FF"/>
      <stop offset="100%" stop-color="${ACCENT_WEAK}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>`;
}

function monochromeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${markPaths({ stroke: '#1B1F2A', fill: '#1B1F2A' })}
</svg>`;
}

async function pngFromSvg(svg, size, filePath) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(filePath);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const files = [
    ['icon.png', fullIconSvg(), 1024],
    ['android-icon-foreground.png', foregroundSvg(), 1024],
    ['android-icon-background.png', backgroundSvg(), 1024],
    ['android-icon-monochrome.png', monochromeSvg(), 1024],
    ['splash-icon.png', fullIconSvg(), 1024],
  ];
  for (const [name, svg, size] of files) {
    await pngFromSvg(svg, size, path.join(outDir, name));
    console.log('wrote', name);
  }
  const faviconPath = path.join(outDir, 'favicon.png');
  await sharp(Buffer.from(fullIconSvg())).resize(48, 48).png().toFile(faviconPath);
  console.log('wrote favicon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
