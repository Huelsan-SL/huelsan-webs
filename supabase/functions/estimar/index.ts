// Huelsan · estimaciones con Gemini. Solo para usuarios con sesión (verify_jwt activado).
// La clave va en el secreto GEMINI_API_KEY de Supabase (Edge Functions → Secrets), nunca en las webs.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELOS: Record<string, string> = { rapida: "gemini-flash-lite-latest", alta: "gemini-flash-latest" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  // Solo usuarios con sesión de la app: se comprueba el token con el propio servicio de usuarios de Supabase
  const u = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", { headers: { authorization: req.headers.get("authorization") || "", apikey: req.headers.get("apikey") || "" } });
  if (!u.ok) return json({ error: "session_expired" }, 401);
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "sin_clave", msg: "Falta el secreto GEMINI_API_KEY en Supabase" }, 500);
  let body: { prompt?: string; calidad?: string };
  try { body = await req.json(); } catch { return json({ error: "body" }, 400); }
  const prompt = String(body.prompt || "");
  if (!prompt || prompt.length > 80000) return json({ error: "prompt" }, 400);
  const modelo = MODELOS[body.calidad || "rapida"] || MODELOS.rapida;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }),
  });
  if (r.status === 429) return json({ error: "rate_limited" }, 429);
  if (!r.ok) return json({ error: "gemini", status: r.status, msg: (await r.text()).slice(0, 300) }, 502);
  const j = await r.json();
  const texto = (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("").trim();
  try { return json({ data: JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, "")) }); }
  catch { return json({ error: "invalid_json", msg: texto.slice(0, 200) }, 502); }
});
