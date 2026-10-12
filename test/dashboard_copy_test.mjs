import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Indonesian dashboard copy hides internal labels from the user', () => {
  const source = fs.readFileSync('dashboard.html', 'utf8');
  const idDictionary = source.slice(source.indexOf('id: {'), source.indexOf('en: {'));

  for (const phrase of [
    'ACCOUNT / IDENTITY',
    'QUICK CONNECT',
    'CLOUD CENTER',
    'BACKUP / SYNC',
    'ACTIVITY / ACCOUNT',
    'BYTE / READINESS',
    'BYTE / TASKS',
    'STATUS / ATTENTION',
    'DIAGNOSTICS / LOCAL',
    'BYTE / PREFERENCES',
    'BYTE / LOCAL CONNECTION',
  ]) {
    assert.doesNotMatch(idDictionary, new RegExp(`'[^']+':'${phrase.replaceAll('/', '\\/')}'`), `internal label remains: ${phrase}`);
  }

  assert.match(idDictionary, /'center-auth-kicker':'AKUN & IDENTITAS'/);
  assert.match(idDictionary, /'center-connect-kicker':'AKUN TERHUBUNG'/);
  assert.match(idDictionary, /'center-cloud-kicker':'PENYIMPANAN ONLINE'/);
  assert.match(idDictionary, /'center-backup-kicker':'CADANGAN & SINKRONISASI'/);
  assert.match(idDictionary, /'center-activity-kicker':'AKTIVITAS AKUN'/);
  assert.match(idDictionary, /'dash-ready-kicker':'BYTE \/ KESIAPAN'/);
  assert.match(idDictionary, /'dash-ops-task-kicker':'BYTE \/ TUGAS'/);
  assert.match(idDictionary, /'dash-ops-notice-kicker':'STATUS \/ PERHATIAN'/);
  assert.match(idDictionary, /'dash-ops-diag-kicker':'BYTE \/ PEMERIKSAAN'/);
  assert.match(idDictionary, /'dash-settings-kicker':'BYTE \/ PREFERENSI'/);
  assert.match(idDictionary, /'dash-local-kicker':'BYTE \/ KONEKSI LOKAL'/);
  assert.match(source, /dict\.id\['center-summary-billing-value'\]='Belum tersedia'/);
  assert.match(source, /dict\.en\['center-summary-billing-value'\]='Not available'/);
});
