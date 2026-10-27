/* Huelsan · panel de anuncio en los portales (Wallapop, Milanuncios, coches.net…).
   Muestra el anuncio preparado en gestion.huelsanautomocion.com/anuncios con botones para copiar cada dato,
   y un «Rellenar» que intenta poner título, descripción, precio, km, etc. en los campos vacíos de la página.
   Nunca envía ni publica nada: el anuncio lo revisas y lo publicas tú. */
"use strict";
(async () => {
  if (window.top !== window) return;
  let r; try { r = await chrome.runtime.sendMessage({ tipo: "anuncio?" }); } catch (e) { return; }
  const A = r && r.anuncio; if (!A) return;

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
  const sh = host.attachShadow({ mode: "closed" });
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const filas = [["Título", A.titulo], ["Descripción", A.descripcion], ...(A.campos || [])];
  sh.innerHTML = `<style>
    :host{all:initial}
    .p{font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1b1d20;background:#fff;border:1px solid #dcdad5;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);width:340px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden}
    .h{background:#1b1d20;color:#f0efed;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px}
    .h b{font-size:13px;letter-spacing:.08em}.h small{color:#cdb084;display:block;font-size:12px}
    .c{overflow:auto;padding:8px 12px;display:grid;gap:6px}
    .f{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:start;border-bottom:1px solid #eee;padding-bottom:6px}
    .f span{font-size:11px;color:#5f6368;text-transform:uppercase;letter-spacing:.06em;display:block}
    .f div{white-space:pre-wrap;overflow:hidden;max-height:3.6em;overflow-wrap:anywhere}
    button{font:inherit;font-size:12.5px;font-weight:600;border:1px solid #dcdad5;background:#fff;border-radius:7px;padding:5px 9px;cursor:pointer;color:#1b1d20}
    button.pri{background:#8c6e44;border-color:#8c6e44;color:#fff}
    .h button{background:transparent;color:#f0efed;border-color:rgba(255,255,255,.3)}
    .pie{padding:8px 12px;border-top:1px solid #eee;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .m{font-size:12px;color:#5f6368;width:100%}
    a{color:#8c6e44}
  </style>
  <div class="p" role="dialog" aria-label="Anuncio de Huelsan">
    <div class="h"><div><b>HUELSAN · ANUNCIO</b><small>${esc(A.coche || A.titulo || "")}</small></div><span><button id="min" title="Minimizar">–</button> <button id="x" title="Quitar el anuncio preparado">✕</button></span></div>
    <div class="c" id="c">${filas.map(([k, v], i) => `<div class="f"><div><span>${esc(k)}</span>${esc(v)}</div><button data-i="${i}">Copiar</button></div>`).join("")}
      ${(A.fotos || []).length ? `<div class="f"><div><span>Fotos de estudio (${A.fotos.length})</span>${A.fotos.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(" · ")}</div></div>` : ""}
    </div>
    <div class="pie"><button class="pri" id="rell">Rellenar campos vacíos</button><span class="m" id="m">Revisa siempre el anuncio antes de publicarlo. Las fotos: descárgalas en «Anuncios» (ZIP) y súbelas aquí.</span></div>
  </div>`;
  document.documentElement.appendChild(host);
  const $ = s => sh.querySelector(s), m = t => { $("#m").textContent = t; };
  sh.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.i != null) { try { await navigator.clipboard.writeText(String(filas[+b.dataset.i][1] ?? "")); b.textContent = "Copiado"; setTimeout(() => b.textContent = "Copiar", 1500); } catch (err) { m("No se ha podido copiar: selecciona el texto a mano."); } return; }
    if (b.id === "min") { const c = $("#c"), p = $(".pie"); const h = c.style.display !== "none"; c.style.display = p.style.display = h ? "none" : ""; b.textContent = h ? "+" : "–"; return; }
    if (b.id === "x") { await chrome.runtime.sendMessage({ tipo: "anuncio-borrar" }).catch(() => {}); host.remove(); return; }
    if (b.id === "rell") { const n = rellenar(); m(n ? `${n} campos rellenados. Revisa los desplegables (marca, modelo, combustible…) y las fotos.` : "No he encontrado campos vacíos que reconozca en esta página. Usa los botones «Copiar»."); }
  });

  /* Relleno genérico: reconoce campos por su nombre, etiqueta o texto de ayuda. Solo escribe en campos vacíos. */
  function rellenar() {
    const v = Object.fromEntries((A.campos || []).map(([k, x]) => [k, String(x)]));
    const reglas = [
      [/t[ií]tulo|title|asunto/, A.titulo],
      [/descrip|description|texto del anuncio|cuéntanos/, A.descripcion],
      [/precio|price|importe/, A.precio ? String(A.precio) : ""],
      [/kil[oó]metr|\bkms?\b|mileage/, v["Kilómetros"]],
      [/\ba[ñn]o\b|year|matriculaci/, v["Año"]],
      [/versi[oó]n|acabado/, v["Versión"]],
      [/\bmarca\b|brand|make/, v["Marca"]],
      [/\bmodelo\b|\bmodel\b/, v["Modelo"]],
      [/potencia|\bcv\b|power|\bhp\b/, v["Potencia (CV)"]],
      [/color/, v["Color"]],
      [/plazas|asientos|seats/, v["Plazas"]],
    ];
    const etiqueta = el => {
      const t = [el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("data-testid")];
      if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t.push(l.textContent); }
      const l2 = el.closest("label"); if (l2) t.push(l2.textContent);
      const by = el.getAttribute("aria-labelledby"); if (by) by.split(/\s+/).forEach(id => { const x = document.getElementById(id); if (x) t.push(x.textContent); });
      return t.filter(Boolean).join(" ").toLowerCase();
    };
    const poner = (el, val) => {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    let n = 0; const usados = new Set();
    const campos = [...document.querySelectorAll("input:not([type]),input[type=text],input[type=number],input[type=search],textarea")]
      .filter(el => !el.disabled && !el.readOnly && el.offsetParent !== null && !el.value);
    for (const el of campos) {
      const t = etiqueta(el); if (!t) continue;
      for (const [re, val] of reglas) {
        if (!val || usados.has(re) || !re.test(t)) continue;
        if (el.type === "number" && !/^\d+$/.test(val.replace(/\./g, ""))) continue;
        poner(el, el.type === "number" ? val.replace(/\./g, "") : val); usados.add(re); n++; break;
      }
    }
    if (!usados.has(reglas[1][0])) { const ta = campos.find(el => el.tagName === "TEXTAREA" && !el.value); if (ta && A.descripcion) { poner(ta, A.descripcion); n++; } }
    return n;
  }
})();
