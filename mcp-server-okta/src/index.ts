import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { listUsers, listGroups, listApps, recentLogs } from "./oktaClient.js";

const server = new McpServer({
  name: "mcp-server-okta",
  version: "0.1.0"
});

server.tool(
  "okta_list_users",
  "List Okta users (read only).",
  { limit: z.number().int().min(1).max(200).default(5) },
  async ({ limit }) => {
    const users = await listUsers(limit);
    return { content: [{ type: "text", text: JSON.stringify(users, null, 2) }] };
  }
);

server.tool(
  "okta_list_groups",
  "List Okta groups (read only).",
  { limit: z.number().int().min(1).max(200).default(5) },
  async ({ limit }) => {
    const groups = await listGroups(limit);
    return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
  }
);

server.tool(
  "okta_list_apps",
  "List Okta apps (read only).",
  { limit: z.number().int().min(1).max(200).default(5) },
  async ({ limit }) => {
    const apps = await listApps(limit);
    return { content: [{ type: "text", text: JSON.stringify(apps, null, 2) }] };
  }
);

server.tool(
  "okta_recent_logs",
  "Fetch recent Okta System Log events (read only).",
  { limit: z.number().int().min(1).max(50).default(5) },
  async ({ limit }) => {
    const logs = await recentLogs(limit);
    return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] };
  }
);

const transport = new StdioServerTransport();

async function main() {
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
