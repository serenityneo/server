/**
 * USAGE EXAMPLES - Core Banking Features
 * 
 * Examples of using the new features:
 * 1. Agent assignment based on creation context
 * 2. Dynamic exchange rate system
 */

import { accountGenerationService } from './services/account-generation.service';
import { exchangeRateService } from './services/exchange-rate.service';
import { AccountService } from './credit/config/account.service';

const accountService = new AccountService();

// ============================================
// 1. AGENT ASSIGNMENT EXAMPLES
// ============================================

/**
 * Example 1: Customer self-registration
 * Agent is automatically assigned from virtual agents pool (load balanced)
 */
async function exampleSelfRegistration() {
  const account = await accountGenerationService.generateCompleteAccount();
  
  console.log('Self-registration account:', {
    cif: account.cif,              // "00000001"
    agencyId: account.agencyId,    // Auto-assigned agency (round-robin)
    agentId: account.agentId,      // Virtual agent (load balanced)
    accountNumber: account.accountNumber, // "00000001"
  });
  
  // Log output: "[AccountGeneration] Self-registration - using virtual agent ID: 5"
}

/**
 * Example 2: Customer created by a partner
 * Agent is inherited from the partner who creates the customer
 */
async function examplePartnerCreatesCustomer(partnerId: number) {
  const account = await accountGenerationService.generateCompleteAccount({
    createdByPartnerId: partnerId,
  });
  
  console.log('Partner-created account:', {
    cif: account.cif,
    agentId: account.agentId, // Partner's agent ID
  });
  
  // Log output: "[AccountGeneration] Customer created by partner - using partner's agent ID: 3"
}

/**
 * Example 3: Customer created by partner with specific agent
 */
async function examplePartnerWithSpecificAgent(partnerId: number, agentId: number) {
  const account = await accountGenerationService.generateCompleteAccount({
    createdByPartnerId: partnerId,
    partnerAgentId: agentId,
  });
  
  console.log('Account with specific agent:', {
    cif: account.cif,
    agentId: account.agentId, // Specified agent ID
  });
  
  // Log output: "[AccountGeneration] Customer created by partner - using partner agent ID: 7"
}

// ============================================
// 2. EXCHANGE RATE EXAMPLES
// ============================================

/**
 * Example 1: Get current exchange rate
 */
async function exampleGetCurrentRate() {
  const rate = await exchangeRateService.getCurrentRate();
  
  console.log('Current exchange rate:', {
    usdToCdf: rate.usdToCdf,       // 2850 (1 USD = 2850 CDF)
    cdfToUsd: rate.cdfToUsd,       // 0.00035 (1 CDF = 0.00035 USD)
    updatedAt: rate.updatedAt,     // Date of last update
    updatedBy: rate.updatedBy,     // Admin ID who updated
  });
}

/**
 * Example 2: Admin updates the exchange rate
 */
async function exampleUpdateRate(adminId: number) {
  const newRate = 2850; // 1 USD = 2850 CDF
  
  await exchangeRateService.setExchangeRate(newRate, adminId);
  
  console.log(`Rate updated to ${newRate} CDF by admin ${adminId}`);
  // Log: "[ExchangeRate] Taux mis à jour: 1 USD = 2850 CDF par admin 1"
  
  // The new rate is immediately applied everywhere in the system!
}

/**
 * Example 3: Convert USD to CDF
 */
async function exampleConvertUsdToCdf() {
  const amountUsd = 100;
  const amountCdf = await exchangeRateService.convertUsdToCdf(amountUsd);
  
  console.log(`${amountUsd} USD = ${amountCdf} CDF`);
  // Output: "100 USD = 285000 CDF"
}

/**
 * Example 4: Convert CDF to USD
 */
async function exampleConvertCdfToUsd() {
  const amountCdf = 285000;
  const amountUsd = await exchangeRateService.convertCdfToUsd(amountCdf);
  
  console.log(`${amountCdf} CDF = ${amountUsd} USD`);
  // Output: "285000 CDF = 100 USD"
}

/**
 * Example 5: Calculate account maintenance fees
 * Automatically converts 1 USD to CDF using current rate
 */
async function exampleCalculateFees() {
  // For CDF account - converts 1 USD fee to CDF
  const feesCdf = await accountService.calculateAccountMaintenanceFee('S01', 'CDF');
  console.log('S01 CDF fees:', feesCdf);
  // { amount: 2850, currency: 'CDF', exchangeRate: 2850 }
  
  // For USD account - no conversion needed
  const feesUsd = await accountService.calculateAccountMaintenanceFee('S01', 'USD');
  console.log('S01 USD fees:', feesUsd);
  // { amount: 1, currency: 'USD' }
}

/**
 * Example 6: Convert amount with rate information
 */
async function exampleConvertWithRate() {
  const result = await accountService.convertAmount(100, 'USD', 'CDF');
  
  console.log('Conversion details:', {
    originalAmount: 100,
    originalCurrency: 'USD',
    convertedAmount: result.amount,  // 285000
    targetCurrency: 'CDF',
    rateApplied: result.rate,        // 2850
  });
}

/**
 * Example 7: Get exchange rate statistics
 */
async function exampleGetStats() {
  const stats = await exchangeRateService.getExchangeRateStats();
  
  console.log('Exchange rate statistics (24h):', {
    current: stats.current,       // Current rate
    lowest24h: stats.lowest24h,   // Lowest in last 24h
    highest24h: stats.highest24h, // Highest in last 24h
    average24h: stats.average24h, // Average in last 24h
    lastUpdate: stats.lastUpdate, // Last update timestamp
  });
}

/**
 * Example 8: Get exchange rate history
 */
async function exampleGetHistory() {
  const history = await exchangeRateService.getExchangeRateHistory();
  
  console.log('Exchange rate history:', history);
  // [
  //   { rate: 2850, timestamp: '2025-12-23T10:00:00Z', updatedBy: 1 },
  //   { rate: 2800, timestamp: '2025-12-22T15:30:00Z', updatedBy: 1 },
  //   ...
  // ]
}

// ============================================
// 3. REAL-WORLD USAGE SCENARIOS
// ============================================

/**
 * Scenario: Apply account maintenance fee to CDF account
 * The fee is defined as 1 USD but applied in CDF at current rate
 */
async function scenarioApplyMaintenanceFee(accountId: number) {
  // 1. Get the fee amount in CDF (converts 1 USD to CDF)
  const feeInfo = await accountService.calculateAccountMaintenanceFee('S01', 'CDF');
  
  console.log(`Applying maintenance fee: ${feeInfo.amount} ${feeInfo.currency}`);
  console.log(`Exchange rate used: ${feeInfo.exchangeRate}`);
  
  // 2. Deduct the fee from account
  // ... transaction logic here ...
}

/**
 * Scenario: Customer wants to know how much 50 USD is in CDF
 */
async function scenarioCustomerInquiry() {
  const amountUsd = 50;
  
  const result = await accountService.convertAmount(amountUsd, 'USD', 'CDF');
  
  console.log(`Inquiry: ${amountUsd} USD`);
  console.log(`Result: ${result.amount} CDF`);
  console.log(`Rate applied: 1 USD = ${result.rate} CDF`);
}

/**
 * Scenario: Admin wants to update daily exchange rate
 */
async function scenarioAdminUpdatesRate(adminId: number) {
  // 1. Get current rate for comparison
  const current = await exchangeRateService.getCurrentRate();
  console.log(`Current rate: ${current.usdToCdf} CDF`);
  
  // 2. Update to new rate
  const newRate = 2875;
  await exchangeRateService.setExchangeRate(newRate, adminId);
  console.log(`New rate: ${newRate} CDF`);
  
  // 3. The new rate is now applied everywhere!
  // All future conversions will use 2875 CDF per USD
}

export {
  // Agent assignment examples
  exampleSelfRegistration,
  examplePartnerCreatesCustomer,
  examplePartnerWithSpecificAgent,
  
  // Exchange rate examples
  exampleGetCurrentRate,
  exampleUpdateRate,
  exampleConvertUsdToCdf,
  exampleConvertCdfToUsd,
  exampleCalculateFees,
  exampleConvertWithRate,
  exampleGetStats,
  exampleGetHistory,
  
  // Real-world scenarios
  scenarioApplyMaintenanceFee,
  scenarioCustomerInquiry,
  scenarioAdminUpdatesRate,
};
