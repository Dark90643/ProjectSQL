import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, UserX, UserCheck, Activity, Wifi } from "lucide-react";

export default function AdminPanel() {
  const { user, users, logs, suspendUser, unsuspendUser } = useAuth();

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
                            u.isSuspended ? (
                              <Button size="sm" variant="outline" className="h-7 text-xs font-mono border-green-500/50 hover:bg-green-500/10" onClick={() => unsuspendUser(u.id)}>
                                <UserCheck size={12} className="mr-1" /> RESTORE
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 text-xs font-mono border-destructive/50 hover:bg-destructive/10 text-destructive" onClick={() => suspendUser(u.id)}>
                                <UserX size={12} className="mr-1" /> SUSPEND
                              </Button>
                            )
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
    </div>
  );
}
