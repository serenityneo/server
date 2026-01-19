/**
 * CORE BANKING - CREDIT MODULE
 * 
 * Module de gestion du CRÉDIT dans le Core Banking System.
 * 
 * Structure:
 * ├── types/          - Types TypeScript
 * ├── config/         - Configuration et conditions (eligibility, etc.)
 * ├── services/       - Services métiers
 * │   ├── accounts/   - Gestion des comptes
 * │   ├── products/   - Produits crédit (VIMBISA, BOMBE, etc.)
 * │   └── validation/ - Validation des transactions
 * └── routes/         - Routes API
 */

// Types
export * from './types';

// Configuration
export * from './config';

// Services
export * from './services';

// Routes
export { creditRoutes } from './routes';

// Configuration module
export const CREDIT_MODULE_CONFIG = {
  name: 'CREDIT',
  version: '1.0.0',
  description: 'Module de gestion du crédit dans le Core Banking System',
  
  components: {
    types: 'Types des comptes et produits',
    config: 'Configuration et éligibilité',
    services: {
      accounts: 'Gestion des comptes S01-S06',
      products: 'Produits crédit (VIMBISA, BOMBE, etc.)',
      validation: 'Validation des transactions'
    },
    routes: 'API endpoints pour le frontend'
  }
};
