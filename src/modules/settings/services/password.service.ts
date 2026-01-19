import * as bcrypt from 'bcrypt';
import { db } from '../../../db';
import { customers } from '../../../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Password Service
 * Handles password verification and updates
 */
export class PasswordService {
  /**
   * Verify customer password
   */
  async verifyPassword(customerId: number, password: string): Promise<boolean> {
    try {
      const [customer] = await db
        .select({ passwordHash: customers.passwordHash })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      if (!customer || !customer.passwordHash) {
        return false;
      }

      return await bcrypt.compare(password, customer.passwordHash);
    } catch (error) {
      throw new Error(`Échec de la vérification du mot de passe: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Update customer password
   */
  async updatePassword(customerId: number, currentPassword: string, newPassword: string) {
    try {
      // Verify current password
      const isValidPassword = await this.verifyPassword(customerId, currentPassword);
      
      if (!isValidPassword) {
        return {
          success: false,
          error: 'Mot de passe actuel incorrect'
        };
      }

      // Validate new password
      if (newPassword.length < 8) {
        return {
          success: false,
          error: 'Le nouveau mot de passe doit contenir au moins 8 caractères'
        };
      }

      // Hash new password
      const saltRounds = 10;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update database - also mark password as changed for manual creations
      await db
        .update(customers)
        .set({ 
          passwordHash: newPasswordHash,
          passwordChangedAfterCreation: true, // Mark password as changed for manual customers
          updatedAt: new Date().toISOString()
        })
        .where(eq(customers.id, customerId));

      return {
        success: true,
        message: 'Mot de passe mis à jour avec succès'
      };
    } catch (error) {
      throw new Error(`Échec de la mise à jour du mot de passe: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }
}
