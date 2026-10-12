import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('dashboard only warns about session expiry inside the short warning window', () => {
  const dashboard = fs.readFileSync('dashboard.html', 'utf8');

  assert.match(dashboard, /var SESSION_POLL_MS=5\*60\*1000,SESSION_WARNING_MS=10\*60\*1000;/);
  assert.match(
    dashboard,
    /if\(LAST_USER&&LAST_USER\.exp\)\{var remaining=LAST_USER\.exp\*1000-Date\.now\(\);if\(remaining>0&&remaining<=SESSION_WARNING_MS\)items\.push\(sessionLanguage\(/,
    'the dashboard must use the short warning window instead of a 24-hour threshold',
  );
  assert.doesNotMatch(
    dashboard,
    /LAST_USER\.exp\*1000-Date\.now\(\)<86400000/,
    'the dashboard must not warn throughout the whole 24-hour session',
  );
});
