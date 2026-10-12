import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccountData } from '../_worker.js';

test('account deletion removes every account-owned record through one batch', async () => {
  const prepared = [];
  const db = {
    prepare(sql) {
      return {
        bind(userId) {
          prepared.push({ sql, userId });
          return { sql, userId };
        },
      };
    },
    async batch(statements) {
      assert.equal(statements.length, 7);
    },
  };

  const result = await deleteAccountData(db, 'user-123');

  assert.deepEqual(result, { deleted: true });
  assert.deepEqual(prepared, [
    { sql: 'DELETE FROM google_drive_connections WHERE user_id = ?', userId: 'user-123' },
    { sql: 'DELETE FROM account_backups WHERE user_id = ?', userId: 'user-123' },
    { sql: 'DELETE FROM profiles WHERE user_id = ?', userId: 'user-123' },
    { sql: 'DELETE FROM oauth_codes WHERE user_id = ?', userId: 'user-123' },
    { sql: 'DELETE FROM sessions WHERE user_id = ?', userId: 'user-123' },
    { sql: 'DELETE FROM identities WHERE user_id = ?', userId: 'user-123' },
    { sql: 'DELETE FROM users WHERE id = ?', userId: 'user-123' },
  ]);
});
