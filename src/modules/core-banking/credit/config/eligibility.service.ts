import { db } from '../../../../db'
import { accounts, transactions, bwakisaServices, credits } from '../../../../db/schema'
import { eq, and, gte, sql } from 'drizzle-orm'

export class EligibilityService {
  async checkBombeEligibility(customerId: number, requestedAmount: number): Promise<{ eligible: boolean; reasons: string[] }> {
    const reasons: string[] = []
    if (requestedAmount < 10 || requestedAmount > 100) {
      reasons.push('Le montant du crédit Bombé doit être compris entre 10$ et 100$.')
    }
    const s02Account = await db.query.accounts.findFirst({
      where: and(eq(accounts.customerId, customerId), eq(accounts.accountType, 'S02_MANDATORY_SAVINGS'))
    })
    if (!s02Account) return { eligible: false, reasons: ['Compte épargne S02 introuvable'] }
    const balance = parseFloat(s02Account.balanceUsd || '0')
    if (balance < requestedAmount * 0.5) {
      reasons.push(`Solde épargne insuffisant. Requis (50%): ${(requestedAmount * 0.5).toFixed(2)}, Actuel: ${balance.toFixed(2)}`)
    }
    const thirtyFiveDaysAgo = new Date(); thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35)
    const depositDays = await db.select({ day: sql<string>`to_char(${transactions.createdAt}, 'YYYY-MM-DD')` })
      .from(transactions)
      .where(and(eq(transactions.accountId, s02Account.id), eq(transactions.transactionType, 'DEPOSIT'), gte(transactions.createdAt, thirtyFiveDaysAgo.toISOString())))
      .groupBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`)
    if (depositDays.length < 26) {
      reasons.push(`Irrégularité des dépôts. Requis: 26 jours de dépôt. Actuel: ${depositDays.length} jours sur les 35 derniers jours.`)
    }
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const defaults = await db.select({ count: sql<number>`count(*)` }).from(credits)
      .where(and(eq(credits.customerId, customerId), eq(credits.creditStatus, 'DEFAULTED'), gte(credits.updatedAt, sixMonthsAgo.toISOString())))
    if (Number(defaults[0].count) > 0) reasons.push('Antécédents de défaut de paiement détectés dans les 6 derniers mois.')
    return { eligible: reasons.length === 0, reasons }
  }

  async checkTelemaEligibility(customerId: number, requestedAmount: number): Promise<{ eligible: boolean; reasons: string[] }> {
    const reasons: string[] = []
    if (requestedAmount < 200 || requestedAmount > 1500) reasons.push('Le montant du crédit Telema doit être compris entre 200$ et 1500$.')
    const s02Account = await db.query.accounts.findFirst({ where: and(eq(accounts.customerId, customerId), eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')) })
    if (!s02Account) return { eligible: false, reasons: ['Compte épargne S02 introuvable'] }
    const balance = parseFloat(s02Account.balanceUsd || '0')
    if (balance < requestedAmount * 0.3) reasons.push(`Solde épargne insuffisant. Requis (30%): ${(requestedAmount * 0.3).toFixed(2)}, Actuel: ${balance.toFixed(2)}`)
    const fortyFiveDaysAgo = new Date(); fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45)
    const depositCount = await db.select({ count: sql<number>`count(*)` }).from(transactions)
      .where(and(eq(transactions.accountId, s02Account.id), eq(transactions.transactionType, 'DEPOSIT'), gte(transactions.createdAt, fortyFiveDaysAgo.toISOString())))
    if (Number(depositCount[0].count) < 6) reasons.push('Dépôts insuffisants. Requis: Dépôts réguliers sur 6 semaines.')
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const defaults = await db.select({ count: sql<number>`count(*)` }).from(credits)
      .where(and(eq(credits.customerId, customerId), eq(credits.creditStatus, 'DEFAULTED'), gte(credits.updatedAt, sixMonthsAgo.toISOString())))
    if (Number(defaults[0].count) > 0) reasons.push('Antécédents de défaut de paiement détectés dans les 6 derniers mois.')
    return { eligible: reasons.length === 0, reasons }
  }

  async checkVimbisaEligibility(customerId: number, requestedAmount: number): Promise<{ eligible: boolean; reasons: string[] }> {
    const reasons: string[] = []
    const allowedAmounts = [50000, 100000, 150000, 200000]
    if (!allowedAmounts.includes(requestedAmount)) {
      reasons.push("Le montant du crédit Vimbisa doit être l'un des suivants : 50.000, 100.000, 150.000 ou 200.000 FC.")
    }
    const s02Account = await db.query.accounts.findFirst({ where: and(eq(accounts.customerId, customerId), eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')) })
    if (!s02Account) return { eligible: false, reasons: ['Compte épargne S02 introuvable'] }
    const balance = parseFloat(s02Account.balanceCdf || '0')
    if (balance < requestedAmount * 0.3) reasons.push(`Solde épargne insuffisant. Requis (30%): ${(requestedAmount * 0.3).toFixed(2)} FC, Actuel: ${balance.toFixed(2)} FC`)
    const completedCycles = await db.select({ count: sql<number>`count(*)` }).from(bwakisaServices)
      .where(and(eq(bwakisaServices.customerId, customerId), eq(bwakisaServices.status, 'COMPLETED')))
    if (Number(completedCycles[0].count) < 5) reasons.push(`Cycles Bwakisa insuffisants. Requis: 5. Actuel: ${completedCycles[0].count}`)
    return { eligible: reasons.length === 0, reasons }
  }
}
