// Web Push for Kura, written against WebCrypto so it runs in Pages Functions and Workers.
// Keys are created on first use and kept in the KV namespace (key "vapid"); nothing secret lives in the repo.
const enc = new TextEncoder();
export function b64u(bytes) {
  let s = ""; const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /\.push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export function allowedEndpoint(url, allowLocal) {
  let u; try { u = new URL(url); } catch (e) { return false; }
  if (allowLocal && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
  return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
}

export async function getVapid(kv, create) {
  let v = await kv.get("vapid", "json");
  if (v || !create) return v;
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  v = { publicKey: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)), privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
  await kv.put("vapid", JSON.stringify(v));
  return v;
}

async function vapidHeader(vapid, endpoint, subject) {
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + body));
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + vapid.publicKey;
}

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

// RFC 8291 (aes128gcm) encryption of one record.
export async function encrypt(sub, text) {
  const uaPublic = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, secret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(enc.encode(text), new Uint8Array([2]))));
  return concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPublic.length]), asPublic, cipher);
}

// Returns { ok, status, gone }. gone = the device unsubscribed, so drop it.
export async function sendPush(vapid, sub, payload, subject) {
  const body = await encrypt(sub, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidHeader(vapid, sub.endpoint, subject), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" },
    body,
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}

export const SUBJECT = "https://kurastudy.pages.dev";
export const subsKey = (email) => "push:subs:" + email;

// Sends one payload to every stored device; forgets devices that have unsubscribed.
export async function sendToAll(kv, payload, allowLocal) {
  const vapid = await getVapid(kv, false);
  const out = { sent: 0, failed: 0, removed: 0 };
  if (!vapid) return out;
  let cursor;
  do {
    const page = await kv.list({ prefix: "push:subs:", cursor });
    for (const k of page.keys) {
      const subs = (await kv.get(k.name, "json")) || [];
      const keep = [];
      for (const s of subs) {
        if (!allowedEndpoint(s.endpoint, allowLocal)) continue;
        let r; try { r = await sendPush(vapid, s, payload, SUBJECT); } catch (e) { r = { ok: false, gone: false }; }
        if (r.ok) out.sent++; else if (r.gone) out.removed++; else out.failed++;
        if (!r.gone) keep.push(s);
      }
      if (keep.length !== subs.length) await kv.put(k.name, JSON.stringify(keep));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
