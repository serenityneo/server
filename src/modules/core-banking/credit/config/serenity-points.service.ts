import { db } from '../../../../db'
import { serenityPointsLedger } from '../../../../db/schema'
import { eq, sql } from 'drizzle-orm'

export class SerenityPointsService {
  async awardPointsForOperation(customerId: number, operationType: 'SUBSCRIPTION' | 'REPAYMENT' | 'SPONSORSHIP', details: string) {
    let points = 0
    switch (operationType) {
      case 'SUBSCRIPTION': points = 5; break
      case 'REPAYMENT': points = 1; break
      case 'SPONSORSHIP': points = 10; break
      default: points = 1
    }
    if (points > 0) {
      return await this.awardPoints(customerId, points, `Points for ${operationType}: ${details}`)
    }
  }

  async awardPoints(customerId: number, points: number, description: string) {
    return await db.insert(serenityPointsLedger).values({ customerId, points, type: 'EARNED', description }).returning()
  }

  async redeemPoints(customerId: number, points: number, description: string) {
    const balance = await this.getPointsBalance(customerId)
    if (balance < points) throw new Error('Insufficient points balance')
    return await db.insert(serenityPointsLedger).values({ customerId, points: -points, type: 'REDEEMED', description }).returning()
  }

  async getPointsBalance(customerId: number): Promise<number> {
    const result = await db.select({ total: sql<number>`sum(${serenityPointsLedger.points})` }).from(serenityPointsLedger).where(eq(serenityPointsLedger.customerId, customerId))
    return Number(result[0]?.total || 0)
  }
}
