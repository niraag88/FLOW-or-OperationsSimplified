import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Add error handling to prevent application crashes on connection drops
pool.on('error', (err) => {
  console.error('Database pool error:', err);
  // Don't throw here, just log the error - let individual queries handle retries
});

export const db = drizzle({ client: pool, schema });
