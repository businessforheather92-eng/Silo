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

// getStore(name)'s automatic siteID/token detection doesn't reliably reach
// this Lambda-style handler in production, so fall back to explicit
// siteID/token (a Netlify personal access token) via env vars when set.
function usersStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  return siteID && token ? getStore({ name: "silo-users", siteID, token }) : getStore("silo-users");
}

// Same store-wide, always-live Lifetime order lookup as auth.js's
// hasPaidOrder — duplicated here (not shared via import) because Netlify's
// function bundler broke on a shared .mjs helper (CJS/ESM mismatch).
async function fetchPaidLifetimeOrders() {
  const lifetimeProductId = process.env.LS_LIFETIME_PRODUCT_ID;
  if (!process.env.LEMONSQUEEZY_API_KEY || !lifetimeProductId) return [];
  const results = [];
  let page = 1;
  const perPage = 100;
  while (page <= 20) {
    const url =
      `https://api.lemonsqueezy.com/v1/orders?filter[store_id]=${encodeURIComponent(process.env.LS_STORE_ID || "")}` +
      `&page[size]=${perPage}&page[number]=${page}`;
    const r = await fetch(url, {
      headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}` },
    });
    if (!r.ok) break;
    const d = await r.json();
    for (const o of d.data || []) {
      const a = o.attributes || {};
      if (["paid", "partial_refund"].includes(a.status) && String(a.first_order_item?.product_id) === String(lifetimeProductId)) {
        results.push({ id: o.id, email: String(a.user_email || "").trim().toLowerCase(), created_at: a.created_at });
      }
    }
    const lastPage = d.meta?.page?.lastPage || 1;
    if (page >= lastPage) break;
    page++;
  }
  results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return results;
}

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

  const users = usersStore();
  const eventName = payload.meta?.event_name;
  const attrs = payload.data?.attributes || {};
  const email = String(attrs.user_email || "").trim().toLowerCase();
  if (!email) return { statusCode: 200, body: "ok" }; // nothing to do without an email

  switch (eventName) {
    case "order_created": {
      // A subscription checkout also fires order_created (the initial
      // invoice, even a $0 one during a free trial) — only a genuine
      // Lifetime-product order should grant the permanent "lifetime" flag
      // here; subscription entitlement is handled entirely by the
      // subscription_* events below.
      const lifetimeProductId = process.env.LS_LIFETIME_PRODUCT_ID;
      const productId = attrs.first_order_item?.product_id;
      const isLifetimeOrder =
        ["paid", "partial_refund"].includes(attrs.status) &&
        lifetimeProductId &&
        String(productId) === String(lifetimeProductId);
      if (!isLifetimeOrder) break;

      const cap = Number(process.env.LIFETIME_CAP) || 100;
      const orders = await fetchPaidLifetimeOrders();
      const rank = orders.findIndex((o) => o.id === String(payload.data.id));
      if (rank !== -1 && rank < cap) {
        await users.set(`entitled:${email}`, "1"); // lifetime — never expires
      } else if (rank !== -1 && attrs.total > 0 && process.env.LEMONSQUEEZY_API_KEY) {
        // Slipped past the "first N buyers" cap (stale UI, direct checkout
        // link, race condition) — refund automatically rather than keep
        // money for a deal that's no longer being sold. (rank === -1 means
        // we couldn't confirm this order's position, e.g. a transient read
        // lag — skip the refund rather than risk charging back a
        // legitimate sale; hasPaidOrder() at signup time independently
        // re-derives the cap and will never grant lifetime access past it
        // regardless of what happens here.)
        await fetch(`https://api.lemonsqueezy.com/v1/orders/${payload.data.id}/refund`, {
          method: "POST",
          headers: {
            Accept: "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
            Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
          },
          body: JSON.stringify({ data: { type: "orders", id: String(payload.data.id), attributes: { amount: attrs.total } } }),
        });
      }
      break;
    }
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
