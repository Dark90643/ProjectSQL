import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("WARNING: DATABASE_URL not set. Using dummy connection for build.");
}

// Supabase optimization: use connection pooling if available in the URL, 
// but postgres-js handles basic connectivity well.
const client = postgres(dbUrl || "postgres://localhost/dummy", {
  ssl: "require",
  prepare: false, // Recommended for Supabase/PgBouncer
});
export const db = drizzle({ client, schema });

// For session store compatibility
import { Pool } from "pg";
export const pool = new Pool({ 
  connectionString: dbUrl || "postgres://localhost/dummy",
  ssl: {
    rejectUnauthorized: false
  }
});
