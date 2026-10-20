import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('dashboard.html', 'utf8');

test('Indonesian runtime override repeats the static app-session copy', () => {
  const staticCopy = source.match(/data-i18n="center-connect-copy">([^<]*)</)?.[1];
  const override = source.match(/dict\.id\['center-connect-copy'\]='([^']*)'/)?.[1];

  assert.ok(staticCopy, 'static center-connect-copy element is missing');
  assert.ok(override, 'Indonesian runtime override for center-connect-copy is missing');
  assert.equal(override, staticCopy, 'runtime override contradicts the rendered copy');
});

test('no dashboard copy layer claims an app connection that is not available', () => {
  const staleClaims = [
    'Akun yang sama dipakai oleh website dan aplikasi',
    'Use the same account to sign in to the website and the Windows RC2 app',
    'mengenali akun yang sama untuk website, Void Scriptor, dan QOWNER',
    'identify the same account across the website, Void Scriptor, and QOWNER',
  ];

  for (const claim of staleClaims) {
    assert.ok(!source.includes(claim), `stale app-connection claim: ${claim}`);
  }

  assert.match(source, /dict\.en\['center-connect-copy'\]='[^']*does not use the website session yet/);
});
