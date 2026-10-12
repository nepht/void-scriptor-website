import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInstallationUrl,
  normalizeInstallationId,
} from '../github_app_connector.js';

test('builds the GitHub App installation URL with the signed state', () => {
  assert.equal(
    buildInstallationUrl('void-scriptor-developer-connector', 'signed-state'),
    'https://github.com/apps/void-scriptor-developer-connector/installations/new?state=signed-state',
  );
});

test('accepts only a bounded numeric GitHub installation id', () => {
  assert.equal(normalizeInstallationId('123456789'), '123456789');
  assert.equal(normalizeInstallationId(''), null);
  assert.equal(normalizeInstallationId('abc'), null);
  assert.equal(normalizeInstallationId('1'.repeat(21)), null);
});
