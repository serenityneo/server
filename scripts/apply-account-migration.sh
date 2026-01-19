#!/bin/bash

###############################################################################
# Script d'Application de la Migration Account Type & CIF
# 
# Ce script:
# 1. Vérifie la connexion à la base de données
# 2. Sauvegarde la base de données
# 3. Applique la migration
# 4. Vérifie que tout s'est bien passé
# 5. Affiche un rapport détaillé
###############################################################################

set -e  # Arrêter en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher des messages colorés
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
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
    info "Chargement des variables d'environnement..."
    export $(cat .env | grep -v '^#' | xargs)
    success "Variables d'environnement chargées"
else
    warning "Fichier .env non trouvé. Utilisation des variables d'environnement système."
fi

# Vérifier les variables requises
if [ -z "$DATABASE_URL" ]; then
    error "DATABASE_URL n'est pas défini"
    exit 1
fi

banner "🚀 MIGRATION ACCOUNT TYPE & CIF"

info "Base de données: $DATABASE_URL"
echo ""

# Étape 1: Vérifier la connexion
banner "📡 Étape 1/5: Vérification de la connexion"

if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    success "Connexion à la base de données établie"
else
    error "Impossible de se connecter à la base de données"
    exit 1
fi

# Étape 2: Sauvegarder la base de données
banner "💾 Étape 2/5: Sauvegarde de la base de données"

BACKUP_DIR="backups"
BACKUP_FILE="$BACKUP_DIR/pre_account_migration_$(date +%Y%m%d_%H%M%S).sql"

mkdir -p "$BACKUP_DIR"

info "Création de la sauvegarde: $BACKUP_FILE"

if pg_dump "$DATABASE_URL" > "$BACKUP_FILE"; then
    success "Sauvegarde créée avec succès"
    info "Taille: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    error "Échec de la sauvegarde"
    exit 1
fi

# Étape 3: Afficher le contenu de la migration
banner "📋 Étape 3/5: Aperçu de la migration"

info "Voici ce qui va être exécuté:"
echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ 1. Ajout de account_type_code (text)                        │"
echo "│ 2. Ajout de cif (varchar(8))                                │"
echo "│ 3. Migration account_type → account_type_code               │"
echo "│ 4. Migration customers.cif → accounts.cif                   │"
echo "│ 5. Création de 4 index de performance                       │"
echo "│ 6. Ajout d'une contrainte CHECK sur account_type_code       │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""

# Demander confirmation
read -p "Voulez-vous continuer? (oui/non): " -r
echo
if [[ ! $REPLY =~ ^[Oo][Uu][Ii]$ ]] && [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    warning "Migration annulée par l'utilisateur"
    exit 0
fi

# Étape 4: Appliquer la migration
banner "🔧 Étape 4/5: Application de la migration"

MIGRATION_FILE="drizzle/0005_update_accounts_schema.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    error "Fichier de migration non trouvé: $MIGRATION_FILE"
    exit 1
fi

info "Application de $MIGRATION_FILE..."

if psql "$DATABASE_URL" -f "$MIGRATION_FILE" > /dev/null 2>&1; then
    success "Migration appliquée avec succès"
else
    error "Échec de la migration"
    warning "La base de données peut être restaurée depuis: $BACKUP_FILE"
    echo ""
    info "Pour restaurer: psql \$DATABASE_URL < $BACKUP_FILE"
    exit 1
fi

# Étape 5: Vérifier la migration
banner "🔍 Étape 5/5: Vérification de la migration"

info "Exécution du script de vérification..."
echo ""

if npx tsx scripts/verify-account-migration.ts; then
    success "Tous les tests de vérification sont passés!"
else
    error "Certains tests ont échoué"
    warning "Vérifiez les erreurs ci-dessus"
    warning "La base de données peut être restaurée depuis: $BACKUP_FILE"
    exit 1
fi

# Résumé final
banner "🎉 MIGRATION TERMINÉE AVEC SUCCÈS"

echo "Résumé:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "Migration appliquée"
success "Tous les tests passés"
success "Sauvegarde disponible: $BACKUP_FILE"
echo ""
info "Prochaines étapes:"
echo "  1. Mettre à jour le code pour utiliser account_type_code"
echo "  2. Exécuter les tests unitaires"
echo "  3. Exécuter les tests d'intégration"
echo "  4. Déployer en production"
echo ""
info "Documentation:"
echo "  - Guide complet: ACCOUNT_TYPE_CIF_UPDATE.md"
echo "  - Résumé rapide: ACCOUNT_CIF_QUICK_SUMMARY.md"
echo "  - Diagrammes: ACCOUNT_CIF_DIAGRAM.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

success "Migration terminée! 🚀"
