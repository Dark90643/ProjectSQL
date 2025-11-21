import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, UserX, UserCheck, Activity, Wifi, Edit2 } from "lucide-react";

export default function AdminPanel() {
  const { user, users, logs, suspendUser, unsuspendUser, editUser } = useAuth();
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ username: "", password: "", role: "Agent" });

  if (!user || (user.role !== "Management" && user.role !== "Overseer")) {
    return (
      <div className="flex items-center justify-center h-full text-destructive font-mono">
        ACCESS DENIED - INSUFFICIENT PRIVILEGES
      </div>
    );
  }

  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="text-primary h-6 w-6" />
        <h1 className="font-mono text-2xl font-bold tracking-tight">ADMINISTRATION_PANEL</h1>
      </div>

      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-black/40 border border-white/10">
          <TabsTrigger value="logs" className="font-mono">SYSTEM LOGS</TabsTrigger>
          <TabsTrigger value="users" className="font-mono">AGENT ROSTER</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-6">
          <Card className="bg-card/50 border-primary/20">
            <CardHeader>
              <CardTitle className="font-mono text-lg">Audit Trail</CardTitle>
              <CardDescription className="font-mono text-xs">All system actions are recorded below.</CardDescription>
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
                          {users.find(u => u.id === log.userId)?.username || log.userId}
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

        <TabsContent value="users" className="mt-6">
          <Card className="bg-card/50 border-primary/20">
            <CardHeader>
              <CardTitle className="font-mono text-lg">Personnel Management</CardTitle>
              <CardDescription className="font-mono text-xs">Manage active agents and clearance.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-mono text-xs">IDENTITY</TableHead>
                      <TableHead className="font-mono text-xs">CLEARANCE</TableHead>
                      <TableHead className="font-mono text-xs">STATUS</TableHead>
                      <TableHead className="font-mono text-xs">CONNECTION</TableHead>
                      <TableHead className="font-mono text-xs text-right">ACTIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className="hover:bg-muted/50 border-border/50">
                        <TableCell className="font-mono text-sm font-bold">
                          {u.username} {user.id === u.id && <span className="text-xs text-muted-foreground font-normal">(YOU)</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.role === "Overseer" ? "default" : "secondary"} className="font-mono text-[10px]">
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                           {u.isSuspended ? (
                             <span className="flex items-center gap-1 text-destructive text-xs font-mono">
                               <AlertTriangle size={12} /> SUSPENDED
                             </span>
                           ) : (
                             <span className="text-green-500 text-xs font-mono">ACTIVE</span>
                           )}
                        </TableCell>
                        <TableCell>
                           {u.isOnline ? (
                             <span className="flex items-center gap-1 text-green-400 text-xs font-mono animate-pulse">
                               <div className="w-2 h-2 rounded-full bg-green-500" />
                               ONLINE
                             </span>
                           ) : (
                             <span className="text-muted-foreground text-xs font-mono opacity-50">OFFLINE</span>
                           )}
                        </TableCell>
                        <TableCell className="text-right">
                          {user.role === "Overseer" && user.id !== u.id && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs font-mono border-blue-500/50 hover:bg-blue-500/10 text-blue-500" onClick={() => {
                                setEditingUser(u.id);
                                setEditForm({ username: u.username, password: "", role: u.role });
                              }}>
                                <Edit2 size={12} className="mr-1" /> EDIT
                              </Button>
                              {u.isSuspended ? (
                                <Button size="sm" variant="outline" className="h-7 text-xs font-mono border-green-500/50 hover:bg-green-500/10" onClick={() => unsuspendUser(u.id)}>
                                  <UserCheck size={12} className="mr-1" /> RESTORE
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" className="h-7 text-xs font-mono border-destructive/50 hover:bg-destructive/10 text-destructive" onClick={() => suspendUser(u.id)}>
                                  <UserX size={12} className="mr-1" /> SUSPEND
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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
