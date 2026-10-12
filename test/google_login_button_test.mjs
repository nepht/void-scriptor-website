import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pages = [
  'index.html',
  'en/index.html',
];

test('Google login is visible while provider availability is checked', () => {
  for (const page of pages) {
    const source = fs.readFileSync(page, 'utf8');
    const button = source.match(/<button\b[^>]*id="ggSignIn"[^>]*>/)?.[0] ?? '';

    assert.ok(button, `${page}: Google login button must exist`);
    assert.match(button, /\bhidden\b/, `${page}: Google login must default closed until the provider check runs`);
    assert.match(
      source,
      /button\.hidden=false;button\.disabled=true;button\.setAttribute\('aria-busy','true'\)/,
      `${page}: Google login must be visible and disabled while checking`,
    );
    assert.match(
      source,
      /if\(gg\)\{gg\.hidden=false;gg\.disabled=true;gg\.setAttribute\('aria-busy','true'\);/,
      `${page}: provider refresh must show the checking state`,
    );
    assert.match(
      source,
      /if\(p\.google\)\{gg\.disabled=false;gg\.removeAttribute\('aria-busy'\);/,
      `${page}: configured Google must become usable`,
    );
  }
});
