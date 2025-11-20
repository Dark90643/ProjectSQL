import { z } from "zod";

// Types
export type Role = "Agent" | "Management" | "Overseer";

export interface User {
  id: string;
  username: string; // Custom User ID
  role: Role;
  isSuspended: boolean;
  ip: string; // New field for IP simulation
}

export interface Case {
  id: string;
  title: string;
  description: string;
  status: "Active" | "Closed" | "Redacted";
  priority: "Low" | "Medium" | "High" | "Critical";
  assignedAgent: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  content: string;
}

export interface Log {
  id: string;
  action: string;
  userId: string;
  targetId?: string; // Case ID or User ID affected
  timestamp: string;
  details: string;
}

// Invite Codes (10 Randomly Generated)
export const INVITE_CODES = [
  "ALPHA-9X2", "BRAVO-3K8", "CHARLIE-7L1", "DELTA-5M4", "ECHO-2N9",
  "FOXTROT-8P6", "GOLF-4Q3", "HOTEL-6R5", "INDIA-1S7", "JULIETT-0T2"
];

// Initial Mock Data
export const INITIAL_USERS: User[] = [
  { id: "u1", username: "OVERSEER_01", role: "Overseer", isSuspended: false, ip: "192.168.1.101" },
  { id: "u2", username: "MGM_DIRECTOR", role: "Management", isSuspended: false, ip: "192.168.1.102" },
  { id: "u3", username: "AGENT_FOX", role: "Agent", isSuspended: false, ip: "192.168.1.103" },
  { id: "u4", username: "AGENT_WOLF", role: "Agent", isSuspended: false, ip: "192.168.1.104" },
];

export const INITIAL_CASES: Case[] = [
  {
    id: "CASE-2024-001",
    title: "Project Chimera",
    description: "Investigation into unauthorized data exfiltration from Sector 7.",
    status: "Active",
    priority: "High",
    assignedAgent: "AGENT_FOX",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    tags: ["Internal", "Data Breach"],
    content: "Subject was observed accessing terminal 442 at 0300 hours. Logs indicate a transfer of 4TB of encrypted data. Surveillance footage is corrupted for the time window."
  },
  {
    id: "CASE-2024-002",
    title: "Signal Intercept 99",
    description: "Decryption of anomalous low-frequency radio bursts.",
    status: "Active",
    priority: "Medium",
    assignedAgent: "AGENT_WOLF",
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    tags: ["Signals", "Encryption"],
    content: "Signals originate from coordinates [REDACTED]. Pattern analysis suggests a new cipher variation of the standard 256-bit protocol."
  },
  {
    id: "CASE-2023-884",
    title: "Operation Blackout",
    description: "Historical records of the 2023 grid failure.",
    status: "Redacted",
    priority: "Critical",
    assignedAgent: "MGM_DIRECTOR",
    createdAt: "2023-11-15T10:00:00Z",
    updatedAt: "2023-12-01T14:30:00Z",
    tags: ["Infrastructure", "Classified"],
    content: "[THIS FILE HAS BEEN REDACTED BY OVERSEER ORDER 772]"
  }
];

export const INITIAL_LOGS: Log[] = [
  { id: "log-1", action: "LOGIN", userId: "u1", timestamp: new Date(Date.now() - 10000).toISOString(), details: "Overseer login detected" },
  { id: "log-2", action: "CASE_CREATE", userId: "u3", targetId: "CASE-2024-001", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), details: "Created case Project Chimera" },
];
