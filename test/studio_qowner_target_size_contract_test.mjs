import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'assets/site.css'), 'utf8');
const pages = ['studio.html', 'en/studio.html', 'qowner.html', 'en/qowner.html'];

test('Studio and QOWNER actionable prose links have scoped 24px targets', () => {
  assert.match(
    css,
    /\.page-studio \.docs-card a,\.page-studio \.docs-section a,\.page-qowner \.docs-card a,\.page-qowner \.docs-section a\{[^}]*display:inline-flex;[^}]*min-height:24px;[^}]*padding:3px 0/,
    'Studio and QOWNER link target rule must be scoped to actionable content links',
  );
});

test('Studio and QOWNER target-size treatment does not alter global or footer links', () => {
  assert.doesNotMatch(css, /(?:^|})a\{[^}]*min-height:24px/);
  assert.doesNotMatch(css, /\.foot a\{[^}]*min-height:24px/);
});

test('all four Studio and QOWNER pages use the current stylesheet revisions', () => {
  for (const file of pages) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(html, /site\.css\?v=dark-cosmic-20261024a/, `${file} has stale site.css cache-buster`);
    assert.match(html, /light\.css\?v=light-cosmic-20261024a/, `${file} has stale light.css cache-buster`);
  }
});
