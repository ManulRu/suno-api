// Diagnose current DOM selectors on https://suno.com/create
//
// SECURITY CONTRACT:
// - Reads SUNO_COOKIE from process.env only. Never prints, logs, or writes
//   the cookie value anywhere.
// - Writes output to ./scripts/diagnose-output.json containing ONLY public
//   DOM attributes (class, id, placeholder, aria-label, data-testid, truncated
//   outerHTML) of textarea and button elements on the Suno create page.
// - Writes a screenshot to ./scripts/diagnose.png so you can visually verify.
//   The screenshot may show your account name in the UI — review before sharing.
// - Both output files are gitignored.
//
// USAGE:
//   1. Put your cookie in .env.local (file stays on your machine, gitignored):
//      SUNO_COOKIE=<your cookie value or raw JWT>
//   2. Run: node scripts/diagnose-selectors.mjs
//   3. Open scripts/diagnose-output.json and share ONLY that JSON (no cookie inside).
//
// If the browser fails to load suno.com/create, your cookie may be expired —
// grab a fresh one from the browser.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'rebrowser-playwright-core';

// --- Load .env.local manually (no dotenv dep) ---
function loadDotEnvLocal() {
  const path = '.env.local';
  if (!existsSync(path)) return;
  const contents = readFileSync(path, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function log(msg) { console.log(`[diagnose] ${msg}`); }

loadDotEnvLocal();

const rawCookie = process.env.SUNO_COOKIE;
if (!rawCookie || !rawCookie.trim()) {
  console.error('[diagnose] ERROR: SUNO_COOKIE is not set. Put it in .env.local and rerun.');
  process.exit(2);
}

// Parse SUNO_COOKIE into Playwright cookie objects.
// Accepts either a cookie-header string (k1=v1; k2=v2) or a raw JWT (treated as __client).
function parseCookie(raw) {
  const trimmed = raw.trim();
  const result = [];
  const push = (name, value) => {
    if (!name || !value) return;
    const cleanVal = String(value).replace(/[^\x20-\x7E]/g, '').trim();
    if (!cleanVal) return;
    result.push({
      name: name.trim(),
      value: cleanVal,
      domain: '.suno.com',
      path: '/',
      sameSite: 'Lax',
    });
  };
  if (trimmed.startsWith('eyJ') && !trimmed.includes('=')) {
    push('__client', trimmed);
    return result;
  }
  for (const part of trimmed.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    push(part.slice(0, eq), part.slice(eq + 1));
  }
  return result;
}

const cookies = parseCookie(rawCookie);
log(`Parsed ${cookies.length} cookie(s) (values not printed)`);

log('Launching Chromium...');
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
});
await context.addCookies(cookies);

const page = await context.newPage();
log('Navigating to https://suno.com/create ...');
try {
  await page.goto('https://suno.com/create', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
} catch (e) {
  console.error('[diagnose] ERROR: navigation failed:', e.message);
  await browser.close();
  process.exit(3);
}

log('Waiting 5s for React to render...');
await page.waitForTimeout(5000);

log('Collecting DOM candidates...');
const dom = await page.evaluate(() => {
  const truncate = (s, n = 300) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '...[truncated]' : s);
  const attrsOf = (el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    class: el.className && typeof el.className === 'string' ? el.className : null,
    placeholder: el.getAttribute('placeholder'),
    'aria-label': el.getAttribute('aria-label'),
    'data-testid': el.getAttribute('data-testid'),
    name: el.getAttribute('name'),
    role: el.getAttribute('role'),
    type: el.getAttribute('type'),
    disabled: el.hasAttribute('disabled'),
    outerHTML: truncate(el.outerHTML, 400),
  });

  const textareas = Array.from(document.querySelectorAll('textarea')).map(attrsOf);
  const contenteditables = Array.from(document.querySelectorAll('[contenteditable="true"]')).map(attrsOf);
  const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])')).map(attrsOf);
  const buttons = Array.from(document.querySelectorAll('button')).filter((b) => {
    const txt = (b.textContent || '').trim().toLowerCase();
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    return txt.includes('create') || txt.includes('generate') || aria.includes('create') || aria.includes('generate');
  }).map(attrsOf);

  // Detect tabs between "Simple" and "Custom" modes if present
  const tabCandidates = Array.from(document.querySelectorAll('[role="tab"], button')).filter((el) => {
    const t = (el.textContent || '').trim().toLowerCase();
    return t === 'custom' || t === 'simple' || t === 'lyrics' || t === 'description';
  }).map(attrsOf);

  return {
    url: window.location.href,
    title: document.title,
    textareas,
    contenteditables,
    inputs,
    buttons_create_or_generate: buttons,
    mode_tabs: tabCandidates,
    textarea_count: textareas.length,
    contenteditable_count: contenteditables.length,
  };
});

log(`Collected: ${dom.textarea_count} textarea(s), ${dom.contenteditable_count} contenteditable(s), ${dom.buttons_create_or_generate.length} create/generate button(s), ${dom.mode_tabs.length} mode tab(s)`);

log('Saving screenshot to scripts/diagnose.png ...');
await page.screenshot({ path: 'scripts/diagnose.png', fullPage: false });

log('Saving JSON to scripts/diagnose-output.json ...');
writeFileSync(
  'scripts/diagnose-output.json',
  JSON.stringify(
    {
      collected_at: new Date().toISOString(),
      ...dom,
    },
    null,
    2
  )
);

log('Closing browser...');
await browser.close();
log('Done. Review scripts/diagnose-output.json (safe to share) and scripts/diagnose.png (check for personal info before sharing).');
