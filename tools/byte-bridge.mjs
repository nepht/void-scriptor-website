import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.dirname(here);
const hermesHome = process.env.HERMES_HOME || path.join(process.env.LOCALAPPDATA || '', 'hermes');
const envFile = process.env.HERMES_ENV_FILE || path.join(hermesHome, '.env');
const fileEnv = {};

try {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([^#=]+)=(.*)$/.exec(line);
    if (match) fileEnv[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
} catch {
  // The process environment remains a valid configuration source.
}

const upstreamBase = (process.env.BYTE_UPSTREAM_BASE_URL || 'http://127.0.0.1:20128/v1').replace(/\/+$/, '');
const upstreamKey = process.env.BYTE_UPSTREAM_API_KEY || fileEnv.HERMES_CUSTOM_HERMES_API_KEY;
const port = Number(process.env.BYTE_BRIDGE_PORT || 8766);
const allowedOrigins = new Set([
  'https://voidscriptor.pages.dev',
  'http://127.0.0.1:8765',
  'http://localhost:8765',
]);

function corsHeaders(origin) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
  if (allowedOrigins.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
    headers['access-control-allow-headers'] = 'content-type';
    headers['access-control-allow-private-network'] = 'true';
  }
  return headers;
}

function send(res, status, body, origin) {
  res.writeHead(status, corsHeaders(origin));
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 128 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error('body_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  if (req.url !== '/v1/chat/completions') {
    send(res, 404, { ok: false, error: 'not_found' }, origin);
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    send(res, 405, { ok: false, error: 'method_not_allowed' }, origin);
    return;
  }
  if (!allowedOrigins.has(origin)) {
    send(res, 403, { ok: false, error: 'origin_not_allowed' }, origin);
    return;
  }
  if (!upstreamKey) {
    send(res, 503, { ok: false, error: 'hermes_key_not_found' }, origin);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    send(res, 400, { ok: false, error: error.message === 'body_too_large' ? error.message : 'invalid_json' }, origin);
    return;
  }
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    send(res, 400, { ok: false, error: 'messages_required' }, origin);
    return;
  }
  try {
    const upstream = await fetch(`${upstreamBase}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${upstreamKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: payload.model || 'free',
        messages: payload.messages,
        temperature: Number.isFinite(payload.temperature) ? payload.temperature : 0.7,
        max_tokens: Math.min(1000, Math.max(32, Number(payload.max_tokens) || 400)),
      }),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8' });
    res.end(text);
  } catch {
    send(res, 502, { ok: false, error: 'hermes_unreachable' }, origin);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Byte bridge listening on http://127.0.0.1:${port}`);
  console.log(`Upstream: ${upstreamBase}`);
});
