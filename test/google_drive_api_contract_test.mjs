import test from 'node:test';
import assert from 'node:assert/strict';
import { findGoogleDriveBackup, downloadGoogleDriveBackup } from '../_worker.js';

test('Drive discovery selects the newest valid Void Scriptor backup only', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify({
      files: [
        { id: 'newest-valid', name: 'voidscriptor-account-backup.json', modifiedTime: '2026-10-12T10:00:00Z' },
        { id: 'older-valid', name: 'voidscriptor-account-backup.json', modifiedTime: '2026-10-11T10:00:00Z' },
        { id: 'wrong-name', name: 'other.json', modifiedTime: '2026-10-13T10:00:00Z' },
        { id: 'contains space', name: 'voidscriptor-account-backup.json', modifiedTime: '2026-10-14T10:00:00Z' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await findGoogleDriveBackup('access-token');
    assert.deepEqual(result, {
      ok: true,
      fileId: 'newest-valid',
      lastBackupAt: Math.floor(Date.parse('2026-10-12T10:00:00Z') / 1000),
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.headers.authorization, 'Bearer access-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Drive download rejects an invalid file id without making a network request', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('must not fetch'); };
  try {
    assert.deepEqual(await downloadGoogleDriveBackup('access-token', 'not a valid id'), {
      ok: false,
      error: 'drive_backup_not_found',
    });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
