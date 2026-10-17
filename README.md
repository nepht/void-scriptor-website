# Void Scriptor Website

Official static website and Cloudflare Worker entry point for Void Scriptor.

## Requirements

- Node.js 22 or compatible current Node.js release
- npm
- Python 3 for an optional local static preview

## Local verification

From this directory:

```bash
npm ci --ignore-scripts
node --test test/*.mjs
git diff --check --exit-code
```

The test suite covers the published HTML contracts, Worker routes, localization, metadata, release metadata, responsive safeguards, and light-theme accessibility contracts.

To preview static pages locally:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

The plain static server does not execute `_worker.js` or `/api/*` routes. Treat it as a visual and asset preview only. Worker behavior is covered by the Node test suite and the deployed site must be checked separately.

## Repository layout

- `*.html`, `en/`, `docs/`: published page shells
- `assets/`: public artwork, styles, fonts, and proof assets
- `_worker.js`: Cloudflare Worker routing, API, headers, and asset policy
- `test/`: Node regression and contract tests
- `tools/`: release verification utilities
- `release-manifests/`: checksums for published release artifacts
- `downloads/`: versioned installer artifacts
- `.github/workflows/`: hosted integrity checks

## Release verification

The current installer and its SHA-256 manifest are linked from the download pages. Verify a downloaded installer locally with the command documented at `/docs/getting-started` and compare the result with the published manifest. The repository currently carries a self-issued Windows signature; that is not the same as public publisher trust or SmartScreen reputation.

Release promotion is separate from local verification: confirm the exact commit, run the local suite, inspect the artifact checksum, deploy only through the authorized Cloudflare path, and re-check the exact production URL afterward.

## Deployment note

Production is served from `https://voidscriptor.com`. The Pages deployment check and direct production probes are separate evidence from the local test suite. GitHub Actions may be unavailable if the repository account billing gate prevents a runner from starting; in that case report the hosted CI result as blocked rather than treating local tests as hosted CI evidence.
