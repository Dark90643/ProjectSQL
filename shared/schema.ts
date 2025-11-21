import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["Agent", "Management", "Overseer"] }).notNull().default("Agent"),
  isSuspended: boolean("is_suspended").notNull().default(false),
  ip: text("ip").notNull(),
  isOnline: boolean("is_online").notNull().default(false),
  requiresInviteVerification: boolean("requires_invite_verification").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cases = pgTable("cases", {
  id: varchar("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["Active", "Closed", "Redacted"] }).notNull().default("Active"),
  priority: text("priority", { enum: ["Low", "Medium", "High", "Critical"] }).notNull().default("Medium"),
  assignedAgent: text("assigned_agent").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  isPublic: boolean("is_public").notNull().default(false),
  googleDocUrl: text("google_doc_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const logs = pgTable("logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logs.$inferSelect;
export type InsertInviteCode = z.infer<typeof insertInviteCodeSchema>;
export type InviteCode = typeof inviteCodes.$inferSelect;
