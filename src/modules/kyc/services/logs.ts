import fs from 'fs';
import path from 'path';

export type PhotoLog = {
  ts: string;
  file_name?: string;
  file_size?: number;
  image_format?: string;
  face_count?: number;
  face_position?: { cx: number; cy: number } | null;
  sharpness_score?: number; // blur variance
  brightness_score?: number; // mean luminance
  background_variance?: number; // border stdev
  rgb_balance_delta?: number;
  decision: 'accepted' | 'rejected' | 'needs_review';
  codes?: string[];
  suggestions?: string[];
};

function ensureDir(dir: string) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

export function appendPhotoLog(entry: PhotoLog) {
  try {
    const base = process.env.KYC_LOG_DIR || path.join(process.cwd(), 'logs');
    ensureDir(base);
    const file = path.join(base, 'kyc-photo.log');
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', { encoding: 'utf8' });
  } catch {}
}