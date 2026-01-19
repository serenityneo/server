/**
 * CORE BANKING SYSTEM - Point d'entrée principal
 * 
 * Le Core Banking System est le cœur du système bancaire.
 * Il contient TOUS les modules financiers:
 * - CREDIT: Gestion des comptes (S01-S06) et produits crédit
 * - PAYMENT: Gestion des paiements et transactions (à venir)
 * 
 * Les autres modules (KYC, Admin, Partner, etc.) sont EXTERNES au Core Banking.
 */

// Modules du Core Banking System
export * from './credit';
// export * from './payment'; // À venir

// Configuration du Core Banking System
export const CORE_BANKING_CONFIG = {
  name: 'CORE_BANKING_SYSTEM',
  version: '1.0.0',
  description: 'Système bancaire central - Crédit & Paiements',
  
  modules: {
    credit: {
      name: 'CREDIT',
      status: 'OPERATIONAL',
      description: 'Gestion des comptes et produits crédit',
      components: [
        'Types de comptes (S01-S06)',
        'Produits crédit (VIMBISA, BOMBE, TELEMA, MOPAO, LIKELEMBA)',
        'Validation transactions',
        'Calcul frais et intérêts',
        'Éligibilité et conditions'
      ]
    },
    payment: {
      name: 'PAYMENT',
      status: 'TO_BE_IMPLEMENTED',
      description: 'Gestion des paiements et transactions',
      components: [
        'Paiements mobiles',
        'Paiements bancaires',
        'Paiements par carte',
        'Réconciliation'
      ]
    }
  }
};
