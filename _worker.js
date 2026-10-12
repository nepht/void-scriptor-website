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
import { handleGitHubAppIntegration } from './github_app_connector.js';

const INTERNAL = [
  /^\/wrangler\.toml$/i,
  /^\/package\.json$/i,
  /^\/package-lock\.json$/i,
  /^\/\.assetsignore$/i,
  /^\/\.gitignore$/i,
  /^\/_worker\.js$/i,
  /^\/_prod_deployment_meta_.*\.json$/i,
  /^\/_prod_artifact_.*\.zip$/i,
  /^\/\.wrangler\//i,
  /^\/\.git\//i,
  // CI workflow files are repository tooling, not site content. `.assetsignore`
  // is not consulted by `wrangler pages deploy`, so the worker is the only
  // layer that can keep `/.github/workflows/*.yml` out of the served bundle.
  /^\/\.github(?:\/|$)/i,
  /^\/tools\//i,
  /^\/crawl\.pkl$/i,
  /^\/github_app_connector\.js$/i,
  /^\/preview-entry\.txt$/i,
  /^\/test(?:\/|$)/i,
  /^\/migrations(?:\/|$)/i,
  // Windows reserved device names (NUL/CON/PRN/AUX/COM1/LPT1...) can be created
  // in the publish root by shell redirection (`... > NUL`, `dir ... 2> NUL`).
  // Such a file is a stray tooling artifact, never site content, yet
  // `wrangler pages deploy` uploads it and `/.assetsignore` is not consulted on
  // the Pages path. Deny the family so a redirection slip cannot publish
  // 54 bytes of shell error text at `/NUL` (verified live before this fix).
  /^\/(?:NUL|CON|PRN|AUX|COM[0-9]|LPT[0-9])$/i,
];
const APP_PREVIEW_PREFIX = '/preview';

// Decode only for the internal-file guard. Pages may receive an encoded path
// and still resolve it to the same asset; checking the raw pathname alone
// would let `/%77rangler.toml` or `/%6digrations/...` bypass the denylist.
function canonicalInternalPath(pathname) {
  let candidate = pathname;
  for (let i = 0; i < 3; i += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      return null;
    }
    if (decoded === candidate) break;
    candidate = decoded;
  }
  const segments = candidate.replaceAll('\\', '/').split('/');
  const normalized = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      normalized.pop();
    } else {
      normalized.push(segment);
    }
  }
  return '/' + normalized.join('/');
}

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
// Public pages and static assets are safe to cache: visitor identity is fetched
// from no-store API endpoints, never rendered into the HTML response itself.
// Keep a short browser window, a longer edge window, and stale-while-revalidate
// so a deploy propagates without making every repeat visit wait for the origin.
// Private dashboard/profile responses and the gated Flutter bundle stay no-store.
const CACHE_ART = /\.(?:webp|png|jpe?g|svg|gif|ico|avif|woff2?|ttf|otf)$/i;
const CACHE_STATIC = /\.(?:css|js|json|txt|xml|webmanifest|sha256)$/i;
const RELEASE_MANIFEST = /^\/release-manifests\/.*\.sha256$/i;
const PRIVATE_HTML = /^\/(?:dashboard(?:\.html)?|profile(?:\.html)?)(?:\/)?$/;
function cachePolicy(pathname, isHtml, status) {
  // Never cache anything but a real success: a cached 404 would outlive the fix.
  if (status !== 200) return null;
  if (pathname.startsWith('/app/') || PRIVATE_HTML.test(pathname)) return null;
  if (RELEASE_MANIFEST.test(pathname)) return 'no-store';
  if (isHtml) return 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
  if (CACHE_ART.test(pathname)) return 'public, max-age=86400, stale-while-revalidate=604800';
  if (CACHE_STATIC.test(pathname)) return 'public, max-age=86400, stale-while-revalidate=604800';
  return null;
}

function harden(res, pathname, isHtml) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) headers.set(k, v);
  if (isHtml && !pathname.startsWith('/app/')) {
    headers.set('content-security-policy', CSP_SITE);
  }
  // Pages may classify extensionless checksum/text assets as
  // application/octet-stream. Normalize the public text contracts here so a
  // fresh deployment does not expose a binary content type for a human-readable
  // manifest or security disclosure file.
  if (res.status === 200 && (pathname.endsWith('.sha256') || pathname === '/.well-known/security.txt')) {
    headers.set('content-type', 'text/plain; charset=utf-8');
  }
  const existingCacheControl = headers.get('cache-control') || '';
  const preservesNoStore = /(?:^|,\s*)no-store(?:\s*,|$)/i.test(existingCacheControl);
  const cc = cachePolicy(pathname, isHtml, res.status);
  // A route that explicitly marked its response private must stay private. This
  // matters for the dashboard/profile branches, which pass through harden()
  // after setting no-store themselves.
  if (cc && !preservesNoStore) headers.set('cache-control', cc);
  // Keep unknown/error responses conservative. Successful public HTML and
  // versioned/static UI files keep the cache policy selected above.
  if (res.status === 200 && !cc && !preservesNoStore && (isHtml || /\.(?:css|js|json|txt|xml|webmanifest)$/i.test(pathname))) {
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
const OAUTH_LINK_COOKIE = 'vs_oauth_link';
const GOOGLE_DRIVE_STATE_COOKIE = 'vs_google_drive_state';
const SESSION_COOKIE = 'vs_session';
const SESSION_TTL = 24 * 60 * 60; // 24 hours, in seconds
const SESSION_RENEW_WINDOW = 2 * 60 * 60; // renew while two hours remain
const STATE_TTL = 600; // 10 minutes to finish the round trip

// Downloads are an explicit public surface, not an arbitrary proxy into R2.
// Keep this allowlist in lockstep with the release manifest and published links
// so an encoded path cannot select an unexpected object or filename.
const PUBLIC_DOWNLOAD_KEYS = new Set([
  'VoidScriptor-1.2.0-rc.2-windows-x64-setup.exe',
  'VoidScriptor-1.2.0-rc.1-windows-x64-setup.exe',
]);
// Signed Windows installers are published by the Void Scriptor Studio release
// train to the same R2 bucket. Keep the route constrained to release-candidate
// names and the exact installer shape; this is still an allowlist, not an
// arbitrary R2 proxy.
const SIGNED_WINDOWS_INSTALLER = /^releases\/windows\/v\d+\.\d+\.\d+-rc\.\d+\/VoidScriptor-v\d+\.\d+\.\d+-rc\.\d+-windows-x64-signed\.exe$/i;
function isPublicDownloadKey(key) {
  return PUBLIC_DOWNLOAD_KEYS.has(key) || SIGNED_WINDOWS_INSTALLER.test(key);
}
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
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const GOOGLE_DRIVE_BACKUP_NAME = 'voidscriptor-account-backup.json';
const GOOGLE_DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]{1,256}$/;

function parseCookies(req) {
  const out = {};
  const raw = req.headers.get('cookie');
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const value = part.slice(i + 1).trim();
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(value);
    } catch {
      // A malformed cookie is untrusted input. Ignore only that cookie and
      // continue parsing the rest so auth treats it as anonymous instead of
      // turning the request into a worker exception.
    }
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

async function readNativeLinkTicket(url, secret, provider) {
  const payload = await verifySignedPayload(
    url.searchParams.get('link_ticket'),
    secret,
  );
  const native = nativeFlowRequest(url, provider).flow;
  if (
    !payload ||
    payload.kind !== 'native_link_ticket' ||
    payload.provider !== provider ||
    typeof payload.uid !== 'string' ||
    typeof payload.session_hash !== 'string' ||
    typeof payload.exp !== 'number' ||
    payload.exp * 1000 < Date.now() ||
    !native ||
    payload.state !== native.state ||
    payload.redirect_uri !== native.redirect_uri ||
    payload.code_challenge !== native.code_challenge ||
    payload.code_challenge_method !== native.code_challenge_method
  ) return null;
  return payload;
}

async function readNativeLinkFlow(req, secret, provider) {
  const payload = await verifySignedPayload(
    parseCookies(req)[OAUTH_FLOW_COOKIE],
    secret,
  );
  if (
    !payload ||
    payload.kind !== 'native_link' ||
    payload.provider !== provider ||
    typeof payload.uid !== 'string' ||
    typeof payload.session_hash !== 'string' ||
    typeof payload.exp !== 'number' ||
    payload.exp * 1000 < Date.now() ||
    payload.redirect_uri !== NATIVE_REDIRECT_URI ||
    typeof payload.state !== 'string' ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(payload.state) ||
    typeof payload.code_challenge !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(payload.code_challenge) ||
    payload.code_challenge_method !== 'S256'
  ) return null;
  return payload;
}

// A provider-link flow is separate from sign-in. It is bound to the current
// persistent session by user id and a one-way hash of the session id, so a
// callback cannot silently attach an identity to whichever account happens to
// be selected at the provider.
async function readLinkFlow(req, secret, db, provider) {
  const raw = parseCookies(req)[OAUTH_LINK_COOKIE] || '';
  if (!raw) return { present: false, flow: null };
  const payload = await verifySignedPayload(raw, secret);
  if (
    !payload ||
    payload.kind !== 'link' ||
    payload.provider !== provider ||
    typeof payload.uid !== 'string' ||
    typeof payload.session_hash !== 'string' ||
    typeof payload.exp !== 'number' ||
    payload.exp * 1000 < Date.now()
  ) return { present: true, flow: null };

  const session = await readSession(req, secret, db);
  if (!session || session.uid !== payload.uid || !session.sid) {
    return { present: true, flow: null };
  }
  const currentHash = await sha256B64url(session.sid);
  if (!timingSafeEqual(payload.session_hash, currentHash)) {
    return { present: true, flow: null };
  }
  return { present: true, flow: payload };
}

async function readGoogleDriveFlow(req, secret, db) {
  const raw = parseCookies(req)[GOOGLE_DRIVE_STATE_COOKIE] || '';
  if (!raw) return { present: false, flow: null };
  if (!secret || !db) return { present: true, flow: null };
  const payload = await verifySignedPayload(raw, secret);
  if (
    !payload ||
    payload.kind !== 'google_drive' ||
    typeof payload.uid !== 'string' ||
    typeof payload.session_hash !== 'string' ||
    typeof payload.state !== 'string' ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(payload.state) ||
    typeof payload.exp !== 'number' ||
    payload.exp * 1000 < Date.now()
  ) return { present: true, flow: null };

  const session = await readSession(req, secret, db);
  if (!session || session.uid !== payload.uid || !session.sid) {
    return { present: true, flow: null };
  }
  const currentHash = await sha256B64url(session.sid);
  if (!timingSafeEqual(payload.session_hash, currentHash)) {
    return { present: true, flow: null };
  }
  return { present: true, flow: payload };
}

function clearOAuthCookies() {
  return [
    cookie(OAUTH_STATE_COOKIE, '', { clear: true }),
    cookie(OAUTH_FLOW_COOKIE, '', { clear: true }),
    cookie(OAUTH_LINK_COOKIE, '', { clear: true }),
    cookie(GOOGLE_DRIVE_STATE_COOKIE, '', { clear: true }),
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

// Google refresh tokens are long-lived credentials. Keep only an authenticated
// ciphertext in D1; short-lived access tokens are used in memory for one Drive
// request and are never written to storage or returned to the browser.
async function driveCryptoKey(secret) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`voidscriptor-google-drive-v1:${String(secret)}`),
  );
  return crypto.subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptDriveSecret(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await driveCryptoKey(secret),
    new TextEncoder().encode(String(value)),
  );
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(ciphertext))}`;
}

async function decryptDriveSecret(value, secret) {
  if (typeof value !== 'string' || !value.startsWith('v1.')) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64urlDecode(parts[1]) },
      await driveCryptoKey(secret),
      b64urlDecode(parts[2]),
    );
    const decoded = new TextDecoder().decode(plaintext);
    return decoded || null;
  } catch {
    return null;
  }
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

// Web sessions are sliding: an active browser receives a fresh 24-hour
// HttpOnly cookie when the current window is close to expiry. Native bearer
// sessions are deliberately left alone because a renewed bearer must be
// returned explicitly by a native refresh contract, not hidden in a cookie.
async function renewPersistentSession(request, env, session) {
  if (
    !session ||
    !session.persistent ||
    !session.sid ||
    bearerToken(request) ||
    !env.ACCOUNTS_DB ||
    !env.SESSION_SECRET
  ) {
    return { session, cookie: null, renewed: false };
  }
  const now = Math.floor(Date.now() / 1000);
  const remaining = Number(session.exp) - now;
  if (!Number.isFinite(remaining) || remaining > SESSION_RENEW_WINDOW) {
    return { session, cookie: null, renewed: false };
  }
  const nextExp = now + SESSION_TTL;
  try {
    const idHash = await sha256B64url(session.sid);
    const result = await env.ACCOUNTS_DB.prepare(
      'UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE id_hash = ? AND user_id = ? AND revoked_at IS NULL AND expires_at = ?',
    ).bind(nextExp, now, idHash, session.uid, session.exp).run();
    if (Number(result?.meta?.changes || 0) !== 1) {
      return { session, cookie: null, renewed: false };
    }
    const payload = {
      sub: session.sub || '',
      provider: session.provider || '',
      login: session.login || '',
      name: session.name || '',
      avatar: session.avatar || '',
      email: session.email || null,
      iat: session.iat || now,
      exp: nextExp,
      uid: session.uid,
      sid: session.sid,
    };
    const signed = await signSession(payload, env.SESSION_SECRET);
    return {
      session: { ...session, exp: nextExp, lastSeenAt: now },
      cookie: cookie(SESSION_COOKIE, signed, { maxAge: SESSION_TTL }),
      renewed: true,
    };
  } catch (error) {
    console.error('session renewal failed', error?.code || 'session_storage');
    return { session, cookie: null, renewed: false };
  }
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

// Request-level health probe. It verifies that this Worker is running and that
// the primary public asset can be read, but it intentionally makes no claim
// about historical uptime or third-party provider health.
async function handleHealth(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const response = json(405, { ok: false, error: 'method_not_allowed' });
    response.headers.set('allow', 'GET, HEAD');
    return response;
  }
  let assetCheck = 'ok';
  try {
    const asset = await env.ASSETS.fetch(new URL('/index.html', url).toString());
    if (!asset.ok) assetCheck = 'unavailable';
  } catch {
    assetCheck = 'unavailable';
  }
  const ok = assetCheck === 'ok';
  return json(ok ? 200 : 503, {
    ok,
    service: 'voidscriptor-website',
    checks: { worker: 'ok', assets: assetCheck },
    checkedAt: new Date().toISOString(),
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
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        origin: 'https://voidscriptor.com',
      },
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

function publicLeaderboardRows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      displayName: typeof row.displayName === 'string' ? row.displayName.trim().slice(0, 80) : '',
      score: Number.isSafeInteger(row.score) && row.score >= 0 ? row.score : null,
    }))
    .filter((row) => row.displayName && row.score !== null)
    .slice(0, 20);
}

function qownerLeaderboardResponse(payload, source, live) {
  const response = json(200, {
    ok: true,
    source,
    live,
    updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt.slice(0, 32) : null,
    active: publicLeaderboardRows(payload?.active),
    winners: publicLeaderboardRows(payload?.winners),
  });
  response.headers.set('cache-control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
  return response;
}

async function handleQownerLeaderboard(request, env) {
  if (request.method !== 'GET') return json(405, { ok: false, error: 'method_not_allowed' });
  const endpoint = String(env.QOWNER_LEADERBOARD_URL || '').trim();
  if (!endpoint) {
    let snapshot;
    try {
      const asset = await env.ASSETS.fetch(new URL('/assets/qowner-leaderboard.json', request.url).toString());
      if (!asset.ok) return json(503, { ok: false, error: 'qowner_snapshot_unavailable' });
      snapshot = await asset.json();
    } catch {
      return json(503, { ok: false, error: 'qowner_snapshot_unavailable' });
    }
    return qownerLeaderboardResponse(snapshot, 'demo_snapshot', false);
  }
  if (!/^https:\/\//i.test(endpoint)) return json(503, { ok: false, error: 'qowner_provider_not_configured' });

  let upstream;
  try {
    upstream = await fetch(endpoint, { headers: { accept: 'application/json' } });
  } catch {
    return json(503, { ok: false, error: 'qowner_provider_unreachable' });
  }
  if (!upstream.ok) return json(503, { ok: false, error: 'qowner_provider_unavailable' });

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return json(503, { ok: false, error: 'qowner_provider_invalid_response' });
  }
  if (!payload || payload.ok !== true) return json(503, { ok: false, error: 'qowner_provider_invalid_response' });

  return qownerLeaderboardResponse(payload, 'live', true);
}

// QOWNER release interest is a small, explicit opt-in surface. It stores only
// a normalized email and the consent/source timestamps; the endpoint never
// echoes the submitted address, so repeated submissions do not become an
// email-enumeration oracle.
const QOWNER_WAITLIST_RATE_WINDOW_MS = 60 * 60 * 1000;
const QOWNER_WAITLIST_RATE_LIMIT = 8;
const QOWNER_WAITLIST_RATE_BUCKETS = new Map();

function qownerWaitlistClientKey(request) {
  return request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'anonymous';
}

function qownerWaitlistRateCheck(request) {
  const now = Date.now();
  const key = qownerWaitlistClientKey(request);
  const recent = (QOWNER_WAITLIST_RATE_BUCKETS.get(key) || [])
    .filter((time) => now - time < QOWNER_WAITLIST_RATE_WINDOW_MS);
  if (recent.length >= QOWNER_WAITLIST_RATE_LIMIT) {
    QOWNER_WAITLIST_RATE_BUCKETS.set(key, recent);
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((recent[0] + QOWNER_WAITLIST_RATE_WINDOW_MS - now) / 1000)),
    };
  }
  recent.push(now);
  QOWNER_WAITLIST_RATE_BUCKETS.set(key, recent);
  if (QOWNER_WAITLIST_RATE_BUCKETS.size > 2048) {
    for (const [bucketKey, times] of QOWNER_WAITLIST_RATE_BUCKETS) {
      if (!times.length || now - times[times.length - 1] >= QOWNER_WAITLIST_RATE_WINDOW_MS) {
        QOWNER_WAITLIST_RATE_BUCKETS.delete(bucketKey);
      }
    }
  }
  return { allowed: true, retryAfter: 0 };
}

function normalizeQownerWaitlistEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    /[^\x21-\x7e]/.test(email) ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  ) return null;
  const at = email.lastIndexOf('@');
  if (at < 1 || at > 64 || email.length - at - 1 < 1) return null;
  return email;
}

async function handleQownerWaitlist(request, env) {
  if (request.method !== 'POST') {
    const response = json(405, { ok: false, error: 'method_not_allowed' });
    response.headers.set('allow', 'POST');
    return response;
  }
  if (!sameOriginMutation(request)) {
    return json(403, { ok: false, error: 'cross_origin_request' });
  }
  if (!env.ACCOUNTS_DB || typeof env.ACCOUNTS_DB.prepare !== 'function') {
    return json(503, { ok: false, error: 'waitlist_not_configured' });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return json(413, { ok: false, error: 'request_too_large' });
  }
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return json(415, { ok: false, error: 'json_required' });
  }

  const rate = qownerWaitlistRateCheck(request);
  if (!rate.allowed) {
    const response = json(429, { ok: false, error: 'waitlist_rate_limited', retry_after_seconds: rate.retryAfter });
    response.headers.set('retry-after', String(rate.retryAfter));
    return response;
  }

  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) {
      return json(413, { ok: false, error: 'request_too_large' });
    }
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { ok: false, error: 'invalid_payload' });
  }
  const email = normalizeQownerWaitlistEmail(body.email);
  if (!email) return json(400, { ok: false, error: 'invalid_email' });
  if (body.consent !== true) return json(400, { ok: false, error: 'consent_required' });
  const source = body.source === undefined ? 'quiz' : body.source;
  if (!['quiz', 'homepage'].includes(source)) {
    return json(400, { ok: false, error: 'invalid_source' });
  }

  const now = Date.now();
  try {
    await env.ACCOUNTS_DB.prepare(`
      INSERT INTO qowner_waitlist (
        email, source, consented_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        source = excluded.source,
        consented_at = excluded.consented_at,
        updated_at = excluded.updated_at
    `).bind(email, source, now, now, now).run();
    return json(200, { ok: true, joined: true });
  } catch (error) {
    console.error('qowner waitlist storage failed', error?.code || 'waitlist_storage');
    return json(503, { ok: false, error: 'waitlist_storage' });
  }
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

async function beginProviderLink(request, env, provider) {
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) return { error: 'not_configured' };
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session || !session.sid) return { error: 'unauthenticated' };
  try {
    const existing = await env.ACCOUNTS_DB.prepare(`
      SELECT 1 FROM identities WHERE user_id = ? AND provider = ? LIMIT 1
    `).bind(session.uid, provider).first();
    if (existing) return { error: 'already_linked' };
    const now = Math.floor(Date.now() / 1000);
    const linkCookie = await signSession({
      kind: 'link',
      uid: session.uid,
      provider,
      session_hash: await sha256B64url(session.sid),
      iat: now,
      exp: now + STATE_TTL,
    }, env.SESSION_SECRET);
    return { linkCookie };
  } catch (error) {
    console.error('provider link start failed', error);
    return { error: 'account_storage' };
  }
}

async function beginGoogleDriveLink(request, env) {
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) return { error: 'not_configured' };
  if (!googleConfigured(env)) return { error: 'provider_not_configured' };
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session || !session.sid) return { error: 'unauthenticated' };
  try {
    const existing = await env.ACCOUNTS_DB.prepare(`
      SELECT 1 FROM google_drive_connections WHERE user_id = ? LIMIT 1
    `).bind(session.uid).first();
    if (existing) return { error: 'already_connected' };
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const now = Math.floor(Date.now() / 1000);
    const flowCookie = await signSession({
      kind: 'google_drive',
      uid: session.uid,
      session_hash: await sha256B64url(session.sid),
      state,
      iat: now,
      exp: now + STATE_TTL,
    }, env.SESSION_SECRET);
    return { state, flowCookie };
  } catch (error) {
    console.error('google drive link start failed', error?.code || 'account_storage');
    return { error: 'account_storage' };
  }
}

async function handleNativeLinkStart(request, url, env) {
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

  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session || !session.uid || !session.sid) {
    return json(401, { ok: false, error: 'unauthenticated' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const provider = typeof body?.provider === 'string'
    ? body.provider.trim().toLowerCase()
    : '';
  const redirectUri = typeof body?.redirect_uri === 'string'
    ? body.redirect_uri.trim()
    : '';
  const state = typeof body?.state === 'string' ? body.state.trim() : '';
  const codeChallenge = typeof body?.code_challenge === 'string'
    ? body.code_challenge.trim()
    : '';
  const codeChallengeMethod = typeof body?.code_challenge_method === 'string'
    ? body.code_challenge_method.trim()
    : '';
  if (
    !['google', 'github'].includes(provider) ||
    redirectUri !== NATIVE_REDIRECT_URI ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(state) ||
    !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) ||
    codeChallengeMethod !== 'S256'
  ) {
    return json(400, { ok: false, error: 'invalid_request' });
  }
  if ((provider === 'github' && !authConfigured(env)) ||
      (provider === 'google' && !googleConfigured(env))) {
    return json(503, { ok: false, error: 'provider_not_configured', provider });
  }

  try {
    const existing = await env.ACCOUNTS_DB.prepare(`
      SELECT 1 FROM identities WHERE user_id = ? AND provider = ? LIMIT 1
    `).bind(session.uid, provider).first();
    if (existing) return json(409, { ok: false, error: 'already_linked', provider });

    const now = Math.floor(Date.now() / 1000);
    const ticket = await signSession({
      kind: 'native_link_ticket',
      uid: session.uid,
      provider,
      session_hash: await sha256B64url(session.sid),
      state,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      iat: now,
      exp: now + STATE_TTL,
    }, env.SESSION_SECRET);
    const authorizationUrl = new URL(`/api/auth/${provider}`, url.origin);
    authorizationUrl.search = new URLSearchParams({
      client: 'desktop',
      mode: 'native_link',
      link_ticket: ticket,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    }).toString();
    return json(200, {
      ok: true,
      provider,
      authorization_url: authorizationUrl.toString(),
    });
  } catch (error) {
    console.error('native provider link start failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
}

function linkResultRedirect(reason = 'provider_error') {
  return `/dashboard?auth=link_failed&reason=${encodeURIComponent(reason)}`;
}

async function linkProviderIdentity(db, userId, {
  sub, provider, login, name, avatar, email, emailVerified = false,
}) {
  const now = Math.floor(Date.now() / 1000);
  const subject = String(sub);
  const normalized = normalizeEmail(email);
  const verified = emailVerified ? 1 : 0;
  const existingIdentity = await db.prepare(`
    SELECT user_id FROM identities WHERE provider = ? AND subject = ? LIMIT 1
  `).bind(provider, subject).first();
  if (existingIdentity && existingIdentity.user_id !== userId) {
    const error = new Error('provider_already_linked');
    error.code = 'provider_already_linked';
    throw error;
  }

  // A verified address already owned by another account is not silently
  // merged. Linking must be an explicit action and must never reassign an
  // identity or turn a provider login into an account-takeover path.
  if (normalized && verified) {
    const matchingUser = await db.prepare(`
      SELECT id FROM users
       WHERE lower(email) = ? AND email_verified = 1
       ORDER BY created_at LIMIT 1
    `).bind(normalized).first();
    if (matchingUser && matchingUser.id !== userId) {
      const error = new Error('email_already_used');
      error.code = 'email_already_used';
      throw error;
    }
  }

  // Do not reassign an identity if a concurrent flow linked it first. The
  // follow-up ownership check turns that race into a safe, visible error.
  await db.prepare(`
    INSERT INTO identities (
      id, user_id, provider, subject, login, display_name, avatar_url,
      email, email_verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, subject) DO NOTHING
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

  const owner = await db.prepare(`
    SELECT user_id FROM identities WHERE provider = ? AND subject = ? LIMIT 1
  `).bind(provider, subject).first();
  if (!owner || owner.user_id !== userId) {
    const error = new Error('provider_already_linked');
    error.code = 'provider_already_linked';
    throw error;
  }
  await db.prepare(`
    UPDATE identities
       SET login = ?, display_name = ?, avatar_url = ?, email = ?,
           email_verified = ?, updated_at = ?
     WHERE provider = ? AND subject = ? AND user_id = ?
  `).bind(
    String(login || ''),
    String(name || login || ''),
    String(avatar || ''),
    normalized,
    verified,
    now,
    provider,
    subject,
    userId,
  ).run();
}

async function finishProviderLink(env, profile, flow) {
  try {
    await linkProviderIdentity(env.ACCOUNTS_DB, flow.uid, profile);
    return redirect(
      `/dashboard?auth=linked&provider=${encodeURIComponent(profile.provider)}`,
      { 'set-cookie': clearOAuthCookies() },
    );
  } catch (error) {
    console.error('provider link failed', error);
    const reason = ['provider_already_linked', 'email_already_used'].includes(error?.code)
      ? error.code
      : 'account_storage';
    return redirect(linkResultRedirect(reason), { 'set-cookie': clearOAuthCookies() });
  }
}

async function finishNativeProviderLink(env, profile, flow) {
  try {
    const active = await env.ACCOUNTS_DB.prepare(`
      SELECT 1 FROM sessions
       WHERE user_id = ?
         AND id_hash = ?
         AND expires_at > ?
         AND revoked_at IS NULL
       LIMIT 1
    `).bind(
      flow.uid,
      flow.session_hash,
      Math.floor(Date.now() / 1000),
    ).first();
    if (!active) {
      const error = new Error('session_expired');
      error.code = 'session_expired';
      throw error;
    }
    await linkProviderIdentity(env.ACCOUNTS_DB, flow.uid, profile);
    return redirect(
      nativeCallbackUrl(flow, { linked: profile.provider }),
      { 'set-cookie': clearOAuthCookies() },
    );
  } catch (error) {
    console.error('native provider link failed', error);
    const reason = [
      'provider_already_linked',
      'email_already_used',
      'session_expired',
    ].includes(error?.code)
      ? error.code
      : 'account_storage';
    return redirect(
      nativeCallbackUrl(flow, { error: reason }),
      { 'set-cookie': clearOAuthCookies() },
    );
  }
}

async function handleGoogleDriveCallback(request, url, env, driveFlow, clearCookies) {
  const finish = (reason) => redirect(
    `/dashboard?drive=${encodeURIComponent(reason)}`,
    { 'set-cookie': clearCookies },
  );
  const flow = driveFlow?.flow;
  if (!flow) return finish('invalid_request');
  if (url.searchParams.get('error')) {
    return finish(url.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'provider_error');
  }

  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const expected = parseCookies(request)[OAUTH_STATE_COOKIE] || '';
  if (!code || !expected || !timingSafeEqual(state, expected) || !timingSafeEqual(state, flow.state)) {
    return finish('invalid_request');
  }
  if (!googleConfigured(env)) return finish('provider_not_configured');

  let tokenRes;
  try {
    tokenRes = await fetch(GOOGLE_TOKEN, {
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
  } catch {
    return finish('provider_error');
  }
  const tokenJson = await tokenRes.json().catch(() => null);
  const refreshToken = typeof tokenJson?.refresh_token === 'string'
    ? tokenJson.refresh_token.trim()
    : '';
  if (!tokenRes.ok || !refreshToken) return finish('refresh_token_missing');

  try {
    const now = Math.floor(Date.now() / 1000);
    const ciphertext = await encryptDriveSecret(refreshToken, env.SESSION_SECRET);
    const scope = typeof tokenJson.scope === 'string'
      ? tokenJson.scope.slice(0, 512)
      : GOOGLE_DRIVE_SCOPE;
    const accessToken = typeof tokenJson.access_token === 'string'
      ? tokenJson.access_token.trim()
      : '';
    const discovery = accessToken
      ? await findGoogleDriveBackup(accessToken)
      : { ok: true, fileId: null, lastBackupAt: null };
    if (!discovery.ok) {
      console.warn('google drive backup discovery skipped', discovery.error || 'drive_unavailable');
    }
    const driveFileId = discovery.ok ? discovery.fileId : null;
    const lastBackupAt = discovery.ok ? discovery.lastBackupAt : null;
    await env.ACCOUNTS_DB.prepare(`
      INSERT INTO google_drive_connections (
        user_id, refresh_token_ciphertext, scope, drive_file_id,
        connected_at, updated_at, last_backup_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        refresh_token_ciphertext = excluded.refresh_token_ciphertext,
        scope = excluded.scope,
        drive_file_id = COALESCE(excluded.drive_file_id, google_drive_connections.drive_file_id),
        last_backup_at = COALESCE(excluded.last_backup_at, google_drive_connections.last_backup_at),
        updated_at = excluded.updated_at
    `).bind(flow.uid, ciphertext, scope, driveFileId, now, now, lastBackupAt).run();
    return finish('connected');
  } catch (error) {
    console.error('google drive connection storage failed', error?.code || 'account_storage');
    return finish('account_storage');
  }
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
const CLOUD_BACKUP_FORMAT = 'voidscriptor-cloud-snapshot';
const CLOUD_BACKUP_MAX_BODY_BYTES = 128 * 1024;
const CLOUD_BACKUP_MAX_PAYLOAD_BYTES = 96 * 1024;

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
  if (next.visibility === 'public' && !next.public_handle) {
    errors.public_handle = 'required_for_public_visibility';
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
    const renewal = await renewPersistentSession(request, env, session);
    const response = json(200, {
      ok: true,
      configured,
      persistent_accounts: Boolean(env.ACCOUNTS_DB),
      // Which buttons the UI may show. Reported per provider so enabling only
      // one does not advertise a button that would 500 on click.
      providers: { github: ghOn, google: ggOn },
      authenticated: Boolean(renewal.session),
      session_renewed: renewal.renewed,
      user: sessionView(renewal.session),
    });
    if (renewal.cookie) response.headers.append('set-cookie', renewal.cookie);
    return response;
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

  // Drive linking is deliberately a separate OAuth mode. It binds the Google
  // refresh token to the already-authenticated Void Scriptor account instead
  // of replacing the account's existing sign-in identity.
  if (path === '/api/auth/google' && url.searchParams.get('mode') === 'drive' &&
      (!env.ACCOUNTS_DB || !env.SESSION_SECRET)) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
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
    const linkMode = url.searchParams.get('mode') === 'link';
    const nativeLinkRequested = url.searchParams.get('mode') === 'native_link';
    const nativeLinkTicket = nativeLinkRequested
      ? await readNativeLinkTicket(url, env.SESSION_SECRET, 'github')
      : null;
    if (nativeLinkRequested && !nativeLinkTicket) {
      return json(400, { ok: false, error: 'invalid_native_link_request' });
    }
    if (linkMode && nativeRequest.requested) {
      return json(400, { ok: false, error: 'invalid_link_request' });
    }
    let linkCookie = null;
    if (linkMode) {
      const link = await beginProviderLink(request, env, 'github');
      if (link.error === 'unauthenticated') return redirect('/?auth=required');
      if (link.error) {
        return redirect(linkResultRedirect(link.error), { 'set-cookie': clearOAuthCookies() });
      }
      linkCookie = link.linkCookie;
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
        ...(nativeLinkTicket
          ? {
              kind: 'native_link',
              uid: nativeLinkTicket.uid,
              session_hash: nativeLinkTicket.session_hash,
            }
          : {}),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + STATE_TTL,
      }, env.SESSION_SECRET)
      : null;
    return redirect(`${GITHUB_AUTHORIZE}?${q}`, {
      'set-cookie': [
        cookie(OAUTH_STATE_COOKIE, state, { maxAge: STATE_TTL }),
        cookie(GOOGLE_DRIVE_STATE_COOKIE, '', { clear: true }),
        ...(flowCookie ? [cookie(OAUTH_FLOW_COOKIE, flowCookie, { maxAge: STATE_TTL })] : []),
        ...(linkCookie
          ? [cookie(OAUTH_LINK_COOKIE, linkCookie, { maxAge: STATE_TTL })]
          : [cookie(OAUTH_LINK_COOKIE, '', { clear: true })]),
      ],
    });
  }

  if (path === '/api/auth/google') {
    if (url.searchParams.get('mode') === 'drive') {
      if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
        return json(503, { ok: false, error: 'accounts_not_configured' });
      }
      if (!ggOn) {
        return json(503, { ok: false, error: 'provider_not_configured', provider: 'google' });
      }
      const driveLink = await beginGoogleDriveLink(request, env);
      if (driveLink.error === 'unauthenticated') return redirect('/?auth=required');
      if (driveLink.error === 'already_connected') return redirect('/dashboard?drive=already_connected');
      if (driveLink.error === 'provider_not_configured') {
        return json(503, { ok: false, error: 'provider_not_configured', provider: 'google' });
      }
      if (driveLink.error) return json(503, { ok: false, error: 'account_storage' });
      const driveQuery = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: callbackUrl(url, 'google'),
        response_type: 'code',
        scope: GOOGLE_DRIVE_SCOPE,
        state: driveLink.state,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      });
      return redirect(`${GOOGLE_AUTHORIZE}?${driveQuery}`, {
        'set-cookie': [
          cookie(OAUTH_STATE_COOKIE, driveLink.state, { maxAge: STATE_TTL }),
          cookie(GOOGLE_DRIVE_STATE_COOKIE, driveLink.flowCookie, { maxAge: STATE_TTL }),
          cookie(OAUTH_FLOW_COOKIE, '', { clear: true }),
          cookie(OAUTH_LINK_COOKIE, '', { clear: true }),
        ],
      });
    }
    if (!ggOn) {
      return json(500, { ok: false, error: 'provider_not_configured', provider: 'google' });
    }
    const nativeRequest = nativeFlowRequest(url, 'google');
    if (nativeRequest.requested && !nativeRequest.flow) {
      return json(400, { ok: false, error: 'invalid_native_oauth_request' });
    }
    const linkMode = url.searchParams.get('mode') === 'link';
    const nativeLinkRequested = url.searchParams.get('mode') === 'native_link';
    const nativeLinkTicket = nativeLinkRequested
      ? await readNativeLinkTicket(url, env.SESSION_SECRET, 'google')
      : null;
    if (nativeLinkRequested && !nativeLinkTicket) {
      return json(400, { ok: false, error: 'invalid_native_link_request' });
    }
    if (linkMode && nativeRequest.requested) {
      return json(400, { ok: false, error: 'invalid_link_request' });
    }
    let linkCookie = null;
    if (linkMode) {
      const link = await beginProviderLink(request, env, 'google');
      if (link.error === 'unauthenticated') return redirect('/?auth=required');
      if (link.error) {
        return redirect(linkResultRedirect(link.error), { 'set-cookie': clearOAuthCookies() });
      }
      linkCookie = link.linkCookie;
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
        ...(nativeLinkTicket
          ? {
              kind: 'native_link',
              uid: nativeLinkTicket.uid,
              session_hash: nativeLinkTicket.session_hash,
            }
          : {}),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + STATE_TTL,
      }, env.SESSION_SECRET)
      : null;
    return redirect(`${GOOGLE_AUTHORIZE}?${q}`, {
      'set-cookie': [
        cookie(OAUTH_STATE_COOKIE, state, { maxAge: STATE_TTL }),
        cookie(GOOGLE_DRIVE_STATE_COOKIE, '', { clear: true }),
        ...(flowCookie ? [cookie(OAUTH_FLOW_COOKIE, flowCookie, { maxAge: STATE_TTL })] : []),
        ...(linkCookie
          ? [cookie(OAUTH_LINK_COOKIE, linkCookie, { maxAge: STATE_TTL })]
          : [cookie(OAUTH_LINK_COOKIE, '', { clear: true })]),
      ],
    });
  }

  // --- finish the round trip ------------------------------------------------
  if (path === '/api/auth/github/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    const expected = parseCookies(request)[OAUTH_STATE_COOKIE] || '';
    const nativeFlow = await readNativeFlow(request, env.SESSION_SECRET, 'github');
    const nativeLinkFlow = await readNativeLinkFlow(request, env.SESSION_SECRET, 'github');
    const linkFlow = await readLinkFlow(request, env.SESSION_SECRET, env.ACCOUNTS_DB, 'github');
    // Always drop both flow cookies, either way, so they cannot be replayed.
    const clearCookies = clearOAuthCookies();

    if (url.searchParams.get('error')) {
      if (nativeLinkFlow) {
        return redirect(nativeCallbackUrl(nativeLinkFlow, { error: 'access_denied' }), { 'set-cookie': clearCookies });
      }
      if (linkFlow.present) {
        return redirect('/dashboard?auth=link_cancelled', { 'set-cookie': clearCookies });
      }
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'access_denied' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=cancelled', { 'set-cookie': clearCookies });
    }
    if (!code || !expected || !timingSafeEqual(state, expected)) {
      if (nativeLinkFlow) {
        return redirect(nativeCallbackUrl(nativeLinkFlow, { error: 'invalid_request' }), { 'set-cookie': clearCookies });
      }
      if (linkFlow.present) {
        return redirect(linkResultRedirect('invalid_request'), { 'set-cookie': clearCookies });
      }
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
      if (nativeLinkFlow) {
        return redirect(nativeCallbackUrl(nativeLinkFlow, { error: 'provider_error' }), { 'set-cookie': clearCookies });
      }
      if (linkFlow.present) {
        return redirect(linkResultRedirect('provider_error'), { 'set-cookie': clearCookies });
      }
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
      if (nativeLinkFlow) {
        return redirect(nativeCallbackUrl(nativeLinkFlow, { error: 'provider_error' }), { 'set-cookie': clearCookies });
      }
      if (linkFlow.present) {
        return redirect(linkResultRedirect('provider_error'), { 'set-cookie': clearCookies });
      }
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

    const providerProfile = {
      sub: profile.id,
      provider: 'github',
      login: profile.login || '',
      name: profile.name || profile.login || '',
      avatar: profile.avatar_url || '',
      email,
      emailVerified,
    };
    if (nativeLinkFlow) {
      return finishNativeProviderLink(env, providerProfile, nativeLinkFlow);
    }
    if (linkFlow.present) {
      if (!linkFlow.flow) {
        return redirect(linkResultRedirect('invalid_request'), { 'set-cookie': clearCookies });
      }
      return finishProviderLink(env, providerProfile, linkFlow.flow);
    }
    return finishSignIn(env, url, providerProfile, nativeFlow);
  }

  // --- finish the round trip (Google) ---------------------------------------
  if (path === '/api/auth/google/callback') {
    const driveFlow = await readGoogleDriveFlow(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
    const driveClearCookies = clearOAuthCookies();
    if (driveFlow.present) {
      return handleGoogleDriveCallback(request, url, env, driveFlow, driveClearCookies);
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    const expected = parseCookies(request)[OAUTH_STATE_COOKIE] || '';
    const nativeFlow = await readNativeFlow(request, env.SESSION_SECRET, 'google');
    const nativeLinkFlow = await readNativeLinkFlow(request, env.SESSION_SECRET, 'google');
    const linkFlow = await readLinkFlow(request, env.SESSION_SECRET, env.ACCOUNTS_DB, 'google');
    // Always drop both flow cookies, either way, so they cannot be replayed.
    const clearCookies = clearOAuthCookies();

    if (url.searchParams.get('error')) {
      if (nativeLinkFlow) {
        return redirect(nativeCallbackUrl(nativeLinkFlow, { error: 'access_denied' }), { 'set-cookie': clearCookies });
      }
      if (linkFlow.present) {
        return redirect('/dashboard?auth=link_cancelled', { 'set-cookie': clearCookies });
      }
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'access_denied' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=cancelled', { 'set-cookie': clearCookies });
    }
    if (!code || !expected || !timingSafeEqual(state, expected)) {
      if (nativeLinkFlow) {
        return redirect(nativeCallbackUrl(nativeLinkFlow, { error: 'invalid_request' }), { 'set-cookie': clearCookies });
      }
      if (linkFlow.present) {
        return redirect(linkResultRedirect('invalid_request'), { 'set-cookie': clearCookies });
      }
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
      if (nativeLinkFlow) {
        return redirect(nativeCallbackUrl(nativeLinkFlow, { error: 'provider_error' }), { 'set-cookie': clearCookies });
      }
      if (linkFlow.present) {
        return redirect(linkResultRedirect('provider_error'), { 'set-cookie': clearCookies });
      }
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
      if (nativeLinkFlow) {
        return redirect(nativeCallbackUrl(nativeLinkFlow, { error: 'provider_error' }), { 'set-cookie': clearCookies });
      }
      if (linkFlow.present) {
        return redirect(linkResultRedirect('provider_error'), { 'set-cookie': clearCookies });
      }
      return nativeFlow
        ? redirect(nativeCallbackUrl(nativeFlow, { error: 'provider_error' }), { 'set-cookie': clearCookies })
        : redirect('/?auth=failed', { 'set-cookie': clearCookies });
    }

    const providerProfile = {
      sub: info.sub,
      provider: 'google',
      // Google does not provide a public handle. Never manufacture one from
      // the email address: the user-controlled profile handle is the only
      // public identity field.
      login: '',
      name: info.name || '',
      avatar: info.picture || '',
      email: info.email,
      emailVerified: info.email_verified === true,
    };
    if (nativeLinkFlow) {
      return finishNativeProviderLink(env, providerProfile, nativeLinkFlow);
    }
    if (linkFlow.present) {
      if (!linkFlow.flow) {
        return redirect(linkResultRedirect('invalid_request'), { 'set-cookie': clearCookies });
      }
      return finishProviderLink(env, providerProfile, linkFlow.flow);
    }
    return finishSignIn(env, url, providerProfile, nativeFlow);
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
    const [user, profile, identitiesResult, sessionsResult, backupRow] = await Promise.all([
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
      env.ACCOUNTS_DB.prepare(`
        SELECT format_version, payload_json, size_bytes, created_at, updated_at
          FROM account_backups
         WHERE user_id = ?
         LIMIT 1
      `).bind(session.uid).first(),
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
    let cloudBackup = null;
    if (backupRow) {
      try {
        cloudBackup = {
          format: CLOUD_BACKUP_FORMAT,
          version: Number(backupRow.format_version) || 1,
          size_bytes: Number(backupRow.size_bytes) || 0,
          created_at: Number(backupRow.created_at) || null,
          updated_at: Number(backupRow.updated_at) || null,
          snapshot: JSON.parse(backupRow.payload_json),
        };
      } catch {
        cloudBackup = null;
      }
    }
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
      cloud_backup: cloudBackup,
    });
  } catch (error) {
    console.error('account export failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
}

const ACCOUNT_DELETE_CONFIRMATION = 'HAPUS AKUN';

function sameOriginMutation(request) {
  let requestOrigin;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }
  // The destructive endpoint is intentionally limited to the canonical site.
  // This also prevents a POST sent to a legacy Pages hostname from bypassing
  // the normal GET-only canonical redirect.
  if (requestOrigin !== `https://${CANONICAL_HOST}`) return false;
  const origin = request.headers.get('origin');
  return !origin || origin === requestOrigin;
}

async function deleteAccountData(db, userId) {
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('account_id_missing');
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('account_batch_unavailable');
  }

  // Keep the child deletes explicit even though the migrations also declare
  // ON DELETE CASCADE. This documents the erasure boundary and makes the
  // operation safe if a future table changes its foreign-key policy.
  const statements = [
    'google_drive_connections',
    'account_backups',
    'profiles',
    'oauth_codes',
    'sessions',
    'identities',
    'users',
  ].map((table) => db.prepare(`DELETE FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'} = ?`).bind(uid));

  await db.batch(statements);
  return { deleted: true };
}

async function handleAccountDelete(request, env) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!sameOriginMutation(request)) {
    return json(403, { ok: false, error: 'cross_origin_request' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }

  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) return json(401, { ok: false, error: 'unauthenticated' });

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 4096) return json(413, { ok: false, error: 'request_too_large' });
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return json(415, { ok: false, error: 'json_required' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim() : '';
  if (confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
    return json(400, { ok: false, error: 'confirmation_required' });
  }

  try {
    await deleteAccountData(env.ACCOUNTS_DB, session.uid);
    const response = json(200, {
      ok: true,
      deleted: true,
      // The app-created file is outside this account database and is not
      // deleted implicitly. The user can remove it from Google Drive directly.
      remote_drive_file_preserved: true,
    });
    response.headers.append('set-cookie', cookie(SESSION_COOKIE, '', { clear: true }));
    for (const value of clearOAuthCookies()) response.headers.append('set-cookie', value);
    return response;
  } catch (error) {
    console.error('account deletion failed', error);
    return json(503, { ok: false, error: 'account_storage' });
  }
}

function normalizeCloudSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const settingsSource = input.settings && typeof input.settings === 'object'
    ? input.settings
    : {};
  const onboardingSource = input.onboarding && typeof input.onboarding === 'object'
    ? input.onboarding
    : {};
  const settings = {
    persona: ['balanced', 'friend', 'guardian'].includes(String(settingsSource.persona))
      ? String(settingsSource.persona)
      : 'balanced',
    safe: settingsSource.safe !== false,
    voice: settingsSource.voice === true,
  };
  const onboarding = {};
  ['stepDownload', 'stepVerify', 'stepRun'].forEach((key) => {
    onboarding[key] = onboardingSource[key] === true;
  });
  let workspace = null;
  if (input.workspace && typeof input.workspace === 'object' && !Array.isArray(input.workspace)) {
    const sourceEntries = Array.isArray(input.workspace.entries) ? input.workspace.entries : [];
    const entries = sourceEntries.slice(0, 200).map((entry) => {
      const item = entry && typeof entry === 'object' ? entry : {};
      const rawSize = Number(item.size);
      return {
        path: profileText(item.path || item.name || 'item', 512),
        type: profileText(item.type || 'file', 32, true),
        extension: profileText(item.extension || '', 20, true),
        size: Number.isFinite(rawSize) && rawSize >= 0 ? Math.min(Math.floor(rawSize), 10_000_000_000) : null,
      };
    });
    const checkedAt = Number(input.workspace.checkedAt);
    workspace = {
      root: profileText(input.workspace.root || '', 512),
      entries,
      checkedAt: Number.isFinite(checkedAt) && checkedAt > 0 ? Math.floor(checkedAt) : null,
    };
  }
  const plan = Array.isArray(input.plan)
    ? input.plan.slice(0, 5).map((item) => profileText(item, 240, true)).filter(Boolean)
    : [];
  return { settings, onboarding, workspace, plan };
}

async function handleCloudBackup(request, env) {
  if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(request.method)) {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    const response = json(503, { ok: false, error: 'accounts_not_configured' });
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) {
    const response = json(401, { ok: false, error: 'unauthenticated' });
    response.headers.set('cache-control', 'no-store');
    return response;
  }

  try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const row = await env.ACCOUNTS_DB.prepare(`
        SELECT format_version, payload_json, size_bytes, created_at, updated_at
          FROM account_backups
         WHERE user_id = ?
         LIMIT 1
      `).bind(session.uid).first();
      if (!row) {
        const response = json(200, { ok: true, backup: { exists: false } });
        response.headers.set('cache-control', 'no-store');
        return response;
      }
      let snapshot;
      try {
        snapshot = JSON.parse(row.payload_json);
      } catch {
        const response = json(503, { ok: false, error: 'backup_corrupt' });
        response.headers.set('cache-control', 'no-store');
        return response;
      }
      const response = json(200, {
        ok: true,
        backup: {
          exists: true,
          format: CLOUD_BACKUP_FORMAT,
          version: Number(row.format_version) || 1,
          size_bytes: Number(row.size_bytes) || 0,
          created_at: Number(row.created_at) || null,
          updated_at: Number(row.updated_at) || null,
          snapshot,
        },
      });
      response.headers.set('cache-control', 'no-store');
      return response;
    }

    if (request.method === 'DELETE') {
      await env.ACCOUNTS_DB.prepare('DELETE FROM account_backups WHERE user_id = ?')
        .bind(session.uid)
        .run();
      const response = json(200, { ok: true, deleted: true });
      response.headers.set('cache-control', 'no-store');
      return response;
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > CLOUD_BACKUP_MAX_BODY_BYTES) {
      return json(413, { ok: false, error: 'request_too_large' });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { ok: false, error: 'invalid_json' });
    }
    if (!body || body.format !== CLOUD_BACKUP_FORMAT) {
      return json(400, { ok: false, error: 'invalid_backup_format' });
    }
    const snapshot = normalizeCloudSnapshot(body.snapshot);
    if (!snapshot) return json(400, { ok: false, error: 'invalid_backup' });
    const payloadJson = JSON.stringify(snapshot);
    const sizeBytes = new TextEncoder().encode(payloadJson).byteLength;
    if (sizeBytes > CLOUD_BACKUP_MAX_PAYLOAD_BYTES) {
      return json(413, { ok: false, error: 'backup_too_large' });
    }
    const now = Math.floor(Date.now() / 1000);
    const previous = await env.ACCOUNTS_DB.prepare(
      'SELECT created_at FROM account_backups WHERE user_id = ? LIMIT 1',
    ).bind(session.uid).first();
    const createdAt = Number(previous?.created_at) || now;
    await env.ACCOUNTS_DB.prepare(`
      INSERT INTO account_backups (
        user_id, format_version, payload_json, size_bytes, created_at, updated_at
      ) VALUES (?, 1, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        format_version = excluded.format_version,
        payload_json = excluded.payload_json,
        size_bytes = excluded.size_bytes,
        updated_at = excluded.updated_at
    `).bind(session.uid, payloadJson, sizeBytes, createdAt, now).run();
    const response = json(200, {
      ok: true,
      backup: {
        exists: true,
        format: CLOUD_BACKUP_FORMAT,
        version: 1,
        size_bytes: sizeBytes,
        created_at: createdAt,
        updated_at: now,
        snapshot,
      },
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) {
    console.error('account cloud backup failed', error);
    const response = json(503, { ok: false, error: 'account_storage' });
    response.headers.set('cache-control', 'no-store');
    return response;
  }
}

async function readGoogleDriveConnection(db, userId) {
  return db.prepare(`
    SELECT user_id, refresh_token_ciphertext, scope, drive_file_id,
           connected_at, updated_at, last_backup_at
      FROM google_drive_connections
     WHERE user_id = ?
     LIMIT 1
  `).bind(userId).first();
}

async function handleGoogleDriveStatus(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) return json(401, { ok: false, error: 'unauthenticated' });
  try {
    const row = await readGoogleDriveConnection(env.ACCOUNTS_DB, session.uid);
    return json(200, {
      ok: true,
      connected: Boolean(row),
      scope: row ? (row.scope || GOOGLE_DRIVE_SCOPE) : null,
      connected_at: row ? Number(row.connected_at) || null : null,
      last_backup_at: row ? Number(row.last_backup_at) || null : null,
      backup_available: Boolean(row?.drive_file_id),
      backup_file_name: row ? GOOGLE_DRIVE_BACKUP_NAME : null,
    });
  } catch (error) {
    console.error('google drive status failed', error?.code || 'account_storage');
    return json(503, { ok: false, error: 'account_storage' });
  }
}

async function handleGoogleDriveDisconnect(request, env) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) return json(401, { ok: false, error: 'unauthenticated' });
  try {
    await env.ACCOUNTS_DB.prepare(
      'DELETE FROM google_drive_connections WHERE user_id = ?',
    ).bind(session.uid).run();
    return json(200, {
      ok: true,
      disconnected: true,
      remote_file_preserved: true,
    });
  } catch (error) {
    console.error('google drive disconnect failed', error?.code || 'account_storage');
    return json(503, { ok: false, error: 'account_storage' });
  }
}

async function refreshGoogleDriveAccessToken(env, connection) {
  const refreshToken = await decryptDriveSecret(
    connection?.refresh_token_ciphertext,
    env.SESSION_SECRET,
  );
  if (!refreshToken) return { error: 'drive_reauthorize' };

  let response;
  try {
    response = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
  } catch {
    return { error: 'drive_unavailable' };
  }
  const payload = await response.json().catch(() => null);
  const accessToken = typeof payload?.access_token === 'string'
    ? payload.access_token.trim()
    : '';
  if (!response.ok || !accessToken) {
    return {
      error: response.status === 400 || response.status === 401
        ? 'drive_reauthorize'
        : 'drive_unavailable',
    };
  }
  const rotatedRefreshToken = typeof payload.refresh_token === 'string'
    ? payload.refresh_token.trim()
    : '';
  return {
    accessToken,
    refreshToken: rotatedRefreshToken || null,
  };
}

function driveMultipartBody(content) {
  const boundary = `voidscriptor_${crypto.randomUUID().replaceAll('-', '')}`;
  const metadata = JSON.stringify({
    name: GOOGLE_DRIVE_BACKUP_NAME,
    mimeType: 'application/json',
  });
  const body = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    'Content-Type: application/json\r\n\r\n',
    content,
    `\r\n--${boundary}--\r\n`,
  ].join('');
  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

function driveApiError(status) {
  if (status === 401 || status === 403) return 'drive_reauthorize';
  return 'drive_unavailable';
}

async function findGoogleDriveBackup(accessToken) {
  try {
    const query = new URLSearchParams({
      q: `name = '${GOOGLE_DRIVE_BACKUP_NAME}' and trashed = false`,
      spaces: 'drive',
      pageSize: '10',
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,modifiedTime)',
    });
    const response = await fetch(`${GOOGLE_DRIVE_API}/files?${query}`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
    });
    if (!response.ok) return { ok: false, error: driveApiError(response.status) };
    const payload = await response.json().catch(() => null);
    if (!Array.isArray(payload?.files)) return { ok: false, error: 'drive_invalid_response' };
    const file = payload.files
      .filter((item) => (
        item &&
        item.name === GOOGLE_DRIVE_BACKUP_NAME &&
        typeof item.id === 'string' &&
        GOOGLE_DRIVE_FILE_ID_RE.test(item.id)
      ))
      .sort((left, right) => Date.parse(right.modifiedTime || '') - Date.parse(left.modifiedTime || ''))[0];
    const modifiedAt = file ? Date.parse(file.modifiedTime || '') : NaN;
    return {
      ok: true,
      fileId: file?.id || null,
      lastBackupAt: Number.isFinite(modifiedAt) && modifiedAt > 0
        ? Math.floor(modifiedAt / 1000)
        : null,
    };
  } catch {
    return { ok: false, error: 'drive_unavailable' };
  }
}

async function uploadGoogleDriveBackup(accessToken, fileId, content) {
  try {
    const headers = { authorization: `Bearer ${accessToken}` };
    if (GOOGLE_DRIVE_FILE_ID_RE.test(String(fileId || ''))) {
      const update = await fetch(
        `${GOOGLE_DRIVE_UPLOAD_API}/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime`,
        {
          method: 'PATCH',
          headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
          body: content,
        },
      );
      if (update.ok) {
        const payload = await update.json().catch(() => null);
        if (typeof payload?.id === 'string' && GOOGLE_DRIVE_FILE_ID_RE.test(payload.id)) {
          return { ok: true, fileId: payload.id };
        }
        return { ok: false, error: 'drive_invalid_response' };
      }
      if (update.status !== 404) return { ok: false, error: driveApiError(update.status) };
    }

    const multipart = driveMultipartBody(content);
    const create = await fetch(
      `${GOOGLE_DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,modifiedTime`,
      {
        method: 'POST',
        headers: { ...headers, 'content-type': multipart.contentType },
        body: multipart.body,
      },
    );
    if (!create.ok) return { ok: false, error: driveApiError(create.status) };
    const payload = await create.json().catch(() => null);
    if (typeof payload?.id !== 'string' || !GOOGLE_DRIVE_FILE_ID_RE.test(payload.id)) {
      return { ok: false, error: 'drive_invalid_response' };
    }
    return { ok: true, fileId: payload.id };
  } catch {
    return { ok: false, error: 'drive_unavailable' };
  }
}

async function downloadGoogleDriveBackup(accessToken, fileId) {
  if (!GOOGLE_DRIVE_FILE_ID_RE.test(String(fileId || ''))) {
    return { ok: false, error: 'drive_backup_not_found' };
  }
  try {
    const response = await fetch(
      `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      if (response.status === 404) return { ok: false, error: 'drive_backup_not_found' };
      return { ok: false, error: driveApiError(response.status) };
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > CLOUD_BACKUP_MAX_BODY_BYTES) {
      return { ok: false, error: 'drive_backup_too_large' };
    }
    const content = await response.text();
    if (new TextEncoder().encode(content).byteLength > CLOUD_BACKUP_MAX_BODY_BYTES) {
      return { ok: false, error: 'drive_backup_too_large' };
    }
    let payload;
    try {
      payload = JSON.parse(content);
    } catch {
      return { ok: false, error: 'drive_backup_invalid' };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'drive_unavailable' };
  }
}

async function handleGoogleDriveBackup(request, env) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) return json(401, { ok: false, error: 'unauthenticated' });

  try {
    const connection = await readGoogleDriveConnection(env.ACCOUNTS_DB, session.uid);
    if (!connection) return json(409, { ok: false, error: 'drive_not_connected' });
    const backup = await env.ACCOUNTS_DB.prepare(`
      SELECT payload_json, updated_at
        FROM account_backups
       WHERE user_id = ?
       LIMIT 1
    `).bind(session.uid).first();
    if (!backup) return json(409, { ok: false, error: 'backup_not_found' });

    let snapshot;
    try {
      snapshot = JSON.parse(backup.payload_json);
    } catch {
      return json(503, { ok: false, error: 'backup_corrupt' });
    }
    const exportedAt = new Date().toISOString();
    const content = JSON.stringify({
      format: CLOUD_BACKUP_FORMAT,
      version: 1,
      exported_at: exportedAt,
      snapshot,
    });
    const token = await refreshGoogleDriveAccessToken(env, connection);
    if (token.error) return json(502, { ok: false, error: token.error });

    if (token.refreshToken) {
      const rotatedCiphertext = await encryptDriveSecret(token.refreshToken, env.SESSION_SECRET);
      await env.ACCOUNTS_DB.prepare(`
        UPDATE google_drive_connections
           SET refresh_token_ciphertext = ?, updated_at = ?
         WHERE user_id = ?
      `).bind(rotatedCiphertext, Math.floor(Date.now() / 1000), session.uid).run();
    }

    const upload = await uploadGoogleDriveBackup(token.accessToken, connection.drive_file_id, content);
    if (!upload.ok) return json(502, { ok: false, error: upload.error });
    const now = Math.floor(Date.now() / 1000);
    await env.ACCOUNTS_DB.prepare(`
      UPDATE google_drive_connections
         SET drive_file_id = ?, last_backup_at = ?, updated_at = ?
       WHERE user_id = ?
    `).bind(upload.fileId, now, now, session.uid).run();
    return json(200, {
      ok: true,
      backup: {
        file_name: GOOGLE_DRIVE_BACKUP_NAME,
        last_backup_at: now,
      },
    });
  } catch (error) {
    console.error('google drive backup failed', error?.code || 'account_storage');
    return json(503, { ok: false, error: 'account_storage' });
  }
}

async function handleGoogleDriveRestore(request, env) {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    return json(503, { ok: false, error: 'accounts_not_configured' });
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) return json(401, { ok: false, error: 'unauthenticated' });

  try {
    const connection = await readGoogleDriveConnection(env.ACCOUNTS_DB, session.uid);
    if (!connection) return json(409, { ok: false, error: 'drive_not_connected' });
    if (!GOOGLE_DRIVE_FILE_ID_RE.test(String(connection.drive_file_id || ''))) {
      return json(409, { ok: false, error: 'drive_backup_not_found' });
    }

    const token = await refreshGoogleDriveAccessToken(env, connection);
    if (token.error) return json(502, { ok: false, error: token.error });
    if (token.refreshToken) {
      const rotatedCiphertext = await encryptDriveSecret(token.refreshToken, env.SESSION_SECRET);
      await env.ACCOUNTS_DB.prepare(`
        UPDATE google_drive_connections
           SET refresh_token_ciphertext = ?, updated_at = ?
         WHERE user_id = ?
      `).bind(rotatedCiphertext, Math.floor(Date.now() / 1000), session.uid).run();
    }

    const remote = await downloadGoogleDriveBackup(token.accessToken, connection.drive_file_id);
    if (!remote.ok) return json(502, { ok: false, error: remote.error });
    if (
      !remote.payload ||
      remote.payload.format !== CLOUD_BACKUP_FORMAT ||
      Number(remote.payload.version) !== 1
    ) {
      return json(502, { ok: false, error: 'drive_backup_invalid' });
    }
    const snapshot = normalizeCloudSnapshot(remote.payload.snapshot);
    if (!snapshot) return json(502, { ok: false, error: 'drive_backup_invalid' });
    const payloadJson = JSON.stringify(snapshot);
    const sizeBytes = new TextEncoder().encode(payloadJson).byteLength;
    if (sizeBytes > CLOUD_BACKUP_MAX_PAYLOAD_BYTES) {
      return json(502, { ok: false, error: 'drive_backup_too_large' });
    }

    const now = Math.floor(Date.now() / 1000);
    const previous = await env.ACCOUNTS_DB.prepare(
      'SELECT created_at FROM account_backups WHERE user_id = ? LIMIT 1',
    ).bind(session.uid).first();
    const createdAt = Number(previous?.created_at) || now;
    await env.ACCOUNTS_DB.prepare(`
      INSERT INTO account_backups (
        user_id, format_version, payload_json, size_bytes, created_at, updated_at
      ) VALUES (?, 1, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        format_version = excluded.format_version,
        payload_json = excluded.payload_json,
        size_bytes = excluded.size_bytes,
        updated_at = excluded.updated_at
    `).bind(session.uid, payloadJson, sizeBytes, createdAt, now).run();
    return json(200, {
      ok: true,
      restored: {
        file_name: GOOGLE_DRIVE_BACKUP_NAME,
        format: CLOUD_BACKUP_FORMAT,
        version: 1,
        size_bytes: sizeBytes,
        created_at: createdAt,
        updated_at: now,
      },
    });
  } catch (error) {
    console.error('google drive restore failed', error?.code || 'account_storage');
    return json(503, { ok: false, error: 'account_storage' });
  }
}

async function handleAccountActivity(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }
  if (!env.ACCOUNTS_DB || !env.SESSION_SECRET) {
    const response = json(503, { ok: false, error: 'accounts_not_configured' });
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  const session = await readSession(request, env.SESSION_SECRET, env.ACCOUNTS_DB);
  if (!session) {
    const response = json(401, { ok: false, error: 'unauthenticated' });
    response.headers.set('cache-control', 'no-store');
    return response;
  }

  try {
    const [user, identitiesResult, sessionsResult, profile, backup] = await Promise.all([
      env.ACCOUNTS_DB.prepare(`
        SELECT created_at, last_login_at
          FROM users
         WHERE id = ?
         LIMIT 1
      `).bind(session.uid).first(),
      env.ACCOUNTS_DB.prepare(`
        SELECT provider, created_at
          FROM identities
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 20
      `).bind(session.uid).all(),
      env.ACCOUNTS_DB.prepare(`
        SELECT client, provider, created_at, revoked_at
          FROM sessions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 20
      `).bind(session.uid).all(),
      env.ACCOUNTS_DB.prepare(`
        SELECT created_at, updated_at
          FROM profiles
         WHERE user_id = ?
         LIMIT 1
      `).bind(session.uid).first(),
      env.ACCOUNTS_DB.prepare(`
        SELECT size_bytes, updated_at
          FROM account_backups
         WHERE user_id = ?
         LIMIT 1
      `).bind(session.uid).first(),
    ]);

    const events = [];
    const add = (type, at, extra = {}) => {
      const timestamp = Number(at);
      if (!Number.isFinite(timestamp) || timestamp <= 0) return;
      events.push({ type, at: Math.floor(timestamp), ...extra });
    };

    add('account_created', user?.created_at);
    add('signed_in', user?.last_login_at, { provider: session.provider });
    for (const row of identitiesResult.results || []) {
      add('provider_connected', row.created_at, { provider: row.provider });
    }
    if (profile?.updated_at && Number(profile.updated_at) !== Number(profile.created_at)) {
      add('profile_updated', profile.updated_at);
    }
    for (const row of sessionsResult.results || []) {
      add('session_created', row.created_at, {
        client: row.client === 'desktop' ? 'desktop' : 'web',
        provider: row.provider,
      });
      add('session_revoked', row.revoked_at, {
        client: row.client === 'desktop' ? 'desktop' : 'web',
        provider: row.provider,
      });
    }
    add('backup_saved', backup?.updated_at, {
      size_bytes: Number(backup?.size_bytes) || 0,
    });

    events.sort((a, b) => b.at - a.at);
    const response = json(200, { ok: true, events: events.slice(0, 30) });
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) {
    console.error('account activity lookup failed', error);
    const response = json(503, { ok: false, error: 'account_storage' });
    response.headers.set('cache-control', 'no-store');
    return response;
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
    const internalPath = canonicalInternalPath(url.pathname);
    if (internalPath === null || INTERNAL.some((rx) => rx.test(internalPath))) {
      return new Response('Not found', { status: 404, headers: BASE_HEADERS });
    }
    if (url.pathname === APP_PREVIEW_PREFIX || url.pathname.startsWith(APP_PREVIEW_PREFIX + '/')) {
      return handleAppPreview(request, url, env);
    }
    if (url.pathname === '/api/health') {
      return handleHealth(request, env, url);
    }
    if (url.pathname === '/api/byte') {
      return handleByte(request, env);
    }
    if (url.pathname === '/api/qowner/leaderboard') {
      return handleQownerLeaderboard(request, env);
    }
    if (url.pathname === '/api/qowner/waitlist') {
      return handleQownerWaitlist(request, env);
    }
    if (url.pathname === '/api/account/me') {
      return handleAccount(request, env);
    }
    if (url.pathname === '/api/account/export') {
      return handleAccountExport(request, env);
    }
    if (url.pathname === '/api/account/delete') {
      return handleAccountDelete(request, env);
    }
    if (url.pathname === '/api/account/backup') {
      return handleCloudBackup(request, env);
    }
    if (url.pathname === '/api/integrations/google-drive') {
      return handleGoogleDriveStatus(request, env);
    }
    if (url.pathname === '/api/integrations/google-drive/backup') {
      return handleGoogleDriveBackup(request, env);
    }
    if (url.pathname === '/api/integrations/google-drive/restore') {
      return handleGoogleDriveRestore(request, env);
    }
    if (url.pathname === '/api/integrations/github' ||
        url.pathname.startsWith('/api/integrations/github/')) {
      return handleGitHubAppIntegration(request, url, env, {
        readSession,
        signSession,
        verifySignedPayload,
        sha256B64url,
      });
    }
    if (url.pathname === '/api/integrations/google-drive/disconnect') {
      return handleGoogleDriveDisconnect(request, env);
    }
    if (url.pathname === '/api/account/activity') {
      return handleAccountActivity(request, env);
    }
    if (url.pathname === '/api/account/connections/link/start') {
      return handleNativeLinkStart(request, url, env);
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
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', {
          status: 405,
          headers: { ...BASE_HEADERS, Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
        });
      }
      const downloadErrorHeaders = () => ({ ...BASE_HEADERS, 'Cache-Control': 'no-store' });
      let key;
      try {
        key = decodeURIComponent(url.pathname.slice('/downloads/'.length));
      } catch {
        // Malformed percent-encoding is a bad request for an unknown object,
        // not a reason to let URIError escape the worker.
        return new Response('Download not found', {
          status: 404,
          headers: downloadErrorHeaders(),
        });
      }
      if (!isPublicDownloadKey(key)) {
        return new Response('Download not found', {
          status: 404,
          headers: downloadErrorHeaders(),
        });
      }
      // A 30 MB installer over a flaky connection must be resumable, so honour
      // `Range` and advertise it. Without this a dropped transfer restarts from
      // zero every time; browsers and download managers both rely on 206s.
      const rangeHeader = request.headers.get('range');
      let range = null;
      let wantRange = false;
      let objectSize = null;
      if (rangeHeader !== null) {
        // Resolve the object size before parsing any requested window. This lets
        // us reject inverted, out-of-bounds, zero-length, and overflowed ranges
        // with a valid 416 instead of asking R2 for an invalid slice.
        const head = await env.DOWNLOADS.head(key);
        if (!head) {
          return new Response('Download not found', {
            status: 404,
            headers: downloadErrorHeaders(),
          });
        }
        objectSize = Number(head.size);
        const rejectRange = () => new Response('Range not satisfiable', {
          status: 416,
          headers: {
            ...BASE_HEADERS,
            'Cache-Control': 'no-store',
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes */${objectSize}`,
          },
        });
        if (!Number.isSafeInteger(objectSize) || objectSize < 0) return rejectRange();

        const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        if (!m) return rejectRange();
        const hasStart = m[1] !== '', hasEnd = m[2] !== '';
        if (!hasStart && !hasEnd) return rejectRange();

        if (hasStart) {
          const start = Number(m[1]);
          if (!Number.isSafeInteger(start) || start < 0 || start >= objectSize) return rejectRange();
          const requestedEnd = hasEnd ? Number(m[2]) : objectSize - 1;
          if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return rejectRange();
          const end = Math.min(requestedEnd, objectSize - 1);
          range = { offset: start, length: end - start + 1 };
        } else {
          // `bytes=-N` means the final N bytes. Suffix zero is explicitly
          // unsatisfiable; otherwise it would produce an invalid start>end 206.
          const suffix = Number(m[2]);
          if (!Number.isSafeInteger(suffix) || suffix <= 0 || objectSize === 0) return rejectRange();
          const offset = Math.max(0, objectSize - suffix);
          range = { offset, length: objectSize - offset };
        }
        wantRange = true;
      }

      let obj;
      if (range) {
        obj = await env.DOWNLOADS.get(key, { range });
      } else {
        obj = await env.DOWNLOADS.get(key);
      }

      if (obj === null) {
        return new Response('Download not found', {
          status: 404,
          headers: downloadErrorHeaders(),
        });
      }

      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      for (const [k, v] of Object.entries(BASE_HEADERS)) headers.set(k, v);
      // Downloads are immutable release bytes, but the route must not let an
      // edge cache retain full or partial responses across deployments.
      headers.set('Cache-Control', 'no-store');
      // Always advertise range support so a resumable client will try it.
      headers.set('Accept-Ranges', 'bytes');
      // Any downloadable artifact is offered as an attachment, not just .zip:
      // the .exe installer must download rather than be treated as a page.
      if (/\.(?:zip|exe|msi|dmg|appimage|deb|rpm|pkg|tar\.gz|tgz)$/i.test(key)) {
        // The allowlist above currently contains safe ASCII release names. Keep
        // both header parameters defensive so a future key cannot inject CR/LF
        // or an unescaped quote into Content-Disposition.
        const safeName = key.replaceAll(String.fromCharCode(13), '_').replaceAll(String.fromCharCode(10), '_').replaceAll('"', '_').replaceAll(String.fromCharCode(92), '_');
        headers.set(
          'Content-Disposition',
          `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        );
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

      // R2 metadata does not always add Content-Length to a no-store HEAD
      // response at the edge. Set the full object length explicitly so clients
      // and download managers can validate the transfer before reading bytes.
      headers.set('Content-Length', String(obj.size));
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
      let handle;
      try {
        handle = decodeURIComponent(url.pathname.slice(3));
      } catch {
        return new Response('Not found', { status: 404, headers: BASE_HEADERS });
      }
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

export {
  deleteAccountData,
  normalizeCloudSnapshot,
  findGoogleDriveBackup,
  downloadGoogleDriveBackup,
};
