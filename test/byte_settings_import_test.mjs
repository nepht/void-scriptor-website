import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

test('Byte settings import has a bounded payload and validates before storage', () => {
  assert.match(
    dashboard,
    /var BYTE_SETTINGS_IMPORT_MAX_BYTES=16\*1024;/,
    'Byte settings import must cap the local JSON payload',
  );
  assert.match(
    dashboard,
    /if\(file\.size>BYTE_SETTINGS_IMPORT_MAX_BYTES\)throw new Error\('payload_too_large'\);/,
    'oversized imports must be rejected before reading the file',
  );
  assert.match(
    dashboard,
    /var payload=JSON\.parse\(text\),settings=validateByteSettingsImport\(payload\);localStorage\.setItem/,
    'validation must happen before localStorage is changed',
  );
  assert.match(
    dashboard,
    /var unsafeKeys=\['prompt','instruction','messages','system','tools'\]/,
    'instruction-bearing fields must remain explicitly blocked',
  );
});

test('Byte settings schema remains exact and bounded to the supported controls', () => {
  assert.match(
    dashboard,
    /if\(keys\.length!==3\|\|keys\.some\(function\(key\)\{return \['persona','safe','voice'\]\./,
    'unknown settings fields must be rejected',
  );
  assert.match(
    dashboard,
    /if\(value\.format!==\'voidscriptor-byte-settings\'\|\|value\.version!==1\)throw new Error\('invalid_version'\)/,
    'wrapped imports must use the current versioned format',
  );
});
