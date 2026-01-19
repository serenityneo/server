/**
 * CREDIT MODULE - Services Index
 * 
 * Export centralisé de tous les services du module CRÉDIT
 */

// Services de validation (nouveaux)
export { CreditAccountService } from './validation/account.service';

// Services de produits (nouveaux)
export { BaseCreditProductService } from './products/base-product.service';
export { VimbisaService } from './products/vimbisa.service';
export { BombeService } from './products/bombe.service';
export { TelemaService } from './products/telema.service';
export { MopaoService } from './products/mopao.service';
export { LikélembaService } from './products/likelemba.service';

// Services de configuration (existants)
export { CreditService } from '../config/credit.service';
export { EligibilityService } from '../config/eligibility.service';
export { SavingsService } from '../config/savings.service';
