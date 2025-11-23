import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Trash2, RotateCcw, Clock, AlertTriangle } from "lucide-react";

let restorationInProgress = false;

interface DeletedCaseLog {
  id: string;
  action: string;
  userId: string;
  targetId: string;
  details: string;
  timestamp: string;
  caseData?: any;
}

export default function Recovery() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [deletedCases, setDeletedCases] = useState<DeletedCaseLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<string | null>(null);
  const { toast } = useToast();

  // Check permissions - only Management and Overseer can access recovery
  if (!user || (user.role !== "Management" && user.role !== "Overseer")) {
    return (
      <div className="flex items-center justify-center h-full text-destructive font-mono">
        ACCESS DENIED - INSUFFICIENT PRIVILEGES
      </div>
    );
  }

  const fetchDeletedCases = async () => {
    try {
      const response = await fetch("/api/recovery/deleted-cases", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setDeletedCases(data);
      }
    } catch (error) {
      console.error("Error fetching deleted cases:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to load deleted cases" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedCases();
  }, [toast]);

  const handleRestore = async (log: DeletedCaseLog) => {
    if (restorationInProgress) return;
    
    restorationInProgress = true;
    setRestoringId(log.targetId);
    
    try {
      const response = await fetch("/api/recovery/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ caseId: log.targetId }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ variant: "destructive", title: "Error", description: data.error });
        return;
      }

      toast({ title: "Success", description: "Case restored successfully. Refreshing dashboard..." });
      
      // Remove from deleted cases list
      setDeletedCases(prev => prev.filter(c => c.targetId !== log.targetId));
      
      // Refresh the entire data context
      setTimeout(async () => {
        try {
          // Refresh auth context data which includes cases
          window.location.reload();
        } catch (e) {
          console.error("Failed to refresh:", e);
        }
      }, 500);
    } catch (error) {
      console.error("Restore error:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to restore case" });
    } finally {
      restorationInProgress = false;
      setRestoringId(null);
    }
  };

  const getDaysRemaining = (timestamp: string) => {
    const deleted = new Date(timestamp);
    const expiry = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const days = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(0, days);
  };

  const handlePermanentlyDelete = async (caseId: string) => {
    if (confirmPermanentDelete !== caseId) {
      setConfirmPermanentDelete(caseId);
      return;
    }

    try {
      const response = await fetch(`/api/recovery/${caseId}/permanently-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ variant: "destructive", title: "Error", description: data.error });
        return;
      }

      toast({ title: "Success", description: "Case permanently deleted from recovery - cannot be recovered" });

      // Auto refresh page after successful deletion
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("Error permanently deleting case:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to permanently delete case" });
      setConfirmPermanentDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")}>
          <ChevronLeft />
        </Button>
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">CASE RECOVERY</h1>
          <p className="font-mono text-xs text-muted-foreground">Recover deleted cases within 30 days</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-[60vh]">
          <p className="font-mono text-sm text-muted-foreground">LOADING RECOVERY DATA...</p>
        </div>
      ) : deletedCases.length === 0 ? (
        <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-12 text-center">
            <Trash2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="font-mono text-sm text-muted-foreground">NO DELETED CASES</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {deletedCases.map((log) => {
            const caseData = log.caseData;
            const daysRemaining = getDaysRemaining(log.timestamp);

            return (
              <Card
                key={log.targetId}
                className="border-primary/20 bg-card/50 backdrop-blur-sm hover:border-primary/40 transition-colors"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="font-mono text-lg">{log.targetId}</CardTitle>
                        <div className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-mono ${
                          daysRemaining <= 3 ? "bg-destructive/20 text-destructive" : "bg-yellow-500/20 text-yellow-500"
                        }`}>
                          <Clock size={10} />
                          {daysRemaining} DAYS LEFT
                        </div>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground mb-2">{caseData?.title || "Untitled"}</p>
                      <div className="flex gap-4 text-xs font-mono text-muted-foreground">
                        <span>DELETED: {new Date(log.timestamp).toLocaleString()}</span>
                        <span>BY: {log.userId}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleRestore(log)}
                      disabled={restoringId === log.targetId}
                      className="font-mono gap-2 flex-1"
                      variant="outline"
                      data-testid={`button-restore-case-${log.targetId}`}
                    >
                      <RotateCcw size={14} />
                      {restoringId === log.targetId ? "RESTORING..." : "RESTORE CASE"}
                    </Button>
                    <Button
                      onClick={() => handlePermanentlyDelete(log.targetId)}
                      variant={confirmPermanentDelete === log.targetId ? "destructive" : "outline"}
                      size={confirmPermanentDelete === log.targetId ? "default" : "icon"}
                      data-testid={`button-permanently-delete-case-${log.targetId}`}
                    >
                      {confirmPermanentDelete === log.targetId ? (
                        <>
                          <AlertTriangle size={14} />
                          DELETE FOREVER?
                        </>
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </Button>
                    {confirmPermanentDelete === log.targetId && (
                      <Button 
                        variant="outline"
                        size="icon"
                        onClick={() => setConfirmPermanentDelete(null)}
                        className="font-mono text-xs"
                        data-testid={`button-cancel-permanent-delete-${log.targetId}`}
                      >
                        CANCEL
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
