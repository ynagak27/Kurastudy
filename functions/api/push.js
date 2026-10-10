// Notification settings for the signed-in owner.
// GET    -> { publicKey, devices }
// POST   { subscription }            -> remember this device
// POST   { test: true, endpoint }    -> send a test notification to this device
// DELETE { endpoint }                -> forget this device
import { getVapid, sendPush, allowedEndpoint, subsKey, SUBJECT } from "../../shared/webpush.js";
function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
export async function onRequest({ request, env, data }) {
  const email = data && data.email;
  if (!email) return json({ error: "not_signed_in" }, 401);
  if (!env.KURA_KV) return json({ error: "storage_not_configured" }, 503);
  const kv = env.KURA_KV, key = subsKey(email);
  const local = !!env.DEV_EMAIL;
  const subs = (await kv.get(key, "json")) || [];
  if (request.method === "GET") {
    const vapid = await getVapid(kv, true);
    return json({ publicKey: vapid.publicKey, devices: subs.length });
  }
  let body = {};
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  if (request.method === "POST" && body.test) {
    const s = subs.find((x) => x.endpoint === body.endpoint);
    if (!s) return json({ error: "device_not_found" }, 404);
    const vapid = await getVapid(kv, true);
    const r = await sendPush(vapid, s, { title: "Kura", body: "Notifications are working on this device.", url: "/#home", tag: "kura-test" }, SUBJECT);
    return json({ ok: r.ok, status: r.status }, r.ok ? 200 : 502);
  }
  if (request.method === "POST") {
    const s = body.subscription;
    if (!s || !allowedEndpoint(s.endpoint, local) || !s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string" || s.endpoint.length > 1000) return json({ error: "bad_subscription" }, 400);
    const next = subs.filter((x) => x.endpoint !== s.endpoint);
    next.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, added: new Date().toISOString() });
    await kv.put(key, JSON.stringify(next.slice(-10)));
    return json({ ok: true, devices: Math.min(next.length, 10) });
  }
  if (request.method === "DELETE") {
    const next = subs.filter((x) => x.endpoint !== body.endpoint);
    if (next.length !== subs.length) await kv.put(key, JSON.stringify(next));
    return json({ ok: true, devices: next.length });
  }
  return json({ error: "method_not_allowed" }, 405);
}
