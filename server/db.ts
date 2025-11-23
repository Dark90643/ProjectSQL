import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import * as schema from "@shared/schema";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("WARNING: DATABASE_URL not set. Using dummy connection for build.");
}

export const pool = new Pool({ 
  connectionString: dbUrl || "postgres://localhost/dummy" 
});
export const db = drizzle({ client: pool, schema });
