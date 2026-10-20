import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('installer download surfaces preview status and SmartScreen warning beside the CTA', () => {
  for (const page of ['index.html', 'en/index.html']) {
    const source = fs.readFileSync(page, 'utf8');
    assert.match(source, /data-i18n="hero-cta"[^>]*>[^<]*(?:pratinjau|preview)/i);
    assert.match(source, /id="hero-release-warning"[^>]*role="note"/);
    assert.match(source, /data-i18n="hero-release-warning"[^>]*>[^<]*(?:bukti teknis dan checksum|technical evidence and checksum)/i);
  }

  const dashboard = fs.readFileSync('dashboard.html', 'utf8');
  assert.match(
    dashboard,
    /id="dashStudioDownload"[^>]*aria-describedby="dash-studio-release-warning"/,
    'dashboard installer CTA must point to its adjacent warning',
  );
  assert.match(
    dashboard,
    /id="dash-studio-release-warning"[^>]*role="note"[^>]*data-i18n="dash-studio-release-warning"/,
    'dashboard installer warning must be exposed as an accessible note',
  );
  assert.match(dashboard, /'dash-dl-studio':'(?:Unduh|Lihat status) (?:pratinjau|Studio)/);
  assert.match(dashboard, /'dash-studio-release-warning':'[^']*SmartScreen/);
});
