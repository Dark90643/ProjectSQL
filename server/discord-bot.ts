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
    console.log("Fetching cases for search...");
    const apiUrl = process.env.API_URL || "http://localhost:5000";
    const response = await fetch(
      `${apiUrl}/api/cases/public`,
      { timeout: 10000 }
    );
    
    if (!response.ok) {
      console.error("API response not ok:", response.status);
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
    console.log(`Fetching case details for ${caseId}...`);
    const apiUrl = process.env.API_URL || "http://localhost:5000";
    const response = await fetch(
      `${apiUrl}/api/cases/${caseId}`,
      { timeout: 10000 }
    );
    
    if (!response.ok) {
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
    console.log("Fetching all public cases...");
    const apiUrl = process.env.API_URL || "http://localhost:5000";
    const response = await fetch(
      `${apiUrl}/api/cases/public`,
      { timeout: 10000 }
    );
    
    if (!response.ok) {
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
