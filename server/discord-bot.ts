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

// Permission checking utility
async function checkModPermission(interaction: any): Promise<boolean> {
  if (!interaction.memberPermissions) return false;
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
