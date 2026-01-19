import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { parseLicenceBackFromOCR } from '../services/licenseOcr';

type VerifyResult = {
  ok: boolean;
  status: 'verified' | 'not_found' | 'unknown' | 'error';
  message?: string;
  details?: Record<string, any>;
};

export function registerLicenseVerifyRoute(app: FastifyInstance) {
  app.post('/kyc/license/verify', {
    schema: {
      tags: ['kyc'],
      summary: 'Vérification permis de conduire via CONADEP (scraping)',
      description: 'Soumet le formulaire CONADEP pour vérifier un numéro CD + 7 chiffres',
      body: {
        type: 'object',
        properties: {
          licenseNumber: { type: 'string' },
          ocrText: { type: 'string' }
        },
        required: ['licenseNumber']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            status: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object', additionalProperties: true }
          }
        },
        400: { type: 'object', properties: { ok: { type: 'boolean' }, status: { type: 'string' }, message: { type: 'string' } } },
        500: { type: 'object', properties: { ok: { type: 'boolean' }, status: { type: 'string' }, message: { type: 'string' } } }
      }
    }
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (req as any).body || {};
      const licRaw = String(body?.licenseNumber || '').trim().toUpperCase();
      const ocrText = typeof body?.ocrText === 'string' ? body.ocrText : null;
      const lic = licRaw;
      const matchFromOCR = lic && ocrText ? normalize(ocrText).includes(lic) : undefined;

      (req as any).log?.info?.({ licenseNumber: lic, hasOCR: Boolean(ocrText) }, 'license verify: request received');

      if (!/^CD\d{7}$/.test(lic)) {
        return reply.status(400).send({ ok: false, status: 'error', message: 'Format attendu: CD + 7 chiffres (ex: CD0206776)' });
      }

      // Étape 1: charger la page pour récupérer CSRF + structure du formulaire
      const getResp = await fetch('https://www.conadep.cd/verification-permis/', {
        method: 'GET',
        headers: { 'Accept': 'text/html', 'User-Agent': UA },
        redirect: 'follow'
      } as any);
      if (!getResp || !(getResp as any).ok) {
        (req as any).log?.warn?.({ lic }, 'license verify: CONADEP page unavailable');
        return reply.status(200).send({ ok: false, status: 'unknown', message: 'Page de vérification indisponible' });
      }
      const html = await (getResp as any).text();
      const setCookie = (getResp as any).headers?.get?.('set-cookie') || '';
      const csrfCookie = (/csrftoken=([^;]+)/i.exec(setCookie)?.[1]) || undefined;

  const formInfo = extractFormInfo(html);
  const params = new URLSearchParams();
  if (formInfo.csrfInputValue) params.set('csrfmiddlewaretoken', formInfo.csrfInputValue);
  const licFieldNames = formInfo.licenseFieldNames.length ? formInfo.licenseFieldNames : ['numero', 'license', 'licence', 'permis', 'code', 'code2'];
  for (const name of licFieldNames) params.set(name, lic);
  for (const [name, value] of Object.entries(formInfo.hiddenInputs)) {
    if (!params.has(name)) params.set(name, value ?? '');
  }

      // Étape 2: soumettre le formulaire POST vers /VerificationPermisConduire/
      const postResp = await fetch('https://www.conadep.cd/VerificationPermisConduire/', {
        method: 'POST',
        headers: {
          'Accept': 'text/html, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'https://www.conadep.cd',
          'Referer': 'https://www.conadep.cd/verification-permis/',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': UA,
          ...(csrfCookie ? { 'Cookie': `csrftoken=${csrfCookie}` } : {})
        },
        body: params.toString(),
        redirect: 'follow'
      } as any);

  const postHtml = await (postResp as any).text();
  const plainText = htmlToText(postHtml);
  const notFound = /Permis\s*de\s*Conduire\s*Non\s*d[ée]tect[ée][^.!]*[.!]/i.test(plainText) || /Non\s*d[ée]tect[ée]/i.test(postHtml);
  const detected = /Permis\s*de\s*Conduire\s*d[ée]tect[ée]/i.test(plainText) || /d[ée]tect[ée]/i.test(postHtml);

      if (notFound) {
        (req as any).log?.info?.({ lic }, 'license verify: not found');
        return reply.status(200).send({
          ok: true,
          status: 'not_found',
          message: 'Permis non détecté par CONADEP',
          details: { matchFromOCR, remoteStatus: 'not_found', htmlExcerpt: plainText.slice(0, 300) }
        });
      }

      // Extraire au mieux les paires (libellé → valeur) depuis le HTML de table
  const extractedFromHtml = extractKeyValuesFromHtml(postHtml);
  const remoteDetails = Object.keys(extractedFromHtml).length
    ? extractedFromHtml
    : extractKeyValues(plainText);
  const hasSomeDetail = Object.keys(remoteDetails).length > 0;
  // OCR extract from client-provided text (verso permis)
  const ocrExtract = parseLicenceBackFromOCR(ocrText || undefined);
  // Normalize remote categories into a set
  const catRegex = /\b(A1|A|B1|B|C1|C|D1|D|BE|CE|DE)\b/g;
  const remoteCatSet = new Set<string>();
  if (typeof remoteDetails.categorie === 'string') {
    let mm: RegExpExecArray | null; const S = remoteDetails.categorie.toUpperCase();
    while ((mm = catRegex.exec(S)) !== null) remoteCatSet.add(mm[1]);
  }
  const categoriesMatch = ocrExtract.categories.length > 0 && remoteCatSet.size > 0
    ? ocrExtract.categories.every(c => remoteCatSet.has(c))
    : undefined;

  // Normalize date strings to ISO yyyy-mm-dd
  const toISO = (s?: string | null): string | null => {
    if (!s) return null; const m = /(\d{2})[./-](\d{2})[./-](\d{2,4})/.exec(s); if (!m) return null;
    let yy = parseInt(m[3], 10); if (m[3].length === 2) { const cutoff = new Date().getFullYear() % 100; yy = yy <= cutoff ? 2000 + yy : 1900 + yy; }
    const dd = String(parseInt(m[1], 10)).padStart(2, '0'); const mm = String(parseInt(m[2], 10)).padStart(2, '0'); return `${yy}-${mm}-${dd}`;
  };
  // Remote dates may be separate or combined with "|"
  const remoteIssue = toISO(String(remoteDetails.date_emission || remoteDetails.date_delivrance || '').split('|')[0].trim());
  const remoteExpiry = toISO(String(remoteDetails.date_expiration || '').split('|').slice(-1)[0].trim());
  const remoteBirth = toISO(String(remoteDetails.date_naissance || '').trim());
  const issueDateMatch = (ocrExtract.issueDate && remoteIssue) ? (ocrExtract.issueDate === remoteIssue) : undefined;
  const expiryDateMatch = (ocrExtract.expiryDate && remoteExpiry) ? (ocrExtract.expiryDate === remoteExpiry) : undefined;
  const birthDateMatch = (ocrExtract.birthDate && remoteBirth) ? (ocrExtract.birthDate === remoteBirth) : undefined;

  const numeroRemote = String(remoteDetails.numero_licence || '').toUpperCase();
  const licenseNumberMatch = numeroRemote ? numeroRemote.includes(lic) || lic.includes(numeroRemote) : undefined;

  const mismatches: string[] = [];
  if (categoriesMatch === false) mismatches.push('catégories OCR ≠ catégories officielles');
  if (issueDateMatch === false) mismatches.push('date de délivrance OCR ≠ officielle');
  if (expiryDateMatch === false) mismatches.push('date d\'expiration OCR ≠ officielle');
  if (birthDateMatch === false) mismatches.push('date de naissance OCR ≠ officielle');
  if (licenseNumberMatch === false) mismatches.push('numéro licence ≠ officiel');

  (req as any).log?.info?.({ lic, detailCount: Object.keys(remoteDetails).length }, 'license verify: success');
  return reply.status(200).send({
    ok: true,
    status: (hasSomeDetail || detected) ? 'verified' : 'unknown',
    message: (hasSomeDetail || detected) ? 'Permis détecté' : 'Réponse reçue sans détails exploitables',
    details: {
      matchFromOCR,
      remoteStatus: (hasSomeDetail || detected) ? 'ok' : 'unknown',
      remoteDetails,
      ocrExtract,
      comparison: {
        licenseNumberMatch,
        categoriesMatch,
        issueDateMatch,
        expiryDateMatch,
        birthDateMatch,
        mismatches
      },
      htmlExcerpt: plainText.slice(0, 700),
      htmlRaw: postHtml.slice(0, 1200)
    }
  });
    } catch (error) {
      (req as any).log?.error?.({ err: error }, 'license verify failed');
      // Réponse tolérante: ne bloque pas l’UX, signale état inconnu
      return reply.status(200).send({ ok: false, status: 'unknown', message: 'Vérification indisponible pour le moment' });
    }
  });
}

function normalize(s: string) {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function extractFormInfo(html: string): {
  csrfInputValue?: string;
  hiddenInputs: Record<string, string | undefined>;
  licenseFieldNames: string[];
} {
  const hiddenInputs: Record<string, string | undefined> = {};
  const licenseFieldNames: string[] = [];

  const csrfMatch = /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/i.exec(html);
  const csrfInputValue = csrfMatch?.[1];

  const formRegex = /<form[^>]*action=["']\/?VerificationPermisConduire\/["'][^>]*>([\s\S]*?)<\/form>/i;
  const formMatch = formRegex.exec(html);
  const formInner = formMatch?.[1] || html;

  const inputRegex = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRegex.exec(formInner)) !== null) {
    const tag = m[0];
    const name = /name=["']([^"']+)["']/i.exec(tag)?.[1];
    const type = /type=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() || 'text';
    const value = /value=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!name) continue;
    if (type === 'hidden') {
      hiddenInputs[name] = value;
      if (/^code2?$/.test(name)) {
        licenseFieldNames.push(name);
      }
    } else {
      if (/licen|licen[cs]e|permis|numero|num[ée]ro/i.test(name)) {
        licenseFieldNames.push(name);
      } else if (type === 'text') {
        licenseFieldNames.push(name);
      }
    }
  }

  return { csrfInputValue, hiddenInputs, licenseFieldNames };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeyValues(text: string): Record<string, string> {
  const kv: Record<string, string> = {};
  const patterns = [
    /(Nom|Noms?\s+et\s+Pr[ée]noms?)[^:]*:\s*([^\n]+)/i,
    /(Cat[ée]gorie|Cat[ée]gories?)[^:]*:\s*([^\n]+)/i,
    /(Date\s+d['’]\s*(d[ée]livrance|expiration))[^:]*:\s*([^\n]+)/i,
    /(Num[ée]ro)[^:]*:\s*([^\n]+)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m[1] && m[2]) {
      const label = m[1];
      const value = m.slice(2).join(' ').trim();
      kv[labelToKnownKey(label)] = value;
    }
  }
  return kv;
}

// Extraction robuste depuis des lignes de table HTML <tr><th>label</th><th>value</th></tr>
function extractKeyValuesFromHtml(html: string): Record<string, string> {
  const kv: Record<string, string> = {};
  const rowRegex = /<tr[^>]*>\s*<th[^>]*>(.*?)<\/th>\s*<th[^>]*>(.*?)<\/th>[\s\S]*?<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(html)) !== null) {
    const rawLabel = stripTags(m[1] || '').trim();
    const rawValue = stripTags(m[2] || '').trim();
    if (!rawLabel) continue;
    const key = labelToKnownKey(rawLabel);
    if (rawValue) kv[key] = rawValue;
  }
  return kv;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function labelToKnownKey(label: string): string {
  const L = normalize(label);
  if (/n\s*[°o]?\s*administratif/.test(L)) return 'numero_administratif';
  if (/n\s*[°o]?\s*de\s*la\s*licence/.test(L) || /licen[cs]e|permis/.test(L)) return 'numero_licence';
  if (/nom\s*\(1\)|^nom\b/.test(L)) return 'nom';
  if (/post\s*-?\s*nom/.test(L) || /prenoms?/.test(L)) return 'post_nom_prenom';
  if (/genre/.test(L)) return 'genre';
  if (/cat[ée]gorie/.test(L)) return 'categorie';
  if (/date\s*d['’]?\s*emission|date\s*d['’]?\s*\(4a|10\)/.test(L)) return 'date_emission';
  if (/date\s*d['’]?\s*expiration|date\s*d['’]?\s*\(4b|11\)/.test(L)) return 'date_expiration';
  if (/date\s*d['’]?\s*d[ée]livrance/.test(L)) return 'date_delivrance';
  if (/date\s*d['’]?\s*naissance/.test(L) || /lieu\s+de\s+naissance/.test(L)) return 'date_naissance';
  if (/site\s*d['’]?\s*d[ée]livrance/.test(L)) return 'site_delivrance';
  if (/observation/.test(L)) return 'observation';
  // par défaut: normaliser le libellé
  return normalizeLabel(label);
}

// Parse OCR text (verso permis) is now provided by shared service in services/licenseOcr.ts

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z_]/g, '');
}