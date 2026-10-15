import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

// Every published page must reference its icons, web manifest and artwork from
// the site origin. The worker serves each clean route at BOTH its canonical
// path (/contact) and its trailing-slash twin (/contact/), so a relative
// `src="assets/void_scriptor_emblem.webp"` resolves to /assets/... at /contact
// but to /contact/assets/... (404) at /contact/. That left the header logo,
// favicon, apple-touch-icon and manifest broken on /about/, /changelog/,
// /contact/, /privacy/, /quiz/ and /terms/ while their English twins were fine.
//
// The previous version of this test only read en/index.html, so the six
// Indonesian content pages shipped relative references unnoticed. Walking the
// publish tree makes any page — nested or not — fail loudly.
//
// app/ is skipped on purpose: the Flutter shell declares <base href="/app/">,
// so its relative references (flutter_bootstrap.js, icons/...) resolve
// correctly under /app/ and are not defects.

const RELATIVE_ASSET_REF =
  /(?:src|href|srcset)=["'](?![/#]|https?:|mailto:|tel:|javascript:|data:)/g;

const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'app', 'tools', 'test', 'migrations']);

function walkHtml(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkHtml(dir === '.' ? entry.name : `${dir}/${entry.name}`, out);
    } else if (entry.name.endsWith('.html')) {
      out.push(dir === '.' ? entry.name : `${dir}/${entry.name}`);
    }
  }
  return out;
}

test('every published page roots its asset references at the site origin', () => {
  const pages = walkHtml('.', []).sort();
  assert.ok(pages.length > 0, 'the publish tree must contain HTML pages');
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const relative = html.match(RELATIVE_ASSET_REF) || [];
    assert.deepEqual(
      relative,
      [],
      `${page} must not contain relative asset references (they break at the trailing-slash route)`,
    );
  }
});

test('English homepage keeps public assets rooted at the site origin', () => {
  const englishHome = readFileSync('en/index.html', 'utf8');
  assert.match(englishHome, /href="\/site\.webmanifest"/);
  assert.match(englishHome, /src="\/assets\/void_scriptor_emblem\.webp"/);
  assert.match(englishHome, /src="\/assets\/byte_assistant\.webp"/);
});
