import { db } from '../../../../db'
import { accounts, transactions } from '../../../../db/schema'
import { eq, sql } from 'drizzle-orm'
import { eligibilityEngine } from '../../../../services/eligibility-engine'

export class TransactionService {
  async deposit(accountId: number, amount: number, currency: 'CDF' | 'USD', description: string) {
    if (currency !== 'CDF' && currency !== 'USD') throw new Error('Monnaie non autorisée')
    const transaction = await db.transaction(async (tx) => {
      // Get account to find customer ID
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId))
      
      if (currency === 'CDF') {
        await tx.update(accounts).set({ balanceCdf: sql`${accounts.balanceCdf} + ${amount}` }).where(eq(accounts.id, accountId))
      } else {
        await tx.update(accounts).set({ balanceUsd: sql`${accounts.balanceUsd} + ${amount}` }).where(eq(accounts.id, accountId))
      }

      const [newTransaction] = await tx.insert(transactions).values({
        accountId,
        transactionType: 'DEPOSIT',
        amountCdf: currency === 'CDF' ? amount.toString() : '0',
        amountUsd: currency === 'USD' ? amount.toString() : '0',
        currency,
        status: 'COMPLETED',
        description,
      }).returning()

      return { transaction: newTransaction, customerId: account?.customerId }
    })

    // Trigger eligibility evaluation asynchronously (non-blocking)
    if (transaction.customerId) {
      this.evaluateEligibilityAsync(transaction.customerId).catch(err => {
        console.error('[TransactionService] Eligibility evaluation error:', err)
      })
    }

    return transaction.transaction
  }

  /**
   * Evaluate customer eligibility asynchronously after deposit
   * This runs in background without blocking the transaction response
   */
  private async evaluateEligibilityAsync(customerId: number): Promise<void> {
    try {
      await eligibilityEngine.evaluateAllForCustomer(customerId, 'DEPOSIT')
      console.log(`[TransactionService] Eligibility evaluated for customer ${customerId} after deposit`)
    } catch (error) {
      console.error(`[TransactionService] Failed to evaluate eligibility for customer ${customerId}:`, error)
    }
  }

  async withdraw(accountId: number, amount: number, currency: 'CDF' | 'USD', description: string) {
    if (currency !== 'CDF' && currency !== 'USD') throw new Error('Monnaie non autorisée')
    return await db.transaction(async (tx) => {
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId))
      if (!account) throw new Error('Account not found')

      const balance = currency === 'CDF' ? parseFloat(account.balanceCdf) : parseFloat(account.balanceUsd)
      if (balance < amount) throw new Error('Insufficient funds')

      if (currency === 'CDF') {
        await tx.update(accounts).set({ balanceCdf: sql`${accounts.balanceCdf} - ${amount}` }).where(eq(accounts.id, accountId))
      } else {
        await tx.update(accounts).set({ balanceUsd: sql`${accounts.balanceUsd} - ${amount}` }).where(eq(accounts.id, accountId))
      }

      const [transaction] = await tx.insert(transactions).values({
        accountId,
        transactionType: 'WITHDRAWAL',
        amountCdf: currency === 'CDF' ? amount.toString() : '0',
        amountUsd: currency === 'USD' ? amount.toString() : '0',
        currency,
        status: 'COMPLETED',
        description,
      }).returning()

      return transaction
    })
  }
}
