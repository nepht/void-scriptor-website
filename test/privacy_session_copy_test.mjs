import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('privacy policy describes the web session renewal contract accurately', () => {
  const privacy = fs.readFileSync('privacy.html', 'utf8');
  const worker = fs.readFileSync('_worker.js', 'utf8');

  assert.match(worker, /SESSION_RENEW_WINDOW\s*=\s*2\s*\*\s*60\s*\*\s*60/);
  assert.match(worker, /session_renewed:\s*renewal\.renewed/);
  assert.match(
    privacy,
    /Sesi browser[^.]*diperbarui otomatis[^.]*mendekati kedaluwarsa/i,
    'Indonesian policy must explain sliding web sessions',
  );
  assert.match(
    privacy,
    /web session[^.]*renewed automatically[^.]*near expiry/i,
    'English policy must explain sliding web sessions',
  );
  assert.doesNotMatch(
    privacy,
    /Cookie bersifat <code>HttpOnly<\/code>[^.]*<b>berlaku 24 jam<\/b>/i,
    'policy must not describe the web cookie as a fixed 24-hour session',
  );
  assert.match(
    privacy,
    /Sesi aplikasi:<\/b>[\s\S]*?berlaku paling lama 24 jam/i,
    'native sessions may remain fixed at their documented maximum',
  );
});
