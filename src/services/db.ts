type DbPool = { query: (sql: string, params?: any[]) => Promise<{ rows?: any[]; rowCount?: number }>; };

let pool: DbPool | null = null;

function loadPgPoolFactory(): ((opts: any) => DbPool) | null {
  try {
    const pg = require('pg');
    return (opts: any) => new pg.Pool(opts) as DbPool;
  } catch {
    return null;
  }
}

export function getPool(): DbPool | null {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  const factory = loadPgPoolFactory();
  if (!url || !factory) return null;
  const sslmode = process.env.PGSSLMODE || '';
  const urlHasSsl = /sslmode=(require|prefer)/i.test(url);
  const ssl = (urlHasSsl || /require|prefer/i.test(sslmode)) ? { rejectUnauthorized: false } : undefined;

  // ✅ OPTIMIZED: Connection pool configuration for production stability
  pool = factory({
    connectionString: url,
    ssl,

    // Connection Pool Limits
    min: 2,                      // Keep 2 connections alive always
    max: 10,                     // Max 10 concurrent connections
    idleTimeoutMillis: 0,        // ✅ FIX: Never close idle connections (was 30000)
    connectionTimeoutMillis: 5000, // Wait max 5s for available connection

    // Query Timeouts (prevent hung queries)
    statement_timeout: 10000,    // Kill queries taking > 10s
    query_timeout: 10000,        // Application-level timeout

    // ✅ FIX: Enhanced keep-alive to prevent connection termination
    keepAlive: true,
    keepAliveInitialDelayMillis: 0, // Start keep-alive immediately

    // ✅ FIX: Handle connection errors gracefully
    allowExitOnIdle: false,      // Don't allow pool to exit when idle
  });

  // ✅ FIX: Add error handler to prevent crash on connection termination
  (pool as any).on('error', (err: Error) => {
    console.error('[PostgreSQL] Pool error - connection will auto-reconnect:', err.message);
  });

  console.log('[PostgreSQL] Connection pool initialized (min: 2, max: 10, keepAlive: enabled)');

  return pool;
}

export async function verifyDb(): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    const res = await p.query('select 1 as ok');
    return !!res.rows?.[0]?.ok;
  } catch (e) {
    return false;
  }
}

// Ancienne table uploads supprimée de la logique métier (déduplication désormais via document_hashes)

// Nouvelle source de vérité pour la déduplication: table document_hashes
export async function ensureDocumentHashesTable(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`
    create table if not exists document_hashes (
      hash text primary key,
      doc_type text,
      customer_id integer,
      created_at timestamptz default now()
    )
  `);
  await p.query(`
    create index if not exists idx_document_hashes_type_customer
    on document_hashes (doc_type, customer_id)
  `);
}

export async function checkDuplicateHash(hash: string): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  const res = await p.query('select 1 from document_hashes where hash = $1 limit 1', [hash]);
  const count = typeof res.rowCount === 'number'
    ? res.rowCount
    : (Array.isArray(res.rows) ? res.rows.length : 0);
  return count > 0;
}

export async function insertDocumentHash(hash: string, docType?: string, customerId?: number): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    'insert into document_hashes(hash, doc_type, customer_id) values($1, $2, $3) on conflict (hash) do nothing',
    [hash, docType || null, typeof customerId === 'number' ? customerId : null]
  );
}

// Ancienne vérification de doublon basée sur uploads supprimée

export async function insertUpload(hash: string, type: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query('insert into uploads(file_hash, file_type) values($1, $2) on conflict (file_hash) do nothing', [hash, type]);
}

export async function upsertKycDraftHashes(customerId: number, kycStep: string, hashes: Record<string, string>): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `insert into kyc_drafts (customer_id, kyc_step, draft_data, global_doc_hashes, is_auto_saved)
     values ($1, $2, '{}'::jsonb, $3::jsonb, true)
     on conflict (customer_id, kyc_step)
     do update set global_doc_hashes = coalesce(kyc_drafts.global_doc_hashes, '{}'::jsonb) || excluded.global_doc_hashes,
                   updated_at = now()`,
    [customerId, kycStep, JSON.stringify(hashes)]
  );
}

// Export drizzle instance for ORM usage
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export const db = drizzle(getPool() as any, { schema });