import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Globe, 
  Shield, 
  Clock, 
  AlertTriangle,
  Eye,
  RefreshCcw
} from "lucide-react";

export default function PublicDashboard() {
  const { cases } = useAuth();
  const [search, setSearch] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Simulate "Live Updates"
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSyncing(true);
      setTimeout(() => {
        setIsSyncing(false);
        setLastUpdated(new Date());
      }, 800);
    }, 10000); // Sync every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const publicCases = cases.filter(c => c.isPublic);

  const filteredCases = publicCases.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) || 
                          c.description.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "Critical": return "text-destructive border-destructive/50 bg-destructive/10";
      case "High": return "text-orange-500 border-orange-500/50 bg-orange-500/10";
      case "Medium": return "text-yellow-500 border-yellow-500/50 bg-yellow-500/10";
      default: return "text-blue-500 border-blue-500/50 bg-blue-500/10";
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Header */}
      <header className="border-b border-primary/20 bg-black/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border border-primary/50 rounded-full flex items-center justify-center text-primary">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="font-mono font-bold text-lg tracking-tighter text-foreground glow-text">
                AEGIS_NET
              </h1>
              <p className="text-[10px] text-primary/60 font-mono tracking-widest uppercase">
                Public Disclosure Terminal
              </p>
            </div>
          </div>
          
          <Link href="/">
            <Button variant="outline" className="font-mono text-xs border-primary/50 text-primary hover:bg-primary/10">
              AGENT LOGIN
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full relative z-10">
        <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-mono font-bold">DECLASSIFIED INTELLIGENCE</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              The following records have been cleared for public release by the Overseer Council. 
              Sensitive details remain redacted in accordance with Protocol 99.
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-sidebar/50 px-3 py-1 rounded border border-sidebar-border">
            <RefreshCcw size={12} className={isSyncing ? "animate-spin text-primary" : ""} />
            {isSyncing ? "SYNCING..." : `LAST SYNC: ${lastUpdated.toLocaleTimeString()}`}
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full max-w-md mb-8">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="SEARCH PUBLIC RECORDS..." 
            className="pl-9 font-mono bg-background/50 border-primary/20 focus-visible:ring-primary/50" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCases.length === 0 ? (
            <div className="col-span-full text-center py-20 border border-dashed border-muted rounded-lg">
              <Globe className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground font-mono">NO PUBLIC RECORDS FOUND MATCHING CRITERIA</p>
            </div>
          ) : (
            filteredCases.map(c => (
              <Card key={c.id} className="group bg-card/30 border-border/50 hover:border-primary/50 transition-all duration-300 hover:bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className={`font-mono rounded-sm ${getPriorityColor(c.priority)}`}>
                      {c.priority}
                    </Badge>
                    <Badge variant="secondary" className="font-mono rounded-sm text-[10px]">
                      PUBLIC
                    </Badge>
                  </div>
                  <CardTitle className="font-mono text-lg mt-2 group-hover:text-primary transition-colors truncate">
                    {c.title}
                  </CardTitle>
                  <p className="text-xs font-mono text-muted-foreground">{c.id}</p>
                </CardHeader>
                <CardContent className="pb-3">
                  <p className="text-sm text-muted-foreground line-clamp-3 h-[4.5rem] mb-4 font-mono">
                    {c.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono border-t border-dashed border-border pt-3">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                    {c.status === "Redacted" && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle size={12} />
                        PARTIALLY REDACTED
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>

      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.8)_100%)]" />
        <div className="scanline opacity-[0.05]" />
      </div>
    </div>
  );
}
