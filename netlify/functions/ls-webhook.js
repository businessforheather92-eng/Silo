// POST /.netlify/functions/ls-webhook (reached via the /api/ls-webhook
// redirect in netlify.toml) — Lemon Squeezy webhook receiver, Netlify port
// of functions/api/ls-webhook.js (Cloudflare Pages).
//
// Keeps the `entitled:<email>` Blobs flag (the thing netlify/functions/
// claude.js actually trusts) in sync in real time. This matters specifically
// for subscriptions: a Lifetime order never needs to be revoked, but a
// cancelled/expired subscription does — otherwise that account's existing
// ~6-month session token would keep unlocking AI for months after the money
// stopped. A subscription that's still in its free trial reports status
// "on_trial", which is treated as entitled the same as "active".
//
// Netlify setup (see DEPLOY-NETLIFY.md):
//   Lemon Squeezy → Settings → Webhooks → add one pointing at
//   https://yoursite.netlify.app/api/ls-webhook, subscribe to at least:
//     order_created, subscription_created, subscription_updated,
//     subscription_payment_success, subscription_expired
//   Copy the signing secret it gives you into env LS_WEBHOOK_SECRET.

import { getStore } from "@netlify/blobs";
import { webcrypto as crypto } from "node:crypto";

const enc = new TextEncoder();

async function validSignature(rawBody, header, secret) {
  if (!header) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expectHex = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  if (expectHex.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expectHex.length; i++) diff |= expectHex.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };
  if (!process.env.LS_WEBHOOK_SECRET) return { statusCode: 500, body: "not configured" };

  const raw = event.body || "";
  const sig = event.headers["x-signature"] || event.headers["X-Signature"] || "";
  if (!(await validSignature(raw, sig, process.env.LS_WEBHOOK_SECRET))) return { statusCode: 401, body: "bad signature" };

  let payload;
  try { payload = JSON.parse(raw); } catch { return { statusCode: 400, body: "bad json" }; }

  const users = getStore("silo-users");
  const eventName = payload.meta?.event_name;
  const attrs = payload.data?.attributes || {};
  const email = String(attrs.user_email || "").trim().toLowerCase();
  if (!email) return { statusCode: 200, body: "ok" }; // nothing to do without an email

  switch (eventName) {
    case "order_created":
      if (["paid", "partial_refund"].includes(attrs.status)) {
        await users.set(`entitled:${email}`, "1"); // lifetime — never expires
      }
      break;
    case "subscription_created":
    case "subscription_updated":
    case "subscription_payment_success":
      if (["active", "on_trial"].includes(attrs.status)) {
        await users.set(`entitled:${email}`, "1");
      }
      break;
    case "subscription_expired": {
      // Only a truly-ended subscription revokes access. A "cancelled" status
      // still owes access through the paid period's end (including the rest
      // of a free trial), so it's left alone here — LS fires "expired" itself
      // once that period is actually over.
      const existingRaw = await users.get(`user:${email}`);
      const existing = existingRaw ? JSON.parse(existingRaw) : null;
      if (existing?.plan !== "lifetime") await users.delete(`entitled:${email}`);
      break;
    }
  }

  return { statusCode: 200, body: "ok" };
}
