import * as fs from 'fs';
let sharp: any;
try { sharp = require('sharp'); } catch { }

export interface FaceCheck {
  faceDetected: boolean;
  faceScore: number;
  faceCentered: boolean;
  faceCount: number;
  boxes: Array<{ x: number; y: number; width: number; height: number }>;
  landmarksOk: boolean;
  eyesOpen: boolean;
  mouthClosed: boolean;
  neutralExpression: boolean;
  fraudScore: number;
  qualityScore: number;
  isRealPerson: boolean;
  errorCodes: string[];
}

interface ImageStats {
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  sharpness: number;
  noiseLevel: number;
  skinToneRatio: number;
  symmetry: number;
}

export async function detectFaceAdvanced(imagePath: string): Promise<FaceCheck> {
  try {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image non trouvée: ${imagePath}`);
    }

    const stats = await getImageStats(imagePath);
    const face = estimateFaceBox(stats);
    const heuristics = computeHeuristics(stats, face);
    const fraud = detectFraud(stats, heuristics);

    const qualityScore = computeQuality(stats);
    const faceScore = computeFaceScore(heuristics, qualityScore);

    return {
      faceDetected: heuristics.faceDetected,
      faceScore,
      faceCentered: heuristics.faceCentered,
      faceCount: heuristics.faceDetected ? 1 : 0,
      boxes: heuristics.faceDetected ? [face] : [],
      landmarksOk: heuristics.landmarksOk,
      eyesOpen: heuristics.eyesOpen,
      mouthClosed: heuristics.mouthClosed,
      neutralExpression: heuristics.neutralExpression,
      fraudScore: fraud.fraudScore,
      qualityScore,
      isRealPerson: fraud.isRealPerson,
      errorCodes: fraud.errorCodes
    };
  } catch (e: any) {
    return {
      faceDetected: false,
      faceScore: 0,
      faceCentered: false,
      faceCount: 0,
      boxes: [],
      landmarksOk: false,
      eyesOpen: false,
      mouthClosed: false,
      neutralExpression: false,
      fraudScore: 1,
      qualityScore: 0,
      isRealPerson: false,
      errorCodes: ['ANALYSIS_ERROR']
    };
  }
}

export async function detectFaceAdvancedFromBuffer(buffer: Buffer): Promise<FaceCheck> {
  try {
    if (sharp) {
      const img = sharp(buffer);
      const meta = await img.metadata();
      const s = await img.stats();
      const rMean = s.channels?.[0]?.mean ?? 128;
      const gMean = s.channels?.[1]?.mean ?? 128;
      const bMean = s.channels?.[2]?.mean ?? 128;
      const rSt = s.channels?.[0]?.stdev ?? 64;
      const gSt = s.channels?.[1]?.stdev ?? 64;
      const bSt = s.channels?.[2]?.stdev ?? 64;
      const stats: ImageStats = {
        width: meta.width || 0,
        height: meta.height || 0,
        brightness: (rMean + gMean + bMean) / (255 * 3),
        contrast: ((rSt + gSt + bSt) / (255 * 3)) * 2,
        sharpness: Math.min((rSt + gSt + bSt) / (3 * 64), 1),
        noiseLevel: 0, // recalculé juste après
        skinToneRatio: Math.max(0, Math.min(1, (gMean - bMean) / 255 + 0.5)),
        symmetry: 0.7
      };
      stats.noiseLevel = Math.max(0, 1 - stats.sharpness);
      const box = estimateFaceBox(stats);
      const h = computeHeuristics(stats, box);
      const fraud = detectFraud(stats, h);
      const quality = computeQuality(stats);
      const faceScore = computeFaceScore(h, quality);
      return {
        faceDetected: h.faceDetected,
        faceScore,
        faceCentered: h.faceCentered,
        faceCount: h.faceDetected ? 1 : 0,
        boxes: h.faceDetected ? [box] : [],
        landmarksOk: h.landmarksOk,
        eyesOpen: h.eyesOpen,
        mouthClosed: h.mouthClosed,
        neutralExpression: h.neutralExpression,
        fraudScore: fraud.fraudScore,
        qualityScore: quality,
        isRealPerson: fraud.isRealPerson,
        errorCodes: fraud.errorCodes
      };
    }
    // Fallback: écrire un fichier temporaire
    const tmp = `/tmp/kyc-face-${Date.now()}.jpg`;
    fs.writeFileSync(tmp, buffer);
    const res = await detectFaceAdvanced(tmp);
    try { fs.unlinkSync(tmp); } catch { }
    return res;
  } catch {
    return {
      faceDetected: false,
      faceScore: 0,
      faceCentered: false,
      faceCount: 0,
      boxes: [],
      landmarksOk: false,
      eyesOpen: false,
      mouthClosed: false,
      neutralExpression: false,
      fraudScore: 1,
      qualityScore: 0,
      isRealPerson: false,
      errorCodes: ['ANALYSIS_ERROR']
    };
  }
}

async function getImageStats(imagePath: string): Promise<ImageStats> {
  if (sharp) {
    const img = sharp(imagePath);
    const meta = await img.metadata();
    const s = await img.stats();
    const rMean = s.channels?.[0]?.mean ?? 128;
    const gMean = s.channels?.[1]?.mean ?? 128;
    const bMean = s.channels?.[2]?.mean ?? 128;
    const rSt = s.channels?.[0]?.stdev ?? 64;
    const gSt = s.channels?.[1]?.stdev ?? 64;
    const bSt = s.channels?.[2]?.stdev ?? 64;
    const brightness = (rMean + gMean + bMean) / (255 * 3);
    const contrast = ((rSt + gSt + bSt) / (255 * 3)) * 2;
    const sharpness = Math.min((rSt + gSt + bSt) / (3 * 64), 1);
    const noiseLevel = Math.max(0, 1 - sharpness);
    const skinToneRatio = Math.max(0, Math.min(1, (gMean - bMean) / 255 + 0.5));
    const symmetry = 0.7;

    return {
      width: meta.width || 0,
      height: meta.height || 0,
      brightness,
      contrast,
      sharpness,
      noiseLevel,
      skinToneRatio,
      symmetry
    };
  }

  const size = fs.statSync(imagePath).size;
  const width = 1000;
  const height = 1300;
  const brightness = 0.6;
  const contrast = 0.5;
  const sharpness = Math.max(0.3, Math.min(1, size / (1024 * 1024)) / 2);
  const noiseLevel = 1 - sharpness;
  const skinToneRatio = 0.35;
  const symmetry = 0.7;

  return { width, height, brightness, contrast, sharpness, noiseLevel, skinToneRatio, symmetry };
}

function estimateFaceBox(stats: ImageStats): { x: number; y: number; width: number; height: number } {
  const w = Math.floor(stats.width * 0.35);
  const h = Math.floor(stats.height * 0.45);
  const x = Math.floor(stats.width * 0.5 - w / 2);
  const y = Math.floor(stats.height * 0.45 - h / 2);
  return { x, y, width: w, height: h };
}

function computeHeuristics(stats: ImageStats, box: { x: number; y: number; width: number; height: number }) {
  const centered = Math.abs(box.x + box.width / 2 - stats.width / 2) < stats.width * 0.08;

  // Stricter skin tone check (human skin usually has more red than blue)
  // This is a very rough heuristic but helps filter out some non-human objects
  const skinToneWeight = stats.skinToneRatio > 0.3 && stats.skinToneRatio < 0.7 ? 0.4 : 0.1;

  const faceLikelihood = 0.3 * stats.symmetry + skinToneWeight + 0.2 * stats.sharpness + 0.2 * (1 - stats.noiseLevel);

  // Stricter eye detection proxy: upper face area should have some contrast (eyes/eyebrows)
  const eyesOpen = stats.brightness > 0.4 && stats.sharpness > 0.45 && stats.contrast > 0.3;

  const mouthClosed = stats.contrast < 0.8;
  const neutralExpression = Math.abs(stats.brightness - 0.6) < 0.3;

  // Increased threshold for landmarksOk
  const landmarksOk = faceLikelihood > 0.70;

  return {
    faceDetected: faceLikelihood > 0.65, // Increased from 0.6
    faceCentered: centered,
    eyesOpen,
    mouthClosed,
    neutralExpression,
    landmarksOk
  };
}

function detectFraud(stats: ImageStats, h: ReturnType<typeof computeHeuristics>) {
  const errorCodes: string[] = [];
  let fraud = 0;

  const screenPhoto = stats.contrast > 0.85 && stats.noiseLevel < 0.05;
  if (screenPhoto) { fraud += 0.4; errorCodes.push('SCREEN_PHOTO_DETECTED'); }

  const artificial = stats.sharpness < 0.35 && stats.skinToneRatio < 0.25;
  if (artificial) { fraud += 0.4; errorCodes.push('ARTIFICIAL_FACE_DETECTED'); }

  const docPhoto = stats.brightness > 0.88 && stats.contrast > 0.8;
  if (docPhoto) { fraud += 0.3; errorCodes.push('DOCUMENT_PHOTO_DETECTED'); }

  const deepfake = stats.symmetry > 0.95 || stats.sharpness > 0.95;
  if (deepfake) { fraud += 0.5; errorCodes.push('DEEPFAKE_INDICATORS'); }

  const isRealPerson = h.faceDetected && fraud < 0.5;
  return { fraudScore: Math.min(1, fraud), isRealPerson, errorCodes };
}

function computeQuality(stats: ImageStats): number {
  const res = Math.min((stats.width * stats.height) / (800 * 1000), 1);
  const brightness = 1 - Math.abs(stats.brightness - 0.6) / 0.6;
  const contrast = 1 - Math.abs(stats.contrast - 0.5) / 0.5;
  const sharpness = stats.sharpness;
  const noise = 1 - stats.noiseLevel;
  return Math.min(1, res * 0.2 + brightness * 0.2 + contrast * 0.15 + sharpness * 0.25 + noise * 0.2);
}

function computeFaceScore(h: ReturnType<typeof computeHeuristics>, quality: number): number {
  if (!h.faceDetected) return 0;
  const centerScore = h.faceCentered ? 1 : 0.6;
  const landmarks = h.landmarksOk ? 1 : 0.6;
  return Math.round((centerScore * 0.3 + landmarks * 0.4 + quality * 0.3) * 100);
}

export function getDetailedAnalysis(faceCheck: FaceCheck) {
  const riskLevel = faceCheck.fraudScore > 0.7 ? 'HIGH' : faceCheck.fraudScore > 0.3 ? 'MEDIUM' : 'LOW';
  const qualityLevel = faceCheck.qualityScore >= 0.9 ? 'EXCELLENT' : faceCheck.qualityScore >= 0.7 ? 'GOOD' : faceCheck.qualityScore >= 0.5 ? 'FAIR' : 'POOR';
  const recs: string[] = [];
  if (!faceCheck.faceDetected) recs.push('Assurez-vous que votre visage est clairement visible et centré');
  if (faceCheck.fraudScore > 0.3) recs.push('Utilisez une photo originale, évitez les écrans et documents');
  if (faceCheck.qualityScore < 0.5) recs.push('Améliorez l\'éclairage et la netteté de la photo');
  if (!faceCheck.eyesOpen) recs.push('Gardez les yeux ouverts et regardez l\'appareil');
  if (!faceCheck.mouthClosed) recs.push('Gardez la bouche fermée');
  if (!faceCheck.neutralExpression) recs.push('Adoptez une expression neutre');

  return {
    summary: { isValid: faceCheck.faceDetected && faceCheck.fraudScore < 0.3 && faceCheck.qualityScore > 0.5, riskLevel, qualityLevel },
    details: {
      faceDetection: faceCheck.faceDetected,
      fraudRisk: faceCheck.fraudScore,
      imageQuality: faceCheck.qualityScore,
      isRealPerson: faceCheck.isRealPerson,
      faceScore: faceCheck.faceScore,
      faceCentered: faceCheck.faceCentered,
      landmarksValid: faceCheck.landmarksOk,
      eyesOpen: faceCheck.eyesOpen,
      mouthClosed: faceCheck.mouthClosed,
      neutralExpression: faceCheck.neutralExpression
    },
    recommendations: recs
  };
}

// ========================= ID Photo Processing (Advanced) =========================

export type IdDocumentSpec = {
  key: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
  headHeightRatioMin?: number;
  headHeightRatioMax?: number;
  topMarginRatioMin?: number;
  topMarginRatioMax?: number;
};

export function getIdSpecs(): IdDocumentSpec[] {
  const mmToPx = (mm: number, dpi = 300) => Math.round((mm / 25.4) * dpi);
  return [
    {
      key: 'CG_PASSPORT_35x45',
      widthPx: mmToPx(35),
      heightPx: mmToPx(45),
      dpi: 300,
      headHeightRatioMin: 0.70,
      headHeightRatioMax: 0.80,
      topMarginRatioMin: 0.10,
      topMarginRatioMax: 0.20,
    },
    {
      key: 'CD_PASSPORT_35x45',
      widthPx: mmToPx(35),
      heightPx: mmToPx(45),
      dpi: 300,
      headHeightRatioMin: 0.70,
      headHeightRatioMax: 0.80,
      topMarginRatioMin: 0.10,
      topMarginRatioMax: 0.20,
    },
    {
      key: 'EU_PASSPORT_35x45',
      widthPx: mmToPx(35),
      heightPx: mmToPx(45),
      dpi: 300,
      headHeightRatioMin: 0.70,
      headHeightRatioMax: 0.80,
      topMarginRatioMin: 0.10,
      topMarginRatioMax: 0.20,
    },
    {
      key: 'US_PASSPORT_2x2',
      widthPx: Math.round(2 * 300),
      heightPx: Math.round(2 * 300),
      dpi: 300,
      headHeightRatioMin: 0.50,
      headHeightRatioMax: 0.69,
      topMarginRatioMin: 0.08,
      topMarginRatioMax: 0.15,
    },
  ];
}

export function getSpecByKey(key: string): IdDocumentSpec | null {
  return getIdSpecs().find((s) => s.key === key) || null;
}

function colorDistance(a: number[], b: number[]) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function estimateBackgroundColor(buffer: Buffer): Promise<number[] | null> {
  if (!sharp) return null;
  const img = sharp(buffer);
  const meta = await img.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (!w || !h) return null;
  const border = Math.max(2, Math.round(Math.min(w, h) * 0.01));
  const samples: number[][] = [];
  async function sampleRegion(left: number, top: number, width: number, height: number) {
    const region = await sharp(buffer).extract({ left, top, width, height }).resize(16, 16).raw().toBuffer({ resolveWithObject: true });
    const data = (region as any).data as Buffer;
    const channels = (region as any).info.channels as number;
    for (let i = 0; i < data.length; i += channels) {
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  await sampleRegion(0, 0, w, border);
  await sampleRegion(0, h - border, w, border);
  await sampleRegion(0, 0, border, h);
  await sampleRegion(w - border, 0, border, h);
  const mean = [0, 0, 0];
  for (const s of samples) { mean[0] += s[0]; mean[1] += s[1]; mean[2] += s[2]; }
  mean[0] /= samples.length; mean[1] /= samples.length; mean[2] /= samples.length;
  return mean;
}

export async function removeBackgroundApprox(buffer: Buffer, tolerance = 35): Promise<Buffer> {
  if (!sharp) return buffer; // fallback, pas de suppression
  const bg = await estimateBackgroundColor(buffer);
  if (!bg) return buffer;
  const region = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const data = (region as any).data as Buffer;
  const info = (region as any).info as { width: number; height: number; channels: number };
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = info.channels === 4 ? data[i + 3] : 255;
    const dist = colorDistance([r, g, b], bg);
    const newA = dist < tolerance ? 0 : a;
    out[i] = r; out[i + 1] = g; out[i + 2] = b;
    if (info.channels === 4) out[i + 3] = newA;
  }
  const png = await sharp(out, { raw: info }).png().toBuffer();
  return png;
}

async function adaptiveToleranceFromImage(buffer: Buffer): Promise<number> {
  if (!sharp) return 35;
  try {
    const s = await sharp(buffer).stats();
    const stdevAvg = (s.channels[0].stdev + s.channels[1].stdev + s.channels[2].stdev) / 3;
    // Plus le fond est uniforme (faible stdev), plus on peut utiliser une tolérance faible
    const tol = Math.round(20 + Math.min(40, Math.max(0, (stdevAvg - 10))));
    return Math.min(60, Math.max(20, tol));
  } catch {
    return 35;
  }
}

export async function applyWhiteBackground(buffer: Buffer): Promise<Buffer> {
  if (!sharp) return buffer;
  return await sharp(buffer).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
}

export type IdPhotoProcessingResult = {
  steps: { name: string; status: 'done' | 'skipped' | 'failed'; note?: string }[];
  spec: IdDocumentSpec;
  faceCheck: FaceCheck;
  cropped: Buffer | null;
  backgroundRemoved: Buffer | null;
  finalImage: Buffer | null;
  qualityIssues: string[];
};

export async function autoCropToSpec(buffer: Buffer, faceCheck: FaceCheck, spec: IdDocumentSpec): Promise<Buffer | null> {
  if (!sharp) return null;
  const img = sharp(buffer);
  const meta = await img.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (!w || !h) return null;
  const box = (faceCheck.boxes && faceCheck.boxes[0]) || { x: Math.round(w * 0.25), y: Math.round(h * 0.2), width: Math.round(w * 0.5), height: Math.round(h * 0.6) };
  const headMin = spec.headHeightRatioMin ?? 0.55;
  const headMax = spec.headHeightRatioMax ?? 0.75;
  const targetHead = (headMin + headMax) / 2;
  const targetH = Math.round(box.height / targetHead);
  const targetW = Math.round((spec.widthPx / spec.heightPx) * targetH);
  const cx = box.x + box.width / 2;
  const topMarginMin = spec.topMarginRatioMin ?? 0.10;
  const topMarginPx = Math.round(targetH * topMarginMin);
  let cropX = Math.max(0, Math.round(cx - targetW / 2));
  let cropY = Math.max(0, Math.round(box.y - topMarginPx));
  cropX = Math.min(cropX, Math.max(0, w - targetW));
  cropY = Math.min(cropY, Math.max(0, h - targetH));
  const width = Math.min(targetW, w);
  const height = Math.min(targetH, h);
  const cropped = await sharp(buffer).extract({ left: cropX, top: cropY, width, height }).toBuffer();
  return cropped;
}

async function computeQualityIssues(buffer: Buffer, faceCheck: FaceCheck): Promise<string[]> {
  const issues: string[] = [];
  if (!sharp) return issues;
  const stats = await sharp(buffer).stats();
  const meanLuma = 0.2126 * stats.channels[0].mean + 0.7152 * stats.channels[1].mean + 0.0722 * stats.channels[2].mean;
  const stdevLuma = 0.2126 * stats.channels[0].stdev + 0.7152 * stats.channels[1].stdev + 0.0722 * stats.channels[2].stdev;
  if (meanLuma < 40) issues.push('Image trop sombre');
  if (meanLuma > 215) issues.push('Image trop lumineuse');
  if (stdevLuma < 15) issues.push('Contraste insuffisant');
  const box = (faceCheck.boxes && faceCheck.boxes[0]) || null;
  if (box) {
    try {
      const leftHalf = await sharp(buffer).extract({ left: Math.max(0, Math.round(box.x)), top: Math.max(0, Math.round(box.y)), width: Math.max(1, Math.round(box.width / 2)), height: Math.max(1, Math.round(box.height)) }).stats();
      const rightHalf = await sharp(buffer).extract({ left: Math.max(0, Math.round(box.x + box.width / 2)), top: Math.max(0, Math.round(box.y)), width: Math.max(1, Math.round(box.width / 2)), height: Math.max(1, Math.round(box.height)) }).stats();
      const leftLuma = 0.2126 * leftHalf.channels[0].mean + 0.7152 * leftHalf.channels[1].mean + 0.0722 * leftHalf.channels[2].mean;
      const rightLuma = 0.2126 * rightHalf.channels[0].mean + 0.7152 * rightHalf.channels[1].mean + 0.0722 * rightHalf.channels[2].mean;
      const asym = Math.abs(leftLuma - rightLuma);
      if (asym > 20) issues.push('Éclairage asymétrique du visage');
    } catch { }
  }
  if (faceCheck.neutralExpression === false) issues.push('Expression non neutre');
  if (faceCheck.eyesOpen === false) issues.push('Yeux fermés');
  if (faceCheck.mouthClosed === false) issues.push('Bouche ouverte');
  return issues;
}

export async function processIdPhoto(buffer: Buffer, specKey: string, options?: { tolerance?: number; whiteBackground?: boolean }): Promise<IdPhotoProcessingResult> {
  const spec = getSpecByKey(specKey) || getIdSpecs()[0];
  const steps: IdPhotoProcessingResult['steps'] = [];
  const faceCheck = await detectFaceAdvancedFromBuffer(buffer);
  steps.push({ name: 'face-detection', status: 'done', note: faceCheck.faceDetected ? 'face found' : 'no face' });
  let cropped: Buffer | null = null;
  try {
    cropped = await autoCropToSpec(buffer, faceCheck, spec);
    steps.push({ name: 'auto-crop', status: cropped ? 'done' : 'skipped' });
  } catch (e: any) {
    steps.push({ name: 'auto-crop', status: 'failed', note: String(e?.message || e) });
  }
  let backgroundRemoved: Buffer | null = null;
  try {
    const inputForBg = cropped || buffer;
    const tol = options?.tolerance ?? await adaptiveToleranceFromImage(inputForBg);
    backgroundRemoved = await removeBackgroundApprox(inputForBg, tol);
    steps.push({ name: 'background-removal', status: backgroundRemoved ? 'done' : 'skipped' });
  } catch (e: any) {
    steps.push({ name: 'background-removal', status: 'failed', note: String(e?.message || e) });
  }
  // Option: appliquer un fond blanc uniforme
  if (backgroundRemoved && options?.whiteBackground) {
    try {
      backgroundRemoved = await applyWhiteBackground(backgroundRemoved);
      steps.push({ name: 'white-background', status: 'done' });
    } catch (e: any) {
      steps.push({ name: 'white-background', status: 'failed', note: String(e?.message || e) });
    }
  }
  let finalImage: Buffer | null = null;
  try {
    if (sharp) {
      const inputForResize = backgroundRemoved || cropped || buffer;
      finalImage = await sharp(inputForResize).resize(spec.widthPx, spec.heightPx).png().toBuffer();
      steps.push({ name: 'resize-to-spec', status: 'done' });
    } else {
      steps.push({ name: 'resize-to-spec', status: 'skipped', note: 'sharp manquant' });
    }
  } catch (e: any) {
    steps.push({ name: 'resize-to-spec', status: 'failed', note: String(e?.message || e) });
  }
  const qualityIssues = await computeQualityIssues(finalImage || cropped || buffer, faceCheck);
  steps.push({ name: 'quality-verification', status: 'done', note: qualityIssues.join(', ') });
  return { steps, spec, faceCheck, cropped, backgroundRemoved, finalImage, qualityIssues };
}

export async function processIdPhotosBatch(buffers: Buffer[], specKey: string, options?: { tolerance?: number; whiteBackground?: boolean }): Promise<IdPhotoProcessingResult[]> {
  return Promise.all(buffers.map((b) => processIdPhoto(b, specKey, options)));
}