const encoder = new TextEncoder();
const GITHUB_API = 'https://api.github.com';
const GITHUB_APP_SLUG = 'void-scriptor-developer-connector';
const GITHUB_APP_STATE_COOKIE = 'vs_github_app_state';
const STATE_TTL = 600;

function concatBytes(...parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlBytes(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function derLength(length) {
  if (length < 128) return Uint8Array.of(length);
  const bytes = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function derSequence(content) {
  return concatBytes(Uint8Array.of(0x30), derLength(content.length), content);
}

function derOctetString(content) {
  return concatBytes(Uint8Array.of(0x04), derLength(content.length), content);
}

// GitHub downloads RSA private keys as PKCS#1, while Web Crypto imports PKCS#8.
function normalizePrivateKeyDer(pem) {
  const match = String(pem || '').trim().match(
    /^-----BEGIN ([^-]+)-----([\s\S]+?)-----END \1-----$/,
  );
  if (!match) throw new Error('private_key_format');
  const label = match[1];
  const body = match[2].replace(/\s+/g, '');
  const der = base64UrlBytes(body.replace(/\+/g, '-').replace(/\//g, '_'));
  if (label === 'PRIVATE KEY') return der;
  if (label !== 'RSA PRIVATE KEY') throw new Error('private_key_algorithm');

  const algorithm = Uint8Array.from([
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ]);
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  return derSequence(concatBytes(version, algorithm, derOctetString(der)));
}

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: { location, 'cache-control': 'no-store', ...headers },
  });
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function clearStateCookie() {
  return `${GITHUB_APP_STATE_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function parseCookies(request) {
  const result = {};
  for (const item of (request.headers.get('cookie') || '').split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      // Treat malformed state as absent rather than allowing it to escape.
    }
  }
  return result;
}

function appConfigurationState(env) {
  return {
    app_id: Boolean(env.GITHUB_APP_ID),
    private_key: Boolean(env.GITHUB_APP_PRIVATE_KEY),
    session: Boolean(env.SESSION_SECRET),
    database: Boolean(env.ACCOUNTS_DB),
  };
}

function configured(env) {
  const state = appConfigurationState(env);
  return state.app_id && state.private_key && state.session && state.database;
}

function normalizeInstallationId(value) {
  const normalized = String(value || '').trim();
  return /^\d{1,20}$/.test(normalized) ? normalized : null;
}

function buildInstallationUrl(slug, state) {
  const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  url.searchParams.set('state', state);
  return url.toString();
}

async function appJwt(env) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    normalizePrivateKeyDer(env.GITHUB_APP_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify({
    iat: now - 60,
    exp: now + 540,
    iss: String(env.GITHUB_APP_ID),
  })));
  const signingInput = encoder.encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, signingInput);
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

function githubHeaders(authorization) {
  return {
    accept: 'application/vnd.github+json',
    authorization,
    'user-agent': 'voidscriptor-developer-connector',
    'x-github-api-version': '2022-11-28',
  };
}

async function readProviderJson(response) {
  return response.json().catch(() => null);
}

async function issueInstallationToken(env, installationId) {
  const jwt = await appJwt(env);
  const response = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    { method: 'POST', headers: githubHeaders(`Bearer ${jwt}`) },
  );
  const body = await readProviderJson(response);
  if (!response.ok || typeof body?.token !== 'string' || !body.token) {
    throw new Error(`github_installation_token_${response.status}`);
  }
  return {
    token: body.token,
    expires_at: body.expires_at || null,
    permissions: body.permissions || {},
    repository_selection: body.repository_selection || 'unknown',
  };
}

async function readInstallationDetails(env, installationId) {
  const jwt = await appJwt(env);
  const response = await fetch(
    `${GITHUB_API}/app/installations/${installationId}`,
    { headers: githubHeaders(`Bearer ${jwt}`) },
  );
  const body = await readProviderJson(response);
  if (!response.ok) throw new Error(`github_installation_details_${response.status}`);
  return {
    account_login: body?.account?.login || null,
    repository_selection: body?.repository_selection || 'unknown',
    suspended_at: body?.suspended_at || null,
  };
}

async function cryptoKey(secret) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`voidscriptor-github-app-v1:${String(secret)}`),
  );
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptToken(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await cryptoKey(secret),
    encoder.encode(value),
  );
  return base64Url(concatBytes(iv, new Uint8Array(ciphertext)));
}

async function decryptToken(value, secret) {
  const bytes = base64UrlBytes(value);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) },
    await cryptoKey(secret),
    bytes.slice(12),
  );
  return new TextDecoder().decode(plaintext);
}

async function getConnection(env, userId) {
  return env.ACCOUNTS_DB.prepare(`
    SELECT user_id, installation_id, account_login, repository_selection,
           permissions_json, token_ciphertext, expires_at, created_at, updated_at
      FROM github_app_connections
     WHERE user_id = ? AND revoked_at IS NULL
     LIMIT 1
  `).bind(userId).first();
}

async function audit(env, userId, eventType, metadata = {}) {
  try {
    await env.ACCOUNTS_DB.prepare(`
      INSERT INTO github_app_audit_events (user_id, event_type, metadata_json, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(userId, eventType, JSON.stringify(metadata), Math.floor(Date.now() / 1000)).run();
  } catch {
    // Audit failure must not leak credentials or turn a successful provider
    // response into a false-negative connector result.
  }
}

async function sessionFor(request, env, deps) {
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) return null;
  return deps.readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
}

async function startInstallation(request, url, env, deps) {
  if (request.method !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });
  if (!configured(env)) return json(503, { ok: false, error: 'github_app_not_configured', configuration: appConfigurationState(env) });
  const session = await sessionFor(request, env, deps);
  if (!session?.uid || !session.sid) return redirect('/?auth=required');
  const state = await deps.signSession({
    kind: 'github_app_install',
    uid: session.uid,
    session_hash: await deps.sha256B64url(session.sid),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL,
  }, env.SESSION_SECRET);
  return redirect(buildInstallationUrl(env.GITHUB_APP_SLUG || GITHUB_APP_SLUG, state), {
    'set-cookie': cookie(GITHUB_APP_STATE_COOKIE, state, STATE_TTL),
  });
}

async function finishInstallation(request, url, env, deps) {
  if (request.method !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });
  if (!configured(env)) return json(503, { ok: false, error: 'github_app_not_configured', configuration: appConfigurationState(env) });
  const session = await sessionFor(request, env, deps);
  const cookies = parseCookies(request);
  const state = url.searchParams.get('state') || '';
  const stateCookie = cookies[GITHUB_APP_STATE_COOKIE] || '';
  const payload = state && state === stateCookie
    ? await deps.verifySignedPayload(state, env.SESSION_SECRET)
    : null;
  if (!session?.uid || !session.sid || !payload || payload.kind !== 'github_app_install' || payload.uid !== session.uid) {
    return json(400, { ok: false, error: 'invalid_install_state' }, { 'set-cookie': clearStateCookie() });
  }
  const installationId = normalizeInstallationId(url.searchParams.get('installation_id'));
  if (!installationId) return json(400, { ok: false, error: 'invalid_installation_id' }, { 'set-cookie': clearStateCookie() });
  if (url.searchParams.get('setup_action') === 'suspend') {
    return redirect('/dashboard?github_app=suspended', { 'set-cookie': clearStateCookie() });
  }

  try {
    const [token, details] = await Promise.all([
      issueInstallationToken(env, installationId),
      readInstallationDetails(env, installationId),
    ]);
    if (details.suspended_at) return redirect('/dashboard?github_app=suspended', { 'set-cookie': clearStateCookie() });
    const now = Math.floor(Date.now() / 1000);
    await env.ACCOUNTS_DB.prepare(`
      INSERT INTO github_app_connections (
        user_id, installation_id, account_login, repository_selection,
        permissions_json, token_ciphertext, expires_at, created_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(user_id) DO UPDATE SET
        installation_id = excluded.installation_id,
        account_login = excluded.account_login,
        repository_selection = excluded.repository_selection,
        permissions_json = excluded.permissions_json,
        token_ciphertext = excluded.token_ciphertext,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at,
        revoked_at = NULL
    `).bind(
      session.uid,
      installationId,
      details.account_login,
      details.repository_selection || token.repository_selection,
      JSON.stringify(token.permissions),
      await encryptToken(token.token, env.SESSION_SECRET),
      token.expires_at ? Math.floor(Date.parse(token.expires_at) / 1000) : now + 3600,
      now,
      now,
    ).run();
    await audit(env, session.uid, 'app_connected', {
      installation_id: installationId,
      account_login: details.account_login,
      repository_selection: details.repository_selection || token.repository_selection,
    });
    return redirect('/dashboard?github_app=connected', { 'set-cookie': clearStateCookie() });
  } catch (error) {
    console.error('github app installation failed', error?.message || 'provider_error');
    return redirect('/dashboard?github_app=failed', { 'set-cookie': clearStateCookie() });
  }
}

async function currentToken(env, connection) {
  const expiresAt = Number(connection.expires_at) || 0;
  if (expiresAt > Math.floor(Date.now() / 1000) + 60) {
    return decryptToken(connection.token_ciphertext, env.SESSION_SECRET);
  }
  const token = await issueInstallationToken(env, connection.installation_id);
  const now = Math.floor(Date.now() / 1000);
  await env.ACCOUNTS_DB.prepare(`
    UPDATE github_app_connections
       SET permissions_json = ?, token_ciphertext = ?, expires_at = ?, updated_at = ?
     WHERE user_id = ? AND revoked_at IS NULL
  `).bind(
    JSON.stringify(token.permissions),
    await encryptToken(token.token, env.SESSION_SECRET),
    token.expires_at ? Math.floor(Date.parse(token.expires_at) / 1000) : now + 3600,
    now,
    connection.user_id,
  ).run();
  return token.token;
}

async function providerRequest(env, connection, path, init = {}) {
  const token = await currentToken(env, connection);
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      ...githubHeaders(`Bearer ${token}`),
      ...(init.headers || {}),
    },
  });
}

async function readResources(request, env, session) {
  const connection = await getConnection(env, session.uid);
  if (!connection) return json(404, { ok: false, error: 'github_app_not_connected' });
  try {
    const response = await providerRequest(env, connection, '/installation/repositories?per_page=100');
    const body = await readProviderJson(response);
    if (!response.ok) return json(502, { ok: false, error: 'github_resources_unavailable' });
    const repositories = Array.isArray(body?.repositories) ? body.repositories : [];
    await audit(env, session.uid, 'resources_read', { count: repositories.length });
    return json(200, {
      ok: true,
      provider: 'github',
      resource_count: Number(body?.total_count) || repositories.length,
      resources: repositories.map((repo) => ({
        id: repo.id,
        full_name: repo.full_name,
        private: Boolean(repo.private),
        default_branch: repo.default_branch || null,
      })),
    });
  } catch (error) {
    console.error('github resources lookup failed', error?.message || 'provider_error');
    return json(502, { ok: false, error: 'github_resources_unavailable' });
  }
}

async function readRateLimit(env, session) {
  const connection = await getConnection(env, session.uid);
  if (!connection) return json(404, { ok: false, error: 'github_app_not_connected' });
  try {
    const response = await providerRequest(env, connection, '/rate_limit');
    const body = await readProviderJson(response);
    if (!response.ok) return json(502, { ok: false, error: 'github_rate_limit_unavailable' });
    await audit(env, session.uid, 'rate_limit_read', {});
    const core = body?.resources?.core || {};
    return json(200, {
      ok: true,
      provider: 'github',
      rate_limit: {
        limit: Number(core.limit) || 0,
        remaining: Number(core.remaining) || 0,
        reset: Number(core.reset) || 0,
      },
    });
  } catch (error) {
    console.error('github rate limit lookup failed', error?.message || 'provider_error');
    return json(502, { ok: false, error: 'github_rate_limit_unavailable' });
  }
}

async function revokeInstallation(request, env, session) {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  const connection = await getConnection(env, session.uid);
  if (!connection) return json(404, { ok: false, error: 'github_app_not_connected' });
  try {
    const jwt = await appJwt(env);
    const response = await fetch(`${GITHUB_API}/app/installations/${connection.installation_id}`, {
      method: 'DELETE',
      headers: githubHeaders(`Bearer ${jwt}`),
    });
    if (!response.ok && response.status !== 404) return json(502, { ok: false, error: 'github_revoke_failed' });
    await env.ACCOUNTS_DB.prepare(`
      UPDATE github_app_connections
         SET token_ciphertext = '', revoked_at = ?, updated_at = ?
       WHERE user_id = ?
    `).bind(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), session.uid).run();
    await audit(env, session.uid, 'app_revoked', { installation_id: connection.installation_id });
    return json(200, { ok: true, provider: 'github', revoked: true });
  } catch (error) {
    console.error('github revoke failed', error?.message || 'provider_error');
    return json(502, { ok: false, error: 'github_revoke_failed' });
  }
}

async function readAudit(env, session) {
  const rows = await env.ACCOUNTS_DB.prepare(`
    SELECT event_type, metadata_json, created_at
      FROM github_app_audit_events
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 30
  `).bind(session.uid).all();
  return json(200, {
    ok: true,
    provider: 'github',
    events: (rows.results || []).map((row) => ({
      event_type: row.event_type,
      metadata: JSON.parse(row.metadata_json || '{}'),
      created_at: Number(row.created_at) || 0,
    })),
  });
}

export async function handleGitHubAppIntegration(request, url, env, deps) {
  const path = url.pathname;
  if (path === '/api/integrations/github/callback') {
    return finishInstallation(request, url, env, deps);
  }
  if (path === '/api/integrations/github/install') {
    return startInstallation(request, url, env, deps);
  }
  if (path !== '/api/integrations/github' && !path.startsWith('/api/integrations/github/')) {
    return json(404, { ok: false, error: 'not_found' });
  }
  const session = await sessionFor(request, env, deps);
  if (!session?.uid) return json(401, { ok: false, error: 'unauthenticated' });
  if (path === '/api/integrations/github') {
    const connection = await getConnection(env, session.uid);
    return json(200, {
      ok: true,
      provider: 'github',
      configured: configured(env),
      connected: Boolean(connection),
      account_login: connection?.account_login || null,
      repository_selection: connection?.repository_selection || null,
      permissions: connection ? JSON.parse(connection.permissions_json || '{}') : {},
      capabilities: ['resources', 'rate_limits', 'organization_policy', 'revoke', 'audit'],
    });
  }
  if (!configured(env)) return json(503, { ok: false, error: 'github_app_not_configured', configuration: appConfigurationState(env) });
  if (path === '/api/integrations/github/resources') return readResources(request, env, session);
  if (path === '/api/integrations/github/rate-limit') return readRateLimit(env, session);
  if (path === '/api/integrations/github/revoke') return revokeInstallation(request, env, session);
  if (path === '/api/integrations/github/audit') return readAudit(env, session);
  return json(404, { ok: false, error: 'not_found' });
}

export { appConfigurationState, buildInstallationUrl, normalizeInstallationId };
