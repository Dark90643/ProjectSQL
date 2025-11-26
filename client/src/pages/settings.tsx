import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Settings, Webhook } from "lucide-react";

interface WebhookConfig {
  auditTrailChannelId: string | null;
  auditTrailEnabled: boolean;
  casePostChannelId: string | null;
  casePostEnabled: boolean;
  caseReleaseChannelId: string | null;
  caseReleaseEnabled: boolean;
  banLogsChannelId: string | null;
  banLogsEnabled: boolean;
  childServerBanChannelId: string | null;
  childServerBanEnabled: boolean;
  childServerBanServerId?: string | null;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState<any[]>([]);
  const [linkedServers, setLinkedServers] = useState<any[]>([]);
  const [serverChannelsMap, setServerChannelsMap] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!user) return;
    loadWebhookConfig();
    loadChannels();
    loadLinkedServers();
  }, [user]);

  useEffect(() => {
    // Load channels for all linked servers
    linkedServers.forEach(server => {
      if (!serverChannelsMap[server.id]) {
        loadChannelsForServer(server.id);
      }
    });
  }, [linkedServers]);

  const loadWebhookConfig = async () => {
    try {
      const response = await fetch("/api/webhook/config", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load webhook config");
      const data = await response.json();
      setWebhookConfig(data);
    } catch (error: any) {
      console.error("Error loading webhook config:", error);
      setWebhookConfig({
        auditTrailChannelId: null,
        auditTrailEnabled: false,
        casePostChannelId: null,
        casePostEnabled: false,
        caseReleaseChannelId: null,
        caseReleaseEnabled: false,
        banLogsChannelId: null,
        banLogsEnabled: false,
        childServerBanChannelId: null,
        childServerBanEnabled: false,
      });
    }
  };

  const loadChannels = async () => {
    try {
      const response = await fetch("/api/webhook/channels", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load channels");
      const data = await response.json();
      setChannels(data.channels || []);
    } catch (error: any) {
      console.error("Error loading channels:", error);
    }
  };

  const loadLinkedServers = async () => {
    try {
      const response = await fetch("/api/webhook/linked-servers", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load linked servers");
      const data = await response.json();
      setLinkedServers(data.servers || []);
    } catch (error: any) {
      console.error("Error loading linked servers:", error);
    }
  };

  const loadChannelsForServer = async (serverId: string) => {
    try {
      const response = await fetch(`/api/webhook/channels/${serverId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load channels");
      const data = await response.json();
      setServerChannelsMap(prev => ({
        ...prev,
        [serverId]: data.channels || []
      }));
    } catch (error: any) {
      console.error(`Error loading channels for server ${serverId}:`, error);
      setServerChannelsMap(prev => ({
        ...prev,
        [serverId]: []
      }));
    }
  };

  const updateWebhookConfig = async (updates: Partial<WebhookConfig>) => {
    if (!webhookConfig) return;
    setLoading(true);
    try {
      const response = await fetch("/api/webhook/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...webhookConfig, ...updates }),
      });
      if (!response.ok) throw new Error("Failed to update webhook config");
      const data = await response.json();
      setWebhookConfig(data);
      toast({ title: "Success", description: "Webhook configuration updated" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (!user || (user.role !== "Management" && user.role !== "Overseer")) {
    return (
      <div className="flex items-center justify-center h-full text-destructive font-mono">
        ACCESS DENIED - INSUFFICIENT PRIVILEGES
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold font-mono">SETTINGS</h1>
      </div>

      <Tabs defaultValue="webhooks" className="w-full">
        <TabsList className="grid w-full grid-cols-1 bg-black/40 border border-white/10">
          <TabsTrigger value="webhooks" className="font-mono data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
            <Webhook size={16} /> WEBHOOKS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="space-y-6">
          {webhookConfig && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Audit Trail Webhook */}
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="font-mono text-sm">AUDIT TRAIL</CardTitle>
                  <CardDescription className="font-mono text-xs">System action logs</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase text-muted-foreground">Status</label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={webhookConfig.auditTrailEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ auditTrailEnabled: true })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        ENABLED
                      </Button>
                      <Button
                        size="sm"
                        variant={!webhookConfig.auditTrailEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ auditTrailEnabled: false })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        DISABLED
                      </Button>
                    </div>
                  </div>
                  {webhookConfig.auditTrailEnabled && (
                    <div className="space-y-2">
                      <label className="font-mono text-xs uppercase text-muted-foreground">Channel</label>
                      <select
                        value={webhookConfig.auditTrailChannelId || ""}
                        onChange={(e) => updateWebhookConfig({ auditTrailChannelId: e.target.value || null })}
                        disabled={loading}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded font-mono text-sm text-white focus:border-primary/50 focus:outline-none"
                      >
                        <option value="">SELECT CHANNEL</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            # {ch.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Case Posts Webhook */}
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="font-mono text-sm">RECENT CASE POSTS</CardTitle>
                  <CardDescription className="font-mono text-xs">New case creations</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase text-muted-foreground">Status</label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={webhookConfig.casePostEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ casePostEnabled: true })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        ENABLED
                      </Button>
                      <Button
                        size="sm"
                        variant={!webhookConfig.casePostEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ casePostEnabled: false })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        DISABLED
                      </Button>
                    </div>
                  </div>
                  {webhookConfig.casePostEnabled && (
                    <div className="space-y-2">
                      <label className="font-mono text-xs uppercase text-muted-foreground">Channel</label>
                      <select
                        value={webhookConfig.casePostChannelId || ""}
                        onChange={(e) => updateWebhookConfig({ casePostChannelId: e.target.value || null })}
                        disabled={loading}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded font-mono text-sm text-white focus:border-primary/50 focus:outline-none"
                      >
                        <option value="">SELECT CHANNEL</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            # {ch.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Case Release Webhook */}
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="font-mono text-sm">CASE RELEASES</CardTitle>
                  <CardDescription className="font-mono text-xs">Public case releases</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase text-muted-foreground">Status</label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={webhookConfig.caseReleaseEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ caseReleaseEnabled: true })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        ENABLED
                      </Button>
                      <Button
                        size="sm"
                        variant={!webhookConfig.caseReleaseEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ caseReleaseEnabled: false })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        DISABLED
                      </Button>
                    </div>
                  </div>
                  {webhookConfig.caseReleaseEnabled && (
                    <div className="space-y-2">
                      <label className="font-mono text-xs uppercase text-muted-foreground">Channel</label>
                      <select
                        value={webhookConfig.caseReleaseChannelId || ""}
                        onChange={(e) => updateWebhookConfig({ caseReleaseChannelId: e.target.value || null })}
                        disabled={loading}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded font-mono text-sm text-white focus:border-primary/50 focus:outline-none"
                      >
                        <option value="">SELECT CHANNEL</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            # {ch.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Ban Logs Webhook */}
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="font-mono text-sm">BAN LOGS</CardTitle>
                  <CardDescription className="font-mono text-xs">Multi-server ban logs</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase text-muted-foreground">Status</label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={webhookConfig.banLogsEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ banLogsEnabled: true })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        ENABLED
                      </Button>
                      <Button
                        size="sm"
                        variant={!webhookConfig.banLogsEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ banLogsEnabled: false })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        DISABLED
                      </Button>
                    </div>
                  </div>
                  {webhookConfig.banLogsEnabled && (
                    <div className="space-y-2">
                      <label className="font-mono text-xs uppercase text-muted-foreground">Main Server Channel</label>
                      <select
                        value={webhookConfig.banLogsChannelId || ""}
                        onChange={(e) => updateWebhookConfig({ banLogsChannelId: e.target.value || null })}
                        disabled={loading}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded font-mono text-sm text-white focus:border-primary/50 focus:outline-none"
                      >
                        <option value="">SELECT CHANNEL</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            # {ch.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase text-muted-foreground">Child Server Ban Logs</label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={webhookConfig.childServerBanEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ childServerBanEnabled: true })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        ENABLED
                      </Button>
                      <Button
                        size="sm"
                        variant={!webhookConfig.childServerBanEnabled ? "default" : "outline"}
                        onClick={() => updateWebhookConfig({ childServerBanEnabled: false })}
                        disabled={loading}
                        className="flex-1 font-mono text-xs"
                      >
                        DISABLED
                      </Button>
                    </div>
                  </div>
                  {webhookConfig.childServerBanEnabled && linkedServers.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <label className="font-mono text-xs uppercase text-muted-foreground">Configure Channel for Each Child Server</label>
                      <div className="space-y-2">
                        {linkedServers.map((server) => {
                          const serverChannels = serverChannelsMap[server.id] || [];
                          const isCurrentServer = webhookConfig.childServerBanServerId === server.id;
                          const selectedChannel = isCurrentServer ? webhookConfig.childServerBanChannelId : null;
                          
                          return (
                            <div key={server.id} className="flex items-center gap-2 p-2 bg-black/20 rounded border border-white/5">
                              <span className="font-mono text-xs text-muted-foreground flex-1 truncate">{server.name}</span>
                              <select
                                value={selectedChannel || ""}
                                onChange={(e) => {
                                  if (e.target.value) {
                                    updateWebhookConfig({ 
                                      childServerBanServerId: server.id,
                                      childServerBanChannelId: e.target.value
                                    });
                                  }
                                }}
                                disabled={loading}
                                className="px-2 py-1 bg-black/40 border border-white/10 rounded font-mono text-xs text-white focus:border-primary/50 focus:outline-none flex-shrink-0"
                              >
                                <option value="">SELECT CHANNEL</option>
                                {serverChannels.length === 0 ? (
                                  <option value="" disabled>No channels</option>
                                ) : (
                                  serverChannels.map((ch) => (
                                    <option key={ch.id} value={ch.id}>
                                      # {ch.name}
                                    </option>
                                  ))
                                )}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
