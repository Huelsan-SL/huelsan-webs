/* Huelsan · Gestión: permite instalar la app en el móvil y abrirla aunque falle la conexión.
   Siempre intenta la red primero (así nunca se queda una versión vieja) y solo usa la copia si no hay red.
   No toca los datos: Supabase, BCA y Gemini van siempre directos. */
const CACHE = "huelsan-gestion-v3";
const BASE = ["/", "/index.html", "/adaptador.js", "/extra.js", "/favicon.svg", "/manifest.webmanifest", "/iconos/icono-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (/\.(zip|bin)$/.test(u.pathname) || u.pathname.startsWith("/.netlify/")) return; // el acceso de Netlify va siempre directo
  e.respondWith(fetch(r).then(res => {
    if (res.ok && res.type === "basic") { const copia = res.clone(); caches.open(CACHE).then(c => c.put(r, copia)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === "navigate" ? caches.match("/") : Response.error()))));
});
