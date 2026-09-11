// Pages Advanced Mode worker: static site + /downloads/* proxy to R2.
// Rationale: Pages assets cap at 25 MiB/file; installer artifacts live in
// R2 bucket `voidscriptor-downloads` (APAC) and stream through here with
// an attachment disposition. Everything else is served from ASSETS.
// Internal/build files are never served: the deploy tree keeps provenance
// and wrangler config, but those are not public site content.
const INTERNAL = [
  /^\/wrangler\.toml$/,
  /^\/\.assetsignore$/,
  /^\/_prod_deployment_meta_.*\.json$/,
  /^\/\.wrangler\//,
];
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (INTERNAL.some((rx) => rx.test(url.pathname))) {
      return new Response('Not found', { status: 404 });
    }
    if (url.pathname.startsWith('/downloads/')) {
      const key = decodeURIComponent(url.pathname.slice('/downloads/'.length));
      const obj = await env.DOWNLOADS.get(key);
      if (obj === null) {
        return new Response('Download not found: ' + key, { status: 404 });
      }
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      if (key.endsWith('.zip')) {
        headers.set('Content-Disposition', 'attachment; filename="' + key + '"');
      }
      return new Response(obj.body, { headers });
    }
    return env.ASSETS.fetch(request);
  },
};
