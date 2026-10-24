import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pages = [
  ['downloads.html', 'page-downloads', 'page-status'],
  ['en/downloads.html', 'page-downloads', 'page-status'],
  ['byte.html', 'page-byte', 'page-legal'],
  ['en/byte.html', 'page-byte', 'page-legal'],
];
const css = fs.readFileSync('assets/site.css', 'utf8');

test('downloads and Byte actionable prose links have scoped 24px targets', () => {
  assert.match(
    css,
    /\.page-downloads \.docs-card a,\.page-downloads \.docs-section a,\.page-byte \.docs-section a(?:,[^\{]+)*\{[^}]*display:inline-flex;[^}]*min-height:24px;[^}]*padding:3px 0/,
    'target-size rule must stay scoped to downloads and Byte content links',
  );
  for (const [file, pageClass, sharedClass] of pages) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, new RegExp(`<body class="[^"]*\\b${pageClass}\\b`), `${file} must opt into its page scope`);
    assert.match(html, new RegExp(`<body class="[^"]*\\b${sharedClass}\\b`), `${file} must retain its shared page scope`);
    assert.match(html, /site\.css\?v=dark-cosmic-20261024a/);
    assert.match(html, /light\.css\?v=light-cosmic-20261024a/);
  }
});

test('target-size treatment does not globally alter ordinary links', () => {
  assert.doesNotMatch(css, /(?:^|})a\{[^}]*min-height:24px/);
  assert.doesNotMatch(css, /\.foot a\{[^}]*min-height:24px/);
});
