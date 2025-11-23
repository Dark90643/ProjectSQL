import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Search, 
  Plus, 
  Filter, 
  Clock, 
  AlertTriangle,
  FileText,
  MoreHorizontal,
  Eye,
  Globe,
  Lock,
  Shield,
  ChevronLeft
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Dashboard() {
  const { cases, user, deleteCase, toggleCasePublic } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [encryptingCaseId, setEncryptingCaseId] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [accessDeniedTime, setAccessDeniedTime] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    
    // Check server permissions
    const checkPermissions = async () => {
      try {
        const response = await fetch("/api/auth/server-permissions", {
          credentials: "include",
        });
        const data = await response.json();
        setHasPermission(data.hasPermission);
        
        if (!data.hasPermission) {
          setAccessDeniedTime(3);
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
        setHasPermission(false);
        setAccessDeniedTime(3);
      }
    };
    
    checkPermissions();
  }, [user]);

  // Handle access denied countdown
  useEffect(() => {
    if (accessDeniedTime <= 0) return;
    
    const timer = setTimeout(() => {
      setAccessDeniedTime(accessDeniedTime - 1);
    }, 1000);
    
    if (accessDeniedTime === 1) {
      setTimeout(() => {
        setLocation("/public-dashboard");
      }, 1000);
    }
    
    return () => clearTimeout(timer);
  }, [accessDeniedTime, setLocation]);

  if (!user) return null;

  // Show access denied message if user doesn't have permission
  if (hasPermission === false) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="border-destructive/50 max-w-md w-full">
          <CardHeader>
            <CardTitle className="font-mono text-destructive">ACCESS DENIED</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground font-mono text-sm">You do not have administrator or moderator permissions in this server. Only server administrators and owners can access the agent dashboard.</p>
            <p className="text-muted-foreground font-mono text-xs">
              Redirecting to public cases in <span className="text-destructive font-bold">{accessDeniedTime}</span> seconds...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state while checking permissions
  if (hasPermission === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground font-mono">CHECKING PERMISSIONS...</p>
        </div>
      </div>
    );
  }

  const filteredCases = cases.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) || 
                          c.id.toLowerCase().includes(search.toLowerCase()) ||
                          c.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter ? c.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Critical": return "text-destructive border-destructive/50 bg-destructive/10";
      case "High": return "text-orange-500 border-orange-500/50 bg-orange-500/10";
      case "Medium": return "text-yellow-500 border-yellow-500/50 bg-yellow-500/10";
      default: return "text-blue-500 border-blue-500/50 bg-blue-500/10";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-green-500/20 text-green-500 border-green-500/30";
      case "Redacted": return "bg-destructive/20 text-destructive border-destructive/30";
      case "Closed": return "bg-muted text-muted-foreground border-muted-foreground/30";
      default: return "bg-secondary text-secondary-foreground";
    }
  };

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
      setEncryptingCaseId(null);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to encrypt case" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-sidebar/50 border-sidebar-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase">Active Cases</p>
              <p className="text-2xl font-mono font-bold text-primary">
                {cases.filter(c => c.status === "Active").length}
              </p>
            </div>
            <FileText className="text-primary/20 h-8 w-8" />
          </CardContent>
        </Card>
        <Card className="bg-sidebar/50 border-sidebar-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase">Clearance</p>
              <p className="text-2xl font-mono font-bold text-foreground">
                {user.role === "Overseer" ? "L-5" : user.role === "Management" ? "L-4" : "L-3"}
              </p>
            </div>
            <Shield className="text-foreground/20 h-8 w-8" />
          </CardContent>
        </Card>
        <Card className="bg-sidebar/50 border-sidebar-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase">System Status</p>
              <p className="text-2xl font-mono font-bold text-green-500">ONLINE</p>
            </div>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="SEARCH DATABASE..." 
            className="pl-9 font-mono bg-background/50 border-primary/20 focus-visible:ring-primary/50" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="font-mono gap-2 border-dashed">
                <Filter size={16} />
                {statusFilter || "ALL STATUS"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter(null)}>ALL STATUS</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Active")}>ACTIVE</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Closed")}>CLOSED</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Redacted")}>REDACTED</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link href="/cases/new">
            <Button className="font-mono gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus size={16} />
              INITIATE CASE
            </Button>
          </Link>
        </div>
      </div>

      {/* Cases Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCases.length === 0 ? (
          <div className="col-span-full text-center py-20 border border-dashed border-muted rounded-lg">
            <p className="text-muted-foreground font-mono">NO RECORDS FOUND</p>
          </div>
        ) : (
          filteredCases.map(c => (
            <Card key={c.id} className="group bg-card/50 border-border/50 hover:border-primary/50 transition-all duration-300 hover:bg-card/80 relative overflow-hidden">
              {c.isPublic && (
                <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[9px] font-mono px-2 py-1 rounded-bl">
                  PUBLIC
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className={`font-mono rounded-sm ${getPriorityColor(c.priority)}`}>
                    {c.priority}
                  </Badge>
                  <Badge variant="outline" className={`font-mono rounded-sm ${getStatusColor(c.status)}`}>
                    {c.status}
                  </Badge>
                </div>
                <CardTitle className="font-mono text-lg mt-2 group-hover:text-primary transition-colors truncate">
                  {c.title}
                </CardTitle>
                <p className="text-xs font-mono text-muted-foreground">{c.id}</p>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-sm text-muted-foreground line-clamp-2 h-10 mb-4">
                  {c.status === "Redacted" ? "██████████ ████ ████████" : c.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {c.assignedAgent}
                  </span>
                </div>
              </CardContent>
              <CardFooter className="pt-0 flex justify-between">
                <Link href={`/cases/${c.id}`}>
                  <Button size="sm" variant="secondary" className="font-mono text-xs w-full">
                    <Eye size={14} className="mr-2" />
                    ACCESS FILE
                  </Button>
                </Link>
                
                {(user.role === "Management" || user.role === "Overseer") && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="ml-2 h-8 w-8 p-0">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {user.role === "Overseer" && (
                        <DropdownMenuItem className="font-mono text-xs" onClick={() => toggleCasePublic(c.id)}>
                          {c.isPublic ? (
                            <>
                              <Lock size={12} className="mr-2" /> MAKE PRIVATE
                            </>
                          ) : (
                            <>
                              <Globe size={12} className="mr-2" /> MAKE PUBLIC
                            </>
                          )}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive focus:text-destructive font-mono text-xs" onClick={() => deleteCase(c.id)}>
                        DELETE RECORD
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
