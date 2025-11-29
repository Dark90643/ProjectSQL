import { pool } from "./db";
import { sql } from "drizzle-orm";

export async function initializeDatabase() {
  try {
    // Test connection first
    await pool.query("SELECT 1");
    
    // Create session table if it doesn't exist (for express-session)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        PRIMARY KEY ("sid")
      ) WITH (OIDS=FALSE);
      
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    // Create all other tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "discord_accounts" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "discord_id" text UNIQUE NOT NULL,
        "username" text NOT NULL,
        "discriminator" text,
        "avatar" text,
        "email" text,
        "access_token" text NOT NULL,
        "refresh_token" text NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "server_workspaces" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text UNIQUE NOT NULL,
        "server_name" text NOT NULL,
        "server_icon" text,
        "owner_id" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "server_members" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text NOT NULL,
        "discord_user_id" text NOT NULL,
        "discord_username" text,
        "roles" text[] NOT NULL DEFAULT ARRAY[]::text[],
        "is_owner" boolean NOT NULL DEFAULT false,
        "is_admin" boolean NOT NULL DEFAULT false,
        "joined_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "username" text UNIQUE NOT NULL,
        "password" text,
        "role" text NOT NULL DEFAULT 'Agent',
        "is_suspended" boolean NOT NULL DEFAULT false,
        "ip" text,
        "is_online" boolean NOT NULL DEFAULT false,
        "requires_invite_verification" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "cases" (
        "id" varchar PRIMARY KEY,
        "server_id" text,
        "user_id" text,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "status" text NOT NULL DEFAULT 'Active',
        "priority" text NOT NULL DEFAULT 'Medium',
        "assigned_agent" text NOT NULL,
        "content" text NOT NULL,
        "tags" text[] NOT NULL DEFAULT ARRAY[]::text[],
        "is_public" boolean NOT NULL DEFAULT false,
        "google_doc_url" text,
        "case_code" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "logs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text,
        "action" text NOT NULL,
        "user_id" varchar NOT NULL,
        "target_id" varchar,
        "details" text NOT NULL,
        "timestamp" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "invite_codes" (
        "code" text PRIMARY KEY,
        "is_used" boolean NOT NULL DEFAULT false,
        "used_by" varchar,
        "used_at" timestamp
      );

      CREATE TABLE IF NOT EXISTS "mod_warnings" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text NOT NULL,
        "user_id" text NOT NULL,
        "moderator_id" text NOT NULL,
        "reason" text NOT NULL,
        "timestamp" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "mod_mutes" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text NOT NULL,
        "user_id" text NOT NULL,
        "moderator_id" text NOT NULL,
        "reason" text NOT NULL,
        "duration" text NOT NULL,
        "muted_at" timestamp NOT NULL DEFAULT now(),
        "unmuted_at" timestamp
      );

      CREATE TABLE IF NOT EXISTS "mod_bans" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text NOT NULL,
        "user_id" text NOT NULL,
        "moderator_id" text NOT NULL,
        "reason" text NOT NULL,
        "duration" text NOT NULL DEFAULT 'permanent',
        "banned_at" timestamp NOT NULL DEFAULT now(),
        "unban_at" timestamp,
        "linked_ban_id" text,
        "is_main_server_ban" boolean NOT NULL DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS "mod_logs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text NOT NULL,
        "action" text NOT NULL,
        "moderator_id" text NOT NULL,
        "user_id" text NOT NULL,
        "reason" text,
        "duration" text,
        "ip_address" text,
        "timestamp" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "mod_ips" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text NOT NULL,
        "ip" text NOT NULL,
        "reason" text NOT NULL,
        "banned_by" text NOT NULL,
        "banned_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "webhook_configs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text NOT NULL,
        "case_log_webhook_url" text,
        "mod_log_webhook_url" text,
        "case_publish_webhook_url" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "server_links" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "main_server_id" text NOT NULL,
        "child_server_id" text NOT NULL,
        "link_code" text NOT NULL,
        "verified_at" timestamp NOT NULL DEFAULT now(),
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "server_link_verifications" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "link_code" text NOT NULL,
        "main_server_id" text NOT NULL,
        "child_server_id" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "expires_at" timestamp NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "server_permissions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "server_id" text NOT NULL,
        "command_name" text NOT NULL,
        "role_ids" text[] NOT NULL DEFAULT ARRAY[]::text[],
        "allow_admin" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    console.log("Database initialized successfully");
  } catch (error: any) {
    console.warn("Warning: Could not initialize database. This is expected in development or if the database endpoint is temporarily unavailable.");
    console.warn("Error details:", error.message || error);
    // Don't throw - allow app to continue running
  }
}
