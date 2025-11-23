import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, BarChart3, Zap } from "lucide-react";

interface CaseData {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  serverId: string;
  serverName?: string;
  createdAt: string;
  updatedAt: string;
}

interface ServerStats {
  serverId: string;
  serverName: string;
  totalCases: number;
  activeCases: number;
  closedCases: number;
}

export default function SupportPanel() {
  const { user, isSupportTeam } = useAuth();
  const [, setLocation] = useLocation();
  const [cases, setCases] = useState<CaseData[]>([]);
  const [servers, setServers] = useState<ServerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isSupportTeam) {
      setLocation("/");
      return;
    }

    // Fetch all cases across all servers
    fetch("/api/support/all-cases")
      .then(res => res.json())
      .then(data => {
        setCases(data.cases || []);
        setServers(data.serverStats || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch cases:", err);
        setLoading(false);
      });
  }, [user, isSupportTeam, setLocation]);

  const filteredCases = selectedServer
    ? cases.filter(c => c.serverId === selectedServer && c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : cases.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground font-mono">LOADING SUPPORT PANEL...</p>
        </div>
      </div>
    );
  }

  if (!isSupportTeam) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="border-destructive/50 max-w-md w-full">
          <CardHeader>
            <CardTitle className="font-mono text-destructive">ACCESS DENIED</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground font-mono text-sm">You do not have permission to access the support panel. Only administrators and owners of the official AEGIS bot server can access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 border rounded-lg flex items-center justify-center bg-primary/10 border-primary/50 text-primary">
          <Zap size={20} />
        </div>
        <div>
          <h1 className="font-mono text-2xl font-bold text-white tracking-tighter">SUPPORT_PANEL</h1>
          <p className="text-primary/60 font-mono text-xs">MULTI-SERVER CASE MANAGEMENT</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-black/40 border border-white/10">
            <TabsTrigger value="overview" className="font-mono data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
              <BarChart3 size={14} /> OVERVIEW
            </TabsTrigger>
            <TabsTrigger value="cases" className="font-mono data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
              <Zap size={14} /> ALL CASES
            </TabsTrigger>
            <TabsTrigger value="search" className="font-mono data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
              <Search size={14} /> SEARCH
            </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-sm">TOTAL_CASES</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-primary">{cases.length}</p>
                </CardContent>
              </Card>
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-sm">SERVERS</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-primary">{servers.length}</p>
                </CardContent>
              </Card>
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-sm">ACTIVE_CASES</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-primary">{cases.filter(c => c.status === 'Active').length}</p>
                </CardContent>
              </Card>
            </div>

          {/* Server Statistics */}
          <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="font-mono text-sm">SERVER STATISTICS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {servers.map(server => (
                    <div key={server.serverId} className="p-3 bg-black/40 border border-primary/10 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-mono font-bold text-white text-sm">{server.serverName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{server.serverId}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-primary">{server.totalCases} cases</p>
                        <p className="font-mono text-xs text-muted-foreground">{server.activeCases} active</p>
                      </div>
                    </div>
                  ))}
                </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cases Tab */}
        <TabsContent value="cases" className="space-y-4">
          {/* Server Filter */}
          <div className="space-y-2">
              <label className="font-mono text-xs uppercase text-muted-foreground">Filter by Server</label>
              <select 
                value={selectedServer || ""}
                onChange={(e) => setSelectedServer(e.target.value || null)}
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded font-mono text-sm text-white focus:border-primary/50 focus:outline-none"
              >
                <option value="">ALL SERVERS</option>
                {servers.map(server => (
                  <option key={server.serverId} value={server.serverId}>
                    {server.serverName}
                  </option>
                ))}
            </select>
          </div>

          {/* Cases List */}
          <div className="space-y-3">
              {filteredCases.length === 0 ? (
                <Card className="border-primary/20">
                  <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground font-mono text-sm">No cases found</p>
                  </CardContent>
                </Card>
              ) : (
                filteredCases.map(caseData => (
                  <Card key={caseData.id} className="border-primary/20 hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="font-mono text-sm">{caseData.title}</CardTitle>
                          <CardDescription className="font-mono text-xs mt-1">{caseData.serverName}</CardDescription>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${
                          caseData.status === 'Active' ? 'bg-green-500/20 text-green-500' :
                          caseData.status === 'Closed' ? 'bg-red-500/20 text-red-500' :
                          'bg-yellow-500/20 text-yellow-500'
                        }`}>
                          {caseData.status}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-muted-foreground font-mono text-xs">{caseData.description}</p>
                      <div className="flex gap-4 text-xs font-mono text-muted-foreground">
                        <span>Priority: {caseData.priority}</span>
                        <span>Created: {new Date(caseData.createdAt).toLocaleDateString()}</span>
                      </div>
                    </CardContent>
                  </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-4">
          <div className="space-y-2">
            <label className="font-mono text-xs uppercase text-muted-foreground">Search Cases</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter case title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-black/40 border-white/10 font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-3">
              {filteredCases.length === 0 ? (
                <Card className="border-primary/20">
                  <CardContent className="p-6 text-center">
                    <p className="text-muted-foreground font-mono text-sm">No cases match your search</p>
                  </CardContent>
                </Card>
              ) : (
                filteredCases.map(caseData => (
                  <Card key={caseData.id} className="border-primary/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="font-mono text-sm">{caseData.title}</CardTitle>
                      <CardDescription className="font-mono text-xs">{caseData.serverName} • {caseData.status}</CardDescription>
                    </CardHeader>
                  </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
