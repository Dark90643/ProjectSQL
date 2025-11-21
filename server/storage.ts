import { db } from "./db";
import {
  type User,
  type InsertUser,
  type Case,
  type InsertCase,
  type Log,
  type InsertLog,
  type InviteCode,
  type InsertInviteCode,
  users,
  cases,
  logs,
  inviteCodes,
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  
  // Case operations
  getCase(id: string): Promise<Case | undefined>;
  getAllCases(): Promise<Case[]>;
  getPublicCases(): Promise<Case[]>;
  createCase(caseData: InsertCase): Promise<Case>;
  updateCase(id: string, updates: Partial<Case>): Promise<Case | undefined>;
  deleteCase(id: string): Promise<boolean>;
  getCasesWithCodes(): Promise<Case[]>;
  
  // Log operations
  createLog(log: InsertLog): Promise<Log>;
  getAllLogs(): Promise<Log[]>;
  
  // Invite code operations
  getInviteCode(code: string): Promise<InviteCode | undefined>;
  createInviteCode(code: InsertInviteCode): Promise<InviteCode>;
  useInviteCode(code: string, userId: string): Promise<InviteCode | undefined>;
  getAvailableInviteCodes(): Promise<InviteCode[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  // Case operations
  async getCase(id: string): Promise<Case | undefined> {
    const [caseData] = await db.select().from(cases).where(eq(cases.id, id));
    return caseData;
  }

  async getAllCases(): Promise<Case[]> {
    return await db.select().from(cases).orderBy(desc(cases.updatedAt));
  }

  async getPublicCases(): Promise<Case[]> {
    return await db.select().from(cases).where(eq(cases.isPublic, true)).orderBy(desc(cases.updatedAt));
  }

  async createCase(caseData: InsertCase): Promise<Case> {
    const [newCase] = await db.insert(cases).values(caseData).returning();
    return newCase;
  }

  async updateCase(id: string, updates: Partial<Case>): Promise<Case | undefined> {
    const [updatedCase] = await db
      .update(cases)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cases.id, id))
      .returning();
    return updatedCase;
  }

  async deleteCase(id: string): Promise<boolean> {
    const result = await db.delete(cases).where(eq(cases.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getCasesWithCodes(): Promise<Case[]> {
    return await db.select().from(cases).orderBy(desc(cases.updatedAt));
  }

  // Log operations
  async createLog(log: InsertLog): Promise<Log> {
    const [newLog] = await db.insert(logs).values(log).returning();
    return newLog;
  }

  async getAllLogs(): Promise<Log[]> {
    return await db.select().from(logs).orderBy(desc(logs.timestamp));
  }

  // Invite code operations
  async getInviteCode(code: string): Promise<InviteCode | undefined> {
    const [inviteCode] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
    return inviteCode;
  }

  async createInviteCode(code: InsertInviteCode): Promise<InviteCode> {
    const [newCode] = await db.insert(inviteCodes).values(code).returning();
    return newCode;
  }

  async useInviteCode(code: string, userId: string): Promise<InviteCode | undefined> {
    const [usedCode] = await db
      .update(inviteCodes)
      .set({ isUsed: true, usedBy: userId, usedAt: new Date() })
      .where(and(eq(inviteCodes.code, code), eq(inviteCodes.isUsed, false)))
      .returning();
    return usedCode;
  }

  async getAvailableInviteCodes(): Promise<InviteCode[]> {
    return await db.select().from(inviteCodes).where(eq(inviteCodes.isUsed, false));
  }
}

export const storage = new DatabaseStorage();
