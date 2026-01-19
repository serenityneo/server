import Tesseract from 'tesseract.js';

export type MRZResult = { valid: boolean; raw?: string };
export type OCRDocResult = {
  text: string;
  mrz: MRZResult;
  docTypeDetected: 'passport' | 'voter_card' | 'driver_license' | 'police_card' | 'unknown';
  keywords: string[];
};

let ocrWorker: any | null = null;

export async function initOCR(): Promise<void> {
  try {
    // Utilise le worker si disponible pour réduire la latence des premières requêtes
    if ((Tesseract as any).createWorker && !ocrWorker) {
      const createWorker = (Tesseract as any).createWorker;
      const worker = await createWorker({ logger: () => {} });
      await worker.loadLanguage('eng+fra');
      await worker.initialize('eng+fra');
      ocrWorker = worker;
    }
  } catch (err) {
    // En cas d’échec, on gardera le fallback Tesseract.recognize à la demande
    // pour ne pas bloquer le boot du serveur.
    // eslint-disable-next-line no-console
    console.warn('[OCR] init failed, fallback to direct recognize:', err);
  }
}

export async function runDocumentOCR(buffer: Buffer): Promise<OCRDocResult> {
  let data: any;
  if (ocrWorker) {
    data = (await ocrWorker.recognize(buffer))?.data;
  } else {
    data = (await Tesseract.recognize(buffer, 'eng+fra', { logger: () => {} })).data;
  }
  const text = normalizeText(data?.text || '');
  const mrz = detectMRZ(text);
  const docTypeDetected = classifyDocumentType(text);
  const keywords = computeKeywords(text);
  return { text, mrz, docTypeDetected, keywords };
}

function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectMRZ(text: string): MRZResult {
  const mrzRegex = /([A-Z0-9<]{44}\n[A-Z0-9<]{44})/i;
  const match = text.match(mrzRegex);
  return { valid: !!match, raw: match?.[0] };
}

function classifyDocumentType(text: string): OCRDocResult['docTypeDetected'] {
  // Mirror frontend rules from ui/src/lib/validations/ocr/document-ocr.ts with normalization
  const has = (kws: string[]) => kws.some((k) => text.includes(k));
  const hasRegex = (re: RegExp) => re.test(text);
  const passportKw = [
    'republique democratique du congo',
    'democratic republic of the congo',
    'passeport',
    'passport',
    'type',
    'numero',
    'n passeport',
    'number of passport',
    'nationality',
    'nationalite',
    'place of birth',
    'lieu de naissance',
    'date of birth',
    'date de naissance',
    'authority',
    'autorite',
    'ministere',
    'ministry',
    'page',
    'photo'
  ];
  const voterKw = [
    'commission electorale nationale independante',
    'commission electorale',
    'ceni',
    'carte d electeur',
    'carte d electeur',
    'carte electeur',
    'code cielect',
    'code ci',
    'numero electeur',
    'n bre d electeur',
    'n de votant',
    'bureau de vote',
    'voter',
    'voter is a right',
    'nom',
    'post nom',
    'prenom',
    'date de naissance',
    'lieu de delivrance',
    'valable',
    'voter est un droit',
    'enrolement'
  ];
  const driverKw = [
    'permis de conduire',
    'driving license',
    'permit',
    'conduite',
    'permis',
    'ministere des transports',
    'ministry of transports',
    'categories',
    'category',
    'categorie',
    'date de delivrance',
    'date of issue',
    'delivre le',
    'date d expiration',
    'expiry date',
    'expire le',
    'expiration',
    'valable jusqu',
    'numero de permis',
    'n permis',
    'cgo'
  ];
  // Heuristique forte pour le verso du permis: présence de codes catégories
  const driverCatRegex = /\b(a1|a|b1|b|c1|c|d1|d|be|ce|de)\b/;
  // Heuristique dates en paires (issue | expiry ou proches labels)
  const pairDateRegex = /\b\d{2}[./-]\d{2}[./-]\d{2,4}\b.*\b\d{2}[./-]\d{2}[./-]\d{2,4}\b/;
  const policeKw = [
    'police nationale congolaise',
    'pnc',
    'police',
    'carte de service',
    'carte professionnelle',
    'ministere de l interieur',
    'ministere de l interieur et securite',
    'agent de police',
    'numero matricule',
    'matricule',
    // Renforcements alignés avec le frontend
    'carte d agent',
    'carte d agent de police',
    'carte de police',
    'identite professionnelle',
    'fonction',
    'grade',
    'brigadier',
    'inspecteur',
    'unite',
    'commissariat',
    'direction generale de la police',
    'direction de la police',
    'police congolaise'
  ];
  if (has(passportKw)) return 'passport';
  if (has(voterKw)) return 'voter_card';
  if (has(driverKw) || hasRegex(driverCatRegex) || hasRegex(pairDateRegex)) return 'driver_license';
  if (has(policeKw)) return 'police_card';
  return 'unknown';
}

function computeKeywords(text: string): string[] {
  const fields = [
    'nom',
    'prenom',
    'date naissance',
    'numero',
    'expire',
    'delivre',
    'province',
    'commune',
    // Champs utiles pour carte_police
    'matricule',
    'fonction',
    'grade',
    'unite',
    'commissariat'
  ];
  return fields.filter((f) => text.includes(f));
}