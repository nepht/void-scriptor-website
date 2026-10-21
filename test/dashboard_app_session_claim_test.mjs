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

test('the base dict layers for dash-data-note make no shared-identity claim', () => {
  const literals = [...source.matchAll(/'dash-data-note':'([^']*)'/g)].map((m) => m[1]);

  assert.equal(literals.length, 2, 'expected an Indonesian and an English base dict literal');
  assert.ok(
    literals[0].includes('Aplikasi belum memakai sesi website ini'),
    'Indonesian base dict literal must state that apps do not use the website session',
  );
  assert.ok(
    !literals[0].includes('identitas yang sama'),
    'stale shared-identity claim in the Indonesian base dict literal',
  );
  assert.ok(
    literals[1].includes('Apps do not use this website session yet'),
    'English base dict literal must state that apps do not use the website session',
  );
});
