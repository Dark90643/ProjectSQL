// Discord Bot Integration
import { storage } from "./storage";
import { discordClient } from "./discord-bot";

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
  status?: string;
  assignedAgent?: string;
  content?: string;
  tags?: string[];
  caseCode?: string | null;
  googleDocUrl?: string | null;
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
        ...(caseData.status ? [{ name: "Status", value: caseData.status, inline: true }] : []),
        ...(caseData.assignedAgent ? [{ name: "Assigned Agent", value: caseData.assignedAgent, inline: true }] : []),
        { name: "Classification", value: "PUBLIC 🔓", inline: true },
        ...(caseData.caseCode ? [{ name: "Encryption Code", value: caseData.caseCode, inline: true }] : []),
        ...(caseData.tags && caseData.tags.length > 0 ? [{ name: "Tags", value: caseData.tags.join(", "), inline: false }] : []),
        ...(caseData.content ? [{
          name: "Content",
          value: caseData.content.substring(0, 1024) + (caseData.content.length > 1024 ? "..." : ""),
          inline: false,
        }] : []),
        ...(caseData.googleDocUrl ? [{
          name: "Google Docs Link",
          value: `[View Document](${caseData.googleDocUrl})`,
          inline: false,
        }] : []),
      ],
      footer: { text: "AEGIS_NET Case Management - Now Public" },
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

export async function sendBotBanMessage(banData: {
  userId: string;
  userName: string;
  reason: string;
  duration: string;
  moderatorId?: string;
  moderatorName?: string;
  serverId: string;
  childServerBans?: string[];
}): Promise<void> {
  // Always send to main server ban log, never to child server channels
  if (!banData.serverId) return;
  
  try {
    // Get the main server to send the ban message to
    let mainServerId = banData.serverId;
    const linkedServers = await storage.getLinkedServers(banData.serverId);
    const mainLink = linkedServers.find(link => link.childServerId === banData.serverId);
    if (mainLink) {
      mainServerId = mainLink.mainServerId;
    }
    
    const config = await storage.getWebhookConfig(mainServerId);
    if (!config?.banLogsEnabled || !config?.banLogsChannelId) return;

    const channel = await discordClient.channels.fetch(config.banLogsChannelId);
    if (!channel || !channel.isTextBased()) {
      console.warn("Cannot send message to channel:", config.banLogsChannelId);
      return;
    }

    const durationDisplay = banData.duration === "permanent" ? "Permanent" : banData.duration;
    
    const fields: any[] = [
      { name: "User ID", value: banData.userId, inline: true },
      { name: "Duration", value: durationDisplay, inline: true },
    ];
    
    if (banData.moderatorName) {
      fields.push({ name: "Moderator", value: banData.moderatorName, inline: true });
    }
    
    fields.push({ name: "Reason", value: banData.reason, inline: false });
    
    // Add child server bans info if this is a cascaded ban
    if (banData.childServerBans && banData.childServerBans.length > 0) {
      fields.push({ 
        name: "Banned in Child Servers", 
        value: banData.childServerBans.join("\n"), 
        inline: false 
      });
    }
    
    const embed = {
      title: `🚫 User Banned: ${banData.userName}`,
      description: `${banData.userName} has been banned`,
      color: 0xFF0000,
      fields,
      footer: { text: "AEGIS_NET Ban Log" },
      timestamp: new Date().toISOString(),
    };

    await channel.send({ embeds: [embed] });
    console.log("✓ Ban log message sent to main server channel:", config.banLogsChannelId);
  } catch (error) {
    console.error("Failed to send ban log message:", error);
  }
}
