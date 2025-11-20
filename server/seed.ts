import { db } from "./db";
import { users, cases, inviteCodes } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  // Create invite codes
  const codes = [
    "ALPHA-9X2", "BRAVO-3K8", "CHARLIE-7L1", "DELTA-5M4", "ECHO-2N9",
    "FOXTROT-8P6", "GOLF-4Q3", "HOTEL-6R5", "INDIA-1S7", "JULIETT-0T2"
  ];

  for (const code of codes) {
    const existing = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
    if (existing.length === 0) {
      await db.insert(inviteCodes).values({ code });
      console.log(`Created invite code: ${code}`);
    }
  }

  // Create initial users
  const initialUsers = [
    { username: "OVERSEER_01", password: "password", role: "Overseer" as const, ip: "192.168.1.101" },
    { username: "MGM_DIRECTOR", password: "password", role: "Management" as const, ip: "192.168.1.102" },
    { username: "AGENT_FOX", password: "password", role: "Agent" as const, ip: "192.168.1.103" },
    { username: "AGENT_WOLF", password: "password", role: "Agent" as const, ip: "192.168.1.104" },
  ];

  for (const user of initialUsers) {
    const existing = await db.select().from(users).where(eq(users.username, user.username));
    if (existing.length === 0) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await db.insert(users).values({
        username: user.username,
        password: hashedPassword,
        role: user.role,
        isSuspended: false,
        ip: user.ip,
      });
      console.log(`Created user: ${user.username}`);
    }
  }

  // Create initial cases
  const initialCases = [
    {
      id: "CASE-2024-001",
      title: "Project Chimera",
      description: "Investigation into unauthorized data exfiltration from Sector 7.",
      status: "Active" as const,
      priority: "High" as const,
      assignedAgent: "AGENT_FOX",
      content: "Subject was observed accessing terminal 442 at 0300 hours. Logs indicate a transfer of 4TB of encrypted data. Surveillance footage is corrupted for the time window.",
      tags: ["Internal", "Data Breach"],
      isPublic: false,
    },
    {
      id: "CASE-2024-002",
      title: "Signal Intercept 99",
      description: "Decryption of anomalous low-frequency radio bursts.",
      status: "Active" as const,
      priority: "Medium" as const,
      assignedAgent: "AGENT_WOLF",
      content: "Signals originate from coordinates [REDACTED]. Pattern analysis suggests a new cipher variation of the standard 256-bit protocol.",
      tags: ["Signals", "Encryption"],
      isPublic: true,
    },
    {
      id: "CASE-2023-884",
      title: "Operation Blackout",
      description: "Historical records of the 2023 grid failure.",
      status: "Redacted" as const,
      priority: "Critical" as const,
      assignedAgent: "MGM_DIRECTOR",
      content: "[THIS FILE HAS BEEN REDACTED BY OVERSEER ORDER 772]",
      tags: ["Infrastructure", "Classified"],
      isPublic: false,
    }
  ];

  for (const caseData of initialCases) {
    const existing = await db.select().from(cases).where(eq(cases.id, caseData.id));
    if (existing.length === 0) {
      await db.insert(cases).values(caseData);
      console.log(`Created case: ${caseData.id}`);
    }
  }

  console.log("Database seeded successfully!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Error seeding database:", error);
  process.exit(1);
});
