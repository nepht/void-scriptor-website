import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const pages = [
  {
    path: 'qowner.html',
    mobileOnly: 'Akses web tidak disediakan',
    waitlist: '/quiz#qownerWaitlistForm',
    unavailable: 'MOBILE-ONLY',
  },
  {
    path: 'en/qowner.html',
    mobileOnly: 'Web access is not provided',
    waitlist: '/en/quiz#qownerWaitlistForm',
    unavailable: 'MOBILE-ONLY',
  },
  {
    path: 'quiz.html',
    mobileOnly: 'QOWNER hanya tersedia sebagai aplikasi mobile',
    waitlist: '#qownerWaitlistForm',
    unavailable: 'Web · Tidak disediakan',
  },
  {
    path: 'en/quiz.html',
    mobileOnly: 'QOWNER is available only as a mobile app',
    waitlist: '#qownerWaitlistForm',
    unavailable: 'Web · Not provided',
  },
  {
    path: 'products.html',
    mobileOnly: 'akses web tidak disediakan',
    waitlist: 'Minat rilis mobile',
    unavailable: 'MOBILE-ONLY',
  },
  {
    path: 'en/products.html',
    mobileOnly: 'web access is not provided',
    waitlist: 'Register mobile interest',
    unavailable: 'MOBILE-ONLY',
  },
  {
    path: 'help.html',
    mobileOnly: 'Akses web tidak disediakan',
    waitlist: '/quiz#qownerWaitlistForm',
    unavailable: 'QOWNER ditujukan untuk perangkat mobile',
  },
  {
    path: 'en/help.html',
    mobileOnly: 'Web access is not provided',
    waitlist: '/en/quiz#qownerWaitlistForm',
    unavailable: 'QOWNER is intended for mobile devices',
  },
];

const staleWebClaims = /versi web bisa dimainkan|the web version is playable|Mainkan QOWNER \(Web\)|Play QOWNER \(Web\)|Web · Tersedia sekarang|Web · Available now/i;

test('QOWNER public copy stays mobile-only in every locale and surface', () => {
  for (const page of pages) {
    const source = fs.readFileSync(page.path, 'utf8');
    assert.match(source, new RegExp(page.mobileOnly), `${page.path}: mobile-only statement missing`);
    assert.match(source, new RegExp(page.waitlist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${page.path}: mobile release destination missing`);
    assert.match(source, new RegExp(page.unavailable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${page.path}: unavailable/mobile-only marker missing`);
    assert.doesNotMatch(source, staleWebClaims, `${page.path}: stale web-play claim remains`);
  }
});
