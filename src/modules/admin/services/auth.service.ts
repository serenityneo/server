import { db } from '../../../db';
import { users, roles } from '../../../db/schema';
import { eq, or } from 'drizzle-orm';
import { verify } from 'argon2';

/**
 * Admin Authentication Service
 * Handles admin login, authentication, and 2FA checks
 */
export class AdminAuthService {
  /**
   * Authenticate admin user with email/username and password
   */
  async authenticate(emailOrUsername: string, password: string) {
    try {
      // OPTIMIZATION: Single query with JOIN to fetch user and role
      const result = await db
        .select({
          user: {
            id: users.id,
            email: users.email,
            username: users.username,
            passwordHash: users.passwordHash,
            roleId: users.roleId,
            isActive: users.isActive,
            mfaEnabled: users.mfaEnabled
          },
          roleName: roles.name
        })
        .from(users)
        .leftJoin(roles, eq(users.roleId, roles.id))
        .where(
          or(
            eq(users.email, emailOrUsername),
            eq(users.username, emailOrUsername)
          )
        )
        .limit(1);

      if (result.length === 0) {
        throw new Error('Identifiants invalides');
      }

      const { user, roleName } = result[0];

      // Check if user is active
      if (!user.isActive) {
        throw new Error('Compte désactivé');
      }

      // Verify password
      const isValidPassword = await verify(user.passwordHash, password);
      if (!isValidPassword) {
        throw new Error('Identifiants invalides');
      }

      // Check if user has admin role
      if (!roleName || !['Super Admin', 'Admin', 'Manager'].includes(roleName)) {
        throw new Error('Accès refusé. Privilèges insuffisants.');
      }

      // Update last login (fire and forget)
      db.update(users)
        .set({ lastLogin: new Date().toISOString() })
        .where(eq(users.id, user.id))
        .then(() => { })
        .catch(console.error);

      return {
        success: true,
        userId: user.id,
        email: user.email,
        username: user.username,
        mfaEnabled: user.mfaEnabled
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Erreur d\'authentification');
    }
  }

  /**
   * Get admin user details by ID
   */
  async getAdminUser(userId: number) {
    try {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          roleId: users.roleId,
          mfaEnabled: users.mfaEnabled,
          isActive: users.isActive
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Get role name
      const [role] = await db
        .select({ name: roles.name })
        .from(roles)
        .where(eq(roles.id, user.roleId))
        .limit(1);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          mfaEnabled: user.mfaEnabled,
          isActive: user.isActive,
          role: role?.name || 'admin'
        }
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Erreur lors de la récupération de l\'utilisateur');
    }
  }

  /**
   * Validate session and return admin user data
   * Used for session restoration after page refresh
   */
  async validateSession(userId: number) {
    try {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          roleId: users.roleId,
          mfaEnabled: users.mfaEnabled,
          isActive: users.isActive
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error('Session invalide');
      }

      if (!user.isActive) {
        throw new Error('Compte désactivé');
      }

      // Get role name
      const [role] = await db
        .select({ name: roles.name })
        .from(roles)
        .where(eq(roles.id, user.roleId))
        .limit(1);

      // Verify admin privileges
      if (!role || !['Super Admin', 'Admin', 'Manager'].includes(role.name)) {
        throw new Error('Privilèges insuffisants');
      }

      return {
        success: true,
        admin: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: role.name.toLowerCase().replace(' ', ''),
          mfaEnabled: user.mfaEnabled,
          isActive: user.isActive
        }
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Erreur de validation de session');
    }
  }

  /**
   * Refresh session - updates activity timestamp
   * Returns new expiration time
   */
  async refreshSession(userId: number) {
    try {
      const [user] = await db
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error('Session invalide');
      }

      if (!user.isActive) {
        throw new Error('Compte désactivé');
      }

      // Session renouvelée pour 30 minutes supplémentaires
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      return {
        success: true,
        message: 'Session renouvelée',
        expiresAt
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Erreur de renouvellement de session');
    }
  }
}