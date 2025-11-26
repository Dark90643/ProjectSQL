import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const discordAccounts = pgTable("discord_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  discriminator: text("discriminator"),
  avatar: text("avatar"),
  email: text("email"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const serverWorkspaces = pgTable("server_workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull().unique(),
  serverName: text("server_name").notNull(),
  serverIcon: text("server_icon"),
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const serverMembers = pgTable("server_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull(),
  discordUserId: text("discord_user_id").notNull(),
  discordUsername: text("discord_username"),
  roles: text("roles").array().notNull().default(sql`ARRAY[]::text[]`),
  isOwner: boolean("is_owner").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password"),
  role: text("role", { enum: ["Agent", "Management", "Overseer"] }).notNull().default("Agent"),
  isSuspended: boolean("is_suspended").notNull().default(false),
  ip: text("ip"),
  isOnline: boolean("is_online").notNull().default(false),
  requiresInviteVerification: boolean("requires_invite_verification").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cases = pgTable("cases", {
  id: varchar("id").primaryKey(),
  serverId: text("server_id"),
  userId: text("user_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["Active", "Closed", "Redacted"] }).notNull().default("Active"),
  priority: text("priority", { enum: ["Low", "Medium", "High", "Critical"] }).notNull().default("Medium"),
  assignedAgent: text("assigned_agent").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  isPublic: boolean("is_public").notNull().default(false),
  googleDocUrl: text("google_doc_url"),
  caseCode: text("case_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const logs = pgTable("logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id"),
  action: text("action").notNull(),
  userId: varchar("user_id").notNull(),
  targetId: varchar("target_id"),
  details: text("details").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const inviteCodes = pgTable("invite_codes", {
  code: text("code").primaryKey(),
  isUsed: boolean("is_used").notNull().default(false),
  usedBy: varchar("used_by"),
  usedAt: timestamp("used_at"),
});

export const modWarnings = pgTable("mod_warnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  moderatorId: text("moderator_id").notNull(),
  reason: text("reason").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const modMutes = pgTable("mod_mutes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  moderatorId: text("moderator_id").notNull(),
  reason: text("reason").notNull(),
  duration: text("duration").notNull(), // e.g., "1h", "1d", "permanent"
  mutedAt: timestamp("muted_at").notNull().defaultNow(),
  unmutedAt: timestamp("unmuted_at"),
});

export const modBans = pgTable("mod_bans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull(),
  userId: text("user_id").notNull(),
  moderatorId: text("moderator_id").notNull(),
  reason: text("reason").notNull(),
  duration: text("duration").notNull().default("permanent"), // e.g., "1h", "1d", "7d", "permanent"
  bannedAt: timestamp("banned_at").notNull().defaultNow(),
  unbanAt: timestamp("unban_at"), // When the ban expires
  linkedBanId: text("linked_ban_id"), // Reference to parent ban if cascaded from main server
  isMainServerBan: boolean("is_main_server_ban").notNull().default(false),
});

export const modLogs = pgTable("mod_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull(),
  action: text("action").notNull(), // warn, kick, ban, mute, unmute
  moderatorId: text("moderator_id").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const modIps = pgTable("mod_ips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull(),
  ip: text("ip").notNull(),
  moderatorId: text("moderator_id").notNull(),
  reason: text("reason").notNull(),
  bannedAt: timestamp("banned_at").notNull().defaultNow(),
});

export const serverPermissions = pgTable("server_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull().unique(),
  allowedRoleIds: text("allowed_role_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  allowAdministrators: boolean("allow_administrators").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const webhookConfigs = pgTable("webhook_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: text("server_id").notNull().unique(),
  auditTrailChannelId: text("audit_trail_channel_id"),
  auditTrailEnabled: boolean("audit_trail_enabled").notNull().default(false),
  casePostChannelId: text("case_post_channel_id"),
  casePostEnabled: boolean("case_post_enabled").notNull().default(false),
  caseReleaseChannelId: text("case_release_channel_id"),
  caseReleaseEnabled: boolean("case_release_enabled").notNull().default(false),
  banLogsChannelId: text("ban_logs_channel_id"),
  banLogsEnabled: boolean("ban_logs_enabled").notNull().default(false),
  childServerBanChannelId: text("child_server_ban_channel_id"),
  childServerBanEnabled: boolean("child_server_ban_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const serverLinks = pgTable("server_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mainServerId: text("main_server_id").notNull(),
  childServerId: text("child_server_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const serverLinkVerifications = pgTable("server_link_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mainServerId: text("main_server_id").notNull(),
  verificationCode: text("verification_code").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertDiscordAccountSchema = createInsertSchema(discordAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServerWorkspaceSchema = createInsertSchema(serverWorkspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServerMemberSchema = createInsertSchema(serverMembers).omit({
  id: true,
  joinedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  isOnline: true,
});

export const insertCaseSchema = createInsertSchema(cases).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertLogSchema = createInsertSchema(logs).omit({
  id: true,
  timestamp: true,
});

export const insertInviteCodeSchema = createInsertSchema(inviteCodes).omit({
  isUsed: true,
  usedBy: true,
  usedAt: true,
});

export const insertModWarningSchema = createInsertSchema(modWarnings).omit({
  id: true,
  timestamp: true,
});

export const insertModMuteSchema = createInsertSchema(modMutes).omit({
  id: true,
  mutedAt: true,
  unmutedAt: true,
});

export const insertModBanSchema = createInsertSchema(modBans).omit({
  id: true,
  bannedAt: true,
  unbanAt: true,
});

export const insertModLogSchema = createInsertSchema(modLogs).omit({
  id: true,
  timestamp: true,
});

export const insertModIpSchema = createInsertSchema(modIps).omit({
  id: true,
  bannedAt: true,
});

export const insertServerPermissionSchema = createInsertSchema(serverPermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWebhookConfigSchema = createInsertSchema(webhookConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServerLinkSchema = createInsertSchema(serverLinks).omit({
  id: true,
  linkedAt: true,
});

export const insertServerLinkVerificationSchema = createInsertSchema(serverLinkVerifications).omit({
  id: true,
  createdAt: true,
});

export type InsertWebhookConfig = z.infer<typeof insertWebhookConfigSchema>;
export type WebhookConfig = typeof webhookConfigs.$inferSelect;
export type InsertDiscordAccount = z.infer<typeof insertDiscordAccountSchema>;
export type DiscordAccount = typeof discordAccounts.$inferSelect;
export type InsertServerWorkspace = z.infer<typeof insertServerWorkspaceSchema>;
export type ServerWorkspace = typeof serverWorkspaces.$inferSelect;
export type InsertServerMember = z.infer<typeof insertServerMemberSchema>;
export type ServerMember = typeof serverMembers.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logs.$inferSelect;
export type InsertInviteCode = z.infer<typeof insertInviteCodeSchema>;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type InsertModWarning = z.infer<typeof insertModWarningSchema>;
export type ModWarning = typeof modWarnings.$inferSelect;
export type InsertModMute = z.infer<typeof insertModMuteSchema>;
export type ModMute = typeof modMutes.$inferSelect;
export type InsertModBan = z.infer<typeof insertModBanSchema>;
export type ModBan = typeof modBans.$inferSelect;
export type InsertModLog = z.infer<typeof insertModLogSchema>;
export type ModLog = typeof modLogs.$inferSelect;
export type InsertModIp = z.infer<typeof insertModIpSchema>;
export type ModIp = typeof modIps.$inferSelect;
export type InsertServerPermission = z.infer<typeof insertServerPermissionSchema>;
export type ServerPermission = typeof serverPermissions.$inferSelect;
export type InsertServerLink = z.infer<typeof insertServerLinkSchema>;
export type ServerLink = typeof serverLinks.$inferSelect;
export type InsertServerLinkVerification = z.infer<typeof insertServerLinkVerificationSchema>;
export type ServerLinkVerification = typeof serverLinkVerifications.$inferSelect;
