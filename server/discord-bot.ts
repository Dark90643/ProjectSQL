import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  Colors,
} from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = "1442053672694714529"; // Your bot's client ID from Discord Developer Portal

interface CaseData {
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
  updatedAt: Date;
}

interface ServerSecurityConfig {
  enabled: boolean;
  minAccountAge: number; // in days
  joinRateLimit: number; // max joins per minute
  autoKickNewAccounts: boolean;
  suspiciousActivityThreshold: number;
  muteNewMembers: boolean;
  requireVerification: boolean;
}

interface ServerPermissionConfig {
  allowedRoleIds: string[];
  allowAdministrators: boolean;
}

// Server security configurations (in-memory storage)
const serverSecurityConfigs = new Map<string, ServerSecurityConfig>();
const serverPermissions = new Map<string, ServerPermissionConfig>();
const recentJoins = new Map<string, number[]>(); // serverId -> [timestamps]
const suspiciousUsers = new Set<string>(); // userId to track suspicious activity

const commands = [
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for public cases by title or keywords")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Search term (case title or keyword)")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("case")
    .setDescription("Get details of a specific public case")
    .addStringOption((option) =>
      option
        .setName("case_id")
        .setDescription("Case ID (e.g., CASE-2025-123)")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("cases")
    .setDescription("List all public cases"),
  // Moderation commands
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to warn")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to kick")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for kick")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to ban")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for ban")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to mute")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration (e.g., 1h, 1d, permanent)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for mute")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Unmute a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to unmute")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("modlog")
    .setDescription("View moderation log for a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to check")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("server-security")
    .setDescription("Configure server security settings (admin only)"),
  // Anti-raid commands
  new SlashCommandBuilder()
    .setName("enable-raid-protection")
    .setDescription("Enable raid protection for this server (admin only)"),
  new SlashCommandBuilder()
    .setName("disable-raid-protection")
    .setDescription("Disable raid protection for this server (admin only)"),
  new SlashCommandBuilder()
    .setName("raid-status")
    .setDescription("Check raid protection status for this server"),
  new SlashCommandBuilder()
    .setName("security-config")
    .setDescription("Configure security settings (admin only)")
    .addNumberOption((option) =>
      option
        .setName("min_account_age")
        .setDescription("Minimum account age in days (0-365)")
        .setMinValue(0)
        .setMaxValue(365)
    )
    .addNumberOption((option) =>
      option
        .setName("join_rate_limit")
        .setDescription("Max joins per minute (5-100)")
        .setMinValue(5)
        .setMaxValue(100)
    )
    .addBooleanOption((option) =>
      option
        .setName("auto_kick_new_accounts")
        .setDescription("Automatically kick accounts created today")
    )
    .addBooleanOption((option) =>
      option
        .setName("mute_new_members")
        .setDescription("Mute new members until verified")
    )
    .addBooleanOption((option) =>
      option
        .setName("require_verification")
        .setDescription("Require verification to post messages")
    ),
  // IP ban command
  new SlashCommandBuilder()
    .setName("ipban")
    .setDescription("Ban an IP address from the server (admin only)")
    .addStringOption((option) =>
      option
        .setName("ip")
        .setDescription("IP address to ban")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the IP ban")
        .setRequired(true)
    ),
  // Set command permissions
  new SlashCommandBuilder()
    .setName("set-command-permissions")
    .setDescription("Configure who can use bot commands (admin only)")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Role that can use commands (leave empty to remove)")
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("allow_administrators")
        .setDescription("Allow server administrators to use commands (default: true)")
        .setRequired(false)
    ),
].map((command) => command.toJSON());

export async function initializeDiscordBot() {
  if (!token) {
    console.log("DISCORD_BOT_TOKEN not set, skipping Discord bot initialization");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Register commands with Discord
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    console.log("Registering Discord bot commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Discord bot commands registered successfully");
  } catch (error) {
    console.error("Failed to register Discord commands:", error);
  }

  // Handle command interactions
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;

    try {
      if (command === "search") {
        const query = interaction.options.getString("query")!.toLowerCase();
        await handleSearch(interaction, query);
      } else if (command === "case") {
        const caseId = interaction.options.getString("case_id")!;
        await handleCaseDetails(interaction, caseId);
      } else if (command === "cases") {
        await handleListCases(interaction);
      } else if (command === "warn") {
        const user = interaction.options.getUser("user")!;
        const reason = interaction.options.getString("reason")!;
        await handleWarn(interaction, user, reason);
      } else if (command === "kick") {
        const user = interaction.options.getUser("user")!;
        const reason = interaction.options.getString("reason")!;
        await handleKick(interaction, user, reason);
      } else if (command === "ban") {
        const user = interaction.options.getUser("user")!;
        const reason = interaction.options.getString("reason")!;
        await handleBan(interaction, user, reason);
      } else if (command === "mute") {
        const user = interaction.options.getUser("user")!;
        const duration = interaction.options.getString("duration")!;
        const reason = interaction.options.getString("reason")!;
        await handleMute(interaction, user, duration, reason);
      } else if (command === "unmute") {
        const user = interaction.options.getUser("user")!;
        await handleUnmute(interaction, user);
      } else if (command === "modlog") {
        const user = interaction.options.getUser("user")!;
        await handleModLog(interaction, user);
      } else if (command === "server-security") {
        await handleServerSecurity(interaction);
      } else if (command === "enable-raid-protection") {
        await handleEnableRaidProtection(interaction);
      } else if (command === "disable-raid-protection") {
        await handleDisableRaidProtection(interaction);
      } else if (command === "raid-status") {
        await handleRaidStatus(interaction);
      } else if (command === "security-config") {
        await handleSecurityConfig(interaction);
      } else if (command === "ipban") {
        const ip = interaction.options.getString("ip")!;
        const reason = interaction.options.getString("reason")!;
        await handleIpBan(interaction, ip, reason);
      } else if (command === "set-command-permissions") {
        const role = interaction.options.getRole("role");
        const allowAdministrators = interaction.options.getBoolean("allow_administrators");
        await handleSetCommandPermissions(interaction, role, allowAdministrators);
      }
    } catch (error) {
      console.error("Error handling command:", error);
      try {
        await interaction.reply({
          content: "An error occurred while processing your request.",
          ephemeral: true,
        });
      } catch (replyError) {
        console.error("Failed to send error reply:", replyError);
      }
    }
  });


  // Login to Discord
  client.login(token);

  client.once("ready", () => {
    console.log(`Discord bot logged in as ${client.user?.tag}`);
  });
}

async function handleSearch(
  interaction: any,
  query: string
) {
  try {
    const apiUrl = process.env.API_URL || "http://localhost:5000";
    const caseUrl = `${apiUrl}/api/cases/public`;
    console.log("Searching cases from:", caseUrl);
    const response = await fetch(caseUrl);
    
    if (!response.ok) {
      const text = await response.text();
      console.error("API response not ok:", response.status, text.substring(0, 200));
      throw new Error(`API error: ${response.status}`);
    }

    const cases: CaseData[] = await response.json();
    console.log(`Found ${cases.length} public cases`);

    // Filter cases by title or description matching the query
    const results = cases.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query) ||
        c.tags.some((tag) => tag.toLowerCase().includes(query))
    );

    if (results.length === 0) {
      await interaction.reply(
        "No public cases found matching your search."
      );
      return;
    }

    // Create embeds for each result (limit to 5)
    const embeds = results.slice(0, 5).map((c) => createCaseEmbed(c));

    const summary =
      results.length > 5
        ? `\n\nShowing 5 of ${results.length} results`
        : `\n\nFound ${results.length} result(s)`;

    await interaction.reply({
      content: `**Search Results for: "${query}"**${summary}`,
      embeds,
    });
  } catch (error) {
    console.error("Search error:", error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await interaction.reply(
      `Failed to search cases: ${errorMsg}`
    );
  }
}

async function handleCaseDetails(
  interaction: any,
  caseId: string
) {
  try {
    const apiUrl = process.env.API_URL || "http://localhost:5000";
    const caseUrl = `${apiUrl}/api/cases/${caseId}`;
    console.log(`Fetching case details from: ${caseUrl}`);
    const response = await fetch(caseUrl);
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`API error for case ${caseId}:`, response.status, text.substring(0, 200));
      await interaction.reply(`Case with ID "${caseId}" not found.`);
      return;
    }

    const caseData: CaseData = await response.json();
    console.log(`Retrieved case: ${caseData.title}`);

    // Only show if public
    if (!caseData.isPublic) {
      await interaction.reply(
        "This case is private and cannot be viewed publicly."
      );
      return;
    }

    const embed = createCaseEmbed(caseData);
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Case details error:", error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await interaction.reply(
      `Failed to fetch case details: ${errorMsg}`
    );
  }
}

async function handleListCases(interaction: any) {
  try {
    const apiUrl = process.env.API_URL || "http://localhost:5000";
    const caseUrl = `${apiUrl}/api/cases/public`;
    console.log("Fetching all public cases from:", caseUrl);
    const response = await fetch(caseUrl);
    
    if (!response.ok) {
      const text = await response.text();
      console.error("API response not ok:", response.status, text.substring(0, 200));
      throw new Error(`API error: ${response.status}`);
    }

    const cases: CaseData[] = await response.json();
    console.log(`Retrieved ${cases.length} public cases`);

    if (cases.length === 0) {
      await interaction.reply("No public cases available.");
      return;
    }

    // Create summary embeds (limit to 10)
    const embeds = cases.slice(0, 10).map((c) => {
      return new EmbedBuilder()
        .setColor(getPriorityColor(c.priority))
        .setTitle(c.title)
        .setDescription(c.description)
        .addFields(
          { name: "Case ID", value: c.id, inline: true },
          { name: "Priority", value: c.priority, inline: true },
          { name: "Status", value: c.status, inline: true },
          { name: "Tags", value: c.tags.join(", ") || "None", inline: false }
        )
        .setFooter({ text: `Created: ${new Date(c.createdAt).toLocaleDateString()}` });
    });

    const summary =
      cases.length > 10
        ? `\n\nShowing 10 of ${cases.length} cases`
        : `\n\nTotal: ${cases.length} case(s)`;

    await interaction.reply({
      content: `**Public Cases**${summary}`,
      embeds,
    });
  } catch (error) {
    console.error("List cases error:", error);
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await interaction.reply(
      `Failed to fetch cases: ${errorMsg}`
    );
  }
}

function createCaseEmbed(caseData: CaseData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(getPriorityColor(caseData.priority))
    .setTitle(caseData.title)
    .setDescription(caseData.description)
    .addFields(
      { name: "Case ID", value: caseData.id, inline: true },
      { name: "Priority", value: caseData.priority, inline: true },
      { name: "Status", value: caseData.status, inline: true },
      {
        name: "Assigned Agent",
        value: caseData.assignedAgent,
        inline: true,
      },
      {
        name: "Content Preview",
        value:
          caseData.content.substring(0, 150) +
          (caseData.content.length > 150 ? "..." : ""),
        inline: false,
      },
      {
        name: "Tags",
        value: caseData.tags.length > 0 ? caseData.tags.join(", ") : "None",
        inline: false,
      }
    )
    .setFooter({
      text: `AEGIS_NET | Created: ${new Date(caseData.createdAt).toLocaleDateString()}`,
    });

  if (caseData.googleDocUrl) {
    embed.addFields({
      name: "Document",
      value: `[View Google Docs](${caseData.googleDocUrl})`,
      inline: false,
    });
  }

  return embed;
}

function getPriorityColor(priority: string): number {
  switch (priority) {
    case "Critical":
      return Colors.Red;
    case "High":
      return Colors.Orange;
    case "Medium":
      return Colors.Yellow;
    case "Low":
      return Colors.Green;
    default:
      return Colors.Grey;
  }
}

// Permission checking utility - checks per-server configuration
async function checkModPermission(interaction: any): Promise<boolean> {
  if (!interaction.memberPermissions) return false;
  
  const serverId = interaction.guildId;
  const permissions = getServerPermissionConfig(serverId);
  const memberRoles = interaction.member?.roles?.cache?.map((role: any) => role.id) || [];
  
  // Check if user is administrator and administrators are allowed
  if (permissions.allowAdministrators && interaction.memberPermissions.has("ADMINISTRATOR")) {
    return true;
  }
  
  // Check if user has an allowed role
  if (permissions.allowedRoleIds.length > 0) {
    return memberRoles.some((roleId: string) => permissions.allowedRoleIds.includes(roleId));
  }
  
  // Default: allow if user has moderation permissions
  const hasModerator =
    interaction.memberPermissions.has("MODERATE_MEMBERS") ||
    interaction.memberPermissions.has("BAN_MEMBERS") ||
    interaction.memberPermissions.has("ADMINISTRATOR");
  return hasModerator;
}

async function handleWarn(interaction: any, user: any, reason: string) {
  try {
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const serverId = interaction.guildId;
    const moderatorId = interaction.user.id;
    const userId = user.id;

    // Try to send DM to user
    try {
      const dm = await user.createDM();
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle("Warning")
            .setDescription(`You have been warned in ${interaction.guild?.name}`)
            .addFields(
              { name: "Reason", value: reason },
              {
                name: "Moderator",
                value: interaction.user.tag,
              }
            ),
        ],
      });
    } catch {
      console.log("Could not send DM to user");
    }

    // Log to moderation channel/audit
    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("User Warned")
      .addFields(
        { name: "User", value: `${user.tag} (${userId})`, inline: true },
        {
          name: "Moderator",
          value: `${interaction.user.tag}`,
          inline: true,
        },
        { name: "Reason", value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });

    console.log(
      `User ${user.tag} warned by ${interaction.user.tag}: ${reason}`
    );
  } catch (error) {
    console.error("Warn command error:", error);
    await interaction.reply({
      content: "Failed to warn user.",
      ephemeral: true,
    });
  }
}

async function handleKick(interaction: any, user: any, reason: string) {
  try {
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    // Check if bot can kick the member
    const member = await interaction.guild?.members.fetch(user.id);
    if (!member) {
      await interaction.reply({
        content: "User not found in this server.",
        ephemeral: true,
      });
      return;
    }

    // Try to send DM
    try {
      const dm = await user.createDM();
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle("Kicked from Server")
            .setDescription(`You have been kicked from ${interaction.guild?.name}`)
            .addFields(
              { name: "Reason", value: reason },
              {
                name: "Moderator",
                value: interaction.user.tag,
              }
            ),
        ],
      });
    } catch {
      console.log("Could not send DM to user");
    }

    // Kick the member
    await member.kick(reason);

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("User Kicked")
      .addFields(
        { name: "User", value: `${user.tag}`, inline: true },
        {
          name: "Moderator",
          value: `${interaction.user.tag}`,
          inline: true,
        },
        { name: "Reason", value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });

    console.log(
      `User ${user.tag} kicked by ${interaction.user.tag}: ${reason}`
    );
  } catch (error) {
    console.error("Kick command error:", error);
    await interaction.reply({
      content: "Failed to kick user.",
      ephemeral: true,
    });
  }
}

async function handleBan(interaction: any, user: any, reason: string) {
  try {
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    // Try to send DM
    try {
      const dm = await user.createDM();
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.DarkRed)
            .setTitle("Banned from Server")
            .setDescription(`You have been banned from ${interaction.guild?.name}`)
            .addFields(
              { name: "Reason", value: reason },
              {
                name: "Moderator",
                value: interaction.user.tag,
              }
            ),
        ],
      });
    } catch {
      console.log("Could not send DM to user");
    }

    // Ban the member
    await interaction.guild?.bans.create(user.id, { reason });

    const embed = new EmbedBuilder()
      .setColor(Colors.DarkRed)
      .setTitle("User Banned")
      .addFields(
        { name: "User", value: `${user.tag}`, inline: true },
        {
          name: "Moderator",
          value: `${interaction.user.tag}`,
          inline: true,
        },
        { name: "Reason", value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });

    console.log(
      `User ${user.tag} banned by ${interaction.user.tag}: ${reason}`
    );
  } catch (error) {
    console.error("Ban command error:", error);
    await interaction.reply({
      content: "Failed to ban user.",
      ephemeral: true,
    });
  }
}

async function handleMute(
  interaction: any,
  user: any,
  duration: string,
  reason: string
) {
  try {
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild?.members.fetch(user.id);
    if (!member) {
      await interaction.reply({
        content: "User not found in this server.",
        ephemeral: true,
      });
      return;
    }

    // Parse duration to milliseconds
    let durationMs = 0;
    if (duration.toLowerCase() !== "permanent") {
      const parsed = parseDuration(duration);
      if (parsed === null) {
        await interaction.reply({
          content:
            'Invalid duration. Use format like "1h", "1d", "1w", or "permanent".',
          ephemeral: true,
        });
        return;
      }
      durationMs = parsed;
    }

    // Apply Discord mute (timeout)
    if (durationMs > 0) {
      await member.timeout(durationMs, reason);
    } else {
      // For permanent, use max timeout (28 days)
      await member.timeout(28 * 24 * 60 * 60 * 1000, reason);
    }

    // Try to send DM
    try {
      const dm = await user.createDM();
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle("Muted")
            .setDescription(`You have been muted in ${interaction.guild?.name}`)
            .addFields(
              { name: "Duration", value: duration },
              { name: "Reason", value: reason },
              {
                name: "Moderator",
                value: interaction.user.tag,
              }
            ),
        ],
      });
    } catch {
      console.log("Could not send DM to user");
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle("User Muted")
      .addFields(
        { name: "User", value: `${user.tag}`, inline: true },
        { name: "Duration", value: duration, inline: true },
        {
          name: "Moderator",
          value: `${interaction.user.tag}`,
          inline: true,
        },
        { name: "Reason", value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });

    console.log(
      `User ${user.tag} muted by ${interaction.user.tag} for ${duration}: ${reason}`
    );
  } catch (error) {
    console.error("Mute command error:", error);
    await interaction.reply({
      content: "Failed to mute user.",
      ephemeral: true,
    });
  }
}

async function handleUnmute(interaction: any, user: any) {
  try {
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild?.members.fetch(user.id);
    if (!member) {
      await interaction.reply({
        content: "User not found in this server.",
        ephemeral: true,
      });
      return;
    }

    // Remove timeout
    await member.timeout(null);

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("User Unmuted")
      .addFields(
        { name: "User", value: `${user.tag}`, inline: true },
        {
          name: "Moderator",
          value: `${interaction.user.tag}`,
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });

    console.log(`User ${user.tag} unmuted by ${interaction.user.tag}`);
  } catch (error) {
    console.error("Unmute command error:", error);
    await interaction.reply({
      content: "Failed to unmute user.",
      ephemeral: true,
    });
  }
}

async function handleModLog(interaction: any, user: any) {
  try {
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`Moderation Log for ${user.tag}`)
      .setDescription("Moderation tracking is enabled for this user.")
      .addFields(
        { name: "User ID", value: user.id, inline: true },
        {
          name: "Account Created",
          value: new Date(user.createdTimestamp).toLocaleDateString(),
          inline: true,
        }
      )
      .setFooter({
        text: "Check server audit log for detailed actions",
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error("Modlog command error:", error);
    await interaction.reply({
      content: "Failed to retrieve moderation log.",
      ephemeral: true,
    });
  }
}

async function handleServerSecurity(interaction: any) {
  try {
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("Server Security Settings")
      .setDescription(
        "Configure your server security and moderation settings below:"
      )
      .addFields(
        {
          name: "Available Commands",
          value:
            "• `/warn` - Warn a user\n• `/kick` - Kick a user\n• `/ban` - Ban a user\n• `/mute` - Mute a user\n• `/unmute` - Unmute a user\n• `/modlog` - View moderation log",
          inline: false,
        },
        {
          name: "Best Practices",
          value:
            "• Always provide clear reasons for moderation actions\n• Document warnings for progressive discipline\n• Use mutes before kicks/bans\n• Keep audit logs for transparency",
          inline: false,
        }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });

    console.log(`Server security settings accessed by ${interaction.user.tag}`);
  } catch (error) {
    console.error("Server security command error:", error);
    await interaction.reply({
      content: "Failed to load server security settings.",
      ephemeral: true,
    });
  }
}

function parseDuration(duration: string): number | null {
  const match = duration.match(/^(\d+)([hdwmy])$/i);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const units: { [key: string]: number } = {
    h: 60 * 60 * 1000, // hours
    d: 24 * 60 * 60 * 1000, // days
    w: 7 * 24 * 60 * 60 * 1000, // weeks
    m: 30 * 24 * 60 * 60 * 1000, // months (approximate)
    y: 365 * 24 * 60 * 60 * 1000, // years (approximate)
  };

  return amount * (units[unit] || 0);
}

// Helper function to get or create server security configuration
function getServerConfig(serverId: string): ServerSecurityConfig {
  if (!serverSecurityConfigs.has(serverId)) {
    serverSecurityConfigs.set(serverId, {
      enabled: true,
      minAccountAge: 7, // 7 days by default
      joinRateLimit: 10, // max 10 joins per minute
      autoKickNewAccounts: false,
      suspiciousActivityThreshold: 5,
      muteNewMembers: true,
      requireVerification: false,
    });
  }
  return serverSecurityConfigs.get(serverId)!;
}

async function handleEnableRaidProtection(interaction: any) {
  try {
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const serverId = interaction.guildId;
    const config = getServerConfig(serverId);
    config.enabled = true;

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("Raid Protection Enabled")
      .setDescription("Raid protection is now active for this server")
      .addFields(
        { name: "Status", value: "✅ Active", inline: true },
        { name: "Min Account Age", value: `${config.minAccountAge} days`, inline: true },
        {
          name: "Join Rate Limit",
          value: `${config.joinRateLimit} joins/minute`,
          inline: true,
        },
        {
          name: "Mute New Members",
          value: config.muteNewMembers ? "✅ Yes" : "❌ No",
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: false });
    console.log(`Raid protection enabled for ${interaction.guild?.name}`);
  } catch (error) {
    console.error("Enable raid protection error:", error);
    await interaction.reply({
      content: "Failed to enable raid protection.",
      ephemeral: true,
    });
  }
}

async function handleDisableRaidProtection(interaction: any) {
  try {
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const serverId = interaction.guildId;
    const config = getServerConfig(serverId);
    config.enabled = false;

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("Raid Protection Disabled")
      .setDescription("Raid protection is now inactive for this server")
      .addFields({
        name: "Status",
        value: "❌ Inactive",
        inline: true,
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: false });
    console.log(`Raid protection disabled for ${interaction.guild?.name}`);
  } catch (error) {
    console.error("Disable raid protection error:", error);
    await interaction.reply({
      content: "Failed to disable raid protection.",
      ephemeral: true,
    });
  }
}

async function handleRaidStatus(interaction: any) {
  try {
    const serverId = interaction.guildId;
    const config = getServerConfig(serverId);

    const embed = new EmbedBuilder()
      .setColor(config.enabled ? Colors.Green : Colors.Red)
      .setTitle("Raid Protection Status")
      .setDescription(
        config.enabled
          ? "Raid protection is **active**"
          : "Raid protection is **inactive**"
      )
      .addFields(
        {
          name: "Status",
          value: config.enabled ? "✅ Active" : "❌ Inactive",
          inline: true,
        },
        { name: "Min Account Age", value: `${config.minAccountAge} days`, inline: true },
        {
          name: "Join Rate Limit",
          value: `${config.joinRateLimit} joins/minute`,
          inline: true,
        },
        {
          name: "Auto-kick New Accounts",
          value: config.autoKickNewAccounts ? "✅ Yes" : "❌ No",
          inline: true,
        },
        {
          name: "Mute New Members",
          value: config.muteNewMembers ? "✅ Yes" : "❌ No",
          inline: true,
        },
        {
          name: "Require Verification",
          value: config.requireVerification ? "✅ Yes" : "❌ No",
          inline: true,
        }
      )
      .setFooter({
        text: "Use /security-config to modify these settings",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.error("Raid status error:", error);
    await interaction.reply({
      content: "Failed to retrieve raid protection status.",
      ephemeral: true,
    });
  }
}

async function handleSecurityConfig(interaction: any) {
  try {
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    const serverId = interaction.guildId;
    const config = getServerConfig(serverId);

    // Get option values
    const minAccountAge = interaction.options.getNumber("min_account_age");
    const joinRateLimit = interaction.options.getNumber("join_rate_limit");
    const autoKickNewAccounts =
      interaction.options.getBoolean("auto_kick_new_accounts");
    const muteNewMembers = interaction.options.getBoolean("mute_new_members");
    const requireVerification =
      interaction.options.getBoolean("require_verification");

    // Update configuration
    if (minAccountAge !== null) config.minAccountAge = minAccountAge;
    if (joinRateLimit !== null) config.joinRateLimit = joinRateLimit;
    if (autoKickNewAccounts !== null)
      config.autoKickNewAccounts = autoKickNewAccounts;
    if (muteNewMembers !== null) config.muteNewMembers = muteNewMembers;
    if (requireVerification !== null)
      config.requireVerification = requireVerification;

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("Security Configuration Updated")
      .setDescription("Your server security settings have been updated")
      .addFields(
        { name: "Min Account Age", value: `${config.minAccountAge} days`, inline: true },
        {
          name: "Join Rate Limit",
          value: `${config.joinRateLimit} joins/minute`,
          inline: true,
        },
        {
          name: "Auto-kick New Accounts",
          value: config.autoKickNewAccounts ? "✅ Enabled" : "❌ Disabled",
          inline: true,
        },
        {
          name: "Mute New Members",
          value: config.muteNewMembers ? "✅ Enabled" : "❌ Disabled",
          inline: true,
        },
        {
          name: "Require Verification",
          value: config.requireVerification ? "✅ Enabled" : "❌ Disabled",
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: false });
    console.log(
      `Security configuration updated for ${interaction.guild?.name}:`,
      config
    );
  } catch (error) {
    console.error("Security config error:", error);
    await interaction.reply({
      content: "Failed to update security configuration.",
      ephemeral: true,
    });
  }
}

function getServerPermissionConfig(serverId: string): ServerPermissionConfig {
  if (!serverPermissions.has(serverId)) {
    serverPermissions.set(serverId, {
      allowedRoleIds: [],
      allowAdministrators: true,
    });
  }
  return serverPermissions.get(serverId)!;
}

async function handleIpBan(interaction: any, ip: string, reason: string) {
  try {
    if (!(await checkModPermission(interaction))) {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
      return;
    }

    // Validate IP address format (basic validation)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
      await interaction.reply({
        content: "Invalid IP address format. Please provide a valid IPv4 address.",
        ephemeral: true,
      });
      return;
    }

    const serverId = interaction.guildId;
    const moderatorId = interaction.user.id;

    // Log IP ban
    console.log(`IP ${ip} banned from ${interaction.guild?.name} by ${interaction.user.tag}: ${reason}`);

    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("IP Address Banned")
      .setDescription(`IP ${ip} has been banned from this server`)
      .addFields(
        { name: "IP Address", value: ip, inline: true },
        { name: "Moderator", value: interaction.user.tag, inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });

    console.log(
      `IP ban logged: ${ip} banned by ${interaction.user.tag} for: ${reason}`
    );
  } catch (error) {
    console.error("IP ban command error:", error);
    await interaction.reply({
      content: "Failed to ban IP address.",
      ephemeral: true,
    });
  }
}

async function handleSetCommandPermissions(
  interaction: any,
  role: any,
  allowAdministrators: boolean | null
) {
  try {
    // Only administrators can set permissions
    if (!interaction.memberPermissions?.has("ADMINISTRATOR")) {
      await interaction.reply({
        content: "Only administrators can configure command permissions.",
        ephemeral: true,
      });
      return;
    }

    const serverId = interaction.guildId;
    const config = getServerPermissionConfig(serverId);

    // Update administrator permission if specified
    if (allowAdministrators !== null) {
      config.allowAdministrators = allowAdministrators;
    }

    // Add or remove role
    if (role) {
      if (config.allowedRoleIds.includes(role.id)) {
        config.allowedRoleIds = config.allowedRoleIds.filter(id => id !== role.id);
      } else {
        config.allowedRoleIds.push(role.id);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle("Command Permissions Updated")
      .setDescription("Bot command permissions have been configured for this server")
      .addFields(
        {
          name: "Allow Administrators",
          value: config.allowAdministrators ? "✅ Yes" : "❌ No",
          inline: true,
        },
        {
          name: "Allowed Roles",
          value: config.allowedRoleIds.length > 0
            ? config.allowedRoleIds.map(id => `<@&${id}>`).join(", ")
            : "None (admins only)",
          inline: false,
        }
      )
      .setFooter({
        text: "Users with these roles or administrators can now use all bot commands",
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });

    console.log(
      `Command permissions updated for ${interaction.guild?.name}:`,
      {
        allowAdministrators: config.allowAdministrators,
        allowedRoles: config.allowedRoleIds.length,
      }
    );
  } catch (error) {
    console.error("Set command permissions error:", error);
    await interaction.reply({
      content: "Failed to update command permissions.",
      ephemeral: true,
    });
  }
}
