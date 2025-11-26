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
  type ModWarning,
  type InsertModWarning,
  type ModMute,
  type InsertModMute,
  type ModBan,
  type InsertModBan,
  type ModLog,
  type InsertModLog,
  type ModIp,
  type DiscordAccount,
  type InsertDiscordAccount,
  type ServerWorkspace,
  type InsertServerWorkspace,
  type ServerMember,
  type InsertServerMember,
  type WebhookConfig,
  type InsertWebhookConfig,
  type ServerLink,
  type InsertServerLink,
  type ServerLinkVerification,
  type InsertServerLinkVerification,
  users,
  cases,
  logs,
  inviteCodes,
  modWarnings,
  modMutes,
  modBans,
  modLogs,
  modIps,
  discordAccounts,
  serverWorkspaces,
  serverMembers,
  webhookConfigs,
  serverLinks,
  serverLinkVerifications,
} from "@shared/schema";
import { eq, desc, and, or } from "drizzle-orm";

export interface IStorage {
  // Discord operations
  getDiscordAccount(discordId: string): Promise<DiscordAccount | undefined>;
  createDiscordAccount(account: InsertDiscordAccount): Promise<DiscordAccount>;
  updateDiscordAccount(id: string, updates: Partial<DiscordAccount>): Promise<DiscordAccount | undefined>;
  
  // Server workspace operations
  getServerWorkspace(serverId: string): Promise<ServerWorkspace | undefined>;
  createServerWorkspace(workspace: InsertServerWorkspace): Promise<ServerWorkspace>;
  getServersByUser(discordUserId: string): Promise<ServerWorkspace[]>;
  getAllServerWorkspaces(): Promise<ServerWorkspace[]>;
  
  // Server member operations
  getServerMember(serverId: string, discordUserId: string): Promise<ServerMember | undefined>;
  createServerMember(member: InsertServerMember): Promise<ServerMember>;
  updateServerMember(serverId: string, discordUserId: string, updates: Partial<ServerMember>): Promise<ServerMember | undefined>;
  getServerMembers(serverId: string): Promise<ServerMember[]>;
  
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
  deleteCase(id: string, userId: string): Promise<boolean>;
  getCasesWithCodes(): Promise<Case[]>;
  
  // Log operations
  createLog(log: InsertLog): Promise<Log>;
  getAllLogs(): Promise<Log[]>;
  updateLog(logId: string, updates: { details?: string }): Promise<void>;
  deleteLog(logId: string): Promise<void>;
  
  // Invite code operations
  getInviteCode(code: string): Promise<InviteCode | undefined>;
  createInviteCode(code: InsertInviteCode): Promise<InviteCode>;
  useInviteCode(code: string, userId: string): Promise<InviteCode | undefined>;
  getAvailableInviteCodes(): Promise<InviteCode[]>;
  
  // Moderation operations
  getUserWarnings(serverId: string, userId: string): Promise<ModWarning[]>;
  addWarning(warning: InsertModWarning): Promise<ModWarning>;
  removeWarning(warningId: string): Promise<boolean>;
  removeAllWarnings(serverId: string, userId: string): Promise<boolean>;
  getUserMutes(serverId: string, userId: string): Promise<ModMute[]>;
  addMute(mute: InsertModMute): Promise<ModMute>;
  getUserBans(serverId: string, userId: string): Promise<ModBan[]>;
  addBan(ban: InsertModBan): Promise<ModBan>;
  removeAllBans(serverId: string, userId: string): Promise<boolean>;
  getIpBans(serverId: string, ip: string): Promise<ModIp[]>;
  addIpBan(ban: any): Promise<ModIp>;
  removeIpBan(ipBanId: string): Promise<boolean>;
  getUserModLogs(serverId: string, userId: string): Promise<ModLog[]>;
  addModLog(log: InsertModLog): Promise<ModLog>;
  
  // Webhook config operations
  getWebhookConfig(serverId: string): Promise<WebhookConfig | undefined>;
  createOrUpdateWebhookConfig(config: InsertWebhookConfig & { serverId: string }): Promise<WebhookConfig>;
  
  // Server linking operations
  createVerificationCode(mainServerId: string): Promise<ServerLinkVerification>;
  getVerificationCode(code: string): Promise<ServerLinkVerification | undefined>;
  linkServers(mainServerId: string, childServerId: string): Promise<ServerLink>;
  unlinkServers(mainServerId: string, childServerId: string): Promise<boolean>;
  getLinkedServers(serverId: string): Promise<ServerLink[]>;
  getChildServers(mainServerId: string): Promise<string[]>;
  
  // Banned users operations
  getBannedUsersForServer(serverId: string): Promise<(ModBan & { serverName?: string })[]>;
  getBannedUsersAcrossServers(mainServerId: string): Promise<(ModBan & { serverName?: string; linkedFrom?: string })[]>;
  unbanUserFromServer(serverId: string, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Discord operations
  async getDiscordAccount(discordId: string): Promise<DiscordAccount | undefined> {
    const [account] = await db.select().from(discordAccounts).where(eq(discordAccounts.discordId, discordId));
    return account;
  }

  async createDiscordAccount(account: InsertDiscordAccount): Promise<DiscordAccount> {
    const [newAccount] = await db.insert(discordAccounts).values(account).returning();
    return newAccount;
  }

  async updateDiscordAccount(id: string, updates: Partial<DiscordAccount>): Promise<DiscordAccount | undefined> {
    const [account] = await db
      .update(discordAccounts)
      .set(updates)
      .where(eq(discordAccounts.id, id))
      .returning();
    return account;
  }

  // Server workspace operations
  async getServerWorkspace(serverId: string): Promise<ServerWorkspace | undefined> {
    const [workspace] = await db.select().from(serverWorkspaces).where(eq(serverWorkspaces.serverId, serverId));
    return workspace;
  }

  async createServerWorkspace(workspace: InsertServerWorkspace): Promise<ServerWorkspace> {
    const [newWorkspace] = await db.insert(serverWorkspaces).values(workspace).returning();
    return newWorkspace;
  }

  async getServersByUser(discordUserId: string): Promise<ServerWorkspace[]> {
    return await db.select({ workspace: serverWorkspaces }).from(serverMembers)
      .innerJoin(serverWorkspaces, eq(serverMembers.serverId, serverWorkspaces.serverId))
      .where(eq(serverMembers.discordUserId, discordUserId))
      .then(results => results.map(r => r.workspace));
  }

  async getAllServerWorkspaces(): Promise<ServerWorkspace[]> {
    return await db.select().from(serverWorkspaces).orderBy(desc(serverWorkspaces.createdAt));
  }

  // Server member operations
  async getServerMember(serverId: string, discordUserId: string): Promise<ServerMember | undefined> {
    const [member] = await db.select().from(serverMembers)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.discordUserId, discordUserId)));
    return member;
  }

  async createServerMember(member: InsertServerMember): Promise<ServerMember> {
    const [newMember] = await db.insert(serverMembers).values(member).returning();
    return newMember;
  }

  async updateServerMember(serverId: string, discordUserId: string, updates: Partial<ServerMember>): Promise<ServerMember | undefined> {
    const [member] = await db.update(serverMembers)
      .set(updates)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.discordUserId, discordUserId)))
      .returning();
    return member;
  }

  async getServerMembers(serverId: string): Promise<ServerMember[]> {
    return await db.select().from(serverMembers).where(eq(serverMembers.serverId, serverId));
  }

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

  async deleteCase(id: string, userId: string): Promise<boolean> {
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

  async updateLog(logId: string, updates: { details?: string }): Promise<void> {
    await db.update(logs).set(updates).where(eq(logs.id, logId));
  }

  async deleteLog(logId: string): Promise<void> {
    await db.delete(logs).where(eq(logs.id, logId));
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
  
  // Moderation operations
  async getUserWarnings(serverId: string, userId: string): Promise<ModWarning[]> {
    return await db
      .select()
      .from(modWarnings)
      .where(and(eq(modWarnings.serverId, serverId), eq(modWarnings.userId, userId)))
      .orderBy(desc(modWarnings.timestamp));
  }
  
  async addWarning(warning: InsertModWarning): Promise<ModWarning> {
    const [newWarning] = await db.insert(modWarnings).values(warning).returning();
    return newWarning;
  }
  
  async getUserMutes(serverId: string, userId: string): Promise<ModMute[]> {
    return await db
      .select()
      .from(modMutes)
      .where(and(eq(modMutes.serverId, serverId), eq(modMutes.userId, userId)))
      .orderBy(desc(modMutes.mutedAt));
  }
  
  async addMute(mute: InsertModMute): Promise<ModMute> {
    const [newMute] = await db.insert(modMutes).values(mute).returning();
    return newMute;
  }
  
  async getUserBans(serverId: string, userId: string): Promise<ModBan[]> {
    return await db
      .select()
      .from(modBans)
      .where(and(eq(modBans.serverId, serverId), eq(modBans.userId, userId)))
      .orderBy(desc(modBans.bannedAt));
  }
  
  async addBan(ban: InsertModBan): Promise<ModBan> {
    const [newBan] = await db.insert(modBans).values(ban).returning();
    return newBan;
  }
  
  async getUserModLogs(serverId: string, userId: string): Promise<ModLog[]> {
    return await db
      .select()
      .from(modLogs)
      .where(and(eq(modLogs.serverId, serverId), eq(modLogs.targetId, userId)))
      .orderBy(desc(modLogs.timestamp));
  }
  
  async addModLog(log: InsertModLog): Promise<ModLog> {
    const [newLog] = await db.insert(modLogs).values(log).returning();
    return newLog;
  }
  
  async removeWarning(warningId: string): Promise<boolean> {
    await db.delete(modWarnings).where(eq(modWarnings.id, warningId));
    return true;
  }
  
  async removeAllWarnings(serverId: string, userId: string): Promise<boolean> {
    await db.delete(modWarnings).where(
      and(eq(modWarnings.serverId, serverId), eq(modWarnings.userId, userId))
    );
    return true;
  }
  
  async removeAllBans(serverId: string, userId: string): Promise<boolean> {
    await db.delete(modBans).where(
      and(eq(modBans.serverId, serverId), eq(modBans.userId, userId))
    );
    return true;
  }
  
  async getIpBans(serverId: string, ip: string): Promise<ModIp[]> {
    return await db
      .select()
      .from(modIps)
      .where(and(eq(modIps.serverId, serverId), eq(modIps.ip, ip)));
  }
  
  async addIpBan(ban: any): Promise<ModIp> {
    const [newBan] = await db.insert(modIps).values(ban).returning();
    return newBan;
  }
  
  async removeIpBan(ipBanId: string): Promise<boolean> {
    await db.delete(modIps).where(eq(modIps.id, ipBanId));
    return true;
  }

  // Webhook config operations
  async getWebhookConfig(serverId: string): Promise<WebhookConfig | undefined> {
    const [config] = await db.select().from(webhookConfigs).where(eq(webhookConfigs.serverId, serverId));
    return config;
  }

  async createOrUpdateWebhookConfig(config: InsertWebhookConfig & { serverId: string }): Promise<WebhookConfig> {
    const existing = await this.getWebhookConfig(config.serverId);
    if (existing) {
      const [updated] = await db
        .update(webhookConfigs)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(webhookConfigs.serverId, config.serverId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(webhookConfigs).values(config).returning();
      return created;
    }
  }
  
  // Server linking operations
  async createVerificationCode(mainServerId: string): Promise<ServerLinkVerification> {
    const code = Math.random().toString(36).substring(2, 12).toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const [verification] = await db.insert(serverLinkVerifications).values({
      mainServerId,
      verificationCode: code,
      expiresAt,
    }).returning();
    return verification;
  }
  
  async getVerificationCode(code: string): Promise<ServerLinkVerification | undefined> {
    const [verification] = await db.select().from(serverLinkVerifications).where(eq(serverLinkVerifications.verificationCode, code));
    return verification;
  }
  
  async linkServers(mainServerId: string, childServerId: string): Promise<ServerLink> {
    const [link] = await db.insert(serverLinks).values({
      mainServerId,
      childServerId,
    }).returning();
    return link;
  }
  
  async unlinkServers(mainServerId: string, childServerId: string): Promise<boolean> {
    await db.delete(serverLinks).where(
      and(eq(serverLinks.mainServerId, mainServerId), eq(serverLinks.childServerId, childServerId))
    );
    return true;
  }
  
  async getLinkedServers(serverId: string): Promise<ServerLink[]> {
    return await db.select().from(serverLinks).where(
      or(eq(serverLinks.mainServerId, serverId), eq(serverLinks.childServerId, serverId))
    );
  }
  
  async getChildServers(mainServerId: string): Promise<string[]> {
    const links = await db.select().from(serverLinks).where(eq(serverLinks.mainServerId, mainServerId));
    return links.map(link => link.childServerId);
  }
  
  async getBannedUsersForServer(serverId: string): Promise<(ModBan & { serverName?: string })[]> {
    const bans = await db.select().from(modBans).where(eq(modBans.serverId, serverId));
    return bans;
  }
  
  async getBannedUsersAcrossServers(mainServerId: string): Promise<any[]> {
    const childServers = await this.getChildServers(mainServerId);
    const allServerIds = [mainServerId, ...childServers];
    const bans = await db.select().from(modBans).where(
      or(...allServerIds.map(id => eq(modBans.serverId, id)))
    );
    
    // Enhance bans with server names and cascade info
    const enhancedBans = await Promise.all(bans.map(async (ban) => {
      const serverWorkspace = await this.getServerWorkspace(ban.serverId);
      let cascadedFrom = false;
      let mainServerName: string | undefined;
      let mainServerId: string | undefined;
      
      // If this ban has a linkedBanId, look up the main server ban
      if (ban.linkedBanId) {
        cascadedFrom = true;
        // Find the main server by looking for a ban with this ID in the main server
        const mainBan = await db.select().from(modBans).where(eq(modBans.id, ban.linkedBanId));
        if (mainBan.length > 0) {
          const mainServerWorkspace = await this.getServerWorkspace(mainBan[0].serverId);
          mainServerName = mainServerWorkspace?.serverName;
          mainServerId = mainBan[0].serverId;
        }
      }
      
      return {
        ...ban,
        serverName: serverWorkspace?.serverName || ban.serverId,
        cascadedFrom,
        mainServerName,
        mainServerId,
      };
    }));
    
    return enhancedBans;
  }
  
  async unbanUserFromServer(serverId: string, userId: string): Promise<boolean> {
    await db.delete(modBans).where(
      and(eq(modBans.serverId, serverId), eq(modBans.userId, userId))
    );
    return true;
  }
}

export const storage = new DatabaseStorage();
