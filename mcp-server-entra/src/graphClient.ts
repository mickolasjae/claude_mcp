import { getGraphToken } from "./graphAuth.js";

function logErr(message: string, extra?: unknown) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  process.stderr.write(`[sentinelmind] ${message}${payload}\n`);
}

export async function graphGet(params: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  url: string;
}): Promise<unknown> {
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

export async function graphPatch(params: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  url: string;
  body: unknown;
}): Promise<unknown> {
  const token = await getGraphToken({
    tenantId: params.tenantId,
    clientId: params.clientId,
    clientSecret: params.clientSecret
  });

  const res = await fetch(params.url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(params.body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logErr("Graph PATCH failed", { status: res.status, url: params.url, text });
    throw new Error(`Graph PATCH failed: ${res.status}`);
  }

  if (res.status === 204) return { ok: true };
  return res.json().catch(() => ({ ok: true }));
}
