import "dotenv/config";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { graphGet } from "./graphClient.js";
function logErr(message, extra) {
    const payload = extra ? ` ${JSON.stringify(extra)}` : "";
    process.stderr.write(`[sentinelmind] ${message}${payload}\n`);
}
const tenantId = "";
const clientId = "";
const clientSecret = "";
const allowWriteActions = "false"
if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing TENANT_ID, CLIENT_ID, or CLIENT_SECRET in environment");
}
const server = new McpServer({
    name: "sentinelmind-entra",
    version: "0.1.0"
});
server.tool("signin_recent", "Fetch recent Entra ID sign-in events from Microsoft Graph audit logs. Returns normalized fields for investigation.", {
    windowMinutes: z.number().int().min(1).max(1440).default(60),
    userPrincipalName: z.string().email().optional(),
    top: z.number().int().min(1).max(50).default(10)
}, async (args) => {
    const now = new Date();
    const start = new Date(now.getTime() - args.windowMinutes * 60 * 1000);
    const startIso = start.toISOString();
    const filters = [`createdDateTime ge ${startIso}`];
    if (args.userPrincipalName) {
        filters.push(`userPrincipalName eq '${args.userPrincipalName}'`);
    }
    const filter = filters.join(" and ");
    const url = `https://graph.microsoft.com/v1.0/auditLogs/signIns` +
        `?$top=${args.top}` +
        `&$orderby=createdDateTime desc` +
        `&$filter=${encodeURIComponent(filter)}`;
    const raw = await graphGet({
        tenantId,
        clientId,
        clientSecret,
        url
    });
    const parsed = z
        .object({
        value: z.array(z.any())
    })
        .safeParse(raw);
    if (!parsed.success) {
        logErr("Unexpected Graph response shape", parsed.error.flatten());
        throw new Error("Unexpected Graph response shape");
    }
    const normalized = parsed.data.value.map((e) => ({
        createdDateTime: e.createdDateTime,
        userPrincipalName: e.userPrincipalName,
        userId: e.userId,
        ipAddress: e.ipAddress,
        appDisplayName: e.appDisplayName,
        resourceDisplayName: e.resourceDisplayName,
        clientAppUsed: e.clientAppUsed,
        isInteractive: e.isInteractive,
        conditionalAccessStatus: e.conditionalAccessStatus,
        status: e.status?.errorCode === 0 ? "success" : "failure",
        failureReason: e.status?.failureReason,
        riskLevelAggregated: e.riskLevelAggregated,
        riskState: e.riskState,
        deviceDetail: e.deviceDetail
            ? {
                operatingSystem: e.deviceDetail.operatingSystem,
                browser: e.deviceDetail.browser,
                deviceId: e.deviceDetail.deviceId,
                trustType: e.deviceDetail.trustType
            }
            : undefined,
        location: e.location
            ? {
                city: e.location.city,
                state: e.location.state,
                countryOrRegion: e.location.countryOrRegion
            }
            : undefined
    }));
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    windowMinutes: args.windowMinutes,
                    count: normalized.length,
                    events: normalized
                }, null, 2)
            }
        ]
    };
});
server.tool("dangerously_revoke_sessions_placeholder", "Placeholder for session revocation. Disabled by default for safety.", {
    userId: z.string().min(1),
    justification: z.string().min(10)
}, async (args) => {
    if (!allowWriteActions) {
        return {
            content: [
                {
                    type: "text",
                    text: "Write actions are disabled. Set ALLOW_WRITE_ACTIONS=true only in a test tenant. " +
                        "This tool is a placeholder to demonstrate approval gating."
                }
            ]
        };
    }
    logErr("Write action requested", args);
    return {
        content: [
            {
                type: "text",
                text: "Not implemented yet. Next step is wiring POST /users/{id}/revokeSignInSessions with approval gating."
            }
        ]
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logErr("sentinelmind-entra MCP server running over stdio");
}
main().catch((err) => {
    logErr("Fatal error", { message: String(err) });
    process.exit(1);
});
//# sourceMappingURL=index.js.map