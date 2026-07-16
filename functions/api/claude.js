// POST /api/claude — production AI proxy (Cloudflare Pages Function).
// Holds the Anthropic key server-side, requires a signed-in Pro account,
// applies a per-account daily cap (the real anti-sharing measure), and clamps
// model + token spend so a leaked client can't run up costs.
//
// Env (see DEPLOY.md): ANTHROPIC_API_KEY, SESSION_SECRET, KV binding USERS,
// AUTH_REQUIRED ("false" = AI open to everyone), AI_MODEL, AI_DAILY_CAP.

const DEMO_REPLY = {
  content: [{ type: "text", text: "(Demo mode — AI replies appear once the server has an API key configured. Everything else works.)" }],
};
const MAX_TOKENS_CAP = 1024;
const DEFAULT_DAILY_CAP = 400; // AI messages per account per UTC day

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

const enc = new TextEncoder();
const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

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
    return atob(emailB64.replace(/-/g, "+").replace(/_/g, "/"));
  } catch { return null; }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad request" }, 400); }

  if (!env.ANTHROPIC_API_KEY) return json(DEMO_REPLY);

  if (env.AUTH_REQUIRED !== "false") {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "account_required" }, 402);
    const email = env.SESSION_SECRET ? await verifyToken(token, env.SESSION_SECRET) : null;
    if (!email) return json({ error: "session_invalid" }, 401);

    if (env.USERS) {
      // Live entitlement check, not just a valid token — a subscription can
      // lapse mid-way through a still-valid ~6-month session. ls-webhook.js
      // keeps this flag current; Lifetime accounts set it once and it never
      // gets cleared.
      const entitled = await env.USERS.get(`entitled:${email}`);
      if (entitled !== "1") return json({ error: "account_required" }, 402);

      // per-account daily cap — makes a shared login pointless at scale
      const day = new Date().toISOString().slice(0, 10);
      const rlKey = `rl:${email}:${day}`;
      const used = Number((await env.USERS.get(rlKey)) || 0);
      const cap = Number(env.AI_DAILY_CAP) || DEFAULT_DAILY_CAP;
      if (used >= cap) return json({ error: "rate_limited" }, 429);
      await env.USERS.put(rlKey, String(used + 1), { expirationTtl: 172800 });
    }
  }

  const upstream = {
    model: env.AI_MODEL || "claude-haiku-4-5-20251001",
    max_tokens: Math.min(Number(body.max_tokens) || 300, MAX_TOKENS_CAP),
    messages: body.messages,
    ...(body.system ? { system: body.system } : {}),
  };

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(upstream),
  });
  return new Response(await r.text(), {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
