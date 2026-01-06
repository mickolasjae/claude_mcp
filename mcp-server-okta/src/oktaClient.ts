import { ENV } from "./env.js";
import { getOktaAccessToken } from "./oktaAuth.js";

async function oktaGet<T>(path: string): Promise<T> {
  const token = await getOktaAccessToken();
  const url = `${ENV.oktaOrgUrl}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Okta GET ${path} failed: HTTP ${res.status}. Body: ${text}`);
  return JSON.parse(text) as T;
}

export async function listUsers(limit = 5) {
  return oktaGet<any[]>(`/api/v1/users?limit=${encodeURIComponent(String(limit))}`);
}

export async function listGroups(limit = 5) {
  return oktaGet<any[]>(`/api/v1/groups?limit=${encodeURIComponent(String(limit))}`);
}

export async function listApps(limit = 5) {
  return oktaGet<any[]>(`/api/v1/apps?limit=${encodeURIComponent(String(limit))}`);
}

export async function recentLogs(limit = 5) {
  return oktaGet<any[]>(`/api/v1/logs?limit=${encodeURIComponent(String(limit))}`);
}
