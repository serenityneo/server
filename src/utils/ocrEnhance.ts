import sharp from 'sharp';

/**
 * Rend l'image plus propice à l'OCR:
 * - supprime l'alpha, passe en niveaux de gris
 * - normalise, augmente légèrement le contraste
 * - applique une légère réduction de bruit
 */
export async function enhanceForOCR(buffer: Buffer): Promise<Buffer> {
  try {
    const img = sharp(buffer)
      .removeAlpha()
      .greyscale()
      .normalize()
      .gamma(1.1)
      .linear(1.2, -10) // contraste
      .median(3);
    return await img.toBuffer();
  } catch {
    return buffer;
  }
}