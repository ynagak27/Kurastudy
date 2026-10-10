// Gate for the whole site. Every request (pages, data, API) must carry a valid
// Cloudflare Access sign-in for one of the owner emails. If Access is switched
// off by mistake, the site shows a "locked" page instead of the library.
const OWNERS = ["yuta.nagasaki27@gmail.com"]; // override with an OWNER_EMAILS variable (comma separated)
const certCache = new Map();

function b64u(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function part(s) { return JSON.parse(new TextDecoder().decode(b64u(s))); }

async function keysFor(origin) {
  const hit = certCache.get(origin);
  if (hit && Date.now() - hit.at < 3600e3) return hit.keys;
  const r = await fetch(origin + "/cdn-cgi/access/certs");
  if (!r.ok) throw new Error("certs " + r.status);
  const keys = (await r.json()).keys || [];
  certCache.set(origin, { at: Date.now(), keys });
  return keys;
}

async function verify(token, env) {
  const p = String(token || "").split(".");
  if (p.length !== 3) return null;
  let head, pay;
  try { head = part(p[0]); pay = part(p[1]); } catch (e) { return null; }
  if (head.alg !== "RS256" || !pay.email) return null;
  let iss;
  try { iss = new URL(pay.iss); } catch (e) { return null; }
  if (iss.protocol !== "https:" || !iss.hostname.endsWith(".cloudflareaccess.com")) return null;
  if (env.ACCESS_AUD && ![].concat(pay.aud || []).includes(env.ACCESS_AUD)) return null;
  if (!pay.exp || pay.exp < Date.now() / 1000) return null;
  const jwk = (await keysFor(iss.origin)).find((k) => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(p[2]), new TextEncoder().encode(p[0] + "." + p[1]));
  return ok ? pay : null;
}

function locked(title, text, status) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Kura</title>
<body style="font:16px/1.5 system-ui,sans-serif;background:#F3F6F5;color:#17201E;margin:0;padding:48px 20px"><div style="max-width:32rem;margin:auto">
<h1 style="font-size:1.4rem;margin:0 0 8px">${title}</h1><p style="margin:0;color:#586661">${text}</p></div>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function onRequest(context) {
  const { request, env } = context;
  const host = new URL(request.url).hostname;
  let email = null;
  if (env.DEV_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    email = env.DEV_EMAIL; // local testing only
  } else {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return locked("Kura is locked", "The sign-in gate for this site is not switched on yet, so nothing is shown.", 403);
    let pay = null;
    try { pay = await verify(token, env); } catch (e) { return locked("Kura is locked", "The sign-in could not be checked just now. Try again in a minute.", 503); }
    if (!pay) return locked("Kura is locked", "This sign-in is not valid for this site.", 403);
    email = String(pay.email).toLowerCase();
  }
  const owners = (env.OWNER_EMAILS ? env.OWNER_EMAILS.split(",") : OWNERS).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!owners.includes(email.toLowerCase())) {
    return locked("This library belongs to someone else", "You are signed in as " + email.replace(/[<>&]/g, "") + ", which is not on the list for this site.", 403);
  }
  context.data.email = email.toLowerCase();
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  out.headers.set("Referrer-Policy", "no-referrer");
  return out;
}
