import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

export async function initializeAdminUser() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      console.log('Admin credentials not found in environment variables.');
      console.log('To create an admin user, set ADMIN_USERNAME and ADMIN_PASSWORD environment variables');
      console.log('or run the admin creation script: npm run create-admin');
      return;
    }

    // Check if admin user already exists
    const existingAdmin = await db.select()
      .from(users)
      .where(eq(users.username, adminUsername))
      .limit(1);

    if (existingAdmin.length > 0) {
      console.log(`Admin user '${adminUsername}' already exists.`);
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    // Create the admin user
    const [newAdmin] = await db.insert(users).values({
      username: adminUsername,
      password: hashedPassword,
      role: 'Admin',
      firstName: 'System',
      lastName: 'Administrator',
      email: null,
      active: true
    }).returning();

    console.log(`✅ Admin user '${adminUsername}' created successfully!`);
    console.log('You can now log in to the system with your admin credentials.');

  } catch (error) {
    console.error('Error initializing admin user:', error);
    // Don't exit the process, just log the error and continue
  }
}