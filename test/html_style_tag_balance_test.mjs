import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Every shipped HTML page must keep its inline <style> elements balanced. An
// unclosed <style> swallows the next block's CSS as raw text, so the following
// rules (e.g. the no-JS carousel fallback) are silently dropped by the browser.

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

test('every public HTML page keeps <style> tags balanced', () => {
  assert.ok(pages.length >= 10, `expected to discover public pages, found ${pages.length}`);
  for (const page of pages) {
    const source = fs.readFileSync(page, 'utf8');
    const opens = (source.match(/<style[\s>]/gi) || []).length;
    const closes = (source.match(/<\/style>/gi) || []).length;
    assert.equal(closes, opens,
      `${page} has ${opens} <style> tag(s) but ${closes} </style> tag(s)`);
  }
});

test('the no-JS carousel fallback stays a standalone, well-formed style block', () => {
  for (const page of ['index.html', 'en/index.html']) {
    const source = fs.readFileSync(page, 'utf8');
    assert.match(source,
      /<\/style>\s*<style id="carousel-no-js-fallback">/,
      `${page} must close the preceding style block before opening the no-JS fallback`);
    assert.match(source,
      /<style id="carousel-no-js-fallback">[\s\S]*?\.caro-slide:first-child\{opacity:1;visibility:visible/,
      `${page} no-JS fallback must reveal the first carousel slide`);
  }
});
