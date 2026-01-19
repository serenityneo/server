/**
 * Script de vérification de la migration Account Type & CIF
 * 
 * Ce script vérifie que:
 * 1. Les nouvelles colonnes existent dans la table accounts
 * 2. Les données ont été migrées correctement
 * 3. Les index sont créés
 * 4. Les contraintes sont actives
 */

import { db } from '../src/db';
import { sql } from 'drizzle-orm';

interface VerificationResult {
  category: string;
  test: string;
  passed: boolean;
  message: string;
}

const results: VerificationResult[] = [];

async function verify() {
  console.log('🔍 Vérification de la migration Account Type & CIF\n');
  console.log('=' .repeat(60));

  // Test 1: Vérifier l'existence des colonnes
  await verifyColumnsExist();

  // Test 2: Vérifier account_types (doit avoir 12 lignes: 6 types × 2 devises)
  await verifyAccountTypes();

  // Test 3: Vérifier la migration des données
  await verifyDataMigration();

  // Test 4: Vérifier les index
  await verifyIndexes();

  // Test 5: Vérifier les contraintes
  await verifyConstraints();

  // Test 6: Vérifier l'intégrité des données
  await verifyDataIntegrity();

  // Afficher les résultats
  displayResults();

  // Retourner le code de sortie approprié
  const allPassed = results.every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
}

async function verifyColumnsExist() {
  console.log('\n📋 Test 1: Vérification des colonnes\n');

  try {
    const columns: any[] = await db.execute(sql`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'accounts'
        AND column_name IN ('account_type_code', 'cif')
      ORDER BY column_name;
    `) as any[];

    const columnNames = columns.map((c: any) => c.column_name);

    // Vérifier account_type_code
    const hasAccountTypeCode = columnNames.includes('account_type_code');
    results.push({
      category: 'Colonnes',
      test: 'account_type_code existe',
      passed: hasAccountTypeCode,
      message: hasAccountTypeCode 
        ? '✅ Colonne account_type_code trouvée'
        : '❌ Colonne account_type_code manquante'
    });

    // Vérifier cif
    const hasCif = columnNames.includes('cif');
    results.push({
      category: 'Colonnes',
      test: 'cif existe',
      passed: hasCif,
      message: hasCif 
        ? '✅ Colonne cif trouvée (varchar(8))'
        : '❌ Colonne cif manquante'
    });

    // Vérifier la longueur du champ cif
    if (hasCif) {
      const cifColumn: any = columns.find((c: any) => c.column_name === 'cif');
      const correctLength = cifColumn?.character_maximum_length === 8;
      results.push({
        category: 'Colonnes',
        test: 'cif a la bonne longueur (8)',
        passed: correctLength,
        message: correctLength
          ? '✅ cif est varchar(8)'
          : `❌ cif a une longueur incorrecte: ${cifColumn?.character_maximum_length}`
      });
    }

  } catch (error) {
    results.push({
      category: 'Colonnes',
      test: 'Vérification des colonnes',
      passed: false,
      message: `❌ Erreur: ${error}`
    });
  }
}

async function verifyAccountTypes() {
  console.log('\n📋 Test 2: Vérification de la table account_types\n');

  try {
    // Compter les lignes dans account_types
    const count: any[] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM account_types;
    `) as any[];

    const totalCount = Number((count[0] as any)?.count || 0);
    
    // Devrait avoir 12 lignes: 6 types × 2 devises
    results.push({
      category: 'account_types',
      test: '12 lignes (6 types × 2 devises)',
      passed: totalCount === 12,
      message: totalCount === 12
        ? '✅ 12 types de comptes prédéfinis (S01-S06 en CDF et USD)'
        : `❌ ${totalCount} lignes au lieu de 12`
    });

    // Vérifier que tous les codes S01-S06 existent
    const types: any[] = await db.execute(sql`
      SELECT DISTINCT code 
      FROM account_types 
      ORDER BY code;
    `) as any[];

    const typeCodes = types.map((t: any) => t.code);
    const expectedCodes = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06'];
    
    for (const expectedCode of expectedCodes) {
      const exists = typeCodes.includes(expectedCode);
      results.push({
        category: 'account_types',
        test: `Type ${expectedCode} existe`,
        passed: exists,
        message: exists
          ? `✅ Type ${expectedCode} présent`
          : `❌ Type ${expectedCode} manquant`
      });
    }

    // Vérifier que chaque type existe en CDF et USD
    const currencyCheck: any[] = await db.execute(sql`
      SELECT code, COUNT(DISTINCT currency) as currency_count
      FROM account_types
      WHERE code IN ('S01', 'S02', 'S03', 'S04', 'S05', 'S06')
      GROUP BY code;
    `) as any[];

    for (const row of currencyCheck) {
      const code = row.code;
      const count = Number(row.currency_count);
      results.push({
        category: 'account_types',
        test: `${code} en CDF et USD`,
        passed: count === 2,
        message: count === 2
          ? `✅ ${code} existe en CDF et USD`
          : `❌ ${code} n'a que ${count} devise(s)`
      });
    }

  } catch (error) {
    results.push({
      category: 'account_types',
      test: 'Vérification account_types',
      passed: false,
      message: `❌ Erreur: ${error}`
    });
  }
}

async function verifyDataMigration() {
  console.log('\n📊 Test 2: Vérification de la migration des données\n');

  try {
    const unmigrated: any[] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM accounts
      WHERE account_type IS NOT NULL 
        AND account_type_code IS NULL;
    `) as any[];

    const unmigratedCount = Number((unmigrated[0] as any)?.count || 0);
    results.push({
      category: 'Migration',
      test: 'account_type → account_type_code',
      passed: unmigratedCount === 0,
      message: unmigratedCount === 0
        ? '✅ Tous les accounts ont account_type_code'
        : `❌ ${unmigratedCount} comptes sans account_type_code`
    });

    const unlinkedCif: any[] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM accounts a
      INNER JOIN customers c ON a.customer_id = c.id
      WHERE c.cif IS NOT NULL AND a.cif IS NULL;
    `) as any[];

    const unlinkedCount = Number((unlinkedCif[0] as any)?.count || 0);
    results.push({
      category: 'Migration',
      test: 'customers.cif → accounts.cif',
      passed: unlinkedCount === 0,
      message: unlinkedCount === 0
        ? '✅ Tous les accounts ont leur CIF lié'
        : `❌ ${unlinkedCount} comptes sans CIF alors que le customer a un CIF`
    });

    const inconsistent: any[] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM accounts
      WHERE account_type != account_type_code 
        AND account_type_code IS NOT NULL;
    `) as any[];

    const inconsistentCount = Number((inconsistent[0] as any)?.count || 0);
    results.push({
      category: 'Migration',
      test: 'account_type = account_type_code',
      passed: inconsistentCount === 0,
      message: inconsistentCount === 0
        ? '✅ account_type et account_type_code sont cohérents'
        : `❌ ${inconsistentCount} comptes avec valeurs incohérentes`
    });

  } catch (error) {
    results.push({
      category: 'Migration',
      test: 'Vérification des données',
      passed: false,
      message: `❌ Erreur: ${error}`
    });
  }
}

async function verifyIndexes() {
  console.log('\n🔍 Test 3: Vérification des index\n');

  try {
    const indexes: any[] = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'accounts'
        AND (
          indexname LIKE '%account_type_code%' 
          OR indexname LIKE '%cif%'
        )
      ORDER BY indexname;
    `) as any[];

    const indexNames = indexes.map((i: any) => i.indexname);

    // Vérifier les index attendus
    const expectedIndexes = [
      'accounts_account_type_code_idx',
      'accounts_cif_idx',
      'accounts_customer_id_account_type_code_idx',
      'accounts_cif_customer_id_idx'
    ];

    for (const expectedIndex of expectedIndexes) {
      const exists = indexNames.includes(expectedIndex);
      results.push({
        category: 'Index',
        test: expectedIndex,
        passed: exists,
        message: exists
          ? `✅ Index ${expectedIndex} existe`
          : `❌ Index ${expectedIndex} manquant`
      });
    }

  } catch (error) {
    results.push({
      category: 'Index',
      test: 'Vérification des index',
      passed: false,
      message: `❌ Erreur: ${error}`
    });
  }
}

async function verifyConstraints() {
  console.log('\n🔒 Test 4: Vérification des contraintes\n');

  try {
    const constraints: any[] = await db.execute(sql`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'accounts'::regclass
        AND conname LIKE '%account_type_code%';
    `) as any[];

    const constraintNames = constraints.map((c: any) => c.conname);

    // Vérifier la contrainte CHECK
    const hasCheckConstraint = constraintNames.includes('accounts_account_type_code_check');
    results.push({
      category: 'Contraintes',
      test: 'CHECK constraint sur account_type_code',
      passed: hasCheckConstraint,
      message: hasCheckConstraint
        ? '✅ Contrainte de validation des types existe'
        : '❌ Contrainte de validation manquante'
    });

  } catch (error) {
    results.push({
      category: 'Contraintes',
      test: 'Vérification des contraintes',
      passed: false,
      message: `❌ Erreur: ${error}`
    });
  }
}

async function verifyDataIntegrity() {
  console.log('\n🔐 Test 5: Vérification de l\'intégrité des données\n');

  try {
    const orphanCifs: any[] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM accounts a
      LEFT JOIN customers c ON a.cif = c.cif
      WHERE a.cif IS NOT NULL AND c.cif IS NULL;
    `) as any[];

    const orphanCount = Number((orphanCifs[0] as any)?.count || 0);
    results.push({
      category: 'Intégrité',
      test: 'Pas de CIF orphelins',
      passed: orphanCount === 0,
      message: orphanCount === 0
        ? '✅ Tous les CIF dans accounts correspondent à des customers'
        : `❌ ${orphanCount} comptes avec CIF orphelins`
    });

    const invalidTypes: any[] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM accounts
      WHERE account_type_code IS NOT NULL
        AND account_type_code NOT IN (
          'S01', 'S02', 'S03', 'S04', 'S05', 'S06',
          'SAVINGS', 'CURRENT', 'CREDIT', 'MOBILE_MONEY'
        );
    `) as any[];

    const invalidCount = Number((invalidTypes[0] as any)?.count || 0);
    results.push({
      category: 'Intégrité',
      test: 'Types de comptes valides',
      passed: invalidCount === 0,
      message: invalidCount === 0
        ? '✅ Tous les account_type_code sont valides'
        : `❌ ${invalidCount} comptes avec types invalides`
    });

    const invalidCifs: any[] = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM accounts
      WHERE cif IS NOT NULL
        AND cif !~ '^[0-9]{8}$';
    `) as any[];

    const invalidCifCount = Number((invalidCifs[0] as any)?.count || 0);
    results.push({
      category: 'Intégrité',
      test: 'Format CIF valide (8 chiffres)',
      passed: invalidCifCount === 0,
      message: invalidCifCount === 0
        ? '✅ Tous les CIF ont le bon format'
        : `❌ ${invalidCifCount} CIF avec format invalide`
    });

  } catch (error) {
    results.push({
      category: 'Intégrité',
      test: 'Vérification de l\'intégrité',
      passed: false,
      message: `❌ Erreur: ${error}`
    });
  }
}

function displayResults() {
  console.log('\n' + '='.repeat(60));
  console.log('\n📈 RÉSULTATS DE LA VÉRIFICATION\n');

  // Regrouper par catégorie
  const categories = [...new Set(results.map(r => r.category))];

  let totalTests = 0;
  let passedTests = 0;

  for (const category of categories) {
    console.log(`\n${category}:`);
    const categoryResults = results.filter(r => r.category === category);
    
    for (const result of categoryResults) {
      console.log(`  ${result.message}`);
      totalTests++;
      if (result.passed) passedTests++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n🎯 Score: ${passedTests}/${totalTests} tests réussis`);

  if (passedTests === totalTests) {
    console.log('\n✅ Tous les tests sont passés! La migration est réussie.\n');
  } else {
    console.log(`\n❌ ${totalTests - passedTests} test(s) échoué(s). Vérifiez les erreurs ci-dessus.\n`);
  }

  console.log('='.repeat(60) + '\n');
}

// Exécuter la vérification
verify().catch((error) => {
  console.error('❌ Erreur lors de la vérification:', error);
  process.exit(1);
});
