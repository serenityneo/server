import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { registerValidateRoute } from '../modules/kyc/routes/validate';

async function makePng(width: number, height: number, color: { r: number; g: number; b: number }) {
  return await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

function buildMultipart(boundary: string, parts: Array<{ name: string; filename?: string; contentType?: string; data: Buffer }>) {
  const buffers: Buffer[] = [];
  const CRLF = '\r\n';
  for (const p of parts) {
    buffers.push(Buffer.from(`--${boundary}${CRLF}`));
    const cd = `Content-Disposition: form-data; name="${p.name}"` + (p.filename ? `; filename="${p.filename}"` : '');
    buffers.push(Buffer.from(cd + CRLF));
    if (p.contentType) buffers.push(Buffer.from(`Content-Type: ${p.contentType}${CRLF}`));
    buffers.push(Buffer.from(CRLF));
    buffers.push(p.data);
    buffers.push(Buffer.from(CRLF));
  }
  buffers.push(Buffer.from(`--${boundary}--${CRLF}`));
  return Buffer.concat(buffers);
}

async function testInvalidFormat() {
  const app = Fastify();
  await app.register(multipart);
  registerValidateRoute(app);
  await app.ready();

  const boundary = '----trae-test-boundary';
  const fakeGif = await makePng(500, 500, { r: 255, g: 255, b: 255 });
  const body = buildMultipart(boundary, [{ name: 'photo', filename: 'test.gif', contentType: 'image/gif', data: fakeGif }]);
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/validate',
    payload: body,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }
  });
  const code = res.statusCode;
  const payload = res.json();
  console.log('[testInvalidFormat]', code, payload);
  if (code !== 415) throw new Error('Expected 415 for unsupported media type');
  if (payload?.code !== 'UNSUPPORTED_MEDIA_TYPE') throw new Error('Expected code UNSUPPORTED_MEDIA_TYPE');
}

async function testMissingFile() {
  const app = Fastify();
  await app.register(multipart);
  registerValidateRoute(app);
  await app.ready();

  const boundary = '----trae-test-boundary';
  const body = buildMultipart(boundary, []);
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/validate',
    payload: body,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }
  });
  const code = res.statusCode;
  const payload = res.json();
  console.log('[testMissingFile]', code, payload);
  if (code !== 400) throw new Error('Expected 400 when no files provided');
  if (payload?.code !== 'MISSING_FILE') throw new Error('Expected code MISSING_FILE');
}

async function testInvalidDimensions() {
  const app = Fastify();
  await app.register(multipart);
  registerValidateRoute(app);
  await app.ready();

  const boundary = '----trae-test-boundary';
  const small = await makePng(100, 100, { r: 255, g: 255, b: 255 });
  const body = buildMultipart(boundary, [{ name: 'photo', filename: 'small.png', contentType: 'image/png', data: small }]);
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/validate',
    payload: body,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }
  });
  const code = res.statusCode;
  const payload = res.json();
  console.log('[testInvalidDimensions]', code, payload);
  if (code !== 400) throw new Error('Expected 400 for invalid dimensions');
  if (payload?.code !== 'INVALID_DIMENSIONS') throw new Error('Expected code INVALID_DIMENSIONS');
}

async function run() {
  try {
    await testInvalidFormat();
    await testMissingFile();
    await testInvalidDimensions();
    // Bonne photo passeport JPEG 600x600 ~213KB (qualité élevée)
    await (async function testGoodPassportJpeg600() {
      const app = Fastify();
      await app.register(multipart);
      registerValidateRoute(app);
      await app.ready();

      const boundary = '----trae-test-boundary';
      const jpeg600 = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .jpeg({ quality: 90 })
        .toBuffer();
      const body = buildMultipart(boundary, [
        { name: 'photo', filename: 'good.jpg', contentType: 'image/jpg', data: jpeg600 },
        { name: 'photoType', contentType: 'text/plain', data: Buffer.from('passport') }
      ]);
      const res = await app.inject({ method: 'POST', url: '/api/v1/validate', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
      const code = res.statusCode;
      const payload = res.json();
      console.log('[testGoodPassportJpeg600]', code, payload?.status, payload?.isValid);
      if (code !== 200) throw new Error('Expected 200 for valid JPEG 600x600');
      if (payload?.status === 'failed') throw new Error('Expected not failed for good passport JPEG');
    })();

    // PNG non conforme (paysage 2814x1404 ~2MB) doit être rejeté logiquement (status failed) sans 400
    await (async function testRejectPngLandscapeLarge() {
      const app = Fastify();
      await app.register(multipart);
      registerValidateRoute(app);
      await app.ready();

      const boundary = '----trae-test-boundary';
      const pngLarge = await sharp({ create: { width: 2814, height: 1404, channels: 3, background: { r: 220, g: 220, b: 220 } } })
        .png()
        .toBuffer();
      const body = buildMultipart(boundary, [
        { name: 'photo', filename: 'bad.png', contentType: 'image/png', data: pngLarge },
        { name: 'photoType', contentType: 'text/plain', data: Buffer.from('passport') }
      ]);
      const res = await app.inject({ method: 'POST', url: '/api/v1/validate', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
      const code = res.statusCode;
      const payload = res.json();
      console.log('[testRejectPngLandscapeLarge]', code, payload?.status, payload?.isValid, payload?.codes);
      if (code !== 200) throw new Error('Expected 200 (logical rejection without HTTP 400)');
      if (payload?.status !== 'failed') throw new Error('Expected status failed for non-compliant PNG landscape');
    })();

    // JPEG trop petit 400x400 ~53KB doit être flaggé/rejeté logiquement (status failed/flagged) et suggérer augmentation
    await (async function testFlagSmallJpeg400() {
      const app = Fastify();
      await app.register(multipart);
      registerValidateRoute(app);
      await app.ready();

      const boundary = '----trae-test-boundary';
      const jpeg400 = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 255, g: 255, b: 255 } } })
        .jpeg({ quality: 80 })
        .toBuffer();
      const body = buildMultipart(boundary, [
        { name: 'photo', filename: 'small.jpg', contentType: 'image/jpg', data: jpeg400 },
        { name: 'photoType', contentType: 'text/plain', data: Buffer.from('passport') }
      ]);
      const res = await app.inject({ method: 'POST', url: '/api/v1/validate', payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
      const code = res.statusCode;
      const payload = res.json();
      console.log('[testFlagSmallJpeg400]', code, payload?.status, payload?.suggestions);
      if (code !== 200) throw new Error('Expected 200 (logical rejection without HTTP 400)');
      if (payload?.status === 'ok') throw new Error('Expected not ok for 400x400 JPEG');
      const sugg = payload?.suggestions || [];
      if (!Array.isArray(sugg) || !sugg.some((s: string) => s.includes('600x600'))) {
        throw new Error('Expected suggestion to use at least 600x600');
      }
    })();
    console.log('All /validate endpoint tests passed.');
  } catch (e) {
    console.error('Test failed:', e);
    process.exitCode = 1;
  }
}

run();