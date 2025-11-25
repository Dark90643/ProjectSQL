import React, { createContext, useContext, useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { api } from "./api";

type Role = "Agent" | "Management" | "Overseer";

interface User {
  id: string;
  username: string;
  role: Role;
  isSuspended: boolean;
  ip: string;
  isOnline: boolean;
  requiresInviteVerification?: boolean;
  serverId?: string;
  discordUserId?: string;
  discordUsername?: string;
  discordAvatar?: string;
}

interface Case {
  id: string;
  title: string;
  description: string;
  status: "Active" | "Closed" | "Redacted";
  priority: "Low" | "Medium" | "High" | "Critical";
  assignedAgent: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  content: string;
  isPublic: boolean;
  googleDocUrl?: string;
}

interface Log {
  id: string;
  action: string;
  userId: string;
  targetId?: string;
  timestamp: string;
  details: string;
  serverId?: string;
}

interface AuthContextType {
  user: User | null;
  users: User[];
  cases: Case[];
  logs: Log[];
  clientIp: string;
  isIpBanned: boolean;
  loading: boolean;
  discordUser: { discordId: string; username: string; avatar?: string } | null;
  currentServerId: string | null;
  canCreateAccounts: boolean;
  isSupportTeam: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  discordLogin: (accessToken: string, user: any) => Promise<boolean>;
  selectServer: (serverId: string) => Promise<boolean>;
  register: (username: string, password: string, inviteCode: string) => Promise<boolean>;
  logout: () => Promise<void>;
  createCase: (newCase: Omit<Case, "id" | "createdAt" | "updatedAt" | "assignedAgent" | "isPublic">) => Promise<void>;
  updateCase: (id: string, updates: Partial<Case>) => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  suspendUser: (id: string) => Promise<void>;
  unsuspendUser: (id: string) => Promise<void>;
  editUser: (id: string, updates: { username?: string; password?: string; role?: Role }) => Promise<void>;
  createUserWithInvite: (username: string, inviteCode: string) => Promise<{ username: string; inviteCode: string }>;
  toggleCasePublic: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const OFFICIAL_BOT_SERVER = "1441447050024714252";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [clientIp, setClientIp] = useState("");
  const [isIpBanned, setIsIpBanned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [discordUser, setDiscordUser] = useState<{ discordId: string; username: string; avatar?: string } | null>(null);
  const [currentServerId, setCurrentServerId] = useState<string | null>(() => {
    // Restore from localStorage on mount
    if (typeof window !== 'undefined') {
      return localStorage.getItem('currentServerId');
    }
    return null;
  });
  const [canCreateAccounts, setCanCreateAccounts] = useState(false);
  const [isSupportTeam, setIsSupportTeam] = useState(false);
  const { toast } = useToast();

  // Check auth status on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        // Check IP status
        const ipData = await api.auth.checkIp();
        setClientIp(ipData.ip);
        setIsIpBanned(ipData.isBanned);

        if (ipData.isBanned) {
          setLoading(false);
          return;
        }

        // Check if user is logged in
        const userData = await api.auth.me();
        setUser(userData);
        
        // Check if user is support team
        try {
          const supportStatus = await api.auth.checkSupportTeam();
          setIsSupportTeam(supportStatus.isSupportTeam);
          setCanCreateAccounts(supportStatus.isSupportTeam);
        } catch (error) {
          // Not support team
          setIsSupportTeam(false);
          setCanCreateAccounts(false);
        }
      } catch (error) {
        // Not logged in
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Load user data when user is authenticated
  useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  const loadUserData = async () => {
    try {
      // For Discord OAuth users with currentServerId, load server-specific cases
      // For traditional login users without serverId, load all cases
      const [casesData, usersData, logsData] = await Promise.all([
        api.cases.getAll(currentServerId || undefined),
        api.users.getAll().catch(() => []), // May not have permission
        api.logs.getAll().catch(() => []), // May not have permission
      ]);
      
      setCases(casesData);
      setUsers(usersData);
      setLogs(logsData);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const refreshData = async () => {
    if (user) {
      await loadUserData();
    }
  };

  const login = async (username: string, password: string = "password"): Promise<boolean> => {
    try {
      const userData = await api.auth.login(username, password);
      setUser(userData);
      await loadUserData();
      return true;
    } catch (error: any) {
      if (error.message === "IP_BANNED") {
        setIsIpBanned(true);
        toast({ variant: "destructive", title: "CONNECTION REFUSED", description: `IP ADDRESS ${clientIp} IS BLACKLISTED.` });
      } else {
        toast({ variant: "destructive", title: "Access Denied", description: error.message || "Login failed" });
      }
      return false;
    }
  };

  const register = async (username: string, password: string, inviteCode: string): Promise<boolean> => {
    try {
      const userData = await api.auth.register(username, password, inviteCode);
      setUser(userData);
      await loadUserData();
      return true;
    } catch (error: any) {
      if (error.message === "IP_BANNED") {
        setIsIpBanned(true);
        toast({ variant: "destructive", title: "CONNECTION REFUSED", description: `IP ADDRESS ${clientIp} IS BLACKLISTED.` });
      } else {
        toast({ variant: "destructive", title: "Registration Failed", description: error.message || "Registration failed" });
      }
      return false;
    }
  };

  const discordLogin = async (accessToken: string, discordUserData: any): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/discord/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accessToken, user: discordUserData }),
      });
      if (!response.ok) {
        throw new Error("Discord login failed");
      }
      const data = await response.json();
      setDiscordUser({ discordId: data.discordId, username: data.username, avatar: data.avatar });
      
      // Check if user is support team (admin/owner of official bot server)
      try {
        const checkResponse = await fetch(`/api/auth/check-support-team?discordId=${discordUserData.id}`);
        const checkData = await checkResponse.json();
        setCanCreateAccounts(checkData.isSupportTeam);
        setIsSupportTeam(checkData.isSupportTeam);
      } catch (error) {
        console.error("Failed to check support team status:", error);
      }
      return true;
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Discord login failed" });
      return false;
    }
  };

  const selectServer = async (serverId: string): Promise<boolean> => {
    if (!discordUser) {
      toast({ variant: "destructive", title: "Error", description: "No Discord user selected" });
      return false;
    }

    try {
      const response = await fetch("/api/auth/discord/select-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ discordId: discordUser.discordId, serverId, discordUsername: discordUser.username, avatar: discordUser.avatar }),
      });
      if (!response.ok) {
        throw new Error("Failed to select server");
      }
      const userData = await response.json();
      // Preserve Discord username and avatar in the user object
      if (discordUser?.username) {
        userData.discordUsername = discordUser.username;
      }
      if (discordUser?.avatar) {
        userData.discordAvatar = discordUser.avatar;
      }
      setUser(userData);
      setCurrentServerId(serverId);
      localStorage.setItem('currentServerId', serverId);
      setDiscordUser(null);
      await loadUserData();
      return true;
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to select server" });
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Always clear the user state to trigger route redirect
      setUser(null);
      setUsers([]);
      setCases([]);
      setLogs([]);
      setDiscordUser(null);
      setCurrentServerId(null);
      localStorage.removeItem('currentServerId');
    }
  };

  const createCase = async (newCaseData: Omit<Case, "id" | "createdAt" | "updatedAt" | "assignedAgent" | "isPublic">) => {
    try {
      const newCase = await api.cases.create(newCaseData, currentServerId || undefined);
      setCases([newCase, ...cases]);
      toast({ title: "Case Created", description: `Case ${newCase.id} initiated successfully.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create case" });
    }
  };

  const updateCase = async (id: string, updates: Partial<Case>) => {
    try {
      const updatedCase = await api.cases.update(id, updates, currentServerId || undefined);
      setCases(prev => prev.map(c => c.id === id ? updatedCase : c));
      toast({ title: "Case Updated", description: `Case ${id} modified.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update case" });
    }
  };

  const deleteCase = async (id: string) => {
    try {
      await api.cases.delete(id, currentServerId || undefined);
      setCases(prev => prev.filter(c => c.id !== id));
      toast({ title: "Case Deleted", description: `Case ${id} removed from database.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete case" });
    }
  };

  const suspendUser = async (id: string) => {
    try {
      const updatedUser = await api.users.suspend(id);
      setUsers(prev => prev.map(u => u.id === id ? updatedUser : u));
      toast({ title: "User Suspended", description: "Agent access revoked." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to suspend user" });
    }
  };

  const unsuspendUser = async (id: string) => {
    try {
      const updatedUser = await api.users.unsuspend(id);
      setUsers(prev => prev.map(u => u.id === id ? updatedUser : u));
      toast({ title: "User Restored", description: "Agent access restored." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to restore user" });
    }
  };

  const editUser = async (id: string, updates: { username?: string; password?: string; role?: Role }) => {
    try {
      const updatedUser = await api.users.edit(id, updates);
      setUsers(prev => prev.map(u => u.id === id ? updatedUser : u));
      toast({ title: "User Updated", description: "Agent profile updated successfully." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update user" });
    }
  };

  const createUserWithInvite = async (username: string, inviteCode: string) => {
    try {
      const result = await api.users.create({ username, inviteCode });
      await loadUserData();
      toast({ title: "Account Created", description: `New account ${username} created with verification required.` });
      return result;
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create account" });
      throw error;
    }
  };

  const toggleCasePublic = async (id: string) => {
    try {
      const updatedCase = await api.cases.togglePublic(id, currentServerId || undefined);
      setCases(prev => prev.map(c => c.id === id ? updatedCase : c));
      toast({ 
        title: updatedCase.isPublic ? "Case Published" : "Case Hidden", 
        description: `Case ${id} is now ${updatedCase.isPublic ? "PUBLIC" : "PRIVATE"}.` 
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to toggle visibility" });
    }
  };

  // Monitor for suspension (kicked out) - only after user navigates
  useEffect(() => {
    if (!user) return;
    
    let failureCount = 0;
    const interval = setInterval(async () => {
      try {
        await api.auth.me();
        failureCount = 0; // Reset on success
      } catch (error) {
        failureCount++;
        // Only logout if we get multiple consecutive failures
        if (failureCount >= 3) {
          setUser(null);
          toast({ 
            variant: "destructive", 
            title: "Connection Terminated", 
            description: "Your session has expired or your clearance has been revoked." 
          });
        }
      }
    }, 60000); // Check every 60 seconds (increased from 30)

    return () => clearInterval(interval);
  }, [user, toast]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground font-mono">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-sm text-muted-foreground">INITIALIZING SECURE CONNECTION...</p>
      </div>
    </div>;
  }

  return (
    <AuthContext.Provider value={{ 
      user, users, cases, logs, clientIp, isIpBanned, loading, discordUser, currentServerId,
      canCreateAccounts, isSupportTeam,
      login, discordLogin, selectServer, register, logout, 
      createCase, updateCase, deleteCase, 
      suspendUser, unsuspendUser, editUser, createUserWithInvite, toggleCasePublic,
      refreshData
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
