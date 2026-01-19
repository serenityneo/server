import { detectFaceAdvancedFromBuffer, getDetailedAnalysis } from './face-analyser';

export type FaceBox = { x: number; y: number; width: number; height: number; score?: number };
export type FaceCheck = {
  faceDetected: boolean;
  faceScore?: number;
  faceCentered?: boolean;
  faceCount?: number;
  boxes?: FaceBox[];
  landmarksOk?: boolean;
  eyesOpen?: boolean;
  mouthClosed?: boolean;
  neutralExpression?: boolean;
  fraudScore?: number;
  qualityScore?: number;
  isRealPerson?: boolean;
  errorCodes?: string[];
};

const metrics = {
  analyzed: 0,
  detected: 0,
  fraudHigh: 0,
  lowQuality: 0,
  validPassport: 0
};

export async function detectFace(buffer: Buffer): Promise<FaceCheck | null> {
  try {
    const res = await detectFaceAdvancedFromBuffer(buffer);
    metrics.analyzed += 1;
    if (res.faceDetected) metrics.detected += 1;
    if ((res.fraudScore || 0) > 0.7) metrics.fraudHigh += 1;
    if ((res.qualityScore || 0) < 0.3) metrics.lowQuality += 1;
    return res;
  } catch {
    return null;
  }
}

export function isFaceDetectionUnavailable(faceCheck: FaceCheck): boolean {
  const hasDetectionError = !faceCheck.faceDetected || (faceCheck.errorCodes || []).includes('FACE_DETECTION_UNAVAILABLE');
  const lowQuality = (faceCheck.qualityScore || 0) < 0.3;
  const highFraudRisk = (faceCheck.fraudScore || 0) > 0.7;
  return hasDetectionError || lowQuality || highFraudRisk;
}

export function validatePassportPhoto(faceCheck: FaceCheck) {
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (!faceCheck.faceDetected) {
    issues.push('Aucun visage détecté');
    recommendations.push('Cadrez votre visage au centre, regardez l\'appareil');
  }
  if ((faceCheck.fraudScore || 0) > 0.3) {
    issues.push('Risque de fraude détecté');
    recommendations.push('Utilisez une photo originale (pas écran/document)');
  }
  if ((faceCheck.qualityScore || 0) < 0.5) {
    issues.push('Qualité d\'image insuffisante');
    recommendations.push('Améliorez l\'éclairage et la netteté');
  }
  if (faceCheck.isRealPerson === false) {
    issues.push('Présence humaine non confirmée');
    recommendations.push('Évitez masques/filtres');
  }
  if (faceCheck.eyesOpen === false) {
    issues.push('Yeux fermés');
    recommendations.push('Gardez les yeux ouverts');
  }
  if (faceCheck.mouthClosed === false) {
    issues.push('Bouche ouverte');
    recommendations.push('Gardez la bouche fermée');
  }
  if (faceCheck.neutralExpression === false) {
    issues.push('Expression non neutre');
    recommendations.push('Adoptez une expression neutre');
  }
  if (faceCheck.faceCentered === false) {
    issues.push('Visage non centré');
    recommendations.push('Positionnez le visage au centre');
  }

  const isValid = issues.length === 0;
  if (isValid) metrics.validPassport += 1;

  const analysis = getDetailedAnalysis({
    faceDetected: !!faceCheck.faceDetected,
    faceScore: faceCheck.faceScore || 0,
    faceCentered: !!faceCheck.faceCentered,
    faceCount: faceCheck.faceCount || 0,
    boxes: (faceCheck.boxes as any) || [],
    landmarksOk: !!faceCheck.landmarksOk,
    eyesOpen: !!faceCheck.eyesOpen,
    mouthClosed: !!faceCheck.mouthClosed,
    neutralExpression: !!faceCheck.neutralExpression,
    fraudScore: faceCheck.fraudScore || 0,
    qualityScore: faceCheck.qualityScore || 0,
    isRealPerson: !!faceCheck.isRealPerson,
    errorCodes: faceCheck.errorCodes || []
  } as any);

  return {
    isValid,
    issues,
    recommendations,
    riskLevel: analysis.summary.riskLevel,
    qualityLevel: analysis.summary.qualityLevel
  };
}

export function getPhotoQualityStats(faceCheck: FaceCheck) {
  const overallScore = Math.round((faceCheck.qualityScore || 0) * 100);
  let quality: 'excellent' | 'good' | 'fair' | 'poor' = 'poor';
  if (overallScore >= 90) quality = 'excellent';
  else if (overallScore >= 70) quality = 'good';
  else if (overallScore >= 50) quality = 'fair';

  const fraudScore = faceCheck.fraudScore || 0;
  const fraudLevel: 'low' | 'medium' | 'high' = fraudScore > 0.7 ? 'high' : fraudScore > 0.3 ? 'medium' : 'low';
  const indicators = (faceCheck.errorCodes || []).filter((c) => ['SCREEN_PHOTO_DETECTED','ARTIFICIAL_FACE_DETECTED','DOCUMENT_PHOTO_DETECTED','DEEPFAKE_INDICATORS'].includes(c));

  return {
    overallScore,
    quality,
    details: {
      faceDetection: faceCheck.faceDetected ? 100 : 0,
      fraudRisk: Math.round((1 - fraudScore) * 100),
      imageQuality: overallScore,
      humanVerification: faceCheck.isRealPerson ? 100 : 0,
      faceCentering: faceCheck.faceCentered ? 100 : 50,
      expressionCompliance: (faceCheck.eyesOpen && faceCheck.mouthClosed && faceCheck.neutralExpression) ? 100 : 0
    },
    fraudAnalysis: {
      score: Math.round(fraudScore * 100),
      level: fraudLevel,
      indicators
    }
  };
}

export function getFaceAnalyzerMetrics() {
  return { ...metrics };
}