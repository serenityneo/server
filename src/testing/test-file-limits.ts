/*
 * Tests unitaires simples pour les limites de fichiers côté serveur.
 * Exécuté via: pnpm run test:file-limits
 */

import { FILE_SIZE_LIMITS, IMAGE_DIM_LIMITS, validateBufferSize, validateImageDimensions } from '../utils/fileLimits';

type TestResult = { name: string; ok: boolean; info?: string };

function run() {
  const results: TestResult[] = [];

  // Taille trop petite
  {
    const bytes = Math.max(1, FILE_SIZE_LIMITS.minBytes - 1);
    const r = validateBufferSize(bytes);
    results.push({ name: 'server.size.min', ok: !r.ok && !!r.error, info: r.error });
  }

  // Taille ok
  {
    const bytes = Math.min(FILE_SIZE_LIMITS.maxBytes - 10, FILE_SIZE_LIMITS.minBytes + 2048);
    const r = validateBufferSize(bytes);
    results.push({ name: 'server.size.ok', ok: r.ok && !r.error, info: r.error });
  }

  // Taille trop grande
  {
    const bytes = FILE_SIZE_LIMITS.maxBytes + 1;
    const r = validateBufferSize(bytes);
    results.push({ name: 'server.size.max', ok: !r.ok && !!r.error, info: r.error });
  }

  // Dimensions trop petites
  {
    const r = validateImageDimensions(Math.max(1, IMAGE_DIM_LIMITS.minWidth - 10), IMAGE_DIM_LIMITS.minHeight);
    results.push({ name: 'server.dim.min', ok: !r.ok && !!r.error, info: r.error });
  }

  // Dimensions ok
  {
    const r = validateImageDimensions(IMAGE_DIM_LIMITS.minWidth + 100, IMAGE_DIM_LIMITS.minHeight + 100);
    results.push({ name: 'server.dim.ok', ok: r.ok && !r.error, info: r.error });
  }

  // Dimensions trop grandes
  {
    const r = validateImageDimensions(IMAGE_DIM_LIMITS.maxWidth + 1, IMAGE_DIM_LIMITS.maxHeight);
    results.push({ name: 'server.dim.max', ok: !r.ok && !!r.error, info: r.error });
  }

  // Rapport
  // eslint-disable-next-line no-console
  console.info('\n[SERVER FILE LIMIT TESTS]');
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.info(`- ${r.name}: ${r.ok ? 'OK' : 'FAIL'}${r.info ? ` (${r.info})` : ''}`);
  }
  const allOk = results.every(r => r.ok);
  process.exit(allOk ? 0 : 1);
}

run();