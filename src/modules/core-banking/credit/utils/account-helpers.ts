/**
 * HELPERS POUR LES COMPTES CRÉDIT
 * Utilitaires partagés par tous les services de crédit
 */

/**
 * Génère un numéro de compte unique
 * Format: {PREFIX}-{CUSTOMER_ID}-{TIMESTAMP}
 * Exemple: S04-123-45678901
 */
export function generateAccountNumber(customerId: number, typePrefix: string): string {
  const timestamp = Date.now().toString().slice(-8);
  return `${typePrefix}-${customerId}-${timestamp}`;
}
