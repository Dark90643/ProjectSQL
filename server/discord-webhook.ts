// Discord Webhook Integration
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
