import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The Indonesian canonical page (/, lang="id", og:locale id_ID) historically
// shipped English static title metadata: crawlers and no-JS readers saw
// "Void Scriptor — Build Beyond the Known" even though every other static
// surface on that page (meta description, nav, hero, JSON-LD) is Indonesian,
// and the i18n runtime swaps the title to the Indonesian string only after
// JavaScript executes. The static default must match the page's own language.

const ID_TITLE = 'Void Scriptor — Bangun Melampaui yang Dikenal';
const EN_TITLE = 'Void Scriptor — Build Beyond the Known';

function extract(html, pattern) {
  const m = html.match(pattern);
  return m && m[1];
}

function dictPageTitle(source, lang) {
  const dictBlock = source.match(new RegExp(`${lang}:\\s*\\{[^}]*'page-title':'([^']+)'`, 's'));
  return dictBlock && dictBlock[1];
}

test('Indonesian homepage serves Indonesian static title metadata before JavaScript', () => {
  const source = fs.readFileSync('index.html', 'utf8');

  assert.equal(extract(source, /<title[^>]*>([^<]+)<\/title>/), ID_TITLE);
  assert.equal(extract(source, /<meta property="og:title" content="([^"]+)">/), ID_TITLE);
  assert.equal(extract(source, /<meta name="twitter:title" content="([^"]+)">/), ID_TITLE);
});

test('static title metadata matches each page i18n page-title dictionary entry', () => {
  const idSource = fs.readFileSync('index.html', 'utf8');
  const enSource = fs.readFileSync('en/index.html', 'utf8');

  assert.equal(extract(idSource, /<title[^>]*>([^<]+)<\/title>/), dictPageTitle(idSource, 'id'));
  assert.equal(extract(enSource, /<title[^>]*>([^<]+)<\/title>/), dictPageTitle(enSource, 'en'));
});

test('English homepage keeps English static title metadata', () => {
  const source = fs.readFileSync('en/index.html', 'utf8');

  assert.equal(extract(source, /<title[^>]*>([^<]+)<\/title>/), EN_TITLE);
  assert.equal(extract(source, /<meta property="og:title" content="([^"]+)">/), EN_TITLE);
  assert.equal(extract(source, /<meta name="twitter:title" content="([^"]+)">/), EN_TITLE);
});
