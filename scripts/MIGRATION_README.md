# 🛠️ Scripts de Migration - Account Type & CIF

Ce dossier contient les scripts pour appliquer et vérifier la migration du nouveau système Account Type & CIF.

---

## 📋 Scripts Disponibles

### 1. **apply-account-migration.sh** 🚀
Script principal pour appliquer la migration de manière sécurisée.

**Utilisation:**
```bash
cd server
./scripts/apply-account-migration.sh
```

**Ce qu'il fait:**
1. ✅ Vérifie la connexion à la base de données
2. 💾 Crée une sauvegarde automatique
3. 📋 Affiche un aperçu de la migration
4. 🔧 Applique la migration SQL
5. 🔍 Vérifie que tout s'est bien passé

**Sortie attendue:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 MIGRATION ACCOUNT TYPE & CIF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 Étape 1/5: Vérification de la connexion
✅ Connexion à la base de données établie

💾 Étape 2/5: Sauvegarde de la base de données
✅ Sauvegarde créée avec succès

📋 Étape 3/5: Aperçu de la migration
[Confirmation requise]

🔧 Étape 4/5: Application de la migration
✅ Migration appliquée avec succès

🔍 Étape 5/5: Vérification de la migration
✅ Tous les tests de vérification sont passés!

🎉 MIGRATION TERMINÉE AVEC SUCCÈS
```

---

### 2. **verify-account-migration.ts** 🔍
Script de vérification pour s'assurer que la migration s'est bien passée.

**Utilisation:**
```bash
cd server
npx tsx scripts/verify-account-migration.ts
```

**Ce qu'il teste:**
- ✅ Existence des nouvelles colonnes (`account_type_code`, `cif`)
- ✅ Migration des données (`account_type` → `account_type_code`)
- ✅ Liaison CIF (`customers.cif` → `accounts.cif`)
- ✅ Création des index de performance
- ✅ Contraintes de validation
- ✅ Intégrité des données (CIF orphelins, types invalides)

**Sortie attendue:**
```
🔍 Vérification de la migration Account Type & CIF
============================================================

📋 Test 1: Vérification des colonnes
✅ Colonne account_type_code trouvée
✅ Colonne cif trouvée (varchar(8))

📊 Test 2: Vérification de la migration des données
✅ Tous les accounts ont account_type_code
✅ Tous les accounts ont leur CIF lié
✅ account_type et account_type_code sont cohérents

🔍 Test 3: Vérification des index
✅ Index accounts_account_type_code_idx existe
✅ Index accounts_cif_idx existe
✅ Index accounts_customer_id_account_type_code_idx existe
✅ Index accounts_cif_customer_id_idx existe

🔒 Test 4: Vérification des contraintes
✅ Contrainte de validation des types existe

🔐 Test 5: Vérification de l'intégrité
✅ Tous les CIF correspondent à des customers
✅ Tous les account_type_code sont valides
✅ Tous les CIF ont le bon format

============================================================
🎯 Score: 15/15 tests réussis
✅ Tous les tests sont passés! La migration est réussie.
```

---

## 🚀 Guide Rapide d'Utilisation

### Étape 1: Préparation
```bash
# S'assurer que la base de données est accessible
cd server
echo $DATABASE_URL

# Vérifier que tous les fichiers sont présents
ls -la drizzle/0005_update_accounts_schema.sql
ls -la scripts/apply-account-migration.sh
ls -la scripts/verify-account-migration.ts
```

### Étape 2: Application de la Migration
```bash
# Exécuter le script de migration (avec sauvegarde automatique)
./scripts/apply-account-migration.sh

# Répondre "oui" ou "yes" pour confirmer
```

### Étape 3: Vérification (Optionnel)
```bash
# Si vous voulez vérifier manuellement après coup
npx tsx scripts/verify-account-migration.ts
```

---

## 📁 Fichiers de la Migration

### Migration SQL
**Fichier:** `/server/drizzle/0005_update_accounts_schema.sql`

**Contenu:**
1. Ajout de `account_type_code` (text)
2. Ajout de `cif` (varchar 8)
3. Migration des données existantes
4. Création de 4 index de performance
5. Contrainte CHECK sur les types valides

### Schéma Drizzle Mis à Jour
**Fichier:** `/server/drizzle/schema.ts`

**Modifications:**
```typescript
export const accounts = pgTable("accounts", {
  // ... autres champs
  accountType: text("account_type").notNull(),        // Legacy
  accountTypeCode: text("account_type_code"),         // Nouveau ✨
  cif: varchar("cif", { length: 8 }),                 // Nouveau ✨
  // ... autres champs
});
```

---

## ⚠️ Gestion des Erreurs

### Erreur: "DATABASE_URL n'est pas défini"
**Solution:**
```bash
# Créer/vérifier le fichier .env
echo "DATABASE_URL=postgresql://user:pass@localhost:5432/dbname" > .env
```

### Erreur: "Impossible de se connecter à la base de données"
**Solution:**
```bash
# Vérifier que PostgreSQL est démarré
pg_isready

# Tester la connexion manuellement
psql $DATABASE_URL -c "SELECT 1"
```

### Erreur: "Certains tests ont échoué"
**Solution:**
1. Lire attentivement les messages d'erreur
2. Vérifier que la migration SQL s'est bien exécutée
3. Restaurer depuis la sauvegarde si nécessaire:
   ```bash
   psql $DATABASE_URL < backups/pre_account_migration_YYYYMMDD_HHMMSS.sql
   ```

---

## 🔄 Rollback (Annulation)

### Restaurer depuis la sauvegarde
```bash
# Lister les sauvegardes disponibles
ls -lh backups/

# Restaurer une sauvegarde spécifique
psql $DATABASE_URL < backups/pre_account_migration_20251223_120000.sql
```

### Rollback manuel (SQL)
```sql
-- Supprimer les colonnes ajoutées
ALTER TABLE accounts DROP COLUMN IF EXISTS account_type_code;
ALTER TABLE accounts DROP COLUMN IF EXISTS cif;

-- Supprimer les index
DROP INDEX IF EXISTS accounts_account_type_code_idx;
DROP INDEX IF EXISTS accounts_cif_idx;
DROP INDEX IF EXISTS accounts_customer_id_account_type_code_idx;
DROP INDEX IF EXISTS accounts_cif_customer_id_idx;

-- Supprimer la contrainte
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_type_code_check;
```

---

## 📊 Vérification Manuelle

### Vérifier les colonnes
```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'accounts'
  AND column_name IN ('account_type', 'account_type_code', 'cif')
ORDER BY column_name;
```

### Vérifier la migration des données
```sql
-- Compter les comptes avec/sans account_type_code
SELECT 
  COUNT(*) FILTER (WHERE account_type_code IS NOT NULL) as with_code,
  COUNT(*) FILTER (WHERE account_type_code IS NULL) as without_code,
  COUNT(*) as total
FROM accounts;

-- Vérifier la cohérence
SELECT COUNT(*)
FROM accounts
WHERE account_type != account_type_code
  AND account_type_code IS NOT NULL;
-- Résultat attendu: 0
```

### Vérifier les index
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'accounts'
  AND (indexname LIKE '%account_type_code%' OR indexname LIKE '%cif%')
ORDER BY indexname;
```

---

## 📚 Documentation Complémentaire

- **[ACCOUNT_TYPE_CIF_UPDATE.md](../../ACCOUNT_TYPE_CIF_UPDATE.md)** - Guide complet détaillé
- **[ACCOUNT_CIF_QUICK_SUMMARY.md](../../ACCOUNT_CIF_QUICK_SUMMARY.md)** - Résumé rapide
- **[ACCOUNT_CIF_DIAGRAM.md](../../ACCOUNT_CIF_DIAGRAM.md)** - Diagrammes et schémas

---

## 🆘 Support

En cas de problème:
1. Consulter les logs de la migration
2. Exécuter le script de vérification
3. Consulter la documentation complète
4. Restaurer depuis la sauvegarde si nécessaire

---

**Date de dernière mise à jour:** 23 décembre 2025
