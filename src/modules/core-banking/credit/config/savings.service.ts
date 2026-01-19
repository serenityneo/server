import { db } from '../../../../db'
import { bwakisaServices, accounts, transactions } from '../../../../db/schema'
import { eq, and, sql } from 'drizzle-orm'

export class SavingsService {
  async subscribeToBwakisa(customerId: number, periodicity: 'DAILY' | 'WEEKLY' | 'BIMONTHLY' | 'MONTHLY', amount: number, currency: 'CDF' | 'USD', type: 'MATURITY' | 'OBJECTIVE' | 'BOTH', maturityDate?: Date, targetAmount?: number) {
    if (periodicity === 'DAILY' && type === 'MATURITY' && maturityDate) {
      const minDate = new Date(); minDate.setDate(minDate.getDate() + 7)
      if (maturityDate < minDate) throw new Error('Daily periodicity requires minimum 1 week maturity')
    }

    return await db.transaction(async (tx) => {
      const [service] = await tx.insert(bwakisaServices).values({
        customerId,
        periodicity,
        targetAmount: targetAmount?.toString(),
        maturityDate: maturityDate,
        status: 'ACTIVE',
        startDate: new Date(),
      }).returning()

      let cost = 0
      if (type === 'MATURITY') cost = amount
      else cost = (targetAmount || 0) * 0.15

      if (type === 'MATURITY') {
        await tx.insert(transactions).values({
          accountId: 0,
          transactionType: 'FEE',
          amountCdf: currency === 'CDF' ? amount.toString() : '0',
          amountUsd: currency === 'USD' ? amount.toString() : '0',
          currency,
          status: 'COMPLETED',
          description: `Bwakisa Subscription Fee (First Payment) for Service ${service.id}`,
        })
      }

      return service
    })
  }

  async processBwakisaDeposit(customerId: number, amount: number, currency: 'CDF' | 'USD') {
    if (currency !== 'CDF' && currency !== 'USD') throw new Error('Monnaie non autorisée')
    return await db.transaction(async (tx) => {
      const [service] = await tx.select().from(bwakisaServices).where(and(eq(bwakisaServices.customerId, customerId), eq(bwakisaServices.status, 'ACTIVE')))
      if (!service) throw new Error('No active Bwakisa service found')

      const [s05Account] = await tx.select().from(accounts).where(and(eq(accounts.customerId, customerId), eq(accounts.accountType, 'S05_BWAKISA_CARTE')))
      let targetAccount = s05Account
      if (!targetAccount) {
        const [newAccount] = await tx.insert(accounts).values({
          customerId,
          accountNumber: `BWAKISA-${customerId}-${Date.now()}`,
          accountType: 'S05_BWAKISA_CARTE',
          currency,
          balanceCdf: currency === 'CDF' ? '0' : '0',
          balanceUsd: currency === 'USD' ? '0' : '0',
          status: 'ACTIVE',
          openedDate: new Date().toISOString(),
        }).returning()
        targetAccount = newAccount
      }

      if (currency === 'CDF') {
        await tx.update(accounts).set({ balanceCdf: sql`${accounts.balanceCdf} + ${amount}` }).where(eq(accounts.id, targetAccount.id))
      } else {
        await tx.update(accounts).set({ balanceUsd: sql`${accounts.balanceUsd} + ${amount}` }).where(eq(accounts.id, targetAccount.id))
      }

      await tx.insert(transactions).values({
        accountId: targetAccount.id,
        transactionType: 'DEPOSIT',
        amountCdf: currency === 'CDF' ? amount.toString() : '0',
        amountUsd: currency === 'USD' ? amount.toString() : '0',
        currency,
        status: 'COMPLETED',
        description: 'Bwakisa Deposit',
      })

      return { service, account: targetAccount }
    })
  }
}
