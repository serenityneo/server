import { analyzePhoto } from '../modules/kyc/services/analyzers';
import sharp from 'sharp';

async function makeSolidImage(width: number, height: number, color: { r: number; g: number; b: number }) {
  const buf = await sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
  return buf;
}

function expect(condition: boolean, msg: string) {
  if (!condition) {
    console.error('Test failed:', msg);
    process.exitCode = 1;
  }
}

async function testBlueLogoLikeBackground() {
  const img = await makeSolidImage(500, 500, { r: 0, g: 90, b: 200 });
  const res = await analyzePhoto(img, 'profile');
  console.log('Blue background result:', res);
  expect(!res.ok, 'Blue background should be rejected');
  const msgs = res.messages.join(' | ');
  expect(msgs.includes('Fond blanc requis'), 'Should complain about non-white background');
  expect(msgs.includes('Aucun visage détecté'), 'Should complain about missing face');
  const codes = ((res as any).stats?.codes || []) as string[];
  expect(codes.includes('BACKGROUND_NOT_WHITE'), 'Should include BACKGROUND_NOT_WHITE');
  expect(codes.includes('INVALID_FACE'), 'Should include INVALID_FACE');
}

async function testWhiteNoFace() {
  const img = await makeSolidImage(500, 500, { r: 255, g: 255, b: 255 });
  const res = await analyzePhoto(img, 'profile');
  console.log('White background result:', res);
  expect(!res.ok, 'White background without face should be rejected');
  const msgs = res.messages.join(' | ');
  expect(msgs.includes('Aucun visage détecté'), 'Should complain about missing face on white background');
  // Should not complain about non-white background
  expect(!msgs.includes('Fond blanc requis'), 'Should not complain about background when white');
}

async function testGreyNonWhite() {
  const img = await makeSolidImage(500, 500, { r: 150, g: 150, b: 150 });
  const res = await analyzePhoto(img, 'profile');
  console.log('Grey background result:', res);
  expect(!res.ok, 'Grey background without face should be rejected');
  const msgs = res.messages.join(' | ');
  expect(msgs.includes('Fond blanc requis'), 'Should complain about non-white background (grey)');
}

async function run() {
  await testBlueLogoLikeBackground();
  await testWhiteNoFace();
  await testGreyNonWhite();
  if (process.exitCode && process.exitCode !== 0) {
    console.error('Some tests failed.');
    process.exit(process.exitCode);
  } else {
    console.log('All photo validation tests passed.');
  }
}

run().catch((err) => {
  console.error('Test execution error:', err);
  process.exitCode = 1;
});