import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The technical evidence board is a component of its own: `technical-board`,
// `technical-row`, `technical-state`, `technical-pill`, `technical-light`,
// `technical-proof` and `technical-primary` had no rule in any stylesheet, so
// the page rendered the recorded state and the availability pill as plain
// 16px body text (verified live: `border-radius: 0px`, `border: none`).
// A reader could not tell a recorded state from a verified one.
//
// Guard: every class the technical pages use must resolve to a CSS rule, and
// the availability pill must keep its own chip styling.

const PAGES = ['technical.html', 'en/technical.html'];
const STYLESHEETS = ['assets/site.css', 'assets/light.css'];

const read = (rel) => fs.readFileSync(rel, 'utf8');

function pageClasses(html) {
  const classes = new Set();
  for (const match of html.matchAll(/class="([^"]+)"/g)) {
    for (const name of match[1].split(/\s+/)) {
      if (name) classes.add(name);
    }
  }
  for (const match of html.matchAll(/className\s*=\s*['"]([^'"]+)['"]/g)) {
    for (const name of match[1].split(/\s+/)) {
      if (name) classes.add(name);
    }
  }
  return [...classes];
}

function inlineStyles(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(([, css]) => css).join('\n');
}

function hasRule(css, className) {
  return new RegExp(`\\.${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9_-])`).test(css);
}

test('every class used by the technical pages resolves to a CSS rule', () => {
  const shared = STYLESHEETS.map(read).join('\n');
  for (const page of PAGES) {
    const html = read(page);
    const css = `${shared}\n${inlineStyles(html)}`;
    for (const className of pageClasses(html)) {
      assert.ok(hasRule(css, className), `${page}: class .${className} has no CSS rule`);
    }
  }
});

test('the availability pill is a chip, not body text', () => {
  for (const page of PAGES) {
    const css = inlineStyles(read(page));
    const pill = css.match(/\.technical-pill\{([^}]*)\}/);
    assert.ok(pill, `${page}: .technical-pill needs its own rule`);
    assert.match(pill[1], /border-radius:999px/, `${page}: the pill must be rounded`);
    assert.match(pill[1], /border:/, `${page}: the pill must have a border`);
    assert.match(pill[1], /white-space:nowrap/, `${page}: the pill must not wrap mid-label`);
  }
});

test('the two unverified rows carry the warning pill variant', () => {
  for (const page of PAGES) {
    const html = read(page);
    const warns = html.match(/class="technical-pill technical-pill--warn"/g) || [];
    assert.equal(warns.length, 2, `${page}: website and Studio rows need the warning pill`);
  }
});
