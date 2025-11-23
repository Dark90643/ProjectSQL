import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Shield, Search, LogOut, Zap } from "lucide-react";

interface Server {
  id: string;
  name: string;
  icon?: string;
}

export default function ServerSelector() {
  const { discordUser, selectServer, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!discordUser) {
      setLocation("/");
      return;
    }

    // Fetch user's servers
    fetch(`/api/auth/discord/servers?discordId=${discordUser.discordId}`)
      .then(res => res.json())
      .then(data => {
        setServers(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch servers:", err);
        setLoading(false);
      });
  }, [discordUser, setLocation]);

  const filteredServers = useMemo(() => {
    try {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return servers;
      
      return servers.filter(server => {
        const serverName = (server.name || "").toLowerCase();
        const serverId = (server.id || "").toLowerCase();
        return serverName.includes(query) || serverId.includes(query);
      });
    } catch (error) {
      console.error("Search error:", error);
      return servers;
    }
  }, [servers, searchQuery]);

  const handleSelectServer = async (serverId: string) => {
    setSelecting(serverId);
    const success = await selectServer(serverId);
    if (success) {
      setLocation("/dashboard");
    }
    setSelecting(null);
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <Spinner />
          <p className="text-sm text-muted-foreground font-mono mt-4">LOADING AUTHORIZED SERVERS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-black p-4 flex flex-col">
      {/* Header */}
      <div className="max-w-4xl mx-auto w-full mb-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 border rounded-lg flex items-center justify-center bg-primary/10 border-primary/50 text-primary">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="font-mono text-2xl font-bold text-white tracking-tighter">AEGIS_NET</h1>
              <p className="text-primary/60 font-mono text-xs">WORKSPACE SELECTION</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className="font-mono text-xs gap-2"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut size={14} />
            LOGOUT
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search servers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-black/40 border-white/10 font-mono text-sm focus-visible:ring-primary/50"
            data-testid="input-server-search"
          />
        </div>
      </div>

      {/* Servers Grid */}
      <div className="max-w-4xl mx-auto w-full flex-1">
        {servers.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground font-mono text-sm">NO SERVERS AVAILABLE</p>
            <p className="text-muted-foreground font-mono text-xs mt-2 opacity-75">Contact an administrator for server access</p>
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground font-mono text-sm">NO SERVERS MATCH "{searchQuery}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServers.map(server => (
              <div
                key={server.id}
                className="group relative overflow-hidden rounded-lg border border-primary/20 bg-black/40 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300 cursor-pointer"
                onClick={() => !selecting && handleSelectServer(server.id)}
                data-testid={`card-server-${server.id}`}
              >
                {/* Server Icon Background */}
                {server.icon && (
                  <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity">
                    <img 
                      src={server.icon}
                      alt={server.name}
                      className="w-full h-full object-cover blur-sm"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="relative p-4 flex flex-col h-full">
                  {/* Icon and Name */}
                  <div className="flex items-start gap-3 mb-4">
                    {server.icon ? (
                      <img
                        src={server.icon}
                        alt={server.name}
                        className="w-12 h-12 rounded-lg object-cover border border-primary/30"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                        <Zap className="h-6 w-6 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-mono font-bold text-white text-sm truncate group-hover:text-primary transition-colors">
                        {server.name}
                      </h3>
                      <p className="text-muted-foreground font-mono text-xs opacity-75 mt-1">
                        {server.id.substring(0, 8)}...
                      </p>
                    </div>
                  </div>

                  {/* Select Button */}
                  <Button
                    className="w-full font-mono text-xs mt-auto bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={!!selecting}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectServer(server.id);
                    }}
                    data-testid={`button-select-server-${server.id}`}
                  >
                    {selecting === server.id ? (
                      <>
                        <Spinner className="mr-2 h-3 w-3" />
                        CONNECTING...
                      </>
                    ) : (
                      <>
                        <Zap className="mr-2 h-3 w-3" />
                        ACCESS
                      </>
                    )}
                  </Button>
                </div>

                {/* Hover Border Glow */}
                <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle at top right, rgba(59, 130, 246, 0.1), transparent)',
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-4xl mx-auto w-full mt-8 pt-8 border-t border-white/10">
        <p className="text-[10px] text-muted-foreground font-mono text-center opacity-50">
          {servers.length} SERVER{servers.length !== 1 ? "S" : ""} AVAILABLE • {filteredServers.length} DISPLAYED
        </p>
      </div>
    </div>
  );
}
