/**
 * VERIFICATION SCRIPT - Customer Creation
 * 
 * Vérifie qu'un client a été correctement créé avec:
 * - Données personnelles complètes
 * - 12 comptes bancaires (S01-S06 CDF + USD)
 * - CIF unique
 * - Assignation agence/agent
 * - Notification de bienvenue
 * 
 * Usage: 
 *   ts-node utilities/verify-customer-creation.ts <CIF_or_PHONE>
 * 
 * Exemple:
 *   ts-node utilities/verify-customer-creation.ts 71094596
 *   ts-node utilities/verify-customer-creation.ts +243970020685
 */

import { db } from '../src/db';
import { customers, accounts, customerNotifications, agencies } from '../src/db/schema';
import { eq, or } from 'drizzle-orm';

interface VerificationResult {
  success: boolean;
  customer?: any;
  accounts?: any[];
  notifications?: any[];
  agency?: any;
  errors: string[];
  warnings: string[];
  summary: {
    customerExists: boolean;
    accountsCount: number;
    expectedAccountsCount: 12;
    cdfAccountsCount: number;
    usdAccountsCount: number;
    activeAccountsCount: number;
    inactiveAccountsCount: number;
    notificationsCount: number;
    hasAgency: boolean;
    hasAgent: boolean;
    hasCIF: boolean;
    hasAccountNumber: boolean;
  };
}

async function verifyCustomerCreation(identifier: string): Promise<VerificationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n🔍 Vérification du client:', identifier);
  console.log('━'.repeat(60));

  // 1. Find customer by CIF or phone number
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      or(
        eq(customers.cif, identifier),
        eq(customers.mobileMoneyNumber, identifier)
      )
    )
    .limit(1);

  if (!customer) {
    errors.push(`❌ Client non trouvé avec l'identifiant: ${identifier}`);
    return {
      success: false,
      errors,
      warnings,
      summary: {
        customerExists: false,
        accountsCount: 0,
        expectedAccountsCount: 12,
        cdfAccountsCount: 0,
        usdAccountsCount: 0,
        activeAccountsCount: 0,
        inactiveAccountsCount: 0,
        notificationsCount: 0,
        hasAgency: false,
        hasAgent: false,
        hasCIF: false,
        hasAccountNumber: false
      }
    };
  }

  console.log('✅ Client trouvé:', {
    id: customer.id,
    cif: customer.cif,
    nom: `${customer.firstName} ${customer.lastName}`,
    telephone: customer.mobileMoneyNumber,
    email: customer.email
  });

  // 2. Verify personal data
  console.log('\n📋 Données personnelles:');
  if (!customer.firstName || !customer.lastName) {
    errors.push('❌ Nom ou prénom manquant');
  } else {
    console.log(`   ✅ Nom complet: ${customer.firstName} ${customer.lastName}`);
  }

  if (!customer.dateOfBirth) {
    warnings.push('⚠️  Date de naissance manquante');
  } else {
    console.log(`   ✅ Date de naissance: ${customer.dateOfBirth}`);
  }

  if (!customer.gender) {
    warnings.push('⚠️  Genre manquant');
  } else {
    console.log(`   ✅ Genre: ${customer.gender}`);
  }

  if (!customer.referenceName) {
    warnings.push('⚠️  Nom de la mère manquant');
  } else {
    console.log(`   ✅ Nom de la mère: ${customer.referenceName}`);
  }

  // 3. Verify CIF
  console.log('\n🆔 Identifiants:');
  if (!customer.cif) {
    errors.push('❌ CIF manquant');
  } else if (!/^\d{8}$/.test(customer.cif)) {
    errors.push(`❌ CIF invalide (doit être 8 chiffres): ${customer.cif}`);
  } else {
    console.log(`   ✅ CIF: ${customer.cif} (format valide)`);
  }

  if (!customer.accountNumber) {
    errors.push('❌ Numéro de compte manquant');
  } else {
    console.log(`   ✅ Numéro de compte: ${customer.accountNumber}`);
  }

  if (!customer.publicId) {
    warnings.push('⚠️  Public ID manquant');
  } else {
    console.log(`   ✅ Public ID: ${customer.publicId}`);
  }

  // 4. Verify accounts (12 expected)
  const allAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.customerId, customer.id));

  console.log('\n💳 Comptes bancaires:');
  console.log(`   Total: ${allAccounts.length}/12`);

  if (allAccounts.length !== 12) {
    errors.push(`❌ Nombre de comptes incorrect: ${allAccounts.length}/12`);
  } else {
    console.log('   ✅ Nombre de comptes correct (12)');
  }

  const cdfAccounts = allAccounts.filter(acc => acc.currency === 'CDF');
  const usdAccounts = allAccounts.filter(acc => acc.currency === 'USD');

  console.log(`   - CDF: ${cdfAccounts.length}/6`);
  console.log(`   - USD: ${usdAccounts.length}/6`);

  if (cdfAccounts.length !== 6) {
    errors.push(`❌ Nombre de comptes CDF incorrect: ${cdfAccounts.length}/6`);
  }

  if (usdAccounts.length !== 6) {
    errors.push(`❌ Nombre de comptes USD incorrect: ${usdAccounts.length}/6`);
  }

  // Check account types S01-S06
  const accountTypes = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06'];
  console.log('\n   Types de comptes:');
  
  for (const type of accountTypes) {
    const cdfAcc = cdfAccounts.find(acc => acc.accountTypeCode === type);
    const usdAcc = usdAccounts.find(acc => acc.accountTypeCode === type);
    
    if (!cdfAcc || !usdAcc) {
      errors.push(`❌ Compte ${type} manquant (CDF: ${!!cdfAcc}, USD: ${!!usdAcc})`);
    } else {
      const cdfStatus = cdfAcc.status === 'ACTIVE' ? '✅' : '💤';
      const usdStatus = usdAcc.status === 'ACTIVE' ? '✅' : '💤';
      console.log(`   ${type}: CDF ${cdfStatus} ${cdfAcc.status} | USD ${usdStatus} ${usdAcc.status}`);
    }
  }

  // Check balances
  const nonZeroBalances = allAccounts.filter(acc => 
    acc.balanceCdf !== '0' || acc.balanceUsd !== '0'
  );

  if (nonZeroBalances.length > 0) {
    console.log('\n   💰 Soldes non nuls:');
    nonZeroBalances.forEach(acc => {
      console.log(`   - ${acc.accountTypeCode}-${acc.currency}: CDF=${acc.balanceCdf}, USD=${acc.balanceUsd}`);
    });
  } else {
    console.log('   ✅ Tous les soldes à zéro (normal pour nouveau client)');
  }

  // 5. Verify agency/agent assignment
  console.log('\n🏢 Assignation:');
  
  if (!customer.agencyId) {
    errors.push('❌ Agence non assignée');
  } else {
    const [agency] = await db
      .select()
      .from(agencies)
      .where(eq(agencies.id, customer.agencyId))
      .limit(1);

    if (!agency) {
      errors.push(`❌ Agence ID ${customer.agencyId} introuvable`);
    } else {
      console.log(`   ✅ Agence: ${agency.name} (${agency.code})`);
      console.log(`      Active: ${agency.active ? 'Oui ✅' : 'Non ❌'}`);
    }
  }

  if (!customer.agentId) {
    errors.push('❌ Agent non assigné');
  } else {
    console.log(`   ✅ Agent ID: ${customer.agentId}`);
  }

  // 6. Verify notifications
  const notifications = await db
    .select()
    .from(customerNotifications)
    .where(eq(customerNotifications.customerId, customer.id));

  console.log('\n📬 Notifications:');
  console.log(`   Total: ${notifications.length}`);

  const welcomeNotif = notifications.find(n => n.title?.includes('Bienvenue'));
  if (!welcomeNotif) {
    warnings.push('⚠️  Notification de bienvenue manquante');
  } else {
    console.log('   ✅ Notification de bienvenue présente');
    console.log(`      Type: ${welcomeNotif.notificationType}`);
    console.log(`      Priorité: ${welcomeNotif.priority}`);
  }

  // 7. Verify KYC status
  console.log('\n📝 Statut KYC:');
  console.log(`   Status: ${customer.status}`);
  console.log(`   KYC Status: ${customer.kycStatus}`);
  console.log(`   KYC Step: ${customer.kycStep || 0}`);
  console.log(`   Category: ${customer.category}`);

  if (customer.status !== 'PENDING' && customer.status !== 'ACTIVE') {
    warnings.push(`⚠️  Statut inattendu: ${customer.status}`);
  }

  // 8. Verify security
  console.log('\n🔒 Sécurité:');
  if (!customer.passwordHash) {
    errors.push('❌ Mot de passe non défini');
  } else {
    console.log(`   ✅ Mot de passe hashé (${customer.passwordHash.length} caractères)`);
  }

  console.log(`   MFA: ${customer.mfaEnabled ? 'Activé ✅' : 'Désactivé'}`);
  console.log(`   Compte actif: ${customer.isActive ? 'Oui ✅' : 'Non ❌'}`);

  // 9. Audit trail
  console.log('\n📅 Dates:');
  console.log(`   Créé le: ${customer.createdAt}`);
  console.log(`   Modifié le: ${customer.updatedAt}`);

  if (customer.businessDocuments) {
    const audit = customer.businessDocuments as any;
    if (audit.isManualCreation) {
      console.log('\n👤 Créé manuellement par admin:');
      console.log(`   Admin: ${audit.createdByAdminName || 'N/A'}`);
      console.log(`   Role: ${audit.createdByAdminRole || 'N/A'}`);
      console.log(`   IP: ${audit.createdByAdminIp || 'N/A'}`);
    }
  }

  // Summary
  console.log('\n' + '━'.repeat(60));
  console.log('📊 RÉSUMÉ:');
  console.log('━'.repeat(60));

  const activeAccounts = allAccounts.filter(acc => acc.status === 'ACTIVE');
  const inactiveAccounts = allAccounts.filter(acc => acc.status === 'INACTIVE');

  const result: VerificationResult = {
    success: errors.length === 0,
    customer,
    accounts: allAccounts,
    notifications,
    agency: customer.agencyId ? await db
      .select()
      .from(agencies)
      .where(eq(agencies.id, customer.agencyId))
      .limit(1)
      .then(r => r[0]) : undefined,
    errors,
    warnings,
    summary: {
      customerExists: true,
      accountsCount: allAccounts.length,
      expectedAccountsCount: 12,
      cdfAccountsCount: cdfAccounts.length,
      usdAccountsCount: usdAccounts.length,
      activeAccountsCount: activeAccounts.length,
      inactiveAccountsCount: inactiveAccounts.length,
      notificationsCount: notifications.length,
      hasAgency: !!customer.agencyId,
      hasAgent: !!customer.agentId,
      hasCIF: !!customer.cif,
      hasAccountNumber: !!customer.accountNumber
    }
  };

  if (errors.length > 0) {
    console.log('\n❌ ERREURS:');
    errors.forEach(err => console.log(`   ${err}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  AVERTISSEMENTS:');
    warnings.forEach(warn => console.log(`   ${warn}`));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ Validation complète réussie! Aucun problème détecté.');
  } else if (errors.length === 0) {
    console.log('\n⚠️  Validation réussie avec avertissements mineurs.');
  } else {
    console.log('\n❌ Validation échouée. Veuillez corriger les erreurs.');
  }

  console.log('━'.repeat(60));

  return result;
}

// Main execution
const identifier = process.argv[2];

if (!identifier) {
  console.error('❌ Erreur: Veuillez fournir un CIF ou numéro de téléphone');
  console.log('\nUsage:');
  console.log('  ts-node utilities/verify-customer-creation.ts <CIF_or_PHONE>');
  console.log('\nExemples:');
  console.log('  ts-node utilities/verify-customer-creation.ts 71094596');
  console.log('  ts-node utilities/verify-customer-creation.ts +243970020685');
  process.exit(1);
}

verifyCustomerCreation(identifier)
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n❌ Erreur lors de la vérification:', error);
    process.exit(1);
  });
