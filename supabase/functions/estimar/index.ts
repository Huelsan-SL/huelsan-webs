// Huelsan · estimaciones con Gemini. Solo para usuarios con sesión.
// La clave va en el secreto GEMINI_API_KEY de Supabase (Edge Functions → Secrets), nunca en las webs.
// 10/11/2026: reintentos con espera, modelo alternativo si el principal falla, límite de respuesta amplio
// y registro del motivo de cada error (Supabase → Edge Functions → estimar → Logs).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
// por orden: si uno falla (sobrecarga, modelo retirado…) se prueba el siguiente
const MODELOS: Record<string, string[]> = {
  rapida: ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
  alta: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"],
};
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const limpiar = (t: string) => t.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const u = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", { headers: { authorization: req.headers.get("authorization") || "", apikey: req.headers.get("apikey") || "" } });
  if (!u.ok) return json({ error: "session_expired" }, 401);
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "sin_clave", msg: "Falta el secreto GEMINI_API_KEY en Supabase" }, 500);
  let body: { prompt?: string; calidad?: string };
  try { body = await req.json(); } catch { return json({ error: "body" }, 400); }
  const prompt = String(body.prompt || "");
  if (!prompt || prompt.length > 80000) return json({ error: "prompt" }, 400);
  const modelos = MODELOS[body.calidad || "rapida"] || MODELOS.rapida;
  let ultimo: { error: string; status?: number; msg?: string } = { error: "gemini" };
  let limitado = false;
  for (const modelo of modelos) {
    for (let intento = 0; intento < 2; intento++) {
      let r: Response;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 32768 } }),
        });
      } catch (e) { ultimo = { error: "red", msg: String(e).slice(0, 200) }; console.error("estimar", modelo, "red", ultimo.msg); await espera(800); continue; }
      if (r.ok) {
        const j = await r.json();
        const cand = j.candidates?.[0];
        const texto = (cand?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("").trim();
        try { return json({ data: JSON.parse(limpiar(texto)), modelo }); }
        catch {
          ultimo = { error: "invalid_json", msg: `${cand?.finishReason || ""} ${texto.slice(0, 160)}` };
          console.error("estimar", modelo, "invalid_json", cand?.finishReason, texto.length);
          break; // respuesta cortada o rara: probar el siguiente modelo
        }
      }
      const txt = (await r.text()).slice(0, 400);
      ultimo = { error: "gemini", status: r.status, msg: txt };
      console.error("estimar", modelo, r.status, txt);
      if (r.status === 429) { limitado = true; await espera(1500 * (intento + 1)); continue; }
      if (r.status >= 500) { await espera(1000 * (intento + 1)); continue; }
      break; // 400/403/404: este modelo no sirve, siguiente
    }
  }
  if (limitado && ultimo.status === 429) return json({ error: "rate_limited", msg: ultimo.msg }, 429);
  return json(ultimo, 502);
});
