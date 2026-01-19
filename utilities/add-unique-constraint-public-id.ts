/**
 * Migration: Ajouter contrainte UNIQUE sur public_id
 * Garantit l'unicité au niveau de la base de données
 */

import { db } from '../src/db';
import { sql } from 'drizzle-orm';

async function addUniqueConstraint() {
  console.log('🔒 [Migration] Ajout de la contrainte UNIQUE sur public_id...');
  
  try {
    // Vérifier s'il existe des doublons
    const duplicates: any = await db.execute(sql`
      SELECT public_id, COUNT(*) as count
      FROM customers
      WHERE public_id IS NOT NULL
      GROUP BY public_id
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates && duplicates.length > 0) {
      console.error('❌ Doublons détectés dans public_id:');
      console.table(duplicates);
      throw new Error('Corrigez les doublons avant d\'ajouter la contrainte');
    }
    
    // Ajouter l'index unique
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_public_id_unique 
      ON customers(public_id) 
      WHERE public_id IS NOT NULL
    `);
    
    console.log('✅ Contrainte UNIQUE ajoutée avec succès sur public_id');
    console.log('🔒 La base de données garantit maintenant l\'unicité des Public IDs');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout de la contrainte:', error);
    throw error;
  }
}

addUniqueConstraint()
  .then(() => {
    console.log('✅ Migration terminée');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration échouée:', error);
    process.exit(1);
  });
