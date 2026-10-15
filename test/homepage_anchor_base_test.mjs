import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// A `<base href="/">` inside `en/index.html` made every fragment-only link on
// the English homepage (`#products`, `#release`, `#spotlight`, `#byteAssistant`,
// the skip link, …) resolve against the site ROOT. Clicking "Products" therefore
// navigated the visitor from /en/ to the Indonesian homepage `/` instead of
// scrolling in place -- the anchor left the English site entirely. The base tag
// was copied in when the English homepage was created and served no purpose:
// every URL on the page is absolute, so it only broke the in-page anchors.
//
// This locks the contract for every public page: a fragment link must resolve
// to the SAME document, i.e. the page must not carry a <base> that moves the
// path away from the page's own URL.

const PAGES = {
  'index.html': 'https://voidscriptor.com/',
  'en/index.html': 'https://voidscriptor.com/en/',
  'about.html': 'https://voidscriptor.com/about',
  'en/about.html': 'https://voidscriptor.com/en/about',
  'quiz.html': 'https://voidscriptor.com/quiz',
  'en/quiz.html': 'https://voidscriptor.com/en/quiz',
  'changelog.html': 'https://voidscriptor.com/changelog',
  'en/changelog.html': 'https://voidscriptor.com/en/changelog',
  'privacy.html': 'https://voidscriptor.com/privacy',
  'en/privacy.html': 'https://voidscriptor.com/en/privacy',
  'terms.html': 'https://voidscriptor.com/terms',
  'en/terms.html': 'https://voidscriptor.com/en/terms',
  'contact.html': 'https://voidscriptor.com/contact',
  'en/contact.html': 'https://voidscriptor.com/en/contact',
  'docs/getting-started.html': 'https://voidscriptor.com/docs/getting-started',
  'en/docs/getting-started.html': 'https://voidscriptor.com/en/docs/getting-started',
  'report-bug.html': 'https://voidscriptor.com/report-bug',
  'en/report-bug.html': 'https://voidscriptor.com/en/report-bug',
  'status.html': 'https://voidscriptor.com/status',
  'en/status.html': 'https://voidscriptor.com/en/status',
  'downloads.html': 'https://voidscriptor.com/downloads',
  'en/downloads.html': 'https://voidscriptor.com/en/downloads',
};

const baseHref = (html) => {
  const m = html.match(/<base\s[^>]*href=["']([^"']+)["']/i);
  return m ? m[1] : null;
};
const sameDocument = (a, b) => a.replace(/#.*$/, '') === b.replace(/#.*$/, '');

for (const [file, docUrl] of Object.entries(PAGES)) {
  test(`${file} keeps its in-page fragment links on ${docUrl}`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const fragments = [...html.matchAll(/href=["'](#[^"']+)["']/g)].map((m) => m[1]);
    if (fragments.length === 0) return;
    const declared = baseHref(html);
    const effectiveBase = declared ? new URL(declared, docUrl).href : docUrl;
    for (const frag of new Set(fragments)) {
      const resolved = new URL(frag, effectiveBase).href;
      assert.ok(
        sameDocument(resolved, docUrl),
        `${file}: "${frag}" resolves to ${resolved} (leaves ${docUrl}); a <base href> is breaking the in-page anchor`,
      );
    }
  });
}

test('the English homepage does not declare a root <base href>', () => {
  const html = fs.readFileSync('en/index.html', 'utf8');
  assert.ok(
    !/<base\s[^>]*href=["']\/["']/i.test(html),
    'en/index.html must not set <base href="/">: it breaks the page\'s in-page anchors',
  );
});
