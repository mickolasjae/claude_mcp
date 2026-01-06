import { ConfidentialClientApplication } from "@azure/msal-node";
export async function getGraphToken(params) {
    const authority = `https://login.microsoftonline.com/${params.tenantId}`;
    const cca = new ConfidentialClientApplication({
        auth: {
            clientId: params.clientId,
            clientSecret: params.clientSecret,
            authority
        }
    });
    const result = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
    forceRefresh: true
});
    if (!result?.accessToken) {
        throw new Error("Failed to acquire Microsoft Graph access token");
    }
    return result.accessToken;
}
//# sourceMappingURL=graphAuth.js.map