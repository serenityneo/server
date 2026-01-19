export type CheckResult = {
  ok: boolean;
  messages: string[];
  stats?: Record<string, number | boolean | string>;
};

export type ValidationReport = {
  photo?: CheckResult;
  face?: CheckResult;
  signature?: CheckResult;
  front?: CheckResult;
  back?: CheckResult;
  ocr?: CheckResult & { docTypeDetected?: string; mrzValid?: boolean };
  score: number;
  status: 'ok' | 'flagged' | 'failed';
  suggestions?: string[];
  timers?: {
    photoMs?: number;
    signatureMs?: number;
    cardMs?: number;
    ocrMs?: number;
    scoreMs?: number;
    totalMs?: number;
  };
};

export function computeScore(report: ValidationReport): number {
  const weights: Record<string, number> = {
    photo: 0.2,
    face: 0.3,
    signature: 0.1,
    front: 0.15,
    back: 0.15,
    ocr: 0.1
  };
  let score = 0;
  let totalWeight = 0;
  
  // Vérifier si la détection faciale est indisponible (face.ok === false avec message FACE_DETECTION_UNAVAILABLE)
  const isFaceDetectionUnavailable = report.face && 
    !report.face.ok && 
    report.face.messages.some(msg => msg.includes('Détection faciale temporairement indisponible'));
  
  for (const key of Object.keys(weights)) {
    const w = weights[key];
    const r = (report as any)[key] as CheckResult | undefined;
    if (!r) continue;
    totalWeight += w;
    
    // Si la détection faciale est indisponible, considérer le check face comme partiellement réussi
    if (key === 'face' && isFaceDetectionUnavailable) {
      score += w * 0.7; // 70% de réussite pour compenser l'indisponibilité
    } else {
      score += w * (r.ok ? 1 : 0);
    }
  }
  // Normaliser par le poids total des checks effectivement présents,
  // pour éviter de pénaliser les validations partielles (photo seule, etc.)
  const normalized = totalWeight > 0 ? (score / totalWeight) : 0;
  return Math.round(normalized * 100);
}

export function finalizeStatus(report: ValidationReport): ValidationReport['status'] {
  if (report.score >= 85) return 'ok';
  if (report.score >= 60) return 'flagged';
  return 'failed';
}