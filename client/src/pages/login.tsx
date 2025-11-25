import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Globe, AlertOctagon } from "lucide-react";
import generatedImage from '@assets/generated_images/dark_abstract_data_visualization_background_with_grid_lines_and_world_map_elements.png';

export default function Login() {
  const { discordLogin, isIpBanned, clientIp } = useAuth();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Handle Discord errors/cancellation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Check for Discord callback errors
    const discordError = params.get("discord_error");
    if (discordError) {
      const details = params.get("details");
      console.error("Discord error:", discordError, details);
      let message = "Discord authentication failed.";
      if (discordError === "no_code") {
        message = "No authorization code received from Discord.";
      } else if (discordError === "server_config") {
        message = "Server configuration error. Contact administrator.";
      } else if (discordError === "token_exchange") {
        message = `Failed to exchange code for token: ${details || "Unknown error"}`;
      } else if (discordError === "user_info") {
        message = "Failed to fetch user information from Discord.";
      } else if (discordError === "callback") {
        message = `Discord authentication error: ${details || "Unknown error"}`;
      }
      setAuthError(message);
      // Clean up the URL
      window.history.replaceState({}, document.title, "/");
    } else if (params.get("cancelled") === "true") {
      setAuthError("Discord authorization cancelled. Please try again.");
      // Clean up the URL
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-black">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage: `url(${generatedImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Overlay Gradient */}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-black via-black/80 to-transparent" />
      
      {/* Scanlines */}
      <div className="scanline z-20" />

      <div className="relative z-30 w-full max-w-md p-4">
        <div className="text-center mb-8 space-y-2">
          <div className={`mx-auto w-16 h-16 border rounded-full flex items-center justify-center animate-pulse ${
            isIpBanned ? "bg-destructive/10 border-destructive text-destructive" : "bg-primary/10 border-primary/50 text-primary"
          }`}>
            {isIpBanned ? <AlertOctagon size={32} /> : <Shield size={32} />}
          </div>
          <h1 className={`font-mono text-3xl font-bold tracking-tighter glow-text ${isIpBanned ? "text-destructive" : "text-white"}`}>
            {isIpBanned ? "ACCESS_DENIED" : "AEGIS_NET"}
          </h1>
          <p className="text-primary/60 font-mono text-sm tracking-widest uppercase">
            {isIpBanned ? "TERMINAL LOCKDOWN INITIATED" : "Secure Intelligence Terminal"}
          </p>
        </div>

        <Card className={`glass-panel shadow-2xl ${isIpBanned ? "border-destructive/50 shadow-destructive/10" : "border-primary/20 shadow-primary/5"}`}>
          <CardHeader className="pb-2">
            <CardTitle className={`font-mono text-center text-xl ${isIpBanned ? "text-destructive" : ""}`}>
              {isIpBanned ? "CONNECTION REFUSED" : "AUTHENTICATE"}
            </CardTitle>
            <CardDescription className="text-center font-mono text-xs">
              {isIpBanned ? `IP ADDRESS ${clientIp} HAS BEEN BLACKLISTED` : "LOGIN VIA DISCORD TO ACCESS TERMINAL"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isIpBanned ? (
               <div className="p-6 border border-destructive/20 bg-destructive/5 rounded text-center space-y-4">
                 <p className="font-mono text-xs text-destructive">
                   Your workstation has been flagged for suspicious activity or clearance revocation. All access attempts are being logged.
                 </p>
                 <div className="font-mono text-[10px] text-muted-foreground">
                   ERROR_CODE: 0x99_IP_BAN<br/>
                   REF: {clientIp}
                 </div>
               </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-mono text-muted-foreground text-center">
                  Authentication requires Discord OAuth. Please sign in with your Discord account.
                </p>
                
                {authError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-xs font-mono text-destructive flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    {authError}
                  </div>
                )}

                <Button 
                  type="button"
                  className="w-full font-mono bg-indigo-600 text-white hover:bg-indigo-700"
                  disabled={isLoading || isIpBanned}
                  onClick={async () => {
                    setIsLoading(true);
                    setAuthError("");
                    try {
                      // Get Discord OAuth login URL from server
                      const response = await fetch("/api/auth/discord/login");
                      if (!response.ok) {
                        throw new Error("Failed to get Discord login URL");
                      }
                      const { authUrl } = await response.json();
                      // Redirect to Discord OAuth
                      window.location.href = authUrl;
                    } catch (error) {
                      setAuthError("Discord login failed. Please try again.");
                      setIsLoading(false);
                    }
                  }}
                  data-testid="button-discord-login"
                >
                  {isLoading ? "AUTHENTICATING..." : "LOGIN WITH DISCORD"}
                </Button>
              </div>
            )}
            
            <div className="mt-4 pt-4 border-t border-white/10 flex justify-center">
              <Link href="/public">
                <Button variant="link" className="text-xs font-mono text-muted-foreground hover:text-primary gap-2">
                  <Globe size={12} /> ACCESS PUBLIC DISCLOSURE TERMINAL
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
        
        <div className="mt-8 text-center">
          <p className="text-[10px] text-muted-foreground font-mono opacity-50">
            UNAUTHORIZED ACCESS IS A CLASS A FELONY. <br/>
            ALL ACTIONS ARE LOGGED AND MONITORED BY OVERSEER.
          </p>
        </div>
      </div>
    </div>
  );
}

function ShieldAlert(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}
