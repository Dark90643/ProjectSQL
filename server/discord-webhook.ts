// Discord Webhook Integration
import { storage } from "./storage";
import { discordClient } from "./discord-bot";

export async function sendCaseDiscordEmbed(caseData: {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedAgent: string;
  content: string;
  tags: string[];
  isPublic: boolean;
  googleDocUrl?: string | null;
  caseCode?: string | null;
  createdAt: Date;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  console.log("Discord webhook URL:", webhookUrl ? "SET" : "NOT SET");
  
  if (!webhookUrl) {
    console.log("No webhook URL configured, skipping Discord notification");
    return;
  }

  try {
    console.log("Sending Discord webhook for case:", caseData.id);
    const embed = {
      title: `📋 New Case Released: ${caseData.title}`,
      description: caseData.description,
      color: caseData.priority === "Critical" ? 0xFF0000 : 
             caseData.priority === "High" ? 0xFF9900 :
             caseData.priority === "Medium" ? 0xFFCC00 : 0x00CC00,
      fields: [
        {
          name: "Case ID",
          value: caseData.id,
          inline: true,
        },
        {
          name: "Status",
          value: caseData.status,
          inline: true,
        },
        {
          name: "Priority Level",
          value: caseData.priority,
          inline: true,
        },
        {
          name: "Assigned Agent",
          value: caseData.assignedAgent,
          inline: true,
        },
        {
          name: "Classification",
          value: caseData.isPublic ? "PUBLIC" : "PRIVATE",
          inline: true,
        },
        {
          name: "Encryption Code",
          value: caseData.caseCode || "Not encrypted",
          inline: true,
        },
        {
          name: "Tags",
          value: caseData.tags.length > 0 ? caseData.tags.join(", ") : "None",
          inline: false,
        },
        {
          name: "Content Preview",
          value: caseData.content.substring(0, 200) + (caseData.content.length > 200 ? "..." : ""),
          inline: false,
        },
        ...(caseData.googleDocUrl ? [{
          name: "Google Docs Link",
          value: `[View Document](${caseData.googleDocUrl})`,
          inline: false,
        }] : []),
      ],
      footer: {
        text: "AEGIS_NET Case Management System",
      },
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    
    if (!response.ok) {
      console.error("Discord webhook failed:", response.status, response.statusText);
      const text = await response.text();
      console.error("Discord response:", text);
    } else {
      console.log("Discord webhook sent successfully");
    }
  } catch (error) {
    console.error("Discord webhook error:", error);
  }
}

// Discord Webhook for Public Cases
export async function sendCasePublicDiscordEmbed(caseData: {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignedAgent: string;
  content: string;
  tags: string[];
  isPublic: boolean;
  googleDocUrl?: string | null;
  caseCode?: string | null;
  createdAt: Date;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL_PUBLIC;
  console.log("Public case Discord webhook URL:", webhookUrl ? "SET" : "NOT SET");
  
  if (!webhookUrl) {
    console.log("No public webhook URL configured, skipping public case notification");
    return;
  }

  try {
    console.log("Sending public case Discord webhook for case:", caseData.id);
    const embed = {
      title: `🌐 Case Made Public: ${caseData.title}`,
      description: caseData.description,
      color: 0x0099FF, // Blue for public announcements
      fields: [
        {
          name: "Case ID",
          value: caseData.id,
          inline: true,
        },
        {
          name: "Status",
          value: caseData.status,
          inline: true,
        },
        {
          name: "Priority Level",
          value: caseData.priority,
          inline: true,
        },
        {
          name: "Assigned Agent",
          value: caseData.assignedAgent,
          inline: true,
        },
        {
          name: "Classification",
          value: "PUBLIC 🔓",
          inline: true,
        },
        {
          name: "Encryption Code",
          value: caseData.caseCode || "Not encrypted",
          inline: true,
        },
        {
          name: "Tags",
          value: caseData.tags.length > 0 ? caseData.tags.join(", ") : "None",
          inline: false,
        },
        {
          name: "Content Preview",
          value: caseData.content.substring(0, 200) + (caseData.content.length > 200 ? "..." : ""),
          inline: false,
        },
        ...(caseData.googleDocUrl ? [{
          name: "Google Docs Link",
          value: `[View Document](${caseData.googleDocUrl})`,
          inline: false,
        }] : []),
      ],
      footer: {
        text: "AEGIS_NET Case Management System - Now Public",
      },
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    
    if (!response.ok) {
      console.error("Public case Discord webhook failed:", response.status, response.statusText);
      const text = await response.text();
      console.error("Discord response:", text);
    } else {
      console.log("Public case Discord webhook sent successfully");
    }
  } catch (error) {
    console.error("Public case Discord webhook error:", error);
  }
}

// Discord Webhook for Audit Trail Logs
export async function sendAuditTrailDiscordEmbed(logData: {
  id: string;
  action: string;
  userId?: string | null;
  targetId?: string | null;
  details: string;
  timestamp: Date;
}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL_AUDIT;
  
  if (!webhookUrl) {
    return; // Silently ignore if no webhook configured
  }

  try {
    // Format action name nicely
    const actionLabel = logData.action
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');

    const embed = {
      title: `🔍 ${actionLabel}`,
      description: logData.details || "Action performed",
      color: getAuditColorForAction(logData.action),
      fields: [
        {
          name: "Log ID",
          value: logData.id,
          inline: true,
        },
        {
          name: "Action",
          value: logData.action,
          inline: true,
        },
        ...(logData.userId ? [{
          name: "User ID",
          value: logData.userId,
          inline: true,
        }] : []),
        ...(logData.targetId ? [{
          name: "Target ID",
          value: logData.targetId,
          inline: true,
        }] : []),
        {
          name: "Timestamp",
          value: new Date(logData.timestamp).toISOString(),
          inline: false,
        },
      ],
      footer: {
        text: "AEGIS_NET Audit Trail",
      },
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    
    if (!response.ok) {
      console.error("Audit trail Discord webhook failed:", response.status);
    }
  } catch (error) {
    console.error("Audit trail Discord webhook error:", error);
  }
}

// Helper function to get color based on action type
function getAuditColorForAction(action: string): number {
  if (action.includes("DELETE")) return 0xFF0000; // Red for deletions
  if (action.includes("CREATE")) return 0x00FF00; // Green for creations
  if (action.includes("UPDATE") || action.includes("EDIT")) return 0x0099FF; // Blue for updates
  if (action.includes("SUSPEND")) return 0xFF9900; // Orange for suspensions
  if (action.includes("PUBLIC") || action.includes("DECRYPT")) return 0xFFCC00; // Yellow for public/decrypt
  if (action.includes("ENCRYPT")) return 0x9900FF; // Purple for encryption
  return 0x808080; // Gray for others
}

// New functions for bot channel messaging (not webhook URLs)
export async function sendBotCasePostMessage(caseData: {
  id: string;
  title: string;
  description: string;
  priority: string;
  serverId?: string | null;
}): Promise<void> {
  if (!caseData.serverId) return;
  
  try {
    const config = await storage.getWebhookConfig(caseData.serverId);
    if (!config?.casePostEnabled || !config.casePostChannelId) {
      return;
    }

    const channel = await discordClient.channels.fetch(config.casePostChannelId);
    if (!channel || !channel.isTextBased()) {
      console.warn("Cannot send message to channel:", config.casePostChannelId);
      return;
    }

    const embed = {
      title: `📋 New Case: ${caseData.title}`,
      description: caseData.description,
      color: caseData.priority === "Critical" ? 0xFF0000 : 
             caseData.priority === "High" ? 0xFF9900 :
             caseData.priority === "Medium" ? 0xFFCC00 : 0x00CC00,
      fields: [
        { name: "Case ID", value: caseData.id, inline: true },
        { name: "Priority", value: caseData.priority, inline: true },
      ],
      footer: { text: "AEGIS_NET Case Management" },
      timestamp: new Date().toISOString(),
    };

    await channel.send({ embeds: [embed] });
    console.log("✓ Case post message sent to channel:", config.casePostChannelId);
  } catch (error) {
    console.error("Failed to send case post message:", error);
  }
}

export async function sendBotCaseReleaseMessage(caseData: {
  id: string;
  title: string;
  description: string;
  priority: string;
  serverId?: string | null;
}): Promise<void> {
  if (!caseData.serverId) return;
  
  try {
    const config = await storage.getWebhookConfig(caseData.serverId);
    if (!config?.caseReleaseEnabled || !config.caseReleaseChannelId) {
      return;
    }

    const channel = await discordClient.channels.fetch(config.caseReleaseChannelId);
    if (!channel || !channel.isTextBased()) {
      console.warn("Cannot send message to channel:", config.caseReleaseChannelId);
      return;
    }

    const embed = {
      title: `🔓 Case Released: ${caseData.title}`,
      description: caseData.description,
      color: 0x00FF00,
      fields: [
        { name: "Case ID", value: caseData.id, inline: true },
        { name: "Priority", value: caseData.priority, inline: true },
      ],
      footer: { text: "AEGIS_NET Case Management" },
      timestamp: new Date().toISOString(),
    };

    await channel.send({ embeds: [embed] });
    console.log("✓ Case release message sent to channel:", config.caseReleaseChannelId);
  } catch (error) {
    console.error("Failed to send case release message:", error);
  }
}

export async function sendBotAuditTrailMessage(logData: {
  action: string;
  userId: string;
  targetId?: string;
  details: string;
  serverId?: string | null;
}): Promise<void> {
  if (!logData.serverId) return;
  
  try {
    const config = await storage.getWebhookConfig(logData.serverId);
    if (!config?.auditTrailEnabled || !config.auditTrailChannelId) {
      return;
    }

    const channel = await discordClient.channels.fetch(config.auditTrailChannelId);
    if (!channel || !channel.isTextBased()) {
      console.warn("Cannot send message to channel:", config.auditTrailChannelId);
      return;
    }

    const embed = {
      title: `📝 ${logData.action}`,
      description: logData.details,
      color: getAuditColorForAction(logData.action),
      fields: [
        { name: "User", value: logData.userId, inline: true },
        { name: "Target", value: logData.targetId || "N/A", inline: true },
      ],
      footer: { text: "AEGIS_NET Audit Trail" },
      timestamp: new Date().toISOString(),
    };

    await channel.send({ embeds: [embed] });
    console.log("✓ Audit trail message sent to channel:", config.auditTrailChannelId);
  } catch (error) {
    console.error("Failed to send audit trail message:", error);
  }
}
