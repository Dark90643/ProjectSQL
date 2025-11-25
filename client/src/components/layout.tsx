import { useAuth } from "@/lib/auth-context";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Shield, 
  LayoutDashboard, 
  FolderOpen, 
  Users, 
  LogOut,
  Lock,
  FileText,
  Menu,
  RotateCcw,
  Zap,
  Settings
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isSupportTeam } = useAuth();
  const [location] = useLocation();

  if (!user) return <>{children}</>;

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-primary/20 rounded flex items-center justify-center text-primary">
            <Shield size={24} />
          </div>
          <div>
            <h1 className="font-mono font-bold text-lg tracking-tighter text-foreground">AEGIS_NET</h1>
            <p className="text-xs text-muted-foreground tracking-widest">RESTRICTED ACCESS</p>
          </div>
        </div>

        <div className="bg-sidebar-accent/50 p-4 rounded-md border border-sidebar-border">
          <div className="flex items-center gap-3 mb-2">
            <Avatar className="h-8 w-8 rounded bg-primary/10 text-primary border border-primary/20">
              <AvatarFallback className="font-mono text-xs">
                {((user as any).discordUsername || user.username || "?").substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-sm font-mono font-bold truncate text-foreground">{(user as any).discordUsername || user.username || "Agent"}</p>
              <p className="text-[10px] uppercase tracking-wider text-primary font-bold flex items-center gap-1">
                <Lock size={8} />
                {user.role} LEVEL
              </p>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <Link href="/dashboard">
          <Button 
            variant={location === "/dashboard" ? "secondary" : "ghost"} 
            className="w-full justify-start gap-3 font-mono"
          >
            <LayoutDashboard size={18} />
            DASHBOARD
          </Button>
        </Link>
        
        {/* <Link href="/cases">
          <Button 
            variant={location.startsWith("/cases") ? "secondary" : "ghost"} 
            className="w-full justify-start gap-3 font-mono"
          >
            <FolderOpen size={18} />
            ALL CASES
          </Button>
        </Link> */}

        {(user.role === "Management" || user.role === "Overseer") && (
          <>
            <Link href="/admin">
              <Button 
                variant={location === "/admin" ? "secondary" : "ghost"} 
                className="w-full justify-start gap-3 font-mono"
              >
                <Users size={18} />
                ADMIN PANEL
              </Button>
            </Link>
            <Link href="/settings">
              <Button 
                variant={location === "/settings" ? "secondary" : "ghost"} 
                className="w-full justify-start gap-3 font-mono"
              >
                <Settings size={18} />
                SETTINGS
              </Button>
            </Link>
            <Link href="/recovery">
              <Button 
                variant={location === "/recovery" ? "secondary" : "ghost"} 
                className="w-full justify-start gap-3 font-mono"
              >
                <RotateCcw size={18} />
                RECOVERY
              </Button>
            </Link>
          </>
        )}

        {isSupportTeam && (
          <Link href="/support-panel">
            <Button 
              variant={location === "/support-panel" ? "secondary" : "ghost"} 
              className="w-full justify-start gap-3 font-mono text-amber-500 hover:text-amber-600"
            >
              <Zap size={18} />
              SUPPORT PANEL
            </Button>
          </Link>
        )}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 font-mono"
          onClick={() => logout()}
        >
          <LogOut size={18} />
          DISCONNECT
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 bg-sidebar border-r border-sidebar-border shrink-0">
        <NavContent />
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="bg-background border-sidebar-border">
              <Menu size={20} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-sidebar border-r border-sidebar-border">
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">
        {/* Scanline Effect */}
        <div className="scanline pointer-events-none fixed inset-0 z-50 opacity-[0.03]" />
        
        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
