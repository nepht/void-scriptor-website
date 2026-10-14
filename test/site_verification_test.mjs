import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const homepage = fs.readFileSync('index.html', 'utf8');

// Google checks this tag to prove voidscriptor.com belongs to the account that
// owns the void-scriptor project. OAuth brand verification (app name + logo on
// the consent screen) stays blocked until that ownership check passes, so the
// tag must stay on the homepage exactly as issued.
test('homepage carries the Google site verification tag that proves domain ownership', () => {
  assert.match(
    homepage,
    /<meta name="google-site-verification" content="yyPHnjKxN0l_FzoEXRL6kDwpgYdVn0A-kMWG4myAlGQ">/,
    'the OAuth brand verification depends on this exact tag staying on the homepage',
  );
});

test('the verification tag sits inside the document head', () => {
  const tagIndex = homepage.indexOf('google-site-verification');
  const headEnd = homepage.toLowerCase().indexOf('</head>');
  assert.ok(tagIndex > -1, 'the verification tag must be present');
  assert.ok(headEnd > -1, 'the homepage must close its head element');
  assert.ok(tagIndex < headEnd, 'the verification tag must live inside <head>');
});
