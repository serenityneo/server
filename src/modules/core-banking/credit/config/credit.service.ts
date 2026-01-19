import { db } from '../../../../db';
import { credits, accounts, transactions, creditTypes } from '../../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { EligibilityService } from './eligibility.service';
import { loyaltyPointsService } from '../../../loyalty/loyalty-points.service';

export class CreditService {
    private eligibilityService: EligibilityService;

    constructor() {
        this.eligibilityService = new EligibilityService();
    }

    private async ensureCreditCatalog(tx: any) {
        const entries = [
            {
                code: 'BOMBE', label: 'Crédit Bombé', description: 'Micro-crédit quotidien', status: 'ACTIVE',
                allowedCurrencies: ['USD'], repaymentFrequency: 'DAILY',
                config: {
                    feeBrackets: [
                        { upTo: 20, fee: 2 },
                        { upTo: 50, fee: 4 },
                        { upTo: 100, fee: 8 }
                    ],
                    interestRates: []
                }
            },
            {
                code: 'TELEMA', label: 'Crédit Telema', description: 'Crédit mensuel 6/9/12 mois', status: 'ACTIVE',
                allowedCurrencies: ['USD'], repaymentFrequency: 'MONTHLY',
                config: {
                    feeBrackets: [
                        { upTo: 300, fee: 20 }, { upTo: 400, fee: 25 }, { upTo: 500, fee: 30 },
                        { upTo: 600, fee: 35 }, { upTo: 700, fee: 40 }, { upTo: 800, fee: 45 },
                        { upTo: 900, fee: 50 }, { upTo: 1000, fee: 55 }, { upTo: 1100, fee: 60 },
                        { upTo: 1200, fee: 65 }, { upTo: 1300, fee: 70 }, { upTo: 1400, fee: 75 },
                        { upTo: 9999999, fee: 80 }
                    ],
                    interestRates: [
                        { duration: 12, threshold: 500, rate: 0.055 }, { duration: 12, rate: 0.05 },
                        { duration: 9, threshold: 500, rate: 0.053 }, { duration: 9, rate: 0.048 },
                        { duration: 6, threshold: 500, rate: 0.05 }, { duration: 6, rate: 0.045 }
                    ]
                }
            },
            {
                code: 'VIMBISA', label: 'Crédit Vimbisa', description: 'Crédit à frais fixes en CDF', status: 'ACTIVE',
                allowedCurrencies: ['CDF'], repaymentFrequency: 'WEEKLY',
                config: {
                    feeBrackets: [
                        { upTo: 50000, fee: 5 * 2800 },
                        { upTo: 100000, fee: 10 * 2800 },
                        { upTo: 150000, fee: 15 * 2800 },
                        { upTo: 200000, fee: 20 * 2800 },
                        { upTo: 999999999, fee: 20 * 2800 }
                    ],
                    interestRates: []
                }
            },
            {
                code: 'MOPAO', label: 'Crédit Mopao', description: 'Crédit hebdomadaire', status: 'ACTIVE',
                allowedCurrencies: ['USD'], repaymentFrequency: 'WEEKLY',
                config: { feeBrackets: [], interestRates: [] }
            }
        ];
        for (const e of entries) {
            await tx.insert(creditTypes).values({
                code: e.code,
                label: e.label,
                description: e.description,
                status: e.status as any,
                allowedCurrencies: e.allowedCurrencies as any,
                repaymentFrequency: e.repaymentFrequency,
                config: e.config as any,
            }).onConflictDoUpdate({
                target: creditTypes.code,
                set: {
                    label: e.label,
                    description: e.description,
                    status: e.status as any,
                    allowedCurrencies: e.allowedCurrencies as any,
                    repaymentFrequency: e.repaymentFrequency,
                    config: e.config as any,
                    updatedAt: new Date().toISOString(),
                }
            });
        }
    }

    private async calculateCreditTerms(typeCode: string, amount: number, durationMonths: number = 1) {
        const [type] = await db.select().from(creditTypes).where(eq(creditTypes.code, typeCode));
        if (!type || type.status !== 'ACTIVE') throw new Error('Type de crédit invalide ou inactif');
        const cfg = (type.config as any) || {};
        let fees = 0;
        let interestRate = 0;
        const brackets: Array<{ upTo: number; fee: number }> = cfg.feeBrackets || [];
        const interests: Array<{ duration: number; threshold?: number; rate: number }> = cfg.interestRates || [];

        for (const b of brackets) {
            if (amount <= b.upTo) { fees = b.fee; break; }
        }
        if (!fees && brackets.length) fees = brackets[brackets.length - 1].fee;

        const match = interests.find(ir => ir.duration === durationMonths && (ir.threshold === undefined || amount <= ir.threshold));
        if (match) interestRate = match.rate;

        return { fees, interestRate, repaymentFrequency: type.repaymentFrequency };
    }

    async applyForCredit(customerId: number, type: string, amount: number, currency: 'CDF' | 'USD', durationMonths: number = 1) {
        if (currency !== 'CDF' && currency !== 'USD') {
            throw new Error('Monnaie non autorisée');
        }
        await db.transaction(async (tx: any) => { await this.ensureCreditCatalog(tx); });
        const [typeRow] = await db.select().from(creditTypes).where(eq(creditTypes.code, type));
        if (!typeRow || typeRow.status !== 'ACTIVE') {
            throw new Error('Type de crédit inconnu ou inactif');
        }
        let eligibility;
        if (type === 'BOMBE') {
            eligibility = await this.eligibilityService.checkBombeEligibility(customerId, amount);
        } else if (type === 'TELEMA') {
            eligibility = await this.eligibilityService.checkTelemaEligibility(customerId, amount);
        } else if (type === 'VIMBISA') {
            eligibility = await this.eligibilityService.checkVimbisaEligibility(customerId, amount);
        } else {
            eligibility = { eligible: true, reasons: [] };
        }
        if (!eligibility.eligible) {
            throw new Error(`Not eligible: ${eligibility.reasons.join(', ')}`);
        }
        const { fees, interestRate } = await this.calculateCreditTerms(type, amount, durationMonths);
        let totalToRepay = amount;
        if (type === 'TELEMA') {
            totalToRepay = amount * (1 + interestRate * durationMonths);
        } else {
            totalToRepay = amount;
        }
        const [application] = await db.insert(credits).values({
            customerId,
            creditType: type,
            amountCdf: currency === 'CDF' ? amount.toString() : '0',
            amountUsd: currency === 'USD' ? amount.toString() : '0',
            processingFeeCdf: currency === 'CDF' ? fees.toString() : '0',
            totalToRepayCdf: currency === 'CDF' ? totalToRepay.toString() : '0',
            interestRate: interestRate.toString(),
            repaymentFrequency: typeRow.repaymentFrequency,
            installmentAmountCdf: '0',
            numberOfInstallments: type === 'BOMBE' ? 1 : (type === 'VIMBISA' ? 10 : durationMonths),
            creditStatus: 'PENDING',
        }).returning();
        
        // AWARD CREDIT SUBSCRIPTION POINT
        try {
            await loyaltyPointsService.awardPoints({
                customerId,
                pointTypeCode: 'CREDIT_SUBSCRIPTION',
                operationId: application.id,
                metadata: {
                    creditType: type,
                    amount,
                    currency,
                    durationMonths
                }
            });
            console.log(`🎉 Credit subscription point awarded to customer ${customerId}`);
        } catch (error) {
            console.error(`⚠️  Failed to award credit subscription point:`, error);
        }
        
        return application;
    }

    async approveCredit(creditId: number, approvedByUserId: number) {
        return await db.transaction(async (tx: any) => {
            const [credit] = await tx.select().from(credits).where(eq(credits.id, creditId));
            if (!credit) throw new Error('Credit not found');
            if (credit.creditStatus !== 'PENDING') throw new Error('Credit not in PENDING state');

            const cautionAmount = parseFloat(credit.amountUsd || credit.amountCdf) * 0.30;
            const currency = parseFloat(credit.amountUsd || '0') > 0 ? 'USD' : 'CDF';

            const [s02] = await tx.select().from(accounts).where(and(
                eq(accounts.customerId, credit.customerId),
                eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')
            ));
            if (!s02) throw new Error('S02 Account not found');

            const [s03] = await tx.insert(accounts).values({
                customerId: credit.customerId,
                accountNumber: `CAUTION-${credit.id}`,
                accountType: 'S03_CAUTION',
                currency: currency,
                balanceCdf: currency === 'CDF' ? cautionAmount.toString() : '0',
                balanceUsd: currency === 'USD' ? cautionAmount.toString() : '0',
                status: 'ACTIVE',
                openedDate: new Date().toISOString(),
            }).returning();

            if (currency === 'CDF') {
                await tx.update(accounts)
                    .set({ balanceCdf: sql`${accounts.balanceCdf} - ${cautionAmount}` })
                    .where(eq(accounts.id, s02.id));
            } else {
                await tx.update(accounts)
                    .set({ balanceUsd: sql`${accounts.balanceUsd} - ${cautionAmount}` })
                    .where(eq(accounts.id, s02.id));
            }

            await tx.update(credits)
                .set({
                    creditStatus: 'APPROVED',
                    approvalDate: new Date().toISOString(),
                    disbursementDate: new Date().toISOString(),
                })
                .where(eq(credits.id, creditId));

            const [s04Account] = await tx.insert(accounts).values({
                customerId: credit.customerId,
                accountNumber: `CREDIT-${creditId}`,
                accountType: 'S04_CREDIT',
                currency: currency,
                balanceCdf: credit.amountCdf,
                balanceUsd: credit.amountUsd || '0',
                status: 'ACTIVE',
                openedDate: new Date().toISOString(),
            }).returning();

            await tx.insert(transactions).values({
                accountId: s04Account.id,
                creditId: credit.id,
                transactionType: 'CREDIT_DISBURSEMENT',
                amountCdf: credit.amountCdf,
                amountUsd: credit.amountUsd,
                currency: currency,
                status: 'COMPLETED',
                description: `Disbursement for credit ${credit.id}`,
            });

            return { credit, s04Account, s03 };
        });
    }

    async repayCredit(creditId: number, amount: number, currency: 'CDF' | 'USD') {
        if (currency !== 'CDF' && currency !== 'USD') {
            throw new Error('Monnaie non autorisée');
        }
        return await db.transaction(async (tx: any) => {
            const [credit] = await tx.select().from(credits).where(eq(credits.id, creditId));
            if (!credit) throw new Error('Credit not found');
            if (credit.creditStatus !== 'APPROVED' && credit.creditStatus !== 'DEFAULTED') {
                throw new Error('Credit is not active or defaulted');
            }

            const [s04] = await tx.select().from(accounts).where(and(
                eq(accounts.customerId, credit.customerId),
                eq(accounts.accountType, 'S04_CREDIT'),
                eq(accounts.accountNumber, `CREDIT-${creditId}`)
            ));
            if (!s04) throw new Error('Credit account S04 not found');

            let currentDebt = currency === 'CDF' ? parseFloat(s04.balanceCdf) : parseFloat(s04.balanceUsd);
            if (currentDebt <= 0) throw new Error('Credit already fully repaid');
            if (amount > currentDebt) amount = currentDebt;

            if (currency === 'CDF') {
                await tx.update(accounts)
                    .set({ balanceCdf: sql`${accounts.balanceCdf} - ${amount}` })
                    .where(eq(accounts.id, s04.id));
            } else {
                await tx.update(accounts)
                    .set({ balanceUsd: sql`${accounts.balanceUsd} - ${amount}` })
                    .where(eq(accounts.id, s04.id));
            }

            await tx.insert(transactions).values({
                accountId: s04.id,
                creditId: credit.id,
                transactionType: 'REPAYMENT',
                amountCdf: currency === 'CDF' ? amount.toString() : '0',
                amountUsd: currency === 'USD' ? amount.toString() : '0',
                currency,
                status: 'COMPLETED',
                description: `Repayment for credit ${credit.id}`,
            });

            const remainingDebt = currentDebt - amount;
            if (remainingDebt <= 0.01) {
                await tx.update(credits)
                    .set({ creditStatus: 'PAID', lastPaymentDate: new Date().toISOString() })
                    .where(eq(credits.id, creditId));

                const [s03] = await tx.select().from(accounts).where(and(
                    eq(accounts.customerId, credit.customerId),
                    eq(accounts.accountType, 'S03_CAUTION'),
                    eq(accounts.accountNumber, `CAUTION-${creditId}`)
                ));
                if (s03) {
                    const s03BalanceCdf = parseFloat(s03.balanceCdf);
                    const s03BalanceUsd = parseFloat(s03.balanceUsd);
                    const [s02] = await tx.select().from(accounts).where(and(
                        eq(accounts.customerId, credit.customerId),
                        eq(accounts.accountType, 'S02_MANDATORY_SAVINGS')
                    ));
                    if (s02) {
                        await tx.update(accounts)
                            .set({
                                balanceCdf: sql`${accounts.balanceCdf} + ${s03BalanceCdf}`,
                                balanceUsd: sql`${accounts.balanceUsd} + ${s03BalanceUsd}`
                            })
                            .where(eq(accounts.id, s02.id));
                        await tx.update(accounts)
                            .set({ balanceCdf: '0', balanceUsd: '0', status: 'CLOSED', closedDate: new Date().toISOString() })
                            .where(eq(accounts.id, s03.id));
                    }
                }
            }

            return { creditId, remainingDebt };
        });
    }

    async handleOverdueCredit(creditId: number) {
        return await db.transaction(async (tx: any) => {
            const [credit] = await tx.select().from(credits).where(eq(credits.id, creditId));
            if (!credit) throw new Error('Credit not found');
            await tx.update(credits).set({ creditStatus: 'DEFAULTED' }).where(eq(credits.id, creditId));
            const penaltyAmount = parseFloat(credit.processingFeeCdf || '0');

            let [s06] = await tx.select().from(accounts).where(and(
                eq(accounts.customerId, credit.customerId),
                eq(accounts.accountType, 'S06_FINES')
            ));
            if (!s06) {
                const [newS06] = await tx.insert(accounts).values({
                    customerId: credit.customerId,
                    accountNumber: `FINE-${credit.customerId}`,
                    accountType: 'S06_FINES',
                    currency: 'CDF',
                    balanceCdf: '0',
                    balanceUsd: '0',
                    status: 'ACTIVE',
                    openedDate: new Date().toISOString(),
                }).returning();
                s06 = newS06;
            }

            await tx.update(accounts)
                .set({ balanceCdf: sql`${accounts.balanceCdf} + ${penaltyAmount}` })
                .where(eq(accounts.id, s06.id));
            await tx.insert(transactions).values({
                accountId: s06.id,
                creditId: credit.id,
                transactionType: 'PENALTY',
                amountCdf: penaltyAmount.toString(),
                amountUsd: '0',
                currency: 'CDF',
                status: 'COMPLETED',
                description: `Penalty for defaulted credit ${credit.id}`,
            });
            return { credit, s06 };
        });
    }
}
