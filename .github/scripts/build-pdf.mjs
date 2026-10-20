// Prints the homepage of a built copy of the site to a PDF (the profile's "PDF" link) with
// headless Chrome, over the DevTools protocol. Needs Node 18+ and Chrome; no npm packages.
// .github/workflows/pdf.yml runs it after every push that can change the homepage.
//
//   node .github/scripts/build-pdf.mjs [--site _site] [--out files/Jeonghoon_Kim.pdf]
//        [--updated 2026-10-20] [--url <site URL>] [--chrome <path>]
//
// Requests for the site's URL are answered from the --site folder, so the PDF shows that build
// while its links keep pointing to the live site. The URL is the one the build was made for
// (its canonical link; jekyll serve and the localhost previews make their own), unless --url
// says otherwise. Every other request is blocked (the page needs none). The layout comes from
// the site's print styles (@media print in _sass/layout/_home.scss); this script adds the paper
// size, the margins and the footer line. If the new PDF differs from the existing --out only
// in its timestamps, the file is kept.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    site: { type: 'string', default: '_site' },
    out: { type: 'string', default: 'files/Jeonghoon_Kim.pdf' },
    url: { type: 'string', default: '' },
    updated: { type: 'string', default: '' },
    chrome: { type: 'string', default: process.env.CHROME_PATH || '' },
  },
});

const SITE = resolve(opt.site);
const INDEX = join(SITE, 'index.html');
const CANONICAL = existsSync(INDEX)
  ? (readFileSync(INDEX, 'utf8').match(/<link rel="canonical" href="([^"]+)"/) || [])[1]
  : '';
const HOME = new URL(opt.url || CANONICAL || 'https://penpaperkeycode.github.io');
const TIMEOUT_MS = 120000;

// A4 portrait, in inches. The footer line sits in the bottom margin.
const PAPER = { paperWidth: 8.27, paperHeight: 11.69 };
const MARGIN = { marginTop: 0.6, marginBottom: 0.75, marginLeft: 0.65, marginRight: 0.65 };
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.eot': 'application/vnd.ms-fontobject',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// "2026-10-20" -> "October 20, 2026"; anything else is shown as given
function formatDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return new Date(`${text}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function findChrome() {
  if (opt.chrome) return opt.chrome;
  const apps = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const app of apps) if (existsSync(app)) return app;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    for (const dir of (process.env.PATH || '').split(delimiter)) {
      if (dir && existsSync(join(dir, name))) return join(dir, name);
    }
  }
  throw new Error('Chrome not found: pass --chrome <path> or set CHROME_PATH');
}

/* ---- Chrome over --remote-debugging-pipe: JSON messages separated by NUL bytes ---- */

const profileDir = mkdtempSync(join(tmpdir(), 'build-pdf-'));
const chromeArgs = [
  '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
  '--disable-background-networking', '--disable-component-update', '--disable-gpu',
  '--hide-scrollbars', '--mute-audio',
];
// GitHub's Ubuntu runners don't allow Chrome's sandbox; the page is our own, other requests are blocked
if (process.platform === 'linux' && process.env.CI) chromeArgs.push('--no-sandbox');

let chrome;
let running = false;
let stderrTail = '';
let nextId = 0;
let inbox = '';
const pending = new Map();
const handlers = {};

function failAll(err) {
  running = false;
  for (const call of pending.values()) call.reject(err);
  pending.clear();
}

function startChrome() {
  chrome = spawn(findChrome(), [...chromeArgs, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  running = true;
  chrome.on('error', (err) => failAll(err));
  chrome.on('exit', (code, signal) => {
    failAll(new Error(`Chrome exited (${signal || code})${stderrTail ? `:\n${stderrTail.trim()}` : ''}`));
  });
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (text) => { stderrTail = (stderrTail + text).slice(-2000); });
  chrome.stdio[3].on('error', () => {}); // a write after Chrome died; the exit handler reports it
  const fromChrome = chrome.stdio[4];
  fromChrome.setEncoding('utf8');
  fromChrome.on('data', (chunk) => {
    inbox += chunk;
    for (let end = inbox.indexOf('\0'); end !== -1; end = inbox.indexOf('\0')) {
      const msg = JSON.parse(inbox.slice(0, end));
      inbox = inbox.slice(end + 1);
      if (msg.id !== undefined) {
        const call = pending.get(msg.id);
        if (!call) continue;
        pending.delete(msg.id);
        if (msg.error) call.reject(new Error(`${call.method}: ${msg.error.message}`));
        else call.resolve(msg.result);
      } else if (handlers[msg.method]) {
        handlers[msg.method](msg.params);
      }
    }
  });
}

function send(method, params = {}, sessionId) {
  if (!running) return Promise.reject(new Error(`Chrome is not running (${method})`));
  const id = ++nextId;
  const msg = sessionId ? { id, method, params, sessionId } : { id, method, params };
  return new Promise((done, reject) => {
    pending.set(id, { method, resolve: done, reject });
    chrome.stdio[3].write(`${JSON.stringify(msg)}\0`);
  });
}

/* ---- answering the page's requests from the built site ---- */

const missing = [];
const blocked = [];

function answer(url, type) {
  const u = new URL(url);
  if (u.origin !== HOME.origin) {
    blocked.push({ url, type });
    return ['Fetch.failRequest', { errorReason: 'BlockedByClient' }];
  }
  let file = join(SITE, decodeURIComponent(u.pathname));
  if (file !== SITE && !file.startsWith(SITE + sep)) file = '';
  if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file || !existsSync(file)) {
    // browsers ask for icons on their own; anything else the page asked for is a real gap
    if (!/\/(favicon[^/]*|apple-touch-icon[^/]*|manifest\.json)$/.test(u.pathname)) missing.push(u.pathname);
    return ['Fetch.fulfillRequest', { responseCode: 404, body: '' }];
  }
  return ['Fetch.fulfillRequest', {
    responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: TYPES[extname(file).toLowerCase()] || 'application/octet-stream' }],
    body: readFileSync(file).toString('base64'),
  }];
}

// [N] links go to #pub-N; Chrome leaves out a target it could not place (e.g. an element that
// sticks out of the page), and then the link does nothing
function deadLinks(pdf) {
  const raw = pdf.toString('latin1');
  const ref = raw.match(/\/Dests (\d+) 0 R/);
  const dict = ref ? (raw.match(new RegExp(`\\n${ref[1]} 0 obj\\n([\\s\\S]*?)\\nendobj`)) || [])[1] || '' : '';
  const known = new Set([...dict.matchAll(/\/([^\s/[\]<>()]+) *\[/g)].map((m) => m[1]));
  const targets = new Set([...raw.matchAll(/\/Dest \/([^\s/[\]<>()]+)/g)].map((m) => m[1]));
  return [...targets].filter((name) => !known.has(name));
}

// Chrome stamps every PDF with its creation time and a random document id
const withoutTimestamps = (pdf) => pdf.toString('latin1')
  .replace(/\/(CreationDate|ModDate) *\(D:[^)]*\)/g, '/$1()')
  .replace(/\/ID *\[ *<[0-9A-Fa-f]*> *<[0-9A-Fa-f]*> *\]/g, '/ID[]');

async function main() {
  if (!existsSync(INDEX)) {
    throw new Error(`${join(opt.site, 'index.html')} not found: build the site first`);
  }
  startChrome();

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);

  handlers['Fetch.requestPaused'] = ({ requestId, request, resourceType }) => {
    let method;
    let params;
    try {
      [method, params] = answer(request.url, resourceType);
    } catch (err) {
      missing.push(`${request.url} (${err.message})`);
      [method, params] = ['Fetch.failRequest', { errorReason: 'Failed' }];
    }
    page(method, { requestId, ...params }).catch(() => {});
  };
  await page('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await page('Page.enable');
  // the page fades in on load; printed halfway, the PDF would come out semi-transparent
  await page('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });

  const loaded = new Promise((done) => { handlers['Page.loadEventFired'] = done; });
  const nav = await page('Page.navigate', { url: HOME.href });
  if (nav.errorText) throw new Error(`could not open ${HOME.href}: ${nav.errorText}`);
  await loaded;
  // wait for the web fonts (icons), the photo and any animation that is still running
  const ready = await page('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `document.fonts.ready
      .then(() => Promise.all([...document.images].map((img) =>
        img.complete || new Promise((done) => { img.onload = img.onerror = done; }))))
      .then(() => Promise.all(document.getAnimations()
        .filter((a) => a.effect && a.effect.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => {}))))
      .then(() => document.title)`,
  });
  if (ready.exceptionDetails) throw new Error(`the page did not load: ${ready.exceptionDetails.text}`);
  await sleep(500); // let the page's own scripts finish their layout passes
  if (missing.length) throw new Error(`not found in ${opt.site}:\n  ${missing.join('\n  ')}`);
  // a blocked stylesheet, image or font would change the PDF; anything else (e.g. analytics) is only noted
  const looks = blocked.filter((b) => ['Document', 'Stylesheet', 'Image', 'Font'].includes(b.type));
  const list = (items) => items.map((b) => `${b.type}: ${b.url}`).join('\n  ');
  if (looks.length) {
    throw new Error(`the page loads these from outside ${HOME.origin}; pass --url with the URL the site was built for:\n  ${list(looks)}`);
  }
  if (blocked.length) console.warn(`blocked, not in the PDF:\n  ${list(blocked)}`);

  const updated = opt.updated ? `Updated ${escapeHtml(formatDate(opt.updated))} · ` : '';
  const footer = `<div style="box-sizing: border-box; width: 100%; padding: 0 ${MARGIN.marginLeft}in;
      display: flex; justify-content: space-between; gap: 1em; color: #626b77;
      font-family: ${FONT}; font-size: 7.5pt;">
    <span><span class="title"></span> · ${escapeHtml(HOME.host)}</span>
    <span>${updated}<span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;
  const { data } = await page('Page.printToPDF', {
    ...PAPER,
    ...MARGIN,
    printBackground: true,
    preferCSSPageSize: false,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: footer,
    generateTaggedPDF: true,
    generateDocumentOutline: true,
  });

  const pdf = Buffer.from(data, 'base64');
  const dead = deadLinks(pdf);
  if (dead.length) throw new Error(`these links in the PDF lead nowhere: #${dead.join(', #')}`);
  const pages = (withoutTimestamps(pdf).match(/\/Type *\/Page(?![a-zA-Z])/g) || []).length;
  const out = resolve(opt.out);
  if (existsSync(out) && withoutTimestamps(readFileSync(out)) === withoutTimestamps(pdf)) {
    console.log(`${opt.out} is up to date (${pages} pages)`);
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pdf);
  console.log(`wrote ${opt.out} (${pages} pages, ${Math.round(pdf.length / 1024)} KB)`);
}

const timer = setTimeout(() => {
  console.error(`build-pdf: gave up after ${TIMEOUT_MS / 1000} s${stderrTail ? `; Chrome said:\n${stderrTail.trim()}` : ''}`);
  if (chrome) chrome.kill('SIGKILL');
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 });
  process.exit(1);
}, TIMEOUT_MS);

main()
  .catch((err) => {
    console.error(`build-pdf: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    clearTimeout(timer);
    if (running) {
      const exited = new Promise((done) => chrome.once('exit', done));
      send('Browser.close').catch(() => {});
      let cap;
      await Promise.race([exited, new Promise((done) => { cap = setTimeout(done, 3000); })]);
      clearTimeout(cap);
    }
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 });
  });
