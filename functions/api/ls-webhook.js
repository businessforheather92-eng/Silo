// POST /api/ls-webhook — Lemon Squeezy webhook receiver.
//
// Keeps the `entitled:<email>` KV flag (the thing /api/claude actually trusts)
// in sync in real time. This matters specifically for subscriptions: a
// Lifetime order never needs to be revoked, but a cancelled/expired
// subscription does — otherwise that account's existing ~6-month session
// token would keep unlocking AI for months after the money stopped.
//
// Cloudflare setup (see DEPLOY.md):
//   Lemon Squeezy → Settings → Webhooks → add one pointing at
//   https://yoursite.pages.dev/api/ls-webhook, subscribe to at least:
//     order_created, subscription_created, subscription_updated,
//     subscription_payment_success, subscription_expired
//   Copy the signing secret it gives you into env LS_WEBHOOK_SECRET.

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

export async function onRequestPost({ request, env }) {
  if (!env.LS_WEBHOOK_SECRET || !env.USERS) return new Response("not configured", { status: 500 });

  const raw = await request.text();
  const sig = request.headers.get("x-signature") || "";
  if (!(await validSignature(raw, sig, env.LS_WEBHOOK_SECRET))) return new Response("bad signature", { status: 401 });

  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const event = payload.meta?.event_name;
  const attrs = payload.data?.attributes || {};
  const email = String(attrs.user_email || "").trim().toLowerCase();
  if (!email) return new Response("ok", { status: 200 }); // nothing to do without an email

  switch (event) {
    case "order_created":
      if (["paid", "partial_refund"].includes(attrs.status)) {
        await env.USERS.put(`entitled:${email}`, "1"); // lifetime — never expires
      }
      break;
    case "subscription_created":
    case "subscription_updated":
    case "subscription_payment_success":
      if (["active", "on_trial"].includes(attrs.status)) {
        await env.USERS.put(`entitled:${email}`, "1");
      }
      break;
    case "subscription_expired":
      // Only a truly-ended subscription revokes access. A "cancelled" status
      // still owes access through the paid period's end, so it's left alone
      // here — LS fires "expired" itself once that period is actually over.
      {
        const existing = await env.USERS.get(`user:${email}`, "json");
        if (existing?.plan !== "lifetime") await env.USERS.delete(`entitled:${email}`);
      }
      break;
  }

  return new Response("ok", { status: 200 });
}
