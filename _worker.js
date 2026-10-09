// Pages Advanced Mode worker: static site + /downloads/* proxy to R2.
// Rationale: Pages assets cap at 25 MiB/file; installer artifacts live in
// R2 bucket `voidscriptor-downloads` (APAC) and stream through here with
// an attachment disposition. Everything else is served from ASSETS.
// Internal/build files are never served: the deploy tree keeps provenance
// and wrangler config, but those are not public site content.
//
// Security headers are applied here (not via a `_headers` file) because a
// Pages Advanced Mode worker owns every response and `_headers` is not
// consulted for routes the worker returns directly.
const INTERNAL = [
  /^\/wrangler\.toml$/,
  /^\/\.assetsignore$/,
  /^\/\.gitignore$/,
  /^\/_worker\.js$/,
  /^\/_prod_deployment_meta_.*\.json$/,
  /^\/_prod_artifact_.*\.zip$/,
  /^\/\.wrangler\//,
  /^\/\.git\//,
  /^\/tools\//,
];
const APP_PREVIEW_PREFIX = '/preview';
const LEGACY_HOSTS = new Set(['voidscriptor.pages.dev']);
const WWW_HOST = 'www.voidscriptor.com';
const CANONICAL_HOST = 'voidscriptor.com';

const BASE_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'geolocation=(), microphone=(), camera=()',
};

// Strict policy for our own hand-written pages. They are fully self-contained
// (inline CSS/JS, same-origin images), so this needs no external allowances.
// The only exceptions are the two sign-in providers: their avatar hosts so the
// header can show the person's real picture, and github.com for form-action
// during the authorize POST. Every other image on the site is same-origin.
const CSP_SITE = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' http://127.0.0.1:8766 http://localhost:8766",
  "font-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self' https://github.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
].join('; ');

// The /app/ bundle is a Flutter Web build (CanvasKit/skwasm). A strict CSP
// would break its WebAssembly compilation, and it is already gated behind
// Cloudflare Access, so it only receives the transport/anti-sniff headers.
//
// Caching: Pages serves every file with `max-age=0, must-revalidate`, so a
// repeat visitor pays a round-trip per image even though the bytes never
// changed. The filenames are NOT content-hashed, so a long immutable cache
// would pin stale art after a deploy. The middle ground is a fresh window plus
// stale-while-revalidate: repeat visits stop waiting on the network, while a
// deploy still propagates (stale is served at most once, then replaced).
//
// Only heavy binary art and fonts are cached. CSS/JS are deliberately left on
// Pages' revalidate-every-time default: they are small, and a stale stylesheet
// is the one thing that makes a deploy look visibly broken. robots.txt and
// sitemap.xml stay fresh too, so adding a page is not delayed by a day.
const CACHE_ART = /\.(?:webp|png|jpe?g|svg|gif|ico|avif|woff2?|ttf|otf)$/i;
function cachePolicy(pathname, isHtml, status) {
  // Never cache anything but a real success: a cached 404 would outlive the fix.
  if (status !== 200) return null;
  // HTML is the entry point; /app/ owns its own cache via the Flutter SW.
  if (isHtml || pathname.startsWith('/app/')) return null;
  if (CACHE_ART.test(pathname)) return 'public, max-age=86400, stale-while-revalidate=604800';
  return null;
}

function harden(res, pathname, isHtml) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) headers.set(k, v);
  if (isHtml && !pathname.startsWith('/app/')) {
    headers.set('content-security-policy', CSP_SITE);
  }
  const cc = cachePolicy(pathname, isHtml, res.status);
  if (cc) headers.set('cache-control', cc);
  // Entry HTML and UI code must reflect the current deployment immediately;
  // immutable art is the only content allowed to use the long cache above.
  if (res.status === 200 && (isHtml || /\.(?:css|js|json|txt|xml|webmanifest)$/i.test(pathname))) {
    headers.set('cache-control', 'no-store');
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

// Public read-only alias for the Flutter build. `/app/` remains behind
// Cloudflare Access; the alias lets visitors preview the UI without exposing
// the private route or duplicating the compiled bundle.
async function handleAppPreview(request, url, env) {
  const suffix = url.pathname.slice(APP_PREVIEW_PREFIX.length);
  const isEntry = suffix === '' || suffix === '/';
  const targetPath = isEntry ? '/preview-entry.txt' : '/app' + suffix;
  const target = new URL(targetPath, url);
  target.search = url.search;
  const asset = await env.ASSETS.fetch(new Request(target, request));
  if (!asset.ok) return harden(asset, url.pathname, false);

  if (isEntry) {
    const headers = new Headers(asset.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'no-store');
    return harden(new Response(asset.body, { status: 200, headers }), url.pathname, false);
  }

  return harden(asset, url.pathname, false);
}

// ---------------------------------------------------------------------------
// GitHub OAuth
//
// Flow (authorization code; the GitHub token never reaches the browser):
//   1. GET  /api/auth/github         -> random state into a short-lived cookie,
//                                       302 to github.com/login/oauth/authorize
//   2. GET  /api/auth/github/callback-> verify state, exchange code for a token
//                                       server-side, read profile, 302 back to /
//   3. GET  /api/auth/session        -> JSON identity for the header badge
//   4. POST /api/auth/logout         -> clear the session cookie
//   5. POST /api/auth/exchange       -> exchange a one-time PKCE code for a
//                                       bearer session used by native clients
//
// The provider access token is used once to read the profile and then discarded.
// Web sessions carry an opaque session id in an HMAC-signed cookie; native
// clients receive the same kind of opaque session token only after a one-time
// PKCE exchange. The id is hashed in D1 and linked to a durable user account.
// If D1 is not bound in a local preview, the old stateless cookie fallback
// remains available for development only; native exchange remains disabled.
// ---------------------------------------------------------------------------

const OAUTH_STATE_COOKIE = 'vs_oauth_state';
const OAUTH_FLOW_COOKIE = 'vs_oauth_flow';
const SESSION_COOKIE = 'vs_session';
const SESSION_TTL = 24 * 60 * 60; // 24 hours, in seconds
const STATE_TTL = 600; // 10 minutes to finish the round trip
const NATIVE_AUTH_CODE_TTL = 120; // seconds; one-time code after provider login
const NATIVE_REDIRECT_URI = 'vscriptor://oauth/callback';
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';

// read:user + user:email is the minimum to identify who signed in. Deliberately
// no repo or org scopes: signing in should not imply any access to their code.
const GITHUB_SCOPE = 'read:user user:email';

// Google sign-in. `openid email profile` are all non-sensitive, so the OAuth
// consent screen needs no Google review and the app works immediately. We ask
// for nothing beyond identity — no Drive, no Gmail, no contacts.
const GOOGLE_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_SCOPE = 'openid email profile';

function parseCookies(req) {
  const out = {};
  const raw = req.headers.get('cookie');
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function bearerToken(req) {
  const value = req.headers.get('authorization') || '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

function cookie(name, value, { maxAge, clear = false } = {}) {
  const bits = [
    `${name}=${clear ? '' : encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  if (clear) bits.push('Max-Age=0');
  else bits.push(`Max-Age=${maxAge}`);
  return bits.join('; ');
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

// Constant-time compare so a wrong state cannot be probed byte by byte.
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signSession(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    new TextEncoder().encode(body),
  );
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function verifySignedPayload(raw, secret) {
  if (!raw || !secret) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      b64urlDecode(sig),
      new TextEncoder().encode(body),
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
}

function nativeFlowRequest(url, provider) {
  if (url.searchParams.get('client') !== 'desktop') {
    return { requested: false, flow: null };
  }
  const redirectUri = url.searchParams.get('redirect_uri') || '';
  const state = url.searchParams.get('state') || '';
  const codeChallenge = url.searchParams.get('code_challenge') || '';
  const codeChallengeMethod = url.searchParams.get('code_challenge_method') || '';
  const valid =
    redirectUri === NATIVE_REDIRECT_URI &&
    /^[A-Za-z0-9_-]{16,128}$/.test(state) &&
    /^[A-Za-z0-9_-]{43}$/.test(codeChallenge) &&
    codeChallengeMethod === 'S256';
  if (!valid) return { requested: true, flow: null };
  return {
    requested: true,
    flow: {
      kind: 'native',
      client: 'desktop',
      provider,
      state,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    },
  };
}

async function readNativeFlow(req, secret, provider) {
  const payload = await verifySignedPayload(
    parseCookies(req)[OAUTH_FLOW_COOKIE],
    secret,
  );
  if (!payload || payload.kind !== 'native' || payload.provider !== provider) return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  if (
    payload.redirect_uri !== NATIVE_REDIRECT_URI ||
    typeof payload.state !== 'string' ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(payload.state) ||
    typeof payload.code_challenge !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(payload.code_challenge) ||
    payload.code_challenge_method !== 'S256'
  ) return null;
  return payload;
}

function clearOAuthCookies() {
  return [
    cookie(OAUTH_STATE_COOKIE, '', { clear: true }),
    cookie(OAUTH_FLOW_COOKIE, '', { clear: true }),
  ];
}

function nativeCallbackUrl(flow, params = {}) {
  const target = new URL(flow.redirect_uri);
  target.searchParams.set('state', flow.state);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      target.searchParams.set(key, String(value));
    }
  }
  return target.toString();
}

async function sha256B64url(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(value)),
  );
  return b64url(new Uint8Array(digest));
}

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value || null;
}

function newAccountId() {
  return `usr_${crypto.randomUUID()}`;
}

async function ensureAccount(db, { sub, provider, login, name, avatar, email, emailVerified }) {
  const now = Math.floor(Date.now() / 1000);
  const subject = String(sub);
  const normalized = normalizeEmail(email);
  const verified = emailVerified ? 1 : 0;
  const existingIdentity = await db
    .prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?')
    .bind(provider, subject)
    .first();
  let userId = existingIdentity && existingIdentity.user_id;

  // A provider subject is the primary identity key. A verified email may link
  // a second provider to the same account, but an unverified address never can.
  if (!userId && normalized && verified) {
    const matchingUser = await db
      .prepare('SELECT id FROM users WHERE lower(email) = ? AND email_verified = 1 ORDER BY created_at LIMIT 1')
      .bind(normalized)
      .first();
    userId = matchingUser && matchingUser.id;
  }
  if (!userId) userId = newAccountId();

  await db.prepare(`
    INSERT INTO users (
      id, email, email_verified, display_name, avatar_url,
      created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = CASE WHEN excluded.email IS NOT NULL THEN excluded.email ELSE users.email END,
      email_verified = CASE WHEN excluded.email_verified = 1 THEN 1 ELSE users.email_verified END,
      display_name = CASE WHEN excluded.display_name <> '' THEN excluded.display_name ELSE users.display_name END,
      avatar_url = CASE WHEN excluded.avatar_url <> '' THEN excluded.avatar_url ELSE users.avatar_url END,
      updated_at = excluded.updated_at,
      last_login_at = excluded.last_login_at
  `).bind(
    userId,
    normalized,
    verified,
    String(name || login || ''),
    String(avatar || ''),
    now,
    now,
    now,
  ).run();

  await db.prepare(`
    INSERT INTO identities (
      id, user_id, provider, subject, login, display_name, avatar_url,
      email, email_verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, subject) DO UPDATE SET
      user_id = excluded.user_id,
      login = excluded.login,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      email = excluded.email,
      email_verified = excluded.email_verified,
      updated_at = excluded.updated_at
  `).bind(
    crypto.randomUUID(),
    userId,
    provider,
    subject,
    String(login || ''),
    String(name || login || ''),
    String(avatar || ''),
    normalized,
    verified,
    now,
    now,
  ).run();

  return { userId, subject, provider, createdAt: now };
}

async function createPersistentSession(db, { userId, provider, subject, now, exp, client = 'web' }) {
  const sid = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const idHash = await sha256B64url(sid);
  const sessionRef = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO sessions (
      id_hash, session_ref, user_id, provider, subject, created_at,
      expires_at, revoked_at, client, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).bind(idHash, sessionRef, userId, provider, subject, now, exp, client, now).run();
  return sid;
}

async function createNativeAuthorizationCode(db, flow, { userId, provider, subject, now }) {
  const code = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const codeHash = await sha256B64url(code);
  const expiresAt = now + NATIVE_AUTH_CODE_TTL;
  await db.prepare(
    'DELETE FROM oauth_codes WHERE expires_at <= ? OR used_at IS NOT NULL',
  ).bind(now).run();
  await db.prepare(`
    INSERT INTO oauth_codes (
      code_hash, user_id, provider, subject, redirect_uri,
      code_challenge, code_challenge_method, created_at, expires_at, used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    codeHash,
    userId,
    provider,
    subject,
    flow.redirect_uri,
    flow.code_challenge,
    flow.code_challenge_method,
    now,
    expiresAt,
  ).run();
  return code;
}

// The identity, or null for anything that is not a valid, unexpired,
// correctly-signed session cookie.
async function readSession(req, secret, db) {
  const raw = parseCookies(req)[SESSION_COOKIE] || bearerToken(req);
  const payload = await verifySignedPayload(raw, secret);
  if (!payload || typeof payload !== 'object') return null;
  if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
    return null;
  }
  if (db) {
    // Once persistence is enabled, old stateless cookies are intentionally
    // rejected so every authenticated browser has a durable user identity.
    if (!payload.uid || !payload.sid) return null;
    try {
      const row = await db.prepare(`
        SELECT
          s.user_id, s.provider, s.subject, s.created_at, s.expires_at,
          s.session_ref, s.client, s.last_seen_at,
          u.email AS user_email, u.display_name AS user_name, u.avatar_url AS user_avatar,
          i.login AS identity_login, i.display_name AS identity_name, i.avatar_url AS identity_avatar,
          i.email AS identity_email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN identities i
          ON i.user_id = s.user_id
         AND i.provider = s.provider
         AND i.subject = s.subject
        WHERE s.id_hash = ?
          AND s.user_id = ?
          AND s.expires_at > ?
          AND s.revoked_at IS NULL
        LIMIT 1
      `).bind(
        await sha256B64url(payload.sid),
        String(payload.uid),
        Math.floor(Date.now() / 1000),
      ).first();
      if (!row) return null;
      return {
        uid: row.user_id,
        user_id: row.user_id,
        sid: payload.sid,
        sessionRef: row.session_ref || await sha256B64url(payload.sid),
        provider: row.provider,
        client: row.client || 'web',
        sub: row.subject,
        login: row.identity_login || '',
        name: row.user_name || row.identity_name || row.identity_login || '',
        avatar: row.user_avatar || row.identity_avatar || '',
        email: row.user_email || row.identity_email || null,
        iat: row.created_at,
        exp: row.expires_at,
        lastSeenAt: row.last_seen_at || row.created_at,
        persistent: true,
      };
    } catch {
      // Fail closed if the account store is unavailable; do not turn a stale
      // signed cookie into an authenticated account during a database outage.
      return null;
    }
  }
  return payload;
}

// The browser only needs display data and expiry information. Keep bearer and
// cookie material inside the worker even when the session endpoint is polled.
function sessionView(session) {
  if (!session) return null;
  return {
    id: session.uid || session.user_id || null,
    provider: session.provider || '',
    login: session.login || '',
    name: session.name || '',
    avatar: session.avatar || '',
    email: session.email || null,
    iat: session.iat || null,
    exp: session.exp || null,
    persistent: Boolean(session.persistent),
  };
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...BASE_HEADERS,
    },
  });
}

// The public Byte endpoint is intentionally small and stateless. These limits
// protect the upstream provider from accidental loops and oversized browser
// requests; Cloudflare's production rate-limiting rules should remain the
// stronger outer control when traffic grows.
const BYTE_RATE_WINDOW_MS = 60 * 1000;
const BYTE_RATE_LIMIT = 20;
const BYTE_MAX_BODY_BYTES = 32 * 1024;
const BYTE_MAX_MESSAGES = 24;
const BYTE_MAX_MESSAGE_CHARS = 4000;
const BYTE_MAX_TOTAL_CHARS = 24000;
const BYTE_RATE_BUCKETS = new Map();

function byteClientKey(request) {
  return request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'anonymous';
}

function byteRateCheck(request) {
  const now = Date.now();
  const key = byteClientKey(request);
  const recent = (BYTE_RATE_BUCKETS.get(key) || []).filter((time) => now - time < BYTE_RATE_WINDOW_MS);
  if (recent.length >= BYTE_RATE_LIMIT) {
    BYTE_RATE_BUCKETS.set(key, recent);
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((recent[0] + BYTE_RATE_WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  BYTE_RATE_BUCKETS.set(key, recent);
  // Keep a restarted/long-lived isolate from retaining inactive client keys.
  if (BYTE_RATE_BUCKETS.size > 2048) {
    for (const [bucketKey, times] of BYTE_RATE_BUCKETS) {
      if (!times.length || now - times[times.length - 1] >= BYTE_RATE_WINDOW_MS) BYTE_RATE_BUCKETS.delete(bucketKey);
    }
  }
  return { allowed: true, retryAfter: 0 };
}

function validateByteMessages(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > BYTE_MAX_MESSAGES) return null;
  let totalChars = 0;
  const messages = [];
  for (const message of value) {
    if (!message || typeof message !== 'object') return null;
    if (!['system', 'user', 'assistant'].includes(message.role)) return null;
    if (typeof message.content !== 'string') return null;
    const content = message.content.trim();
    if (!content || content.length > BYTE_MAX_MESSAGE_CHARS) return null;
    totalChars += content.length;
    if (totalChars > BYTE_MAX_TOTAL_CHARS) return null;
    messages.push({ role: message.role, content });
  }
  return messages;
}

// OpenAI-compatible server-side adapter. Production can use this route by
// supplying BYTE_API_BASE_URL, BYTE_API_KEY, and optionally BYTE_MODEL as
// Worker secrets/vars. The browser never receives the upstream key.
async function handleByte(request, env) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  const base = String(env.BYTE_API_BASE_URL || '').replace(/\/+$/, '');
  const key = env.BYTE_API_KEY;
  if (!base || !key) {
    return json(503, { ok: false, error: 'byte_provider_not_configured' });
  }
  const rate = byteRateCheck(request);
  if (!rate.allowed) {
    const response = json(429, { ok: false, error: 'byte_rate_limited', retry_after_seconds: rate.retryAfter });
    response.headers.set('retry-after', String(rate.retryAfter));
    return response;
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > BYTE_MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'request_too_large' });
  }
  let payload;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > BYTE_MAX_BODY_BYTES) {
      return json(413, { ok: false, error: 'request_too_large' });
    }
    payload = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const messages = validateByteMessages(payload && payload.messages);
  if (!messages) {
    return json(400, { ok: false, error: 'messages_required' });
  }
  const body = {
    // The browser never selects the provider model. This keeps the hidden
    // implementation detail hidden and prevents arbitrary model requests.
    model: String(env.BYTE_MODEL || 'free'),
    messages,
    temperature: Number.isFinite(payload.temperature) ? Math.min(2, Math.max(0, payload.temperature)) : 0.7,
    max_tokens: Math.min(1000, Math.max(32, Number(payload.max_tokens) || 400)),
  };
  let upstream;
  try {
    upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return json(502, { ok: false, error: 'byte_provider_unreachable' });
  }
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// `set-cookie` is the one header that must never be comma-joined. A browser
// treats a joined value as a SINGLE cookie and applies its duplicate attributes
// in order, so pairing the session cookie with the state-clearing cookie in one
// array produced one header ending in `Max-Age=0` -- which deleted the session
// the instant it was created. Sign-in then looked like it did nothing. workerd
// joins an array into a single header here, so append each value separately.
function redirect(location, extraHeaders = {}, status = 302) {
  const headers = new Headers({ location, ...BASE_HEADERS });
  for (const [name, value] of Object.entries(extraHeaders)) {
    if (name.toLowerCase() === 'set-cookie') {
      for (const v of Array.isArray(value) ? value : [value]) headers.append('set-cookie', v);
    } else {
      headers.set(name, value);
    }
  }
  return new Response(null, { status, headers });
}

function authConfigured(env) {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.SESSION_SECRET);
}

function googleConfigured(env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);
}

// Derived from the request origin, so moving to a custom domain needs only the
// new URL added to each provider's console — no code change.
function callbackUrl(url, provider = 'github') {
  return `${url.origin}/api/auth/${provider}/callback`;
}

// One session shape for every provider. `provider` and `sub` together are the
// account key; `email` is the cross-provider identity, so signing in with
// GitHub and Google on the same address lands on the same account.
async function finishSignIn(
  env,
  url,
  { sub, login, name, avatar, email, emailVerified = false, provider },
  nativeFlow = null,
) {
  const now = Math.floor(Date.now() / 1000);
  let userId = null;

  if (env.ACCOUNTS_DB) {
    try {
      const account = await ensureAccount(env.ACCOUNTS_DB, {
        sub,
        provider,
        login,
        name,
        avatar,
        email,
        emailVerified,
      });
      userId = account.userId;
      if (nativeFlow) {
        const code = await createNativeAuthorizationCode(env.ACCOUNTS_DB, nativeFlow, {
          userId,
          provider,
          subject: account.subject,
          now,
        });
        return redirect(
          nativeCallbackUrl(nativeFlow, { code }),
          { 'set-cookie': clearOAuthCookies() },
        );
      }
      const exp = now + SESSION_TTL;
      const sid = await createPersistentSession(env.ACCOUNTS_DB, {
        userId,
        provider,
        subject: account.subject,
        now,
        exp,
        client: 'web',
      });
      const payload = {
        sub: String(sub),
        provider,
        login: login || '',
        name: name || login || '',
        avatar: avatar || '',
        email: email || null,
        iat: now,
        exp,
        uid: userId,
        sid,
      };
      const session = await signSession(payload, env.SESSION_SECRET);
      return redirect('/?auth=ok', {
        'set-cookie': [
          cookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL }),
          ...clearOAuthCookies(),
        ],
      });
    } catch (error) {
      console.error('account persistence failed', error);
      if (nativeFlow) {
        return redirect(
          nativeCallbackUrl(nativeFlow, {
            error: 'server_error',
            error_description: 'account_storage',
          }),
          { 'set-cookie': clearOAuthCookies() },
        );
      }
      return redirect('/?auth=failed&reason=account_storage', {
        'set-cookie': clearOAuthCookies(),
      });
    }
  }

  if (nativeFlow) {
    return redirect(
      nativeCallbackUrl(nativeFlow, {
        error: 'server_error',
        error_description: 'accounts_not_configured',
      }),
      { 'set-cookie': clearOAuthCookies() },
    );
  }

  const exp = now + SESSION_TTL;
  const payload = {
    sub: String(sub),
    provider,
    login: login || '',
    name: name || login || '',
    avatar: avatar || '',
    email: email || null,
    iat: now,
    exp,
  };
  if (userId && sid) {
    payload.uid = userId;
    payload.sid = sid;
  }
  const session = await signSession(
    payload,
    env.SESSION_SECRET,
  );
  return redirect('/?auth=ok', {
    'set-cookie': [
      cookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL }),
      ...clearOAuthCookies(),
    ],
  });
}

async function handleNativeExchange(request, env) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 4096) {
    return json(413, { ok: false, error: 'request_too_large' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const codeVerifier = typeof body?.code_verifier === 'string'
    ? body.code_verifier.trim()
    : '';
  const redirectUri = typeof body?.redirect_uri === 'string'
    ? body.redirect_uri.trim()
    : '';
  if (
    !code ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(code) ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier) ||
    redirectUri !== NATIVE_REDIRECT_URI
  ) {
    return json(400, { ok: false, error: 'invalid_request' });
  }

  const now = Math.floor(Date.now() / 1000);
  const codeHash = await sha256B64url(code);
  let row;
  try {
    row = await env.ACCOUNTS_DB.prepare(`
      SELECT
        c.user_id, c.provider, c.subject, c.redirect_uri,
        c.code_challenge, c.code_challenge_method,
        c.expires_at, c.used_at,
        u.email AS user_email, u.display_name AS user_name, u.avatar_url AS user_avatar,
        i.login AS identity_login, i.display_name AS identity_name, i.avatar_url AS identity_avatar,
        i.email AS identity_email
      FROM oauth_codes c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN identities i
        ON i.user_id = c.user_id
       AND i.provider = c.provider
       AND i.subject = c.subject
      WHERE c.code_hash = ?
      LIMIT 1
    `).bind(codeHash).first();
  } catch (error) {
    console.error('native auth exchange lookup failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }

  // Keep all grant failures deliberately indistinguishable. A native client
  // must never learn whether a code existed, expired, was already used, or
  // failed its redirect/PKCE binding.
  const invalidGrant = () => json(400, { ok: false, error: 'invalid_grant' });
  if (!row || row.redirect_uri !== redirectUri || row.used_at !== null || row.expires_at <= now) {
    return invalidGrant();
  }
  if (
    row.code_challenge_method !== 'S256' ||
    !timingSafeEqual(row.code_challenge, await sha256B64url(codeVerifier))
  ) {
    return invalidGrant();
  }

  let consumed;
  try {
    consumed = await env.ACCOUNTS_DB.prepare(`
      UPDATE oauth_codes
      SET used_at = ?
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
    `).bind(now, codeHash, now).run();
  } catch (error) {
    console.error('native auth exchange consume failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
  if (!consumed?.meta || Number(consumed.meta.changes) !== 1) return invalidGrant();

  try {
    const exp = now + SESSION_TTL;
    const sid = await createPersistentSession(env.ACCOUNTS_DB, {
      userId: row.user_id,
      provider: row.provider,
      subject: row.subject,
      now,
      exp,
      client: 'desktop',
    });
    const session = await signSession({
      uid: row.user_id,
      sid,
      sub: row.subject,
      provider: row.provider,
      login: row.identity_login || '',
      name: row.user_name || row.identity_name || row.identity_login || '',
      avatar: row.user_avatar || row.identity_avatar || '',
      email: row.user_email || row.identity_email || null,
      iat: now,
      exp,
    }, env.SESSION_SECRET);
    return json(200, {
      ok: true,
      token_type: 'Bearer',
      session_token: session,
      expires_at: exp,
      user: {
        id: row.user_id,
        provider: row.provider,
        login: row.identity_login || '',
        name: row.user_name || row.identity_name || row.identity_login || '',
        avatar: row.user_avatar || row.identity_avatar || '',
        email: row.user_email || row.identity_email || null,
      },
    });
  } catch (error) {
    console.error('native auth session creation failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
}

// ---------------------------------------------------------------------------
// Account profile
//
// Provider identities remain read-only. The profile below is the user's own
// presentation layer and is deliberately separate so changing a display name
// or QOWNER pseudonym cannot change the Google/GitHub account key.
// ---------------------------------------------------------------------------

const PROFILE_MAX_BODY_BYTES = 12 * 1024;
const PROFILE_HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{1,22}[a-z0-9])?$/;

function profileText(value, max, collapseWhitespace = false) {
  let text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (collapseWhitespace) text = text.replace(/\s+/g, ' ');
  return text.slice(0, max);
}

function profileTimezone(value) {
  const timezone = String(value ?? '').trim();
  if (timezone === 'UTC') return timezone;
  if (
    timezone.length > 64 ||
    !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(timezone)
  ) return null;
  try {
    // The runtime's timezone database is the source of truth; accepting only
    // zones the runtime can format prevents a profile that cannot be rendered.
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return timezone;
  } catch {
    return null;
  }
}

function profileView(row) {
  return {
    display_name: row?.display_name || '',
    public_handle: row?.public_handle || '',
    bio: row?.bio || '',
    locale: row?.locale === 'en' ? 'en' : 'id',
    timezone: row?.timezone || 'Asia/Jakarta',
    visibility: row?.profile_visibility === 'public' ? 'public' : 'private',
    qowner_alias: row?.qowner_alias || '',
    qowner_leaderboard_opt_in: Number(row?.qowner_leaderboard_opt_in) === 1,
  };
}

async function readProfile(db, userId) {
  const row = await db.prepare(`
    SELECT display_name, public_handle, bio, locale, timezone,
           profile_visibility, qowner_alias, qowner_leaderboard_opt_in
      FROM profiles
     WHERE user_id = ?
     LIMIT 1
  `).bind(userId).first();
  return profileView(row);
}

async function handlePublicProfile(request, url, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB) return json(503, { ok: false, error: 'accounts_not_configured' });
  const handle = (url.searchParams.get('handle') || '').trim().toLowerCase();
  if (!PROFILE_HANDLE_RE.test(handle)) return json(404, { ok: false, error: 'profile_not_found' });
  let row;
  try {
    row = await env.ACCOUNTS_DB.prepare(`
      SELECT p.display_name, p.public_handle, p.bio, p.locale, p.timezone,
             p.qowner_alias, p.qowner_leaderboard_opt_in,
             u.display_name AS provider_name, u.avatar_url
        FROM profiles p
        JOIN users u ON u.id = p.user_id
       WHERE p.public_handle = ? COLLATE NOCASE
         AND p.profile_visibility = 'public'
       LIMIT 1
    `).bind(handle).first();
  } catch (error) {
    console.error('public profile lookup failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
  if (!row) return json(404, { ok: false, error: 'profile_not_found' });
  return json(200, {
    ok: true,
    profile: {
      display_name: row.display_name || row.provider_name || row.public_handle,
      public_handle: row.public_handle,
      bio: row.bio || '',
      locale: row.locale === 'en' ? 'en' : 'id',
      timezone: row.timezone || 'Asia/Jakarta',
      avatar: row.avatar_url || '',
      qowner_alias: Number(row.qowner_leaderboard_opt_in) === 1 ? (row.qowner_alias || '') : '',
    },
  });
}

async function writeProfile(db, userId, profile) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`
    INSERT INTO profiles (
      user_id, display_name, public_handle, bio, locale, timezone,
      profile_visibility, qowner_alias, qowner_leaderboard_opt_in,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      display_name = excluded.display_name,
      public_handle = excluded.public_handle,
      bio = excluded.bio,
      locale = excluded.locale,
      timezone = excluded.timezone,
      profile_visibility = excluded.profile_visibility,
      qowner_alias = excluded.qowner_alias,
      qowner_leaderboard_opt_in = excluded.qowner_leaderboard_opt_in,
      updated_at = excluded.updated_at
  `).bind(
    userId,
    profile.display_name,
    profile.public_handle,
    profile.bio,
    profile.locale,
    profile.timezone,
    profile.visibility,
    profile.qowner_alias,
    profile.qowner_leaderboard_opt_in ? 1 : 0,
    now,
    now,
  ).run();
  return profile;
}

async function handleProfile(request, env) {
  if (!['GET', 'HEAD', 'PATCH'].includes(request.method)) {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) return json(401, { ok: false, error: 'unauthenticated' });

  let current;
  try {
    current = await readProfile(env.ACCOUNTS_DB, session.uid);
  } catch (error) {
    console.error('account profile lookup failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    return json(200, {
      ok: true,
      profile: current,
      account: {
        id: session.uid,
        provider: session.provider,
        login: session.login,
        name: session.name,
        avatar: session.avatar,
        email: session.email,
      },
    });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > PROFILE_MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'request_too_large' });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { ok: false, error: 'invalid_profile' });
  }

  const next = { ...current };
  const errors = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (has('display_name')) {
    if (typeof body.display_name !== 'string' || body.display_name.length > 80) {
      errors.display_name = 'max_80_characters';
    } else {
      next.display_name = profileText(body.display_name, 80, true);
    }
  }
  const handleKey = has('public_handle') ? 'public_handle' : (has('handle') ? 'handle' : null);
  if (handleKey) {
    if (typeof body[handleKey] !== 'string') {
      errors.public_handle = 'invalid_handle';
    } else {
      const handle = body[handleKey].trim().toLowerCase();
      if (handle && !PROFILE_HANDLE_RE.test(handle)) {
        errors.public_handle = 'use_3_to_24_lowercase_characters';
      } else {
        next.public_handle = handle;
      }
    }
  }
  if (has('bio')) {
    if (typeof body.bio !== 'string' || body.bio.length > 160) {
      errors.bio = 'max_160_characters';
    } else {
      next.bio = profileText(body.bio, 160);
    }
  }
  if (has('locale')) {
    if (!['id', 'en'].includes(body.locale)) errors.locale = 'unsupported_locale';
    else next.locale = body.locale;
  }
  if (has('timezone')) {
    const timezone = profileTimezone(body.timezone);
    if (!timezone) errors.timezone = 'invalid_timezone';
    else next.timezone = timezone;
  }
  if (has('visibility')) {
    if (!['private', 'public'].includes(body.visibility)) errors.visibility = 'invalid_visibility';
    else next.visibility = body.visibility;
  }
  if (has('qowner_alias')) {
    if (typeof body.qowner_alias !== 'string' || body.qowner_alias.length > 40) {
      errors.qowner_alias = 'max_40_characters';
    } else {
      next.qowner_alias = profileText(body.qowner_alias, 40, true);
    }
  }
  if (has('qowner_leaderboard_opt_in')) {
    if (typeof body.qowner_leaderboard_opt_in !== 'boolean') {
      errors.qowner_leaderboard_opt_in = 'boolean_required';
    } else {
      next.qowner_leaderboard_opt_in = body.qowner_leaderboard_opt_in;
    }
  }
  if (Object.keys(errors).length) {
    return json(400, { ok: false, error: 'invalid_profile', fields: errors });
  }

  if (next.public_handle) {
    const taken = await env.ACCOUNTS_DB.prepare(`
      SELECT user_id FROM profiles
       WHERE public_handle = ? COLLATE NOCASE
         AND user_id <> ?
       LIMIT 1
    `).bind(next.public_handle, session.uid).first();
    if (taken) return json(409, { ok: false, error: 'handle_taken', field: 'public_handle' });
  }

  try {
    const profile = await writeProfile(env.ACCOUNTS_DB, session.uid, next);
    return json(200, { ok: true, profile });
  } catch (error) {
    console.error('account profile update failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
}

async function handleConnections(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) return json(401, { ok: false, error: 'unauthenticated' });

  try {
    const result = await env.ACCOUNTS_DB.prepare(`
      SELECT provider, subject, login, display_name, email_verified, created_at
        FROM identities
       WHERE user_id = ?
       ORDER BY provider ASC, created_at ASC
    `).bind(session.uid).all();
    const connections = (result.results || []).map((row) => ({
      provider: row.provider,
      login: row.login || '',
      display_name: row.display_name || '',
      email_verified: Number(row.email_verified) === 1,
      linked_at: row.created_at,
      current: row.provider === session.provider && row.subject === session.sub,
    }));
    return json(200, { ok: true, connections });
  } catch (error) {
    console.error('account connections lookup failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
}

const SESSION_REF_RE = /^[A-Za-z0-9_-]{20,128}$/;

async function handleSessions(request, env, action = 'list') {
  const allowed = action === 'list' ? request.method === 'GET' : request.method === 'POST';
  if (!allowed) return json(405, { ok: false, error: 'method_not_allowed' });
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) return json(401, { ok: false, error: 'unauthenticated' });
  const now = Math.floor(Date.now() / 1000);
  const currentHash = await sha256B64url(session.sid);

  try {
    if (action === 'list') {
      // A coarse last-seen update gives the user a useful signal without
      // writing on every request made by the dashboard.
      await env.ACCOUNTS_DB.prepare(`
        UPDATE sessions
           SET last_seen_at = ?
         WHERE id_hash = ?
           AND (last_seen_at IS NULL OR last_seen_at < ?)
      `).bind(now, currentHash, now - 300).run();
      const result = await env.ACCOUNTS_DB.prepare(`
        SELECT session_ref, client, provider, created_at, expires_at, last_seen_at
          FROM sessions
         WHERE user_id = ?
           AND revoked_at IS NULL
           AND expires_at > ?
         ORDER BY created_at DESC
      `).bind(session.uid, now).all();
      const sessions = (result.results || []).map((row) => ({
        session_ref: row.session_ref,
        client: row.client === 'desktop' ? 'desktop' : 'web',
        provider: row.provider,
        created_at: row.created_at,
        expires_at: row.expires_at,
        last_seen_at: row.last_seen_at || row.created_at,
        current: row.session_ref === session.sessionRef,
      }));
      return json(200, { ok: true, sessions });
    }

    if (action === 'revoke-all') {
      const result = await env.ACCOUNTS_DB.prepare(`
        UPDATE sessions
           SET revoked_at = ?
         WHERE user_id = ?
           AND id_hash <> ?
           AND revoked_at IS NULL
           AND expires_at > ?
      `).bind(now, session.uid, currentHash, now).run();
      return json(200, {
        ok: true,
        revoked: Number(result?.meta?.changes || 0),
      });
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 4096) return json(413, { ok: false, error: 'request_too_large' });
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { ok: false, error: 'invalid_json' });
    }
    const sessionRef = typeof body?.session_ref === 'string' ? body.session_ref.trim() : '';
    if (!SESSION_REF_RE.test(sessionRef)) return json(400, { ok: false, error: 'invalid_session_ref' });
    if (sessionRef === session.sessionRef) {
      return json(400, { ok: false, error: 'use_logout_for_current_session' });
    }
    const result = await env.ACCOUNTS_DB.prepare(`
      UPDATE sessions
         SET revoked_at = ?
       WHERE user_id = ?
         AND session_ref = ?
         AND revoked_at IS NULL
         AND expires_at > ?
    `).bind(now, session.uid, sessionRef, now).run();
    const revoked = Number(result?.meta?.changes || 0);
    if (revoked !== 1) return json(404, { ok: false, error: 'session_not_found' });
    return json(200, { ok: true, revoked: 1 });
  } catch (error) {
    console.error('account session management failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
}

async function handleAuth(request, url, env) {
  const path = url.pathname;
  const ghOn = authConfigured(env);
  const ggOn = googleConfigured(env);
  const configured = ghOn || ggOn;

  if (path === '/api/auth/exchange') {
    return handleNativeExchange(request, env);
  }

  // The header badge polls this on every page load, so an unconfigured
  // deployment must answer cleanly ("nobody is signed in, sign-in is off")
  // rather than 500. The sign-in endpoints themselves fail loudly.
  if (path === '/api/auth/session') {
    const session = configured ? await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB) : null;
    return json(200, {
      ok: true,
      configured,
      persistent_accounts: Boolean(env.ACCOUNTS_DB),
      // Which buttons the UI may show. Reported per provider so enabling only
      // one does not advertise a button that would 500 on click.
      providers: { github: ghOn, google: ggOn },
      authenticated: Boolean(session),
      user: sessionView(session),
    });
  }

  // Sign-out needs no GitHub credentials — it only clears a cookie — so it must
  // not sit behind the configured check, or a visitor cannot sign out of a
  // session that predates a secret being removed.
  //
  // POST only: a GET would let any third-party page log the user out with a
  // plain <img src>, so the verb is enforced rather than merely documented.
  if (path === '/api/auth/logout') {
    if (request.method !== 'POST') {
      return json(405, { ok: false, error: 'method_not_allowed' });
    }
    const usesBearer = Boolean(bearerToken(request));
    if (env.ACCOUNTS_DB && env.SESSION_SECRET) {
      const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
      if (session && session.sid) {
        try {
          await env.ACCOUNTS_DB.prepare(
            'UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL',
          ).bind(Math.floor(Date.now() / 1000), await sha256B64url(session.sid)).run();
        } catch {
          // Clearing the browser cookie still succeeds; the server will reject
          // the copied session once it expires if revocation storage is down.
        }
      }
    }
    if (usesBearer) return json(200, { ok: true });
    return redirect('/', {
      'set-cookie': [
        cookie(SESSION_COOKIE, '', { clear: true }),
        ...clearOAuthCookies(),
      ],
    });
  }

  if (!configured) {
    return json(500, {
      ok: false,
      error: 'auth_not_configured',
      message:
        'Sign-in is not configured yet. Set GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET ' +
        'and/or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, plus SESSION_SECRET, ' +
        'as Worker secrets.',
    });
  }

  // --- start the round trip -------------------------------------------------
  if (path === '/api/auth/github') {
    if (!ghOn) {
      return json(500, { ok: false, error: 'provider_not_configured', provider: 'github' });
    }
    const nativeRequest = nativeFlowRequest(url, 'github');
    if (nativeRequest.requested && !nativeRequest.flow) {
      return json(400, { ok: false, error: 'invalid_native_oauth_request' });
    }
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const q = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: callbackUrl(url, 'github'),
      scope: GITHUB_SCOPE,
      state,
      allow_signup: 'true',
    });
    const flowCookie = nativeRequest.flow
      ? await signSession({
        ...nativeRequest.flow,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + STATE_TTL,
      }, env.SESSION_SECRET)
      : null;
    return redirect(`${GITHUB_AUTHORIZE}?${q}`, {
      'set-cookie': [
        cookie(OAUTH_STATE_COOKIE, state, { maxAge: STATE_TTL }),
        ...(flowCookie ? [cookie(OAUTH_FLOW_COOKIE, flowCookie, { maxAge: STATE_TTL })] : []),
      ],
    });
  }

  if (path === '/api/auth/google') {
    if (!ggOn) {
      return json(500, { ok: false, error: 'provider_not_configured', provider: 'google' });
    }
    const nativeRequest = nativeFlowRequest(url, 'google');
    if (nativeRequest.requested && !nativeRequest.flow) {
      return json(400, { ok: false, error: 'invalid_native_oauth_request' });
    }
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const q = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl(url, 'google'),
      response_type: 'code',
      scope: GOOGLE_SCOPE,
      state,
      // Show the account chooser instead of silently reusing the last session,
      // so someone with several Google accounts can pick the right one.
      prompt: 'select_account',
    });
    const flowCookie = nativeRequest.flow
      ? await signSession({
        ...nativeRequest.flow,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + STATE_TTL,
      }, env.SESSION_SECRET)
      : null;
    return redirect(`${GOOGLE_AUTHORIZE}?${q}`, {
      'set-cookie': [
        cookie(OAUTH_STATE_COOKIE, state, { maxAge: STATE_TTL }),
        ...(flowCookie ? [cookie(OAUTH_FLOW_COOKIE, flowCookie, { maxAge: STATE_TTL })] : []),
      ],
    });
  }

  // --- finish the round trip ------------------------------------------------
  if (path === '/api/auth/github/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    const expected = parseCookies(request)[OAUTH_STATE_COOKIE] || '';
    const nativeFlow = await readNativeFlow(request, env.SESSION_SECRET, 'github');
    // Always drop both flow cookies, either way, so they cannot be replayed.
    const clearCookies = clearOAuthCookies();

    if (url.searchParams.get('error')) {
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'access_denied' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=cancelled', { 'set-cookie': clearCookies });
    }
    if (!code || !expected || !timingSafeEqual(state, expected)) {
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'invalid_request' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=failed', { 'set-cookie': clearCookies });
    }

    // Exchange the code server-side. The token stays on this side.
    const tokenRes = await fetch(GITHUB_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl(url),
      }),
    });
    const tokenJson = await tokenRes.json().catch(() => null);
    const token = tokenJson && tokenJson.access_token;
    if (!token) {
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'provider_error' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=failed', { 'set-cookie': clearCookies });
    }

    const ghHeaders = {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'voidscriptor-site',
    };

    const profile = await (
      await fetch(`${GITHUB_API}/user`, { headers: ghHeaders })
    ).json().catch(() => null);

    if (!profile || !profile.id) {
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'provider_error' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=failed', { 'set-cookie': clearCookies });
    }

    // GitHub keeps the address private unless the person made it public, so
    // fall back to the emails endpoint and take the primary verified one.
    let email = profile.email || null;
    let emailVerified = false;
    const emails = await (
      await fetch(`${GITHUB_API}/user/emails`, { headers: ghHeaders })
    ).json().catch(() => []);
    if (Array.isArray(emails)) {
      const hit =
        emails.find((e) => e.primary && e.verified) ||
        emails.find((e) => e.verified) ||
        emails.find((e) => e.primary);
      if (hit && hit.email) {
        email = hit.email;
        emailVerified = hit.verified === true;
      }
    }

    return finishSignIn(env, url, {
      sub: profile.id,
      provider: 'github',
      login: profile.login || '',
      name: profile.name || profile.login || '',
      avatar: profile.avatar_url || '',
      email,
      emailVerified,
    }, nativeFlow);
  }

  // --- finish the round trip (Google) ---------------------------------------
  if (path === '/api/auth/google/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    const expected = parseCookies(request)[OAUTH_STATE_COOKIE] || '';
    const nativeFlow = await readNativeFlow(request, env.SESSION_SECRET, 'google');
    // Always drop both flow cookies, either way, so they cannot be replayed.
    const clearCookies = clearOAuthCookies();

    if (url.searchParams.get('error')) {
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'access_denied' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=cancelled', { 'set-cookie': clearCookies });
    }
    if (!code || !expected || !timingSafeEqual(state, expected)) {
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'invalid_request' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=failed', { 'set-cookie': clearCookies });
    }

    // Exchange the code server-side, as a form post (Google's documented
    // shape for the token endpoint). The token stays on this side.
    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl(url, 'google'),
      }).toString(),
    });
    const tokenJson = await tokenRes.json().catch(() => null);
    const token = tokenJson && tokenJson.access_token;
    if (!token) {
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'provider_error' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=failed', { 'set-cookie': clearCookies });
    }

    const info = await (
      await fetch(GOOGLE_USERINFO, { headers: { authorization: 'Bearer ' + token } })
    ).json().catch(() => null);

    // Google returns `sub` (stable numeric id) plus email_verified. Refuse an
    // unverified address: it is the identity key we merge accounts on, so an
    // unverified one could let someone claim another person's account.
    if (!info || !info.sub || !info.email || info.email_verified === false) {
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'provider_error' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=failed', { 'set-cookie': clearCookies });
    }

    return finishSignIn(env, url, {
      sub: info.sub,
      provider: 'google',
      login: (info.email || '').split('@')[0],
      name: info.name || info.email || '',
      avatar: info.picture || '',
      email: info.email,
      emailVerified: info.email_verified === true,
    }, nativeFlow);
  }

  // --- sign out -------------------------------------------------------------
    // POST only: a GET would let any third-party page log the user out with a
    // plain <img src>, so the verb is enforced rather than merely documented.
    // (Handled above, ahead of the configured check.)

  return json(404, { ok: false, error: 'not_found' });
}

async function handleAccount(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    const response = json(503, {
      ok: false,
      error: 'accounts_not_configured',
      persistent_accounts: false,
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) {
    const response = json(401, { ok: false, error: 'unauthenticated' });
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  let profile;
  try {
    profile = await readProfile(env.ACCOUNTS_DB, session.uid);
  } catch (error) {
    console.error('account profile read failed', error);
    const response = json(503, { ok: false, error: 'account_storage' });
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  const response = json(200, {
    ok: true,
    persistent_accounts: true,
    user: {
      id: session.uid,
      provider: session.provider,
      login: session.login,
      name: session.name,
      avatar: session.avatar,
      email: session.email,
      profile,
    },
  });
  response.headers.set('cache-control', 'no-store');
  return response;
}

async function handleAccountExport(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) return json(401, { ok: false, error: 'unauthenticated' });

  try {
    const [user, profile, identitiesResult, sessionsResult] = await Promise.all([
      env.ACCOUNTS_DB.prepare(`
        SELECT email, email_verified, created_at, updated_at, last_login_at
          FROM users
         WHERE id = ?
         LIMIT 1
      `).bind(session.uid).first(),
      readProfile(env.ACCOUNTS_DB, session.uid),
      env.ACCOUNTS_DB.prepare(`
        SELECT provider, login, display_name, email_verified, created_at, updated_at
          FROM identities
         WHERE user_id = ?
         ORDER BY provider ASC, created_at ASC
      `).bind(session.uid).all(),
      env.ACCOUNTS_DB.prepare(`
        SELECT id_hash, client, provider, created_at, expires_at, revoked_at, last_seen_at
          FROM sessions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 200
      `).bind(session.uid).all(),
    ]);
    const currentHash = await sha256B64url(session.sid);
    const identities = (identitiesResult.results || []).map((row) => ({
      provider: row.provider,
      login: row.login || '',
      display_name: row.display_name || '',
      email_verified: Number(row.email_verified) === 1,
      linked_at: row.created_at,
      updated_at: row.updated_at,
    }));
    const sessions = (sessionsResult.results || []).map((row) => ({
      client: row.client === 'desktop' ? 'desktop' : 'web',
      provider: row.provider,
      created_at: row.created_at,
      expires_at: row.expires_at,
      revoked_at: row.revoked_at || null,
      last_seen_at: row.last_seen_at || row.created_at,
      current: row.id_hash === currentHash,
    }));
    return json(200, {
      ok: true,
      format: 'voidscriptor-account-export',
      generated_at: Math.floor(Date.now() / 1000),
      account: {
        id: session.uid,
        email: user?.email || session.email || null,
        email_verified: Number(user?.email_verified) === 1,
        created_at: user?.created_at || null,
        updated_at: user?.updated_at || null,
        last_login_at: user?.last_login_at || null,
        profile,
      },
      identities,
      sessions,
    });
  } catch (error) {
    console.error('account export failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isLegacyHost = LEGACY_HOSTS.has(url.hostname)
      || url.hostname === WWW_HOST
      || url.hostname.endsWith('.voidscriptor.pages.dev');
    if (isLegacyHost && (request.method === 'GET' || request.method === 'HEAD')) {
      const target = `https://${CANONICAL_HOST}${url.pathname}${url.search}`;
      return redirect(target, { 'cache-control': 'public, max-age=86400' }, 301);
    }
    if (INTERNAL.some((rx) => rx.test(url.pathname))) {
      return new Response('Not found', { status: 404, headers: BASE_HEADERS });
    }
    if (url.pathname === APP_PREVIEW_PREFIX || url.pathname.startsWith(APP_PREVIEW_PREFIX + '/')) {
      return handleAppPreview(request, url, env);
    }
    if (url.pathname === '/api/byte') {
      return handleByte(request, env);
    }
    if (url.pathname === '/api/account/me') {
      return handleAccount(request, env);
    }
    if (url.pathname === '/api/account/export') {
      return handleAccountExport(request, env);
    }
    if (url.pathname === '/api/account/profile') {
      return handleProfile(request, env);
    }
    if (url.pathname === '/api/account/connections') {
      return handleConnections(request, env);
    }
    if (url.pathname === '/api/account/sessions') {
      return handleSessions(request, env, 'list');
    }
    if (url.pathname === '/api/account/sessions/revoke') {
      return handleSessions(request, env, 'revoke');
    }
    if (url.pathname === '/api/account/sessions/revoke-all') {
      return handleSessions(request, env, 'revoke-all');
    }
    if (url.pathname === '/api/public/profile') {
      return handlePublicProfile(request, url, env);
    }
    if (url.pathname.startsWith('/api/auth/')) {
      return handleAuth(request, url, env);
    }
    if (url.pathname.startsWith('/downloads/')) {
      const key = decodeURIComponent(url.pathname.slice('/downloads/'.length));
      // A 30 MB installer over a flaky connection must be resumable, so honour
      // `Range` and advertise it. Without this a dropped transfer restarts from
      // zero every time; browsers and download managers both rely on 206s.
      const rangeHeader = request.headers.get('range');
      let range = null;
      let wantRange = false;
      if (rangeHeader) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        if (m) {
          const hasStart = m[1] !== '', hasEnd = m[2] !== '';
          if (hasStart) {
            const start = Number(m[1]);
            const end = hasEnd ? Number(m[2]) : undefined;
            range = { offset: start, length: hasEnd ? end - start + 1 : undefined };
            wantRange = true;
          } else if (hasEnd) {
            // `bytes=-N` means the final N bytes; R2 needs an absolute offset,
            // which requires knowing the size, so resolve it with a HEAD first.
            const head = await env.DOWNLOADS.head(key);
            if (head) {
              range = { suffix: Number(m[2]), size: head.size };
              wantRange = true;
            }
          }
        }
      }

      let obj;
      if (range && range.suffix !== undefined) {
        const offset = Math.max(0, range.size - range.suffix);
        obj = await env.DOWNLOADS.get(key, { range: { offset, length: range.size - offset } });
      } else if (range) {
        obj = await env.DOWNLOADS.get(key, { range });
      } else {
        obj = await env.DOWNLOADS.get(key);
      }

      if (obj === null) {
        return new Response('Download not found: ' + key, {
          status: 404,
          headers: BASE_HEADERS,
        });
      }

      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      for (const [k, v] of Object.entries(BASE_HEADERS)) headers.set(k, v);
      // Always advertise range support so a resumable client will try it.
      headers.set('Accept-Ranges', 'bytes');
      // Any downloadable artifact is offered as an attachment, not just .zip:
      // the .exe installer must download rather than be treated as a page.
      if (/\.(?:zip|exe|msi|dmg|appimage|deb|rpm|pkg|tar\.gz|tgz)$/i.test(key)) {
        headers.set('Content-Disposition', 'attachment; filename="' + key + '"');
      }

      // Only answer 206 when the client actually asked for a range. R2 populates
      // `obj.range` even on a full read, so keying off it alone would turn every
      // plain GET into a 206 and break ordinary downloads.
      const served = obj.range;
      if (wantRange && served) {
        const total = obj.size;
        headers.set('Content-Range', `bytes ${served.offset}-${served.offset + served.length - 1}/${total}`);
        headers.set('Content-Length', String(served.length));
        if (request.method === 'HEAD') return new Response(null, { status: 206, headers });
        return new Response(obj.body, { status: 206, headers });
      }

      if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
      return new Response(obj.body, { headers });
    }

    // Private area: the dashboard is only ever handed to a visitor holding a
    // valid signed session cookie. The page re-checks the session before it
    // renders, but gating here as well means an anonymous request never
    // receives the markup at all -- and `.html` is gated too, otherwise
    // /dashboard.html would be served straight from ASSETS and slip past it.
    if (url.pathname === '/dashboard' || url.pathname === '/dashboard.html' || url.pathname === '/dashboard/') {
      const session = env.SESSION_SECRET
        ? await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB)
        : null;
      if (!session) {
        // no-store: a cached redirect must never bounce a signed-in visitor.
        return redirect('/?auth=required', { 'cache-control': 'no-store' });
      }
      const dash = await env.ASSETS.fetch(new URL('/dashboard.html', url).toString());
      if (!dash.ok) {
        return new Response('Not found', { status: 404, headers: BASE_HEADERS });
      }
      // no-store: the rendered identity is per-visitor and must not be cached
      // by a shared proxy or the browser's back/forward cache.
      const headers = new Headers(dash.headers);
      headers.set('cache-control', 'no-store');
      return harden(new Response(dash.body, { status: 200, headers }), '/dashboard', true);
    }

    // Public profile pages are rendered by one small static shell; the shell
    // fetches only the explicitly public profile fields from the API.
    if (url.pathname.startsWith('/u/')) {
      const handle = decodeURIComponent(url.pathname.slice(3));
      if (!PROFILE_HANDLE_RE.test(handle)) {
        return new Response('Not found', { status: 404, headers: BASE_HEADERS });
      }
      const profilePage = await env.ASSETS.fetch(new URL('/profile.html', url).toString());
      if (!profilePage.ok) return new Response('Not found', { status: 404, headers: BASE_HEADERS });
      const headers = new Headers(profilePage.headers);
      headers.set('cache-control', 'no-store');
      return harden(new Response(profilePage.body, { status: 200, headers }), url.pathname, true);
    }

    // Pages can retain a stale response for `/` while `/index.html` is fresh.
    // Resolve the root explicitly so the public homepage always follows the
    // same asset as direct index requests after a deployment.
    const assetRequest = url.pathname === '/'
      ? new URL('/index.html', url).toString()
      : request;
    const res = await env.ASSETS.fetch(assetRequest);
    const contentType = res.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html');

    // Serve the branded 404 page (with a real 404 status) for unknown routes.
    if (res.status === 404 && isHtml) {
      const custom = await env.ASSETS.fetch(new URL('/404.html', url).toString());
      if (custom.ok) {
        return harden(
          new Response(custom.body, { status: 404, headers: custom.headers }),
          url.pathname,
          true,
        );
      }
    }

    return harden(res, url.pathname, isHtml);
  },
};
