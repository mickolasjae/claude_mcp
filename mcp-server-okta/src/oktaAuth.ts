import fs from "node:fs";
import crypto from "node:crypto";
import { ENV } from "./env.js";

type TokenCache = { accessToken: string; expiresAtMs: number };
let cache: TokenCache | null = null;

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeClientAssertion(): string {
  const pem = fs.readFileSync(ENV.pemPath, "utf8");
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT", kid: ENV.kid };
  const payload = {
    iss: ENV.clientId,
    sub: ENV.clientId,
    aud: `${ENV.oktaOrgUrl}/oauth2/v1/token`,
    iat: now,
    exp: now + 300,
    jti: crypto.randomUUID()
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createSign("RSA-SHA256").update(signingInput).sign(pem);
  return `${signingInput}.${b64url(sig)}`;
}

export async function getOktaAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && now < cache.expiresAtMs - 10_000) return cache.accessToken;

  const clientAssertion = makeClientAssertion();

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", ENV.scopes);
  body.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
  body.set("client_assertion", clientAssertion);

  const res = await fetch(`${ENV.oktaOrgUrl}/oauth2/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Token request failed: HTTP ${res.status} ${res.statusText}. Body: ${text}`);
  }

  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  cache = {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + (json.expires_in ?? 300) * 1000
  };

  return cache.accessToken;
}
