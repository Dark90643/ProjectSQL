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
  clientIp: string;
  isIpBanned: boolean;
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

const generateRandomIp = () => {
  return `192.168.1.${Math.floor(Math.random() * 150) + 10}`;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [cases, setCases] = useState<Case[]>(INITIAL_CASES);
  const [logs, setLogs] = useState<Log[]>(INITIAL_LOGS);
  const [availableCodes, setAvailableCodes] = useState<string[]>(INVITE_CODES);
  const { toast } = useToast();
  
  // Simulate Client IP
  const [clientIp] = useState(() => {
    const stored = localStorage.getItem("mock_client_ip");
    if (stored) return stored;
    const newIp = generateRandomIp();
    localStorage.setItem("mock_client_ip", newIp);
    return newIp;
  });

  // Check if current IP belongs to ANY suspended user
  const isIpBanned = users.some(u => u.isSuspended && u.ip === clientIp);

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
    if (isIpBanned) {
      toast({ variant: "destructive", title: "CONNECTION REFUSED", description: `IP ADDRESS ${clientIp} IS BLACKLISTED.` });
      return false;
    }

    const foundUser = users.find(u => u.username === username);
    if (foundUser) {
      if (foundUser.isSuspended) {
        toast({ variant: "destructive", title: "Access Denied", description: "Account has been suspended by Overseer." });
        return false;
      }
      
      // Update user IP to current client IP on login
      if (foundUser.ip !== clientIp) {
        setUsers(prev => prev.map(u => u.id === foundUser.id ? { ...u, ip: clientIp } : u));
      }
      
      setUser(foundUser);
      return true;
    }
    return false;
  };

  const register = async (username: string, inviteCode: string) => {
    if (isIpBanned) {
      toast({ variant: "destructive", title: "CONNECTION REFUSED", description: `IP ADDRESS ${clientIp} IS BLACKLISTED.` });
      return false;
    }

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
      isSuspended: false,
      ip: clientIp
    };

    setUsers([...users, newUser]);
    setAvailableCodes(prev => prev.filter(c => c !== inviteCode));
    setUser(newUser);
    
    const newLog: Log = {
      id: `log-${Date.now()}`,
      action: "REGISTER",
      userId: newUser.id,
      timestamp: new Date().toISOString(),
      details: `New Agent registered with code ${inviteCode} from IP ${clientIp}`
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

  // Check for suspension status on every user update or role change
  useEffect(() => {
    if (user) {
      const currentUserState = users.find(u => u.id === user.id);
      if (currentUserState && currentUserState.isSuspended) {
        logout();
        // We don't toast here anymore because the IP ban toast will likely trigger on next interaction or we want a specific message
        // But actually, let's keep a specific message for the moment of suspension
        toast({ 
          variant: "destructive", 
          title: "Connection Terminated", 
          description: "Your clearance has been revoked by Overseer. IP Address logged and blacklisted." 
        });
      }
    }
  }, [users, user, toast]);

  return (
    <AuthContext.Provider value={{ 
      user, users, cases, logs, clientIp, isIpBanned,
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
