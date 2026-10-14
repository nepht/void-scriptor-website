import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const PAGES = [
  ['index.html', 'id_ID', 'en_US'],
  ['about.html', 'id_ID', 'en_US'],
  ['quiz.html', 'id_ID', 'en_US'],
  ['changelog.html', 'id_ID', 'en_US'],
  ['privacy.html', 'id_ID', 'en_US'],
  ['terms.html', 'id_ID', 'en_US'],
  ['contact.html', 'id_ID', 'en_US'],
  ['docs/getting-started.html', 'id_ID', 'en_US'],
  ['report-bug.html', 'id_ID', 'en_US'],
  ['status.html', 'id_ID', 'en_US'],
  ['en/index.html', 'en_US', 'id_ID'],
  ['en/about.html', 'en_US', 'id_ID'],
  ['en/quiz.html', 'en_US', 'id_ID'],
  ['en/changelog.html', 'en_US', 'id_ID'],
  ['en/privacy.html', 'en_US', 'id_ID'],
  ['en/terms.html', 'en_US', 'id_ID'],
  ['en/contact.html', 'en_US', 'id_ID'],
  ['en/docs/getting-started.html', 'en_US', 'id_ID'],
  ['en/report-bug.html', 'en_US', 'id_ID'],
  ['en/status.html', 'en_US', 'id_ID'],
];

function meta(html, key) {
  const match = html.match(new RegExp(
    `<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i',
  ));
  return match?.[1];
}

test('every bilingual public page declares matching Open Graph locales', () => {
  for (const [page, primary, alternate] of PAGES) {
    const html = fs.readFileSync(page, 'utf8');
    assert.equal(meta(html, 'og:locale'), primary, `${page} primary locale`);
    assert.equal(meta(html, 'og:locale:alternate'), alternate, `${page} alternate locale`);
  }
});
