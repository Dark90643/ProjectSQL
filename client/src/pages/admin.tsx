import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, UserX, UserCheck, Activity, Wifi, Edit2, Plus, Copy, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Case } from "@shared/schema";

export default function AdminPanel() {
  const { user, users, logs, cases, suspendUser, unsuspendUser, editUser, createUserWithInvite, currentServerId, refreshData } = useAuth();
  const { toast } = useToast();
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ username: "", password: "", role: "Agent" });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({ username: "", inviteCode: "" });
  const [generatedInvites, setGeneratedInvites] = useState<{ code: string; created: string }[]>([]);
  const [encryptedCases, setEncryptedCases] = useState<Case[]>([]);
  const [serverMembers, setServerMembers] = useState<any[]>([]);
  const [usernameLookup, setUsernameLookup] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user && ["Management", "Overseer"].includes(user.role)) {
      fetch("/api/cases/encrypted/list", { credentials: "include" })
        .then(res => res.json())
        .then(data => setEncryptedCases(data))
        .catch(err => console.error("Error fetching encrypted cases:", err));
    }
  }, [user]);

  useEffect(() => {
    if (currentServerId) {
      // Fetch server members for the current server
      fetch(`/api/server-members?serverId=${currentServerId}`, { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          const members = Array.isArray(data) ? data : [];
          setServerMembers(members);
          // Build username lookup from members
          const lookup: Record<string, string> = {};
          members.forEach((m: any) => {
            if (m.id && m.username) {
              lookup[m.id] = m.username;
            }
          });
          setUsernameLookup(lookup);
        })
        .catch(err => {
          console.error("Error fetching server members:", err);
          setServerMembers([]);
        });
    }
  }, [currentServerId]);

  // Auto-refresh logs every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshData]);

  const loadEncryptedCases = () => {
    fetch("/api/cases/encrypted/list", { credentials: "include" })
      .then(res => res.json())
      .then(data => setEncryptedCases(data))
      .catch(err => console.error("Error fetching encrypted cases:", err));
  };

  const handleDecryptCase = async (caseId: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/decrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast({ variant: "destructive", title: "Error", description: error.error });
        return;
      }

      toast({ title: "Success", description: "Case encryption removed" });
      loadEncryptedCases();
      // Also refresh global cases data
      window.dispatchEvent(new Event("casesUpdated"));
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to decrypt case" });
    }
  };

  if (!user || (user.role !== "Management" && user.role !== "Overseer")) {
    return (
      <div className="flex items-center justify-center h-full text-destructive font-mono">
        ACCESS DENIED - INSUFFICIENT PRIVILEGES
      </div>
    );
  }

  // Filter logs for current server only
  const filteredLogs = logs.filter(log => {
    // If user has a currentServerId, only show logs from that server
    if (currentServerId) {
      return log.serverId === currentServerId;
    }
    // For traditional users without a server context, show all logs
    return true;
  });

  const sortedLogs = [...filteredLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const handleEncryptCase = async (caseId: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/encrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.json();
        toast({ variant: "destructive", title: "Error", description: error.error });
        return;
      }

      const { caseCode } = await response.json();
      toast({ title: "Success", description: `Case encrypted with code: ${caseCode}` });
      loadEncryptedCases();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to encrypt case" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="text-primary h-6 w-6" />
        <h1 className="font-mono text-2xl font-bold tracking-tight">ADMINISTRATION_PANEL</h1>
      </div>

      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="grid w-full bg-black/40 border border-white/10 grid-cols-3">
          <TabsTrigger value="logs" className="font-mono">SYSTEM LOGS</TabsTrigger>
          <TabsTrigger value="users" className="font-mono">AGENT ROSTER</TabsTrigger>
          {(user.role === "Management" || user.role === "Overseer") && <TabsTrigger value="codes" className="font-mono">CASE CODES</TabsTrigger>}
        </TabsList>

        <TabsContent value="logs" className="mt-6">
          <Card className="bg-card/50 border-primary/20">
            <CardHeader>
              <CardTitle className="font-mono text-lg">Audit Trail</CardTitle>
              <CardDescription className="font-mono text-xs">Server-specific audit log for {cases.find(c => c.serverId === currentServerId)?.serverId || currentServerId || 'all actions'}.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-mono text-xs w-[180px]">TIMESTAMP</TableHead>
                      <TableHead className="font-mono text-xs w-[120px]">AGENT</TableHead>
                      <TableHead className="font-mono text-xs w-[150px]">ACTION</TableHead>
                      <TableHead className="font-mono text-xs">DETAILS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/50 border-border/50">
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-primary">
                          {usernameLookup[log.userId] || users.find(u => u.id === log.userId)?.discordUsername || users.find(u => u.id === log.userId)?.username || log.userId}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {log.details}
                          {log.targetId && <span className="ml-2 opacity-50">[{log.targetId}]</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {(user.role === "Management" || user.role === "Overseer") && (
          <TabsContent value="codes" className="mt-6">
            <Card className="bg-card/50 border-primary/20">
              <CardHeader>
                <CardTitle className="font-mono text-lg flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Encrypted Case Files
                </CardTitle>
                <CardDescription className="font-mono text-xs">View and manage case encryption codes.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="font-mono text-xs w-[200px]">CASE ID</TableHead>
                        <TableHead className="font-mono text-xs">TITLE</TableHead>
                        <TableHead className="font-mono text-xs w-[150px]">ENCRYPTION CODE</TableHead>
                        <TableHead className="font-mono text-xs text-right">ACTION</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {encryptedCases.length > 0 ? (
                        encryptedCases.map((encCase) => (
                          <TableRow key={encCase.id} className="hover:bg-muted/50 border-border/50">
                            <TableCell className="font-mono text-xs font-bold text-primary">{encCase.id}</TableCell>
                            <TableCell className="font-mono text-xs">{encCase.title}</TableCell>
                            <TableCell className="font-mono text-xs text-green-500">{(encCase as any).caseCode || "N/A"}</TableCell>
                            <TableCell className="text-right flex gap-1">
                              {(encCase as any).caseCode && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="font-mono text-[10px] h-6"
                                    onClick={() => {
                                      navigator.clipboard.writeText((encCase as any).caseCode);
                                      toast({ title: "Copied", description: "Code copied to clipboard" });
                                    }}
                                    data-testid={`button-copy-case-code-${encCase.id}`}
                                  >
                                    <Copy className="h-3 w-3 mr-1" />
                                    COPY
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="font-mono text-[10px] h-6"
                                    onClick={() => handleDecryptCase(encCase.id)}
                                    data-testid={`button-decrypt-case-${encCase.id}`}
                                  >
                                    DECRYPT
                                  </Button>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground font-mono text-xs">
                            NO ENCRYPTED CASES
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="users" className="mt-6">
          <Card className="bg-card/50 border-primary/20">
            <CardHeader>
              <CardTitle className="font-mono text-lg">Personnel Management</CardTitle>
              <CardDescription className="font-mono text-xs">Authorized Discord accounts. Only users authenticated via Discord OAuth are displayed.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-mono text-xs">IDENTITY</TableHead>
                      <TableHead className="font-mono text-xs">USER_ID</TableHead>
                      <TableHead className="font-mono text-xs">CLEARANCE</TableHead>
                      <TableHead className="font-mono text-xs">STATUS</TableHead>
                      <TableHead className="font-mono text-xs">CONNECTION</TableHead>
                      <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serverMembers.length > 0 ? (
                      serverMembers.map((member) => (
                        <TableRow key={member.id} className="hover:bg-muted/50 border-border/50">
                          <TableCell className="font-mono text-sm font-bold">
                            {member.username}:{member.discordUserId} {user?.id === member.discordUserId && <span className="text-xs text-muted-foreground font-normal">(YOU)</span>}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {member.discordUserId}
                          </TableCell>
                          <TableCell>
                            <Badge variant={member.role === "Overseer" ? "default" : "secondary"} className="font-mono text-[10px]">
                              {member.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                             {member.isSuspended ? (
                               <span className="flex items-center gap-1 text-destructive text-xs font-mono">
                                 <AlertTriangle size={12} /> SUSPENDED
                               </span>
                             ) : (
                               <span className="text-green-500 text-xs font-mono">ACTIVE</span>
                             )}
                          </TableCell>
                          <TableCell>
                             {member.isOnline ? (
                               <span className="flex items-center gap-1 text-green-400 text-xs font-mono animate-pulse">
                                 <div className="w-2 h-2 rounded-full bg-green-500" />
                                 ONLINE
                               </span>
                             ) : (
                               <span className="text-muted-foreground text-xs font-mono opacity-50">OFFLINE</span>
                             )}
                          </TableCell>
                          <TableCell className="text-right">
                            {user?.role === "Overseer" && (
                              user.discordUserId === member.discordUserId ? (
                                <span className="text-xs text-muted-foreground font-mono">CANNOT SELF-SUSPEND</span>
                              ) : (
                                <div className="flex gap-1">
                                  {member.isSuspended ? (
                                    <Button size="sm" variant="outline" className="h-7 text-xs font-mono border-green-500/50 hover:bg-green-500/10" onClick={() => suspendUser(member.id)} data-testid="button-restore-user">
                                      <UserCheck size={12} className="mr-1" /> RESTORE
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="outline" className="h-7 text-xs font-mono border-destructive/50 hover:bg-destructive/10 text-destructive" onClick={() => suspendUser(member.id)} data-testid="button-suspend-user">
                                      <UserX size={12} className="mr-1" /> SUSPEND
                                    </Button>
                                  )}
                                </div>
                              )
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground font-mono text-xs">
                          NO MEMBERS IN SERVER
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="bg-card border-primary/20">
          <DialogHeader>
            <DialogTitle className="font-mono">EDIT AGENT PROFILE</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="font-mono text-xs text-muted-foreground mb-1 block">AGENT ID</label>
              <Input
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                className="font-mono bg-background/50"
                placeholder="New agent ID"
                data-testid="input-edit-username"
              />
            </div>
            <div>
              <label className="font-mono text-xs text-muted-foreground mb-1 block">NEW PASSWORD (leave blank to keep current)</label>
              <Input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                className="font-mono bg-background/50"
                placeholder="New password"
                data-testid="input-edit-password"
              />
            </div>
            <div>
              <label className="font-mono text-xs text-muted-foreground mb-1 block">CLEARANCE LEVEL</label>
              <Select value={editForm.role} onValueChange={(role) => setEditForm({ ...editForm, role })}>
                <SelectTrigger className="font-mono bg-background/50" data-testid="select-edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Agent">Agent</SelectItem>
                  <SelectItem value="Management">Management</SelectItem>
                  <SelectItem value="Overseer">Overseer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingUser(null)} className="font-mono" data-testid="button-cancel-edit">
              CANCEL
            </Button>
            <Button 
              className="font-mono" 
              onClick={async () => {
                const updates: any = {};
                if (editForm.username) updates.username = editForm.username;
                if (editForm.password) updates.password = editForm.password;
                if (editForm.role) updates.role = editForm.role;
                
                if (Object.keys(updates).length > 0) {
                  await editUser(editingUser!, updates);
                  setEditingUser(null);
                }
              }}
              data-testid="button-save-edit"
            >
              SAVE CHANGES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
