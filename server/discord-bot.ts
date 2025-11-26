import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { storage } from "./storage";
import { sendBotBanMessage } from "./discord-webhook";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = "1442053672694714529"; // Your bot's client ID from Discord Developer Portal

interface CaseData {
  id: string;
  serverId?: string | null;
  userId?: string | null;
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

// Pagination storage for cases command
interface CasesPaginationData {
  cases: CaseData[];
  currentPage: number;
  userId: string;
  guildId: string;
}
const casesPagination = new Map<string, CasesPaginationData>(); // messageId -> pagination data

// Pagination storage for user-lookup command
interface UserLookupPaginationData {
  type: "badges" | "friends" | "groups";
  items: any[];
  currentPage: number;
  userId: string;
  robloxId: string;
  robloxUsername: string;
  discordUser?: any;
  robloxData?: any;
}
const userLookupPagination = new Map<string, UserLookupPaginationData>(); // messageId -> pagination data

// Export the Discord client so it can be accessed from routes
export let discordClient: Client | null = null;

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
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Ban duration (e.g., 1h, 1d, 7d, or permanent). Default: permanent")
        .setRequired(false)
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
    .setName("unwarn")
    .setDescription("Remove all warnings from a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to remove warnings from")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to unban")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("unipban")
    .setDescription("Remove an IP ban from the server")
    .addStringOption((option) =>
      option
        .setName("ip")
        .setDescription("IP address to unban")
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
    .addBooleanOption((option) =>
      option
        .setName("allow_administrators")
        .setDescription("Allow server administrators to use commands (default: true)")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Role that can use commands (leave empty to remove)")
        .setRequired(false)
    ),
  // User history tracking commands
  new SlashCommandBuilder()
    .setName("userhistory")
    .setDescription("View complete moderation history for a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to check moderation history for")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("userwarnings")
    .setDescription("View all warnings for a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to check warnings for")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("userbans")
    .setDescription("View all bans for a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to check bans for")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("usermutes")
    .setDescription("View all mutes for a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to check mutes for")
        .setRequired(true)
    ),
  // Lockdown commands
  new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock or unlock the current channel (admin only)")
    .addBooleanOption((option) =>
      option
        .setName("lock")
        .setDescription("Lock (true) or unlock (false) the channel")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for lockdown (optional)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("server-lockdown")
    .setDescription("Lock or unlock the entire server (admin only)")
    .addBooleanOption((option) =>
      option
        .setName("lock")
        .setDescription("Lock (true) or unlock (false) the server")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for server lockdown (optional)")
        .setRequired(false)
    ),
  // Intel research command
  new SlashCommandBuilder()
    .setName("user-lookup")
    .setDescription("Search for user information (Discord, Roblox, etc.)")
    .addUserOption((option) =>
      option
        .setName("discord_user")
        .setDescription("Discord user to look up")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("Roblox username to look up")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("user_id")
        .setDescription("Roblox user ID to look up")
        .setRequired(false)
    ),
  // Multi-server ban linking command
  new SlashCommandBuilder()
    .setName("secured-net")
    .setDescription("Link servers for multi-server banning (owner only)")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Action to perform")
        .addChoices(
          { name: "Generate Code", value: "generate" },
          { name: "Link Child Server", value: "link" },
          { name: "Unlink Child Server", value: "unlink" }
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("code")
        .setDescription("Verification code for linking")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("server_id")
        .setDescription("Child server ID for unlinking")
        .setRequired(false)
    ),
].map((command) => command.toJSON());

export async function initializeDiscordBot() {
  if (!token) {
    console.log("DISCORD_BOT_TOKEN not set, skipping Discord bot initialization");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  discordClient = client; // Store globally so routes can access it

  // Register commands with Discord
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    console.log("Registering Discord bot commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("Discord bot commands registered successfully");
  } catch (error) {
    console.error("Failed to register Discord commands:", error);
  }

  // Handle button interactions
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) {
      const customId = interaction.customId;
      
      if (customId.startsWith("cases_")) {
        try {
          const [_, action, messageId] = customId.split("_");
          const paginationData = casesPagination.get(messageId);
          
          if (!paginationData) {
            await interaction.reply({
              content: "Pagination data expired. Please use `/cases` again.",
              ephemeral: true,
            });
            return;
          }
          
          // Only allow the user who initiated the command to use pagination
          if (interaction.user.id !== paginationData.userId) {
            await interaction.reply({
              content: "You can only navigate pagination for your own command.",
              ephemeral: true,
            });
            return;
          }
          
          const casesPerPage = 5;
          const totalPages = Math.ceil(paginationData.cases.length / casesPerPage);
          
          if (action === "prev" && paginationData.currentPage > 0) {
            paginationData.currentPage--;
          } else if (action === "next" && paginationData.currentPage < totalPages - 1) {
            paginationData.currentPage++;
          }
          
          // Get cases for current page
          const startIdx = paginationData.currentPage * casesPerPage;
          const endIdx = startIdx + casesPerPage;
          const pageCases = paginationData.cases.slice(startIdx, endIdx);
          
          // Create embeds for this page
          const embeds = pageCases.map((c) => {
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
          
          // Create buttons
          const prevButton = new ButtonBuilder()
            .setCustomId(`cases_prev_${messageId}`)
            .setLabel("⬅️ Previous")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(paginationData.currentPage === 0);
          
          const nextButton = new ButtonBuilder()
            .setCustomId(`cases_next_${messageId}`)
            .setLabel("Next ➡️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(paginationData.currentPage >= totalPages - 1);
          
          const row = new ActionRowBuilder()
            .addComponents(prevButton, nextButton);
          
          const pageInfo = `**Public Cases** (Page ${paginationData.currentPage + 1} of ${totalPages})\n\nShowing ${Math.min(5, paginationData.cases.length - startIdx)} of ${paginationData.cases.length} cases`;
          
          await interaction.update({
            content: pageInfo,
            embeds,
            components: [row as any],
          });
        } catch (error) {
          console.error("Button interaction error:", error);
          await interaction.reply({
            content: "An error occurred while processing your request.",
            ephemeral: true,
          });
        }
      } else if (customId.startsWith("userlookup_")) {
        try {
          const [_, action, messageId] = customId.split("_");
          const paginationData = userLookupPagination.get(messageId);
          
          if (!paginationData) {
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({
              content: "Pagination data expired. Please use `/user-lookup` again.",
            });
            return;
          }
          
          // Only allow the user who initiated the command to use pagination
          if (interaction.user.id !== paginationData.userId) {
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({
              content: "You can only navigate pagination for your own command.",
            });
            return;
          }
          
          const itemsPerPage = 9;
          const totalPages = Math.ceil(paginationData.items.length / itemsPerPage);
          
          if (action === "prev" && paginationData.currentPage > 0) {
            paginationData.currentPage--;
          } else if (action === "next" && paginationData.currentPage < totalPages - 1) {
            paginationData.currentPage++;
          }
          
          // Get items for current page
          const startIdx = paginationData.currentPage * itemsPerPage;
          const endIdx = startIdx + itemsPerPage;
          const pageItems = paginationData.items.slice(startIdx, endIdx);
          
          // Create embed with grid layout
          const embed = createUserLookupEmbed(paginationData, pageItems, paginationData.currentPage, totalPages);
          
          // Create buttons
          const prevButton = new ButtonBuilder()
            .setCustomId(`userlookup_prev_${messageId}`)
            .setLabel("⬅️ Previous")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(paginationData.currentPage === 0);
          
          const nextButton = new ButtonBuilder()
            .setCustomId(`userlookup_next_${messageId}`)
            .setLabel("Next ➡️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(paginationData.currentPage >= totalPages - 1);
          
          const row = new ActionRowBuilder()
            .addComponents(prevButton, nextButton);
          
          await interaction.update({
            embeds: [embed],
            components: [row as any],
          });
        } catch (error) {
          console.error("User lookup button interaction error:", error);
          try {
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({
              content: "An error occurred while processing your request.",
            });
          } catch (e) {
            console.error("Failed to send error response:", e);
          }
        }
      }
      return;
    }
    
    if (interaction.isStringSelectMenu?.()) {
      const customId = interaction.customId;
      if (customId.startsWith("userlookup_type_")) {
        try {
          const [_, __, messageId] = customId.split("_");
          const type = interaction.values[0] as "badges" | "friends" | "groups";
          const paginationData = userLookupPagination.get(messageId);
          
          if (!paginationData) {
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({
              content: "Pagination data expired. Please use `/user-lookup` again.",
            });
            return;
          }
          
          // Only allow the user who initiated the command to use the menu
          if (interaction.user.id !== paginationData.userId) {
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({
              content: "You can only use this menu for your own command.",
            });
            return;
          }
          
          // Fetch the selected data
          const items = await fetchUserLookupData(paginationData.robloxId, type);
          
          paginationData.type = type;
          paginationData.items = items;
          paginationData.currentPage = 0;
          
          const itemsPerPage = 9;
          const totalPages = Math.ceil(items.length / itemsPerPage);
          
          // Get items for first page
          const startIdx = 0;
          const endIdx = itemsPerPage;
          const pageItems = items.slice(startIdx, endIdx);
          
          // Create embed
          const embed = createUserLookupEmbed(paginationData, pageItems, 0, totalPages);
          
          // Create buttons
          const prevButton = new ButtonBuilder()
            .setCustomId(`userlookup_prev_${messageId}`)
            .setLabel("⬅️ Previous")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);
          
          const nextButton = new ButtonBuilder()
            .setCustomId(`userlookup_next_${messageId}`)
            .setLabel("Next ➡️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(totalPages <= 1);
          
          const row = new ActionRowBuilder()
            .addComponents(prevButton, nextButton);
          
          // Create select menu
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`userlookup_type_${messageId}`)
            .setPlaceholder("Select what to view")
            .addOptions(
              { label: "Badges", value: "badges", description: "View user badges" },
              { label: "Friends", value: "friends", description: "View user friends" },
              { label: "Groups", value: "groups", description: "View user groups" }
            );
          
          const selectRow = new ActionRowBuilder()
            .addComponents(selectMenu);
          
          await interaction.update({
            embeds: [embed],
            components: [selectRow as any, row as any],
          });
        } catch (error) {
          console.error("User lookup select menu error:", error);
          try {
            await interaction.update({
              content: "An error occurred while fetching data.",
            });
          } catch (e) {
            console.error("Failed to update interaction:", e);
          }
        }
      }
      return;
    }
    
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;

    try {
      if (command === "search") {
        const query = interaction.options.getString("query")!.toLowerCase();
        const serverId = interaction.guildId!;
        await handleSearch(interaction, query, serverId);
      } else if (command === "case") {
        const caseId = interaction.options.getString("case_id")!;
        const serverId = interaction.guildId!;
        await handleCaseDetails(interaction, caseId, serverId);
      } else if (command === "cases") {
        const serverId = interaction.guildId!;
        await handleListCases(interaction, serverId);
      } else if (command === "warn") {
        const user = interaction.options.getUser("user")!;
        const reason = interaction.options.getString("reason")!;
        await handleWarn(interaction, user, reason);
      } else if (command === "kick") {
        const user = interaction.options.getUser("user")!;
        const reason = interaction.options.getString("reason")!;
        await handleKick(interaction, user, reason);
      } else if (command === "ban") {
        // Defer immediately to avoid 3-second timeout
        await interaction.deferReply({ ephemeral: false });
        const user = interaction.options.getUser("user")!;
        const duration = interaction.options.getString("duration") || "permanent";
        const reason = interaction.options.getString("reason")!;
        await handleBan(interaction, user, duration, reason);
      } else if (command === "mute") {
        const user = interaction.options.getUser("user")!;
        const duration = interaction.options.getString("duration")!;
        const reason = interaction.options.getString("reason")!;
        await handleMute(interaction, user, duration, reason);
      } else if (command === "unmute") {
        const user = interaction.options.getUser("user")!;
        await handleUnmute(interaction, user);
      } else if (command === "unwarn") {
        const user = interaction.options.getUser("user")!;
        await handleUnwarn(interaction, user);
      } else if (command === "unban") {
        // Defer immediately to avoid 3-second timeout
        await interaction.deferReply({ ephemeral: false });
        const user = interaction.options.getUser("user")!;
        await handleUnban(interaction, user);
      } else if (command === "unipban") {
        // Defer immediately to avoid 3-second timeout
        await interaction.deferReply({ ephemeral: false });
        const ip = interaction.options.getString("ip")!;
        await handleUnipban(interaction, ip);
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
      } else if (command === "userhistory") {
        const user = interaction.options.getUser("user")!;
        await handleUserHistory(interaction, user);
      } else if (command === "userwarnings") {
        const user = interaction.options.getUser("user")!;
        await handleUserWarnings(interaction, user);
      } else if (command === "userbans") {
        const user = interaction.options.getUser("user")!;
        await handleUserBans(interaction, user);
      } else if (command === "usermutes") {
        const user = interaction.options.getUser("user")!;
        await handleUserMutes(interaction, user);
      } else if (command === "lockdown") {
        const lock = interaction.options.getBoolean("lock")!;
        const reason = interaction.options.getString("reason");
        await handleChannelLockdown(interaction, lock, reason);
      } else if (command === "server-lockdown") {
        const lock = interaction.options.getBoolean("lock")!;
        const reason = interaction.options.getString("reason");
        await handleServerLockdown(interaction, lock, reason);
      } else if (command === "user-lookup") {
        const discordUser = interaction.options.getUser("discord_user");
        const robloxUsername = interaction.options.getString("username");
        const robloxUserId = interaction.options.getString("user_id");
        await handleUserLookup(interaction, discordUser, robloxUsername, robloxUserId);
      } else if (command === "secured-net") {
        const action = interaction.options.getString("action")!;
        const code = interaction.options.getString("code");
        const serverId = interaction.options.getString("server_id");
        await handleBanLink(interaction, action, code, serverId);
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


  // Message filter for suspicious links / DoXX prevention
  client.on("messageCreate", async (message) => {
    try {
      // Ignore bot messages
      if (message.author.bot) return;
      
      const suspiciousPatterns = await checkForSuspiciousContent(message.content);
      
      if (suspiciousPatterns.length > 0) {
        // Delete the message
        await message.delete().catch(() => {});
        
        // Send warning to user
        const warnings = suspiciousPatterns.join(", ");
        try {
          await message.author.send({
            content: `⚠️ Your message in ${message.guild?.name} was deleted for containing suspicious content: **${warnings}**\n\nPlease do not share personal information or suspicious links.`,
          });
        } catch {
          console.log("Could not send DM to user");
        }
        
        // Log to channel
        const logEmbed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle("Suspicious Content Detected")
          .setDescription(`Message deleted from ${message.author.tag}`)
          .addFields(
            { name: "User", value: `${message.author.tag} (${message.author.id})`, inline: true },
            { name: "Channel", value: message.channel.toString(), inline: true },
            { name: "Reason", value: warnings, inline: false }
          )
          .setTimestamp();
        
        console.log(`Suspicious content deleted from ${message.author.tag}: ${warnings}`);
      }
    } catch (error) {
      console.error("Error checking message for suspicious content:", error);
    }
  });

  // Login to Discord
  client.login(token);

  client.once("ready", () => {
    console.log(`Discord bot logged in as ${client.user?.tag}`);
    client.user?.setActivity({
      name: "Managing massive intelligence in https://projectsql-production.up.railway.app/",
      type: ActivityType.Watching,
    });
  });
}

async function handleSearch(
  interaction: any,
  query: string,
  serverId: string
) {
  try {
    const apiUrl = process.env.API_URL || "http://localhost:5000";
    const caseUrl = `${apiUrl}/api/cases/public`;
    console.log("Searching cases from:", caseUrl, "for server:", serverId);
    const response = await fetch(caseUrl);
    
    if (!response.ok) {
      const text = await response.text();
      console.error("API response not ok:", response.status, text.substring(0, 200));
      throw new Error(`API error: ${response.status}`);
    }

    const cases: CaseData[] = await response.json();
    console.log(`Found ${cases.length} public cases`);

    // Filter cases by server and title or description matching the query
    const results = cases.filter(
      (c) =>
        c.serverId === serverId &&
        (c.title.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query) ||
        c.tags.some((tag) => tag.toLowerCase().includes(query)))
    );

    if (results.length === 0) {
      await interaction.reply(
        "No public cases found matching your search in this server."
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
  caseId: string,
  serverId: string
) {
  try {
    const apiUrl = process.env.API_URL || "http://localhost:5000";
    const caseUrl = `${apiUrl}/api/cases/${caseId}`;
    console.log(`Fetching case details from: ${caseUrl} for server: ${serverId}`);
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

    // Only show if case belongs to this server
    if (caseData.serverId !== serverId) {
      await interaction.reply(
        "This case is not available in this server."
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

async function handleListCases(interaction: any, serverId: string) {
  try {
    const apiUrl = process.env.API_URL || "http://localhost:5000";
    const caseUrl = `${apiUrl}/api/cases/public`;
    console.log("Fetching all public cases from:", caseUrl, "for server:", serverId);
    const response = await fetch(caseUrl);
    
    if (!response.ok) {
      const text = await response.text();
      console.error("API response not ok:", response.status, text.substring(0, 200));
      throw new Error(`API error: ${response.status}`);
    }

    const allCases: CaseData[] = await response.json();
    console.log(`Retrieved ${allCases.length} public cases`);

    // Filter cases by server
    const cases = allCases.filter(c => c.serverId === serverId);
    console.log(`Filtered to ${cases.length} cases for this server`);

    if (cases.length === 0) {
      await interaction.reply("No public cases available in this server.");
      return;
    }

    // Pagination setup
    const casesPerPage = 5;
    const totalPages = Math.ceil(cases.length / casesPerPage);
    const currentPage = 0;
    
    // Get first page of cases
    const pageCases = cases.slice(0, casesPerPage);
    
    // Create embeds for first page
    const embeds = pageCases.map((c) => {
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

    // Create pagination buttons (only if more than one page)
    let components: any[] = [];
    if (totalPages > 1) {
      // Use interaction ID as message ID placeholder
      const messageId = `${interaction.id}`;
      
      // Store pagination data
      casesPagination.set(messageId, {
        cases,
        currentPage,
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      
      const prevButton = new ButtonBuilder()
        .setCustomId(`cases_prev_${messageId}`)
        .setLabel("⬅️ Previous")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true); // First page, so prev is disabled
      
      const nextButton = new ButtonBuilder()
        .setCustomId(`cases_next_${messageId}`)
        .setLabel("Next ➡️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(totalPages <= 1); // Disable if only one page
      
      components = [
        new ActionRowBuilder()
          .addComponents(prevButton, nextButton) as any
      ];
    }

    const pageInfo = totalPages > 1 
      ? `**Public Cases** (Page 1 of ${totalPages})\n\nShowing ${casesPerPage} of ${cases.length} cases`
      : `**Public Cases**\n\nTotal: ${cases.length} case(s)`;

    await interaction.reply({
      content: pageInfo,
      embeds,
      components,
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
    await interaction.deferReply({ ephemeral: false });
    
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.editReply({
        content: "You do not have permission to use this command.",
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

    // Save warning to database
    try {
      await storage.addWarning({
        serverId: interaction.guildId,
        userId: user.id,
        moderatorId: interaction.user.id,
        reason: reason,
      });
    } catch (dbError) {
      console.error("Failed to save warning to database:", dbError);
    }

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(
      `User ${user.tag} warned by ${interaction.user.tag}: ${reason}`
    );
  } catch (error) {
    console.error("Warn command error:", error);
    try {
      await interaction.editReply({
        content: "Failed to warn user.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

async function handleKick(interaction: any, user: any, reason: string) {
  try {
    await interaction.deferReply({ ephemeral: false });
    
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.editReply({
        content: "You do not have permission to use this command.",
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

    // Save to mod logs
    try {
      await storage.addModLog({
        serverId: interaction.guildId,
        action: "kick",
        moderatorId: interaction.user.id,
        targetId: user.id,
        reason: reason,
      });
    } catch (dbError) {
      console.error("Failed to save kick to database:", dbError);
    }

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

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(
      `User ${user.tag} kicked by ${interaction.user.tag}: ${reason}`
    );
  } catch (error) {
    console.error("Kick command error:", error);
    try {
      await interaction.editReply({
        content: "Failed to kick user.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

// Helper function to calculate expiration time from duration string
function calculateUnbanTime(duration: string): Date | null {
  if (duration === "permanent" || !duration) return null;
  
  const now = new Date();
  const match = duration.match(/^(\d+)([hdwmy])$/);
  if (!match) return null;
  
  const amount = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case "h": // hours
      return new Date(now.getTime() + amount * 60 * 60 * 1000);
    case "d": // days
      return new Date(now.getTime() + amount * 24 * 60 * 60 * 1000);
    case "w": // weeks
      return new Date(now.getTime() + amount * 7 * 24 * 60 * 60 * 1000);
    case "m": // months
      return new Date(now.getTime() + amount * 30 * 24 * 60 * 60 * 1000);
    case "y": // years
      return new Date(now.getTime() + amount * 365 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

async function handleBan(interaction: any, user: any, duration: string, reason: string) {
  try {
    // Check permissions (deferReply already done at command level)
    if (!(await checkModPermission(interaction))) {
      await interaction.editReply({
        content: "You do not have permission to use this command.",
      });
      return;
    }

    // Calculate unban time
    const unbanAt = calculateUnbanTime(duration);
    const durationDisplay = duration === "permanent" ? "Permanent" : duration;

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
              { name: "Duration", value: durationDisplay },
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

    // Save ban to database
    let mainBan: any;
    try {
      mainBan = await storage.addBan({
        serverId: interaction.guildId,
        userId: user.id,
        moderatorId: interaction.user.id,
        reason: reason,
        duration: duration,
        isMainServerBan: true,
      });
    } catch (dbError) {
      console.error("Failed to save ban to database:", dbError);
    }

    // Cascade ban to child servers if this is a main server
    const childServers = await storage.getChildServers(interaction.guildId);
    console.log(`Main server ${interaction.guildId} has ${childServers.length} child servers`);
    
    for (const childServerId of childServers) {
      try {
        console.log(`Cascading ban for ${user.tag} to child server ${childServerId}`);
        // Always ban in database first (this succeeds regardless of Discord guild access)
        await storage.addBan({
          serverId: childServerId,
          userId: user.id,
          moderatorId: interaction.user.id,
          reason: `[Cascaded from main server] ${reason}`,
          duration: duration,
          linkedBanId: mainBan?.id,
        }).catch(() => {});
        
        // Try to ban in Discord if bot has access to the guild
        try {
          const childGuild = await discordClient?.guilds.fetch(childServerId);
          if (childGuild) {
            // Check if bot has permission to ban
            const botMember = await childGuild.members.fetchMe();
            if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
              console.log(`⚠️ Bot missing BAN_MEMBERS permission in child server ${childServerId}, ban recorded in database only`);
            } else {
              try {
                await childGuild.bans.create(user.id, { reason: `[Cascaded from main server] ${reason}` });
                console.log(`✅ Cascaded ban to Discord in child server ${childServerId}`);
              } catch (banError) {
                console.error(`❌ Failed to ban in child server ${childServerId}:`, banError);
              }
            }
          }
        } catch (discordError) {
          console.log(`Bot not in child server ${childServerId}, but ban recorded in database`);
        }
      } catch (cascadeError) {
        console.error(`Failed to cascade ban to child server ${childServerId}:`, cascadeError);
      }
    }

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
        { name: "Duration", value: durationDisplay, inline: true },
        { name: "Reason", value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
    });

    // Send ban log to main server webhook
    try {
      await sendBotBanMessage({
        userId: user.id,
        userName: user.tag,
        reason: reason,
        duration: duration,
        moderatorId: interaction.user.id,
        moderatorName: interaction.user.tag,
        serverId: interaction.guildId,
        isCascaded: false,
      });
    } catch (webhookError) {
      console.error("Failed to send ban webhook:", webhookError);
    }

    // Send ban logs to child servers
    for (const childServerId of childServers) {
      try {
        await sendBotBanMessage({
          userId: user.id,
          userName: user.tag,
          reason: reason,
          duration: duration,
          moderatorId: interaction.user.id,
          moderatorName: interaction.user.tag,
          serverId: childServerId,
          isCascaded: true,
          mainServerName: interaction.guild?.name,
        });
      } catch (webhookError) {
        console.error("Failed to send cascaded ban webhook:", webhookError);
      }
    }

    console.log(
      `User ${user.tag} banned by ${interaction.user.tag} for ${duration}: ${reason}`
    );
  } catch (error) {
    console.error("Ban command error:", error);
    try {
      await interaction.editReply({
        content: "Failed to ban user.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

async function handleMute(
  interaction: any,
  user: any,
  duration: string,
  reason: string
) {
  try {
    await interaction.deferReply({ ephemeral: false });
    
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.editReply({
        content: "You do not have permission to use this command.",
      });
      return;
    }

    const member = await interaction.guild?.members.fetch(user.id);
    if (!member) {
      await interaction.editReply({
        content: "User not found in this server.",
      });
      return;
    }

    // Parse duration to milliseconds
    let durationMs = 0;
    if (duration.toLowerCase() !== "permanent") {
      const parsed = parseDuration(duration);
      if (parsed === null) {
        await interaction.editReply({
          content:
            'Invalid duration. Use format like "1h", "1d", "1w", or "permanent".',
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

    // Save mute to database
    try {
      await storage.addMute({
        serverId: interaction.guildId,
        userId: user.id,
        moderatorId: interaction.user.id,
        reason: reason,
        duration: duration,
      });
    } catch (dbError) {
      console.error("Failed to save mute to database:", dbError);
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

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(
      `User ${user.tag} muted by ${interaction.user.tag} for ${duration}: ${reason}`
    );
  } catch (error) {
    console.error("Mute command error:", error);
    try {
      await interaction.editReply({
        content: "Failed to mute user.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

async function handleUnmute(interaction: any, user: any) {
  try {
    await interaction.deferReply({ ephemeral: false });
    
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.editReply({
        content: "You do not have permission to use this command.",
      });
      return;
    }

    const member = await interaction.guild?.members.fetch(user.id);
    if (!member) {
      await interaction.editReply({
        content: "User not found in this server.",
      });
      return;
    }

    // Remove timeout
    await member.timeout(null);

    // Log unmute to mod logs
    try {
      await storage.addModLog({
        serverId: interaction.guildId,
        action: "unmute",
        moderatorId: interaction.user.id,
        targetId: user.id,
        reason: "User unmuted",
      });
    } catch (dbError) {
      console.error("Failed to save unmute to database:", dbError);
    }

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

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(`User ${user.tag} unmuted by ${interaction.user.tag}`);
  } catch (error) {
    console.error("Unmute command error:", error);
    try {
      await interaction.editReply({
        content: "Failed to unmute user.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

async function handleUnwarn(interaction: any, user: any) {
  try {
    await interaction.deferReply({ ephemeral: false });
    
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.editReply({
        content: "You do not have permission to use this command.",
      });
      return;
    }

    // Get and remove all warnings
    const warnings = await storage.getUserWarnings(interaction.guildId, user.id);
    if (warnings.length === 0) {
      await interaction.editReply({
        content: `${user.tag} has no warnings to remove.`,
      });
      return;
    }

    await storage.removeAllWarnings(interaction.guildId, user.id);

    // Log to mod logs
    try {
      await storage.addModLog({
        serverId: interaction.guildId,
        action: "unwarn",
        moderatorId: interaction.user.id,
        targetId: user.id,
        reason: `Removed ${warnings.length} warning(s)`,
      });
    } catch (dbError) {
      console.error("Failed to save unwarn to database:", dbError);
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("Warnings Removed")
      .addFields(
        { name: "User", value: `${user.tag}`, inline: true },
        { name: "Warnings Removed", value: `${warnings.length}`, inline: true },
        {
          name: "Moderator",
          value: `${interaction.user.tag}`,
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(`User ${user.tag} had ${warnings.length} warning(s) removed by ${interaction.user.tag}`);
  } catch (error) {
    console.error("Unwarn command error:", error);
    try {
      await interaction.editReply({
        content: "Failed to remove warnings.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

async function handleUnban(interaction: any, user: any) {
  try {
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.editReply({
        content: "You do not have permission to use this command.",
      });
      return;
    }

    // Get and remove all bans
    const bans = await storage.getUserBans(interaction.guildId, user.id);
    if (bans.length === 0) {
      await interaction.editReply({
        content: `${user.tag} has no bans to remove.`,
      });
      return;
    }

    await storage.removeAllBans(interaction.guildId, user.id);

    // Try to unban from Discord
    try {
      await interaction.guild?.bans.remove(user.id, "Unbanned by moderator");
    } catch (banError) {
      console.error("Failed to unban from Discord:", banError);
    }

    // Log to mod logs
    try {
      await storage.addModLog({
        serverId: interaction.guildId,
        action: "unban",
        moderatorId: interaction.user.id,
        targetId: user.id,
        reason: `Removed ${bans.length} ban(s)`,
      });
    } catch (dbError) {
      console.error("Failed to save unban to database:", dbError);
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("User Unbanned")
      .addFields(
        { name: "User", value: `${user.tag}`, inline: true },
        { name: "Bans Removed", value: `${bans.length}`, inline: true },
        {
          name: "Moderator",
          value: `${interaction.user.tag}`,
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(`User ${user.tag} was unbanned by ${interaction.user.tag}`);
  } catch (error) {
    console.error("Unban command error:", error);
    try {
      await interaction.editReply({
        content: "Failed to unban user.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

async function handleUnipban(interaction: any, ip: string) {
  try {
    // Check permissions
    if (!(await checkModPermission(interaction))) {
      await interaction.editReply({
        content: "You do not have permission to use this command.",
      });
      return;
    }

    // Get IP bans
    const ipBans = await storage.getIpBans(interaction.guildId, ip);
    if (ipBans.length === 0) {
      await interaction.editReply({
        content: `No IP bans found for ${ip}.`,
      });
      return;
    }

    // Remove all IP bans for this IP
    for (const ban of ipBans) {
      await storage.removeIpBan(ban.id);
    }

    // Log to mod logs
    try {
      await storage.addModLog({
        serverId: interaction.guildId,
        action: "unipban",
        moderatorId: interaction.user.id,
        targetId: "system",
        reason: `Removed IP ban for ${ip}`,
      });
    } catch (dbError) {
      console.error("Failed to save unipban to database:", dbError);
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("IP Ban Removed")
      .addFields(
        { name: "IP Address", value: ip, inline: true },
        { name: "Bans Removed", value: `${ipBans.length}`, inline: true },
        {
          name: "Moderator",
          value: `${interaction.user.tag}`,
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
    });

    console.log(`IP ban for ${ip} removed by ${interaction.user.tag}`);
  } catch (error) {
    console.error("Unipban command error:", error);
    try {
      await interaction.editReply({
        content: "Failed to remove IP ban.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
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
    await interaction.deferReply({ ephemeral: true });
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

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Raid status error:", error);
    try {
      await interaction.editReply({
        content: "Failed to retrieve raid protection status.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
}

async function handleSecurityConfig(interaction: any) {
  try {
    await interaction.deferReply({ ephemeral: false });
    
    if (!(await checkModPermission(interaction))) {
      await interaction.editReply({
        content: "You do not have permission to use this command.",
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

    await interaction.editReply({ embeds: [embed] });
    console.log(
      `Security configuration updated for ${interaction.guild?.name}:`,
      config
    );
  } catch (error) {
    console.error("Security config error:", error);
    try {
      await interaction.editReply({
        content: "Failed to update security configuration.",
      });
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
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

async function handleUserHistory(interaction: any, user: any) {
  try {
    const serverId = interaction.guildId;
    const userId = user.id;
    
    // Fetch all moderation data
    const [warnings, mutes, bans, logs] = await Promise.all([
      storage.getUserWarnings(serverId, userId),
      storage.getUserMutes(serverId, userId),
      storage.getUserBans(serverId, userId),
      storage.getUserModLogs(serverId, userId),
    ]);
    
    const totalActions = warnings.length + mutes.length + bans.length + logs.length;
    
    if (totalActions === 0) {
      await interaction.reply({
        content: `No moderation history found for ${user.tag}.`,
        ephemeral: true,
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle(`Moderation History for ${user.tag}`)
      .setDescription(`User ID: ${userId}`)
      .addFields(
        {
          name: "📋 Warnings",
          value: warnings.length > 0 ? `${warnings.length} warning(s)` : "None",
          inline: true,
        },
        {
          name: "🔇 Mutes",
          value: mutes.length > 0 ? `${mutes.length} mute(s)` : "None",
          inline: true,
        },
        {
          name: "🚫 Bans",
          value: bans.length > 0 ? `${bans.length} ban(s)` : "None",
          inline: true,
        },
        {
          name: "📝 Total Actions",
          value: `${totalActions} action(s)`,
          inline: true,
        }
      );
    
    if (warnings.length > 0) {
      const recentWarnings = warnings.slice(0, 3).map(w => 
        `**${new Date(w.timestamp).toLocaleDateString()}** - ${w.reason}`
      ).join("\n");
      embed.addFields({
        name: "Recent Warnings",
        value: recentWarnings || "None",
        inline: false,
      });
    }
    
    if (bans.length > 0) {
      const recentBans = bans.slice(0, 3).map(b => 
        `**${new Date(b.bannedAt).toLocaleDateString()}** - ${b.reason}`
      ).join("\n");
      embed.addFields({
        name: "Recent Bans",
        value: recentBans || "None",
        inline: false,
      });
    }
    
    embed.setFooter({ text: `Use /userwarnings, /userbans, or /usermutes for detailed information` });
    embed.setTimestamp();
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
    
    console.log(`Moderation history retrieved for ${user.tag} by ${interaction.user.tag}`);
  } catch (error) {
    console.error("User history error:", error);
    await interaction.reply({
      content: "Failed to retrieve user moderation history.",
      ephemeral: true,
    });
  }
}

async function handleUserWarnings(interaction: any, user: any) {
  try {
    const serverId = interaction.guildId;
    const userId = user.id;
    
    const warnings = await storage.getUserWarnings(serverId, userId);
    
    if (warnings.length === 0) {
      await interaction.reply({
        content: `No warnings found for ${user.tag}.`,
        ephemeral: true,
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle(`Warnings for ${user.tag}`)
      .setDescription(`Total: ${warnings.length} warning(s)`)
      .addFields(
        ...warnings.slice(0, 10).map((w, idx) => ({
          name: `Warning #${idx + 1}`,
          value: `**Date:** ${new Date(w.timestamp).toLocaleDateString()}\n**Reason:** ${w.reason}`,
          inline: false,
        }))
      )
      .setTimestamp();
    
    if (warnings.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${warnings.length} warnings` });
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
    
    console.log(`Warnings retrieved for ${user.tag} by ${interaction.user.tag}`);
  } catch (error) {
    console.error("User warnings error:", error);
    await interaction.reply({
      content: "Failed to retrieve user warnings.",
      ephemeral: true,
    });
  }
}

async function handleUserBans(interaction: any, user: any) {
  try {
    const serverId = interaction.guildId;
    const userId = user.id;
    
    const bans = await storage.getUserBans(serverId, userId);
    
    if (bans.length === 0) {
      await interaction.reply({
        content: `No bans found for ${user.tag}.`,
        ephemeral: true,
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle(`Bans for ${user.tag}`)
      .setDescription(`Total: ${bans.length} ban(s)`)
      .addFields(
        ...bans.slice(0, 10).map((b, idx) => ({
          name: `Ban #${idx + 1}`,
          value: `**Date:** ${new Date(b.bannedAt).toLocaleDateString()}\n**Reason:** ${b.reason}`,
          inline: false,
        }))
      )
      .setTimestamp();
    
    if (bans.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${bans.length} bans` });
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
    
    console.log(`Bans retrieved for ${user.tag} by ${interaction.user.tag}`);
  } catch (error) {
    console.error("User bans error:", error);
    await interaction.reply({
      content: "Failed to retrieve user bans.",
      ephemeral: true,
    });
  }
}

async function handleUserMutes(interaction: any, user: any) {
  try {
    const serverId = interaction.guildId;
    const userId = user.id;
    
    const mutes = await storage.getUserMutes(serverId, userId);
    
    if (mutes.length === 0) {
      await interaction.reply({
        content: `No mutes found for ${user.tag}.`,
        ephemeral: true,
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor(Colors.Blurple)
      .setTitle(`Mutes for ${user.tag}`)
      .setDescription(`Total: ${mutes.length} mute(s)`)
      .addFields(
        ...mutes.slice(0, 10).map((m, idx) => {
          const status = m.unmutedAt ? "✅ Unmuted" : "🔇 Active";
          return {
            name: `Mute #${idx + 1} ${status}`,
            value: `**Date:** ${new Date(m.mutedAt).toLocaleDateString()}\n**Duration:** ${m.duration}\n**Reason:** ${m.reason}`,
            inline: false,
          };
        })
      )
      .setTimestamp();
    
    if (mutes.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${mutes.length} mutes` });
    }
    
    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
    
    console.log(`Mutes retrieved for ${user.tag} by ${interaction.user.tag}`);
  } catch (error) {
    console.error("User mutes error:", error);
    await interaction.reply({
      content: "Failed to retrieve user mutes.",
      ephemeral: true,
    });
  }
}

// Suspicious content detection for DoXX prevention
async function checkForSuspiciousContent(content: string): Promise<string[]> {
  const suspiciousPatterns: string[] = [];
  
  // Check for IP addresses (prevents IP doxxing)
  const ipAddressRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  if (ipAddressRegex.test(content)) {
    suspiciousPatterns.push("IP Address Detected");
  }
  
  // Check for SSN-like patterns
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  if (ssnRegex.test(content)) {
    suspiciousPatterns.push("SSN Pattern Detected");
  }
  
  // Check for credit card-like patterns
  const ccRegex = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
  if (ccRegex.test(content)) {
    suspiciousPatterns.push("Credit Card Pattern Detected");
  }
  
  // Check for API keys/tokens (common patterns)
  const apiKeyRegex = /([a-zA-Z0-9_-]{32,}|sk_[a-z0-9]{24,}|ghp_[a-zA-Z0-9_]{36})/g;
  if (apiKeyRegex.test(content)) {
    suspiciousPatterns.push("API Key/Token Pattern");
  }
  
  // Check for password-like patterns (e.g., "password:xyz")
  const passwordRegex = /password[\s:=]+[^\s]+/gi;
  if (passwordRegex.test(content)) {
    suspiciousPatterns.push("Password Pattern");
  }
  
  return suspiciousPatterns;
}

async function handleChannelLockdown(interaction: any, lock: boolean, reason?: string | null) {
  try {
    // Only administrators can lock channels
    if (!interaction.memberPermissions?.has("ADMINISTRATOR")) {
      await interaction.reply({
        content: "Only administrators can use lockdown commands.",
        ephemeral: true,
      });
      return;
    }
    
    const channel = interaction.channel;
    const everyone = channel.guild.roles.everyone;
    
    try {
      // Set permissions for @everyone role
      await channel.permissionOverwrites.edit(everyone, {
        SendMessages: !lock, // Disable sending messages when locking
      });
      
      const status = lock ? "🔒 LOCKED" : "🔓 UNLOCKED";
      const action = lock ? "locked" : "unlocked";
      
      const embed = new EmbedBuilder()
        .setColor(lock ? Colors.Red : Colors.Green)
        .setTitle(`Channel ${status}`)
        .setDescription(`This channel has been ${action}`)
        .addFields(
          { name: "Channel", value: channel.toString(), inline: true },
          { name: "Administrator", value: interaction.user.tag, inline: true }
        );
      
      if (reason) {
        embed.addFields({ name: "Reason", value: reason, inline: false });
      }
      
      embed.setTimestamp();
      
      await interaction.reply({
        embeds: [embed],
        ephemeral: false,
      });
      
      console.log(`Channel ${channel.name} ${action} by ${interaction.user.tag}${reason ? `: ${reason}` : ""}`);
    } catch (error) {
      console.error("Error changing channel permissions:", error);
      await interaction.reply({
        content: "Failed to modify channel permissions. Make sure I have proper permissions.",
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error("Channel lockdown error:", error);
    await interaction.reply({
      content: "Failed to execute channel lockdown.",
      ephemeral: true,
    });
  }
}

async function handleServerLockdown(interaction: any, lock: boolean, reason?: string | null) {
  try {
    // Only administrators can lock the server
    if (!interaction.memberPermissions?.has("ADMINISTRATOR")) {
      await interaction.reply({
        content: "Only administrators can use server lockdown commands.",
        ephemeral: true,
      });
      return;
    }
    
    const guild = interaction.guild;
    const everyone = guild.roles.everyone;
    
    await interaction.deferReply({ ephemeral: false });
    
    try {
      let lockedCount = 0;
      const channels = guild.channels.cache;
      
      // Lock/unlock all text channels
      for (const [, channel] of channels) {
        if (channel.isTextBased()) {
          try {
            await channel.permissionOverwrites.edit(everyone, {
              SendMessages: !lock,
            });
            lockedCount++;
          } catch (err) {
            console.log(`Could not modify ${channel.name}: ${err}`);
          }
        }
      }
      
      const status = lock ? "🔒 LOCKED" : "🔓 UNLOCKED";
      const action = lock ? "locked" : "unlocked";
      
      const embed = new EmbedBuilder()
        .setColor(lock ? Colors.Red : Colors.Green)
        .setTitle(`Server ${status}`)
        .setDescription(`All text channels have been ${action}`)
        .addFields(
          { name: "Server", value: guild.name, inline: true },
          { name: "Administrator", value: interaction.user.tag, inline: true },
          { name: "Channels Modified", value: `${lockedCount}`, inline: true }
        );
      
      if (reason) {
        embed.addFields({ name: "Reason", value: reason, inline: false });
      }
      
      embed.setTimestamp();
      
      await interaction.editReply({
        embeds: [embed],
      });
      
      console.log(`Server ${guild.name} ${action} (${lockedCount} channels) by ${interaction.user.tag}${reason ? `: ${reason}` : ""}`);
    } catch (error) {
      console.error("Error changing server permissions:", error);
      await interaction.editReply({
        content: "Failed to modify server permissions. Make sure I have proper permissions.",
      });
    }
  } catch (error) {
    console.error("Server lockdown error:", error);
    await interaction.reply({
      content: "Failed to execute server lockdown.",
      ephemeral: true,
    });
  }
}

async function handleBanLink(
  interaction: any,
  action: string,
  code?: string | null,
  serverId?: string | null
) {
  try {
    // Check if command is used in a server
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: 64,
      });
      return;
    }
    
    // Check if user has admin permissions (simplified owner check)
    const hasPermission = interaction.memberPermissions?.has("ADMINISTRATOR");
    if (!hasPermission) {
      await interaction.reply({
        content: "❌ Only server administrators can use this command.",
        flags: 64,
      });
      return;
    }
    
    if (action === "generate") {
      // Generate verification code for this server to be a main server
      try {
        const verification = await storage.createVerificationCode(guildId);
        
        await interaction.reply({
          content: `✅ **Verification Code Generated**\n\n**Code:** \`${verification.verificationCode}\`\n\n**Expires in:** 24 hours\n\nShare this code with other server owners who want to link their servers as child servers.`,
          flags: 64,
        });
      } catch (error) {
        console.error("Error generating verification code:", error);
        await interaction.reply({
          content: "❌ Failed to generate verification code. Please try again.",
          flags: 64,
        });
      }
    } else if (action === "link") {
      // Link this server as a child server to a main server using a verification code
      if (!code) {
        await interaction.reply({
          content: "❌ Please provide a verification code to link servers.",
          flags: 64,
        });
        return;
      }
      
      // Defer reply immediately to avoid 3-second timeout
      try {
        await interaction.deferReply({ flags: 64 });
      } catch (error) {
        console.error("Failed to defer reply:", error);
        return;
      }
      
      try {
        const verification = await storage.getVerificationCode(code);
        if (!verification) {
          await interaction.editReply({
            content: "❌ Invalid verification code.",
          });
          return;
        }
        
        if (verification.expiresAt < new Date()) {
          await interaction.editReply({
            content: "❌ Verification code has expired.",
          });
          return;
        }
        
        // Check if bot is in the current (child) server
        let botPresent = true;
        try {
          await discordClient?.guilds.fetch(guildId);
        } catch (error) {
          botPresent = false;
        }
        
        if (!botPresent) {
          // Bot is not in this server, provide an invite link
          const botId = discordClient?.user?.id;
          if (!botId) {
            await interaction.editReply({
              content: "❌ Could not retrieve bot ID. Please try again.",
            });
            return;
          }
          
          const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot&guild_id=${guildId}`;
          await interaction.editReply({
            content: `⚠️ **Bot Not in Server**\n\nI need to be added to your server before linking. Click the link below to add me:\n\n${inviteUrl}\n\nAfter adding me, use \`/secured-net link [code]\` again to complete the linking.`,
          });
          return;
        }
        
        // Link this server as child to the main server
        try {
          await storage.linkServers(verification.mainServerId, guildId);
          
          await interaction.editReply({
            content: `✅ **Server Linked Successfully**\n\nThis server is now linked to the main server.\n\n**Effect:** Bans from the main server will cascade to this server automatically.`,
          });
          
          console.log(`Server ${guildId} linked as child to main server ${verification.mainServerId}`);
        } catch (linkError: any) {
          if (linkError?.code === '23505' || linkError?.message?.includes('duplicate key')) {
            await interaction.editReply({
              content: `⚠️ **Already Linked**\n\nThis server is already linked to that main server.`,
            });
          } else {
            throw linkError;
          }
        }
      } catch (error) {
        console.error("Error linking servers:", error);
        try {
          await interaction.editReply({
            content: "❌ Failed to link servers. Please try again.",
          });
        } catch (editError) {
          console.error("Failed to edit reply:", editError);
        }
      }
    } else if (action === "unlink") {
      // Unlink a child server from the main server
      if (!serverId) {
        await interaction.reply({
          content: "❌ Please provide the child server ID to unlink.",
          flags: 64,
        });
        return;
      }
      
      try {
        // Verify that the current server is a main server and has this child linked
        const childLink = await storage.getServerLink(guildId, serverId);
        if (!childLink) {
          await interaction.reply({
            content: `❌ Server \`${serverId}\` is not linked as a child of this server.`,
            flags: 64,
          });
          return;
        }
        
        // Unlink the servers
        await storage.unlinkServers(guildId, serverId);
        
        await interaction.reply({
          content: `✅ **Server Unlinked Successfully**\n\nServer \`${serverId}\` has been removed from this server's linked child servers.\n\n**Effect:** Bans from this server will no longer cascade to that server.`,
          flags: 64,
        });
        
        console.log(`Child server ${serverId} unlinked from main server ${guildId}`);
      } catch (error) {
        console.error("Error unlinking servers:", error);
        await interaction.reply({
          content: "❌ Failed to unlink servers. Please try again.",
          flags: 64,
        });
      }
    }
  } catch (error) {
    console.error("Ban link error:", error);
    try {
      await interaction.reply({
        content: "Failed to execute ban link command.",
        flags: 64,
      });
    } catch (replyError) {
      console.error("Could not send error reply:", replyError);
    }
  }
}

async function handleUserLookup(
  interaction: any,
  discordUser: any,
  robloxUsername?: string | null,
  robloxUserId?: string | null
) {
  try {
    await interaction.deferReply({ ephemeral: false });
    
    // Must provide at least one search parameter
    if (!discordUser && !robloxUsername && !robloxUserId) {
      await interaction.editReply({
        content: "Please provide either a Discord user, Roblox username, or Roblox user ID to look up.",
      });
      return;
    }
    
    let robloxId: string | null = null;
    let robloxData: any = null;
    
    // Resolve Roblox ID from username if needed
    if (robloxUsername) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
          `https://users.roblox.com/v1/usernames/users`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: true }),
            signal: controller.signal
          }
        );
        clearTimeout(timeout);
        
        if (response.ok) {
          const data = await response.json();
          if (data.data && data.data.length > 0) {
            robloxId = data.data[0].id.toString();
            robloxUserId = robloxId;
          }
        }
      } catch (error) {
        console.error("Error resolving Roblox username:", error);
      }
    } else if (robloxUserId) {
      robloxId = robloxUserId;
    }
    
    // Fetch Roblox user data if we have an ID
    if (robloxId) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`https://users.roblox.com/v1/users/${robloxId}`, {
          signal: controller.signal
        });
        clearTimeout(timeout);
        
        if (response.ok) {
          robloxData = await response.json();
        }
      } catch (error) {
        console.error("Error fetching Roblox data:", error);
      }
    }
    
    // Create base embed with user info
    const messageId = Math.random().toString(36).substring(7);
    const paginationData: UserLookupPaginationData = {
      type: "badges",
      items: [],
      currentPage: 0,
      userId: interaction.user.id,
      robloxId: robloxId || "",
      robloxUsername: robloxData?.name || robloxUsername || "",
      discordUser,
      robloxData,
    };
    
    // Fetch initial badges data
    if (robloxId) {
      const badgesData = await fetchUserLookupData(robloxId, "badges");
      paginationData.items = badgesData;
    }
    
    const itemsPerPage = 9;
    const totalPages = Math.ceil(paginationData.items.length / itemsPerPage);
    
    // Get first page items
    const pageItems = paginationData.items.slice(0, itemsPerPage);
    
    // Create main embed with user info
    const embed = createUserLookupEmbed(paginationData, pageItems, 0, totalPages);
    
    // Store pagination data
    userLookupPagination.set(messageId, paginationData);
    
    // Pagination data persists indefinitely for user reuse
    
    // Only show select menu and pagination buttons if Roblox data exists
    const components: any[] = [];
    
    if (robloxData) {
      // Create select menu for choosing data type
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`userlookup_type_${messageId}`)
        .setPlaceholder("Select what to view")
        .addOptions(
          { label: "Badges", value: "badges", description: "View user badges" },
          { label: "Friends", value: "friends", description: "View user friends" },
          { label: "Groups", value: "groups", description: "View user groups" }
        );
      
      const selectRow = new ActionRowBuilder()
        .addComponents(selectMenu);
      components.push(selectRow as any);
      
      // Create pagination buttons
      const prevButton = new ButtonBuilder()
        .setCustomId(`userlookup_prev_${messageId}`)
        .setLabel("⬅️ Previous")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true);
      
      const nextButton = new ButtonBuilder()
        .setCustomId(`userlookup_next_${messageId}`)
        .setLabel("Next ➡️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(totalPages <= 1);
      
      const buttonRow = new ActionRowBuilder()
        .addComponents(prevButton, nextButton);
      components.push(buttonRow as any);
    }
    
    await interaction.editReply({
      embeds: [embed],
      components: components.length > 0 ? components : [],
    });
    
    console.log(
      `User lookup performed by ${interaction.user.tag}: Discord=${discordUser?.tag || "N/A"}, Roblox=${robloxUsername || robloxUserId || "N/A"}`
    );
  } catch (error) {
    console.error("User lookup error:", error);
    await interaction.editReply({
      content: "Failed to perform user lookup. Please try again.",
    });
  }
}

// Helper function to fetch user data from Roblox API
async function fetchUserLookupData(robloxId: string, type: "badges" | "friends" | "groups"): Promise<any[]> {
  try {
    let url = "";
    let dataKey = "";
    
    if (type === "badges") {
      url = `https://badges.roblox.com/v1/users/${robloxId}/badges?limit=100`;
      dataKey = "data";
    } else if (type === "friends") {
      url = `https://friends.roblox.com/v1/users/${robloxId}/friends?limit=100`;
      dataKey = "data";
    } else if (type === "groups") {
      url = `https://groups.roblox.com/v1/users/${robloxId}/groups/roles?limit=100`;
      dataKey = "data";
    }
    
    console.log(`Fetching ${type} from: ${url}`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Successfully fetched ${type}:`, data);
      const result = data[dataKey] || data || [];
      return Array.isArray(result) ? result : [];
    } else {
      console.warn(`Roblox API ${type} returned status ${response.status}`);
      return [];
    }
  } catch (error: any) {
    console.error(`Error fetching ${type} data:`, error.message);
    return [];
  }
}

// Helper function to create user lookup embed
function createUserLookupEmbed(
  paginationData: UserLookupPaginationData,
  pageItems: any[],
  currentPage: number,
  totalPages: number
): EmbedBuilder {
  const itemsPerPage = 9;
  const startIdx = currentPage * itemsPerPage;
  
  let title = "User Lookup Results";
  let description = `**Viewing:** ${paginationData.type.charAt(0).toUpperCase() + paginationData.type.slice(1)}`;
  
  const embed = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
  
  // Add Discord user info as separate fields
  if (paginationData.discordUser) {
    const discordAge = Math.floor((Date.now() - paginationData.discordUser.createdTimestamp) / (1000 * 60 * 60 * 24));
    embed.addFields(
      { name: "Discord User", value: `${paginationData.discordUser.tag}`, inline: true },
      { name: "Discord ID", value: `${paginationData.discordUser.id}`, inline: true },
      { name: "Discord Account Age", value: `${discordAge} days`, inline: true }
    );
  }
  
  // Add Roblox user info as separate fields (only if Roblox data exists)
  if (paginationData.robloxData) {
    const createdDate = new Date(paginationData.robloxData.created);
    const robloxAge = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    embed.addFields(
      { name: "Roblox Username", value: `${paginationData.robloxData.name}`, inline: true },
      { name: "Roblox ID", value: `${paginationData.robloxData.id}`, inline: true },
      { name: "Roblox Display Name", value: `${paginationData.robloxData.displayName || "N/A"}`, inline: true },
      { name: "Roblox Account Age", value: `${robloxAge} days`, inline: true },
      { name: "Roblox Account Created", value: `${createdDate.toLocaleDateString()}`, inline: true }
    );
  } else if (paginationData.discordUser) {
    embed.addFields(
      { name: "Note", value: "Roblox data not available. Provide a Roblox username or ID to view Roblox information.", inline: false }
    );
  }
  
  // Format items based on type
  if (paginationData.type === "badges" && pageItems.length > 0) {
    // Display badges in a 3x3 grid (9 per page)
    const badgeTexts: string[] = [];
    for (const badge of pageItems) {
      const name = badge.name || "Unknown Badge";
      const icon = "🏆";
      badgeTexts.push(`${icon} ${name}`);
    }
    
    // Create grid display (3 per row)
    let gridText = "";
    for (let i = 0; i < badgeTexts.length; i += 3) {
      const row = badgeTexts.slice(i, i + 3).join(" | ");
      gridText += row + "\n";
    }
    
    embed.addFields({ name: "Badges", value: gridText || "No badges found", inline: false });
  } else if (paginationData.type === "friends" && pageItems.length > 0) {
    // Display friends with detailed info
    const friendTexts: string[] = [];
    for (const friend of pageItems) {
      const displayName = friend.displayName || "N/A";
      const username = friend.name || "Unknown";
      const userId = friend.id || "N/A";
      const createdDate = new Date(friend.created);
      const accountAge = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      const profileLink = `https://www.roblox.com/users/${userId}/profile`;
      
      friendTexts.push(`**${displayName}** | ${username} | ID: ${userId} | ${accountAge}d | [Profile](${profileLink})`);
    }
    
    embed.addFields({ name: "Friends", value: friendTexts.join("\n") || "No friends found", inline: false });
  } else if (paginationData.type === "groups" && pageItems.length > 0) {
    // Display groups with detailed info
    const groupTexts: string[] = [];
    for (const group of pageItems) {
      const groupName = group.group?.name || "Unknown Group";
      const groupId = group.group?.id || "N/A";
      const groupLink = `https://www.roblox.com/groups/${groupId}`;
      const role = group.role?.name || "Member";
      
      groupTexts.push(`**${groupName}** | ID: ${groupId} | [Group Link](${groupLink}) | Role: ${role}`);
    }
    
    embed.addFields({ name: "Groups", value: groupTexts.join("\n") || "No groups found", inline: false });
  } else if (pageItems.length === 0) {
    embed.addFields({ 
      name: `${paginationData.type.charAt(0).toUpperCase() + paginationData.type.slice(1)}`,
      value: `No ${paginationData.type} found`,
      inline: false 
    });
  }
  
  // Add footer with pagination info
  if (paginationData.items.length > 0) {
    embed.setFooter({
      text: `Page ${currentPage + 1} of ${totalPages} | Items ${startIdx + 1}-${Math.min(startIdx + itemsPerPage, paginationData.items.length)} of ${paginationData.items.length}`,
    });
  }
  
  return embed;
}

// Helper function to check user permissions in a Discord guild
export async function checkUserGuildPermissions(guildId: string, userId: string) {
  try {
    if (!discordClient) {
      console.log("Discord client not initialized");
      return { isOwner: false, isAdmin: false };
    }

    const guild = await discordClient.guilds.fetch(guildId);
    if (!guild) {
      console.log("Guild not found:", guildId);
      return { isOwner: false, isAdmin: false };
    }

    // Check if user is guild owner
    const isOwner = guild.ownerId === userId;

    // Check if user has admin permissions
    const member = await guild.members.fetch(userId).catch(() => null);
    const isAdmin = member ? member.permissions.has("Administrator") : false;

    return { isOwner, isAdmin };
  } catch (error) {
    console.error("Error checking guild permissions:", error);
    return { isOwner: false, isAdmin: false };
  }
}
