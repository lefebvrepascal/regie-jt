// Mise en relation des appareils (remplace le serveur WebSocket public de PeerJS).
// Tout passe en HTTPS, sur le même site que la régie : fonctionne sur les réseaux
// scolaires qui bloquent les WebSockets ou les services externes.
import { getStore } from "@netlify/blobs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ALIVE = 20000;      // un appareil est « présent » s'il a interrogé le service depuis moins de 20 s
const MSG_TTL = 60000;    // les messages non lus depuis 60 s sont jetés
const TYPES = new Set(["OFFER", "ANSWER", "CANDIDATE", "LEAVE"]);
let seq = 0;

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return json({ ok: true, service: "regie-jt-signal", v: 1 });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: "json" }, 400); }
  const { id, token } = b || {};
  if (!ID.test(id || "") || !ID.test(token || "")) return json({ error: "id" }, 400);

  const store = getStore({ name: "jt-signal", consistency: "strong" });
  const now = Date.now();
  const pkey = "p/" + id;

  if (b.leave) {
    const p = await store.get(pkey, { type: "json" });
    if (p && p.token === token) await store.delete(pkey);
    return json({ ok: true });
  }

  const pres = await store.get(pkey, { type: "json" });
  if (b.open && pres && pres.token !== token && now - pres.t < ALIVE)
    return json({ in: [{ type: "ID-TAKEN", payload: { msg: "ID is taken" } }] });
  await store.setJSON(pkey, { token, t: now });

  const inbox = [];
  const out = Array.isArray(b.out) ? b.out.slice(0, 60) : [];
  for (const m of out) {
    if (!m || !TYPES.has(m.type) || !ID.test(m.dst || "")) continue;
    if (m.type === "OFFER") {
      const p = await store.get("p/" + m.dst, { type: "json" });
      if (!p || now - p.t > ALIVE) { inbox.push({ type: "EXPIRE", src: m.dst, dst: id }); continue; }
    }
    const key = `m/${m.dst}/${now.toString(36).padStart(9, "0")}-${String(seq++ % 1e6).padStart(6, "0")}-${Math.random().toString(36).slice(2, 8)}`;
    await store.setJSON(key, { type: m.type, src: id, dst: m.dst, payload: m.payload, t: now });
  }

  const { blobs } = await store.list({ prefix: `m/${id}/` });
  blobs.sort((a, b) => (a.key < b.key ? -1 : 1));
  const msgs = await Promise.all(blobs.map((x) => store.get(x.key, { type: "json" }).catch(() => null)));
  await Promise.all(blobs.map((x) => store.delete(x.key).catch(() => {})));
  for (const m of msgs) if (m && now - m.t < MSG_TTL) { delete m.t; inbox.push(m); }
  return json({ in: inbox });
};

export const config = { path: "/api/signal" };
