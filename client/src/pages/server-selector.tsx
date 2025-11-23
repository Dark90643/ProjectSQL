import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Shield } from "lucide-react";

export default function ServerSelector() {
  const { discordUser, selectServer } = useAuth();
  const [, setLocation] = useLocation();
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

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

  const handleSelectServer = async (serverId: string) => {
    setSelecting(serverId);
    const success = await selectServer(serverId);
    if (success) {
      setLocation("/dashboard");
    }
    setSelecting(null);
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
    <div className="min-h-screen w-full flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 border rounded-full flex items-center justify-center bg-primary/10 border-primary/50 text-primary mb-4">
            <Shield size={32} />
          </div>
          <h1 className="font-mono text-3xl font-bold text-white mb-2">SELECT WORKSPACE</h1>
          <p className="text-primary/60 font-mono text-sm">Choose a Discord server to access</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.length === 0 ? (
            <Card className="md:col-span-2 border-primary/20">
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground font-mono">No servers available. Contact an administrator.</p>
              </CardContent>
            </Card>
          ) : (
            servers.map(server => (
              <Card key={server.id} className="border-primary/20 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => !selecting && handleSelectServer(server.id)}>
                <CardHeader className="pb-3">
                  <CardTitle className="font-mono text-sm">{server.name}</CardTitle>
                  <CardDescription className="font-mono text-xs">{server.id}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    className="w-full" 
                    disabled={!!selecting}
                    onClick={() => handleSelectServer(server.id)}
                  >
                    {selecting === server.id ? <Spinner className="mr-2" /> : null}
                    {selecting === server.id ? "CONNECTING..." : "SELECT"}
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
