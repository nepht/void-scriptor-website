// Guards the homepage auth-result notices (?auth=ok|failed|cancelled|required|account_deleted).
// These notices are set by showAuthResult() BEFORE the page's i18n dictionary is applied,
// so they must resolve the visitor's language themselves. Previously they were a single
// hardcoded Indonesian map, which meant an English-preferring visitor (on /en/ or with
// localStorage['vs-lang']='en' on /) saw an English page with an Indonesian toast.
//
// This test extracts the real function from the shipped HTML and EXECUTES it in a sandbox,
// so it fails if the locale lookup is removed or the English strings regress.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function extractFn(html) {
  const start = html.indexOf('function showAuthResult(){');
  assert.notEqual(start, -1, 'showAuthResult() must exist in the page');
  let depth = 0;
  for (let j = html.indexOf('{', start); j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}' && --depth === 0) return html.slice(start, j + 1);
  }
  throw new Error('unbalanced braces while extracting showAuthResult');
}

// Execute the shipped function against a stubbed DOM and capture the toast text.
function toastFor(file, { pathname = '/', search = '', vsLang = null } = {}) {
  const src = extractFn(read(file));
  let toast = null;
  const sandbox = {
    URLSearchParams,
    location: { pathname, search, hash: '' },
    localStorage: { getItem: (k) => (k === 'vs-lang' ? vsLang : null) },
    history: { replaceState() {} },
    document: { querySelector: () => null },
    window: { setTimeout: () => {} },
    setTimeout: () => {},
    open: () => {},
    notice: (t) => { toast = t; },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${src}\nshowAuthResult();`, sandbox);
  return toast;
}

const EN_REQUIRED = 'Sign in first to open the dashboard.';

test('root page with an English preference shows an English auth notice', () => {
  assert.equal(toastFor('index.html', { pathname: '/', search: '?auth=required', vsLang: 'en' }), EN_REQUIRED);
  assert.equal(toastFor('index.html', { pathname: '/', search: '?auth=ok', vsLang: 'en' }), 'Signed in.');
  assert.equal(toastFor('index.html', { pathname: '/', search: '?auth=failed', vsLang: 'en' }), 'Sign-in failed. Please try again.');
  assert.equal(toastFor('index.html', { pathname: '/', search: '?auth=cancelled', vsLang: 'en' }), 'Sign-in cancelled.');
});

test('root page keeps Indonesian by default and for an Indonesian preference', () => {
  assert.equal(toastFor('index.html', { pathname: '/', search: '?auth=required' }), 'Masuk dulu untuk membuka dasbor.');
  assert.equal(toastFor('index.html', { pathname: '/', search: '?auth=ok' }), 'Berhasil masuk.');
  assert.equal(toastFor('index.html', { pathname: '/', search: '?auth=required', vsLang: 'id' }), 'Masuk dulu untuk membuka dasbor.');
});

test('?lang=en overrides the stored preference on the root page', () => {
  assert.equal(toastFor('index.html', { pathname: '/', search: '?auth=required&lang=en', vsLang: 'id' }), EN_REQUIRED);
});

test('the English homepage never leaks an Indonesian auth notice', () => {
  const indonesian = /Masuk dulu|Berhasil masuk|Login gagal|Login dibatalkan|Akun dan data server/;
  for (const a of ['required', 'ok', 'failed', 'cancelled', 'account_deleted']) {
    const t = toastFor('en/index.html', { pathname: '/en/', search: `?auth=${a}` });
    assert.ok(t, `expected a notice for auth=${a} on /en/`);
    assert.ok(!indonesian.test(t), `Indonesian notice leaked on /en/ for auth=${a}: ${t}`);
  }
  assert.equal(toastFor('en/index.html', { pathname: '/en/', search: '?auth=required' }), EN_REQUIRED);
});

test('no auth parameter produces no notice', () => {
  assert.equal(toastFor('index.html', { pathname: '/', search: '' }), null);
  assert.equal(toastFor('en/index.html', { pathname: '/en/', search: '?lang=en' }), null);
});
