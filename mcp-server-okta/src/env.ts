import "dotenv/config";

function mustGet(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const ENV = {
  oktaOrgUrl: mustGet("OKTA_ORG_URL").replace(/\/+$/, ""),
  clientId: mustGet("OKTA_OAUTH_CLIENT_ID"),
  kid: mustGet("OKTA_OAUTH_KID"),
  pemPath: mustGet("OKTA_OAUTH_PEM_PATH"),
  scopes: mustGet("OKTA_OAUTH_SCOPES")
};
