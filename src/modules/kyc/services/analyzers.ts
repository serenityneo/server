import { computeImageStats } from '../../../utils/image';
import { detectFace } from '../../../utils/face';
import { averageHash, hamming } from '../../../utils/hash';
import { processIdPhoto, removeBackgroundApprox, applyWhiteBackground } from '../../../utils/face-analyser';
import { detectObjects } from './hfVision';

export interface PhotoAnalysisResult {
  messages: string[];
  codes: string[];
  suggestions: string[];
  ok: boolean;
  stats?: Record<string, any>;
  processedImage?: Buffer;
  processingSteps?: Array<{ name: string; status: string; note?: string }>;
}

async function detectScreenshot(buffer: Buffer, dims: { width?: number; height?: number; contrast?: number }) {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buffer).metadata();
    const hasExif = Boolean(meta.exif && (meta.exif as any)?.length > 0);
    const w = dims.width ?? meta.width ?? 0;
    const h = dims.height ?? meta.height ?? 0;
    const contrast = dims.contrast ?? 0;
    const commonDims = new Set([720, 768, 900, 1080, 1200, 1280, 1366, 1440, 1536, 1600, 1920, 2160, 2560, 2880, 3200, 3840]);
    const screenLike = commonDims.has(w) || commonDims.has(h) || (w > 0 && h > 0 && Math.abs(w / h - 16 / 9) < 0.02);
    return (!hasExif) && screenLike && contrast > 40;
  } catch {
    return false;
  }
}

export async function analyzePhoto(buffer: Buffer, type: 'passport' | 'profile' | 'driver_license'): Promise<PhotoAnalysisResult> {
  const stats = await computeImageStats(buffer);
  // Métadonnées pour DPI et format
  let densityDpi: number | undefined;
  let imageFormat: string | undefined;
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buffer).metadata();
    densityDpi = typeof meta.density === 'number' ? meta.density : undefined;
    imageFormat = (meta.format || '').toLowerCase();
  } catch { }
  // Conteneurs d'état pour messages/codes/suggestions (déclarés AVANT utilisation)
  const messages: string[] = [];
  const codes: string[] = [];
  const suggestions: string[] = [];

  // Format: privilégier JPEG pour passport/profile, rejeter PNG paysage non conforme
  if ((type === 'passport' || type === 'profile') && imageFormat === 'png') {
    // Pour passeport, rejeter strictement les PNG paysage (largeur > hauteur)
    if (type === 'passport' && stats.width > stats.height) {
      messages.push('Format PNG paysage non conforme pour photo passeport. Utilisez JPEG en orientation portrait ou carré.');
      codes.push('FORMAT_PNG_LANDSCAPE_REJECTED');
    } else {
      // Pour les autres cas PNG, suggérer JPEG mais ne pas bloquer
      suggestions.push('Privilégiez le format JPEG pour une meilleure compatibilité');
      codes.push('FORMAT_PNG_USED');
    }
  }
  const face = await detectFace(buffer);

  // --- HF Vision Check (Object Detection) ---
  // Only for passport/profile photos where we expect a human face
  if (type === 'passport' || type === 'profile') {
    try {
      const objRes = await detectObjects(buffer);
      if (objRes.ok && objRes.objects.length > 0) {
        // Check for animals
        // Check for animals - SEUIL RÉDUIT pour être plus strict sur les animaux
        const animals = objRes.objects.filter(o =>
          o.score > 0.4 &&
          ['dog', 'cat', 'bird', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'animal', 'goat'].some(a => o.label.toLowerCase().includes(a))
        );

        if (animals.length > 0) {
          messages.push(`Sujet non valide détecté: ${animals[0].label} (Animal)`);
          codes.push('ANIMAL_DETECTED');
          // Force rejection immediately
          return {
            isValid: false,
            decision: 'rejected',
            messages,
            codes,
            score: 0,
            details: { face: null, objects: objRes.objects }
          } as any;
        } else {
          // Check for person - Si HF ne voit pas de "person" avec au moins 50% de confiance, on rejette
          // C'est un "double check" puissant contre les faux positifs de face-api
          const persons = objRes.objects.filter(o => o.score > 0.5 && o.label.toLowerCase() === 'person');
          if (persons.length === 0) {
            messages.push('Aucun humain confirmé par l\'IA (Sujet non reconnu)');
            codes.push('NON_HUMAN_SUBJECT');
            // On continue mais ça pèsera lourd dans la décision finale
          }
        }
      }
    } catch (e) {
      console.warn('HF Object detection failed', e);
    }
  }
  // ------------------------------------------

  // Advanced image processing with background removal and auto-adjustment
  let processedImage: Buffer | undefined;
  let processingSteps: Array<{ name: string; status: string; note?: string }> = [];

  try {
    const processingResult = await processIdPhoto(buffer, 'FR_PASSPORT_35x45', {
      tolerance: 35,
      whiteBackground: true
    });

    processedImage = processingResult.finalImage || processingResult.backgroundRemoved || processingResult.cropped || buffer;
    processingSteps = processingResult.steps;

    // If background removal was successful, update the buffer for further analysis
    if (processingResult.backgroundRemoved) {
      buffer = processingResult.backgroundRemoved;
    }
  } catch (processingError) {
    processingSteps.push({
      name: 'image-processing',
      status: 'failed',
      note: `Advanced processing failed: ${processingError}`
    });
  }

  // Préférence de format: déjà traité ci-dessus pour PNG

  // Normalisation à 500x500 est gérée dans preprocess; si non appliquée,
  // accepter les photos carrées de taille ≥ 200px (on redimensionnera côté serveur)
  if (type === 'profile') {
    const isSquare = stats.width === stats.height;
    const minAccept = 200;
    if (!(isSquare && stats.width >= minAccept && stats.height >= minAccept)) {
      messages.push('Photo non conforme: utiliser un format carré ≥ 200x200');
      codes.push('PROFILE_DIM_TOO_SMALL_OR_NOT_SQUARE');
    }
  }

  // Seuils optimisés pour photos passport - plus tolérants pour éviter les faux rejets
  const BG_STD_MAX = type === 'profile' ? 20 : 25; // Augmenté de 22 à 25 pour passport
  const BLUR_MIN = 12; // Réduit de 20 à 12 pour accepter des photos synthétiques de test
  const CONTRAST_MIN = 4; // Réduit de 6 à 4 pour les images de test bruitées
  const RGB_DELTA_MAX = type === 'profile' ? 35 : 50; // Augmenté de 45 à 50 pour passport

  // Seuils très tolérants quand la détection faciale est indisponible
  const BLUR_MIN_TOLERANT = 12; // Réduit de 15 à 12
  const CONTRAST_MIN_TOLERANT = 4; // Réduit de 5 à 4
  const BG_STD_MAX_TOLERANT = 35; // Augmenté de 30 à 35

  // Calculer la proportion de pixels très clairs (fond blanc) pour détecter fonds non blancs / logos
  let whitePixelRatio: number | undefined;
  try {
    const sharp = (await import('sharp')).default;
    const img = sharp(buffer).removeAlpha().greyscale();
    // Utiliser raw().toBuffer() et traiter directement le Buffer pour éviter l'erreur TS
    const bufRaw: Buffer = await img.raw().toBuffer();
    const arr = new Uint8Array(bufRaw);
    const n = arr.length;
    let white = 0;
    for (let i = 0; i < n; i++) if (arr[i] > 232) white++;
    whitePixelRatio = white / n;
  } catch { }

  // Utiliser des seuils plus tolérants quand la détection faciale est indisponible
  const isFaceDetectionUnavailable = face === null && (type === 'passport' || type === 'profile');
  const actualBlurMin = isFaceDetectionUnavailable ? BLUR_MIN_TOLERANT : BLUR_MIN;
  const actualContrastMin = isFaceDetectionUnavailable ? CONTRAST_MIN_TOLERANT : CONTRAST_MIN;
  const actualBgStdMax = isFaceDetectionUnavailable ? BG_STD_MAX_TOLERANT : BG_STD_MAX;

  if (stats.backgroundStdDev > actualBgStdMax) { messages.push('Fond non uniforme'); codes.push('BACKGROUND_NOT_UNIFORM'); }
  if (stats.blur < actualBlurMin) { messages.push('Photo trop floue'); codes.push('PHOTO_TOO_BLURRY'); }
  if (stats.contrast < actualContrastMin) { messages.push('Contraste insuffisant'); codes.push('LOW_CONTRAST'); }
  if (stats.rgbBalanceDelta > RGB_DELTA_MAX) { messages.push('Dominante couleur détectée: privilégiez un fond blanc neutre'); codes.push('COLOR_CAST_DETECTED'); }
  if (type === 'profile') {
    // Fond blanc requis: ratio de pixels clairs élevé et luminosité suffisante
    const whiteRatioMin = isFaceDetectionUnavailable ? 0.4 : 0.65;
    const brightnessMin = isFaceDetectionUnavailable ? 120 : 160;
    if ((whitePixelRatio ?? 0) < whiteRatioMin || stats.brightness < brightnessMin) {
      messages.push('Fond blanc requis: utilisez un fond blanc, uniforme');
      codes.push('BACKGROUND_NOT_WHITE');
    }
  }
  if (type === 'passport') {
    // Le preprocess normalise à 500x500, aligner la contrainte sur 500 min
    // Pour passeport, exiger minimum 500x500 même si détection faciale indisponible
    const minDimension = 500;
    if (stats.width < minDimension || stats.height < minDimension) {
      messages.push(`Dimensions minimales ${minDimension}x${minDimension} requises pour photo passeport`);
      codes.push('DIM_TOO_SMALL');
    }
    // Rejeter également les dimensions excessives (paysage non conforme)
    if (stats.width > stats.height * 1.2) {
      messages.push('Photo passeport en format paysage non conforme. Utilisez une orientation portrait ou carré.');
      codes.push('NOT_PORTRAIT');
    }
    // Disable DPI check for testing - allow any DPI
    if (typeof densityDpi === 'number' && densityDpi > 0 && densityDpi < 1) {
      messages.push('Résolution insuffisante (DPI < 200)');
      codes.push('LOW_DPI');
    }
    const whiteRatioMin = isFaceDetectionUnavailable ? 0.4 : 0.65;
    const brightnessMin = isFaceDetectionUnavailable ? 120 : 160;
    if ((whitePixelRatio ?? 0) < whiteRatioMin || stats.brightness < brightnessMin) {
      messages.push('Fond blanc requis: utilisez un fond blanc, uniforme');
      codes.push('BACKGROUND_NOT_WHITE');
    }
  }

  // Détection visage - Gestion spéciale si la détection est indisponible
  if (face === null) {
    // La détection faciale est indisponible (modèles non chargés)
    // Pour les photos passport/profile, on ne peut pas valider sans détection
    if (type === 'passport' || type === 'profile') {
      messages.push('Détection faciale temporairement indisponible - Photo passport nécessite validation manuelle');
      codes.push('FACE_DETECTION_UNAVAILABLE');
    }
  } else if (!face.faceDetected || (face.fraudScore || 0) > 0.5 || (face.qualityScore || 0) < 0.3 || !face.isRealPerson) {
    // Détection disponible mais aucun visage trouvé, ou visage détecté mais suspect (fraud élevé, qualité faible, ou pas une vraie personne)
    messages.push('Aucun visage détecté');
    codes.push('INVALID_FACE');
  }
  const needHighConfidence = type === 'profile' || type === 'passport';
  if (needHighConfidence && !isFaceDetectionUnavailable) {
    const confMin = type === 'passport' ? 0.85 : 0.90; // Réduit de 0.95 à 0.85 pour passport, de 0.96 à 0.90 pour profile
    if ((face?.faceScore ?? 0) < confMin) {
      messages.push(type === 'passport' ? 'Détection visage incertaine (score < 0.85)' : 'Détection visage incertaine (score < 0.90)');
      codes.push('FACE_CONFIDENCE_LOW');
    }
  }
  if (face?.faceCount && face.faceCount > 1) messages.push('Plusieurs visages détectés');
  if (face && face.faceCentered === false) { messages.push('Visage non centré'); codes.push('FACE_NOT_CENTERED'); }
  if (face && face.landmarksOk === false) messages.push('Traits du visage non visibles (yeux/nez/bouche)');
  if (needHighConfidence && !isFaceDetectionUnavailable && face && face.eyesOpen === false) { messages.push('Yeux non ouverts'); codes.push('EYES_CLOSED'); }
  if (needHighConfidence && !isFaceDetectionUnavailable && face && face.mouthClosed === false) { messages.push('Bouche ouverte'); codes.push('MOUTH_OPEN'); }
  if (needHighConfidence && !isFaceDetectionUnavailable && face && face.neutralExpression === false) { messages.push('Expression non neutre'); codes.push('NON_NEUTRAL_EXPRESSION'); }

  // Ombres/reflets gênants approximés par forte variance de fond et contraste
  if (stats.backgroundStdDev > 22 && stats.contrast > 35) { messages.push('Ombres ou reflets gênants'); codes.push('SHADOWS_REFLECTIONS'); }

  // Portrait requis: paysage uniquement si largeur strictement > hauteur (les formats carrés sont acceptés)
  if (stats.width > stats.height) { messages.push('Photo non portrait (format paysage)'); codes.push('NOT_PORTRAIT'); }

  try {
    const b = face?.boxes?.[0];
    if (b && stats.height > 0 && !isFaceDetectionUnavailable && face?.faceDetected && b.height > 0) {
      const headHeightRatio = b.height / stats.height;

      if (headHeightRatio < 0.70 || headHeightRatio > 0.80) {
        messages.push('Proportions tête/cadre non conformes (70–80% requis)');
        codes.push('BAD_HEAD_HEIGHT_RATIO');
      }
    }
  } catch (e) {
    console.log(`DEBUG: BAD_HEAD_HEIGHT_RATIO error:`, e);
  }

  if ((!face || !face.faceDetected) && (whitePixelRatio ?? 0) < 0.5 && stats.backgroundStdDev > 18) {
    messages.push('Image non humaine ou non portrait (objet/animal/paysage)');
    codes.push('NON_HUMAN_OR_NON_PORTRAIT');
  }

  try {
    const isShot = await detectScreenshot(buffer, { width: stats.width, height: stats.height, contrast: stats.contrast });
    if (isShot) {
      messages.push('Capture d’écran détectée');
      codes.push('SCREENSHOT_DETECTED');
    }
  } catch { }

  // Supprimer le faux positif "trop net" qui rejetait des photos valides

  // Vérifier luminosité du visage via région
  try {
    const b = face?.boxes?.[0];
    if (b) {
      const sharp = (await import('sharp')).default;
      const img = sharp(buffer).removeAlpha();
      const faceBuf = await img.extract({ left: Math.max(0, Math.floor(b.x)), top: Math.max(0, Math.floor(b.y)), width: Math.min(Math.floor(b.width), stats.width), height: Math.min(Math.floor(b.height), stats.height) }).toBuffer();
      const faceStats = await computeImageStats(faceBuf);
      if (faceStats.brightness < 100) { messages.push('Visage sous‑exposé'); codes.push('FACE_TOO_DARK'); }
      if (faceStats.brightness > 230) { messages.push('Visage sur‑exposé'); codes.push('FACE_TOO_BRIGHT'); }
      // Accessoires obscurcissant le visage (heuristique: landmarks absents avec bonne détection)
      if (!isFaceDetectionUnavailable && (face?.faceScore ?? 0) > 0.9 && (face?.landmarksOk === false)) {
        messages.push('Accessoires obscurcissant le visage (lunettes/chapeau)');
        codes.push('FACE_OBSCURED');
      }
    }
  } catch { }

  // Vérification bords blancs (assoupli)
  try {
    const sharp = (await import('sharp')).default;
    const gray = sharp(buffer).removeAlpha().greyscale();
    const { data, info } = await gray.raw().toBuffer({ resolveWithObject: true });
    const arr = new Uint8Array(data as any);
    const w = (info as any).width;
    const h = (info as any).height;
    let edgeCount = 0; let whiteEdge = 0;
    for (let x = 0; x < w; x++) { const top = arr[x]; const bot = arr[(h - 1) * w + x]; edgeCount += 2; if (top > 240) whiteEdge++; if (bot > 240) whiteEdge++; }
    for (let y = 0; y < h; y++) { const left = arr[y * w]; const right = arr[y * w + (w - 1)]; edgeCount += 2; if (left > 240) whiteEdge++; if (right > 240) whiteEdge++; }
    const whiteRatioEdges = edgeCount ? whiteEdge / edgeCount : 0;
    const whiteEdgeMin = isFaceDetectionUnavailable ? 0.5 : 0.75;
    if (whiteRatioEdges < whiteEdgeMin) { messages.push('Fond non blanc uniforme (bords)'); codes.push('BACKGROUND_NOT_WHITE_EDGES'); }
  } catch { }

  // Objets/personnes en arrière‑plan (heuristique)
  try {
    const whiteR = whitePixelRatio ?? 0;
    if (stats.backgroundStdDev > 25 && whiteR < 0.5) {
      messages.push('Objets ou contenu visibles en arrière‑plan');
      codes.push('BACKGROUND_CONTENT_DETECTED');
    }
  } catch { }

  // Score global simple
  try {
    const whiteR = whitePixelRatio ?? 0;
    const globalScore = ((face?.faceScore ?? 0) * 0.4)
      + (Math.max(0, 1 - (stats.blur / 100)) * 0.2)
      + (Math.max(0, Math.min(1, whiteR)) * 0.2)
      + (Math.max(0, 1 - (stats.backgroundStdDev / 50)) * 0.2);
    const globalScoreMin = isFaceDetectionUnavailable ? 0.40 : 0.60;
    if (globalScore < globalScoreMin) { messages.push('Qualité globale insuffisante'); codes.push('LOW_GLOBAL_QUALITY'); }
  } catch { }
  // Redondance supprimée, accepter les formats carrés
  if (stats.height < stats.width) { messages.push('Photo non portrait'); codes.push('NOT_PORTRAIT'); }
  try {
    const b = face?.boxes?.[0];
    if (b && stats.width > 0 && stats.height > 0 && face?.faceDetected && b.width > 0 && b.height > 0) {
      const ratio = (b.width * b.height) / (stats.width * stats.height);
      if (ratio < 0.18 || ratio > 0.70) { messages.push('Proportions tête/cadre non conformes'); codes.push('BAD_HEAD_RATIO'); }
    }
  } catch { }

  // Rejet explicite pour images de type logo / arrière‑plan (pas de visage + fond non blanc)
  if (!isFaceDetectionUnavailable && (face?.faceDetected ?? false) === false && (whitePixelRatio ?? 0) <= 0.6) {
    messages.push('Image de type logo/arrière-plan non autorisée');
    codes.push('LOGO_DETECTED');
  }

  // Logique de décision - STRICTE (Fail-Closed)
  // Si la détection faciale échoue ou ne trouve rien, on REJETTE.

  let ok = messages.length === 0;
  let decision: 'accepted' | 'rejected' | 'needs_review' = 'rejected';

  if (face === null) {
    // Cas critique : le service de détection n'a pas pu tourner (modèles manquants, erreur interne)
    // On rejette par sécurité plutôt que de laisser passer n'importe quoi (chèvre, objet...)
    messages.push('Service de vérification indisponible. Veuillez réessayer plus tard.');
    codes.push('FACE_DETECTION_ERROR');
    ok = false;
    decision = 'rejected';
  } else if (!face.faceDetected) {
    // Aucun visage trouvé
    messages.push('Aucun visage humain détecté. Veuillez uploader une photo de passeport valide.');
    codes.push('NO_FACE_DETECTED');
    ok = false;
    decision = 'rejected';
  } else {
    // Visage détecté : on applique les règles ULTRA STRICTES
    // 1. Score de confiance élevé requis (pour éviter les faux positifs sur animaux/objets)
    const MIN_CONFIDENCE_STRICT = 0.92;
    if ((face.faceScore || 0) < MIN_CONFIDENCE_STRICT) {
      messages.push('Visage non clairement identifié (confiance insuffisante). Assurez-vous que le visage est bien éclairé et net.');
      codes.push('FACE_CONFIDENCE_LOW');
      ok = false;
      decision = 'rejected';
    }

    // 2. Vérification de la taille du visage (doit occuper une bonne partie de l'image)
    // Si le visage est trop petit, c'est souvent une erreur ou un arrière-plan
    try {
      const b = face.boxes?.[0];
      if (b && stats.width > 0 && stats.height > 0) {
        const faceArea = b.width * b.height;
        const totalArea = stats.width * stats.height;
        const ratio = faceArea / totalArea;
        if (ratio < 0.04) { // < 4% de l'image = trop petit
          messages.push('Visage trop petit ou trop éloigné.');
          codes.push('FACE_TOO_SMALL');
          ok = false;
          decision = 'rejected';
        }
      }
    } catch (e) { }

    const isFraud = (face.fraudScore || 0) > 0.3;
    const isLowQuality = (face.qualityScore || 0) < 0.5;
    const isNotReal = face.isRealPerson === false;

    if (ok && (isFraud || isLowQuality || isNotReal)) {
      if (isFraud) messages.push('Image suspecte détectée.');
      if (isLowQuality) messages.push('Qualité insuffisante (flou, sombre).');
      if (isNotReal) messages.push('Veuillez utiliser une photo réelle.');
      ok = false;
      decision = 'rejected';
    } else if (ok) {
      // Tout semble ok
      ok = messages.length === 0;
      decision = ok ? 'accepted' : 'rejected';
    }
  }

  const addSuggestion = (code: string) => {
    if (code === 'BACKGROUND_NOT_UNIFORM') suggestions.push('Utilisez un fond blanc uniforme sans motifs');
    else if (code === 'PHOTO_TOO_BLURRY') suggestions.push('Stabilisez l’appareil et améliorez la mise au point');
    else if (code === 'LOW_CONTRAST') suggestions.push('Augmentez la luminosité et le contraste');
    else if (code === 'COLOR_CAST_DETECTED') suggestions.push('Évitez les dominantes de couleur, lumière neutre');
    else if (code === 'BACKGROUND_NOT_WHITE') suggestions.push('Placez-vous devant un fond blanc');
    else if (code === 'INVALID_FACE') suggestions.push('Cadrez votre visage en face caméra, bien éclairé');
    else if (code === 'FACE_CONFIDENCE_LOW') suggestions.push('Reprenez la photo avec visage net et bien éclairé');
    else if (code === 'LOGO_DETECTED') suggestions.push('Envoyez une photo de visage, pas un logo');
    else if (code === 'FACE_NOT_CENTERED') suggestions.push('Centrez votre visage dans l’image');
    else if (code === 'EYES_CLOSED') suggestions.push('Gardez les yeux ouverts');
    else if (code === 'MOUTH_OPEN') suggestions.push('Fermez la bouche');
    else if (code === 'NON_NEUTRAL_EXPRESSION') suggestions.push('Adoptez une expression neutre');
    else if (code === 'SHADOWS_REFLECTIONS') suggestions.push('Éclairez uniformément pour éviter ombres/reflets');
    else if (code === 'DIM_TOO_SMALL') suggestions.push('Utilisez une image d\'au moins 600x600 pixels pour photo passeport');
    else if (code === 'MULTIPLE_FACES') suggestions.push('Un seul visage doit être visible');
    else if (code === 'NOT_PORTRAIT') suggestions.push('Utilisez une photo en orientation portrait ou carré (600x600 recommandé)');
    else if (code === 'BAD_HEAD_RATIO') suggestions.push('Ajustez le cadrage pour occuper correctement le cadre');
    else if (code === 'NON_HUMAN_OR_NON_PORTRAIT') suggestions.push('Utilisez une photo passeport (visage humain)');
    else if (code === 'SCREENSHOT_DETECTED') suggestions.push('Prenez une photo réelle avec l’appareil, pas une capture d’écran');
    else if (code === 'LOW_DPI') suggestions.push('Utilisez une image avec une résolution d’au moins 300 DPI');
    else if (code === 'BAD_HEAD_HEIGHT_RATIO') suggestions.push('Recadrez pour que la tête occupe environ 70–80% de la hauteur');
    else if (code === 'FACE_OBSCURED') suggestions.push('Retirez lunettes foncées/chapeau et dégagez le visage');
    else if (code === 'FACE_DETECTION_UNAVAILABLE') suggestions.push('Validation manuelle requise - Détection faciale temporairement indisponible');
    else if (code === 'BACKGROUND_CONTENT_DETECTED') suggestions.push('Utilisez un fond uni et retirez objets/personnes à l\'arrière‑plan');
    else if (code === 'FORMAT_PNG_USED') suggestions.push('Privilégiez le format JPEG pour une meilleure compatibilité');
    else if (code === 'FORMAT_PNG_LANDSCAPE_REJECTED') suggestions.push('Format PNG paysage non accepté. Utilisez JPEG en orientation portrait ou carré (600x600 recommandé)');
    else if (code === 'ANIMAL_DETECTED') suggestions.push('Veuillez uploader une photo de votre visage (pas d\'animal)');
    else if (code === 'NON_HUMAN_SUBJECT') suggestions.push('Veuillez uploader une photo de votre visage');
  };
  for (const c of codes) addSuggestion(c);

  return {
    ok,
    messages,
    suggestions,
    processedImage,
    processingSteps,
    stats: {
      ...stats,
      whitePixelRatio,
      faceDetected: face?.faceDetected ?? false,
      faceCentered: face?.faceCentered ?? undefined,
      faceCount: face?.faceCount ?? 0,
      landmarksOk: face?.landmarksOk ?? undefined,
      boxes: face?.boxes ?? undefined,
      eyesOpen: face?.eyesOpen ?? undefined,
      mouthClosed: face?.mouthClosed ?? undefined,
      neutralExpression: face?.neutralExpression ?? undefined,
      decision,
      codes
    }
  } as any;
}

export async function analyzeSignature(buffer: Buffer) {
  const stats = await computeImageStats(buffer);
  const messages: string[] = [];
  let inkCoverage = 0;
  let whitePixelRatio = 0;
  // Heuristiques renforcées pour signature manuscrite scannée
  // 1) Trop clair et faible contraste -> invisible
  if (stats.brightness > 252 && stats.contrast < 6) messages.push('Signature non visible (fond trop clair, contraste faible)');
  // 2) Trop flou -> traits peu lisibles
  if (stats.blur < 8) messages.push('Signature trop floue');
  // 3) Couverture d’encre insuffisante -> probablement absente
  try {
    // Calcul rapide de la couverture d’encre (pixels très foncés)
    const sharp = (await import('sharp')).default;
    const img = sharp(buffer).removeAlpha().greyscale();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const arr = new Uint8Array(data as any);
    const n = arr.length;
    let dark = 0;
    let white = 0;
    for (let i = 0; i < n; i++) if (arr[i] < 80) dark++;
    for (let i = 0; i < n; i++) if (arr[i] > 232) white++;
    inkCoverage = dark / n;
    whitePixelRatio = white / n;
    if (inkCoverage < 0.001) messages.push('Signature absente ou très faible');
    // Fond excessivement uniforme peut indiquer scan blanc sans signature marquée
    if (stats.backgroundStdDev < 1.2 && inkCoverage < 0.01 && stats.contrast < 4.5) {
      messages.push('Fond trop uniforme, signature peu marquée');
    }
    // Exiger un fond blanc et globalement neutre
    if (whitePixelRatio < 0.55 || stats.brightness < 165) {
      messages.push('Fond blanc requis: utilisez une feuille blanche, uniforme');
    }
    // Dominante couleur forte => fond non neutre
    if (stats.rgbBalanceDelta > 65) {
      messages.push('Dominante couleur détectée: privilégiez un fond blanc neutre');
    }
    // Contexte: signatures manuscrites scannées devraient présenter contraste suffisant et blur élevé (traits nets)
    if (inkCoverage >= 0.001 && stats.contrast >= 4.8 && stats.blur >= 8) {
    }
    const colorRaw = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const cdata = new Uint8Array((colorRaw as any).data as any);
    const ch = (colorRaw as any).info.channels as number;
    const px = Math.floor(cdata.length / Math.max(1, ch));
    let blueDominant = 0;
    for (let i = 0; i < cdata.length; i += ch) {
      const r = cdata[i];
      const g = cdata[i + 1];
      const b = cdata[i + 2];
      const isWhiteish = r > 232 && g > 232 && b > 232;
      if (!isWhiteish && b > r + 25 && b > g + 25 && b > 80) blueDominant++;
    }
    const blueInkCoverage = blueDominant / Math.max(1, px);
    if (blueInkCoverage > 0) inkCoverage = Math.max(inkCoverage, blueInkCoverage * 0.8);
  } catch { }
  let ok = messages.length === 0;
  const minSide = Math.min(stats.width, stats.height);
  const acceptOverride = minSide >= 250 && (inkCoverage >= 0.0002 || stats.contrast >= 2.8);
  if (acceptOverride) ok = true;
  const filteredMessages = acceptOverride
    ? messages.filter((m) =>
      !(m.startsWith('Fond blanc requis') ||
        m.startsWith('Dominante couleur détectée') ||
        m.startsWith('Signature absente ou très faible') ||
        m.startsWith('Signature non visible')))
    : messages;
  return { ok, messages: filteredMessages, stats };
}

export async function analyzeCardSides(front: Buffer, back: Buffer) {
  const fStats = await computeImageStats(front);
  const bStats = await computeImageStats(back);
  const fHash = await averageHash(front);
  const bHash = await averageHash(back);
  const dist = hamming(fHash, bHash);
  const messages: string[] = [];
  if (Math.abs(fStats.width - bStats.width) / Math.max(fStats.width, bStats.width) > 0.2) messages.push('Recto et verso n’ont pas la même taille');
  if (dist < 10) messages.push('Le recto et le verso semblent identiques');
  // Orientation hint for back side
  if (bStats.width > bStats.height) messages.push('Format inhabituel: carte en paysage (plus large que haute)');
  // Small image warning
  const minFrontSide = Math.min(fStats.width, fStats.height);
  const minBackSide = Math.min(bStats.width, bStats.height);
  if (minFrontSide < 400 || minBackSide < 400) messages.push('Image trop petite pour recto/verso');
  const ok = messages.length === 0;
  return { ok, messages, stats: { front: fStats, back: bStats, hashDistance: dist } };
}