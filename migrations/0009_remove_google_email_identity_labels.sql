-- Provider identity labels are not public handles. Older Google sign-ins
-- used the email local-part as `login`, and a missing Google display name could
-- copy the full email into the account display name. Public handles belong to
-- profiles and must be chosen explicitly by the user.
UPDATE identities
   SET login = '',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER)
 WHERE provider = 'google';

UPDATE identities
   SET display_name = '',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER)
 WHERE provider = 'google'
   AND email IS NOT NULL
   AND lower(display_name) = lower(email);

UPDATE users
   SET display_name = '',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER)
 WHERE email IS NOT NULL
   AND lower(display_name) = lower(email);
