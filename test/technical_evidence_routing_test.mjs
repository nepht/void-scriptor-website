import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The full audit/checksum/limit detail lives on the single technical evidence
// page, so any user-facing page that repeats the self-issued signature fact
// must route readers there instead of leaving a dead end. dashboard.html is
// out of scope: its warning is an i18n string applied with textContent, which
// strips markup, so a link there must be a sibling element.
const SURFACES = [
  ['help.html', '/technical'],
  ['en/help.html', '/en/technical'],
  ['downloads.html', '/technical'],
  ['en/downloads.html', '/en/technical'],
  ['studio.html', '/technical'],
  ['en/studio.html', '/en/technical'],
];

test('pages repeating the self-issued signature fact link to the technical evidence page', () => {
  for (const [file, href] of SURFACES) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /self-issued/, file + ' must still state the self-issued fact');
    assert.ok(html.includes('href="' + href + '"'), file + ' must link to ' + href);
  }
});
