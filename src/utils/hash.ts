import sharp from 'sharp';

export async function averageHash(buffer: Uint8Array, size = 32): Promise<string> {
  const img = sharp(buffer as any).removeAlpha().resize(size, size).greyscale();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const arr = new Uint8Array(data as any);
  const n = arr.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += arr[i];
  const mean = sum / n;
  let bits = '';
  for (let i = 0; i < n; i++) bits += arr[i] > mean ? '1' : '0';
  return bits;
}

export function hamming(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d + Math.abs(a.length - b.length);
}