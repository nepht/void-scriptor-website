import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pages = [
  { path: 'index.html', proofAlt: 'Tangkapan layar nyata Void Scriptor Studio', byteOffline: 'Byte menampilkan Offline', retry: 'Coba lagi' },
  { path: 'en/index.html', proofAlt: 'Real Void Scriptor Studio screenshot', byteOffline: 'Byte shows Offline', retry: 'Try again' },
];

test('homepage keeps concrete product proof and honest status copy', () => {
  for (const page of pages) {
    const source = fs.readFileSync(page.path, 'utf8');
    assert.match(source, /class="proof-frame proof-frame--studio"/, `${page.path}: Studio proof frame missing`);
    assert.match(source, new RegExp(`alt="${page.proofAlt}`), `${page.path}: Studio proof alt text missing`);
    assert.match(source, /assets\/proof\/studio-dashboard\.webp/, `${page.path}: Studio proof asset missing`);
    assert.doesNotMatch(source, /id="creative-flow"/, `${page.path}: repeated creative-flow section returned`);
    assert.match(source, new RegExp(page.byteOffline), `${page.path}: Byte offline state is not explained`);
    assert.match(source, new RegExp(page.retry), `${page.path}: Byte retry action is not explained`);
    assert.match(source, /Baca bukti teknis dan checksum|Read the technical evidence and checksum/i, `${page.path}: RC signature warning missing`);
    assert.match(source, /Detail verifikasi|Verification details/, `${page.path}: verification details link missing`);
    assert.doesNotMatch(source, /prod-studio-plat[^\r\n]*?(?:tersedia kini|available now)/i, `${page.path}: Studio must not claim current availability`);
  }
});
