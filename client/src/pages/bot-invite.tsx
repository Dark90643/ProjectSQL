import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Shield, CheckCircle, ExternalLink, AlertCircle } from "lucide-react";

export default function BotInvite() {
  const { discordUser } = useAuth();
  const [, setLocation] = useLocation();
  const [serverId, setServerId] = useState<string | null>(null);
  const [serverName, setServerName] = useState<string>("");
  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [botAdded, setBotAdded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!discordUser) {
      setLocation("/");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const sid = params.get("serverId");
    const sname = params.get("serverName");
    
    if (!sid || !sname) {
      setLocation("/server-selector");
      return;
    }

    setServerId(sid);
    setServerName(sname);
    generateInviteUrl(sid);
  }, [discordUser, setLocation]);

  const generateInviteUrl = (sid: string) => {
    // Generate Discord bot invite link
    // Permissions: 8 (Administrator) or specific permissions needed
    const clientId = "1442053672694714529"; // Same bot client ID
    const permissions = 8; // Administrator permission
    const redirect = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&guild_id=${sid}&permissions=${permissions}&response_type=code&scope=bot`;
    setInviteUrl(redirect);
    setLoading(false);
  };

  const handleCheckBot = async () => {
    if (!serverId) return;
    
    setChecking(true);
    try {
      const response = await fetch(`/api/auth/discord/check-bot?serverId=${serverId}`);
      const data = await response.json();
      
      if (data.hasBotInServer) {
        setBotAdded(true);
        // Give user a moment to see the success message
        setTimeout(() => {
          setLocation("/server-selector");
        }, 1500);
      } else {
        setBotAdded(false);
      }
    } catch (error) {
      console.error("Failed to check bot:", error);
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <Spinner />
          <p className="text-sm text-muted-foreground font-mono mt-4">LOADING...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-black p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 border rounded-lg flex items-center justify-center bg-primary/10 border-primary/50 text-primary mb-4">
            <Shield size={32} />
          </div>
          <h1 className="font-mono text-2xl font-bold text-white mb-2">BOT INSTALLATION REQUIRED</h1>
          <p className="text-primary/60 font-mono text-xs">Add AEGIS bot to access workspace</p>
        </div>

        <div className="bg-black/40 border border-primary/20 rounded-lg p-6 space-y-6">
          {/* Server Info */}
          <div className="space-y-2">
            <p className="text-muted-foreground font-mono text-xs uppercase opacity-75">Server Name</p>
            <p className="text-white font-mono text-sm font-bold">{serverName}</p>
          </div>

          {/* Status */}
          {botAdded ? (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-green-500 font-mono text-sm font-bold">BOT ADDED</p>
                <p className="text-green-500/80 font-mono text-xs mt-1">AEGIS bot has been successfully added to your server. Redirecting...</p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-500 font-mono text-sm font-bold">BOT NOT FOUND</p>
                <p className="text-amber-500/80 font-mono text-xs mt-1">AEGIS bot is not in this server. Please add it to proceed.</p>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="space-y-3">
            <p className="text-muted-foreground font-mono text-xs uppercase opacity-75">SETUP INSTRUCTIONS</p>
            <ol className="space-y-2 font-mono text-sm">
              <li className="flex gap-3">
                <span className="text-primary font-bold flex-shrink-0">1.</span>
                <span className="text-muted-foreground">Click "Add Bot" below</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold flex-shrink-0">2.</span>
                <span className="text-muted-foreground">Select your server from Discord</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold flex-shrink-0">3.</span>
                <span className="text-muted-foreground">Grant permissions</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary font-bold flex-shrink-0">4.</span>
                <span className="text-muted-foreground">Return and click "Verify Bot Added"</span>
              </li>
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            {!botAdded && inviteUrl && (
              <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                <Button className="w-full font-mono text-sm bg-indigo-600 hover:bg-indigo-700 text-white gap-2" data-testid="button-add-bot">
                  <ExternalLink size={16} />
                  ADD BOT TO SERVER
                </Button>
              </a>
            )}
            
            <Button
              className={`w-full font-mono text-sm ${botAdded ? "bg-green-600 hover:bg-green-700" : "bg-primary hover:bg-primary/90"}`}
              disabled={checking}
              onClick={handleCheckBot}
              data-testid="button-verify-bot"
            >
              {checking ? (
                <>
                  <Spinner className="mr-2 h-3 w-3" />
                  CHECKING...
                </>
              ) : botAdded ? (
                <>
                  <CheckCircle size={16} />
                  BOT VERIFIED
                </>
              ) : (
                "VERIFY BOT ADDED"
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full font-mono text-xs"
              onClick={() => setLocation("/server-selector")}
              data-testid="button-back-to-servers"
            >
              BACK TO SERVERS
            </Button>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-muted-foreground font-mono opacity-50">
            The AEGIS bot is required to manage cases and moderation in your server.
          </p>
        </div>
      </div>
    </div>
  );
}
