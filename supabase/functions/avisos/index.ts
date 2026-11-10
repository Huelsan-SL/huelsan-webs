// Huelsan · avisos por correo de lo que ha llegado y aún no se ha avisado:
//   · coincidencias de las búsquedas clave (ajustes «coincidencias/…» con avisado=false)
//   · reseñas de clientes recibidas (ajustes «resenas/…» con estado «recibida» y avisado=false)
// La llama cada 15 minutos la tarea «huelsan-avisos» de pg_cron (función lanzar_avisos) solo si hay algo pendiente.
// No recibe datos: lee lo pendiente con permisos de servidor, manda un único correo y lo marca como avisado,
// así que nadie puede usarla para enviar correos a su antojo.
// Al desplegar: desactivar «Verify JWT». Secretos: RESEND_API_KEY (obligatorio), AVISO_EMAIL, AVISO_FROM (opcionales).
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const num = (n: unknown) => n == null || n === "" ? "" : String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fecha = (s: unknown) => { if (!s) return ""; const d = new Date(String(s)); if (isNaN(+d)) return ""; return d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
// App de trabajo (desde el 10/11/2026 se trabaja en la gestión de prueba)
const APP = "https://prueba--huelsan-gestion.netlify.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "sin_clave" }, 500);
  const H = { apikey: srv, Authorization: "Bearer " + srv, "Content-Type": "application/json" };
  const leer = async (q: string) => { const r = await fetch(`${url}/rest/v1/ajustes?select=id,data&${q}`, { headers: H }); return r.ok ? await r.json() : []; };

  const coin: { id: string; data: any }[] = await leer("id=like.coincidencias/*&data->>avisado=eq.false&order=id&limit=300");
  const res: { id: string; data: any }[] = await leer("id=like.resenas/*&data->>avisado=eq.false&data->>estado=eq.recibida&limit=50");

  // limpieza: coincidencias de más de 60 días
  const corte = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  await fetch(`${url}/rest/v1/ajustes?id=like.coincidencias/*&data->>creado=lt.${corte}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });

  if (!coin.length && !res.length) return json({ ok: true, nada: true });

  // por búsqueda
  const porB = new Map<string, any[]>();
  for (const c of coin) { const k = c.data.busquedaNombre || c.data.busqueda || "Búsqueda"; if (!porB.has(k)) porB.set(k, []); porB.get(k)!.push(c.data); }
  let html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#14243A;max-width:620px">`;
  let texto = "";
  if (coin.length) {
    html += `<h2 style="color:#0E2A47;margin:0 0 4px">${coin.length} coche${coin.length > 1 ? "s" : ""} encaja${coin.length > 1 ? "n" : ""} con vuestras búsquedas clave</h2>
      <p style="margin:0 0 14px;color:#5A6B7F">Están apartados en la app, pestaña «Búsquedas».</p>`;
    for (const [b, lista] of porB) {
      html += `<h3 style="margin:16px 0 6px;color:#0E2A47">${esc(b)} <span style="color:#5A6B7F;font-weight:normal">(${lista.length})</span></h3><table style="border-collapse:collapse;width:100%">`;
      texto += `\n${b}\n`;
      for (const c of lista) {
        const datos = [c.anio, c.km != null ? num(c.km) + " km" : "", c.cv ? c.cv + " CV" : "", c.combustible].filter(Boolean).join(" · ");
        const sub = [c.sede, c.subasta, c.cierre ? "cierra " + fecha(c.cierre) : ""].filter(Boolean).join(" · ");
        html += `<tr><td style="padding:8px 0;border-top:1px solid #DCE3EB"><b>${esc(c.titulo)}</b>${c.matricula ? ` <span style="color:#5A6B7F">${esc(c.matricula)}</span>` : ""}<br><span style="color:#5A6B7F;font-size:13px">${esc(datos)}${sub ? "<br>" + esc(sub) : ""}</span></td>
          <td style="padding:8px 0;border-top:1px solid #DCE3EB;text-align:right;white-space:nowrap;vertical-align:top"><b>${c.precio ? num(c.precio) + " €" : ""}</b>${c.url ? `<br><a href="${esc(c.url)}" style="color:#178643;font-size:13px">Ver en BCA</a>` : ""}</td></tr>`;
        texto += `- ${c.titulo} · ${datos}${c.precio ? " · " + num(c.precio) + " €" : ""}${sub ? " · " + sub : ""}\n`;
      }
      html += `</table>`;
    }
  }
  if (res.length) {
    html += `<h2 style="color:#0E2A47;margin:22px 0 4px">${res.length} reseña${res.length > 1 ? "s" : ""} nueva${res.length > 1 ? "s" : ""} de clientes</h2>
      <p style="margin:0 0 10px;color:#5A6B7F">No salen en la web hasta que las aprobéis en la app (Menú → Reseñas).</p>`;
    for (const r of res) {
      const x = r.data.respuesta || {}; const n = Math.max(1, Math.min(5, Number(x.estrellas) || 0));
      html += `<div style="background:#F3F6F9;border-radius:10px;padding:10px 14px;margin-bottom:8px"><div style="color:#C29B57">${"★".repeat(n)}${"☆".repeat(5 - n)}</div><div style="white-space:pre-line">${esc(x.texto)}</div><div style="color:#5A6B7F;font-size:13px;margin-top:4px">${esc(x.nombre)}${r.data.coche ? " · " + esc(r.data.coche) : ""}</div></div>`;
      texto += `\nReseña ${n}/5 de ${x.nombre}: ${x.texto}\n`;
    }
  }
  html += `<p style="margin:18px 0 0"><a href="${APP}" style="color:#178643;font-weight:bold">Abrir la app de gestión</a></p></div>`;

  const asunto = coin.length
    ? `${coin.length} coche${coin.length > 1 ? "s" : ""} para ${[...porB.keys()].slice(0, 2).join(", ")}${porB.size > 2 ? "…" : ""}${res.length ? ` y ${res.length} reseña${res.length > 1 ? "s" : ""}` : ""}`
    : `${res.length} reseña${res.length > 1 ? "s" : ""} nueva${res.length > 1 ? "s" : ""} de clientes`;
  const para = (Deno.env.get("AVISO_EMAIL") || "huelsan26@gmail.com").split(",").map((s) => s.trim()).filter(Boolean);
  const envio = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("AVISO_FROM") || "Huelsan Automoción <avisos@huelsanautomocion.com>", to: para, subject: asunto.slice(0, 150), html, text: texto }),
  });
  if (!envio.ok) return json({ error: "correo", status: envio.status, msg: (await envio.text()).slice(0, 300) }, 502);

  for (const f of [...coin, ...res]) {
    await fetch(`${url}/rest/v1/ajustes?id=eq.${encodeURIComponent(f.id)}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ data: { ...f.data, avisado: true } }) });
  }
  return json({ ok: true, coincidencias: coin.length, resenas: res.length });
});
