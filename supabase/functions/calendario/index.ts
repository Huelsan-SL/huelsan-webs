// Huelsan · calendario de Google. Crea, actualiza y quita eventos en el calendario de la cuenta de Huelsan
// (la que autorizó el token). La usa el botón «Añadir al calendario» de los coches interesantes (gestion/extra.js).
// Solo para usuarios con sesión en la app. Un coche = un evento: el id del evento sale del id del lote, así que pulsar dos
// veces actualiza el mismo evento en lugar de duplicarlo.
// Secretos (Supabase → Edge Functions → Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN  (obligatorios; ver tools/google_calendar_token.py)
//   GOOGLE_CALENDAR_ID  (opcional). Sin él, la función crea sola un calendario aparte «Subastas Huelsan» en la cuenta
//   y guarda su id en ajustes «config/calendario». Solo toca calendarios creados por esta app (permiso calendar.app.created).
// Al desplegar: desactivar «Verify JWT» (la sesión se comprueba aquí, como en la función «estimar»).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const TZ = "Europe/Madrid";
const AVISO_MIN = 30; // aviso 30 minutos antes
const API = "https://www.googleapis.com/calendar/v3/calendars";
const NOMBRE_CAL = "Subastas Huelsan";

let cache: { t: string; exp: number } | null = null;
async function accessToken(): Promise<{ t?: string; error?: string; msg?: string }> {
  if (cache && cache.exp > Date.now() + 60_000) return { t: cache.t };
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    console.error("calendario token", r.status, JSON.stringify(j).slice(0, 300));
    // invalid_grant = el permiso caducó o se revocó: hay que volver a autorizar la cuenta
    return { error: "google_auth", msg: String(j.error_description || j.error || r.status).slice(0, 200) };
  }
  cache = { t: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return { t: cache.t };
}

// id de evento válido para Google (a-v y 0-9) y estable por lote
async function idEvento(loteId: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("huelsan:" + loteId));
  return "hs" + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
// calendario aparte: el de GOOGLE_CALENDAR_ID, el ya creado (ajustes «config/calendario») o uno nuevo
async function calendarioId(H: Record<string, string>): Promise<string> {
  const fijo = Deno.env.get("GOOGLE_CALENDAR_ID");
  if (fijo) return fijo;
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, url = Deno.env.get("SUPABASE_URL")!;
  const S = { apikey: srv, Authorization: "Bearer " + srv, "Content-Type": "application/json" };
  const q = await fetch(`${url}/rest/v1/ajustes?select=data&id=eq.config/calendario`, { headers: S });
  const f = q.ok ? await q.json().catch(() => []) : [];
  if (f[0]?.data?.id) return String(f[0].data.id);
  const r = await fetch(API, { method: "POST", headers: H, body: JSON.stringify({ summary: NOMBRE_CAL, timeZone: TZ, description: "Subastas que seguimos en la app de gestión de Huelsan" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) { console.error("calendario crear-calendario", r.status, JSON.stringify(j).slice(0, 300)); throw new Error("calendario:" + r.status); }
  await fetch(`${url}/rest/v1/ajustes`, { method: "POST", headers: { ...S, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: "config/calendario", data: { id: j.id, nombre: NOMBRE_CAL, creado: new Date().toISOString() } }) });
  return String(j.id);
}
const fechaOk = (s: unknown) => { const d = new Date(String(s ?? "")); return isNaN(+d) ? null : d; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const u = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", { headers: { authorization: req.headers.get("authorization") || "", apikey: req.headers.get("apikey") || "" } });
  if (!u.ok) return json({ error: "session_expired" }, 401);
  if (!Deno.env.get("GOOGLE_CLIENT_ID") || !Deno.env.get("GOOGLE_CLIENT_SECRET") || !Deno.env.get("GOOGLE_REFRESH_TOKEN"))
    return json({ error: "sin_credenciales", msg: "Falta conectar la cuenta de Google (secretos GOOGLE_* en Supabase)" }, 500);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "body" }, 400); }
  const accion = String(b.accion || "crear");

  const tk = await accessToken();
  if (!tk.t) return json({ error: tk.error, msg: tk.msg }, 502);
  const H = { Authorization: "Bearer " + tk.t, "Content-Type": "application/json" };
  let cal: string;
  try { cal = encodeURIComponent(await calendarioId(H)); } catch (e) { return json({ error: "google", msg: String(e).slice(0, 200) }, 502); }

  if (accion === "quitar") {
    const id = String(b.eventoId || "");
    if (!/^[a-v0-9]{5,100}$/.test(id)) return json({ error: "evento" }, 400);
    const r = await fetch(`${API}/${cal}/events/${id}`, { method: "DELETE", headers: H });
    if (r.ok || r.status === 404 || r.status === 410) return json({ ok: true });
    const tx = (await r.text()).slice(0, 300); console.error("calendario quitar", r.status, tx);
    return json({ error: "google", status: r.status, msg: tx }, 502);
  }

  if (accion !== "crear") return json({ error: "accion" }, 400);
  const loteId = String(b.loteId || "");
  const titulo = String(b.titulo || "").trim().slice(0, 200);
  const ini = fechaOk(b.inicio);
  if (!loteId || loteId.length > 200 || !titulo || !ini) return json({ error: "datos" }, 400);
  let fin = fechaOk(b.fin);
  if (!fin || +fin <= +ini) fin = new Date(+ini + 30 * 60_000);
  const evento = {
    summary: titulo,
    description: String(b.descripcion || "").slice(0, 4000),
    location: String(b.lugar || "").slice(0, 300),
    start: { dateTime: ini.toISOString(), timeZone: TZ },
    end: { dateTime: fin.toISOString(), timeZone: TZ },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: AVISO_MIN }] },
  };
  const id = await idEvento(loteId);
  let r = await fetch(`${API}/${cal}/events`, { method: "POST", headers: H, body: JSON.stringify({ id, ...evento }) });
  // ya existía (o estaba borrado con ese id): se actualiza y se deja confirmado
  if (r.status === 409) r = await fetch(`${API}/${cal}/events/${id}`, { method: "PATCH", headers: H, body: JSON.stringify({ ...evento, status: "confirmed" }) });
  if (!r.ok) { const tx = (await r.text()).slice(0, 300); console.error("calendario crear", r.status, tx); return json({ error: "google", status: r.status, msg: tx }, 502); }
  const j = await r.json().catch(() => ({}));
  return json({ ok: true, eventoId: id, enlace: j.htmlLink || "" });
});
