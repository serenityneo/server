#!/usr/bin/env bash

###############################################################################
# Script de Vérification de la Migration Account Type & CIF
# 
# Ce script vérifie que:
# 1. Les nouvelles colonnes existent dans la table accounts
# 2. La table account_types contient 12 lignes (6 types × 2 devises)
# 3. Les données ont été migrées correctement
# 4. Les index sont créés
# 5. Les contraintes sont actives
###############################################################################

set -e

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

banner() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BLUE}$1${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# Charger les variables d'environnement
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    error "DATABASE_URL n'est pas défini"
    exit 1
fi

banner "🔍 VÉRIFICATION DE LA MIGRATION"

PASSED=0
FAILED=0

# Test 1: Vérifier les colonnes
banner "📋 Test 1: Vérification des colonnes"

COLUMNS=$(psql "$DATABASE_URL" -t -c "
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'accounts' 
      AND column_name IN ('account_type_code', 'cif')
    ORDER BY column_name;
")

if echo "$COLUMNS" | grep -q "account_type_code"; then
    success "Colonne account_type_code trouvée"
    ((PASSED++))
else
    error "Colonne account_type_code manquante"
    ((FAILED++))
fi

if echo "$COLUMNS" | grep -q "cif"; then
    success "Colonne cif trouvée"
    ((PASSED++))
else
    error "Colonne cif manquante"
    ((FAILED++))
fi

# Test 2: Vérifier account_types
banner "📊 Test 2: Vérification de la table account_types"

ACCOUNT_TYPES_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM account_types;")
ACCOUNT_TYPES_COUNT=$(echo $ACCOUNT_TYPES_COUNT | tr -d ' ')

if [ "$ACCOUNT_TYPES_COUNT" -eq "12" ]; then
    success "12 types de comptes prédéfinis (6 types × 2 devises)"
    ((PASSED++))
else
    error "$ACCOUNT_TYPES_COUNT lignes au lieu de 12"
    ((FAILED++))
fi

# Vérifier chaque type S01-S06
for TYPE in S01 S02 S03 S04 S05 S06; do
    TYPE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM account_types WHERE code = '$TYPE';")
    TYPE_COUNT=$(echo $TYPE_COUNT | tr -d ' ')
    
    if [ "$TYPE_COUNT" -eq "2" ]; then
        success "Type $TYPE existe en CDF et USD"
        ((PASSED++))
    else
        error "Type $TYPE: $TYPE_COUNT devise(s) au lieu de 2"
        ((FAILED++))
    fi
done

# Test 3: Vérifier la migration des données
banner "🔄 Test 3: Vérification de la migration des données"

UNMIGRATED=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*) 
    FROM accounts 
    WHERE account_type IS NOT NULL AND account_type_code IS NULL;
")
UNMIGRATED=$(echo $UNMIGRATED | tr -d ' ')

if [ "$UNMIGRATED" -eq "0" ]; then
    success "Tous les accounts ont account_type_code"
    ((PASSED++))
else
    error "$UNMIGRATED comptes sans account_type_code"
    ((FAILED++))
fi

UNLINKED_CIF=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*) 
    FROM accounts a
    INNER JOIN customers c ON a.customer_id = c.id
    WHERE c.cif IS NOT NULL AND a.cif IS NULL;
")
UNLINKED_CIF=$(echo $UNLINKED_CIF | tr -d ' ')

if [ "$UNLINKED_CIF" -eq "0" ]; then
    success "Tous les accounts ont leur CIF lié"
    ((PASSED++))
else
    error "$UNLINKED_CIF comptes sans CIF alors que le customer a un CIF"
    ((FAILED++))
fi

# Test 4: Vérifier les index
banner "🔍 Test 4: Vérification des index"

INDEXES=$(psql "$DATABASE_URL" -t -c "
    SELECT indexname 
    FROM pg_indexes 
    WHERE tablename = 'accounts' 
      AND (indexname LIKE '%account_type_code%' OR indexname LIKE '%cif%')
    ORDER BY indexname;
")

for INDEX in "accounts_account_type_code_idx" "accounts_cif_idx" "accounts_customer_id_account_type_code_idx" "accounts_cif_customer_id_idx"; do
    if echo "$INDEXES" | grep -q "$INDEX"; then
        success "Index $INDEX existe"
        ((PASSED++))
    else
        error "Index $INDEX manquant"
        ((FAILED++))
    fi
done

# Test 5: Vérifier les contraintes
banner "🔒 Test 5: Vérification des contraintes"

CONSTRAINT=$(psql "$DATABASE_URL" -t -c "
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'accounts'::regclass 
      AND conname = 'accounts_account_type_code_check';
")

if echo "$CONSTRAINT" | grep -q "accounts_account_type_code_check"; then
    success "Contrainte CHECK sur account_type_code existe"
    ((PASSED++))
else
    error "Contrainte CHECK manquante"
    ((FAILED++))
fi

# Test 6: Vérifier l'intégrité des données
banner "🔐 Test 6: Vérification de l'intégrité"

ORPHAN_CIFS=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*) 
    FROM accounts a
    LEFT JOIN customers c ON a.cif = c.cif
    WHERE a.cif IS NOT NULL AND c.cif IS NULL;
")
ORPHAN_CIFS=$(echo $ORPHAN_CIFS | tr -d ' ')

if [ "$ORPHAN_CIFS" -eq "0" ]; then
    success "Tous les CIF correspondent à des customers"
    ((PASSED++))
else
    error "$ORPHAN_CIFS comptes avec CIF orphelins"
    ((FAILED++))
fi

# Résumé
banner "📈 RÉSULTATS"

TOTAL=$((PASSED + FAILED))

echo "Tests réussis: $PASSED/$TOTAL"
echo ""

if [ "$FAILED" -eq "0" ]; then
    success "Tous les tests sont passés! La migration est réussie."
    exit 0
else
    error "$FAILED test(s) échoué(s). Vérifiez les erreurs ci-dessus."
    exit 1
fi
