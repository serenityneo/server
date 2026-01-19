import crypto from 'crypto';

export function sha256(buffer: Buffer): string {
  const h = crypto.createHash('sha256');
  h.update(buffer);
  return h.digest('hex');
}