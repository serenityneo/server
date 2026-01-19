-- Migration: Table d'audit pour le taux de change
-- Objectif: Traçabilité complète des modifications pour conformité bancaire
-- Date: 2025-12-23

CREATE TABLE IF NOT EXISTS exchange_rate_audit (
    id SERIAL PRIMARY KEY,
    old_rate DOUBLE PRECISION,
    new_rate DOUBLE PRECISION NOT NULL,
    changed_by INTEGER NOT NULL,
    changed_by_email TEXT,
    changed_by_role TEXT,
    change_reason TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index pour rechercher rapidement les modifications par utilisateur
CREATE INDEX IF NOT EXISTS exchange_rate_audit_changed_by_idx 
    ON exchange_rate_audit(changed_by);

-- Index pour rechercher par date (plus récent d'abord)
CREATE INDEX IF NOT EXISTS exchange_rate_audit_created_at_idx 
    ON exchange_rate_audit(created_at DESC);

-- Commentaires pour documentation
COMMENT ON TABLE exchange_rate_audit IS 'Historique complet des modifications du taux de change USD/CDF pour audit bancaire';
COMMENT ON COLUMN exchange_rate_audit.old_rate IS 'Ancien taux (NULL si première configuration)';
COMMENT ON COLUMN exchange_rate_audit.new_rate IS 'Nouveau taux appliqué';
COMMENT ON COLUMN exchange_rate_audit.changed_by IS 'ID de l''utilisateur admin qui a modifié';
COMMENT ON COLUMN exchange_rate_audit.changed_by_email IS 'Email de l''admin pour traçabilité';
COMMENT ON COLUMN exchange_rate_audit.changed_by_role IS 'Rôle de l''admin (admin, superadmin)';
COMMENT ON COLUMN exchange_rate_audit.change_reason IS 'Raison de la modification (optionnel)';
COMMENT ON COLUMN exchange_rate_audit.ip_address IS 'Adresse IP de l''admin';
COMMENT ON COLUMN exchange_rate_audit.user_agent IS 'Navigateur/Device utilisé';
