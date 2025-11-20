import React, { createContext, useContext, useState, useEffect } from "react";
import { 
  User, Case, Log, Role, 
  INITIAL_USERS, INITIAL_CASES, INITIAL_LOGS, INVITE_CODES 
} from "./mock-data";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  users: User[];
  cases: Case[];
  logs: Log[];
  login: (username: string) => Promise<boolean>;
  register: (username: string, inviteCode: string) => Promise<boolean>;
  logout: () => void;
  createCase: (newCase: Omit<Case, "id" | "createdAt" | "updatedAt" | "assignedAgent">) => void;
  updateCase: (id: string, updates: Partial<Case>) => void;
  deleteCase: (id: string) => void;
  suspendUser: (id: string) => void;
  unsuspendUser: (id: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [cases, setCases] = useState<Case[]>(INITIAL_CASES);
  const [logs, setLogs] = useState<Log[]>(INITIAL_LOGS);
  const [availableCodes, setAvailableCodes] = useState<string[]>(INVITE_CODES);
  const { toast } = useToast();

  // Helper to add logs
  const addLog = (action: string, details: string, targetId?: string) => {
    if (!user) return;
    const newLog: Log = {
      id: `log-${Date.now()}`,
      action,
      userId: user.id,
      targetId,
      timestamp: new Date().toISOString(),
      details
    };
    setLogs(prev => [newLog, ...prev]);
  };

  const login = async (username: string) => {
    const foundUser = users.find(u => u.username === username);
    if (foundUser) {
      if (foundUser.isSuspended) {
        toast({ variant: "destructive", title: "Access Denied", description: "Account has been suspended by Overseer." });
        return false;
      }
      setUser(foundUser);
      // Log login is tricky because state update is async, but for mock it's fine to assume success
      // We won't log the login here to avoid complexity with state, but we could.
      return true;
    }
    return false;
  };

  const register = async (username: string, inviteCode: string) => {
    if (!availableCodes.includes(inviteCode)) {
      toast({ variant: "destructive", title: "Invalid Code", description: "The invite code is invalid or already used." });
      return false;
    }

    if (users.some(u => u.username === username)) {
      toast({ variant: "destructive", title: "Username Taken", description: "This Agent ID is already in use." });
      return false;
    }

    const newUser: User = {
      id: `u-${Date.now()}`,
      username,
      role: "Agent", // Default role
      isSuspended: false
    };

    setUsers([...users, newUser]);
    setAvailableCodes(prev => prev.filter(c => c !== inviteCode));
    setUser(newUser);
    
    // Add log for registration (manually creating log entry since user isn't set in state yet fully)
    const newLog: Log = {
      id: `log-${Date.now()}`,
      action: "REGISTER",
      userId: newUser.id,
      timestamp: new Date().toISOString(),
      details: `New Agent registered with code ${inviteCode}`
    };
    setLogs(prev => [newLog, ...prev]);

    return true;
  };

  const logout = () => {
    setUser(null);
  };

  const createCase = (newCaseData: Omit<Case, "id" | "createdAt" | "updatedAt" | "assignedAgent">) => {
    if (!user) return;
    const newCase: Case = {
      ...newCaseData,
      id: `CASE-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedAgent: user.username
    };
    setCases([newCase, ...cases]);
    addLog("CASE_CREATE", `Created case ${newCase.title}`, newCase.id);
    toast({ title: "Case Created", description: `Case ${newCase.id} initiated successfully.` });
  };

  const updateCase = (id: string, updates: Partial<Case>) => {
    setCases(prev => prev.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c));
    addLog("CASE_UPDATE", `Updated case details`, id);
    toast({ title: "Case Updated", description: `Case ${id} modified.` });
  };

  const deleteCase = (id: string) => {
    if (!user || (user.role !== "Management" && user.role !== "Overseer")) {
      toast({ variant: "destructive", title: "Unauthorized", description: "Insufficient clearance level." });
      return;
    }
    setCases(prev => prev.filter(c => c.id !== id));
    addLog("CASE_DELETE", `Deleted case`, id);
    toast({ title: "Case Deleted", description: `Case ${id} removed from database.` });
  };

  const suspendUser = (id: string) => {
    if (!user || user.role !== "Overseer") return;
    setUsers(prev => prev.map(u => u.id === id ? { ...u, isSuspended: true } : u));
    addLog("USER_SUSPEND", `Suspended user access`, id);
    toast({ title: "User Suspended", description: "Agent access revoked." });
  };
  
  const unsuspendUser = (id: string) => {
    if (!user || user.role !== "Overseer") return;
    setUsers(prev => prev.map(u => u.id === id ? { ...u, isSuspended: false } : u));
    addLog("USER_UNSUSPEND", `Restored user access`, id);
    toast({ title: "User Restored", description: "Agent access restored." });
  };

  return (
    <AuthContext.Provider value={{ 
      user, users, cases, logs, 
      login, register, logout, 
      createCase, updateCase, deleteCase, 
      suspendUser, unsuspendUser 
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
