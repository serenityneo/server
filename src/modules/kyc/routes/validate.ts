import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { analyzePhoto, analyzeSignature, analyzeCardSides } from '../services/analyzers';
import { scoreDocumentRealness } from '../services/hfVision';
import { runDocumentOCR } from '../services/ocr';
import { parseLicenceBackFromOCR } from '../services/licenseOcr';
import { computeScore, finalizeStatus, ValidationReport } from '../services/scoring';
import { normalizeProfilePhoto, autoCropDocument } from '../../../utils/preprocess';
import { computeImageStats } from '../../../utils/image';
import sharp from 'sharp';
import { sha256 } from '../../../utils/filehash';
import { checkDuplicateHash, insertDocumentHash, upsertKycDraftHashes } from '../../../services/db';
import { FILE_SIZE_LIMITS, IMAGE_DIM_LIMITS, validateBufferSize, validateImageDimensions } from '../../../utils/fileLimits';
import { appendPhotoLog } from '../services/logs';
import { enhanceForOCR } from '../../../utils/ocrEnhance';

export function registerValidateRoute(app: FastifyInstance) {
  app.post('/validate', {
    schema: { 
      tags: ['kyc'],
      summary: 'Validation KYC (photos, documents, signatures) avec rapport détaillé',
      description: 'Valide les éléments KYC et retourne un rapport détaillé. Exigences photo: profil et passeport sont normalisés en 500x500 côté serveur; formats acceptés JPEG/PNG; orientation portrait ou carré; fond blanc recommandé (uniformité raisonnable); visage unique détectable, centré, traits visibles; seuils de netteté/contraste modérés. Les erreurs renvoient des codes explicites (ex: BACKGROUND_NOT_WHITE, PHOTO_TOO_BLURRY, FACE_CONFIDENCE_LOW).',
      consumes: ['multipart/form-data'],
      // Note: pour le flux multipart traité via req.parts(), ne pas définir de schéma body
      // car Fastify valide que body soit un objet, ce qui n'est pas le cas ici.
      response: {
        200: {
          type: 'object',
          properties: {
            // Résumé simplifié pour le frontend
            isValid: { type: 'boolean' },
            detectedType: { type: 'string', nullable: true },
            message: { type: 'string' },
            scoreRatio: { type: 'number' },
            score: { type: 'number' },
            status: { type: 'string' },
            photo: { type: 'object' },
            face: { type: 'object' },
            signature: { type: 'object' },
            front: { type: 'object' },
            back: { type: 'object' },
            ocr: { type: 'object' },
            timers: {
              type: 'object',
              properties: {
                photoMs: { type: 'number' },
                signatureMs: { type: 'number' },
                cardMs: { type: 'number' },
                ocrMs: { type: 'number' },
                scoreMs: { type: 'number' },
                totalMs: { type: 'number' }
              }
            },
            dbSync: {
              type: 'object',
              properties: {
                kycDraftUpdated: { type: 'boolean' },
                customerId: { type: 'number' },
                kycStep: { type: 'string' }
              },
              nullable: true
            }
          },
          examples: [
            {
              summary: 'Rapport succès avec synchronisation brouillon',
              value: {
                isValid: true,
                detectedType: 'passport',
                message: 'Document conforme et lisible.',
                scoreRatio: 0.94,
                score: 0.82,
                status: 'pending_review',
                photo: { ok: true, messages: [], stats: { faceCentered: true } },
                face: { ok: true, messages: [], stats: { faceCentered: true } },
                signature: { ok: true, messages: [] },
                front: { ok: true, messages: [] },
                back: { ok: true, messages: [] },
                ocr: { ok: true, messages: [], stats: { docTypeDetected: 'passport', mrzValid: true, keywords: ['RÉPUBLIQUE', 'PASSEPORT'] } },
                timers: { photoMs: 120, signatureMs: 45, cardMs: 210, ocrMs: 350, scoreMs: 5, totalMs: 760 },
                dbSync: { kycDraftUpdated: true, customerId: 123, kycStep: 'step3' }
              }
            }
          ]
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string', enum: ['INVALID_FORMAT', 'MISSING_FILE', 'INVALID_SIZE', 'INVALID_DIMENSIONS'] },
            details: { type: 'object', nullable: true },
            validationCriteria: { type: 'object' },
            requirements: { type: 'array', items: { type: 'string' } }
          },
          examples: [
            { summary: 'Format non supporté', value: { error: 'Invalid file format', code: 'INVALID_FORMAT', details: { invalid: ['front:image/gif'] } } },
            { summary: 'Aucun fichier fourni', value: { error: 'No files provided', code: 'MISSING_FILE' } },
            { summary: 'Taille hors limites', value: { error: 'File size out of bounds', code: 'INVALID_SIZE', details: { minBytes: 10240, maxBytes: 10485760, invalid: ['front:5120B'] } } },
            { summary: 'Dimensions hors limites', value: { error: 'Image dimensions out of bounds', code: 'INVALID_DIMENSIONS', details: { minWidth: 200, minHeight: 200, maxWidth: 8000, maxHeight: 8000, invalid: ['back:200x150'] } } }
          ]
        },
        415: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string', enum: ['UNSUPPORTED_MEDIA_TYPE'] },
            details: { type: 'object', nullable: true }
          },
          examples: [
            { summary: 'MIME non supporté', value: { error: 'Unsupported media type', code: 'UNSUPPORTED_MEDIA_TYPE', details: { invalid: ['front:image/gif'] } } }
          ]
        }
      }
    }
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parts = (req as any).parts();
    const t0 = Date.now();
    let photoBuf: Buffer | undefined;
    let frontBuf: Buffer | undefined;
    let backBuf: Buffer | undefined;
    let signatureBuf: Buffer | undefined;
    let photoType: 'passport' | 'profile' | 'driver_license' = 'profile';
    let customerId: number | undefined;
    let kycStep: string = 'step3';
    const docHashes: Record<string, string> = {};
    const invalidFormats: string[] = [];
    let fileCount = 0;
    const sizeViolations: string[] = [];
    const dimViolations: string[] = [];
    // Critères et exigences pour harmoniser front/back
    const validationCriteria = {
      passport: { backgroundStdDevMax: 25, blurMin: 20, contrastMin: 6, rgbDeltaMax: 50, minDimension: 500, recommendedDimension: 600, dpiMin: 0, whiteRatioMin: 0.65, brightnessMin: 160, portraitOnly: true, headHeightRatioRange: [0.7, 0.8] },
      profile: { backgroundStdDevMax: 20, blurMin: 20, contrastMin: 6, rgbDeltaMax: 35, minDimension: 500, whiteRatioMin: 0.65, brightnessMin: 160, portraitOnly: true }
    } as const;
    const requirements = [
      'Format recommandé: JPEG (PNG accepté)',
      'Orientation portrait ou carré',
      'Fond blanc uniforme (sans motifs)',
      'Un seul visage, centré',
      'Yeux ouverts, bouche fermée, expression neutre',
      'Dimensions (passeport): recommandé 600x600 (minimum 500x500)',
      'Résolution (passeport): ≥ 200 DPI',
      'Luminosité et contraste suffisants, photo non floue'
    ];

    for await (const part of parts) {
      if (part.type === 'file') {
        const buf = await part.toBuffer();
        const mt = (part as any).mimetype || '';
        // Supporter également image/jpg, et préférer JPEG pour les photos d'identité
        const isSupported = /(image\/jpeg|image\/jpg|image\/png)/i.test(mt);
        if (!isSupported) invalidFormats.push(`${part.fieldname}:${mt || 'unknown'}`);
        // Vérification taille (bloquante)
        const sizeCheck = validateBufferSize(buf.length);
        if (!sizeCheck.ok) {
          sizeViolations.push(`${part.fieldname}:${buf.length}B`);
        }
        // Vérification dimensions (bloquante pour images)
        if (/^image\//i.test(mt)) {
          try {
            const s = await computeImageStats(buf);
            const dimCheck = validateImageDimensions(s.width, s.height);
            if (!dimCheck.ok) {
              dimViolations.push(`${part.fieldname}:${s.width}x${s.height}`);
            }
          } catch {}
        }
        fileCount++;
        if (part.fieldname === 'photo') photoBuf = buf;
        else if (part.fieldname === 'front') frontBuf = buf;
        else if (part.fieldname === 'back') backBuf = buf;
        else if (part.fieldname === 'signature') signatureBuf = buf;
      } else if (part.type === 'field') {
        if (part.fieldname === 'photoType' && ['passport', 'profile', 'driver_license'].includes(part.value)) {
          photoType = part.value as any;
        } else if (part.fieldname === 'customerId') {
          const cid = Number(part.value);
          if (!Number.isNaN(cid) && cid > 0) customerId = cid;
        } else if (part.fieldname === 'kycStep') {
          if (typeof part.value === 'string' && part.value) kycStep = part.value;
        }
      }
    }

    if (invalidFormats.length > 0) {
      return reply.status(415).send({ error: 'Format non accepté — veuillez utiliser JPG ou PNG.', code: 'UNSUPPORTED_MEDIA_TYPE', details: { invalid: invalidFormats }, validationCriteria, requirements });
    }
    if (fileCount === 0) {
      return reply.status(400).send({ error: 'No files provided', code: 'MISSING_FILE', validationCriteria, requirements });
    }
    if (sizeViolations.length > 0) {
      return reply.status(400).send({
        error: 'File size out of bounds',
        code: 'INVALID_SIZE',
        details: { minBytes: FILE_SIZE_LIMITS.minBytes, maxBytes: FILE_SIZE_LIMITS.maxBytes, invalid: sizeViolations },
        validationCriteria,
        requirements
      });
    }
    if (dimViolations.length > 0) {
      return reply.status(400).send({
        error: 'Image dimensions out of bounds',
        code: 'INVALID_DIMENSIONS',
        details: {
          minWidth: IMAGE_DIM_LIMITS.minWidth,
          minHeight: IMAGE_DIM_LIMITS.minHeight,
          maxWidth: IMAGE_DIM_LIMITS.maxWidth,
          maxHeight: IMAGE_DIM_LIMITS.maxHeight,
          invalid: dimViolations
        },
        validationCriteria,
        requirements
      });
    }

    const report: ValidationReport = { score: 0, status: 'failed' };
    const timers: { [k: string]: number } = {};
    // NOTE: analyser la photo AVANT normalisation pour conserver les dimensions originales dans les checks
    // La normalisation (500x500) sera appliquée APRÈS l'analyse afin de ne pas masquer les violations de dimensions
    try {
      if (frontBuf) {
        const { buffer: cfront, cropped } = await autoCropDocument(frontBuf);
        frontBuf = cfront;
        (report as any).frontPreprocess = { cropped };
      }
      if (backBuf) {
        const { buffer: cback, cropped } = await autoCropDocument(backBuf);
        backBuf = cback;
        (report as any).backPreprocess = { cropped };
      }
    } catch {}
    if (photoBuf) {
      const tp = Date.now();
      const photoRes = await analyzePhoto(photoBuf, photoType);
      const normalizedPhotoStats: Record<string, string | number | boolean> | undefined = (photoRes as any).stats
        ? { ...(photoRes as any).stats, faceCentered: Boolean((photoRes as any).stats?.faceCentered) }
        : undefined;
      report.photo = { ok: photoRes.ok, messages: photoRes.messages, suggestions: (photoRes as any).suggestions || [], stats: normalizedPhotoStats } as any;
      const statusSimple = photoRes.ok ? 'approved' : 'rejected';
      const errorsSimple: string[] = Array.isArray(photoRes.messages) ? photoRes.messages : [];
      const st = (photoRes as any).stats || {};
      const details = {
        face_detected: Boolean(st.faceDetected),
        multiple_faces: (Number(st.faceCount) || 0) > 1,
        background_uniform: typeof st.backgroundStdDev === 'number' ? st.backgroundStdDev <= 22 : false,
        min_dimensions_met: typeof st.width === 'number' && typeof st.height === 'number' ? (st.width >= 200 && st.height >= 200) : false
      };
      (report as any).photoSummary = { status: statusSimple, errors: errorsSimple, details };
      (report as any).checks = { ...(report as any).checks, photoOk: photoRes.ok };
      // Détection faciale indisponible → message explicite pour permettre une pondération partielle dans le score
      const faceCodes: string[] = Array.isArray((photoRes as any)?.stats?.codes) ? ((photoRes as any).stats.codes as string[]) : [];
      const faceDetectionUnavailableMsg = faceCodes.includes('FACE_DETECTION_UNAVAILABLE')
        ? ['Détection faciale temporairement indisponible']
        : (photoRes.ok ? [] : ['Visage absent ou non centré']);
      report.face = {
        ok: Boolean((photoRes as any).stats?.faceDetected),
        messages: faceDetectionUnavailableMsg,
        stats: {
          faceDetected: Boolean((photoRes as any).stats?.faceDetected),
          faceCentered: Boolean((photoRes as any).stats?.faceCentered),
          faceCount: (photoRes as any).stats?.faceCount,
          decision: (photoRes as any).stats?.decision
        }
      };
      // Appliquer la normalisation photo 500x500 APRÈS l'analyse pour éviter de masquer une photo trop petite
      try {
        if (photoBuf && (photoType === 'profile' || photoType === 'passport')) {
          const { buffer: norm, normalized, original } = await normalizeProfilePhoto(photoBuf, 500);
          photoBuf = norm;
          (report as any).photoPreprocess = { normalized, original };
          // Si l'image originale était <500 sur un des côtés, joindre un message de suggestion et un code non bloquant
          try {
            const minSide = Math.min(original.width, original.height);
            if (minSide < 500) {
              (report as any).photo.messages = Array.isArray((report as any).photo?.messages) ? (report as any).photo.messages : [];
              // Ne pas bloquer via HTTP 400: conserver en message de rejet logique, et suggestions
              (report as any).photo.messages.push('Dimensions originales insuffisantes (<500 px)');
              const globalSuggestions: string[] = Array.isArray((report as any).suggestions) ? (report as any).suggestions : [];
              if (!globalSuggestions.includes('Utilisez une image d’au moins 600x600')) {
                globalSuggestions.push('Utilisez une image d’au moins 600x600');
              }
              (report as any).suggestions = globalSuggestions;
              (report as any).photoSummary = {
                ...(report as any).photoSummary,
                details: {
                  ...((report as any).photoSummary?.details || {}),
                  min_dimensions_met: false
                }
              };
              // Marquer photoRes comme non OK si pas déjà
              if ((report as any).photo && (report as any).photo.ok) (report as any).photo.ok = false;
            }
          } catch {}
        }
      } catch {}

      // Logging détaillé pour calibration IA
      try {
        const st = (photoRes as any).stats as any;
        const m = (report as any).photoPreprocess?.original;
        appendPhotoLog({
          ts: new Date().toISOString(),
          file_name: undefined, // part.filename non conservé ici (multipart flux), laisser undefined
          file_size: photoBuf.length,
          image_format: 'image',
          face_count: st?.faceCount ?? undefined,
          face_position: st?.boxes?.[0] ? { cx: (st.boxes[0].x + st.boxes[0].width / 2), cy: (st.boxes[0].y + st.boxes[0].height / 2) } : null,
          sharpness_score: st?.blur,
          brightness_score: st?.brightness,
          background_variance: st?.backgroundStdDev,
          rgb_balance_delta: st?.rgbBalanceDelta,
          decision: st?.decision ?? (photoRes.ok ? 'accepted' : 'rejected'),
          codes: Array.isArray(st?.codes) ? st.codes : undefined,
          suggestions: Array.isArray((photoRes as any).suggestions) ? (photoRes as any).suggestions : undefined
        });
      } catch {}

      // Bloquer l'upload si la photo est rejetée, sauf si c'est à cause de la détection faciale indisponible
      const isFaceDetectionUnavailable = Array.isArray((photoRes as any)?.stats?.codes) && 
        ((photoRes as any).stats.codes as string[]).includes('FACE_DETECTION_UNAVAILABLE');
      
      // Si la détection faciale est indisponible, on accepte la photo pour validation manuelle
      if (isFaceDetectionUnavailable) {
        (req as any).log?.info?.('kyc validate: face detection unavailable, accepting photo for manual review');
      } else if (!photoRes.ok) {
        const codes: string[] = Array.isArray((photoRes as any)?.stats?.codes) ? ((photoRes as any).stats.codes as string[]) : [];
        const st = (photoRes as any).stats || {};
        const metadata = {
          width: st.width,
          height: st.height,
          brightness: st.brightness,
          contrast: st.contrast,
          blur: st.blur,
          backgroundStdDev: st.backgroundStdDev,
          rgbBalanceDelta: st.rgbBalanceDelta,
          whitePixelRatio: st.whitePixelRatio,
          faceDetected: st.faceDetected,
          faceCentered: st.faceCentered,
          faceCount: st.faceCount,
          faceBox: Array.isArray(st.boxes) ? st.boxes[0] : undefined,
          decision: st.decision
        };
        // Log clair côté serveur pour diagnostiquer les rejets avec détails complets
        (req as any).log?.warn?.({
          codes,
          metadata,
          messages: Array.isArray(photoRes.messages) ? photoRes.messages : [],
          suggestions: Array.isArray((photoRes as any).suggestions) ? (photoRes as any).suggestions : [],
          fileSize: photoBuf.length,
          photoType
        }, 'kyc validate: photo rejected - codes: ' + codes.join(', '));

        // Create a clean payload object to avoid serialization issues
        const payload = {
          status: 'failed',
          isValid: false,
          score: 0,
          scoreRatio: 0,
          allowUpload: false,
          error: 'Photo invalide',
          code: codes.length ? codes[0] : 'PHOTO_INVALID',
          messages: Array.isArray(photoRes.messages) ? photoRes.messages.map((msg: any) => String(msg)) : [],
          suggestions: (photoRes as any).suggestions || [],
          photoSummary: (report as any).photoSummary,
          photo: report.photo,
          checks: (report as any).checks || undefined,
          decision: 'rejected',
          codes,
          metadata,
          validationCriteria,
          requirements
        };
        
        // NE PAS retourner 400 ici - laisser le processus continuer pour le scoring final
        // Les erreurs seront incluses dans le rapport final sans bloquer l'upload
        (report as any).photoRejection = payload;
    }
    
    // Déduplication base de données pour la photo
      try {
        const ph = sha256(photoBuf);
        docHashes.photo = ph;
        if (await checkDuplicateHash(ph)) {
          if (report.photo) report.photo.messages.push('Fichier déjà uploadé (doublon base)');
        } else {
          await insertDocumentHash(ph, 'photo', customerId);
        }
      } catch {}
      timers.photoMs = Date.now() - tp;
    }
    if (signatureBuf) {
      const ts = Date.now();
      report.signature = await analyzeSignature(signatureBuf);
      // Déduplication base de données pour la signature
      try {
        const sh = sha256(signatureBuf);
        docHashes.signature = sh;
        if (await checkDuplicateHash(sh)) {
          report.signature.messages.push('Signature déjà uploadée (doublon base)');
        } else {
          await insertDocumentHash(sh, 'signature', customerId);
        }
      } catch {}
      timers.signatureMs = Date.now() - ts;
    }
    if (frontBuf && backBuf) report.front = { ok: true, messages: [] }; // detailed stats embedded in cardSides
    if (frontBuf && backBuf) {
      const tc = Date.now();
      const cards = await analyzeCardSides(frontBuf, backBuf);
      report.front = { ok: cards.ok, messages: cards.messages, stats: cards.stats.front };
      report.back = { ok: cards.ok, messages: cards.messages, stats: cards.stats.back };
      // Hugging Face visual document scoring on front side
      try {
        const vis = await scoreDocumentRealness(frontBuf);
        if (!vis.ok) {
          report.front.messages.push('Document visuel non reconnu par modèle');
        }
        report.front.stats = {
          ...(report.front.stats || {}),
          hfTopLabel: vis.stats?.topLabel ?? '',
          hfTopScore: vis.stats?.topScore ?? -1
        };
        (report as any).checks = { ...(report as any).checks, visualDocOk: vis.ok };
      } catch {}
      // Déduplication base de données pour recto/verso
      try {
        const fh = sha256(frontBuf);
        const bh = sha256(backBuf);
        docHashes.front = fh; docHashes.back = bh;
        if (await checkDuplicateHash(fh)) {
          report.front.messages.push('Recto déjà uploadé (doublon base)');
        } else {
          await insertDocumentHash(fh, 'front', customerId);
        }
        if (await checkDuplicateHash(bh)) {
          report.back.messages.push('Verso déjà uploadé (doublon base)');
        } else {
          await insertDocumentHash(bh, 'back', customerId);
        }
      } catch {}
      timers.cardMs = Date.now() - tc;
    }
    if (frontBuf) {
      const tocr = Date.now();
      // Prétraitement du recto: auto-crop déjà effectué plus haut; améliorer l'OCR et upscaler si nécessaire
      let frontProcessed = frontBuf;
      try {
        // Amélioration (contraste/netteté) pour OCR
        frontProcessed = await enhanceForOCR(frontProcessed as any);
        // Upscale si trop petit pour une meilleure reconnaissance
        const fStatsCur = await computeImageStats(frontProcessed);
        const minSideF = Math.min(fStatsCur.width, fStatsCur.height);
        if (minSideF > 0 && minSideF < 500) {
          const scaleF = Math.ceil(1000 / minSideF);
          const newWF = Math.max(1, Math.floor(fStatsCur.width * scaleF));
          const newHF = Math.max(1, Math.floor(fStatsCur.height * scaleF));
          frontProcessed = await sharp(frontProcessed as any).resize(newWF, newHF, { withoutEnlargement: false }).toBuffer();
        }
      } catch {}
      const ocr = await runDocumentOCR(frontProcessed);
      report.ocr = {
        ok: ocr.docTypeDetected !== 'unknown',
        messages: [],
        stats: { docTypeDetected: ocr.docTypeDetected, mrzValid: ocr.mrz.valid, keywordsCsv: Array.isArray(ocr.keywords) ? ocr.keywords.join(',') : '' }
      } as any;
      (report as any).checks = { ...(report as any).checks, mrzValid: ocr.mrz.valid, keywordsOk: (ocr.docTypeDetected !== 'unknown') };
      timers.ocrMs = Date.now() - tocr;
    }

    // Perform OCR on back side too, and parse Congolese license verso details
    if (backBuf) {
      const tocrB = Date.now();
      // Prétraitement du verso: auto-crop, amélioration OCR, upscaling si trop petit
      let backProcessed = backBuf;
      try {
        const crop = await autoCropDocument(backProcessed as any);
        backProcessed = crop.buffer as any;
        backProcessed = await enhanceForOCR(backProcessed);
        const bStatsCur = await computeImageStats(backProcessed);
        const minSide = Math.min(bStatsCur.width, bStatsCur.height);
        if (minSide > 0 && minSide < 500) {
          const scale = Math.ceil(1000 / minSide);
          const newW = Math.max(1, Math.floor(bStatsCur.width * scale));
          const newH = Math.max(1, Math.floor(bStatsCur.height * scale));
          backProcessed = await sharp(backProcessed as any).resize(newW, newH, { withoutEnlargement: false }).toBuffer();
        }
      } catch {}
      // Essayer OCR en double orientation (original + rotation 90°) et choisir le meilleur
      const candidateOriginal = backProcessed;
      const candidateRotated = await sharp(backProcessed as any).rotate(90).toBuffer();
      const [ocrOrig, ocrRot] = await Promise.all([runDocumentOCR(candidateOriginal), runDocumentOCR(candidateRotated)]);
      const parsedOrig = parseLicenceBackFromOCR(ocrOrig?.text || '');
      const parsedRot = parseLicenceBackFromOCR(ocrRot?.text || '');
      const scoreOCR = (ocr: any, parsed: any) => {
        let s = 0;
        if (ocr?.docTypeDetected === 'driver_license') s += 3;
        if (Array.isArray(parsed?.categories) && parsed.categories.length > 0) s += 2;
        if (parsed?.issueDate && parsed?.expiryDate) s += 2;
        if (parsed?.birthDate) s += 1;
        // plus de mots-clés = meilleur
        if (Array.isArray(ocr?.keywords)) s += Math.min(ocr.keywords.length, 3);
        return s;
      };
      const sOrig = scoreOCR(ocrOrig, parsedOrig);
      const sRot = scoreOCR(ocrRot, parsedRot);
      const useRot = sRot > sOrig;
      const ocrB = useRot ? ocrRot : ocrOrig;
      const parsedBack = useRot ? parsedRot : parsedOrig;
      (report as any).ocrBack = {
        ok: ocrB.docTypeDetected !== 'unknown',
        messages: [],
        stats: { docTypeDetected: ocrB.docTypeDetected, mrzValid: ocrB.mrz.valid, keywordsCsv: Array.isArray(ocrB.keywords) ? ocrB.keywords.join(',') : '' }
      };
      report.back = report.back || { ok: true, messages: [], stats: {} };
      report.back.messages.push('Analyse OCR du verso effectuée');
      if (ocrB.docTypeDetected !== 'driver_license') {
        report.back.messages.push('Verso: type de document non reconnu comme permis de conduire');
      } else {
        // Notify local storage success exclusivement pour un permis reconnu
        report.back.messages.push('Verso enregistré localement');
      }
      report.back.messages.push(`OCR verso orientation: ${useRot ? 'rotation 90°' : 'originale'}`);
      if (!parsedBack.categories || parsedBack.categories.length === 0) {
        report.back.messages.push('Catégories non détectées sur le verso');
      }
      if (!parsedBack.issueDate || !parsedBack.expiryDate) {
        report.back.messages.push("Dates de délivrance/expiration non détectées sur le verso");
      }
      if (!parsedBack.birthDate) {
        report.back.messages.push('Date de naissance non détectée sur le verso');
      }
      report.back.stats = {
        ...(report.back.stats || {}),
        docTypeDetected: ocrB.docTypeDetected,
        ocrKeywordsCsv: Array.isArray(ocrB.keywords) ? ocrB.keywords.join(',') : '',
        ocrExtractCategories: Array.isArray(parsedBack.categories) ? parsedBack.categories.join(',') : '',
        ocrExtractIssueDate: parsedBack.issueDate || '',
        ocrExtractExpiryDate: parsedBack.expiryDate || '',
        ocrExtractBirthDate: parsedBack.birthDate || ''
      };
      // Heuristique de reconnaissance du verso permis (catégories ou duo dates ou naissance)
      const likelyLicenseBack = (ocrB.docTypeDetected === 'driver_license')
        || (Array.isArray(parsedBack.categories) && parsedBack.categories.length >= 1)
        || (!!parsedBack.issueDate && !!parsedBack.expiryDate)
        || (!!parsedBack.birthDate);
      (report.back.stats as any).isLikelyLicenseBack = likelyLicenseBack;
      if (!likelyLicenseBack) {
        report.back.messages.push('Verso: éléments caractéristiques du permis manquants (catégories/dates)');
      }
      (report as any).checks = { ...(report as any).checks, ocrBackOk: (ocrB.docTypeDetected !== 'unknown') };
      timers.ocrMs = (timers.ocrMs || 0) + (Date.now() - tocrB);
    }

    const tscore = Date.now();
    report.score = computeScore(report);
    timers.scoreMs = Date.now() - tscore;
    report.status = finalizeStatus(report);
    timers.totalMs = Date.now() - t0;

    (report as any).timers = timers;

    // Synchroniser les hachages dans kyc_drafts si customerId fourni
    if (customerId && Object.keys(docHashes).length > 0) {
      try {
        await upsertKycDraftHashes(customerId, kycStep, docHashes);
        (report as any).dbSync = { kycDraftUpdated: true, customerId, kycStep };
      } catch (e) {
        (report as any).dbSync = { kycDraftUpdated: false, error: 'kyc_drafts sync failed' };
      }
    }

    // Résumé simplifié pour le frontend
    const detectedType = (report.ocr as any)?.docTypeDetected ?? null;
    const scoreRatio = Math.round(report.score) / 100;
    const isValid = report.status !== 'failed';
    let message = report.status === 'ok'
      ? 'Document conforme et lisible.'
      : (report.status === 'flagged' ? 'Document à vérifier manuellement.' : 'Document invalide ou non conforme.');
    // Préciser les raisons exactes si rejet et messages photo disponibles
    if (!isValid && Array.isArray(report.photo?.messages) && (report.photo as any).messages.length > 0) {
      message = 'Photo invalide: ' + (report.photo as any).messages.join('; ');
    }

    const errorCode = Array.isArray((report.photo as any)?.stats?.codes) && ((report.photo as any).stats.codes as any[]).length
      ? ((report.photo as any).stats.codes[0] as string)
      : undefined;
    const suggestions = Array.isArray((report.photo as any)?.suggestions) ? (report.photo as any).suggestions : [];

    reply.send({
      isValid,
      detectedType,
      message,
      scoreRatio,
      errorCode,
      suggestions,
      photoSummary: (report as any).photoSummary,
      checks: (report as any).checks || undefined,
      decision: ((report as any)?.photo?.stats?.decision),
      codes: Array.isArray(((report as any)?.photo?.stats?.codes)) ? ((report as any).photo.stats.codes as string[]) : [],
      metadata: (function(){ const st = ((report as any)?.photo?.stats) || {}; return {
        width: st.width,
        height: st.height,
        brightness: st.brightness,
        contrast: st.contrast,
        blur: st.blur,
        backgroundStdDev: st.backgroundStdDev,
        rgbBalanceDelta: st.rgbBalanceDelta,
        whitePixelRatio: st.whitePixelRatio,
        faceDetected: st.faceDetected,
        faceCentered: st.faceCentered,
        faceCount: st.faceCount,
        faceBox: Array.isArray(st.boxes) ? st.boxes[0] : undefined,
        decision: st.decision
      }; })(),
      validationCriteria,
      requirements,
      ...report
    });
  });
}