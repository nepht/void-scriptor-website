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
];

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
  "connect-src 'self'",
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
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
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
//
// The access token is used once to read the profile and then discarded. Nothing
// token-shaped is stored or sent to the client: the session is an HMAC-signed,
// expiring cookie carrying only public profile fields. So there is no database
// and no server-side session store. The trade-off: a session cannot be revoked
// individually before its 7-day expiry; rotating SESSION_SECRET ends every
// session at once.
// ---------------------------------------------------------------------------

const OAUTH_STATE_COOKIE = 'vs_oauth_state';
const SESSION_COOKIE = 'vs_session';
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days, in seconds
const STATE_TTL = 600; // 10 minutes to finish the round trip
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

// The identity, or null for anything that is not a valid, unexpired,
// correctly-signed session cookie.
async function readSession(req, secret) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return null;
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
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
    return null;
  }
  return payload;
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...BASE_HEADERS },
  });
}

// `set-cookie` is the one header that must never be comma-joined. A browser
// treats a joined value as a SINGLE cookie and applies its duplicate attributes
// in order, so pairing the session cookie with the state-clearing cookie in one
// array produced one header ending in `Max-Age=0` -- which deleted the session
// the instant it was created. Sign-in then looked like it did nothing. workerd
// joins an array into a single header here, so append each value separately.
function redirect(location, extraHeaders = {}) {
  const headers = new Headers({ location, ...BASE_HEADERS });
  for (const [name, value] of Object.entries(extraHeaders)) {
    if (name.toLowerCase() === 'set-cookie') {
      for (const v of Array.isArray(value) ? value : [value]) headers.append('set-cookie', v);
    } else {
      headers.set(name, value);
    }
  }
  return new Response(null, { status: 302, headers });
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
async function finishSignIn(env, url, { sub, login, name, avatar, email, provider }) {
  const now = Math.floor(Date.now() / 1000);
  const session = await signSession(
    {
      sub: String(sub),
      provider,
      login: login || '',
      name: name || login || '',
      avatar: avatar || '',
      email: email || null,
      iat: now,
      exp: now + SESSION_TTL,
    },
    env.SESSION_SECRET,
  );
  return redirect('/?auth=ok', {
    'set-cookie': [
      cookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL }),
      cookie(OAUTH_STATE_COOKIE, '', { clear: true }),
    ],
  });
}

async function handleAuth(request, url, env) {
  const path = url.pathname;
  const ghOn = authConfigured(env);
  const ggOn = googleConfigured(env);
  const configured = ghOn || ggOn;

  // The header badge polls this on every page load, so an unconfigured
  // deployment must answer cleanly ("nobody is signed in, sign-in is off")
  // rather than 500. The sign-in endpoints themselves fail loudly.
  if (path === '/api/auth/session') {
    const session = configured ? await readSession(request, env.SESSION_SECRET) : null;
    return json(200, {
      ok: true,
      configured,
      // Which buttons the UI may show. Reported per provider so enabling only
      // one does not advertise a button that would 500 on click.
      providers: { github: ghOn, google: ggOn },
      authenticated: Boolean(session),
      user: session || null,
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
    return redirect('/', { 'set-cookie': cookie(SESSION_COOKIE, '', { clear: true }) });
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
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const q = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: callbackUrl(url, 'github'),
      scope: GITHUB_SCOPE,
      state,
      allow_signup: 'true',
    });
    return redirect(`${GITHUB_AUTHORIZE}?${q}`, {
      'set-cookie': cookie(OAUTH_STATE_COOKIE, state, { maxAge: STATE_TTL }),
    });
  }

  if (path === '/api/auth/google') {
    if (!ggOn) {
      return json(500, { ok: false, error: 'provider_not_configured', provider: 'google' });
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
    return redirect(`${GOOGLE_AUTHORIZE}?${q}`, {
      'set-cookie': cookie(OAUTH_STATE_COOKIE, state, { maxAge: STATE_TTL }),
    });
  }

  // --- finish the round trip ------------------------------------------------
  if (path === '/api/auth/github/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    const expected = parseCookies(request)[OAUTH_STATE_COOKIE] || '';
    // Always drop the state cookie, either way, so it cannot be replayed.
    const clearState = cookie(OAUTH_STATE_COOKIE, '', { clear: true });

    if (url.searchParams.get('error')) {
      return redirect('/?auth=cancelled', { 'set-cookie': clearState });
    }
    if (!code || !expected || !timingSafeEqual(state, expected)) {
      return redirect('/?auth=failed', { 'set-cookie': clearState });
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
      return redirect('/?auth=failed', { 'set-cookie': clearState });
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
      return redirect('/?auth=failed', { 'set-cookie': clearState });
    }

    // GitHub keeps the address private unless the person made it public, so
    // fall back to the emails endpoint and take the primary verified one.
    let email = profile.email || null;
    if (!email) {
      const emails = await (
        await fetch(`${GITHUB_API}/user/emails`, { headers: ghHeaders })
      ).json().catch(() => []);
      if (Array.isArray(emails)) {
        const hit =
          emails.find((e) => e.primary && e.verified) ||
          emails.find((e) => e.verified) ||
          emails.find((e) => e.primary);
        if (hit) email = hit.email;
      }
    }

    return finishSignIn(env, url, {
      sub: profile.id,
      provider: 'github',
      login: profile.login || '',
      name: profile.name || profile.login || '',
      avatar: profile.avatar_url || '',
      email,
    });
  }

  // --- finish the round trip (Google) ---------------------------------------
  if (path === '/api/auth/google/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    const expected = parseCookies(request)[OAUTH_STATE_COOKIE] || '';
    // Always drop the state cookie, either way, so it cannot be replayed.
    const clearState = cookie(OAUTH_STATE_COOKIE, '', { clear: true });

    if (url.searchParams.get('error')) {
      return redirect('/?auth=cancelled', { 'set-cookie': clearState });
    }
    if (!code || !expected || !timingSafeEqual(state, expected)) {
      return redirect('/?auth=failed', { 'set-cookie': clearState });
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
      return redirect('/?auth=failed', { 'set-cookie': clearState });
    }

    const info = await (
      await fetch(GOOGLE_USERINFO, { headers: { authorization: 'Bearer ' + token } })
    ).json().catch(() => null);

    // Google returns `sub` (stable numeric id) plus email_verified. Refuse an
    // unverified address: it is the identity key we merge accounts on, so an
    // unverified one could let someone claim another person's account.
    if (!info || !info.sub || !info.email || info.email_verified === false) {
      return redirect('/?auth=failed', { 'set-cookie': clearState });
    }

    return finishSignIn(env, url, {
      sub: info.sub,
      provider: 'google',
      login: (info.email || '').split('@')[0],
      name: info.name || info.email || '',
      avatar: info.picture || '',
      email: info.email,
    });
  }

  // --- sign out -------------------------------------------------------------
    // POST only: a GET would let any third-party page log the user out with a
    // plain <img src>, so the verb is enforced rather than merely documented.
    // (Handled above, ahead of the configured check.)

  return json(404, { ok: false, error: 'not_found' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (INTERNAL.some((rx) => rx.test(url.pathname))) {
      return new Response('Not found', { status: 404, headers: BASE_HEADERS });
    }
    if (url.pathname.startsWith('/api/auth/')) {
      return handleAuth(request, url, env);
    }
    if (url.pathname.startsWith('/downloads/')) {
      const key = decodeURIComponent(url.pathname.slice('/downloads/'.length));
      const obj = await env.DOWNLOADS.get(key);
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
      if (key.endsWith('.zip')) {
        headers.set('Content-Disposition', 'attachment; filename="' + key + '"');
      }
      return new Response(obj.body, { headers });
    }

    // Private area: the dashboard is only ever handed to a visitor holding a
    // valid signed session cookie. The page re-checks the session before it
    // renders, but gating here as well means an anonymous request never
    // receives the markup at all -- and `.html` is gated too, otherwise
    // /dashboard.html would be served straight from ASSETS and slip past it.
    if (url.pathname === '/dashboard' || url.pathname === '/dashboard.html' || url.pathname === '/dashboard/') {
      const session = env.SESSION_SECRET ? await readSession(request, env.SESSION_SECRET) : null;
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

    const res = await env.ASSETS.fetch(request);
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
