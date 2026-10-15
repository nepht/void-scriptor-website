import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// The privacy policy must describe the auth the worker ACTUALLY implements.
// A policy that still describes a retired mechanism is a false statement about
// other people's data, so every claim below is cross-checked against _worker.js
// rather than read on its own.

const worker = fs.readFileSync('_worker.js', 'utf8');

function workerConst(name) {
  const match = worker.match(new RegExp(`const ${name}\\s*=\\s*([^;]+);`));
  assert.ok(match, `_worker.js must declare ${name}`);
  return match[1].trim();
}

const SESSION_COOKIE = workerConst('SESSION_COOKIE').replace(/^['"]|['"]$/g, '');
const SESSION_TTL = new Function(`return (${workerConst('SESSION_TTL')});`)();
const SESSION_TTL_HOURS = SESSION_TTL / 3600;

const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'app', 'tools']);

function collectHtml(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectHtml(full, acc);
    else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

const pages = collectHtml('.').sort();

test('the session cookie name and lifetime come from the worker', () => {
  assert.equal(SESSION_COOKIE, 'vs_session');
  assert.equal(SESSION_TTL, 24 * 60 * 60);
  assert.ok(pages.length >= 10, `expected to discover public pages, found ${pages.length}`);
});

test('the cookie attributes the policy claims match the worker cookie helper', () => {
  const helper = worker.match(/function cookie\([\s\S]*?\n\}/);
  assert.ok(helper, '_worker.js must keep its cookie() helper');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax']) {
    assert.ok(helper[0].includes(attribute), `cookie() must set ${attribute}`);
  }
  for (const page of ['privacy.html', 'en/privacy.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert.ok(html.includes('HttpOnly'), `${page} must state HttpOnly`);
    assert.ok(html.includes('SameSite=Lax'), `${page} must state SameSite=Lax`);
  }
});

test('the privacy policy names the real session cookie, lifetime and database', () => {
  for (const page of ['privacy.html', 'en/privacy.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert.ok(
      html.includes(SESSION_COOKIE),
      `${page} must name the session cookie ${SESSION_COOKIE}`,
    );
    assert.ok(
      new RegExp(`${SESSION_TTL_HOURS}\\s*(?:jam|hours)`, 'i').test(html),
      `${page} must state the ${SESSION_TTL_HOURS}-hour session lifetime`,
    );
    assert.ok(
      /Cloudflare D1/.test(html),
      `${page} must disclose the Cloudflare D1 account database`,
    );
  }
});

test('no shipped page carries the retired password form or its vocabulary', () => {
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    assert.doesNotMatch(
      html,
      /type=["']password["']/i,
      `${page} must not ship a password field: sign-in is GitHub/Google only`,
    );
    assert.doesNotMatch(
      html,
      /'(?:modal-name|modal-email|modal-pass|lock-name|lock-email|lock-pass)(?:-ph)?'\s*:/,
      `${page} must not define i18n keys for the retired password form`,
    );
  }
});

test('no shipped page claims data never reaches the server', () => {
  const retired = /never reaches our servers|tidak pernah sampai ke server|stays in your browser's localStorage/i;
  for (const page of pages) {
    assert.doesNotMatch(fs.readFileSync(page, 'utf8'), retired, `${page} must not make the retired claim`);
  }
});
