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
const CSP_SITE = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
].join('; ');

// The /app/ bundle is a Flutter Web build (CanvasKit/skwasm). A strict CSP
// would break its WebAssembly compilation, and it is already gated behind
// Cloudflare Access, so it only receives the transport/anti-sniff headers.
function harden(res, pathname, isHtml) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) headers.set(k, v);
  if (isHtml && !pathname.startsWith('/app/')) {
    headers.set('content-security-policy', CSP_SITE);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (INTERNAL.some((rx) => rx.test(url.pathname))) {
      return new Response('Not found', { status: 404, headers: BASE_HEADERS });
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
