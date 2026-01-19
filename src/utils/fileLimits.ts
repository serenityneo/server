/**
 * Définition centralisée des limites de taille et dimensions des fichiers KYC.
 * Valeurs par défaut raisonnables avec surcharge via variables d'environnement.
 */

export interface FileSizeLimits {
  minBytes: number;
  maxBytes: number;
}

export interface ImageDimensionLimits {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

const envInt = (name: string, def: number): number => {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

export const FILE_SIZE_LIMITS: FileSizeLimits = {
  minBytes: envInt('KYC_FILE_MIN_SIZE_BYTES', 30 * 1024), // 30KB min (tolérant pour photos compressées, mais suffisant pour qualité)
  maxBytes: envInt('KYC_FILE_MAX_SIZE_BYTES', 10 * 1024 * 1024), // 10MB max
};

export const IMAGE_DIM_LIMITS: ImageDimensionLimits = {
  minWidth: envInt('KYC_IMG_MIN_WIDTH', 200),
  minHeight: envInt('KYC_IMG_MIN_HEIGHT', 200),
  maxWidth: envInt('KYC_IMG_MAX_WIDTH', 8000),
  maxHeight: envInt('KYC_IMG_MAX_HEIGHT', 8000),
};

export function validateBufferSize(bytes: number): { ok: boolean; error?: string } {
  if (bytes < FILE_SIZE_LIMITS.minBytes) {
    return { ok: false, error: `Taille trop petite: ${bytes}B < min ${FILE_SIZE_LIMITS.minBytes}B` };
  }
  if (bytes > FILE_SIZE_LIMITS.maxBytes) {
    return { ok: false, error: `Taille trop grande: ${bytes}B > max ${FILE_SIZE_LIMITS.maxBytes}B` };
  }
  return { ok: true };
}

export function validateImageDimensions(w: number, h: number): { ok: boolean; error?: string } {
  if (w < IMAGE_DIM_LIMITS.minWidth || h < IMAGE_DIM_LIMITS.minHeight) {
    return { ok: false, error: `Dimensions trop petites: ${w}x${h} < min ${IMAGE_DIM_LIMITS.minWidth}x${IMAGE_DIM_LIMITS.minHeight}` };
  }
  if (w > IMAGE_DIM_LIMITS.maxWidth || h > IMAGE_DIM_LIMITS.maxHeight) {
    return { ok: false, error: `Dimensions trop grandes: ${w}x${h} > max ${IMAGE_DIM_LIMITS.maxWidth}x${IMAGE_DIM_LIMITS.maxHeight}` };
  }
  return { ok: true };
}