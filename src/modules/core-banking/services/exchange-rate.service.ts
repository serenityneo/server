/**
 * Exchange Rate Service
 * 
 * Gère les taux de change dynamiques configurables par l'admin
 * Utilisé pour:
 * - Conversion CDF <-> USD
 * - Frais de tenue de compte (1$ → CDF au taux du jour)
 * - Toutes les opérations nécessitant une conversion de devise
 */

import { db } from '../../../db';
import { systemSettings, exchangeRateAudit } from '../../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { handleDatabaseError } from '../../../utils/database-error-handler';

export interface ExchangeRate {
  usdToCdf: number;  // 1 USD = X CDF
  cdfToUsd: number;  // 1 CDF = X USD
  updatedAt: Date;
  updatedBy?: number;
}

export class ExchangeRateService {
  private static readonly EXCHANGE_RATE_KEY = 'EXCHANGE_RATE_USD_CDF';
  private static readonly DEFAULT_RATE = 2240; // Taux par défaut: 1 USD = 2240 CDF

  /**
   * Récupérer le taux de change actuel USD -> CDF
   */
  async getCurrentRate(): Promise<ExchangeRate> {
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, ExchangeRateService.EXCHANGE_RATE_KEY))
      .limit(1);

    if (setting.length === 0) {
      // Créer le taux par défaut si n'existe pas
      await this.setExchangeRate(ExchangeRateService.DEFAULT_RATE);
      return {
        usdToCdf: ExchangeRateService.DEFAULT_RATE,
        cdfToUsd: 1 / ExchangeRateService.DEFAULT_RATE,
        updatedAt: new Date(),
      };
    }

    const rate = parseFloat(setting[0].value);
    return {
      usdToCdf: rate,
      cdfToUsd: 1 / rate,
      updatedAt: new Date(setting[0].updatedAt),
      updatedBy: setting[0].lastModifiedBy || undefined,
    };
  }

  /**
   * Définir un nouveau taux de change (réservé à l'admin)
   * @param rate - Taux USD -> CDF (ex: 2850 signifie 1 USD = 2850 CDF)
   * @param userId - ID de l'admin qui modifie le taux
   * @param metadata - Métadonnées additionnelles (email, role, IP, userAgent, reason)
   */
  async setExchangeRate(
    rate: number, 
    userId?: number,
    metadata?: {
      email?: string;
      role?: string;
      ipAddress?: string;
      userAgent?: string;
      reason?: string;
    }
  ): Promise<void> {
    if (rate <= 0) {
      throw new Error('Exchange rate must be greater than 0');
    }

    // Récupérer l'ancien taux pour l'audit
    const currentSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, ExchangeRateService.EXCHANGE_RATE_KEY))
      .limit(1);
    
    const oldRate = currentSetting.length > 0 ? parseFloat(currentSetting[0].value) : null;

    const history = await this.getExchangeRateHistory();
    const newHistory = [
      {
        rate,
        timestamp: new Date().toISOString(),
        updatedBy: userId,
      },
      ...history.slice(0, 99), // Garder les 100 dernières modifications
    ];

    // Transaction: Mettre à jour system_settings ET enregistrer l'audit
    try {
      await db.transaction(async (tx) => {
        // 1. Mettre à jour le taux dans system_settings
        await tx
          .insert(systemSettings)
          .values({
            key: ExchangeRateService.EXCHANGE_RATE_KEY,
            category: 'EXCHANGE_RATES',
            value: rate.toString(),
            dataType: 'FLOAT',
            description: 'Taux de change USD vers CDF (1 USD = X CDF)',
            isSystem: true,
            isEncrypted: false,
            defaultValue: ExchangeRateService.DEFAULT_RATE.toString(),
            lastModifiedBy: userId,
            history: newHistory,
            updatedAt: new Date().toISOString(),
          })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: {
              value: rate.toString(),
              lastModifiedBy: userId,
              history: newHistory,
              updatedAt: new Date().toISOString(),
            },
          });

        // 2. Enregistrer dans la table d'audit bancaire
        if (userId) {
          // Construire l'objet d'audit dynamiquement (ne pas inclure les champs undefined)
          const auditData: any = {
            newRate: rate,
            changedBy: userId,
          };
          
          // Ajouter les champs optionnels seulement s'ils existent
          if (oldRate !== null && oldRate !== undefined) auditData.oldRate = oldRate;
          if (metadata?.email) auditData.changedByEmail = metadata.email;
          if (metadata?.role) auditData.changedByRole = metadata.role;
          if (metadata?.reason) auditData.changeReason = metadata.reason;
          if (metadata?.ipAddress) auditData.ipAddress = metadata.ipAddress;
          if (metadata?.userAgent) auditData.userAgent = metadata.userAgent;

          await tx.insert(exchangeRateAudit).values(auditData);
        }
      });

      console.log(`[ExchangeRate] Taux mis à jour: ${oldRate || 'N/A'} -> ${rate} CDF par ${userId ? `admin ${userId}` : 'système'}`);
      console.log(`[Audit] Enregistrement d'audit créé pour user ${userId}`);
    } catch (error) {
      // Sanitize error - NEVER expose SQL to client
      const safeError = handleDatabaseError(error, 'Erreur lors de la mise à jour du taux de change');
      console.error('[ExchangeRate] Database error:', error); // Log complet côté serveur
      throw new Error(safeError.error); // Message sécurisé pour le client
    }
  }

  /**
   * Convertir USD en CDF au taux actuel
   * @param amountUsd - Montant en USD
   * @returns Montant en CDF
   */
  async convertUsdToCdf(amountUsd: number): Promise<number> {
    const { usdToCdf } = await this.getCurrentRate();
    return Math.round(amountUsd * usdToCdf * 100) / 100; // Arrondi à 2 décimales
  }

  /**
   * Convertir CDF en USD au taux actuel
   * @param amountCdf - Montant en CDF
   * @returns Montant en USD
   */
  async convertCdfToUsd(amountCdf: number): Promise<number> {
    const { cdfToUsd } = await this.getCurrentRate();
    return Math.round(amountCdf * cdfToUsd * 100) / 100; // Arrondi à 2 décimales
  }

  /**
   * Calculer les frais en CDF à partir d'un montant en USD
   * Utilisé pour les frais de tenue de compte (1$) converti en CDF
   * 
   * @param feeUsd - Montant des frais en USD (ex: 1)
   * @returns Montant des frais en CDF au taux du jour
   */
  async calculateFeesInCdf(feeUsd: number): Promise<number> {
    return await this.convertUsdToCdf(feeUsd);
  }

  /**
   * Récupérer l'historique des modifications de taux
   */
  async getExchangeRateHistory(): Promise<Array<{
    rate: number;
    timestamp: string;
    updatedBy?: number;
  }>> {
    const setting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, ExchangeRateService.EXCHANGE_RATE_KEY))
      .limit(1);

    if (setting.length === 0 || !setting[0].history) {
      return [];
    }

    return setting[0].history as any[];
  }

  /**
   * Obtenir les statistiques du taux de change
   */
  async getExchangeRateStats(): Promise<{
    current: number;
    lowest24h?: number;
    highest24h?: number;
    average24h?: number;
    lastUpdate: Date;
  }> {
    const { usdToCdf, updatedAt } = await this.getCurrentRate();
    const history = await this.getExchangeRateHistory();

    // Filtrer les 24 dernières heures
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last24h = history.filter(
      (h) => new Date(h.timestamp) > yesterday
    );

    if (last24h.length === 0) {
      return {
        current: usdToCdf,
        lastUpdate: updatedAt,
      };
    }

    const rates = last24h.map((h) => h.rate);
    return {
      current: usdToCdf,
      lowest24h: Math.min(...rates),
      highest24h: Math.max(...rates),
      average24h: rates.reduce((a, b) => a + b, 0) / rates.length,
      lastUpdate: updatedAt,
    };
  }

  /**
   * Récupérer l'historique d'audit bancaire complet
   * Fournit une traçabilité complète avec tous les détails
   * @param limit - Nombre d'entrées à récupérer (par défaut 100)
   */
  async getAuditHistory(limit: number = 100): Promise<Array<{
    id: number;
    oldRate: number | null;
    newRate: number;
    changedBy: number;
    changedByEmail: string | null;
    changedByRole: string | null;
    changeReason: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
  }>> {
    const audit = await db
      .select()
      .from(exchangeRateAudit)
      .orderBy(desc(exchangeRateAudit.createdAt))
      .limit(limit);

    return audit as any[];
  }
}

export const exchangeRateService = new ExchangeRateService();
