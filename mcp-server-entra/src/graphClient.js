import { getGraphToken } from "./graphAuth.js";
function logErr(message, extra) {
    const payload = extra ? ` ${JSON.stringify(extra)}` : "";
    process.stderr.write(`[sentinelmind] ${message}${payload}\n`);
}
export async function graphGet(params) {
    const token = await getGraphToken({
        tenantId: params.tenantId,
        clientId: params.clientId,
        clientSecret: params.clientSecret
    });
    const res = await fetch(params.url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json"
        }
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        logErr("Graph GET failed", { status: res.status, url: params.url, text });
        throw new Error(`Graph GET failed: ${res.status}`);
    }
    return res.json();
}
//# sourceMappingURL=graphClient.js.map