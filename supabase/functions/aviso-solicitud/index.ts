// Huelsan · aviso por correo cuando llega una solicitud del formulario de la web pública.
// La web la llama justo después de guardar la solicitud (función enviar_solicitud) y solo pasa su id.
// Esta función lee la solicitud con permisos de servidor, comprueba que es reciente y que no se ha avisado ya,
// envía el correo con Resend y la marca como avisada. Así nadie puede usarla para mandar correos a su antojo.
//
// Al desplegar: desactivar «Verify JWT» (la llama la web pública, sin sesión).
// Secretos (Edge Functions → Secrets):
//   RESEND_API_KEY  clave de Resend (obligatoria)
//   AVISO_EMAIL     a quién avisar; varios separados por comas (por defecto huelsan26@gmail.com)
//   AVISO_FROM      remitente; hasta verificar el dominio en Resend usar «Huelsan web <onboarding@resend.dev>»
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let id = "";
  try { id = String((await req.json()).id || ""); } catch { return json({ error: "body" }, 400); }
  if (!/^web-\d{14}-[0-9a-f]{6}$/.test(id)) return json({ error: "id" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "sin_clave", msg: "Falta el secreto RESEND_API_KEY en Supabase" }, 500);
  const H = { apikey: srv, Authorization: "Bearer " + srv, "Content-Type": "application/json" };

  const r = await fetch(`${url}/rest/v1/demandas?id=eq.${encodeURIComponent(id)}&select=data`, { headers: H });
  if (!r.ok) return json({ error: "db", status: r.status }, 502);
  const fila = (await r.json())[0];
  if (!fila) return json({ error: "no_existe" }, 404);
  const d = fila.data || {};
  if (d.origen !== "web") return json({ error: "origen" }, 400);
  if (d.avisado) return json({ ok: true, ya: true });
  if (Date.now() - Date.parse(d.creado || 0) > 30 * 60 * 1000) return json({ error: "antigua" }, 400);

  const filas: [string, unknown][] = [
    ["Nombre", d.nombre], ["Teléfono", d.telefono], ["Correo", d.email], ["Reside en", d.residencia],
  ];
  const tabla = filas.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#5A6B7F">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join("");
  const tel = String(d.telefono || "").replace(/\D/g, "");
  const tel34 = tel.length === 9 ? "34" + tel : tel;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#14243A;max-width:560px">
    <h2 style="color:#0E2A47;margin:0 0 6px">Nueva solicitud desde la web</h2>
    <p style="margin:0 0 14px;color:#5A6B7F">Un cliente ha rellenado «¿Qué coche estás buscando?». Ya está en la app, pestaña Clientes.</p>
    <table style="border-collapse:collapse;margin-bottom:14px">${tabla}</table>
    <div style="background:#F3F6F9;border-radius:10px;padding:12px 14px;white-space:pre-line">${esc(d.notas || "Sin más detalles.")}</div>
    <p style="margin:16px 0 0">${tel ? `<a href="tel:+${tel34}" style="color:#178643;font-weight:bold">Llamar</a> · <a href="https://wa.me/${tel34}" style="color:#178643;font-weight:bold">WhatsApp</a>` : ""}${d.email ? ` · <a href="mailto:${esc(d.email)}" style="color:#178643;font-weight:bold">Responder por correo</a>` : ""}</p>
  </div>`;
  const texto = `Nueva solicitud desde la web\n\n${filas.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${d.notas || ""}`;

  const para = (Deno.env.get("AVISO_EMAIL") || "huelsan26@gmail.com").split(",").map((s) => s.trim()).filter(Boolean);
  const envio = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("AVISO_FROM") || "Huelsan web <onboarding@resend.dev>",
      to: para,
      reply_to: d.email || undefined,
      subject: `Nueva solicitud web: ${String(d.nombre || "").slice(0, 60)}${d.marca ? " · " + String(d.marca).slice(0, 60) : ""}`,
      html, text: texto,
    }),
  });
  if (!envio.ok) return json({ error: "correo", status: envio.status, msg: (await envio.text()).slice(0, 300) }, 502);

  await fetch(`${url}/rest/v1/demandas?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ data: { ...d, avisado: true } }),
  });
  return json({ ok: true });
});
