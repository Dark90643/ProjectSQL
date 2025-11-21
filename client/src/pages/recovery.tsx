import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/lib/use-toast";
import { ChevronLeft, Trash2, RotateCcw, Clock } from "lucide-react";

interface DeletedCaseRecord {
  id: string;
  caseData: string;
  deletedBy: string;
  deletedAt: string;
}

export default function Recovery() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [deletedCases, setDeletedCases] = useState<DeletedCaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeletedCases = async () => {
      try {
        const response = await fetch("/api/deleted-cases", {
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

    fetchDeletedCases();
  }, []);

  const handleRestore = async (caseId: string) => {
    setRestoringId(caseId);
    try {
      const response = await fetch(`/api/deleted-cases/${caseId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        toast({ variant: "destructive", title: "Error", description: error.error });
        return;
      }

      toast({ title: "Success", description: "Case restored successfully" });
      setDeletedCases(deletedCases.filter(c => c.id !== caseId));
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to restore case" });
    } finally {
      setRestoringId(null);
    }
  };

  const getDaysRemaining = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const expiry = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const days = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(0, days);
  };

  const parseCase = (caseDataStr: string) => {
    try {
      return JSON.parse(caseDataStr);
    } catch {
      return null;
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
          {deletedCases.map((deletedCase) => {
            const caseData = parseCase(deletedCase.caseData);
            const daysRemaining = getDaysRemaining(deletedCase.deletedAt);

            return (
              <Card
                key={deletedCase.id}
                className="border-primary/20 bg-card/50 backdrop-blur-sm hover:border-primary/40 transition-colors"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="font-mono text-lg">{caseData?.id}</CardTitle>
                        <div className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-mono ${
                          daysRemaining <= 3 ? "bg-destructive/20 text-destructive" : "bg-yellow-500/20 text-yellow-500"
                        }`}>
                          <Clock size={10} />
                          {daysRemaining} DAYS LEFT
                        </div>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground mb-2">{caseData?.title}</p>
                      <div className="flex gap-4 text-xs font-mono text-muted-foreground">
                        <span>DELETED: {new Date(deletedCase.deletedAt).toLocaleString()}</span>
                        <span>BY: {deletedCase.deletedBy}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => handleRestore(deletedCase.id)}
                    disabled={restoringId === deletedCase.id}
                    className="font-mono gap-2"
                    variant="outline"
                    data-testid={`button-restore-case-${deletedCase.id}`}
                  >
                    <RotateCcw size={14} />
                    {restoringId === deletedCase.id ? "RESTORING..." : "RESTORE CASE"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
