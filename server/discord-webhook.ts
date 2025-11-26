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
  moderatorId: string;
  moderatorName: string;
  serverId: string;
  isCascaded?: boolean;
  mainServerName?: string;
}): Promise<void> {
  if (!banData.serverId) return;
  
  try {
    const config = await storage.getWebhookConfig(banData.serverId);
    
    // Determine which channel to use
    let channelId: string | null = null;
    if (banData.isCascaded && config?.childServerBanEnabled && config?.childServerBanChannelId) {
      channelId = config.childServerBanChannelId;
    } else if (!banData.isCascaded && config?.banLogsEnabled && config?.banLogsChannelId) {
      channelId = config.banLogsChannelId;
    }
    
    if (!channelId) return;

    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.warn("Cannot send message to channel:", channelId);
      return;
    }

    const durationDisplay = banData.duration === "permanent" ? "Permanent" : banData.duration;
    const title = banData.isCascaded ? `🔗 Cascaded Ban: ${banData.userName}` : `🚫 User Banned: ${banData.userName}`;
    
    const embed = {
      title,
      description: `${banData.userName} has been banned from the server`,
      color: banData.isCascaded ? 0xFFA500 : 0xFF0000,
      fields: [
        { name: "User ID", value: banData.userId, inline: true },
        { name: "Duration", value: durationDisplay, inline: true },
        { name: "Moderator", value: banData.moderatorName, inline: true },
        { name: "Reason", value: banData.reason, inline: false },
        ...(banData.isCascaded && banData.mainServerName ? [
          { name: "Cascaded from", value: banData.mainServerName, inline: false }
        ] : []),
      ],
      footer: { text: "AEGIS_NET Ban Log" },
      timestamp: new Date().toISOString(),
    };

    await channel.send({ embeds: [embed] });
    console.log("✓ Ban log message sent to channel:", channelId);
  } catch (error) {
    console.error("Failed to send ban log message:", error);
  }
}
