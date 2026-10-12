import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../dashboard.html', import.meta.url), 'utf8');

test('dashboard exposes the GitHub App install action', () => {
  assert.match(dashboard, /dashGithubAppActions/);
  assert.match(dashboard, /\/api\/integrations\/github\/install/);
});

test('dashboard loads the GitHub App connection state', () => {
  assert.match(dashboard, /loadGitHubAppStatus/);
  assert.match(dashboard, /params\.get\('github_app'\)/);
  assert.match(dashboard, /connected/);
});
