// Shared OCR parsing utilities for Congolese driver license back (verso)

export type LicenceBackExtract = {
  categories: string[];
  issueDate: string | null;
  expiryDate: string | null;
  birthDate: string | null;
};

/**
 * Parse OCR text from the back side of a Congolese driver license.
 * Handles:
 * - Categories: A1, A, B1, B, C1, C, D1, D, BE, CE, DE
 * - Birth date: dd.mm.yy (two-digit year folded to 19xx/20xx)
 * - Issue/Expiry dates: dd.mm.yyyy | dd.mm.yyyy or label-near detection
 */
export function parseLicenceBackFromOCR(ocrText?: string): LicenceBackExtract {
  const out: LicenceBackExtract = { categories: [], issueDate: null, expiryDate: null, birthDate: null };
  if (!ocrText || typeof ocrText !== 'string') return out;
  const T = ocrText.replace(/\s+/g, ' ').toUpperCase();

  const CAT_LIST = ['A1','A','B1','B','C1','C','D1','D','BE','CE','DE'];
  const catRegex = /\b(A1|A|B1|B|C1|C|D1|D|BE|CE|DE)\b/g;
  const cats: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = catRegex.exec(T)) !== null) { if (!cats.includes(m[1])) cats.push(m[1]); }
  // Assouplir: un seul code catégorie peut suffire à caractériser le verso
  if (cats.length >= 1) out.categories = CAT_LIST.filter(c => cats.includes(c));

  const toISO = (dd: string, mm: string, yy: string): string => {
    let y = parseInt(yy, 10);
    if (yy.length === 2) { const cutoff = new Date().getFullYear()  % 100; y = y <= cutoff ? 2000 + y : 1900 + y; }
    const d = String(parseInt(dd, 10)).padStart(2, '0');
    const m2 = String(parseInt(mm, 10)).padStart(2, '0');
    const y4 = String(y).padStart(4, '0');
    return `${y4}-${m2}-${d}`;
  };

  const DATE_RE = /\b(\d{2})[./-](\d{2})[./-](\d{2,4})\b/g;
  const findNear = (label: RegExp): string | null => {
    const l = label.exec(T); if (!l || l.index == null) return null; const win = T.slice(l.index, l.index + 80); const md = DATE_RE.exec(win); return md ? toISO(md[1], md[2], md[3]) : null;
  };

  // Direct pipe-separated pattern (e.g., 09.09.2025 | 08.09.2030)
  const PIPE_DATES = /\b(\d{2}[./-]\d{2}[./-]\d{2,4})\s*\|\s*(\d{2}[./-]\d{2}[./-]\d{2,4})\b/;
  const pipeMatch = PIPE_DATES.exec(T);
  if (pipeMatch) {
    const [d1, d2] = [pipeMatch[1], pipeMatch[2]];
    const md1 = /(\d{2})[./-](\d{2})[./-](\d{2,4})/.exec(d1);
    const md2 = /(\d{2})[./-](\d{2})[./-](\d{2,4})/.exec(d2);
    if (md1) out.issueDate = toISO(md1[1], md1[2], md1[3]);
    if (md2) out.expiryDate = toISO(md2[1], md2[2], md2[3]);
  }

  // Label-near detection for birth/issue/expiry
  out.issueDate = out.issueDate || findNear(/(DELIV|DÉLIV|DELIVRE|DÉLIVRÉ|EMIS|ÉMIS|DATE\s+DE\s+DÉLIV)/);
  out.expiryDate = out.expiryDate || findNear(/(EXPIR|EXPIRATION|VALABLE\s+JUSQU|DATE\s+D'EXPIRATION|DATE\s+DE\s+VALIDITÉ)/);
  out.birthDate = findNear(/(NAISSANCE|NÉ\s+LE|NE\s+LE|DATE\s+DE\s+NAISSANCE)/) || out.birthDate;

  // Si toujours introuvable, heuristique: considérer la 3e date comme naissance si 3 dates distinctes sont présentes
  if (!out.birthDate) {
    const allBirth: string[] = []; let md2: RegExpExecArray | null; DATE_RE.lastIndex = 0;
    while ((md2 = DATE_RE.exec(T)) !== null) { const iso = toISO(md2[1], md2[2], md2[3]); if (!allBirth.includes(iso)) allBirth.push(iso); }
    if (allBirth.length >= 3) out.birthDate = allBirth[2];
  }

  // Fallback: take first two dates if labels missing
  if (!out.issueDate || !out.expiryDate) {
    const all: string[] = []; let md: RegExpExecArray | null; DATE_RE.lastIndex = 0;
    while ((md = DATE_RE.exec(T)) !== null) { const iso = toISO(md[1], md[2], md[3]); if (!all.includes(iso)) all.push(iso); }
    if (!out.issueDate && all[0]) out.issueDate = all[0];
    if (!out.expiryDate && all[1]) out.expiryDate = all[1];
  }

  return out;
}