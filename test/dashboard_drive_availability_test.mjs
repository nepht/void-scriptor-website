import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboard = await readFile(new URL('../dashboard.html', import.meta.url), 'utf8');

test('Google Drive connect action waits for a configured Google provider', () => {
  assert.match(
    dashboard,
    /id="dashDriveConnect"[^>]*\shidden(?:\s|>)/,
    'connect action must start hidden until session/provider state is known',
  );
  assert.match(dashboard, /var AUTH_PROVIDERS_READY=false/);
  assert.match(dashboard, /var providerReady=AUTH_PROVIDERS_READY&&AUTH_PROVIDERS\.google===true/);
  assert.match(
    dashboard,
    /connect\.hidden=connected\|\|!providerReady\|\|DRIVE_CONNECTION_ERROR\|\|!DRIVE_CONNECTION_LOADED/,
    'connect action must stay hidden while Drive status is unavailable or loading',
  );
});
