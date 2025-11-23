import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";

export default function DiscordAuth() {
  const [, setLocation] = useLocation();
  const { discordLogin } = useAuth();

  useEffect(() => {
    async function handleAuth() {
      try {
        const params = new URLSearchParams(window.location.search);
        
        // Check for Discord callback errors
        const error = params.get("error");
        if (error) {
          console.error("Discord callback error:", error);
          const details = params.get("details");
          console.error("Error details:", details);
          // Redirect to home with error query param
          setLocation(`/?discord_error=${encodeURIComponent(error)}${details ? `&details=${encodeURIComponent(details)}` : ""}`);
          return;
        }
        
        const discordId = params.get("discordId");
        const username = params.get("username");

        if (!discordId || !username) {
          console.error("Missing Discord credentials");
          setLocation("/");
          return;
        }

        console.log("Discord auth page received:", { discordId, username });

        // Notify auth context that Discord login was successful
        const success = await discordLogin("", { id: discordId, username });
        if (success) {
          setLocation("/server-selector");
        } else {
          setLocation("/");
        }
      } catch (error) {
        console.error("Discord auth error:", error);
        setLocation("/");
      }
    }

    handleAuth();
  }, [discordLogin, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <Spinner />
        <p className="text-sm text-muted-foreground font-mono mt-4">AUTHENTICATING WITH DISCORD...</p>
      </div>
    </div>
  );
}
