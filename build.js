#!/usr/bin/env node
/* ==========================================================================
   GRIMHOLLOW — build.js
   Concatenates src/*.js into a single self-contained dist/index.html.
   No bundler, no dependencies. Run:  node build.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const VERSION = '1.0.2';
const CACHE_NAME = `grimhollow-v${VERSION}`;

function log(s) { process.stdout.write(s + '\n'); }

/* ------------------------------------------------------------ gather src -- */
if (!fs.existsSync(SRC)) { console.error('missing src/'); process.exit(1); }

const files = fs.readdirSync(SRC)
  .filter(f => /^\d\d_.*\.js$/.test(f))
  .sort();

if (files.length === 0) { console.error('no src/NN_*.js files found'); process.exit(1); }

let bundle = '';
let totalRaw = 0;
for (const f of files) {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  totalRaw += code.length;
  bundle += `\n/* ==== ${f} ${'='.repeat(Math.max(0, 62 - f.length))} */\n`;
  // Each module declares `var G = ...` guarded; strip the redundant 'use strict'
  // so the concatenated result has exactly one at the top of the IIFE.
  bundle += code.replace(/^\s*'use strict';\s*$/m, '');
  bundle += '\n';
  log(`  + ${f.padEnd(16)} ${(code.length / 1024).toFixed(1).padStart(6)} KB`);
}

/* Wrap so `var G` is module-private and nothing leaks except window.G */
const wrapped =
`(function(){
'use strict';
var G = {};
if (typeof window !== 'undefined') window.G = G;
${bundle}
})();`;

/* --------------------------------------------------------------- shell ---- */
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#0a0810">
<meta name="description" content="Grimhollow — a dark action-platformer. Dash, combo, parry. Ten levels, three bosses.">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Grimhollow</title>
<link rel="manifest" href="manifest.json">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230a0810'/%3E%3Cpath d='M6 20 L10 9 L13 15 L16 7 L19 15 L22 9 L26 20 Z' fill='%23e0b64a'/%3E%3C/svg%3E">
<style>
  :root { color-scheme: dark; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%; overflow: hidden;
    background: #06050a; color: #e8e2d6;
    font-family: 'Segoe UI', Roboto, system-ui, sans-serif;
    -webkit-user-select: none; user-select: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    overscroll-behavior: none;
    touch-action: none;
  }
  #game {
    display: block; position: absolute; top: 0; left: 0;
    image-rendering: auto;
    background: #06050a;
  }
  #boot {
    position: absolute; inset: 0; display: flex;
    flex-direction: column; align-items: center; justify-content: center;
    gap: 18px; background: #06050a; z-index: 10;
  }
  #boot h1 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: clamp(28px, 7vw, 60px); font-weight: 400;
    letter-spacing: 0.22em; color: #e0b64a; text-transform: uppercase;
    text-shadow: 0 0 30px rgba(224,182,74,0.35);
  }
  #boot p { font-size: 13px; letter-spacing: 0.16em; color: #6b6459; text-transform: uppercase; }
  #boot .spin {
    width: 30px; height: 30px; border: 2px solid rgba(224,182,74,0.18);
    border-top-color: #e0b64a; border-radius: 50%;
    animation: sp 0.9s linear infinite;
  }
  @keyframes sp { to { transform: rotate(360deg); } }
  #err {
    position: absolute; inset: 0; display: none; z-index: 20;
    background: #0d0a10; color: #ff9a8a; padding: 24px;
    font-family: ui-monospace, Consolas, monospace; font-size: 12px;
    white-space: pre-wrap; overflow: auto; line-height: 1.6;
  }
</style>
</head>
<body>
<canvas id="game"></canvas>

<div id="boot">
  <h1>Grimhollow</h1>
  <div class="spin"></div>
  <p>Press any key to begin</p>
</div>

<pre id="err"></pre>

<script>
/* Surface errors on screen — a black canvas with a silent console is the
   worst possible failure mode for someone just opening the file. */
(function () {
  function show(msg) {
    var e = document.getElementById('err');
    if (!e) return;
    e.style.display = 'block';
    e.textContent += msg + '\\n\\n';
    var b = document.getElementById('boot');
    if (b) b.style.display = 'none';
  }
  window.addEventListener('error', function (ev) {
    show('ERROR: ' + (ev.message || 'unknown') +
         '\\n  at ' + (ev.filename || '?') + ':' + (ev.lineno || '?') + ':' + (ev.colno || '?') +
         (ev.error && ev.error.stack ? '\\n\\n' + ev.error.stack : ''));
  });
  window.addEventListener('unhandledrejection', function (ev) {
    show('UNHANDLED PROMISE: ' + (ev.reason && ev.reason.stack ? ev.reason.stack : ev.reason));
  });
})();
</script>

<script>
/* ==========================================================================
   GRIMHOLLOW v${VERSION} — single-file build
   Generated by build.js from ${files.length} modules. Do not edit directly;
   edit src/*.js and re-run \`node build.js\`.
   ========================================================================== */
${wrapped}
</script>

<script>
/* Service worker: makes the game installable and fully offline on Android.
   Skipped on file:// where SW registration is not permitted. */
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}
</script>
</body>
</html>
`;

/* --------------------------------------------------------------- write ---- */
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');

// Keep the distributable directory complete after every build: it can be
// opened locally on PC or uploaded as-is to any static host.  These assets
// also make the browser build installable on Android as a PWA.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="96" fill="#0a0810"/>
<path d="M72 338 142 144l62 102 52-142 52 142 62-102 70 194-72-44-40 92-72-136-72 136-40-92z" fill="#e0b64a"/>
<circle cx="256" cy="192" r="34" fill="#fff2d0"/>
</svg>`;
const manifest = {
  name: 'Grimhollow', short_name: 'Grimhollow',
  description: 'A dark action-platformer with ten levels and three bosses.',
  start_url: './', scope: './', display: 'standalone',
  background_color: '#06050a', theme_color: '#0a0810', orientation: 'landscape',
  icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
};
const serviceWorker = `const CACHE = '${CACHE_NAME}';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    if (new URL(event.request.url).origin === self.location.origin) caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
`;
fs.writeFileSync(path.join(DIST, 'icon.svg'), iconSvg, 'utf8');
fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(DIST, 'sw.js'), serviceWorker, 'utf8');

log('');
log(`  modules  ${files.length}`);
log(`  src      ${(totalRaw / 1024).toFixed(1)} KB`);
log(`  dist     ${(html.length / 1024).toFixed(1)} KB  ->  dist/index.html`);
log('  pwa      manifest.json, sw.js, icon.svg');

/* Sanity: the bundle must not contain a bare ES module keyword, and must not
   have unbalanced script tags that would truncate the HTML. */
const problems = [];
if (/^\s*(import|export)\s/m.test(bundle)) problems.push('ES module syntax found — breaks classic <script>');
if (bundle.indexOf('</script') !== -1) problems.push('literal </script in source would terminate the tag early');
if (problems.length) {
  log('');
  for (const p of problems) log('  ! ' + p);
  process.exit(1);
}
log('  ok       no bundle hazards');
