# MCP Identity Bridge for Azure Entra ID and Okta

A collection of local Model Context Protocol (MCP) servers that allow Claude Desktop to securely inspect and reason about enterprise identity environments using Microsoft Graph and Okta OAuth APIs.

This project turns Claude into an interactive identity analysis assistant while keeping credentials, tokens, and access boundaries fully local and tightly scoped.

## What This Project Is

This repository contains two separately hosted MCP servers that expose read-only identity investigation tools to Claude Desktop:

- **mcp-server-entra**: Microsoft Entra ID (Azure AD) integration
- **mcp-server-okta**: Okta integration

Claude is the conversational front end, the MCP servers are the controlled execution layer, and Microsoft Entra ID and Okta remain the systems of record.

Claude never directly connects to identity providers and never sees credentials.

## What This Project Is Not

- Not a SaaS product
- Not a hosted service
- Not an auto remediation engine
- Not a replacement for IAM platforms, SIEMs, or governance tools

This is an analysis and investigation interface, designed to be safe, explainable, and extensible.

Each MCP server runs locally as a separate Node.js application and communicates with Claude Desktop using standard input and output via the Model Context Protocol.

All cloud access is performed by the local servers using scoped OAuth credentials.

## How It Works in Practice

When you ask Claude a question:

1. Claude determines that identity context is required
2. Claude invokes a specific MCP tool from the appropriate server
3. The MCP server authenticates to Entra ID or Okta using OAuth
4. Identity data is retrieved using least privilege scopes
5. Structured results are returned to Claude
6. Claude explains findings, context, and risk in plain language

Claude does not enumerate tenants on its own. Every call is explicit, controlled, and auditable.

## Why This Exists

Enterprise identity environments are difficult to reason about:

- Long lived service principals
- Overprivileged API permissions
- Orphaned ownership
- Poor historical documentation
- Reviews that rely on screenshots and guesswork

This project was built to answer questions like:

- Why does this app have these permissions?
- Is this service principal risky?
- What should I review first during an audit?
- How would I explain this configuration to leadership?

All without giving an LLM unrestricted access to production identity systems.

## Why MCP Instead of Direct LLM Integration

Using the Model Context Protocol provides clear security benefits:

- Credentials never leave the local machine
- Claude never receives secrets or tokens
- Tool capabilities are explicitly declared
- Access can be constrained per integration
- Future write actions can be approval gated

This mirrors Zero Trust principles applied to AI tooling.

## Supported Identity Providers

### Microsoft Entra ID (Azure AD)

The Entra integration focuses on application, service principal investigation, and sign-in activity monitoring.

Current capabilities include:

**Service Principal Investigation:**
- Service principal metadata inspection
- Owner enumeration
- App role assignment analysis
- API permission visibility
- Risk scoring based on permission breadth and ownership gaps

**Sign-in Log Analysis:**
- Query user sign-in activities
- Interactive and non-interactive sign-in events
- Failed authentication attempts
- Conditional Access policy results
- IP address and location tracking
- Application usage patterns

> **Note:** Sign-in log access requires an Azure AD Premium P1 or P2 license

This is intentionally investigative, not destructive.

### Okta

The Okta integration uses OAuth 2.0 application based access, not API tokens.

This design choice is intentional.

Using an Okta OAuth application allows:

- Fine grained scope control
- Better auditability
- Alignment with modern Okta security practices
- Easier revocation and lifecycle management

Current capabilities are read only and include:

- Application visibility
- User and group context
- High level access review use cases

No write scopes are required.

### Why OAuth for Okta Instead of API Tokens

API tokens are coarse, long lived, and difficult to constrain.

OAuth applications allow:

- Explicit scope selection
- Short lived access tokens
- Clear separation of duties
- Easier compliance review

This project treats Okta with the same rigor expected in modern enterprise environments.

## Initial Setup Requirements

### Prerequisites

- Node.js 20 or later
- Claude Desktop with MCP support enabled
- Microsoft Entra ID tenant access (for mcp-server-entra)
- Okta tenant access (for mcp-server-okta)

### Microsoft Entra ID Configuration

Create an app registration with read-only Microsoft Graph permissions.

**Recommended permissions:**
- `Application.Read.All` - Read application and service principal data
- `Directory.Read.All` - Read directory data
- `AuditLog.Read.All` - Read audit log data including sign-in logs

**Steps:**

1. Navigate to the [Azure Portal](https://portal.azure.com)
2. Go to **Microsoft Entra ID** → **App registrations** → **New registration**
3. Name your application (e.g., "MCP Server Entra")
4. Select **Accounts in this organizational directory only**
5. Click **Register**
6. Navigate to **Certificates & secrets** → **New client secret**
7. Add a description and expiration period
8. **Copy the secret value immediately** (you won't be able to see it again)
9. Navigate to **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**
10. Add the following permissions:
    - `Application.Read.All` - For reading service principal and app data
    - `Directory.Read.All` - For reading directory information
    - `AuditLog.Read.All` - For reading sign-in logs and audit logs
11. Click **Grant admin consent** for your organization
    
    > **Note:** `AuditLog.Read.All` requires an Azure AD Premium P1 or P2 license

12. Navigate to **Overview** and record:
    - **Application (client) ID**
    - **Directory (tenant) ID**

No write permissions are required.

### Okta Configuration

Create an OAuth 2.0 application in Okta.

Recommended scopes depend on your use case but should remain read only.

**Typical scopes include:**
- `okta.apps.read`
- `okta.users.read`
- `okta.groups.read`
- `okta.logs.read`

**Steps:**

1. Log in to your Okta Admin Console
2. Navigate to **Applications** → **Applications** → **Create App Integration**
3. Select **API Services** (OAuth 2.0 application)
4. Click **Next**
5. Name your application (e.g., "MCP Server Okta")
6. Click **Save**
7. Copy the **Client ID** and **Client secret**
8. Navigate to the **Okta API Scopes** tab
9. Grant the required read-only scopes
10. Record your **Okta org URL** (e.g., `https://your-org.okta.com`)

This application is used exclusively by the MCP server.

## Installation

### mcp-server-entra

```bash
cd mcp-server-entra
npm install
npm run build
```

### mcp-server-okta

```bash
cd mcp-server-okta
npm install
npm run build
```

## Environment Configuration

Each server has its own environment configuration.

### mcp-server-entra/.env

```bash
# Microsoft Entra ID Configuration
TENANT_ID=your-entra-tenant-id
CLIENT_ID=your-entra-client-id
CLIENT_SECRET=your-entra-client-secret
ALLOW_WRITE_ACTIONS=false
```

### mcp-server-okta/.env

```bash
# Okta Configuration
OKTA_ORG_URL=https://your-org.okta.com
OKTA_CLIENT_ID=your-okta-client-id
OKTA_CLIENT_SECRET=your-okta-client-secret
```

Write actions are disabled by default in mcp-server-entra.

## Running the Servers

### mcp-server-entra

```bash
cd mcp-server-entra
node dist/index.js
```

### mcp-server-okta

```bash
cd mcp-server-okta
node dist/index.js
```

When running, each server will start listening over stdio for MCP requests from Claude Desktop.

## Connecting to Claude Desktop

1. Open Claude Desktop
2. Navigate to **Settings** → **Developer** → **Edit Config**
3. Add both MCP server configurations:

```json
{
  "mcpServers": {
    "mcp-server-entra": {
      "command": "node",
      "args": ["/path/to/mcp-server-entra/dist/index.js"],
      "env": {
        "TENANT_ID": "your-entra-tenant-id",
        "CLIENT_ID": "your-entra-client-id",
        "CLIENT_SECRET": "your-entra-client-secret",
        "ALLOW_WRITE_ACTIONS": "false"
      }
    },
    "mcp-server-okta": {
      "command": "node",
      "args": ["/path/to/mcp-server-okta/dist/index.js"],
      "env": {
        "OKTA_ORG_URL": "https://your-org.okta.com",
        "OKTA_CLIENT_ID": "your-okta-client-id",
        "OKTA_CLIENT_SECRET": "your-okta-client-secret"
      }
    }
  }
}
```

4. Save the configuration
5. Restart Claude Desktop

Claude will automatically discover available identity tools from both servers.

## Example Prompts

**Service Principal Investigation:**
- "Investigate this service principal and summarize risk"
- "Explain why this app has these permissions"
- "What would you flag in this identity configuration?"
- "Help me understand what this application actually does"

**Azure Sign-in Analysis:**
- "Show me recent sign-ins for user john@company.com"
- "Check logins for Azure"
- "Find failed authentication attempts in the last 24 hours"
- "Who accessed the application 'Salesforce' today?"
- "Show me sign-ins from unusual locations"
- "List all non-interactive sign-ins"

**Okta Queries:**
- "List users in Okta"
- "Show me Okta applications"
- "What groups does this user belong to?"
- "Show me recent Okta system logs"

Claude will invoke MCP tools as needed from the appropriate server.

## Available MCP Tools

### mcp-server-entra Tools

#### `investigate_service_principal`
Gathers comprehensive information about a service principal including metadata, owners, credentials, role assignments, and risk assessment.

**Parameters:**
- `servicePrincipalId` (required): The object ID of the service principal
- `includeOwners` (optional, default: true): Include owner information
- `includeAssignments` (optional, default: true): Include role assignments

**Example:**
```
Use investigate_service_principal with servicePrincipalId: "abc-123-def"
```

#### `disable_service_principal`
Disables a service principal by setting `accountEnabled` to false.

**Parameters:**
- `servicePrincipalId` (required): The object ID of the service principal
- `justification` (required): Reason for disabling (minimum 20 characters)
- `approved` (required): Must be true to execute
- `dryRun` (optional, default: true): Set to false for actual execution

**Requirements:**
- `ALLOW_WRITE_ACTIONS` must be set to `true` in environment configuration
- Both `approved` and `dryRun=false` must be set

**Example:**
```
Use disable_service_principal with:
  servicePrincipalId: "abc-123-def"
  justification: "Confirmed malicious OAuth application"
  approved: true
  dryRun: false
```

#### `revoke_service_principal_sessions`
Revokes all active sign-in sessions for a service principal.

**Parameters:**
- `servicePrincipalId` (required): The object ID of the service principal
- `justification` (required): Reason for revoking sessions (minimum 20 characters)
- `approved` (required): Must be true to execute
- `dryRun` (optional, default: true): Set to false for actual execution

**Requirements:**
- Same as `disable_service_principal`

#### `list_sign_ins` (Coming Soon)
Query Azure AD sign-in logs with filtering options.

**Planned Parameters:**
- `userPrincipalName` (optional): Filter by specific user
- `appId` (optional): Filter by application ID
- `startTime` (optional): Beginning of time range
- `endTime` (optional): End of time range
- `limit` (optional): Maximum results to return

### mcp-server-okta Tools

#### `okta_list_users`
Lists Okta users in the organization.

**Parameters:**
- `limit` (optional, default: 5, max: 200): Number of users to return

#### `okta_list_groups`
Lists Okta groups in the organization.

**Parameters:**
- `limit` (optional, default: 5, max: 200): Number of groups to return

#### `okta_list_apps`
Lists Okta applications in the organization.

**Parameters:**
- `limit` (optional, default: 5, max: 200): Number of applications to return

#### `okta_recent_logs`
Fetches recent Okta system log events.

**Parameters:**
- `limit` (optional, default: 5, max: 50): Number of log entries to return

## Design Philosophy

- **Least privilege everywhere**
- **Local first execution**
- **Read only by default**
- **Explicit trust boundaries**
- **Human readable analysis**
- **Separation of concerns** - Each identity provider has its own dedicated server

## Why This Is Valuable for Enterprises

- Reduces friction in identity reviews
- Improves security analysis quality
- Makes identity data accessible without console access
- Enables safe AI assisted investigations
- Scales knowledge across teams

This is about augmenting engineers, not replacing them.

## Security Considerations

- Credentials are stored locally and never transmitted to Claude or Anthropic
- All API calls are made by the local MCP servers with your credentials
- Each server only exposes explicitly defined tools to Claude
- Write actions require explicit configuration (`ALLOW_WRITE_ACTIONS=true`)
- All operations are auditable through your identity provider's logs
- Sign-in log access requires Azure AD Premium P1 or P2 license
- Least privilege principle applies to all OAuth scopes and permissions

## Troubleshooting

### Write Actions Not Executing

**Symptom:** Disable or revoke operations return `executed: false` with reason `ALLOW_WRITE_ACTIONS is false`

**Solution:** 
1. Set `ALLOW_WRITE_ACTIONS=true` in your mcp-server-entra/.env file
2. Restart the mcp-server-entra
3. Ensure both `approved: true` and `dryRun: false` are set in the tool call

### Permission Errors

**Symptom:** API calls fail with 403 Forbidden errors

**Solution:**
1. Verify all required permissions are granted in Azure/Okta
2. Ensure admin consent has been granted for application permissions
3. Check that the service principal has the necessary directory roles
4. Verify the client secret hasn't expired

### Sign-in Logs Not Available

**Symptom:** Cannot access sign-in logs or receiving licensing errors

**Solution:**
1. Verify your tenant has Azure AD Premium P1 or P2 license
2. Ensure `AuditLog.Read.All` permission is granted and consented
3. Check that sign-in data is within the retention period (30 days for P1, 90 days for P2)

### MCP Server Not Connecting

**Symptom:** Claude Desktop doesn't show the MCP tools

**Solution:**
1. Verify the paths in Claude Desktop config point to the correct dist/index.js files
2. Check that both servers built successfully (`npm run build`)
3. Restart Claude Desktop after configuration changes
4. Check Claude Desktop logs for connection errors

## Project Structure

```
mcp-identity-bridge/
├── mcp-server-entra/
│   ├── src/
│   ├── dist/
│   ├── package.json
│   ├── .env
│   └── README.md
├── mcp-server-okta/
│   ├── src/
│   ├── dist/
│   ├── package.json
│   ├── .env
│   └── README.md
└── README.md (this file)
```
