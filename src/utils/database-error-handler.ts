/**
 * BANKING SECURITY - Database Error Handler
 * 
 * CRITICAL: Never expose SQL queries, database schema, or internal errors to clients
 * This is a CORE BANKING SYSTEM - security is paramount
 */

export interface SafeErrorResponse {
  success: false;
  error: string;
  code?: string;
}

/**
 * Sanitize database errors for client consumption
 * Logs full error server-side, returns safe message to client
 */
export function sanitizeDatabaseError(error: unknown): SafeErrorResponse {
  // Log full error server-side for debugging
  console.error('[DATABASE ERROR]', error);

  // Detect common database error types
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Check for constraint violations
  if (errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key')) {
    return {
      success: false,
      error: 'Cette donnée existe déjà',
      code: 'DUPLICATE_ENTRY'
    };
  }

  // Check for foreign key violations
  if (errorMessage.includes('foreign key constraint') || errorMessage.includes('violates foreign key')) {
    return {
      success: false,
      error: 'Référence invalide',
      code: 'INVALID_REFERENCE'
    };
  }

  // Check for NOT NULL violations
  if (errorMessage.includes('null value') || errorMessage.includes('NOT NULL')) {
    return {
      success: false,
      error: 'Données manquantes requises',
      code: 'MISSING_DATA'
    };
  }

  // Check for data type errors
  if (errorMessage.includes('invalid input syntax') || errorMessage.includes('type')) {
    return {
      success: false,
      error: 'Format de données invalide',
      code: 'INVALID_FORMAT'
    };
  }

  // NEVER expose SQL queries or internal details
  // Return generic error for any other database error
  return {
    success: false,
    error: 'Une erreur est survenue. Veuillez réessayer.',
    code: 'DATABASE_ERROR'
  };
}

/**
 * Handle errors in API routes with proper sanitization
 */
export function handleDatabaseError(error: unknown, customMessage?: string): SafeErrorResponse {
  const sanitized = sanitizeDatabaseError(error);
  
  // Allow custom user-friendly message override
  if (customMessage) {
    return {
      ...sanitized,
      error: customMessage
    };
  }
  
  return sanitized;
}
