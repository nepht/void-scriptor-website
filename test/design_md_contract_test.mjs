import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const IN_REPO_DESIGN_MD = resolve(process.cwd(), 'DESIGN.md');
const PARENT_DESIGN_MD = resolve(process.cwd(), '../DESIGN.md');
const LIGHT_CSS_PATH = resolve(process.cwd(), 'assets/light.css');

test('DESIGN.md contract: specification file exists in repo and project root', () => {
  assert.ok(existsSync(IN_REPO_DESIGN_MD), `DESIGN.md must exist in repo at ${IN_REPO_DESIGN_MD}`);
  assert.ok(existsSync(PARENT_DESIGN_MD), `DESIGN.md must exist at project root ${PARENT_DESIGN_MD}`);
});

test('DESIGN.md contract: frontmatter contains valid alpha schema and canonical sections', () => {
  const content = readFileSync(IN_REPO_DESIGN_MD, 'utf8');
  assert.match(content, /^---\r?\nversion:\s*alpha\b/m, 'must start with alpha version frontmatter');
  assert.match(content, /\bname:\s*Void Scriptor Light Cosmic\b/m, 'must declare design system name');

  // Check required sections in order
  const headings = [
    '## Overview',
    '## Colors',
    '## Typography',
    '## Layout',
    '## Elevation & Depth',
    '## Shapes',
    '## Components',
    "## Do's and Don'ts",
  ];

  let lastIndex = -1;
  for (const h of headings) {
    const idx = content.indexOf(h);
    assert.ok(idx > -1, `Missing canonical section: ${h}`);
    assert.ok(idx > lastIndex, `Section ${h} is out of canonical sequence`);
    lastIndex = idx;
  }
});

test('DESIGN.md contract: frontmatter colors sync with assets/light.css runtime tokens', () => {
  const mdContent = readFileSync(IN_REPO_DESIGN_MD, 'utf8');
  const cssContent = readFileSync(LIGHT_CSS_PATH, 'utf8');

  // Verify critical normative tokens are declared in both
  const tokenPairs = [
    { mdKey: 'primary', hex: '#0B1B2B', cssToken: '--ls-ink' },
    { mdKey: 'secondary', hex: '#41556B', cssToken: '--ls-muted' },
    { mdKey: 'tertiary', hex: '#6B4BD6', cssToken: '--ls-violet' },
    { mdKey: 'tertiary-deep', hex: '#5A3BC4', cssToken: '--ls-violet-deep' },
    { mdKey: 'tertiary-bright', hex: '#704CE6', cssToken: '--ls-violet-2' },
    { mdKey: 'violet-ink', hex: '#3F2AA8', cssToken: '--ls-violet-ink' },
    { mdKey: 'cyan', hex: '#0E8FB8', cssToken: '--ls-cyan' },
    { mdKey: 'cyan-label-ink', hex: '#006B84', cssToken: '--ls-cyan-label-ink' },
    { mdKey: 'success-ink', hex: '#075C3F', cssToken: '--ls-success-ink' },
    { mdKey: 'offline-ink', hex: '#7A3B12', cssToken: '--ls-offline-ink' },
    { mdKey: 'warning-ink', hex: '#704B08', cssToken: '--ls-warning-ink' },
    { mdKey: 'danger-ink', hex: '#8A2525', cssToken: '--ls-danger-ink' },
    { mdKey: 'carousel-arrow-ink', hex: '#31527A', cssToken: '--ls-carousel-arrow-ink' },
    { mdKey: 'report-warn-ink', hex: '#8A4A12', cssToken: '--ls-report-warn-ink' },
  ];

  for (const { mdKey, hex, cssToken } of tokenPairs) {
    const mdRegex = new RegExp(`^\\s*${mdKey}:\\s*["']?${hex}["']?`, 'im');
    assert.match(mdContent, mdRegex, `DESIGN.md must define color ${mdKey}: ${hex}`);

    const cssRegex = new RegExp(`${cssToken}\\s*:\\s*${hex}\\b`, 'i');
    assert.match(cssContent, cssRegex, `assets/light.css must declare ${cssToken}: ${hex}`);
  }
});

test('DESIGN.md contract: linter passes with 0 errors and 0 warnings', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const { stdout } = await execFileAsync(
    npxCmd,
    [
      '-y',
      '-p',
      '@google/design.md',
      'designmd',
      'lint',
      `"${IN_REPO_DESIGN_MD}"`,
      '--format=text',
    ],
    { shell: true }
  );

  const result = JSON.parse(stdout);
  assert.equal(result.summary.errors, 0, `designmd lint reported errors: ${JSON.stringify(result.findings)}`);
  assert.equal(result.summary.warnings, 0, `designmd lint reported warnings: ${JSON.stringify(result.findings)}`);
});

