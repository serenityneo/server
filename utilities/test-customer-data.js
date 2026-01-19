/**
 * Script de test pour analyser toutes les données d'un client MEMBRE
 * Usage: node test-customer-data.js
 */

const { drizzle } = require('drizzle-orm/node-postgres');
const { Pool } = require('pg');
const { customers, accounts } = require('./drizzle/schema');
const { eq } = require('drizzle-orm');

// Configuration PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/serenity_bank',
});

const db = drizzle(pool);

async function analyzeCustomerData() {
  try {
    console.log('🔍 Recherche d\'un client MEMBRE dans la base...\n');

    // Trouver un client MEMBRE
    const memberCustomers = await db
      .select()
      .from(customers)
      .where(eq(customers.customerType, 'MEMBER'))
      .limit(5);

    if (memberCustomers.length === 0) {
      console.log('❌ Aucun client MEMBRE trouvé dans la base');
      process.exit(1);
    }

    const customer = memberCustomers[0];
    console.log('✅ Client trouvé:', customer.id, '-', customer.firstName, customer.lastName);
    console.log('📧 Email:', customer.email);
    console.log('📱 Téléphone:', customer.mobileMoneyNumber);
    console.log('\n' + '='.repeat(80) + '\n');

    // Afficher TOUS les champs de la table customers
    console.log('📋 TOUTES LES DONNÉES DU CLIENT (table customers):\n');
    
    const fields = Object.keys(customer);
    fields.forEach(field => {
      const value = customer[field];
      const displayValue = value === null ? '❌ NULL' : value === '' ? '⚠️  VIDE' : value;
      console.log(`  ${field.padEnd(30)} : ${displayValue}`);
    });

    console.log('\n' + '='.repeat(80) + '\n');

    // Récupérer les comptes
    const customerAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.customerId, customer.id));

    console.log(`💰 COMPTES BANCAIRES (${customerAccounts.length} compte(s)):\n`);
    
    if (customerAccounts.length === 0) {
      console.log('❌ Aucun compte trouvé pour ce client');
    } else {
      customerAccounts.forEach((account, index) => {
        console.log(`\n  Compte ${index + 1}:`);
        console.log(`    ID: ${account.id}`);
        console.log(`    Type: ${account.accountType}`);
        console.log(`    Numéro: ${account.accountNumber}`);
        console.log(`    Devise: ${account.currency}`);
        console.log(`    Solde CDF: ${account.balanceCdf || '0.00'} FC`);
        console.log(`    Solde USD: ${account.balanceUsd || '0.00'} $`);
        console.log(`    Statut: ${account.status}`);
        console.log(`    Créé le: ${account.createdAt}`);
      });
    }

    console.log('\n' + '='.repeat(80) + '\n');

    // Résumé des champs importants qui peuvent être NULL
    console.log('📊 ANALYSE DES CHAMPS IMPORTANTS:\n');
    
    const importantFields = {
      'CIF': customer.cif,
      'CIF Code': customer.cifCode,
      'Account Number': customer.accountNumber,
      'Date de naissance': customer.dateOfBirth,
      'Lieu de naissance': customer.placeOfBirth,
      'Genre': customer.gender,
      'Nationalité': customer.nationality,
      'État civil': customer.civilStatus,
      'Adresse': customer.address,
      'Profession': customer.profession,
      'Employeur': customer.employer,
      'Revenu mensuel': customer.monthlyIncome,
      'Quartier ID': customer.quartierId,
      'Commune ID': customer.communeId,
      'Code postal ID': customer.postalCodeId,
      'Agence ID': customer.agencyId,
      'Agent ID': customer.agentId,
      'Catégorie': customer.category,
      'Statut KYC': customer.kycStatus,
      'Étape KYC': customer.kycStep,
      'MFA activé': customer.mfaEnabled,
      'Limite transaction': customer.maxTransactionAmount,
      'Opérations max/jour': customer.maxDailyOperations,
      'Approbation duale': customer.requiresDualApproval,
      'Personne politique': customer.isPoliticalPerson,
      'Nom référence': customer.referenceName,
      'Téléphone référence': customer.referencePhone,
      'Relation référence': customer.referenceRelationship,
      'Dernière connexion': customer.lastLogin,
    };

    Object.entries(importantFields).forEach(([label, value]) => {
      const status = value === null ? '❌ NULL' : value === '' ? '⚠️  VIDE' : '✅ OK';
      const displayValue = value === null ? 'NULL' : value === '' ? 'VIDE' : value;
      console.log(`  ${status} ${label.padEnd(25)} : ${displayValue}`);
    });

    console.log('\n' + '='.repeat(80) + '\n');
    console.log('✅ Analyse terminée!');
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    await pool.end();
  }
}

analyzeCustomerData();
