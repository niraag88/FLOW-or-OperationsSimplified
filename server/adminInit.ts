import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { logger } from "./logger";

export async function initializeAdminUser() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      logger.info('Admin credentials not found in environment variables.');
      logger.info('To create an admin user, set ADMIN_USERNAME and ADMIN_PASSWORD environment variables.');
      return;
    }

    // Check if admin user already exists
    const existingAdmin = await db.select()
      .from(users)
      .where(eq(users.username, adminUsername))
      .limit(1);

    if (existingAdmin.length > 0) {
      // Task #444: keep the stored bcrypt hash in sync with the
      // ADMIN_PASSWORD environment variable. The original implementation
      // only created the row on first boot — if the env value was later
      // changed (e.g. in Secrets), the DB hash diverged and the admin
      // could no longer log in (POST /api/auth/login → 401). Compare on
      // every boot and re-hash when they no longer match.
      const stored = existingAdmin[0];
      const matches = await bcrypt.compare(adminPassword, stored.password);
      if (!matches) {
        const newHash = await bcrypt.hash(adminPassword, 12);
        // Deliberately do NOT touch `active` here — re-syncing the
        // password should not silently re-enable an admin that was
        // explicitly disabled by another administrator.
        await db.update(users)
          .set({ password: newHash })
          .where(eq(users.id, stored.id));
        logger.info(`Admin user '${adminUsername}' password re-synced from environment.`);
      } else {
        logger.info(`Admin user '${adminUsername}' already exists.`);
      }
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

    logger.info(`✅ Admin user '${adminUsername}' created successfully!`);
    logger.info('You can now log in to the system with your admin credentials.');

  } catch (error) {
    logger.error('Error initializing admin user:', error);
    // Don't exit the process, just log the error and continue
  }
}