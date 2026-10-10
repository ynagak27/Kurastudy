// Kura notifier: a tiny scheduled Worker, redeployed on every push to main with the library bundled in.
// Every few minutes it compares the lessons it was built with against the list already announced (kept in KV)
// and sends one notification per new lesson to every device that turned notifications on.
import library from "../public/data/library.json";
import { sendToAll } from "../shared/webpush.js";

export async function run(env, lib) {
  const kv = env.KURA_KV;
  const ids = (lib.lessons || []).map((l) => l.id);
  const known = await kv.get("push:notified", "json");
  if (!known) { await kv.put("push:notified", JSON.stringify(ids)); return { first: true, announced: [] }; }
  const fresh = (lib.lessons || []).filter((l) => !known.includes(l.id)).sort((a, b) => String(a.published).localeCompare(String(b.published)));
  if (!fresh.length) return { announced: [] };
  const results = [];
  for (const l of fresh) {
    const t = (lib.topics || []).find((x) => x.id === l.topic) || {};
    const payload = { title: (t.short || t.name || "Kura") + " · Lesson " + l.n, body: l.title, url: "/#l-" + l.id, tag: "kura-" + l.id };
    results.push({ id: l.id, ...(await sendToAll(kv, payload, !!env.DEV_EMAIL)) });
  }
  await kv.put("push:notified", JSON.stringify(known.concat(fresh.map((l) => l.id))));
  return { announced: results };
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env, library)); },
  async fetch() { return new Response("Not found", { status: 404 }); },
};
