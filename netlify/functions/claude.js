// POST /.netlify/functions/claude (reached via the /api/claude redirect in
// netlify.toml) — production AI proxy for Silo on Netlify.
//
// Holds the Anthropic key server-side, requires a signed-in Pro account,
// applies a per-account daily cap (the real anti-sharing measure), and
// clamps model + token spend so a leaked client can't run up costs. This is
// the Netlify port of functions/api/claude.js (Cloudflare Pages) — same
// entitlement/rate-limit logic, Netlify Blobs instead of Cloudflare KV.
//
// Env (Netlify site settings → Environment variables): ANTHROPIC_API_KEY,
// SESSION_SECRET, AUTH_REQUIRED ("false" = AI open to everyone), AI_MODEL,
// AI_DAILY_CAP. No KV binding to configure — Netlify Blobs works
// automatically inside Netlify Functions.

import { getStore } from "@netlify/blobs";
import { webcrypto as crypto } from "node:crypto";

// getStore(name)'s automatic siteID/token detection doesn't reliably reach
// this Lambda-style handler in production, so fall back to explicit
// siteID/token (a Netlify personal access token) via env vars when set.
function usersStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token ? getStore("silo-users", { siteID, token }) : getStore("silo-users");
}

const DEMO_REPLY = {
  content: [{ type: "text", text: "(Demo mode — AI replies appear once the server has an API key configured. Everything else works.)" }],
};
const MAX_TOKENS_CAP = 1024;
const DEFAULT_DAILY_CAP = 400; // AI messages per account per UTC day
const DEFAULT_MODEL = "claude-haiku-4-5"; // keeps per-message cost low for the companion chat + every AI feature

const json = (obj, statusCode = 200) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});

const enc = new TextEncoder();
const b64u = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// token format (issued by /api/auth): b64u(email).exp.hmac(b64u(email).exp)
async function verifyToken(token, secret) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  const [emailB64, expStr, sig] = parts;
  if (Number(expStr) < Date.now() / 1000) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expect = b64u(await crypto.subtle.sign("HMAC", key, enc.encode(`${emailB64}.${expStr}`)));
  if (expect !== sig) return null;
  try {
    return Buffer.from(emailB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch { return null; }
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json({ error: "bad request" }, 400); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(DEMO_REPLY);

  if (process.env.AUTH_REQUIRED !== "false") {
    const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "account_required" }, 402);
    const sessionSecret = process.env.SESSION_SECRET;
    const email = sessionSecret ? await verifyToken(token, sessionSecret) : null;
    if (!email) return json({ error: "session_invalid" }, 401);

    const users = usersStore();

    // Live entitlement check, not just a valid token — a subscription can
    // lapse mid-way through a still-valid ~6-month session. ls-webhook.js
    // keeps this flag current; Lifetime accounts set it once and it never
    // gets cleared.
    const entitled = await users.get(`entitled:${email}`);
    if (entitled !== "1") return json({ error: "account_required" }, 402);

    // per-account daily cap — makes a shared login pointless at scale
    const day = new Date().toISOString().slice(0, 10);
    const rlKey = `rl:${email}:${day}`;
    const used = Number((await users.get(rlKey)) || 0);
    const cap = Number(process.env.AI_DAILY_CAP) || DEFAULT_DAILY_CAP;
    if (used >= cap) return json({ error: "rate_limited" }, 429);
    await users.set(rlKey, String(used + 1));
  }

  const upstream = {
    model: process.env.AI_MODEL || DEFAULT_MODEL,
    max_tokens: Math.min(Number(body.max_tokens) || 300, MAX_TOKENS_CAP),
    messages: body.messages,
    ...(body.system ? { system: body.system } : {}),
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(upstream),
  });
  return {
    statusCode: r.status,
    headers: { "Content-Type": "application/json" },
    body: await r.text(),
  };
}
