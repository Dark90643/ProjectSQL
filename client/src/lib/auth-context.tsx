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
}

interface AuthContextType {
  user: User | null;
  users: User[];
  cases: Case[];
  logs: Log[];
  clientIp: string;
  isIpBanned: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, inviteCode: string) => Promise<boolean>;
  logout: () => Promise<void>;
  createCase: (newCase: Omit<Case, "id" | "createdAt" | "updatedAt" | "assignedAgent" | "isPublic">) => Promise<void>;
  updateCase: (id: string, updates: Partial<Case>) => Promise<void>;
  deleteCase: (id: string) => Promise<void>;
  suspendUser: (id: string) => Promise<void>;
  unsuspendUser: (id: string) => Promise<void>;
  editUser: (id: string, updates: { username?: string; password?: string; role?: Role }) => Promise<void>;
  toggleCasePublic: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [clientIp, setClientIp] = useState("");
  const [isIpBanned, setIsIpBanned] = useState(false);
  const [loading, setLoading] = useState(true);
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
        await loadUserData();
      } catch (error) {
        // Not logged in
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  const loadUserData = async () => {
    try {
      const [casesData, usersData, logsData] = await Promise.all([
        api.cases.getAll(),
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

  const logout = async () => {
    try {
      await api.auth.logout();
      setUser(null);
      setUsers([]);
      setCases([]);
      setLogs([]);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const createCase = async (newCaseData: Omit<Case, "id" | "createdAt" | "updatedAt" | "assignedAgent" | "isPublic">) => {
    try {
      const newCase = await api.cases.create(newCaseData);
      setCases([newCase, ...cases]);
      toast({ title: "Case Created", description: `Case ${newCase.id} initiated successfully.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create case" });
    }
  };

  const updateCase = async (id: string, updates: Partial<Case>) => {
    try {
      const updatedCase = await api.cases.update(id, updates);
      setCases(prev => prev.map(c => c.id === id ? updatedCase : c));
      toast({ title: "Case Updated", description: `Case ${id} modified.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update case" });
    }
  };

  const deleteCase = async (id: string) => {
    try {
      await api.cases.delete(id);
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

  const toggleCasePublic = async (id: string) => {
    try {
      const updatedCase = await api.cases.togglePublic(id);
      setCases(prev => prev.map(c => c.id === id ? updatedCase : c));
      toast({ 
        title: updatedCase.isPublic ? "Case Published" : "Case Hidden", 
        description: `Case ${id} is now ${updatedCase.isPublic ? "PUBLIC" : "PRIVATE"}.` 
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to toggle visibility" });
    }
  };

  // Monitor for suspension (kicked out)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (user) {
        try {
          await api.auth.me();
        } catch (error) {
          // Session expired or user was suspended
          setUser(null);
          toast({ 
            variant: "destructive", 
            title: "Connection Terminated", 
            description: "Your session has expired or your clearance has been revoked." 
          });
        }
      }
    }, 30000); // Check every 30 seconds

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
      user, users, cases, logs, clientIp, isIpBanned, loading,
      login, register, logout, 
      createCase, updateCase, deleteCase, 
      suspendUser, unsuspendUser, editUser, toggleCasePublic,
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
