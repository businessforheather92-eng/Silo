// GET /.netlify/functions/lifetime-status (reached via the /api/lifetime-status
// redirect in netlify.toml) — public, unauthenticated. Reports how many of
// the LIFETIME_CAP "first N buyers" Lifetime slots are taken, so the landing
// page and in-app upsells can show live scarcity and hide the Lifetime offer
// entirely once it's sold out.
//
// Computed live against the Lemon Squeezy API on every request (not a
// persisted counter) — see the matching fetchPaidLifetimeOrders() in
// auth.js and ls-webhook.js, which is what actually enforces the cap; this
// endpoint only reports the same count for display purposes.

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
        results.push({ id: o.id, created_at: a.created_at });
      }
    }
    const lastPage = d.meta?.page?.lastPage || 1;
    if (page >= lastPage) break;
    page++;
  }
  return results;
}

export async function handler(event) {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "method not allowed" };

  const cap = Number(process.env.LIFETIME_CAP) || 100;
  const orders = await fetchPaidLifetimeOrders();
  const sold = orders.length;
  const remaining = Math.max(0, cap - sold);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      // Short cache so a burst of landing-page loads doesn't hammer the LS API.
      "Cache-Control": "public, max-age=30",
    },
    body: JSON.stringify({ limit: cap, sold, remaining, soldOut: remaining <= 0 }),
  };
}
