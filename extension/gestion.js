/* Huelsan · puente entre la app de gestión y la extensión.
   La app avisa con window.postMessage({huelsanExt:"recoger"|"abrir-bca"|"anuncio"…}) y recibe la respuesta igual. */
"use strict";
document.documentElement.dataset.huelsanExt = chrome.runtime.getManifest().version;
window.addEventListener("message", async e => {
  if (e.source !== window || !e.data || !e.data.huelsanExt || e.data.respuesta) return;
  const tipo = e.data.huelsanExt;
  if (!["recoger", "abrir-bca", "info", "foto-bca", "anuncio"].includes(tipo)) return;
  let r; try { r = await chrome.runtime.sendMessage({ tipo, origen: "app", docId: e.data.docId, ancho: e.data.ancho, anuncio: e.data.anuncio, url: e.data.url }); } catch (err) { r = { ok: false, msg: String(err && err.message || err) }; }
  window.postMessage({ huelsanExt: tipo, respuesta: true, id: e.data.id, ...(r || {}) }, location.origin);
});
