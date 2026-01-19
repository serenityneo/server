import sharp from 'sharp';

export async function normalizeProfilePhoto(buffer: Buffer, size = 500): Promise<{ buffer: Buffer; normalized: boolean; original: { width: number; height: number } }> {
  const img = sharp(buffer).removeAlpha();
  const meta = await img.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  const side = Math.min(w, h);
  if (side === 0) return { buffer, normalized: false, original: { width: w, height: h } };
  const left = Math.floor((w - side) / 2);
  const top = Math.floor((h - side) / 2);
  const sq = await img.extract({ left, top, width: side, height: side }).resize(size, size).toBuffer();
  return { buffer: sq, normalized: true, original: { width: w, height: h } };
}

export async function autoCropDocument(buffer: Buffer, tolerance = 10): Promise<{ buffer: Buffer; cropped: boolean }> {
  try {
    // sharp.trim recadre en supprimant les bordures uniformes (ex: grandes marges blanches A4)
    // Les types de sharp attendent un objet TrimOptions; on fournit threshold.
    const out = await sharp(buffer).trim({ threshold: tolerance }).toBuffer();
    return { buffer: out, cropped: true };
  } catch {
    return { buffer, cropped: false };
  }
}