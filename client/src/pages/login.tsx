import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, KeyRound, Lock, Terminal, AlertOctagon, Globe } from "lucide-react";
import generatedImage from '@assets/generated_images/dark_abstract_data_visualization_background_with_grid_lines_and_world_map_elements.png';

const loginSchema = z.object({
  username: z.string().min(1, "Identity required"),
  password: z.string().min(1, "Passcode required"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Identity must be at least 3 characters"),
  password: z.string().min(6, "Passcode must be at least 6 characters"),
  inviteCode: z.string().min(1, "Clearance code required"),
});

export default function Login() {
  const { login, register, discordLogin, isIpBanned, clientIp, canCreateAccounts } = useAuth();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [loggedInUsername, setLoggedInUsername] = useState("");

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", password: "", inviteCode: "" },
  });

  async function onLogin(values: z.infer<typeof loginSchema>) {
    if (isIpBanned) return;
    setIsLoading(true);
    setAuthError("");
    
    const success = await login(values.username, values.password);
    if (success) {
      setLocation("/dashboard");
    } else {
      setAuthError("Identity verification failed. Access denied.");
    }
    setIsLoading(false);
  }

  async function onVerifyInvite() {
    if (!verificationCode.trim()) {
      setAuthError("Verification code required");
      return;
    }

    setVerifying(true);
    setAuthError("");

    try {
      // Verify the invite code
      const response = await fetch("/api/invites/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: verificationCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        setAuthError(error.error || "Verification failed");
        setVerifying(false);
        return;
      }

      // Clear verification state
      setNeedsVerification(false);
      setVerificationCode("");
      setAuthError("");
      setIsLoading(false);
      setVerifying(false);
      
      // Navigate - the router will handle the redirect via auth context
      setLocation("/dashboard");
    } catch (error: any) {
      setAuthError("Verification error. Please try again.");
      setVerifying(false);
    }
  }

  async function onRegister(values: z.infer<typeof registerSchema>) {
    if (isIpBanned) return;
    setIsLoading(true);
    setAuthError("");

    const success = await register(values.username, values.password, values.inviteCode);
    if (success) {
      setLocation("/dashboard");
    } else {
      setAuthError("Registration failed. Check clearance code.");
    }
    setIsLoading(false);
  }

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
              {isIpBanned ? `IP ADDRESS ${clientIp} HAS BEEN BLACKLISTED` : "ENTER CREDENTIALS TO ACCESS CLASSIFIED DATA"}
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
            ) : needsVerification ? (
              <div className="space-y-4 mt-4">
                <div className="p-4 bg-primary/10 border border-primary/30 rounded space-y-2">
                  <p className="font-mono text-sm text-primary font-bold">ACCOUNT VERIFICATION REQUIRED</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    Your account has been provisioned by an Overseer. Enter your clearance verification code to complete activation.
                  </p>
                </div>
                <div>
                  <label className="font-mono text-xs uppercase text-muted-foreground mb-2 block">Clearance Verification Code</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="ENTER CODE"
                      className="pl-9 bg-black/40 border-white/10 font-mono focus-visible:ring-primary/50"
                      data-testid="input-verification-code"
                    />
                  </div>
                </div>

                {authError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-xs font-mono text-destructive flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    {authError}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 font-mono"
                    onClick={() => {
                      setNeedsVerification(false);
                      setVerificationCode("");
                      setAuthError("");
                    }}
                    data-testid="button-cancel-verify"
                  >
                    CANCEL
                  </Button>
                  <Button
                    type="button"
                    className="flex-1 font-mono bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={onVerifyInvite}
                    disabled={verifying}
                    data-testid="button-verify-code"
                  >
                    {verifying ? "VERIFYING..." : "VERIFY ACCOUNT"}
                  </Button>
                </div>
              </div>
            ) : (
              <Tabs defaultValue="login" className="w-full">
                <TabsList className={`grid w-full bg-black/40 border border-white/10 ${canCreateAccounts ? 'grid-cols-2' : ''}`}>
                  <TabsTrigger value="login" className="font-mono data-[state=active]:bg-primary/20 data-[state=active]:text-primary">LOGIN</TabsTrigger>
                  {canCreateAccounts && (
                    <TabsTrigger value="register" className="font-mono data-[state=active]:bg-primary/20 data-[state=active]:text-primary">REGISTER</TabsTrigger>
                  )}
                </TabsList>
                
                <TabsContent value="login">
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4 mt-4">
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Agent ID</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Terminal className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="ENTER ID" {...field} className="pl-9 bg-black/40 border-white/10 font-mono focus-visible:ring-primary/50" data-testid="input-username" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Passcode</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input type="password" placeholder="••••••••" {...field} className="pl-9 bg-black/40 border-white/10 font-mono focus-visible:ring-primary/50" data-testid="input-password" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {authError && (
                        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-xs font-mono text-destructive flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4" />
                          {authError}
                        </div>
                      )}

                      <Button type="submit" className="w-full font-mono bg-primary text-primary-foreground hover:bg-primary/90" disabled={isLoading} data-testid="button-login">
                        {isLoading ? "VERIFYING..." : "ACCESS TERMINAL"}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
                
                {canCreateAccounts && (
                <TabsContent value="register">
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4 mt-4">
                      <FormField
                        control={registerForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Create Agent ID</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Terminal className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="NEW ID" {...field} className="pl-9 bg-black/40 border-white/10 font-mono focus-visible:ring-primary/50" data-testid="input-register-username" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Create Passcode</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input type="password" placeholder="••••••••" {...field} className="pl-9 bg-black/40 border-white/10 font-mono focus-visible:ring-primary/50" data-testid="input-register-password" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="inviteCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Clearance Code</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="XXXXX-XXX" {...field} className="pl-9 bg-black/40 border-white/10 font-mono focus-visible:ring-primary/50" data-testid="input-invite-code" />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {authError && (
                        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-xs font-mono text-destructive flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4" />
                          {authError}
                        </div>
                      )}

                      <Button type="submit" className="w-full font-mono bg-primary text-primary-foreground hover:bg-primary/90" disabled={isLoading} data-testid="button-register">
                        {isLoading ? "PROCESSING..." : "INITIALIZE ACCOUNT"}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>
                )}
              </Tabs>
            )}
            
            <div className="mt-4 pt-4 border-t border-white/10 flex justify-center">
              <Link href="/public">
                <Button variant="link" className="text-xs font-mono text-muted-foreground hover:text-primary gap-2">
                  <Globe size={12} /> ACCESS PUBLIC DISCLOSURE TERMINAL
                </Button>
              </Link>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
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
