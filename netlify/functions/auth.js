// POST /.netlify/functions/auth (reached via the /api/auth redirect in
// netlify.toml) — account signup & login for Silo Pro, on Netlify.
// Body: { action: "signup" | "login", email, password }
// → { ok: true, token, email } or { ok: false, reason }
//
// Netlify port of functions/api/auth.js (Cloudflare Pages) — same logic,
// Netlify Blobs instead of Cloudflare KV. Accounts exist to gate Pro tools +
// AI (which cost money per message); all app data stays in the user's
// browser. Signup is allowed for emails with EITHER a paid one-time
// (Lifetime) order OR an active subscription (including a Lemon Squeezy
// free trial, reported as status "on_trial") — both checked live against
// the LS API. The result is cached in Blobs as `entitled:<email>` = "1",
// which is the single flag netlify/functions/claude.js trusts on every
// request (kept in sync afterward by ls-webhook.js, since a subscription
// can lapse after the account already has a long-lived token).
//
// Env (Netlify site settings → Environment variables):
//   SESSION_SECRET       – long random string; signs session tokens
//   LEMONSQUEEZY_API_KEY – LS API key, used to look up orders/subs by email
//   LS_STORE_ID          – your store id, scopes the lookups
//   AUTH_REQUIRED         – "false" = open mode (no accounts needed)
// No KV binding to configure — Netlify Blobs works automatically inside
// Netlify Functions.

import { getStore } from "@netlify/blobs";
import { webcrypto as crypto } from "node:crypto";

const json = (obj, statusCode = 200) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});

const enc = new TextEncoder();
const b64u = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

// token: b64u(email) . expiry-epoch-seconds . hmac(email.exp)
async function makeToken(email, secret) {
  const exp = Math.floor(Date.now() / 1000) + 180 * 24 * 3600; // ~6 months
  const body = `${b64u(enc.encode(email))}.${exp}`;
  return `${body}.${await hmac(secret, body)}`;
}

async function hashPassword(password, saltB64u, iterations) {
  const salt = fromB64u(saltB64u);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return b64u(bits);
}

async function hasPaidOrder(email, users) {
  const cached = await users.get(`entitled:${email}`);
  if (cached === "1") return true;
  if (!process.env.LEMONSQUEEZY_API_KEY) return false;
  const url =
    `https://api.lemonsqueezy.com/v1/orders?filter[store_id]=${encodeURIComponent(process.env.LS_STORE_ID || "")}` +
    `&filter[user_email]=${encodeURIComponent(email)}`;
  const r = await fetch(url, {
    headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}` },
  });
  if (!r.ok) return false;
  const d = await r.json();
  const paid = (d.data || []).some((o) => ["paid", "partial_refund"].includes(o.attributes?.status));
  if (paid) await users.set(`entitled:${email}`, "1");
  return paid;
}

// Subscription check — separate from hasPaidOrder because a subscription can
// lapse later (order history never does). Doesn't cache the boolean here;
// ls-webhook.js is the thing that keeps `entitled:<email>` current afterward.
async function hasActiveSubscription(email, users) {
  const cached = await users.get(`entitled:${email}`);
  if (cached === "1") return true;
  if (!process.env.LEMONSQUEEZY_API_KEY) return false;
  const url =
    `https://api.lemonsqueezy.com/v1/subscriptions?filter[store_id]=${encodeURIComponent(process.env.LS_STORE_ID || "")}` +
    `&filter[user_email]=${encodeURIComponent(email)}`;
  const r = await fetch(url, {
    headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}` },
  });
  if (!r.ok) return false;
  const d = await r.json();
  const active = (d.data || []).some((s) => ["active", "on_trial"].includes(s.attributes?.status));
  if (active) await users.set(`entitled:${email}`, "1");
  return active;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (process.env.AUTH_REQUIRED === "false") return json({ ok: true, token: "open", email: "" });
  if (!process.env.SESSION_SECRET)
    return json({ ok: false, reason: "Server isn't fully configured yet (SESSION_SECRET)." }, 500);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json({ ok: false, reason: "Bad request." }, 400); }
  const action = body.action;
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, reason: "That email doesn't look right." });
  if (password.length < 8) return json({ ok: false, reason: "Password needs at least 8 characters." });

  const users = getStore("silo-users");
  const userKey = `user:${email}`;
  const existingRaw = await users.get(userKey);
  const existing = existingRaw ? JSON.parse(existingRaw) : null;

  if (action === "signup") {
    if (existing) return json({ ok: false, reason: "That email already has an account — sign in instead." });
    const lifetime = await hasPaidOrder(email, users);
    const subscribed = lifetime ? false : await hasActiveSubscription(email, users);
    if (!lifetime && !subscribed)
      return json({
        ok: false,
        reason: "No purchase found for this email. Use the exact email from your receipt — or grab Pro first.",
      });
    const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
    const iterations = 100000;
    const hash = await hashPassword(password, salt, iterations);
    const plan = lifetime ? "lifetime" : "subscription";
    await users.set(userKey, JSON.stringify({ salt, iterations, hash, created: Date.now(), plan }));
    await users.set(`entitled:${email}`, "1");
    return json({ ok: true, token: await makeToken(email, process.env.SESSION_SECRET), email });
  }

  if (action === "login") {
    if (!existing) return json({ ok: false, reason: "No account with that email yet — create one first." });
    const hash = await hashPassword(password, existing.salt, existing.iterations);
    if (hash !== existing.hash) return json({ ok: false, reason: "Wrong password." });
    return json({ ok: true, token: await makeToken(email, process.env.SESSION_SECRET), email });
  }

  return json({ ok: false, reason: "Unknown action." }, 400);
}
