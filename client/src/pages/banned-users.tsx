import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface BannedUser {
  id: string;
  userId: string;
  serverId: string;
  reason: string;
  bannedAt: string;
  serverName?: string;
  linkedFrom?: string;
}

export default function BannedUsers() {
  const { user, serverId } = useAuth();
  const [, setLocation] = useLocation();
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [banUserId, setBanUserId] = useState("");
  const [banReason, setBanReason] = useState("");
  const [selectedServer, setSelectedServer] = useState<string>("main");

  useEffect(() => {
    if (!user || user.role !== "Management" && user.role !== "Overseer") {
      setLocation("/dashboard");
      return;
    }
    fetchBannedUsers();
  }, [user, serverId]);

  const fetchBannedUsers = async () => {
    try {
      const response = await fetch("/api/moderation/banned-users", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch banned users");
      const data = await response.json();
      setBannedUsers(data.bans || []);
    } catch (error) {
      console.error("Error fetching banned users:", error);
      toast.error("Failed to load banned users");
    } finally {
      setLoading(false);
    }
  };

  const handleUnban = async (userId: string, banServerId: string) => {
    try {
      const response = await fetch("/api/moderation/unban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, serverId: banServerId }),
      });
      if (!response.ok) throw new Error("Failed to unban user");
      toast.success("User unbanned successfully");
      fetchBannedUsers();
    } catch (error) {
      console.error("Error unbanning user:", error);
      toast.error("Failed to unban user");
    }
  };

  const handleManualBan = async () => {
    if (!banUserId || !banReason) {
      toast.error("Please fill in all fields");
      return;
    }
    try {
      const response = await fetch("/api/moderation/manual-ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: banUserId,
          reason: banReason,
          targetServer: selectedServer,
        }),
      });
      if (!response.ok) throw new Error("Failed to ban user");
      toast.success("User banned successfully");
      setBanUserId("");
      setBanReason("");
      fetchBannedUsers();
    } catch (error) {
      console.error("Error banning user:", error);
      toast.error("Failed to ban user");
    }
  };

  if (!user || (user.role !== "Management" && user.role !== "Overseer")) {
    return <div className="p-6 text-center">Access denied. This feature is not enabled.</div>;
  }

  return (
    <div className="space-y-6 p-6" data-testid="banned-users-page">
      <div>
        <h1 className="text-3xl font-bold">Banned Users Management</h1>
        <p className="text-gray-400 mt-2">View and manage banned users across linked servers</p>
      </div>

      {/* Manual Ban Section */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Manually Ban User</h2>
        <div className="space-y-4">
          <Input
            placeholder="Discord User ID"
            value={banUserId}
            onChange={(e) => setBanUserId(e.target.value)}
            data-testid="input-userid"
          />
          <Input
            placeholder="Ban Reason"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            data-testid="input-reason"
          />
          <div>
            <label className="block text-sm font-medium mb-2">Target Server:</label>
            <select
              value={selectedServer}
              onChange={(e) => setSelectedServer(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded"
              data-testid="select-server"
            >
              <option value="main">Main Server</option>
              <option value="children">All Child Servers</option>
            </select>
          </div>
          <Button onClick={handleManualBan} data-testid="button-ban">
            Ban User
          </Button>
        </div>
      </Card>

      {/* Banned Users List */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Banned Users</h2>
        {loading ? (
          <div className="text-center text-gray-400">Loading banned users...</div>
        ) : bannedUsers.length === 0 ? (
          <div className="text-center text-gray-400">No banned users found</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {bannedUsers.map((ban) => (
              <div key={ban.id} className="flex justify-between items-center p-3 bg-gray-800 rounded" data-testid={`ban-entry-${ban.userId}`}>
                <div className="flex-1">
                  <div className="font-mono text-sm">ID: {ban.userId}</div>
                  <div className="text-sm text-gray-400">{ban.reason}</div>
                  {ban.linkedFrom && <div className="text-xs text-yellow-400">Cascaded from main server</div>}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleUnban(ban.userId, ban.serverId)}
                  data-testid={`button-unban-${ban.userId}`}
                >
                  Unban
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
