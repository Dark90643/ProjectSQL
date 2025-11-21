import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
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
        ip: user.ip,
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

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    if (!user) {
      return done(null, false);
    }
    done(null, {
      id: user.id,
      username: user.username,
      role: user.role,
      isSuspended: user.isSuspended,
      ip: user.ip,
      isOnline: user.isOnline,
    });
  } catch (error) {
    done(error);
  }
});

// Middleware
const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
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
      req.login({ ...user, isOnline: true }, (err) => {
        if (err) {
          return res.status(500).json({ error: "Login failed after registration" });
        }
        
        // Update user to online
        storage.updateUser(user.id, { isOnline: true, ip: clientIp });
        
        res.json({
          id: user.id,
          username: user.username,
          role: user.role,
          isSuspended: user.isSuspended,
          ip: user.ip,
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

  app.get("/api/auth/check-ip", async (req: Request, res: Response) => {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const allUsers = await storage.getAllUsers();
    const isBanned = allUsers.some(u => u.isSuspended && u.ip === clientIp);
    
    res.json({ ip: clientIp, isBanned });
  });

  // User routes
  app.get("/api/users", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    const users = await storage.getAllUsers();
    res.json(users.map(u => ({ ...u, password: undefined })));
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
      });

      res.json({ caseCode, updatedCase });
    } catch (error) {
      console.error("Case encryption error:", error);
      res.status(500).json({ error: "Failed to encrypt case" });
    }
  });

  app.get("/api/cases", requireAuth, async (req: Request, res: Response) => {
    const cases = await storage.getAllCases();
    res.json(cases);
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
      });

      res.json({ success: true, updatedCase });
    } catch (error) {
      console.error("Case decryption error:", error);
      res.status(500).json({ error: "Failed to decrypt case" });
    }
  });

  app.get("/api/cases/public", async (req: Request, res: Response) => {
    const cases = await storage.getPublicCases();
    res.json(cases);
  });

  app.get("/api/cases/:id", requireAuth, async (req: Request, res: Response) => {
    const { id } = req.params;
    const caseData = await storage.getCase(id);
    res.json(caseData || null);
  });

  app.post("/api/cases", requireAuth, async (req: Request, res: Response) => {
    const caseData = req.body;
    const id = `CASE-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`;
    
    const newCase = await storage.createCase({
      ...caseData,
      id,
      assignedAgent: req.user!.username,
      isPublic: false,
    });

    await storage.createLog({
      action: "CASE_CREATE",
      userId: req.user!.id,
      targetId: newCase.id,
      details: `Created case ${newCase.title}`,
    });

    res.json(newCase);
  });

  app.patch("/api/cases/:id", requireAuth, async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;
    
    const updatedCase = await storage.updateCase(id, updates);
    
    if (updatedCase) {
      await storage.createLog({
        action: "CASE_UPDATE",
        userId: req.user!.id,
        targetId: id,
        details: "Updated case details",
      });
    }
    
    res.json(updatedCase || null);
  });

  app.delete("/api/cases/:id", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    const { id } = req.params;
    const caseData = await storage.getCase(id);
    
    if (!caseData) {
      return res.status(404).json({ error: "Case not found" });
    }

    const result = await storage.deleteCase(id, req.user!.id);
    
    if (result.success) {
      await storage.createLog({
        action: "CASE_DELETE",
        userId: req.user!.id,
        targetId: id,
        details: `Deleted case ${caseData.title}`,
      });
    }
    
    res.json({ success: result.success });
  });

  app.patch("/api/cases/:id/toggle-public", requireAuth, requireRole("Overseer"), async (req: Request, res: Response) => {
    const { id } = req.params;
    const caseData = await storage.getCase(id);
    
    if (!caseData) {
      return res.status(404).json({ error: "Case not found" });
    }
    
    const updatedCase = await storage.updateCase(id, { isPublic: !caseData.isPublic });
    
    if (updatedCase) {
      await storage.createLog({
        action: "CASE_PUBLIC_TOGGLE",
        userId: req.user!.id,
        targetId: id,
        details: `Changed public visibility to ${updatedCase.isPublic}`,
      });
    }
    
    res.json(updatedCase);
  });

  // Log routes
  app.get("/api/logs", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    const logs = await storage.getAllLogs();
    res.json(logs);
  });

  // Recovery routes
  app.get("/api/deleted-cases", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const deletedCases = await storage.getDeletedCases();
      res.json(deletedCases);
    } catch (error) {
      console.error("Error fetching deleted cases:", error);
      res.status(500).json({ error: "Failed to fetch deleted cases" });
    }
  });

  app.post("/api/deleted-cases/:id/restore", requireAuth, requireRole("Management", "Overseer"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const restoredCase = await storage.restoreDeletedCase(id);
      
      if (!restoredCase) {
        return res.status(404).json({ error: "Deleted case not found or recovery period expired" });
      }

      await storage.createLog({
        action: "CASE_RESTORE",
        userId: req.user!.id,
        targetId: id,
        details: `Restored deleted case ${restoredCase.title}`,
      });

      res.json({ success: true, case: restoredCase });
    } catch (error) {
      console.error("Error restoring case:", error);
      res.status(500).json({ error: "Failed to restore case" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
