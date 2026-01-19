import { db } from '../../../../db'
import { customers, accounts, bwakisaServices, accountType, accountTypes, agencies } from '../../../../db/schema'
import { eq, sql } from 'drizzle-orm'
import { exchangeRateService } from '../../services/exchange-rate.service'
import { generateFormattedAccountNumber } from '../../services/account-generation.service'

export class AccountService {
  /**
   * DEPRECATED: Use generateFormattedAccountNumber from account-generation.service instead
   * This method is kept for backward compatibility only
   */
  private generateAccountNumber(typeCode: 'S01'|'S02'|'S03'|'S04'|'S05'|'S06', cif: string, seq: number): string {
    // Delegate to centralized function for consistency
    return generateFormattedAccountNumber(cif, typeCode, seq);
  }

  private mapType(code: 'S01'|'S02'|'S03'|'S04'|'S05'|'S06'): typeof accountType.enumValues[number] {
    switch (code) {
      case 'S01': return 'S01_STANDARD'
      case 'S02': return 'S02_MANDATORY_SAVINGS'
      case 'S03': return 'S03_CAUTION'
      case 'S04': return 'S04_CREDIT'
      case 'S05': return 'S05_BWAKISA_CARTE'
      case 'S06': return 'S06_FINES'
    }
  }

  /**
   * Vérifie que la table account_types contient des données.
   * Si vide, le système échoue et demande d'exécuter le seed.
   */
  private async ensureAccountCatalog(tx: any) {
    const existingTypes = await tx.select().from(accountTypes).limit(1)
      
    if (existingTypes.length === 0) {
      throw new Error(
        'account_types table is empty. Run: npm run seed:account-types'
      )
    }
  }

  async initializeCustomerAccount(
    customerId: number, 
    options?: { termsAccepted?: boolean; ipAddress?: string }
  ): Promise<{ customer: any; account: any }> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString()
    const newCifCode = `CIF-${dateStr}-${randomSuffix}`

    return await db.transaction(async (tx) => {
      const [existingCustomer] = await tx.select().from(customers).where(eq(customers.id, customerId))
      if (!existingCustomer) throw new Error(`Customer with ID ${customerId} not found`)

      // If CIF missing, set it; otherwise preserve existing
      const cifCode = existingCustomer.cifCode || newCifCode

      const updateData: any = {
        kycStatus: existingCustomer.kycStatus === 'NOT_STARTED' ? 'KYC1_PENDING' : existingCustomer.kycStatus,
        kycStep: 4,
        kycCompleted: true,
        cifCode: cifCode,
        accountCreationDate: new Date().toISOString(),
        kyc1CompletionDate: existingCustomer.kyc1CompletionDate || new Date().toISOString(),
      }

      // Track terms acceptance if provided
      if (options?.termsAccepted) {
        updateData.termsAccepted = true
        updateData.termsAcceptedAt = new Date().toISOString()
        if (options.ipAddress) {
          updateData.termsAcceptedIp = options.ipAddress
        }
      }

      const [updatedCustomer] = await tx.update(customers)
        .set(updateData)
        .where(eq(customers.id, customerId))
        .returning()

      if (!updatedCustomer) {
        throw new Error(`Customer with ID ${customerId} not found`)
      }

      await this.ensureAccountCatalog(tx)

      // Create all 12 accounts: 6 account types (S01-S06) × 2 currencies (CDF, USD)
      // This is the standard core banking approach
      const types: ('S01'|'S02'|'S03'|'S04'|'S05'|'S06')[] = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06']
      const currencies: ('CDF'|'USD')[] = ['CDF', 'USD']
      let seq = 1
      let primaryAccount: any = null

      // Check if accounts already exist to prevent duplicates
      const existingAccounts = await tx.select().from(accounts).where(eq(accounts.customerId, updatedCustomer.id))
      
      if (existingAccounts.length > 0) {
        console.log(`[AccountService] Customer ${customerId} already has ${existingAccounts.length} accounts. Skipping creation.`)
        primaryAccount = existingAccounts.find(a => a.accountTypeCode === 'S01' && a.currency === 'CDF') || existingAccounts[0]
      } else {
        // Create 12 accounts: each type in both CDF and USD
        for (const t of types) {
          for (const currency of currencies) {
            const status = t === 'S01' ? 'ACTIVE' : 'INACTIVE'
            const enumType = this.mapType(t)

            // Generate unique account number including currency
            const accNum = this.generateAccountNumber(t, cifCode, seq++)
            const [foundAcc] = await tx.select().from(accounts).where(eq(accounts.accountNumber, accNum))
            
            if (!foundAcc) {
              const [newAcc] = await tx.insert(accounts).values({
                customerId: updatedCustomer.id,
                accountNumber: accNum,
                accountType: enumType,
                accountTypeCode: t,
                currency: currency,
                balanceCdf: '0',
                balanceUsd: '0',
                status,
                openedDate: new Date().toISOString(),
              }).returning()

              // Set S01-CDF as the primary account
              if (t === 'S01' && currency === 'CDF' && !primaryAccount) {
                primaryAccount = newAcc
              }
            }
          }
        }

        console.log(`[AccountService] Created 12 accounts (6 types × 2 currencies) for customer ${customerId}`)
      }

      await tx.insert(bwakisaServices).values({
        customerId: updatedCustomer.id,
        periodicity: 'DAILY',
        status: 'ACTIVE',
        startDate: new Date(),
      })

      return { customer: updatedCustomer, account: primaryAccount }
    })
  }

  async getCustomerAccounts(customerId: number) {
    // Get customer with agency info for formatted display
    const [customerInfo] = await db
      .select({
        cif: customers.cif,
        cifCode: customers.cifCode,
        accountNumber: customers.accountNumber,
        agencyId: customers.agencyId,
        agentId: customers.agentId,
        agencyCode: agencies.code,
      })
      .from(customers)
      .leftJoin(agencies, eq(customers.agencyId, agencies.id))
      .where(eq(customers.id, customerId))
      .limit(1)

    const rows = await db.select().from(accounts).where(eq(accounts.customerId, customerId))
    
    // ✅ DEDUPLICATE: Remove duplicate accounts based on accountTypeCode (S01, S02, etc.)
    const uniqueAccounts = new Map();
    for (const account of rows) {
      // Use accountTypeCode as the unique key since each customer should have only ONE account per type
      const key = account.accountTypeCode || account.accountType || account.id;
      if (!uniqueAccounts.has(key)) {
        uniqueAccounts.set(key, account);
      }
    }
    const deduplicatedRows = Array.from(uniqueAccounts.values());
    
    // ✅ Format agent code from agent_id (e.g., agent_id: 48 → agentCode: "048")
    const agentCode = customerInfo?.agentId 
      ? String(customerInfo.agentId).padStart(3, '0')
      : null;
    
    // Enrich accounts with formatted display using new CIF system
    const enrichedAccounts = deduplicatedRows.map(account => {
      let formattedAccountNumber = account.accountNumber;
      
      // ✅ NEW FORMAT: CIF-AGENCY+AGENT-ACCOUNT (e.g., 71094594-01048-97583220)
      // Only add type and currency for individual account display
      if (customerInfo?.cif && customerInfo?.agencyCode && agentCode && customerInfo?.accountNumber) {
        const baseNumber = `${customerInfo.cif}-${customerInfo.agencyCode}${agentCode}-${customerInfo.accountNumber}`;
        const typeCode = account.accountTypeCode || 'S01';
        
        // Full format with type and currency for account-specific display
        formattedAccountNumber = `${baseNumber}-${typeCode}`;
      }
      
      return {
        ...account,
        formattedAccountNumber,
        cif: customerInfo?.cif,
        agencyCode: customerInfo?.agencyCode,
        agentCode: agentCode,
        // ✅ Include base number for profile display (without type)
        baseAccountNumber: customerInfo?.cif && customerInfo?.agencyCode && agentCode && customerInfo?.accountNumber
          ? `${customerInfo.cif}-${customerInfo.agencyCode}${agentCode}-${customerInfo.accountNumber}`
          : null,
      }
    })
    
    const baseAccountNumber = customerInfo?.cif && customerInfo?.agencyCode && agentCode && customerInfo?.accountNumber
      ? `${customerInfo.cif}-${customerInfo.agencyCode}${agentCode}-${customerInfo.accountNumber}`
      : null;
    
    return { 
      accounts: enrichedAccounts,
      customerInfo: customerInfo ? {
        ...customerInfo,
        agentCode,
        baseAccountNumber,
      } : null
    }
  }

  async getAccountCatalog() {
    // ✅ FIX: Use account_type_config (Prisma table) instead of account_types (doesn't exist)
    // This table already exists and has all the configuration data we need
    try {
      const query = `
        SELECT 
          account_type_code as code,
          account_type_name as label,
          description,
          is_active as "defaultStatus"
        FROM account_type_config
        WHERE is_active = true
        ORDER BY account_type_code
      `;
      
      const rows = await db.execute(sql.raw(query));
      
      const items = rows.map((r: any) => ({
        code: r.code,
        label: r.label,
        description: r.description,
        currencies: ['CDF', 'USD'], // All account types support both currencies
        defaultStatus: r.code === 'S01' ? 'ACTIVE' : 'INACTIVE', // S01 active by default
      }));
      
      return { items };
    } catch (error: any) {
      console.error('[AccountService] Error fetching catalog:', error.message);
      // ✅ Fallback to hardcoded data if query fails
      return {
        items: [
          { code: 'S01', label: 'Compte Standard', description: 'Compte courant pour dépôts et retraits réguliers', currencies: ['CDF','USD'], defaultStatus: 'ACTIVE' },
          { code: 'S02', label: 'Épargne Obligatoire', description: "Compte d'épargne conditionnant l'éligibilité aux crédits", currencies: ['CDF','USD'], defaultStatus: 'INACTIVE' },
          { code: 'S03', label: 'Caution', description: 'Garantie financière associée aux crédits', currencies: ['CDF','USD'], defaultStatus: 'INACTIVE' },
          { code: 'S04', label: 'Crédit', description: 'Compte crédité à l\'octroi et débité aux remboursements', currencies: ['CDF','USD'], defaultStatus: 'INACTIVE' },
          { code: 'S05', label: 'Bwakisa Carte', description: 'Service d\'assistance pour épargne régulière (objectif/maturité)', currencies: ['CDF','USD'], defaultStatus: 'INACTIVE' },
          { code: 'S06', label: 'Amendes', description: 'Paiement des amendes liées aux engagements de crédit', currencies: ['CDF','USD'], defaultStatus: 'INACTIVE' },
        ]
      };
    }
  }

  /**
   * Calculer les frais de tenue de compte avec conversion automatique
   * @param accountType - Type de compte (S01, S02, etc.)
   * @param currency - Devise du compte (CDF ou USD)
   * @returns Montant des frais dans la devise du compte
   */
  async calculateAccountMaintenanceFee(
    accountType: string,
    currency: 'CDF' | 'USD'
  ): Promise<{ amount: number; currency: string; exchangeRate?: number }> {
    // Frais de base en USD (peut être configuré par type de compte)
    const baseFeeUsd = accountType === 'S01' ? 1 : 0; // 1$ pour S01, 0 pour les autres

    if (currency === 'USD') {
      return {
        amount: baseFeeUsd,
        currency: 'USD',
      };
    }

    // Conversion en CDF au taux du jour
    const feeCdf = await exchangeRateService.calculateFeesInCdf(baseFeeUsd);
    const currentRate = await exchangeRateService.getCurrentRate();

    return {
      amount: feeCdf,
      currency: 'CDF',
      exchangeRate: currentRate.usdToCdf,
    };
  }

  /**
   * Convertir un montant entre devises
   * @param amount - Montant à convertir
   * @param from - Devise source
   * @param to - Devise cible
   * @returns Montant converti avec le taux appliqué
   */
  async convertAmount(
    amount: number,
    from: 'USD' | 'CDF',
    to: 'USD' | 'CDF'
  ): Promise<{ amount: number; rate: number }> {
    if (from === to) {
      return { amount, rate: 1 };
    }

    const currentRate = await exchangeRateService.getCurrentRate();
    let convertedAmount: number;
    let rate: number;

    if (from === 'USD' && to === 'CDF') {
      convertedAmount = await exchangeRateService.convertUsdToCdf(amount);
      rate = currentRate.usdToCdf;
    } else {
      convertedAmount = await exchangeRateService.convertCdfToUsd(amount);
      rate = currentRate.cdfToUsd;
    }

    return { amount: convertedAmount, rate };
  }
}
