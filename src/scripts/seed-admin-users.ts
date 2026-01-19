import { db } from '../db';
import { users, roles } from '../db/schema';
import { hash } from 'argon2';
import { eq } from 'drizzle-orm';

async function seedAdminUsers() {
  try {
    console.log('Seeding admin users...');

    // First, ensure we have the required roles
    const requiredRoles = [
      { name: 'Super Admin', description: 'Full system access' },
      { name: 'Admin', description: 'Administrative access' },
      { name: 'Manager', description: 'Limited administrative access' },
      { name: 'Caissier', description: 'Agent de caisse - opérations dépôts/retraits' },
      { name: 'KYC Validator', description: 'Validateur KYC - validation documents clients' }
    ];

    for (const role of requiredRoles) {
      const existingRole = await db
        .select()
        .from(roles)
        .where(eq(roles.name, role.name))
        .limit(1);

      if (existingRole.length === 0) {
        await db.insert(roles).values(role);
        console.log(`Created role: ${role.name}`);
      } else {
        console.log(`Role already exists: ${role.name}`);
      }
    }

    // Get the role IDs
    const superAdminRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'Super Admin'))
      .limit(1);

    const adminRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'Admin'))
      .limit(1);

    const managerRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'Manager'))
      .limit(1);

    const caissierRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'Caissier'))
      .limit(1);

    const kycValidatorRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'KYC Validator'))
      .limit(1);

    if (superAdminRole.length === 0 || adminRole.length === 0 || managerRole.length === 0 || caissierRole.length === 0 || kycValidatorRole.length === 0) {
      throw new Error('Required roles not found');
    }

    // Create default admin users
    const defaultAdmins = [
      {
        username: 'superadmin',
        email: 'superadmin@serenity.com',
        password: 'SuperAdmin123!',
        roleId: superAdminRole[0].id,
        validated: true,
        isActive: true
      },
      {
        username: 'admin',
        email: 'admin@serenity.com',
        password: 'Admin123!',
        roleId: adminRole[0].id,
        validated: true,
        isActive: true
      },
      {
        username: 'manager',
        email: 'manager@serenity.com',
        password: 'Manager123!',
        roleId: managerRole[0].id,
        validated: true,
        isActive: true
      }
    ];

    for (const admin of defaultAdmins) {
      // Check if user already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, admin.email))
        .limit(1);

      if (existingUser.length === 0) {
        // Hash the password
        const hashedPassword = await hash(admin.password);
        
        await db.insert(users).values({
          username: admin.username,
          email: admin.email,
          passwordHash: hashedPassword,
          roleId: admin.roleId,
          validated: admin.validated,
          isActive: admin.isActive,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        console.log(`Created admin user: ${admin.email}`);
      } else {
        console.log(`Admin user already exists: ${admin.email}`);
      }
    }

    console.log('Admin user seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding admin users:', error);
    process.exit(1);
  }
}

// Run the seed function
seedAdminUsers().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error during seeding:', error);
  process.exit(1);
});
