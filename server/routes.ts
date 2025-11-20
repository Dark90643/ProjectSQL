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
        await storage.updateUser(user.id, { isOnline: true, ip: clientIp });

        res.json(user);
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

  // Case routes
  app.get("/api/cases", requireAuth, async (req: Request, res: Response) => {
    const cases = await storage.getAllCases();
    res.json(cases);
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
    const success = await storage.deleteCase(id);
    
    if (success) {
      await storage.createLog({
        action: "CASE_DELETE",
        userId: req.user!.id,
        targetId: id,
        details: "Deleted case",
      });
    }
    
    res.json({ success });
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

  const httpServer = createServer(app);
  return httpServer;
}
