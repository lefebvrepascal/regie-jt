// Serveurs STUN / TURN pour WebRTC.
// Sans configuration : STUN seulement (suffit quand les iPad peuvent se joindre sur le Wi-Fi).
// Avec un relais TURN (variables d'environnement Netlify), l'image passe par internet
// en HTTPS/443 : fonctionne même si le Wi-Fi isole les appareils entre eux.
//   Cloudflare (gratuit jusqu'à 1 000 Go/mois) : CF_TURN_KEY_ID + CF_TURN_API_TOKEN
//   Autre serveur TURN : TURN_URLS (séparées par des virgules) + TURN_USERNAME + TURN_CREDENTIAL
const CORS = { "access-control-allow-origin": "*", "cache-control": "no-store", "content-type": "application/json" };
const STUN = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
let cache = null;

export default async () => {
  const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || "";
  if (cache && cache.exp > Date.now()) return new Response(JSON.stringify(cache.body), { headers: CORS });
  let body = { iceServers: STUN, turn: false };
  try {
    if (env("CF_TURN_KEY_ID") && env("CF_TURN_API_TOKEN")) {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env("CF_TURN_KEY_ID")}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { authorization: "Bearer " + env("CF_TURN_API_TOKEN"), "content-type": "application/json" },
        body: JSON.stringify({ ttl: 86400 }),
      });
      if (!r.ok) throw new Error("Cloudflare " + r.status);
      const j = await r.json();
      const servers = (j.iceServers || []).map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }));
      body = { iceServers: servers, turn: true, provider: "cloudflare" };
      cache = { body, exp: Date.now() + 12 * 3600e3 };
    } else if (env("TURN_URLS")) {
      body = { iceServers: [...STUN, { urls: env("TURN_URLS").split(",").map((s) => s.trim()), username: env("TURN_USERNAME"), credential: env("TURN_CREDENTIAL") }], turn: true, provider: "custom" };
    }
  } catch (e) {
    body = { iceServers: STUN, turn: false, error: String(e.message || e) };
  }
  return new Response(JSON.stringify(body), { headers: CORS });
};

export const config = { path: "/api/ice" };
