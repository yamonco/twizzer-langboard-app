import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export function apiOrigin(address) {
  const url = new URL(address.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Enter the HTTPS origin of your Langboard API.");
  }
  return url.origin;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Langboard returned HTTP ${response.status}.`);
  return response.json();
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function connectLangboard(origin) {
  const path = "/mcp/oauth";
  const base = origin + path;
  const metadata = await request(origin + "/.well-known/oauth-authorization-server" + path);
  if (metadata.issuer !== base || metadata.registration_endpoint !== base + "/register"
      || metadata.authorization_endpoint !== base + "/authorize" || metadata.token_endpoint !== base + "/token"
      || !metadata.scopes_supported?.includes("mcp:access")) {
    throw new Error("The Langboard OAuth discovery response is incompatible.");
  }
  const redirect = chrome.identity.getRedirectURL("callback");
  const scope = "mcp:access";
  const registration = await request(metadata.registration_endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Twizzer", redirect_uris: [redirect], token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"], response_types: ["code"], scope }),
  });
  if (typeof registration.client_id !== "string" || !registration.client_id) throw new Error("OAuth client registration failed.");
  const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = random();
  const verifier = random();
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const authorize = new URL(metadata.authorization_endpoint);
  authorize.search = new URLSearchParams({ response_type: "code", client_id: registration.client_id, redirect_uri: redirect,
    scope, resource: base + "/stream", state, code_challenge: challenge, code_challenge_method: "S256" });
  const callback = new URL(await chrome.identity.launchWebAuthFlow({ url: authorize.href, interactive: true }));
  const expected = new URL(redirect);
  const code = callback.searchParams.get("code");
  const issuer = callback.searchParams.get("iss");
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.searchParams.get("state") !== state
      || !code || callback.searchParams.has("error")
      || ((issuer || metadata.authorization_response_iss_parameter_supported) && issuer !== metadata.issuer)) {
    throw new Error("Langboard OAuth callback could not be verified.");
  }
  const tokens = await request(metadata.token_endpoint, {
    method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", client_id: registration.client_id,
      redirect_uri: redirect, code, code_verifier: verifier, resource: base + "/stream" }),
  });
  if (typeof tokens.access_token !== "string" || !tokens.access_token) throw new Error("Langboard OAuth returned no access token.");
  const client = new Client({ name: "Twizzer", version: "0.1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(base + "/stream"), {
      requestInit: { credentials: "omit", redirect: "error", headers: { Authorization: `Bearer ${tokens.access_token}` } },
    }));
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

export async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`Langboard rejected ${name}. Check your board permissions or sign in again.`);
  return result.structuredContent ?? JSON.parse(result.content.find((item) => item.type === "text")?.text ?? "null");
}

export async function createIssue(origin, connectionCredential, board, issue) {
  const result = await request(`${origin}/apps/v1/boards/${board}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${connectionCredential}` },
    body: JSON.stringify(issue),
  });
  if (!/^[A-Za-z0-9]{11}$/.test(result.card_uid ?? "") || typeof result.created !== "boolean") {
    throw new Error("Card creation receipt was unavailable. Retry this same draft to reconcile the result.");
  }
  return result.card_uid;
}

export async function findAttachment(client, board, card, filename) {
  let cursor;
  do {
    const bundle = await call(client, "get_card_bundle", {
      project_uid: board, card_uid: card, include: ["attachments"], ...(cursor ? {section_cursor: cursor} : {}),
    });
    const page = cursor ? bundle?.continuation?.page : bundle?.card?.attachments;
    if (!Array.isArray(page?.items)) throw new Error("Langboard did not return the card attachment list.");
    const item = page.items.find((entry) => (entry.name === filename || entry.filename === filename) && /^[A-Za-z0-9]{11}$/.test(entry.uid ?? ""));
    if (item) return item;
    cursor = page.next_cursor;
  } while (cursor);
}
