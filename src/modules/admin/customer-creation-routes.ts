/**
 * CUSTOMER CREATION ROUTES
 * 
 * Endpoints pour créer les 3 types d'utilisateurs:
 * 1. MEMBERS - Clients bancaires avec CIF + 12 comptes
 * 2. PARTNER-VIRTUAL - Agents virtuels sans CIF ni comptes
 * 3. PARTNER-PHYSICAL - Agents physiques avec CIF + agence
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../db';
import { customers, accounts, agencies } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { hash } from 'argon2';
import { generateFormattedAccountNumber } from '../core-banking/services/account-generation.service';
import { AUTH_COOKIE_NAME, extractUserIdFromCookie } from '../../config/auth';
import { resendEmailService } from '../../services/resend-email.service';

// Security helper
const requireAdminAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = String(request.headers['authorization'] || '');
  const expectedToken = process.env.ADMIN_API_TOKEN || process.env.CORE_BANKING_API_TOKEN || '';

  if (authHeader.startsWith('Bearer ') && expectedToken) {
    const isValid = authHeader.slice(7) === expectedToken;
    if (isValid) return;
  }

  const adminTokenCookie = request.cookies[AUTH_COOKIE_NAME];
  if (adminTokenCookie) {
    const userId = extractUserIdFromCookie(adminTokenCookie);
    if (userId !== null) return;
  }

  reply.status(401).send({ success: false, error: 'Authentication required' });
};

// Générer un CIF unique (8 chiffres)
async function generateUniqueCIF(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    // Générer 8 chiffres (10000000 à 99999999)
    const cif = Math.floor(10000000 + Math.random() * 90000000).toString();

    // Vérifier unicité
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.cif, cif))
      .limit(1);

    if (!existing) {
      return cif;
    }

    attempts++;
  }

  throw new Error('Impossible de générer un CIF unique après 10 tentatives');
}

// Générer un partnerCode unique (5 chiffres)
async function generateUniquePartnerCode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    // Générer 5 chiffres (10000 à 99999)
    const code = Math.floor(10000 + Math.random() * 90000).toString();

    // Vérifier unicité
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.partnerCode, code))
      .limit(1);

    if (!existing) {
      return code;
    }

    attempts++;
  }

  throw new Error('Impossible de générer un partnerCode unique après 10 tentatives');
}

// Générer un mot de passe sécurisé
function generateSecurePassword(): string {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';

  // Au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
  password += '0123456789'[Math.floor(Math.random() * 10)];
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)];

  // Remplir le reste
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  // Mélanger
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Créer les 12 comptes bancaires (6 CDF + 6 USD)
async function createBankAccounts(customerId: number, cif: string): Promise<number> {
  // Map short codes to full enum values required by accountType enum
  const accountTypeMap: Record<string, 'S01_STANDARD' | 'S02_MANDATORY_SAVINGS' | 'S03_CAUTION' | 'S04_CREDIT' | 'S05_BWAKISA_CARTE' | 'S06_FINES'> = {
    'S01': 'S01_STANDARD',
    'S02': 'S02_MANDATORY_SAVINGS',
    'S03': 'S03_CAUTION',
    'S04': 'S04_CREDIT',
    'S05': 'S05_BWAKISA_CARTE',
    'S06': 'S06_FINES'
  };

  const accountTypeCodes = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06'];
  const currencies: ('CDF' | 'USD')[] = ['CDF', 'USD'];
  let count = 0;
  let accountSequence = 1;

  for (const typeCode of accountTypeCodes) {
    for (const currency of currencies) {
      // Use centralized function for consistent format: S01-CIF-YYYYMMDD-SEQ
      const accountNumber = generateFormattedAccountNumber(cif, typeCode, accountSequence);
      accountSequence++;

      await db.insert(accounts).values({
        customerId,
        accountNumber,
        accountType: accountTypeMap[typeCode], // Full enum value required
        accountTypeCode: typeCode, // 3-character code for foreign key
        currency,
        balanceCdf: '0',
        balanceUsd: '0',
        status: typeCode === 'S01' ? 'ACTIVE' : 'INACTIVE', // S01 active, others inactive
        openedDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      count++;
    }
  }

  return count;
}

export async function registerCustomerCreationRoutes(fastify: FastifyInstance) {

  /**
   * POST /admin/members
   * Créer un MEMBER (client bancaire)
   * 
   * Génère automatiquement:
   * - CIF unique (8 chiffres)
   * - 12 comptes bancaires (S01-S06 en CDF et USD)
   * - Mot de passe sécurisé
   * 
   * Statut initial: PENDING (en attente de compléter KYC1)
   */
  fastify.post('/admin/members', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Customer Creation'],
      summary: 'Create a new MEMBER (banking customer)',
      description: 'Creates a new member with CIF, 12 bank accounts, and secure password',
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          motherName: { type: 'string' }, // Stocké dans referenceName temporairement
          dateOfBirth: { type: 'string', format: 'date' },
          gender: { type: 'string', enum: ['M', 'F'] },
          mobileMoneyNumber: { type: 'string' },
          email: { type: 'string', format: 'email' },
          address: { type: 'string' },
          profession: { type: 'string' },
          customerType: { type: 'string', enum: ['MEMBER'] },
          status: { type: 'string', enum: ['PENDING'] },
          kycStatus: { type: 'string', enum: ['KYC1_PENDING'] }
        },
        required: ['firstName', 'lastName', 'motherName', 'dateOfBirth', 'gender', 'mobileMoneyNumber', 'email']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;

      console.log('[CreateMember] Starting member creation:', {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email
      });

      // Validation: vérifier email unique
      const [existingEmail] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.email, body.email))
        .limit(1);

      if (existingEmail) {
        return reply.status(400).send({
          success: false,
          error: 'Cet email est déjà utilisé'
        });
      }

      // Validation: vérifier téléphone unique
      const [existingPhone] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.mobileMoneyNumber, body.mobileMoneyNumber))
        .limit(1);

      if (existingPhone) {
        return reply.status(400).send({
          success: false,
          error: 'Ce numéro de téléphone est déjà utilisé'
        });
      }

      // Générer CIF unique
      const cif = await generateUniqueCIF();
      console.log('[CreateMember] Generated CIF:', cif);

      // Générer mot de passe sécurisé
      const plainPassword = generateSecurePassword();
      const passwordHash = await hash(plainPassword);
      console.log('[CreateMember] Password generated (length:', plainPassword.length, ')');

      // Créer le membre dans la table customers
      const [newMember] = await db.insert(customers).values({
        // Infos personnelles (KYC1 Step 1)
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth,
        gender: body.gender,

        // Contact (KYC1 Step 2)
        mobileMoneyNumber: body.mobileMoneyNumber,
        email: body.email.toLowerCase(),

        // Stockage temporaire du nom de la mère dans referenceName
        // (jusqu'à ce qu'un champ motherName soit ajouté au schéma)
        referenceName: body.motherName,
        referenceRelationship: 'MOTHER',

        // Optionnel
        address: body.address || null,
        profession: body.profession || null,

        // Banking fields
        cif,
        customerType: 'MEMBER',
        partnerLevel: null, // MEMBER n'a pas de partnerLevel
        status: 'PENDING', // En attente de compléter KYC1
        kycStatus: 'KYC1_PENDING',
        category: 'CATEGORY_1', // Par défaut
        kycStep: 1, // KYC1 Step 1 rempli par admin

        // Security
        passwordHash,
        isActive: true,
        mfaEnabled: false,

        // Audit
        accountCreationDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }).returning();

      console.log('[CreateMember] Member created with ID:', newMember.id);

      // Créer les 12 comptes bancaires
      const accountsCreated = await createBankAccounts(newMember.id, cif);
      console.log('[CreateMember] Created', accountsCreated, 'bank accounts');

      // ✅ SERENITY NEO: WELCOME EMAIL (Async)
      if (newMember.email) {
        resendEmailService.sendWelcomeClient(newMember.email, newMember.firstName ?? 'Client')
          .catch(err => console.error('[CreateMember] Failed to send welcome email:', err));
      }

      // Retourner le résultat avec le mot de passe en clair (1 seule fois)
      return {
        success: true,
        message: 'Membre créé avec succès',
        member: {
          id: newMember.id,
          firstName: newMember.firstName,
          lastName: newMember.lastName,
          email: newMember.email,
          cif: newMember.cif,
          status: newMember.status,
          kycStatus: newMember.kycStatus
        },
        generatedPassword: plainPassword, // ⚠️ À transmettre au client UNE SEULE FOIS
        accountsCreated,
        nextSteps: [
          'Le client doit se connecter avec ce mot de passe',
          'Compléter les 4 étapes du KYC1',
          'Compléter le KYC2 pour devenir CATEGORY_2 ou GOLD',
          'Une fois KYC1 terminé, possibilité de migration des soldes papier'
        ]
      };

    } catch (error) {
      console.error('[CreateMember] Error:', error);

      if (error instanceof Error && error.message.includes('unique constraint')) {
        return reply.status(400).send({
          success: false,
          error: 'Un utilisateur avec ces informations existe déjà'
        });
      }

      return reply.status(500).send({
        success: false,
        error: 'Une erreur est survenue lors de la création du membre'
      });
    }
  });

  /**
   * POST /admin/partners/virtual
   * Créer un PARTNER-VIRTUAL (agent virtuel/robot)
   * 
   * Génère automatiquement:
   * - partnerCode unique (5 chiffres)
   * - Mot de passe sécurisé
   * 
   * PAS de CIF, PAS de comptes bancaires
   * Statut initial: ACTIVE (immédiatement opérationnel)
   */
  fastify.post('/admin/partners/virtual', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Customer Creation'],
      summary: 'Create a new VIRTUAL AGENT',
      description: 'Creates a virtual agent (NO CIF, NO bank accounts) - for automated customer management',
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          mobileMoneyNumber: { type: 'string' },
          partnerCode: { type: 'string' }, // Optionnel (auto-généré si vide)
          customerType: { type: 'string', enum: ['PARTNER'] },
          partnerLevel: { type: 'string', enum: ['VIRTUAL'] },
          status: { type: 'string', enum: ['ACTIVE'] }
        },
        required: ['firstName', 'lastName', 'email', 'mobileMoneyNumber']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;

      console.log('[CreateVirtualAgent] Starting virtual agent creation:', {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email
      });

      // Validation: email unique
      const [existingEmail] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.email, body.email))
        .limit(1);

      if (existingEmail) {
        return reply.status(400).send({
          success: false,
          error: 'Cet email est déjà utilisé'
        });
      }

      // Validation: téléphone unique
      const [existingPhone] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.mobileMoneyNumber, body.mobileMoneyNumber))
        .limit(1);

      if (existingPhone) {
        return reply.status(400).send({
          success: false,
          error: 'Ce numéro de téléphone est déjà utilisé'
        });
      }

      // Générer ou valider partnerCode
      let partnerCode: string;
      if (body.partnerCode) {
        // Vérifier format (5 chiffres)
        if (!/^\d{5}$/.test(body.partnerCode)) {
          return reply.status(400).send({
            success: false,
            error: 'Le code partenaire doit contenir exactement 5 chiffres'
          });
        }

        // Vérifier unicité
        const [existing] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.partnerCode, body.partnerCode))
          .limit(1);

        if (existing) {
          return reply.status(400).send({
            success: false,
            error: 'Ce code partenaire est déjà utilisé'
          });
        }

        partnerCode = body.partnerCode;
      } else {
        // Auto-générer
        partnerCode = await generateUniquePartnerCode();
      }

      console.log('[CreateVirtualAgent] Partner code:', partnerCode);

      // Générer mot de passe
      const plainPassword = generateSecurePassword();
      const passwordHash = await hash(plainPassword);

      // Créer l'agent virtuel (PAS de CIF, PAS de comptes)
      const [newAgent] = await db.insert(customers).values({
        // Identité minimale
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email.toLowerCase(),
        mobileMoneyNumber: body.mobileMoneyNumber,

        // Type PARTNER-VIRTUAL
        customerType: 'PARTNER',
        partnerLevel: 'VIRTUAL',
        partnerCode,

        // PAS de CIF (agent virtuel = système)
        cif: null,

        // Statut ACTIVE immédiatement
        status: 'ACTIVE',
        kycStatus: 'NOT_STARTED', // Agents virtuels n'ont pas besoin de KYC
        category: 'CATEGORY_1',

        // Security
        passwordHash,
        isActive: true,
        mfaEnabled: false,

        // Audit
        accountCreationDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }).returning();

      console.log('[CreateVirtualAgent] Virtual agent created with ID:', newAgent.id);

      return {
        success: true,
        message: 'Agent virtuel créé avec succès',
        agent: {
          id: newAgent.id,
          firstName: newAgent.firstName,
          lastName: newAgent.lastName,
          email: newAgent.email,
          partnerCode: newAgent.partnerCode,
          partnerLevel: newAgent.partnerLevel,
          status: newAgent.status
        },
        generatedPassword: plainPassword, // ⚠️ À transmettre UNE SEULE FOIS
        accountsCreated: 0, // Agents virtuels N'ONT PAS de comptes
        note: 'Agent virtuel sans CIF ni comptes bancaires - agent système automatisé'
      };

    } catch (error) {
      console.error('[CreateVirtualAgent] Error:', error);

      return reply.status(500).send({
        success: false,
        error: 'Une erreur est survenue lors de la création de l\'agent virtuel'
      });
    }
  });

  /**
   * POST /admin/partners/physical
   * Créer un PARTNER-PHYSICAL (agent physique avec agence)
   * 
   * Génère automatiquement:
   * - CIF unique (8 chiffres)
   * - partnerCode unique (5 chiffres)
   * - 12 comptes bancaires
   * - Mot de passe sécurisé
   * 
   * Statut initial: PENDING (en attente de compléter KYC1)
   */
  fastify.post('/admin/partners/physical', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Admin Customer Creation'],
      summary: 'Create a new PHYSICAL AGENT',
      description: 'Creates a physical agent with CIF, bank accounts, and agency assignment',
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          motherName: { type: 'string' },
          dateOfBirth: { type: 'string', format: 'date' },
          gender: { type: 'string', enum: ['M', 'F'] },
          mobileMoneyNumber: { type: 'string' },
          email: { type: 'string', format: 'email' },
          address: { type: 'string' },
          profession: { type: 'string' },
          agencyId: { type: 'number' },
          partnerCode: { type: 'string' }, // Optionnel
          commissionRate: { type: 'number', minimum: 0, maximum: 100 }
        },
        required: ['firstName', 'lastName', 'motherName', 'dateOfBirth', 'gender', 'mobileMoneyNumber', 'email', 'agencyId', 'commissionRate']
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;

      console.log('[CreatePhysicalAgent] Starting physical agent creation:', {
        firstName: body.firstName,
        lastName: body.lastName,
        agencyId: body.agencyId
      });

      // Validation: vérifier que l'agence existe
      const [agency] = await db
        .select()
        .from(agencies)
        .where(eq(agencies.id, body.agencyId))
        .limit(1);

      if (!agency) {
        return reply.status(400).send({
          success: false,
          error: 'Agence introuvable'
        });
      }

      // Validation: email unique
      const [existingEmail] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.email, body.email))
        .limit(1);

      if (existingEmail) {
        return reply.status(400).send({
          success: false,
          error: 'Cet email est déjà utilisé'
        });
      }

      // Validation: téléphone unique
      const [existingPhone] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.mobileMoneyNumber, body.mobileMoneyNumber))
        .limit(1);

      if (existingPhone) {
        return reply.status(400).send({
          success: false,
          error: 'Ce numéro de téléphone est déjà utilisé'
        });
      }

      // Générer CIF
      const cif = await generateUniqueCIF();
      console.log('[CreatePhysicalAgent] Generated CIF:', cif);

      // Générer ou valider partnerCode
      let partnerCode: string;
      if (body.partnerCode) {
        if (!/^\d{5}$/.test(body.partnerCode)) {
          return reply.status(400).send({
            success: false,
            error: 'Le code partenaire doit contenir exactement 5 chiffres'
          });
        }

        const [existing] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.partnerCode, body.partnerCode))
          .limit(1);

        if (existing) {
          return reply.status(400).send({
            success: false,
            error: 'Ce code partenaire est déjà utilisé'
          });
        }

        partnerCode = body.partnerCode;
      } else {
        partnerCode = await generateUniquePartnerCode();
      }

      console.log('[CreatePhysicalAgent] Partner code:', partnerCode);

      // Générer mot de passe
      const plainPassword = generateSecurePassword();
      const passwordHash = await hash(plainPassword);

      // Créer l'agent physique
      const [newAgent] = await db.insert(customers).values({
        // Infos personnelles (KYC1)
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth,
        gender: body.gender,
        mobileMoneyNumber: body.mobileMoneyNumber,
        email: body.email.toLowerCase(),

        // Nom de la mère (temporairement dans referenceName)
        referenceName: body.motherName,
        referenceRelationship: 'MOTHER',

        // Optionnel
        address: body.address || null,
        profession: body.profession || null,

        // Type PARTNER-PHYSICAL
        customerType: 'PARTNER',
        partnerLevel: 'PHYSICAL',
        partnerCode,
        cif,

        // Agence et commission
        agencyId: body.agencyId,
        commissionRate: body.commissionRate.toString(),

        // Statut PENDING (en attente KYC1)
        status: 'PENDING',
        kycStatus: 'KYC1_PENDING',
        category: 'CATEGORY_1',
        kycStep: 1,

        // Security
        passwordHash,
        isActive: true,
        mfaEnabled: false,

        // Audit
        accountCreationDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }).returning();

      console.log('[CreatePhysicalAgent] Physical agent created with ID:', newAgent.id);

      // Créer les 12 comptes bancaires
      const accountsCreated = await createBankAccounts(newAgent.id, cif);
      console.log('[CreatePhysicalAgent] Created', accountsCreated, 'bank accounts');

      return {
        success: true,
        message: 'Agent physique créé avec succès',
        agent: {
          id: newAgent.id,
          firstName: newAgent.firstName,
          lastName: newAgent.lastName,
          email: newAgent.email,
          cif: newAgent.cif,
          partnerCode: newAgent.partnerCode,
          partnerLevel: newAgent.partnerLevel,
          agencyId: newAgent.agencyId,
          agencyName: agency.name,
          commissionRate: newAgent.commissionRate,
          status: newAgent.status,
          kycStatus: newAgent.kycStatus
        },
        generatedPassword: plainPassword, // ⚠️ À transmettre UNE SEULE FOIS
        accountsCreated,
        nextSteps: [
          'L\'agent doit se connecter avec ce mot de passe',
          'Compléter les 4 étapes du KYC1',
          'Compléter le KYC2 pour validation complète',
          'Une fois activé, peut créer et gérer des clients'
        ]
      };

    } catch (error) {
      console.error('[CreatePhysicalAgent] Error:', error);

      return reply.status(500).send({
        success: false,
        error: 'Une erreur est survenue lors de la création de l\'agent physique'
      });
    }
  });

  // Note: GET /admin/agencies endpoint removed to avoid duplication
  // The full-featured agencies list is available at:
  // server/src/modules/core-banking/routes/agencies.routes.ts
  // which is registered with prefix '/admin' and includes counts, manager info, etc.
}
