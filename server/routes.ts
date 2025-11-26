import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { sendBotCasePostMessage, sendBotCaseReleaseMessage, sendBotAuditTrailMessage } from "./discord-webhook";
import { discordClient, checkUserGuildPermissions } from "./discord-bot";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@shared/schema";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      role: "Agent" | "Management" | "Overseer";
      isSuspended: boolean;
      ip: string;
      isOnline: boolean;
      serverId?: string;
      discordUserId?: string;
    }
  }
}

// Configure Passport
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return done(null, false, { message: "Invalid credentials" });
      }

      if (!user.password) {
        return done(null, false, { message: "Invalid credentials" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return done(null, false, { message: "Invalid credentials" });
      }

      if (user.isSuspended) {
        return done(null, false, { message: "Account suspended" });
      }

      return done(null, {
        id: user.id,
        username: user.username,
        role: user.role,
        isSuspended: user.isSuspended,
        ip: user.ip || "unknown",
        isOnline: user.isOnline,
      });
    } catch (error) {
      return done(error);
    }
  })
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: any, done) => {
  try {
    // Ensure id is a string
    if (!id || typeof id !== 'string') {
      return done(null, false);
    }
    
    // If ID contains ":", it's a Discord user - get the user object from session
    // This should have been set by select-server endpoint
    // For now, just return false and let requireAuth restore from session
    if (id.includes(":")) {
      return done(null, false);
    }
    
    const user = await storage.getUser(id);
    if (!user) {
      return done(null, false);
    }
    done(null, {
      id: user.id,
      username: user.username,
      role: user.role,
      isSuspended: user.isSuspended,
      ip: user.ip || "unknown",
      isOnline: user.isOnline,
    });
  } catch (error) {
    done(error);
  }
});

// Middleware
const requireAuth = (req: Request, res: Response, next: Function) => {
  // First check for Discord users stored directly in session
  if (req.session?.discordUser) {
    req.user = req.session.discordUser;
    console.log("Auth: User from session (Discord):", { id: req.user.id, role: req.user.role });
    return next();
  }
  
  // Then check session for Passport users
  if (req.session?.passport?.user) {
    req.user = req.session.passport.user;
    console.log("Auth: User from session (Passport):", { id: req.user.id, role: req.user.role });
    return next();
  }
  
  // Then try to get user from req.user (set by Passport for regular users)
  if (req.user) {
    console.log("Auth: User from req.user:", { id: req.user.id, role: req.user.role });
    return next();
  }
  
  console.log("Auth: No user found. Session:", req.session);
  return res.status(401).json({ error: "Unauthorized" });
};

const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: Function) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
};

const checkIpBan = async (req: Request, res: Response, next: Function) => {
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const allUsers = await storage.getAllUsers();
  const isBanned = allUsers.some(u => u.isSuspended && u.ip === clientIp);
  
  if (isBanned) {
    return res.status(403).json({ error: "IP_BANNED", ip: clientIp });
  }
  next();
};

const requireRoleOrServerOwner = (...roles: string[]) => {
  return async (req: Request, res: Response, next: Function) => {
    // Check if user has the required role
    if (req.user && roles.includes(req.user.role)) {
      return next();
    }
    
    // Check if user is a server owner/admin (for Discord users in server context)
    if (req.user?.discordUserId) {
      const serverId = (req.query.serverId as string) || req.body?.serverId;
      if (serverId) {
        try {
          const member = await storage.getServerMember(serverId, req.user.discordUserId);
          if (member && (member.isOwner || member.isAdmin)) {
            return next();
          }
        } catch (error) {
          console.error("Error checking server membership:", error);
        }
      }
    }
    
    return res.status(403).json({ error: "Forbidden" });
  };
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Auth routes
  app.post("/api/auth/register", checkIpBan, async (req: Request, res: Response) => {
    try {
      const { username, password, inviteCode } = req.body;
      
      // Validate invite code
      const code = await storage.getInviteCode(inviteCode);
      if (!code || code.isUsed) {
        return res.status(400).json({ error: "Invalid or used invite code" });
      }

      // Check if username exists
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already taken" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Get client IP
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";

      // Create user
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        role: "Agent",
        isSuspended: false,
        ip: clientIp,
      });

      // Mark code as used
      await storage.useInviteCode(inviteCode, user.id);

      // Log registration
      await storage.createLog({
        action: "REGISTER",
        userId: user.id,
        details: `New Agent registered with code ${inviteCode} from IP ${clientIp}`,
      });

      // Auto login
      const userForLogin: Express.User = {
        ...user,
        isOnline: true,
        ip: typeof clientIp === 'string' ? clientIp : "unknown",
      };
      req.login(userForLogin, async (err) => {
        if (err) {
          return res.status(500).json({ error: "Login failed after registration" });
        }
        
        // Update user to online
        await storage.updateUser(user.id, { isOnline: true, ip: clientIp });
        
        res.json({
          id: user.id,
          username: user.username,
          role: user.role,
          isSuspended: user.isSuspended,
          ip: clientIp,
          isOnline: true,
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", checkIpBan, async (req: Request, res: Response, next) => {
    passport.authenticate("local", async (err: any, user: Express.User | false, info: any) => {
      if (err) {
        return res.status(500).json({ error: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }

      req.login(user, async (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ error: "Login failed" });
        }

        // Update user to online
        const clientIp = req.ip || req.socket.remoteAddress || "unknown";
        const fullUser = await storage.getUser(user.id);
        await storage.updateUser(user.id, { isOnline: true, ip: clientIp });

        res.json({
          ...user,
          requiresInviteVerification: fullUser?.requiresInviteVerification || false,
        });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.id;
    
    // Set user offline
    await storage.updateUser(userId, { isOnline: false });
    
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, (req: Request, res: Response) => {
    res.json(req.user);
  });

  app.get("/api/auth/server-permissions", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      console.log("Permission check - req.user:", { id: user?.id, serverId: user?.serverId, discordUserId: user?.discordUserId });
      
      if (!user?.serverId || !user?.discordUserId) {
        console.log("No server context! User:", user);
        return res.status(400).json({ error: "No server context" });
      }

      // Check permissions via Discord bot (real-time)
      const { isOwner, isAdmin } = await checkUserGuildPermissions(user.serverId, user.discordUserId);
      console.log("Permission check - bot result:", { serverId: user.serverId, discordUserId: user.discordUserId, isOwner, isAdmin });
      
      const hasPermission = isOwner || isAdmin;
      
      res.json({ hasPermission, isOwner, isAdmin });
    } catch (error: any) {
      console.error("Check server permissions error:", error);
      res.status(500).json({ error: "Failed to check permissions" });
    }
  });

  app.get("/api/auth/check-ip", async (req: Request, res: Response) => {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const allUsers = await storage.getAllUsers();
    const isBanned = allUsers.some(u => u.isSuspended && u.ip === clientIp);
    
    res.json({ ip: clientIp, isBanned });
  });

  // Discord OAuth login - start the OAuth flow
  app.get("/api/auth/discord/login", (req: Request, res: Response) => {
    try {
      const clientId = process.env.DISCORD_CLIENT_ID;
      const apiUrl = process.env.API_URL || "http://localhost:5000";
      const redirectUri = `${apiUrl}/api/auth/discord/callback`;
      const scopes = ["identify", "email", "guilds"];

      console.log("Discord login - API_URL:", apiUrl);
      console.log("Discord login - redirectUri:", redirectUri);
      console.log("Discord login - clientId:", clientId);

      const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes.join("%20")}`;
      res.json({ authUrl });
    } catch (error: any) {
      console.error("Discord login URL error:", error);
      res.status(500).json({ error: "Failed to generate Discord login URL" });
    }
  });

  // Discord OAuth callback - exchange code for token
  app.get("/api/auth/discord/callback", async (req: Request, res: Response) => {
    try {
      console.log("=== Discord OAuth Callback Started ===");
      const { code, error } = req.query;
      
      // Handle user denying Discord authorization
      if (error) {
        console.log("Discord authorization denied by user");
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
        return res.redirect(`${frontendUrl}/?cancelled=true`);
      }
      
      if (!code) {
        console.error("Discord callback: No code provided");
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
        return res.redirect(`${frontendUrl}/?error=no_code`);
      }

      const clientId = process.env.DISCORD_CLIENT_ID;
      const clientSecret = process.env.DISCORD_CLIENT_SECRET;
      const apiUrl = process.env.API_URL || "http://localhost:5000";
      const redirectUri = `${apiUrl}/api/auth/discord/callback`;
      
      console.log("Discord callback - clientId exists:", !!clientId);
      console.log("Discord callback - clientSecret exists:", !!clientSecret);
      console.log("Discord callback - code:", code);
      console.log("Discord callback - redirectUri:", redirectUri);

      if (!clientId || !clientSecret) {
        console.error("Discord callback: Missing CLIENT_ID or CLIENT_SECRET");
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
        return res.redirect(`${frontendUrl}/?error=server_config`);
      }

      // Exchange code for access token
      console.log("Exchanging code for token...");
      const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code as string,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const text = await tokenResponse.text();
        console.error("Discord token exchange failed:", tokenResponse.status, text);
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
        return res.redirect(`${frontendUrl}/?error=token_exchange&details=${encodeURIComponent(text)}`);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      console.log("Token obtained successfully");

      // Get user info from Discord
      console.log("Fetching user info...");
      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userResponse.ok) {
        console.error("Failed to fetch Discord user info:", userResponse.status);
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
        return res.redirect(`${frontendUrl}/?error=user_info`);
      }

      const discordUser = await userResponse.json();
      console.log("User info obtained:", discordUser.id, discordUser.username);

      // Get user's guilds (servers)
      console.log("Fetching user guilds...");
      const guildsResponse = await fetch("https://discord.com/api/users/@me/guilds", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let userGuilds = [];
      if (guildsResponse.ok) {
        userGuilds = await guildsResponse.json();
        console.log("User has", userGuilds.length, "guilds");
      } else {
        console.warn("Failed to fetch user guilds:", guildsResponse.status);
      }

      // Get or create Discord account
      console.log("Getting or creating Discord account...");
      let discordAccount = await storage.getDiscordAccount(discordUser.id);
      if (!discordAccount) {
        console.log("Creating new Discord account");
        try {
          discordAccount = await storage.createDiscordAccount({
            discordId: discordUser.id,
            username: discordUser.username,
            email: discordUser.email || null,
            avatar: discordUser.avatar || null,
            accessToken,
            refreshToken: tokenData.refresh_token || "",
            expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          });
          console.log("Discord account created successfully");
        } catch (createError: any) {
          console.error("Failed to create Discord account:", createError.message);
          throw createError;
        }
      } else {
        console.log("Updating existing Discord account");
        try {
          await storage.updateDiscordAccount(discordAccount.id, {
            username: discordUser.username,
            email: discordUser.email || null,
            avatar: discordUser.avatar || null,
            accessToken,
            refreshToken: tokenData.refresh_token || "",
            expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          });
          console.log("Discord account updated successfully");
        } catch (updateError: any) {
          console.error("Failed to update Discord account:", updateError.message);
          throw updateError;
        }
      }

      // Create server workspaces and memberships for user's guilds
      console.log("Creating server workspaces and memberships...");
      for (const guild of userGuilds) {
        try {
          let workspace = await storage.getServerWorkspace(guild.id);
          if (!workspace) {
            console.log("Creating workspace for guild:", guild.id, guild.name);
            workspace = await storage.createServerWorkspace({
              serverId: guild.id,
              serverName: guild.name,
              ownerId: discordUser.id,
              serverIcon: guild.icon || undefined,
            });
          }

          let member = await storage.getServerMember(guild.id, discordUser.id);
          if (!member) {
            const isOwner = guild.owner === true;
            const isAdmin = (guild.permissions & 8) !== 0; // 8 = ADMINISTRATOR permission
            
            console.log("Creating member for guild:", guild.id, "isOwner:", isOwner, "isAdmin:", isAdmin);
            await storage.createServerMember({
              serverId: guild.id,
              discordUserId: discordUser.id,
              roles: guild.roles || [],
              isOwner,
              isAdmin,
            });
          }
        } catch (guildError: any) {
          console.error("Failed to create workspace/member for guild", guild.id, ":", guildError.message);
          // Don't fail the whole auth flow, just log and continue
        }
      }

      // Redirect to frontend with user info
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
      const redirectUrl = `${frontendUrl}/discord-auth?discordId=${discordUser.id}&username=${encodeURIComponent(discordUser.username)}`;
      console.log("Redirecting to:", redirectUrl);
      res.redirect(redirectUrl);
    } catch (error: any) {
      console.error("=== Discord callback error ===", error);
      console.error("Error stack:", error.stack);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
      res.redirect(`${frontendUrl}/?error=callback&details=${encodeURIComponent(error.message)}`);
    }
  });

  // Discord OAuth callback - POST endpoint for frontend to complete auth
  app.post("/api/auth/discord/callback", async (req: Request, res: Response) => {
    try {
      const { user: discordUser } = req.body;
      
      console.log("Discord POST callback - received:", JSON.stringify(req.body));
      
      if (!discordUser || !discordUser.id) {
        console.error("Missing Discord user data in POST body");
        return res.status(400).json({ error: "Missing Discord user data" });
      }

      console.log("Discord POST callback - user:", discordUser.id, discordUser.username);

      // Get Discord account - should already exist from GET callback
      let discordAccount = await storage.getDiscordAccount(discordUser.id);
      if (!discordAccount) {
        console.error("Discord account not found for user:", discordUser.id);
        console.error("This likely means the GET callback didn't complete successfully");
        return res.status(400).json({ error: "Discord authentication incomplete - try logging in again" });
      }

      console.log("Discord account found, establishing session");

      // Create a user object for Passport
      const clientIp2 = req.ip || req.socket.remoteAddress || "unknown";
      const user: Express.User = {
        id: discordUser.id,
        username: discordUser.username,
        role: "Agent", // Default role for Discord OAuth users
        isSuspended: false,
        ip: typeof clientIp2 === 'string' ? clientIp2 : "unknown",
        isOnline: true,
        discordUserId: discordUser.id,
      };

      // Establish Passport session
      req.login(user, (err) => {
        if (err) {
          console.error("Failed to establish session:", err);
          return res.status(500).json({ error: "Failed to establish session" });
        }

        // Store the full user object in session for Discord users
        if (req.session) {
          req.session.passport = { user };
          req.session.discordUser = user; // Also store directly for easier access
        }

        res.json({ discordId: discordUser.id, username: discordUser.username });
      });
    } catch (error: any) {
      console.error("Discord POST callback error:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ error: "Discord authentication failed", details: error.message });
    }
  });

  // Legacy endpoint for mock data during testing
  app.post("/api/auth/discord/mock-callback", async (req: Request, res: Response) => {
    try {
      const { accessToken, user: discordUser } = req.body;
      
      if (!accessToken || !discordUser || !discordUser.id) {
        return res.status(400).json({ error: "Missing Discord user data" });
      }

      // Get or create Discord account
      let discordAccount = await storage.getDiscordAccount(discordUser.id);
      if (!discordAccount) {
        discordAccount = await storage.createDiscordAccount({
          discordId: discordUser.id,
          username: discordUser.username,
          email: discordUser.email || null,
          avatar: discordUser.avatar || null,
          accessToken,
          refreshToken: "",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        // Create mock servers for new Discord users
        const mockServers = [
          { id: "123456789", name: "AEGIS Operations", icon: "🏛️" },
          { id: "987654321", name: "Intelligence Division", icon: "🕵️" },
          { id: "555444333", name: "Field Agents", icon: "🔐" }
        ];

        for (const mockServer of mockServers) {
          let workspace = await storage.getServerWorkspace(mockServer.id);
          if (!workspace) {
            workspace = await storage.createServerWorkspace({
              serverId: mockServer.id,
              serverName: mockServer.name,
              ownerId: discordUser.id,
            });
          }

          let member = await storage.getServerMember(mockServer.id, discordUser.id);
          if (!member) {
            await storage.createServerMember({
              serverId: mockServer.id,
              discordUserId: discordUser.id,
              roles: ["member"],
              isOwner: true,
              isAdmin: true,
            });
          }
        }
      }

      // Return Discord account info so frontend can show server selector
      res.json({ discordId: discordUser.id, username: discordUser.username });
    } catch (error: any) {
      console.error("Discord mock callback error:", error);
      res.status(500).json({ error: "Discord authentication failed" });
    }
  });

  app.get("/api/auth/discord/servers", async (req: Request, res: Response) => {
    try {
      const { discordId } = req.query;
      if (!discordId) {
        return res.status(400).json({ error: "Discord ID required" });
      }

      // Get all servers where the user is a member
      const userServers = await storage.getServersByUser(discordId as string);
      
      // Get all cases to count per server
      const allCases = await storage.getAllCases();
      
      // Get bot's guilds from Discord client
      const botGuilds = new Set<string>();
      if (discordClient && discordClient.isReady()) {
        discordClient.guilds.cache.forEach(guild => {
          botGuilds.add(guild.id);
        });
      }
      
      // Get server members for this user to check permissions
      const serversWithData: any[] = [];
      
      for (const server of userServers) {
        const member = await storage.getServerMember(server.serverId, discordId as string);
        
        // Only include servers where user is Owner or Admin (has permission to add bot)
        if (member && (member.isOwner || member.isAdmin)) {
          const caseCount = allCases.filter(c => c.serverId === server.serverId).length;
          const hasBotInServer = botGuilds.has(server.serverId);
          
          serversWithData.push({
            ...server,
            caseCount,
            hasBotInServer,
            serverIcon: server.serverIcon 
              ? `https://cdn.discordapp.com/icons/${server.serverId}/${server.serverIcon}.png`
              : undefined,
          });
        }
      }
      
      res.json(serversWithData);
    } catch (error: any) {
      console.error("Get servers error:", error);
      res.status(500).json({ error: "Failed to get servers" });
    }
  });

  app.get("/api/auth/discord/check-bot", async (req: Request, res: Response) => {
    try {
      const { serverId } = req.query;
      if (!serverId) {
        return res.status(400).json({ error: "Server ID required" });
      }

      // Check if bot is actually in the Discord server using the bot client
      let hasBotInServer = false;
      
      if (discordClient && discordClient.isReady()) {
        // Use the actual Discord bot client to check if it's in the guild
        const guild = discordClient.guilds.cache.get(serverId as string);
        hasBotInServer = !!guild;
      } else {
        // Fallback to database check if bot client is not ready
        const botDiscordId = "1442053672694714529";
        const botMember = await storage.getServerMember(serverId as string, botDiscordId);
        hasBotInServer = !!botMember;
      }
      
      res.json({ hasBotInServer });
    } catch (error: any) {
      console.error("Check bot error:", error);
      res.status(500).json({ error: "Failed to check bot status" });
    }
  });

  app.get("/api/auth/check-support-team", async (req: Request, res: Response) => {
    try {
      const { discordId } = req.query;
      if (!discordId) {
        return res.status(400).json({ error: "Discord ID required" });
      }

      const officialBotServer = "1441447050024714252";
      const member = await storage.getServerMember(officialBotServer, discordId as string);
      
      const isSupportTeam = !!(member && (member.isOwner || member.isAdmin));
      
      res.json({ isSupportTeam });
    } catch (error: any) {
      console.error("Check support team error:", error);
      res.json({ isSupportTeam: false });
    }
  });

  app.get("/api/auth/check-support-team-status", requireAuth, async (req: Request, res: Response) => {
    try {
      // For logged-in users, check if they're support team
      // We need to get their Discord ID from the user object
      const discordId = req.user?.discordUserId || req.user?.id;
      
      if (!discordId) {
        console.log("No Discord ID found in user:", { userId: req.user?.id, discordUserId: req.user?.discordUserId });
        return res.json({ isSupportTeam: false });
      }

      const officialBotServer = "1441447050024714252";
      const member = await storage.getServerMember(officialBotServer, discordId);
      
      const isSupportTeam = !!(member && (member.isOwner || member.isAdmin));
      console.log("Support team check:", { discordId, officialBotServer, isOwner: member?.isOwner, isAdmin: member?.isAdmin, isSupportTeam });
      
      res.json({ isSupportTeam });
    } catch (error: any) {
      console.error("Check support team status error:", error);
      res.json({ isSupportTeam: false });
    }
  });

  app.get("/api/support/all-cases", requireAuth, async (req: Request, res: Response) => {
    try {
      // Check if user is support team
      const discordId = req.user?.discordUserId || req.user?.id;
      if (!discordId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const officialBotServer = "1441447050024714252";
      const member = await storage.getServerMember(officialBotServer, discordId);
      
      if (!member || (!member.isOwner && !member.isAdmin)) {
        return res.status(403).json({ error: "Not authorized to access support panel" });
      }

      // Get bot's guilds from Discord client - ALL servers the bot is in
      const serverStats: any = {};
      if (discordClient && discordClient.isReady()) {
        // Add all servers the bot is in
        for (const [guildId, guild] of discordClient.guilds.cache) {
          const workspace = await storage.getServerWorkspace(guildId);
          serverStats[guildId] = {
            serverId: guildId,
            serverName: workspace?.serverName || guild.name,
            totalCases: 0,
            activeCases: 0,
            closedCases: 0,
          };
        }
      }
      
      // If no servers found through Discord client, fall back to database
      if (Object.keys(serverStats).length === 0) {
        const allWorkspaces = await storage.getAllServerWorkspaces();
        allWorkspaces.forEach(workspace => {
          serverStats[workspace.serverId] = {
            serverId: workspace.serverId,
            serverName: workspace.serverName,
            totalCases: 0,
            activeCases: 0,
            closedCases: 0,
          };
        });
      }
      
      // Get all cases from all servers
      const allCases = await storage.getAllCases();
      
      // Add cases to the stats
      const casesWithServer: any[] = [];
      for (const caseData of allCases) {
        const serverId = caseData.serverId || "";
        const serverName = serverStats[serverId]?.serverName || `Server ${serverId}`;
        
        casesWithServer.push({
          ...caseData,
          serverName,
        });

        if (serverId && serverStats[serverId]) {
          serverStats[serverId].totalCases++;
          if (caseData.status === "Active") {
            serverStats[serverId].activeCases++;
          } else if (caseData.status === "Closed") {
            serverStats[serverId].closedCases++;
          }
        }
      }

      res.json({
        cases: casesWithServer,
        serverStats: Object.values(serverStats),
      });
    } catch (error: any) {
      console.error("Get all cases error:", error);
      res.status(500).json({ error: "Failed to get cases" });
    }
  });

  app.post("/api/auth/discord/select-server", checkIpBan, async (req: Request, res: Response) => {
    try {
      const { discordId, serverId, discordUsername, avatar } = req.body;
      if (!discordId || !serverId) {
        return res.status(400).json({ error: "Discord ID and server ID required" });
      }

      // Get or create server workspace
      let workspace = await storage.getServerWorkspace(serverId);
      if (!workspace) {
        try {
          workspace = await storage.createServerWorkspace({
            serverId,
            serverName: `Server ${serverId}`,
            ownerId: discordId,
          });
        } catch (error: any) {
          // If workspace already exists (race condition), just fetch it
          if (error.code === '23505') {
            workspace = await storage.getServerWorkspace(serverId);
          } else {
            throw error;
          }
        }
      }

      // Get or create server member
      let member = await storage.getServerMember(serverId, discordId);
      if (!member) {
        // Check if this user is the workspace owner
        const isOwner = workspace?.ownerId === discordId;
        
        try {
          member = await storage.createServerMember({
            serverId,
            discordUserId: discordId,
            roles: ["member"],
            isOwner,
            isAdmin: false,
          });
        } catch (error: any) {
          // If member already exists, just fetch it
          if (error.code === '23505') {
            member = await storage.getServerMember(serverId, discordId);
          } else {
            throw error;
          }
        }
      }
      
      // Update server member with Discord username if provided
      if (discordUsername && member) {
        try {
          console.log("Updating server member with Discord username:", { serverId, discordId, discordUsername });
          const updatedMember = await storage.updateServerMember(serverId, discordId, { discordUsername });
          console.log("Updated member result:", updatedMember);
        } catch (err) {
          console.warn("Failed to update Discord username:", err);
        }
      } else {
        console.log("Skipped username update:", { hasUsername: !!discordUsername, hasMember: !!member });
      }

      // Log the member data for debugging
      console.log("Server member found:", {
        serverId,
        discordId,
        discordUsername,
        isOwner: member?.isOwner,
        isAdmin: member?.isAdmin,
      });

      // Create a session user for this workspace
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const roleFromMember = member && (member.isOwner ? "Overseer" : member.isAdmin ? "Management" : "Agent") || "Agent";
      const user: Express.User & { discordUsername?: string; discordAvatar?: string } = {
        id: `${discordId}:${serverId}`,
        username: discordId,
        role: roleFromMember,
        isSuspended: false,
        ip: typeof clientIp === 'string' ? clientIp : "unknown",
        isOnline: true,
        serverId,
        discordUserId: discordId,
        discordUsername,
        discordAvatar: avatar,
      };
      
      console.log("User role assignment:", {
        discordId,
        serverId,
        role: roleFromMember,
        isOwner: member?.isOwner,
        isAdmin: member?.isAdmin,
      });

      // For Discord users, bypass Passport and store directly in session
      // because Passport's serialization doesn't work with composite IDs
      if (req.session) {
        req.session.discordUser = {
          ...user,
          discordUsername,
          discordAvatar: avatar,
        };
        console.log("Discord user session established:", { id: user.id, serverId: user.serverId, role: user.role, discordUsername, avatar });
      }
      res.json({
        ...user,
        discordUsername,
        discordAvatar: avatar,
      });
    } catch (error: any) {
      console.error("Select server error:", error);
      res.status(500).json({ error: "Failed to select server" });
    }
  });

  // User routes
  app.get("/api/users", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    const users = await storage.getAllUsers();
    res.json(users.map(u => ({ ...u, password: undefined })));
  });

  // Get server members with user info for the current server
  app.get("/api/server-members", requireAuth, async (req: Request, res: Response) => {
    try {
      const serverId = req.user!.serverId || req.query.serverId as string;
      if (!serverId) {
        return res.status(400).json({ error: "Server ID required" });
      }

      // Get server members
      const members = await storage.getServerMembers(serverId);
      
      // Get all users for reference
      const allUsers = await storage.getAllUsers();
      
      // Combine member info with user data (for logging, display)
      const membersWithUserInfo = members.map(member => {
        const userInfo = allUsers.find(u => u.id === member.discordUserId);
        return {
          id: member.discordUserId,
          username: userInfo?.username || member.discordUserId,
          discordUsername: (member as any)?.discordUsername || (userInfo as any)?.discordUsername || member.discordUserId,
          role: member.isOwner ? "Overseer" : member.isAdmin ? "Management" : "Agent",
          isSuspended: userInfo?.isSuspended || false,
          isOnline: userInfo?.isOnline || false,
          serverId,
          discordUserId: member.discordUserId,
          isOwner: member.isOwner,
          isAdmin: member.isAdmin,
        };
      });
      
      res.json(membersWithUserInfo);
    } catch (error: any) {
      console.error("Get server members error:", error);
      res.status(500).json({ error: "Failed to get server members" });
    }
  });

  app.patch("/api/users/:id/suspend", requireAuth, requireRole("Overseer"), async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = await storage.updateUser(id, { isSuspended: true });
    
    if (user) {
      await storage.createLog({
        action: "USER_SUSPEND",
        userId: req.user!.id,
        targetId: id,
        details: "Suspended user access",
      }).then(() => {
        sendBotAuditTrailMessage({
          action: "USER_SUSPEND",
          userId: req.user!.id,
          targetId: id,
          details: "Suspended user access",
          serverId: req.user!.serverId,
        }).catch(err => console.error("Failed to send audit trail message:", err));
      });
    }
    
    res.json(user ? { ...user, password: undefined } : null);
  });

  app.patch("/api/users/:id/unsuspend", requireAuth, requireRole("Overseer"), async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = await storage.updateUser(id, { isSuspended: false });
    
    if (user) {
      await storage.createLog({
        action: "USER_UNSUSPEND",
        userId: req.user!.id,
        targetId: id,
        details: "Restored user access",
      }).then(() => {
        sendBotAuditTrailMessage({
          action: "USER_UNSUSPEND",
          userId: req.user!.id,
          targetId: id,
          details: "Restored user access",
          serverId: req.user!.serverId,
        }).catch(err => console.error("Failed to send audit trail message:", err));
      });
    }
    
    res.json(user ? { ...user, password: undefined } : null);
  });

  app.patch("/api/users/:id/edit", requireAuth, requireRole("Overseer"), async (req: Request, res: Response) => {
    const { id } = req.params;
    const { username, password, role } = req.body;
    
    const updates: Partial<User> = {};
    const changes: string[] = [];
    
    if (username !== undefined) {
      const existing = await storage.getUserByUsername(username);
      if (existing && existing.id !== id) {
        return res.status(400).json({ error: "Username already taken" });
      }
      updates.username = username;
      changes.push(`username to ${username}`);
    }
    
    if (password !== undefined) {
      updates.password = await bcrypt.hash(password, 10);
      changes.push("password");
    }
    
    if (role !== undefined) {
      if (!["Agent", "Management", "Overseer"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      updates.role = role;
      changes.push(`role to ${role}`);
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }
    
    const user = await storage.updateUser(id, updates);
    
    if (user) {
      await storage.createLog({
        action: "USER_EDIT",
        userId: req.user!.id,
        targetId: id,
        details: `Edited user: ${changes.join(", ")}`,
      }).then(() => {
        sendBotAuditTrailMessage({
          action: "USER_EDIT",
          userId: req.user!.id,
          targetId: id,
          details: `Edited user: ${changes.join(", ")}`,
          serverId: req.user!.serverId,
        }).catch(err => console.error("Failed to send audit trail message:", err));
      });
    }
    
    res.json(user ? { ...user, password: undefined } : null);
  });

  app.post("/api/users/create", requireAuth, requireRole("Overseer"), async (req: Request, res: Response) => {
    try {
      const { username, inviteCode } = req.body;
      
      if (!username || !inviteCode) {
        return res.status(400).json({ error: "Username and invite code required" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already taken" });
      }

      const code = await storage.getInviteCode(inviteCode);
      if (!code || code.isUsed) {
        return res.status(400).json({ error: "Invalid or already used invite code" });
      }

      // Use the invite code as the password
      const hashedPassword = await bcrypt.hash(code.code, 10);
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";

      const user = await storage.createUser({
        username,
        password: hashedPassword,
        role: "Agent",
        isSuspended: false,
        ip: clientIp,
      });

      await storage.updateUser(user.id, { requiresInviteVerification: true });

      await storage.createLog({
        action: "USER_CREATE",
        userId: req.user!.id,
        targetId: user.id,
        details: `Created account for ${username} requiring invite verification`,
      }).then(() => {
        sendBotAuditTrailMessage({
          action: "USER_CREATE",
          userId: req.user!.id,
          targetId: user.id,
          details: `Created account for ${username} requiring invite verification`,
          serverId: req.user!.serverId,
        }).catch(err => console.error("Failed to send audit trail message:", err));
      });

      res.json({ username: user.username, inviteCode, tempPassword: code.code });
    } catch (error) {
      console.error("User creation error:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.post("/api/invites/generate", requireAuth, requireRole("Overseer"), async (req: Request, res: Response) => {
    try {
      const code = Math.random().toString(36).slice(2, 10).toUpperCase();
      const inviteCode = await storage.createInviteCode({ code });
      
      await storage.createLog({
        action: "INVITE_GENERATE",
        userId: req.user!.id,
        details: `Generated invite code ${code}`,
      }).then(() => {
        sendBotAuditTrailMessage({
          action: "INVITE_GENERATE",
          userId: req.user!.id,
          targetId: code,
          details: `Generated invite code ${code}`,
          serverId: req.user!.serverId,
        }).catch(err => console.error("Failed to send audit trail message:", err));
      });

      res.json(inviteCode);
    } catch (error) {
      console.error("Invite generation error:", error);
      res.status(500).json({ error: "Failed to generate invite code" });
    }
  });

  app.post("/api/invites/verify", requireAuth, async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      const userId = req.user!.id;

      const inviteCode = await storage.getInviteCode(code);
      if (!inviteCode || inviteCode.isUsed) {
        return res.status(400).json({ error: "Invalid or already used invite code" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.requiresInviteVerification) {
        return res.status(400).json({ error: "Account does not require verification" });
      }

      await storage.useInviteCode(code, userId);
      await storage.updateUser(userId, { requiresInviteVerification: false });

      await storage.createLog({
        action: "INVITE_VERIFY",
        userId: userId,
        details: `Verified account with invite code`,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Invite verification error:", error);
      res.status(500).json({ error: "Failed to verify invite code" });
    }
  });

  // Case routes
  app.post("/api/cases/:id/encrypt", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const caseData = await storage.getCase(id);
      
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }

      // Generate 12-character code with words, numbers, and special symbols
      const words = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GAMMA", "DELTA"];
      const specialSymbols = ["@", "#", "$", "%", "&", "*", "+"];
      
      const randomWord = words[Math.floor(Math.random() * words.length)];
      const randomSpecial = specialSymbols[Math.floor(Math.random() * specialSymbols.length)];
      const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
      const randomCode = Math.random().toString(36).substring(2, 4).toUpperCase();
      
      const caseCode = `${randomWord}${randomSpecial}${randomNum}${randomCode}`.substring(0, 12);

      const updatedCase = await storage.updateCase(id, { caseCode });

      await storage.createLog({
        action: "CASE_ENCRYPT",
        userId: req.user!.id,
        targetId: id,
        details: `Generated encryption code for case ${caseData.title}`,
        serverId: caseData.serverId || undefined,
      }).then(() => {
        // Send audit trail message
        if (caseData.serverId) {
          sendBotAuditTrailMessage({
            action: "CASE_ENCRYPT",
            userId: req.user!.id,
            targetId: id,
            details: `Generated encryption code for case ${caseData.title}`,
            serverId: caseData.serverId,
          }).catch(err => console.error("Failed to send audit trail message:", err));
        }
      });

      res.json({ caseCode, updatedCase });
    } catch (error) {
      console.error("Case encryption error:", error);
      res.status(500).json({ error: "Failed to encrypt case" });
    }
  });

  app.get("/api/cases", requireAuth, async (req: Request, res: Response) => {
    const { serverId } = req.query;
    
    // If serverId is provided (Discord OAuth flow), filter by that server
    if (serverId) {
      // Verify user is a member of this server
      const discordUserId = req.user!.discordUserId || req.user!.id;
      const isServerMember = await storage.getServerMember(serverId as string, discordUserId);
      if (!isServerMember) {
        return res.status(403).json({ error: "Not a member of this server" });
      }
      
      // Get all cases and filter by serverId
      const allCases = await storage.getAllCases();
      const serverCases = allCases.filter(c => c.serverId === serverId);
      return res.json(serverCases);
    }
    
    // For traditional username/password login (no serverId), return all cases
    const allCases = await storage.getAllCases();
    res.json(allCases);
  });

  app.get("/api/cases/encrypted/list", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const allCases = await storage.getCasesWithCodes();
      const encryptedCases = allCases.filter(c => c.caseCode);
      res.json(encryptedCases);
    } catch (error) {
      console.error("Error fetching encrypted cases:", error);
      res.status(500).json({ error: "Failed to fetch encrypted cases" });
    }
  });

  app.post("/api/cases/:id/decrypt", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const caseData = await storage.getCase(id);
      
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }

      const updatedCase = await storage.updateCase(id, { caseCode: null });

      await storage.createLog({
        action: "CASE_DECRYPT",
        userId: req.user!.id,
        targetId: id,
        details: `Removed encryption from case ${caseData.title}`,
        serverId: caseData.serverId || undefined,
      }).then(() => {
        if (caseData.serverId) {
          sendBotAuditTrailMessage({
            action: "CASE_DECRYPT",
            userId: req.user!.id,
            targetId: id,
            details: `Removed encryption from case ${caseData.title}`,
            serverId: caseData.serverId,
          }).catch(err => console.error("Failed to send audit trail message:", err));
        }
      });

      res.json({ success: true, updatedCase });
    } catch (error) {
      console.error("Case decryption error:", error);
      res.status(500).json({ error: "Failed to decrypt case" });
    }
  });

  app.get("/api/cases/public", async (req: Request, res: Response) => {
    const { serverId } = req.query;
    const allPublicCases = await storage.getPublicCases();
    
    // Filter by serverId if provided
    if (serverId) {
      const filtered = allPublicCases.filter(c => c.serverId === serverId);
      res.json(filtered);
    } else {
      res.json(allPublicCases);
    }
  });

  app.get("/api/public/servers", async (req: Request, res: Response) => {
    try {
      // Get all servers where the bot is present for public display
      const allWorkspaces = await storage.getAllServerWorkspaces();
      const allCases = await storage.getAllCases();
      
      // Get bot's guilds from Discord client
      const botGuilds = new Set<string>();
      if (discordClient && discordClient.isReady()) {
        discordClient.guilds.cache.forEach(guild => {
          botGuilds.add(guild.id);
        });
      }
      
      // Filter servers where bot is present
      const serversWithData: any[] = [];
      
      for (const server of allWorkspaces) {
        if (botGuilds.has(server.serverId)) {
          const publicCaseCount = allCases.filter(c => c.serverId === server.serverId && c.isPublic).length;
          
          serversWithData.push({
            ...server,
            publicCaseCount,
            serverIcon: server.serverIcon 
              ? `https://cdn.discordapp.com/icons/${server.serverId}/${server.serverIcon}.png`
              : undefined,
          });
        }
      }
      
      res.json(serversWithData);
    } catch (error: any) {
      console.error("Get public servers error:", error);
      res.status(500).json({ error: "Failed to get servers" });
    }
  });

  app.post("/api/admin/cleanup-legacy-accounts", requireAuth, requireRole("Overseer"), async (req: Request, res: Response) => {
    try {
      // Delete legacy accounts that have no Discord association
      const allUsers = await storage.getAllUsers();
      const legacyUsers = allUsers.filter(u => !u.id.includes(":") && ["MGM_DIRECTOR", "AGENT_FOX", "INTELLIGENCE", "AGENT_SMITH", "OVERSEER"].some(legacy => u.username?.includes(legacy)));
      
      let deletedCount = 0;
      for (const user of legacyUsers) {
        try {
          await storage.updateUser(user.id, { isSuspended: true });
          deletedCount++;
        } catch (error) {
          console.error("Failed to suspend user:", user.id);
        }
      }
      
      res.json({ success: true, deletedCount, message: `Suspended ${deletedCount} legacy accounts` });
    } catch (error: any) {
      console.error("Cleanup legacy accounts error:", error);
      res.status(500).json({ error: "Failed to cleanup accounts" });
    }
  });

  app.get("/api/cases/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    const caseData = await storage.getCase(id);
    
    // If case doesn't exist, return null
    if (!caseData) {
      return res.json(null);
    }
    
    // If case is public, return it to anyone (for Discord bot and public access)
    if (caseData.isPublic) {
      return res.json(caseData);
    }
    
    // If case is private, require authentication
    // Check both Passport auth and Discord session auth
    const isAuthenticated = req.isAuthenticated() || !!req.session?.discordUser;
    if (!isAuthenticated) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    res.json(caseData);
  });

  app.post("/api/cases", requireAuth, async (req: Request, res: Response) => {
    let newCase: any = null;
    try {
      const caseData = req.body;
      // Use serverId from request body, or fall back to user's serverId (Discord OAuth users)
      const serverId = caseData.serverId || req.user!.serverId;
      
      console.log("Creating case with data:", { title: caseData.title, serverId, userId: req.user!.id });
      
      // Only Agent, Management, and Overseer roles can create cases
      if (!["Agent", "Management", "Overseer"].includes(req.user!.role)) {
        return res.status(403).json({ error: "Only authorized users can create cases" });
      }
      
      const id = `CASE-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`;
      
      try {
        newCase = await storage.createCase({
          ...caseData,
          id,
          assignedAgent: req.user!.username,
          isPublic: false,
          serverId: serverId || null,
        });
        console.log("✓ Case created successfully:", newCase.id);
      } catch (caseError: any) {
        console.error("✗ Failed to create case:", caseError.message);
        return res.status(500).json({ error: "Failed to create case: " + caseError.message });
      }

      // Create log in background (completely non-blocking)
      storage.createLog({
        action: "CASE_CREATE",
        userId: req.user!.id,
        targetId: newCase.id,
        serverId: serverId || undefined,
        details: `Created case ${newCase.title}`,
      }).then(() => {
        console.log("✓ Log created for case:", newCase.id);
        // Send audit trail message
        if (serverId) {
          sendBotAuditTrailMessage({
            action: "CASE_CREATE",
            userId: req.user!.id,
            targetId: newCase.id,
            details: `Created case ${newCase.title}`,
            serverId,
          }).catch(err => console.error("Failed to send audit trail message:", err));
        }
      }).catch((logError: any) => {
        console.error("✗ Failed to create log (continuing):", logError.message);
      });

      // Send bot channel message (non-blocking)
      sendBotCasePostMessage({
        id: newCase.id,
        title: newCase.title,
        description: newCase.description,
        priority: newCase.priority,
        serverId: serverId || newCase.serverId,
      }).catch(err => {
        console.error("Failed to send bot case post message:", err.message);
      });

      res.json(newCase);
    } catch (error: any) {
      console.error("✗ Create case outer error:", error.message);
      // If we got here, case was already created but something failed
      if (newCase) {
        res.json(newCase); // Return the created case anyway
      } else {
        res.status(500).json({ error: error.message || "Failed to create case" });
      }
    }
  });

  app.patch("/api/cases/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // Use serverId from request body, query, or fall back to user's serverId
      const queryServerId = req.query.serverId as string;
      const bodyServerId = req.body?.serverId;
      const serverId = bodyServerId || queryServerId || req.user!.serverId;
      
      const updates = { ...req.body };
      delete updates.serverId; // Don't update serverId
      
      // Only Agent, Management, and Overseer roles can update cases
      if (!["Agent", "Management", "Overseer"].includes(req.user!.role)) {
        return res.status(403).json({ error: "Only authorized users can update cases" });
      }
      
      // Get the case first to validate
      const caseData = await storage.getCase(id);
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }
      
      // If serverId is provided, verify it matches
      if (serverId && caseData.serverId !== serverId) {
        return res.status(403).json({ error: "Case not found in this server" });
      }
      
      // If serverId is provided, verify user is a member
      if (serverId) {
        const discordUserId = req.user!.discordUserId || req.user!.id;
        const isServerMember = await storage.getServerMember(serverId, discordUserId);
        if (!isServerMember) {
          return res.status(403).json({ error: "Not a member of this server" });
        }
      }
      
      const updatedCase = await storage.updateCase(id, updates);
      
      if (updatedCase) {
        // Create log in background (non-blocking)
        storage.createLog({
          action: "CASE_UPDATE",
          userId: req.user!.id,
          targetId: id,
          serverId: caseData.serverId || undefined,
          details: "Updated case details",
        }).then(() => {
          // Send audit trail message
          if (caseData.serverId) {
            sendBotAuditTrailMessage({
              action: "CASE_UPDATE",
              userId: req.user!.id,
              targetId: id,
              details: "Updated case details",
              serverId: caseData.serverId,
            }).catch(err => console.error("Failed to send audit trail message:", err));
          }
        }).catch((logError: any) => {
          console.error("✗ Failed to create update log:", logError.message);
        });
      }
      
      res.json(updatedCase || null);
    } catch (error: any) {
      console.error("Update case error:", error);
      res.status(500).json({ error: "Failed to update case" });
    }
  });

  app.delete("/api/cases/:id", requireAuth, requireRoleOrServerOwner("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { serverId } = req.query;
      
      const caseData = await storage.getCase(id);
      
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }
      
      // If serverId is provided, verify it matches
      if (serverId && caseData.serverId !== serverId) {
        return res.status(403).json({ error: "Case not found in this server" });
      }
      
      // If serverId is provided, verify user is a member
      if (serverId) {
        const discordUserId = req.user!.discordUserId || req.user!.id;
        const isServerMember = await storage.getServerMember(serverId as string, discordUserId);
        if (!isServerMember) {
          return res.status(403).json({ error: "Not a member of this server" });
        }
      }

      const success = await storage.deleteCase(id, req.user!.id);
      
      if (success) {
        // Create log in background (non-blocking)
        storage.createLog({
          action: "CASE_DELETE",
          userId: req.user!.id,
          targetId: id,
          serverId: caseData.serverId || undefined,
          details: JSON.stringify({ title: caseData.title, caseData: caseData }),
        }).then(() => {
          // Send audit trail message
          if (caseData.serverId) {
            sendBotAuditTrailMessage({
              action: "CASE_DELETE",
              userId: req.user!.id,
              targetId: id,
              details: `Deleted case ${caseData.title}`,
              serverId: caseData.serverId,
            }).catch(err => console.error("Failed to send audit trail message:", err));
          }
        }).catch((logError: any) => {
          console.error("✗ Failed to create delete log:", logError.message);
        });
      }
      
      res.json({ success });
    } catch (error: any) {
      console.error("Delete case error:", error);
      res.status(500).json({ error: "Failed to delete case" });
    }
  });

  app.patch("/api/cases/:id/toggle-public", requireAuth, requireRoleOrServerOwner("Overseer"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // Use serverId from query or user's serverId
      const queryServerId = req.query.serverId as string;
      const serverId = queryServerId || req.user!.serverId;
      
      const caseData = await storage.getCase(id);
      
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }
      
      // If serverId is provided, verify it matches
      if (serverId && caseData.serverId !== serverId) {
        return res.status(403).json({ error: "Case not found in this server" });
      }
      
      // If serverId is provided, verify user is a member
      if (serverId) {
        const discordUserId = req.user!.discordUserId || req.user!.id;
        const isServerMember = await storage.getServerMember(serverId, discordUserId);
        if (!isServerMember) {
          return res.status(403).json({ error: "Not a member of this server" });
        }
      }
      
      const updatedCase = await storage.updateCase(id, { isPublic: !caseData.isPublic });
      
      if (updatedCase) {
        // Create log in background (non-blocking)
        storage.createLog({
          action: "CASE_PUBLIC_TOGGLE",
          userId: req.user!.id,
          targetId: id,
          serverId: caseData.serverId || undefined,
          details: `Changed public visibility to ${updatedCase.isPublic}`,
        }).then(() => {
          // Send audit trail message
          if (caseData.serverId) {
            sendBotAuditTrailMessage({
              action: "CASE_PUBLIC_TOGGLE",
              userId: req.user!.id,
              targetId: id,
              details: `Changed public visibility to ${updatedCase.isPublic}`,
              serverId: caseData.serverId,
            }).catch(err => console.error("Failed to send audit trail message:", err));
          }
        }).catch((logError: any) => {
          console.error("✗ Failed to create toggle log:", logError.message);
        });

        // Send bot channel message when case is made public (non-blocking)
        if (updatedCase.isPublic) {
          sendBotCaseReleaseMessage({
            id: updatedCase.id,
            title: updatedCase.title,
            description: updatedCase.description,
            priority: updatedCase.priority,
            status: updatedCase.status,
            assignedAgent: updatedCase.assignedAgent,
            content: updatedCase.content,
            tags: updatedCase.tags,
            caseCode: updatedCase.caseCode,
            googleDocUrl: updatedCase.googleDocUrl,
            serverId: caseData.serverId || updatedCase.serverId,
          }).catch(err => {
            console.error("Failed to send bot case release message:", err);
          });
        }
      }
      
      res.json(updatedCase);
    } catch (error: any) {
      console.error("Toggle case public error:", error);
      res.status(500).json({ error: "Failed to toggle case visibility" });
    }
  });

  // Log routes
  app.get("/api/logs", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    const logs = await storage.getAllLogs();
    res.json(logs);
  });

  // Recovery routes
  app.get("/api/recovery/deleted-cases", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const allLogs = await storage.getAllLogs();
      
      // Get all restored case IDs
      const restoredCaseIds = new Set(
        allLogs
          .filter(log => log.action === "CASE_RESTORE")
          .map(log => log.targetId)
      );
      
      const deletedLogs = allLogs
        .filter(log => log.action === "CASE_DELETE" && !restoredCaseIds.has(log.targetId))
        .map(log => {
          try {
            const parsed = JSON.parse(log.details);
            return { ...log, caseData: parsed.caseData };
          } catch {
            return log;
          }
        });
      res.json(deletedLogs);
    } catch (error) {
      console.error("Error fetching deleted cases:", error);
      res.status(500).json({ error: "Failed to fetch deleted cases" });
    }
  });

  app.post("/api/recovery/restore", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const { caseId } = req.body;
      
      if (!caseId) {
        return res.status(400).json({ error: "Case ID required" });
      }

      // Check if case already exists
      const existingCase = await storage.getCase(caseId);
      if (existingCase) {
        return res.json({ success: true, case: existingCase, message: "Case already restored" });
      }

      const allLogs = await storage.getAllLogs();
      const deleteLog = allLogs.find(log => log.action === "CASE_DELETE" && log.targetId === caseId);
      
      if (!deleteLog) {
        return res.status(404).json({ error: "Deleted case not found" });
      }

      let caseData;
      try {
        const parsed = JSON.parse(deleteLog.details);
        caseData = parsed.caseData;
      } catch (e) {
        // Handle old format where details was just a string
        return res.status(400).json({ error: "Invalid deletion log format - cannot restore this case" });
      }
      
      // Remove timestamp fields since they're auto-generated on insert
      const { createdAt, updatedAt, ...caseDataToRestore } = caseData;
      
      const restored = await storage.createCase(caseDataToRestore);

      await storage.createLog({
        action: "CASE_RESTORE",
        userId: req.user!.id,
        targetId: caseId,
        details: `Restored deleted case ${restored.title}`,
        serverId: restored.serverId || undefined,
      }).then(() => {
        if (restored.serverId) {
          sendBotAuditTrailMessage({
            action: "CASE_RESTORE",
            userId: req.user!.id,
            targetId: caseId,
            details: `Restored deleted case ${restored.title}`,
            serverId: restored.serverId,
          }).catch(err => console.error("Failed to send audit trail message:", err));
        }
      });

      res.json({ success: true, case: restored });
    } catch (error) {
      console.error("Error restoring case:", error);
      res.status(500).json({ error: "Failed to restore case" });
    }
  });

  app.post("/api/recovery/:caseId/remove-embed", requireAuth, requireRole("Overseer"), async (req: Request, res: Response) => {
    try {
      const { caseId } = req.params;
      
      if (!caseId) {
        return res.status(400).json({ error: "Case ID required" });
      }

      const allLogs = await storage.getAllLogs();
      const deleteLog = allLogs.find(log => log.action === "CASE_DELETE" && log.targetId === caseId);
      
      if (!deleteLog) {
        return res.status(404).json({ error: "Deleted case not found" });
      }

      let parsed;
      try {
        parsed = JSON.parse(deleteLog.details);
      } catch (e) {
        return res.status(400).json({ error: "Invalid deletion log format" });
      }

      const caseData = parsed.caseData;
      if (!caseData.googleDocUrl) {
        return res.status(400).json({ error: "No file embed to remove" });
      }

      // Remove the googleDocUrl from case data
      const { googleDocUrl, ...updatedCaseData } = caseData;
      
      // Update the audit log with the modified case data
      const updatedDetails = JSON.stringify({ caseData: updatedCaseData });
      await storage.updateLog(deleteLog.id, { details: updatedDetails });

      await storage.createLog({
        action: "CASE_EMBED_REMOVED",
        userId: req.user!.id,
        targetId: caseId,
        details: `Removed file embed from deleted case ${caseData.title}`,
      }).then(() => {
        sendBotAuditTrailMessage({
          action: "CASE_EMBED_REMOVED",
          userId: req.user!.id,
          targetId: caseId,
          details: `Removed file embed from deleted case ${caseData.title}`,
          serverId: req.user!.serverId,
        }).catch(err => console.error("Failed to send audit trail message:", err));
      });

      res.json({ success: true, message: "File embed removed" });
    } catch (error) {
      console.error("Error removing embed:", error);
      res.status(500).json({ error: "Failed to remove file embed" });
    }
  });

  app.post("/api/recovery/:caseId/permanently-delete", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const { caseId } = req.params;
      
      if (!caseId) {
        return res.status(400).json({ error: "Case ID required" });
      }

      const allLogs = await storage.getAllLogs();
      const deleteLogIndex = allLogs.findIndex(log => log.action === "CASE_DELETE" && log.targetId === caseId);
      
      if (deleteLogIndex === -1) {
        return res.status(404).json({ error: "Deleted case not found" });
      }

      const deleteLog = allLogs[deleteLogIndex];
      
      // Delete the deletion log from database
      await storage.deleteLog(deleteLog.id);

      await storage.createLog({
        action: "CASE_PERMANENTLY_DELETED",
        userId: req.user!.id,
        targetId: caseId,
        details: `Permanently deleted recovery for case ${caseId} - no longer recoverable`,
      }).then(() => {
        sendBotAuditTrailMessage({
          action: "CASE_PERMANENTLY_DELETED",
          userId: req.user!.id,
          targetId: caseId,
          details: `Permanently deleted recovery for case ${caseId}`,
          serverId: req.user!.serverId,
        }).catch(err => console.error("Failed to send audit trail message:", err));
      });

      res.json({ success: true, message: "Case permanently deleted from recovery" });
    } catch (error) {
      console.error("Error permanently deleting case:", error);
      res.status(500).json({ error: "Failed to permanently delete case" });
    }
  });

  // Webhook configuration endpoints
  app.get("/api/webhook/config", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user?.serverId) {
        return res.status(400).json({ error: "No server context" });
      }

      let config = await storage.getWebhookConfig(user.serverId);
      if (!config) {
        // Create default config
        config = await storage.createOrUpdateWebhookConfig({
          serverId: user.serverId,
          auditTrailChannelId: null,
          auditTrailEnabled: false,
          casePostChannelId: null,
          casePostEnabled: false,
          caseReleaseChannelId: null,
          caseReleaseEnabled: false,
          banLogsChannelId: null,
          banLogsEnabled: false,
          childServerBanChannelId: null,
          childServerBanEnabled: false,
        });
      }

      res.json(config);
    } catch (error: any) {
      console.error("Get webhook config error:", error);
      res.status(500).json({ error: "Failed to get webhook config" });
    }
  });

  app.post("/api/webhook/config", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      console.log("Update webhook config - User:", { userId: user?.id, role: user?.role, serverId: user?.serverId });
      
      if (!user?.serverId) {
        console.error("No server context for webhook config update");
        return res.status(400).json({ error: "No server context" });
      }

      const {
        auditTrailChannelId,
        auditTrailEnabled,
        casePostChannelId,
        casePostEnabled,
        caseReleaseChannelId,
        caseReleaseEnabled,
        banLogsChannelId,
        banLogsEnabled,
        childServerBanChannelId,
        childServerBanEnabled,
      } = req.body;

      console.log("Updating webhook config with:", {
        serverId: user.serverId,
        auditTrailEnabled,
        casePostEnabled,
        caseReleaseEnabled,
      });

      const config = await storage.createOrUpdateWebhookConfig({
        serverId: user.serverId,
        auditTrailChannelId: auditTrailEnabled ? auditTrailChannelId : null,
        auditTrailEnabled,
        casePostChannelId: casePostEnabled ? casePostChannelId : null,
        casePostEnabled,
        caseReleaseChannelId: caseReleaseEnabled ? caseReleaseChannelId : null,
        caseReleaseEnabled,
        banLogsChannelId: banLogsEnabled ? banLogsChannelId : null,
        banLogsEnabled,
        childServerBanChannelId: childServerBanEnabled ? childServerBanChannelId : null,
        childServerBanEnabled,
      });

      console.log("Webhook config updated successfully:", config);

      await storage.createLog({
        action: "WEBHOOK_CONFIG_UPDATED",
        userId: user.id,
        targetId: user.serverId,
        details: `Updated webhook configuration`,
        serverId: user.serverId,
      }).then(() => {
        sendBotAuditTrailMessage({
          action: "WEBHOOK_CONFIG_UPDATED",
          userId: user.id,
          targetId: user.serverId,
          details: `Updated webhook configuration`,
          serverId: user.serverId,
        }).catch(err => console.error("Failed to send audit trail message:", err));
      });

      res.json(config);
    } catch (error: any) {
      console.error("Update webhook config error:", error);
      res.status(500).json({ error: "Failed to update webhook config", details: error.message });
    }
  });

  app.get("/api/webhook/channels", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user?.serverId) {
        return res.status(400).json({ error: "No server context" });
      }

      // Fetch Discord guild and get text channels
      const guild = await discordClient.guilds.fetch(user.serverId);
      if (!guild) {
        return res.json({ channels: [] });
      }

      const textChannels = guild.channels.cache
        .filter((channel: any) => channel.type === 0) // 0 = GUILD_TEXT
        .map((channel: any) => ({
          id: channel.id,
          name: channel.name,
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      res.json({ channels: textChannels });
    } catch (error: any) {
      console.error("Get webhook channels error:", error);
      res.status(500).json({ error: "Failed to get channels", channels: [] });
    }
  });

  // Get channels for a specific server
  app.get("/api/webhook/channels/:serverId", requireAuth, async (req: Request, res: Response) => {
    try {
      const serverId = req.params.serverId;
      if (!serverId) {
        return res.status(400).json({ error: "No server ID provided" });
      }

      // Fetch Discord guild and get text channels
      const guild = await discordClient.guilds.fetch(serverId);
      if (!guild) {
        return res.json({ channels: [] });
      }

      const textChannels = guild.channels.cache
        .filter((channel: any) => channel.type === 0) // 0 = GUILD_TEXT
        .map((channel: any) => ({
          id: channel.id,
          name: channel.name,
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

      res.json({ channels: textChannels });
    } catch (error: any) {
      console.error("Get webhook channels for server error:", error);
      res.status(500).json({ error: "Failed to get channels", channels: [] });
    }
  });

  // Get linked child servers
  app.get("/api/webhook/linked-servers", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user?.serverId) {
        return res.status(400).json({ error: "No server context" });
      }

      // Get linked servers
      const linkedServers = await storage.getLinkedServers(user.serverId);
      
      // Get server names from Discord
      const servers = await Promise.all(
        linkedServers.map(async (link) => {
          try {
            const guild = await discordClient.guilds.fetch(link.childServerId);
            return {
              id: link.childServerId,
              name: guild.name,
            };
          } catch (error) {
            return {
              id: link.childServerId,
              name: `Server ${link.childServerId}`,
            };
          }
        })
      );

      res.json({ servers });
    } catch (error: any) {
      console.error("Get linked servers error:", error);
      res.status(500).json({ error: "Failed to get linked servers", servers: [] });
    }
  });

  // Banned users operations
  app.get("/api/moderation/banned-users", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user?.serverId) {
        return res.status(400).json({ error: "No server context" });
      }

      // Check if user has permission (Management or Overseer)
      if (user.role !== "Management" && user.role !== "Overseer") {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      // Get bans for this server and all linked child servers if user is accessing main server
      const bans = await storage.getBannedUsersAcrossServers(user.serverId);
      
      // Map to frontend format
      const formattedBans = bans.map(ban => ({
        id: ban.id,
        userId: ban.userId,
        serverId: ban.serverId,
        serverName: ban.serverName,
        reason: ban.reason,
        bannedAt: ban.bannedAt.toISOString(),
        linkedBanId: ban.linkedBanId,
        isMainServerBan: ban.isMainServerBan,
        mainServerName: ban.mainServerName,
        mainServerId: ban.mainServerId,
        cascadedFrom: ban.cascadedFrom,
      }));
      
      res.json({ bans: formattedBans });
    } catch (error: any) {
      console.error("Get banned users error:", error);
      res.status(500).json({ error: "Failed to get banned users", bans: [] });
    }
  });

  app.post("/api/moderation/unban", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user?.serverId) {
        return res.status(400).json({ error: "No server context" });
      }

      const { userId, serverId } = req.body;
      
      if (!userId || !serverId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Remove ban from database
      await storage.unbanUserFromServer(serverId, userId);

      // Try to unban in Discord
      try {
        const guild = await discordClient.guilds.fetch(serverId);
        if (guild) {
          await guild.bans.remove(userId, "Unbanned via admin panel").catch(() => {});
        }
      } catch (discordError) {
        console.error("Failed to unban in Discord:", discordError);
      }

      // Log the action
      try {
        await storage.addModLog({
          serverId,
          moderatorId: user.id,
          targetId: userId,
          action: "UNBAN",
          reason: "Unbanned via admin panel",
        });
      } catch (logError) {
        console.error("Failed to log unban action:", logError);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Unban error:", error);
      res.status(500).json({ error: "Failed to unban user" });
    }
  });

  app.post("/api/moderation/manual-ban", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user?.serverId) {
        return res.status(400).json({ error: "No server context" });
      }

      const { userId, reason, targetServer } = req.body;
      
      if (!userId || !reason) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const serversToBan = targetServer === "main" 
        ? [user.serverId]
        : targetServer === "children"
          ? await storage.getChildServers(user.serverId)
          : [user.serverId];

      // Ban user in all target servers
      for (const serverId of serversToBan) {
        try {
          // Ban in database
          await storage.addBan({
            serverId,
            userId,
            moderatorId: user.id,
            reason: `[Manual ban via admin panel] ${reason}`,
          });

          // Try to ban in Discord
          try {
            const guild = await discordClient.guilds.fetch(serverId);
            if (guild) {
              await guild.bans.create(userId, { reason }).catch(() => {});
            }
          } catch (discordError) {
            console.error(`Failed to ban in Discord server ${serverId}:`, discordError);
          }

          // Log the action
          try {
            await storage.addModLog({
              serverId,
              userId: user.id,
              targetId: userId,
              action: "BAN",
              reason,
            });
          } catch (logError) {
            console.error("Failed to log ban action:", logError);
          }
        } catch (banError) {
          console.error(`Failed to ban user ${userId} in server ${serverId}:`, banError);
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Manual ban error:", error);
      res.status(500).json({ error: "Failed to ban user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
