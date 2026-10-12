import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('_worker.js', 'utf8');
const migration = fs.readFileSync(
  'migrations/0009_remove_google_email_identity_labels.sql',
  'utf8',
);

test('Google sign-in never derives an identity label from the email address', () => {
  const googleBlock = worker.slice(worker.indexOf("provider: 'google'"));

  assert.match(
    googleBlock,
    /login: '',/,
    'Google must not create a provider login from an email local-part',
  );
  assert.match(
    googleBlock,
    /name: info\.name \|\| '',/,
    'a missing Google display name must not fall back to the email address',
  );
  assert.doesNotMatch(
    googleBlock,
    /login:\s*\(info\.email\s*\|\| ''\)\.split\('@'\)\[0\]/,
    'the old email-prefix identity fallback must stay removed',
  );
});

test('Google identity cleanup removes labels written by the old fallback', () => {
  assert.match(migration, /UPDATE identities[\s\S]*SET login = ''/);
  assert.match(migration, /WHERE provider = 'google'/);
  assert.match(
    migration,
    /UPDATE users[\s\S]*lower\(display_name\) = lower\(email\)/,
    'old full-email display names must be cleared from account labels',
  );
});
