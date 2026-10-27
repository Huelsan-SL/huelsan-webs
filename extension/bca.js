/* Huelsan · Recogida BCA — se ejecuta dentro de la pestaña de BCA.
   Solo actúa en la ventana que abrió la extensión para recoger. */
(async () => {
  "use strict";
  const enviar = m => chrome.runtime.sendMessage(m);
  let r; try { r = await enviar({ tipo: "trabajo?" }); } catch (e) { return; }
  if (!r || !r.trabajo) return;
  if (window.__huelsanCorriendo) return; window.__huelsanCorriendo = true;

  const banner = (txt, color) => {
    let b = document.getElementById("huelsan-banner");
    if (!b) { b = document.createElement("div"); b.id = "huelsan-banner";
      b.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:12px 16px;font:600 15px system-ui,sans-serif;color:#fff;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.25)";
      document.documentElement.appendChild(b); }
    b.style.background = color || "#1f4e79"; b.textContent = "Huelsan · " + txt;
  };
  const sleep = ms => new Promise(res => setTimeout(res, ms));

  async function sesionIniciada() {
    const cal = await fetch(location.origin + "/buyer/facetedSearch/GetSaleCalendarViewModel?page=1&bq=salecountry_exact:ES&cultureCode=es", { method: "POST", credentials: "include" }).then(x => x.json());
    const sale = (cal.SaleCalendarViewModel || []).flatMap(g => g.Values)[0];
    if (!sale) return true; // sin subastas: no hay forma de saberlo, seguimos
    const v = await fetch(location.origin + "/buyer/facetedsearch/GetViewModel?bq=saleid_exact:" + sale.SaleId + "&saleHeader=true&cultureCode=es&sort=LotNumber&page=1", { method: "POST", credentials: "include" }).then(x => x.json());
    return !v.IsUserAnonymous;
  }

  try {
    banner("Comprobando la sesión de BCA…");
    let ok = false, avisado = false;
    const hasta = Date.now() + 10 * 60000;
    while (Date.now() < hasta) {
      try { ok = await sesionIniciada(); } catch (e) { ok = false; }
      if (ok) break;
      if (!avisado) { avisado = true; await enviar({ tipo: "sesion-bca", estado: "sin sesión", mensaje: "Esperando a que inicies sesión en BCA en la ventana abierta." }); }
      banner("Inicia sesión en BCA en esta ventana. La recogida empezará sola.", "#b54708");
      await sleep(10000);
    }
    if (!ok) { await enviar({ tipo: "fin", sinSesion: true, error: "No se inició sesión en BCA en 10 minutos. Vuelve a lanzar la recogida." }); banner("No se ha recogido nada: no había sesión de BCA.", "#b42318"); return; }
    await enviar({ tipo: "sesion-bca", estado: "iniciada" });

    banner("Recogiendo subastas y lotes… No cierres esta ventana (15–25 min).");
    const tic = setInterval(() => {
      const e = window.__huelsan.estado(); if (!e) return;
      const txt = e.estado === "fichas" ? `Leyendo fichas: ${e.hechas || 0} de ${e.total || "?"}` : e.estado === "lotes" ? "Leyendo los lotes de cada subasta…" : e.estado === "calendario" ? "Leyendo el calendario de subastas…" : "Preparando los datos…";
      banner(txt + " · No cierres esta ventana.");
      enviar({ tipo: "progreso", mensaje: txt }).catch(() => {});
    }, 5000);
    let res;
    try { res = await window.__huelsan.run(); } finally { clearInterval(tic); }
    if (res.sesion === "anonima") { await enviar({ tipo: "fin", sinSesion: true, error: "La sesión de BCA se cerró durante la recogida." }); banner("La sesión de BCA se cerró: vuelve a lanzar la recogida.", "#b42318"); return; }

    const partes = window.__huelsan.partes();
    for (let i = 0; i < partes.length; i++) {
      banner(`Guardando en la app: ${i + 1} de ${partes.length}…`);
      const a = await enviar({ tipo: "paquete", paquete: partes[i] });
      if (!a || !a.ok) throw new Error(a && a.msg || "No se pudo guardar");
    }
    await enviar({ tipo: "fin", resumen: res });
    banner(`Hecho: ${res.lotes} lotes de ${res.subastas.length} subastas. Puedes cerrar esta ventana.`, "#067647");
  } catch (e) {
    await enviar({ tipo: "fin", error: "La recogida falló: " + (e && e.message || e) }).catch(() => {});
    banner("La recogida falló: " + (e && e.message || e), "#b42318");
  }
})();
