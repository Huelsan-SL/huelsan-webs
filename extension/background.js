/* Huelsan · Recogida BCA — trabajo de fondo.
   Abre BCA en una ventana, espera a que haya sesión, recibe los lotes del colector y los guarda en Supabase
   (colección «entrantes», que la app de gestión incorpora sola al abrirse). */
"use strict";
const SB_URL = "https://ajxdzchffqaphkmetswx.supabase.co";
const SB_KEY = "sb_publishable_8n9P6btJois-b7B3-kNTTQ_YG6D4S1X";
const BCA_URL = "https://es.bca-europe.com/buyer/facetedSearch/saleCalendar";
const MAX_MIN = 45; // una recogida que lleva más de esto se da por muerta

/* ---------- sesión propia de la extensión (se inicia una vez desde el icono) ---------- */
async function getSes() { return (await chrome.storage.local.get("sesion")).sesion || null; }
async function setSes(s) { s ? await chrome.storage.local.set({ sesion: s }) : await chrome.storage.local.remove("sesion"); }
async function auth(grant, body) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=${grant}`, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error_description || j.msg || j.message || "HTTP " + r.status), { status: r.status });
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: j.user && j.user.email };
}
let refrescando = null;
async function token() {
  const s = await getSes();
  if (!s) throw new Error("La extensión no tiene sesión: pulsa el icono de Huelsan y entra con tu usuario.");
  if (s.expires_at - Date.now() / 1000 > 120) return s.access_token;
  if (!refrescando) refrescando = auth("refresh_token", { refresh_token: s.refresh_token })
    .then(async n => { await setSes({ ...n, email: n.email || s.email }); return n.access_token; })
    .catch(async e => { if (e.status === 400 || e.status === 401) await setSes(null); throw e; })
    .finally(() => { refrescando = null; });
  return refrescando;
}
async function rest(path, opt = {}) {
  const r = await fetch(SB_URL + path, { ...opt, headers: { apikey: SB_KEY, Authorization: "Bearer " + await token(), "Content-Type": "application/json", ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`);
  return r;
}
const upsert = (tabla, filas) => rest(`/rest/v1/${tabla}?on_conflict=id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(filas) });
const ajuste = (id, data) => upsert("ajustes", [{ id, data }]);

/* ---------- trabajo en curso ---------- */
async function getJob() { return (await chrome.storage.session.get("job")).job || null; }
async function setJob(j) { j ? await chrome.storage.session.set({ job: j }) : await chrome.storage.session.remove("job"); }
const vivo = j => j && !j.terminado && Date.now() - j.inicio < MAX_MIN * 60000;

async function iniciar(origen) {
  const j = await getJob();
  if (vivo(j)) { try { await chrome.windows.update(j.windowId, { focused: true }); } catch (e) {} return { ok: false, msg: "Ya hay una recogida en marcha." }; }
  await token(); // falla pronto si no hay sesión
  const w = await chrome.windows.create({ url: BCA_URL, type: "popup", width: 1150, height: 820, focused: origen !== "alarma" });
  const tabId = w.tabs && w.tabs[0] && w.tabs[0].id;
  await setJob({ tabId, windowId: w.id, origen, inicio: Date.now(), terminado: false });
  await ajuste("recogida/actual", { estado: "solicitada", solicitada: new Date().toISOString(), mensaje: "Abriendo BCA…" }).catch(() => {});
  return { ok: true, msg: "Recogida lanzada: se ha abierto BCA en una ventana." };
}
async function abrirBCA() {
  const w = await chrome.windows.create({ url: BCA_URL, type: "popup", width: 1150, height: 820, focused: true });
  return { ok: true, msg: "BCA abierto. Inicia sesión en esa ventana." };
}
function aviso(titulo, texto) {
  try { chrome.notifications.create({ type: "basic", iconUrl: "icono128.png", title: titulo, message: texto }); } catch (e) {}
}
let ultimoProgreso = 0;

chrome.runtime.onMessage.addListener((m, sender, responder) => {
  (async () => {
    const tabId = sender.tab && sender.tab.id;
    switch (m && m.tipo) {
      case "login": { const s = await auth("password", { email: m.email, password: m.password }); await setSes(s); return { ok: true, email: s.email }; }
      case "logout": await setSes(null); return { ok: true };
      case "info": { const s = await getSes(); const { auto, hora } = await chrome.storage.local.get(["auto", "hora"]); return { email: s && s.email, auto: !!auto, hora: hora || "08:45", job: await getJob() }; }
      case "auto": { await chrome.storage.local.set({ auto: !!m.auto, hora: m.hora || "08:45" }); await programar(); return { ok: true }; }
      case "recoger": return await iniciar(m.origen || "app");
      case "abrir-bca": return await abrirBCA();
      case "trabajo?": { const j = await getJob(); return { trabajo: !!(vivo(j) && j.tabId === tabId) }; }
      case "sesion-bca": {
        await ajuste("recogida/sesion", { estado: m.estado, comprobada: new Date().toISOString(), mensaje: m.mensaje || "" }).catch(() => {});
        if (m.estado === "iniciada") await ajuste("recogida/actual", { estado: "en curso", inicio: new Date().toISOString(), mensaje: "Recogiendo subastas y lotes de BCA…" }).catch(() => {});
        return { ok: true };
      }
      case "progreso": {
        if (Date.now() - ultimoProgreso > 30000) { ultimoProgreso = Date.now(); const j = await getJob();
          await ajuste("recogida/actual", { estado: "en curso", inicio: new Date(j ? j.inicio : Date.now()).toISOString(), mensaje: m.mensaje }).catch(() => {}); }
        return { ok: true };
      }
      case "miniatura": {
        const r = await fetch(m.src); if (!r.ok) throw new Error("img " + r.status);
        const bm = await createImageBitmap(await r.blob()); const W = 220, H = Math.round(bm.height * W / bm.width);
        const c = new OffscreenCanvas(W, H); c.getContext("2d").drawImage(bm, 0, 0, W, H);
        const bytes = new Uint8Array(await (await c.convertToBlob({ type: "image/jpeg", quality: 0.55 })).arrayBuffer());
        let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return { ok: true, dataUrl: "data:image/jpeg;base64," + btoa(bin) };
      }
      case "paquete": {
        const p = m.paquete;
        if (p.coleccion === "miniaturas") await upsert("miniaturas", [{ id: p.id, data: p.data }]);
        else await upsert("ajustes", [{ id: "entrantes/" + p.id, data: p.data }]);
        return { ok: true };
      }
      case "fin": {
        const j = await getJob(); const r = m.resumen || {};
        const doc = m.error
          ? { estado: m.sinSesion ? "sin sesión" : "error", fin: new Date().toISOString(), mensaje: m.error }
          : { estado: "listo", inicio: new Date(j ? j.inicio : Date.now()).toISOString(), fin: new Date().toISOString(), subastas: (r.subastas || []).length, lotes: r.lotes || 0, conSalida: r.conSalida || 0,
              mensaje: `${(r.subastas || []).length} subastas y ${(r.lotes || 0).toLocaleString("es-ES")} lotes (${r.conSalida || 0} con precio de salida). Se incorporan al abrir la app.` };
        await ajuste("recogida/actual", doc).catch(() => {});
        if (j) { await setJob({ ...j, terminado: true }); if (!m.error && j.windowId) { try { await chrome.windows.remove(j.windowId); } catch (e) {} } }
        aviso(m.error ? "Recogida de BCA sin terminar" : "Recogida de BCA terminada", doc.mensaje);
        return { ok: true };
      }
      default: return { ok: false, msg: "Mensaje desconocido" };
    }
  })().then(responder, e => responder({ ok: false, msg: String(e && e.message || e) }));
  return true;
});

/* ---------- recogida automática diaria (si el navegador está abierto) ---------- */
async function programar() {
  await chrome.alarms.clear("diaria");
  const { auto, hora } = await chrome.storage.local.get(["auto", "hora"]);
  if (!auto) return;
  const [hh, mm] = String(hora || "08:45").split(":").map(Number);
  const t = new Date(); t.setHours(hh, mm, 0, 0); if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
  chrome.alarms.create("diaria", { when: t.getTime(), periodInMinutes: 24 * 60 });
}
chrome.alarms.onAlarm.addListener(a => { if (a.name === "diaria") iniciar("alarma").catch(e => aviso("Recogida automática de BCA", String(e.message || e))); });
chrome.runtime.onInstalled.addListener(programar);
chrome.runtime.onStartup.addListener(programar);
