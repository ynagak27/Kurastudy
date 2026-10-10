// Quiz progress for the signed-in owner, stored in the KV namespace bound as KURA_KV.
// GET  -> { email, progress: { "<lessonId>": {lesson,done,score,total,at} } }
// PUT  -> body { items: [ {lesson,done,score,total,at}, ... ] }; newest "at" wins per lesson.
function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function clean(d) {
  if (!d || typeof d !== "object") return null;
  const lesson = String(d.lesson || "");
  const at = String(d.at || "");
  const score = Number(d.score), total = Number(d.total);
  if (!/^[a-z0-9-]{1,40}$/.test(lesson) || isNaN(Date.parse(at)) || at.length > 40) return null;
  if (!Number.isInteger(score) || !Number.isInteger(total) || score < 0 || total < 0 || total > 50 || score > total) return null;
  return { lesson, done: true, score, total, at };
}
export async function onRequest({ request, env, data }) {
  const email = data && data.email;
  if (!email) return json({ error: "not_signed_in" }, 401);
  if (!env.KURA_KV) return json({ error: "storage_not_configured", email }, 503);
  const key = "progress:" + email;
  const current = (await env.KURA_KV.get(key, "json")) || {};
  if (request.method === "GET") return json({ email, progress: current });
  if (request.method === "PUT" || request.method === "POST") {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
    const items = Array.isArray(body && body.items) ? body.items.slice(0, 500) : [];
    let changed = false;
    for (const raw of items) {
      const d = clean(raw);
      if (!d) continue;
      const old = current[d.lesson];
      if (!old || Date.parse(d.at) > Date.parse(old.at)) { current[d.lesson] = d; changed = true; }
    }
    if (changed) await env.KURA_KV.put(key, JSON.stringify(current));
    return json({ email, progress: current });
  }
  return json({ error: "method_not_allowed" }, 405);
}
