import "dotenv/config";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { graphGet, graphPatch } from "./graphClient.js";
import { getGraphToken } from "./graphAuth.js";

/* -------------------------------------------------
   Logging
-------------------------------------------------- */
function logErr(message: string, extra?: unknown) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  process.stderr.write(`[sentinelmind] ${message}${payload}\n`);
}

/* -------------------------------------------------
   Environment
-------------------------------------------------- */
const tenantId = process.env.TENANT_ID || "";
const clientId = process.env.CLIENT_ID || "";
const clientSecret = process.env.CLIENT_SECRET || "";
const allowWriteActions = (process.env.ALLOW_WRITE_ACTIONS || "false") === "true";

if (!tenantId || !clientId || !clientSecret) {
  logErr("Missing required environment variables: TENANT_ID CLIENT_ID CLIENT_SECRET");
  process.exit(1);
}

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */
function daysUntil(dateIso?: string | null): number | null {
  if (!dateIso) return null;
  const d = new Date(dateIso).getTime();
  if (Number.isNaN(d)) return null;
  const diffMs = d - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function scoreServicePrincipalRisk(input: {
  ownersCount: number;
  passwordCreds: { daysRemaining: number | null }[];
  keyCreds: { daysRemaining: number | null }[];
  appRoleAssignmentsCount: number;
  appRoleAssignedToCount: number;
  createdDateTime?: string | null;
}): {
  score: number;
  level: "LOW" | "MEDIUM" | "HIGH";
  signals: string[];
} {
  let score = 0;
  const signals: string[] = [];

  if (input.ownersCount === 0) {
    score += 15;
    signals.push("No owners assigned");
  }

  for (const c of input.passwordCreds) {
    if (c.daysRemaining !== null && c.daysRemaining <= 30) {
      score += 20;
      signals.push("Client secret expires within 30 days");
      break;
    }
  }

  for (const c of input.keyCreds) {
    if (c.daysRemaining !== null && c.daysRemaining <= 30) {
      score += 10;
      signals.push("Certificate expires within 30 days");
      break;
    }
  }

  if (input.appRoleAssignmentsCount > 10) {
    score += 15;
    signals.push("High number of app role assignments");
  }

  if (input.appRoleAssignedToCount > 10) {
    score += 10;
    signals.push("Many principals assigned to this app");
  }

  if (input.createdDateTime) {
    const createdDays = daysUntil(input.createdDateTime);
    if (createdDays !== null && createdDays > -30) {
      score += 10;
      signals.push("Recently created service principal");
    }
  }

  let level: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (score >= 60) level = "HIGH";
  else if (score >= 30) level = "MEDIUM";

  return { score, level, signals };
}

function enforceApprovalGate(input: {
  action: string;
  targetId: string;
  justification: string;
  approved: boolean;
  dryRun: boolean;
}) {
  const decision = {
    action: input.action,
    targetId: input.targetId,
    approved: input.approved,
    dryRun: input.dryRun,
    allowWriteActions,
    justification: input.justification
  };

  const reasons: string[] = [];
  if (!allowWriteActions) reasons.push("ALLOW_WRITE_ACTIONS is false");
  if (!input.approved) reasons.push("approved is not true");
  if (input.dryRun) reasons.push("dryRun is true");

  return {
    decision,
    canExecute: reasons.length === 0,
    reasons
  };
}

/* -------------------------------------------------
   Tool logic: investigate_service_principal
-------------------------------------------------- */
const InvestigateServicePrincipalArgs = z.object({
  servicePrincipalId: z.string().min(10),
  includeAssignments: z.boolean().optional().default(true),
  includeOwners: z.boolean().optional().default(true)
});

async function investigateServicePrincipal(args: Record<string, unknown>) {
  const parsed = InvestigateServicePrincipalArgs.parse(args);
  const spId = parsed.servicePrincipalId;

  const spUrl =
    `https://graph.microsoft.com/v1.0/servicePrincipals/${spId}` +
    `?$select=id,displayName,appId,servicePrincipalType,createdDateTime,accountEnabled,passwordCredentials,keyCredentials`;

  const ownersUrl =
    `https://graph.microsoft.com/v1.0/servicePrincipals/${spId}/owners` +
    `?$select=id,displayName,userPrincipalName`;

  const appRoleAssignmentsUrl =
    `https://graph.microsoft.com/v1.0/servicePrincipals/${spId}/appRoleAssignments?$top=200`;

  const appRoleAssignedToUrl =
    `https://graph.microsoft.com/v1.0/servicePrincipals/${spId}/appRoleAssignedTo?$top=200`;

  const spRaw = await graphGet({ tenantId, clientId, clientSecret, url: spUrl });

  const spParsed = z
    .object({
      id: z.string(),
      displayName: z.string().nullable().optional(),
      appId: z.string().nullable().optional(),
      servicePrincipalType: z.string().nullable().optional(),
      createdDateTime: z.string().nullable().optional(),
      accountEnabled: z.boolean().nullable().optional(),
      passwordCredentials: z.array(z.any()).optional(),
      keyCredentials: z.array(z.any()).optional()
    })
    .safeParse(spRaw);

  if (!spParsed.success) {
    logErr("Unexpected servicePrincipal shape", spParsed.error.flatten());
    throw new Error("Unexpected servicePrincipal response");
  }

  let owners: any[] = [];
  if (parsed.includeOwners) {
    const ownersRaw = await graphGet({ tenantId, clientId, clientSecret, url: ownersUrl });
    const ownersParsed = z.object({ value: z.array(z.any()) }).safeParse(ownersRaw);
    owners = ownersParsed.success ? ownersParsed.data.value : [];
  }

  let appRoleAssignments: any[] = [];
  let appRoleAssignedTo: any[] = [];

  if (parsed.includeAssignments) {
    const aRaw = await graphGet({ tenantId, clientId, clientSecret, url: appRoleAssignmentsUrl });
    const bRaw = await graphGet({ tenantId, clientId, clientSecret, url: appRoleAssignedToUrl });

    const aParsed = z.object({ value: z.array(z.any()) }).safeParse(aRaw);
    const bParsed = z.object({ value: z.array(z.any()) }).safeParse(bRaw);

    appRoleAssignments = aParsed.success ? aParsed.data.value : [];
    appRoleAssignedTo = bParsed.success ? bParsed.data.value : [];
  }

  const passwordCreds = (spParsed.data.passwordCredentials || []).map((c: any) => ({
    keyId: c.keyId,
    displayName: c.displayName,
    startDateTime: c.startDateTime,
    endDateTime: c.endDateTime,
    daysRemaining: daysUntil(c.endDateTime)
  }));

  const keyCreds = (spParsed.data.keyCredentials || []).map((c: any) => ({
    keyId: c.keyId,
    displayName: c.displayName,
    type: c.type,
    usage: c.usage,
    startDateTime: c.startDateTime,
    endDateTime: c.endDateTime,
    daysRemaining: daysUntil(c.endDateTime)
  }));

  const risk = scoreServicePrincipalRisk({
    ownersCount: owners.length,
    passwordCreds,
    keyCreds,
    appRoleAssignmentsCount: appRoleAssignments.length,
    appRoleAssignedToCount: appRoleAssignedTo.length,
    createdDateTime: spParsed.data.createdDateTime
  });

  const normalized = {
    servicePrincipal: {
      id: spParsed.data.id,
      displayName: spParsed.data.displayName || null,
      appId: spParsed.data.appId || null,
      servicePrincipalType: spParsed.data.servicePrincipalType || null,
      createdDateTime: spParsed.data.createdDateTime || null,
      accountEnabled: spParsed.data.accountEnabled ?? null
    },
    owners: owners.map((o: any) => ({
      id: o.id,
      displayName: o.displayName,
      userPrincipalName: o.userPrincipalName
    })),
    credentials: {
      passwordCredentials: passwordCreds,
      keyCredentials: keyCreds
    },
    assignments: parsed.includeAssignments
      ? {
          appRoleAssignmentsCount: appRoleAssignments.length,
          appRoleAssignedToCount: appRoleAssignedTo.length
        }
      : null,
    riskAssessment: {
      riskScore: risk.score,
      riskLevel: risk.level,
      signals: risk.signals
    }
  };

  return normalized;
}

/* -------------------------------------------------
   Tool logic: disable_service_principal
-------------------------------------------------- */
const DisableServicePrincipalArgs = z.object({
  servicePrincipalId: z.string().min(10),
  justification: z.string().min(20),
  approved: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

async function disableServicePrincipal(args: Record<string, unknown>) {
  const parsed = DisableServicePrincipalArgs.parse(args);

  const gate = enforceApprovalGate({
    action: "disable_service_principal",
    targetId: parsed.servicePrincipalId,
    justification: parsed.justification,
    approved: parsed.approved,
    dryRun: parsed.dryRun
  });

  if (!gate.canExecute) {
    return {
      ok: true,
      executed: false,
      gate
    };
  }

  const url = `https://graph.microsoft.com/v1.0/servicePrincipals/${parsed.servicePrincipalId}`;
  const result = await graphPatch({
    tenantId,
    clientId,
    clientSecret,
    url,
    body: { accountEnabled: false }
  });

  return {
    ok: true,
    executed: true,
    gate,
    result
  };
}

/* -------------------------------------------------
   Tool logic: revoke_service_principal_sessions
-------------------------------------------------- */
const RevokeSPSessionsArgs = z.object({
  servicePrincipalId: z.string().min(10),
  justification: z.string().min(20),
  approved: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

async function revokeServicePrincipalSessions(args: Record<string, unknown>) {
  const parsed = RevokeSPSessionsArgs.parse(args);

  const gate = enforceApprovalGate({
    action: "revoke_service_principal_sessions",
    targetId: parsed.servicePrincipalId,
    justification: parsed.justification,
    approved: parsed.approved,
    dryRun: parsed.dryRun
  });

  if (!gate.canExecute) {
    return {
      ok: true,
      executed: false,
      gate
    };
  }

  const url =
    `https://graph.microsoft.com/v1.0/servicePrincipals/${parsed.servicePrincipalId}/revokeSignInSessions`;

  const token = await getGraphToken({ tenantId, clientId, clientSecret });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logErr("Graph POST revokeSignInSessions failed", { status: res.status, url, text });
    throw new Error(`revokeSignInSessions failed: ${res.status}`);
  }

  const body = await res.json().catch(() => ({}));

  return {
    ok: true,
    executed: true,
    gate,
    result: body
  };
}

/* -------------------------------------------------
   MCP Server: tools/list + tools/call
-------------------------------------------------- */
const server = new Server(
  { name: "sentinelmind-entra", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "investigate_service_principal",
        description:
          "Gather Microsoft Entra service principal metadata, owners, credentials, role assignments, and compute a risk score.",
        inputSchema: {
          type: "object",
          properties: {
            servicePrincipalId: { type: "string", minLength: 10 },
            includeAssignments: { type: "boolean", default: true },
            includeOwners: { type: "boolean", default: true }
          },
          required: ["servicePrincipalId"]
        }
      },
      {
        name: "disable_service_principal",
        description:
          "Disable a service principal (accountEnabled=false). Requires ALLOW_WRITE_ACTIONS=true and approved=true and dryRun=false.",
        inputSchema: {
          type: "object",
          properties: {
            servicePrincipalId: { type: "string", minLength: 10 },
            justification: { type: "string", minLength: 20 },
            approved: { type: "boolean", default: false },
            dryRun: { type: "boolean", default: true }
          },
          required: ["servicePrincipalId", "justification"]
        }
      },
      {
        name: "revoke_service_principal_sessions",
        description:
          "Revoke sign-in sessions for a service principal. Requires ALLOW_WRITE_ACTIONS=true and approved=true and dryRun=false.",
        inputSchema: {
          type: "object",
          properties: {
            servicePrincipalId: { type: "string", minLength: 10 },
            justification: { type: "string", minLength: 20 },
            approved: { type: "boolean", default: false },
            dryRun: { type: "boolean", default: true }
          },
          required: ["servicePrincipalId", "justification"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  if (name === "investigate_service_principal") {
    const result = await investigateServicePrincipal(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "disable_service_principal") {
    const result = await disableServicePrincipal(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "revoke_service_principal_sessions") {
    const result = await revokeServicePrincipalSessions(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

/* -------------------------------------------------
   Main
-------------------------------------------------- */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[sentinelmind] sentinelmind-entra MCP server running over stdio\n");
  process.stderr.write(`[sentinelmind] write_actions_enabled=${allowWriteActions}\n`);
}

main().catch((err) => {
  logErr("Fatal error", err);
  process.exit(1);
});
