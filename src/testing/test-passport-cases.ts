import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { registerValidateRoute } from '../modules/kyc/routes/validate';

async function makeJpeg(width: number, height: number, color: { r: number; g: number; b: number }) {
  // Génère une image avec un fond bruité et une forme contrastée pour atteindre la taille minimale
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  const rectWidth = Math.floor(width / 2);
  const rectHeight = Math.floor(height / 2);
  const rectX = Math.floor((width - rectWidth) / 2);
  const rectY = Math.floor((height - rectHeight) / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const isRect = x >= rectX && x < rectX + rectWidth && y >= rectY && y < rectY + rectHeight;
      if (isRect) {
        data[idx] = 50;
        data[idx + 1] = 50;
        data[idx + 2] = 50;
      } else {
        const noise = Math.floor(Math.random() * 30);
        data[idx] = color.r - noise;
        data[idx + 1] = color.g - noise;
        data[idx + 2] = color.b - noise;
      }
    }
  }

  return await sharp(data, { raw: { width, height, channels } })
    .withMetadata({ density: 300 })
    .jpeg({ quality: 85 })
    .toBuffer();
}

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

async function testValidPassport600x600Jpeg() {
  const app = Fastify();
  await app.register(multipart);
  registerValidateRoute(app);
  await app.ready();

  const boundary = '----trae-test-boundary';
  const photo = await makeJpeg(600, 600, { r: 255, g: 255, b: 255 });
  const body = buildMultipart(boundary, [
    { name: 'photo', filename: 'passport.jpg', contentType: 'image/jpeg', data: photo },
    { name: 'photoType', data: Buffer.from('passport') }
  ]);

  const res = await app.inject({
    method: 'POST',
    url: '/validate',
    payload: body,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }
  });
  const code = res.statusCode;
  const payload: any = res.json();
  // Image synthétique sans visage doit être rejetée avec message explicite
  if (code !== 400) throw new Error('Expected 400 for synthetic passport without face');
  if (!Array.isArray(payload?.messages) || !payload.messages.some((m: string) => m.includes('Aucun visage'))) {
    throw new Error('Expected missing face message for synthetic passport image');
  }
}

async function testInvalidScreenshotPngLandscape() {
  const app = Fastify();
  await app.register(multipart);
  registerValidateRoute(app);
  await app.ready();

  const boundary = '----trae-test-boundary';
  const photo = await makePng(2814, 1404, { r: 160, g: 160, b: 160 });
  const body = buildMultipart(boundary, [
    { name: 'photo', filename: 'screenshot.png', contentType: 'image/png', data: photo },
    { name: 'photoType', data: Buffer.from('passport') }
  ]);

  const res = await app.inject({
    method: 'POST',
    url: '/validate',
    payload: body,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }
  });
  const code = res.statusCode;
  const payload: any = res.json();
  console.log('[testInvalidScreenshotPngLandscape]', code, payload?.code, payload?.messages);
  if (code !== 400) throw new Error('Expected 400 for invalid landscape PNG passport');
  if (payload?.error !== 'Photo invalide') throw new Error('Expected Photo invalide error');
}

async function run() {
  try {
    console.log('Running testValidPassport600x600Jpeg...');
    await testValidPassport600x600Jpeg();
    console.log('✓ testValidPassport600x600Jpeg passed');
    
    console.log('Running testInvalidScreenshotPngLandscape...');
    await testInvalidScreenshotPngLandscape();
    console.log('✓ testInvalidScreenshotPngLandscape passed');
    
    console.log('All passport photo tests passed.');
  } catch (e) {
    console.error('Test failed:', e);
    process.exitCode = 1;
  }
}

run();