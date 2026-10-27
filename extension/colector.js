/* Huelsan · colector de BCA (misma lógica que la recogida con Claude). Se ejecuta en la pestaña de BCA con la sesión del usuario. */
window.__huelsan = (() => {
  const fetch = (u, o) => globalThis.fetch(typeof u === "string" && u.startsWith("/") ? location.origin + u : u, Object.assign({ credentials: "include" }, o || {}));
  // Presenciales: solo estas ciudades. Online: todas las de España ("España Online" = Alphabet y otros; "BCA Direct Multicentro").
  const CIUDADES_DEF = ["Madrid", "Sevilla", "Alicante", "Barcelona"];
  const ES_ONLINE = s => /online|multicentro|internet/i.test(String(s || ""));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // BCA codifica las fechas /Date(ms)/ con una hora de más respecto a la hora real de Madrid
  const ms = x => { const m = x && String(x).match(/\/Date\((-?\d+)\)\//); return m && +m[1] > 0 ? new Date(+m[1] - 3600000).toISOString() : null; };
  // "09/10/2026 9:00:00" viene en hora UTC
  const utcStr = s => { const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{1,2}):(\d{2})/); return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])).toISOString() : null; };
  // "Final: 09/10 11:00" / "Comienzo: 07/10 10:00" en hora de Madrid
  const madStr = (s, ref) => { const m = String(s || "").match(/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/); if (!m) return null; const y = ref ? new Date(ref).getFullYear() : new Date().getFullYear(); return new Date(y, +m[2] - 1, +m[1], +m[3], +m[4]).toISOString(); };
  const zona = u => { if (!u) return null; let z = String(u).split(/[;,]/)[0].trim(); if (/^bca\s/i.test(z)) z = "BCA " + z.slice(4).replace(/\b\w/g, c => c.toUpperCase()); return z || null; };
  const normFuel = s => { s = String(s || "").toLowerCase(); if (/enchuf|plug|phev/.test(s)) return "Híbrido enchufable"; if (/bev|100% el|^el[eé]ctr|^electric/.test(s)) return "Eléctrico"; if (/h[ií]brid|hev|mhev/.test(s)) return "Híbrido"; if (/bifuel|glp|gnc|lpg|cng/.test(s)) return "GLP/GNC"; if (/di[eé]sel/.test(s)) return "Diésel"; if (/gasol|petrol/.test(s)) return "Gasolina"; return s ? s[0].toUpperCase() + s.slice(1) : null; };
  const VAN_RE = /^(?:\S+\s+)?(berlingo|partner|rifter|kangoo|express|caddy|combo|dobl[oó]|fiorino|citan|townstar|transit|tourneo|jumpy|jumper|expert|boxer|scudo|ducato|proace|vito|sprinter|trafic|master|vivaro|movano|transporter|crafter|spacetourer|traveller|daily|nv200|primastar|talento|deliver|dokker|nemo|bipper|qubo|inca|zafira life|e-?nv200|e-?berlingo|e-?partner|e-?expert|e-?jumpy|e-?transit)\b/i;
  const tipoOf = (carr, txt, plazas, tv, modelo) => { const c = (carr || "").toLowerCase(), m = (txt || "").toLowerCase();
    if (VAN_RE.test(String(modelo || "").trim()) && !/grand c4|\bc4\b|chasis|cami[oó]n/i.test(String(modelo || "") + " " + c)) return "Furgoneta";
    if (/van|furg|comercial|chasis|cami/.test(c) || /lcv|van/i.test(tv || "")) return "Comercial";
    if (/4x4|4motion|quattro|xdrive|4wd|awd|allgrip|4matic/.test(m)) return "4x4";
    if (/todoterreno|suv|crossover/.test(c + " " + m)) return "SUV";
    if (/familiar|break|estate|touring|ranchera/.test(c)) return "Familiar";
    if (/cabrio|descapot|roadster|convertible/.test(c)) return "Descapotable";
    if (/coup[eé]|deportiv/.test(c)) return "Deportivo";
    if (/monovol|mpv/.test(c) || (+plazas >= 7)) return "Monovolumen";
    if (/fiesta|ibiza|polo|corsa|clio|\b20[678]\b|\bc3\b|yaris|i10|i20|picanto|\brio\b|sandero|micra|\bup\b|aygo|twingo|panda|\b500\b|swift|citigo|fabia|mazda2|\bka\b|toledo/.test(m)) return "Utilitario";
    if (/golf|le[oó]n|astra|focus|m[eé]gane|\bc4\b|\b308\b|auris|corolla|civic|i30|ceed|octavia|\ba3\b|serie 1|clase a|mazda3|scala|tipo|pulsar|kamiq/.test(m)) return "Compacto";
    return c && c !== "other" ? "Berlina" : null; };
  const yn = v => v == null ? null : (/^(s[ií]|yes)/i.test(v) ? true : (/^no/i.test(v) ? false : null));
  const pos = v => (+v > 0 ? +v : null);
  async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) { it._err = String(e); } await sleep(100); } })); }
  async function thumb(src) {
    // En la extensión, si la pestaña no puede leer la imagen, la pide el proceso de fondo (tiene permiso para bcaimage)
    try { return await thumbLocal(src); } catch (e) {
      if (globalThis.chrome && chrome.runtime && chrome.runtime.sendMessage) { const r = await chrome.runtime.sendMessage({ tipo: "miniatura", src }); if (r && r.ok) return r.dataUrl; }
      throw e; }
  }
  async function thumbLocal(src) {
    const r = await fetch(src); if (!r.ok) throw new Error("img");
    const bm = await createImageBitmap(await r.blob()); const W = 220, H = Math.round(bm.height * W / bm.width);
    const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").drawImage(bm, 0, 0, W, H); return c.toDataURL("image/jpeg", 0.55);
  }
  async function run(opts = {}) {
    const ciudades = (opts.ciudades || CIUDADES_DEF).map(s => s.toLowerCase()); const dias = opts.dias || 7;
    const H = window.__H = { inicio: new Date().toISOString(), estado: "calendario", sesion: null, subastas: [], lotes: [], minis: {} };
    const limite = Date.now() + dias * 86400000;
    let cal = [];
    for (let p = 1; p <= 30; p++) {
      const r = await fetch("/buyer/facetedSearch/GetSaleCalendarViewModel?page=" + p + "&bq=salecountry_exact:ES&cultureCode=es", { method: "POST" }).then(r => r.json());
      const v = r.SaleCalendarViewModel.flatMap(g => g.Values); if (!v.length) break; cal = cal.concat(v); if (v.length < 10) break;
    }
    const sales = cal.filter(x => { const on = ES_ONLINE(x.SaleLocation); if (on && opts.online === false) return false; if (!on && !ciudades.includes(String(x.SaleLocation || "").toLowerCase())) return false;
      // Presencial: el día de la subasta dentro del plazo. Online: que cierre dentro del plazo.
      const ref = on ? madStr(x.SaleDateDescription) || ms(x.SaleEndDate) : (() => { const d = String(x.SaleDate || "").split(" "); return d.length === 3 ? new Date(+d[2], +d[1] - 1, +d[0]).toISOString() : null; })();
      return !ref || new Date(ref).getTime() <= limite; });
    for (const x of sales) { const on = ES_ONLINE(x.SaleLocation);
      H.subastas.push({ id: "bca-" + x.SaleId, saleId: x.SaleId, portal: "BCA", nombre: x.SaleName.trim(), ubicacion: x.SaleLocation, online: on, tipo: x.SaleType || null,
        canal: on ? "Online" : "Subasta Física & Live Online", comienzo: x.SaleDateDescription, lotes: x.LotCount }); }
    H.estado = "lotes";
    const raw = [];
    for (const s of H.subastas) {
      for (let p = 1; p <= 20; p++) {
        const r = await fetch("/buyer/facetedsearch/GetViewModel?bq=saleid_exact:" + s.saleId + "&saleHeader=true&cultureCode=es&sort=LotNumber&page=" + p, { method: "POST" }).then(r => r.json());
        if (p === 1) H.sesion = r.IsUserAnonymous ? "anonima" : "iniciada";
        const vr = r.VehicleResults || []; if (!vr.length) break;
        for (const v of vr) raw.push({ v, s });
        if (vr.length < 50) break;
      }
      const first = raw.find(x => x.s === s);
      if (first) { s.inicio = ms(first.v.SaleStartDate); s.fin = utcStr(first.v.SaleEndDateString) || ms(first.v.SaleEndDate); if (s.online && first.v.SaleHostBrand === "BuyerGateway" && !(+first.v.BidIncrement > 0)) s.canal = "Online · oferta en sobre cerrado"; }
      if (s.online) { const f = madStr(s.comienzo, s.inicio || s.fin); if (f) s.fin = f; }
      else { const c = madStr(s.comienzo, s.inicio); if (c) s.inicio = c; }
    }
    H.estado = "fichas"; H.total = raw.length; H.hechas = 0;
    await pool(raw, 5, async it => {
      const v = it.v; it.key = v.LotId && v.LotId !== "0" ? v.LotId : v.VehicleId;
      it.url = v.LotId && v.LotId !== "0" ? "https://es.bca-europe.com/Lot?id=" + v.LotId : (v.ViewLotUrl || "https://es.bca-europe.com/Lot?id=" + v.VehicleId + "&SourceSystem=BuyerGateway");
      const h = await fetch(it.url.replace("https://es.bca-europe.com", "")).then(r => r.text()); const d = new DOMParser().parseFromString(h, "text/html");
      const kv = {}; d.querySelectorAll("tr").forEach(tr => { const td = [...tr.querySelectorAll("td,th")].map(x => x.textContent.replace(/\s+/g, " ").trim()); for (let k = 0; k + 1 < td.length; k += 2) if (td[k] && td[k].length < 60 && !(td[k] in kv)) kv[td[k]] = td[k + 1]; });
      const body = d.body.textContent.replace(/\s+/g, " "); const ci = body.indexOf("Comentarios");
      it.kv = kv; it.coment = ci >= 0 ? body.slice(ci + 11, ci + 711).split(/ Interior | Infoentretenimiento | Motor & Tecnolog| Exterior | Información adicional /)[0].trim() : null;
      it.fotoIds = [...new Set([...h.matchAll(/DocType=VehicleImage&(?:amp;)?docId=(\d+)/g)].map(m => m[1]))];
      if (opts.fotos !== false) {
        const src = it.fotoIds.length ? "https://www1.bcaimage.com/Document?DocType=VehicleImage&docId=" + it.fotoIds[0] + "&width=320"
          : (v.ImageUrl ? "https:" + v.ImageUrl.replace(/^https?:/, "").replace(/width=\d+/, "width=320") : null);
        if (src) { try { it.thumb = await thumb(src); } catch (e) { } }
      }
      H.hechas++;
    });
    H.estado = "montando";
    const porSubasta = {};
    for (const it of raw) {
      const v = it.v, s = it.s, kv = it.kv || {}; const com = (it.coment || "").split(">>>")[0].trim(); const lc = com.toLowerCase();
      const fm = v.RegistrationDate && +String(v.RegistrationDate).slice(0, 4) >= 1950 ? v.RegistrationDate.slice(0, 10) + "T00:00:00.000Z" : null;
      const av = /no arranca|aver[ií]a|motor (roto|gripado|da[ñn]ado)|caja de cambios|junta de culata|embrague|testigo motor|fallo motor|turbo|no funciona|ruido (motor|cadena|caja)|p[eé]rdida de aceite/.test(lc) || /aver[ií]a|mechanical fault/i.test(s.nombre + " " + (s.tipo || "")) ? true : null;
      const ac = /siniestr|accidente|airbag(s)? (disparad|saltad|abiert)|estructural|golpe (fuerte|importante|frontal|lateral)/.test(lc) ? true : null;
      const mk = /millas|kil[oó]metros? no (garantizad|reales)|cuentakil[oó]metros (cambiad|sustituid)|km no reales/.test(lc) ? true : null;
      const plz = +(kv["Plazas"]) || null; const cc = +(kv["Motor (CC)"]) || null; const ivaS = (kv["Tipo IVA"] || v.VatType || "");
      const own = kv["Nº de Propietarios"];
      const id = "bca-" + it.key;
      const ubV = kv["Ubicación"] || v.VehicleLocation || null;
      porSubasta[s.id] = (porSubasta[s.id] || 0) + 1; const pack = "m-" + s.saleId.slice(0, 8) + "-" + Math.floor((porSubasta[s.id] - 1) / 20);
      if (it.thumb) { (H.minis[pack] = H.minis[pack] || {})[id] = it.thumb; }
      const sinPujas = !(+v.NumberOfBids > 0);
      H.lotes.push({ id, fuente: "BCA", subastaId: s.id, online: s.online,
        subasta: { nombre: s.nombre, canal: s.canal, ubicacion: s.ubicacion, online: s.online, tipo: s.tipo, inicio: s.inicio, fin: s.fin },
        cierreLote: s.online ? utcStr(v.SaleEndDateString) : null,
        lote: v.LotNumber, matricula: (v.RegistrationNumber || "").replace(/[\s-]/g, "").toUpperCase() || null, vin: v.VIN || null, marca: v.Make, modelo: v.Model,
        derivado: (v.VehicleInfoHeadline || "").replace(/,\s*\d{4}$/, ""), motor: cc ? Math.round(cc / 100) / 10 : null, cv: +v.PowerPs || +kv["Potencia (CV)"] || null, km: +v.Mileage > 0 ? +v.Mileage : null,
        fechaMatric: fm, anio: fm ? +fm.slice(0, 4) : null, carroceria: kv["Tipo Carrocería"] && kv["Tipo Carrocería"] !== "Other" ? kv["Tipo Carrocería"] : null, tipo: tipoOf(kv["Tipo Carrocería"], v.VehicleInfoHeadline, plz, v.VehicleType, v.Model),
        combustible: normFuel(v.FuelType), combustibleOrig: v.FuelType || null, color: kv["Color"] || null, danosClasif: +v.CosmeticGrade || null, gradoMecanico: v.MechanicalGrade && v.MechanicalGrade !== "z" ? v.MechanicalGrade : null,
        plazas: plz, ubicacion: zona(ubV) || s.ubicacion, ubicacionVehiculo: ubV, iva: /rebu|marginal/i.test(ivaS) ? "REBU" : (ivaS ? "General" : null), procedencia: kv["Procedencia del vehículo"] || (kv["Vehicle source"] === "Lease" ? "Renting" : null),
        importado: yn(kv["Importado"]), libro: yn(kv["Historial / Libro de Revisiones"] || kv["Service history present"]?.replace("Present", "Sí")), duenos: own && /^\d+$/.test(own) ? +own : null,
        averias: av, accidentes: ac, manipKm: mk, autoDetectado: (av || ac || mk) ? true : null, notasVendedor: com ? com.slice(0, 400) : null, danosAccidente: kv["Accident damage"] === "Yes" ? "Daños de accidente registrados por el vendedor (sin detalle de gravedad)" : null,
        precioReserva: pos(v.ReservePrice), precioSalida: sinPujas ? pos(v.StartingBid) : null, siguientePuja: pos(v.NextBidPrice), precioCompraYa: pos(v.BuyNowPrice),
        pujaActual: pos(v.HighestBid), numPujas: +v.NumberOfBids || 0, sobreCerrado: s.online && v.SaleHostBrand === "BuyerGateway" && !(+v.BidIncrement > 0) || null, uso: kv["Uso especial"] || null,
        fotoIds: it.fotoIds || [], miniPack: it.thumb ? pack : null, url: it.url, revisadoEn: H.inicio });
    }
    H.subastas.forEach(s => { delete s.saleId; });
    H.estado = "listo";
    return resumen();
  }
  function resumen() { const H = window.__H; return { estado: H.estado, sesion: H.sesion, subastas: H.subastas.map(s => (s.online ? "[online] " : "") + s.nombre + " · " + s.ubicacion + " · " + s.comienzo + " · " + s.lotes), lotes: H.lotes.length, conFoto: H.lotes.filter(l => l.miniPack).length, conSalida: H.lotes.filter(l => l.precioSalida).length, paquetes: partes().length }; }
  // Divide el resultado en paquetes para la base de datos de la app (cada uno < 230 KB)
  function partes() {
    const H = window.__H; const out = [];
    const day = H.inicio.slice(0, 16).replace(/[-:T]/g, "");
    let cur = [], size = 0, n = 0;
    const flush = () => { if (cur.length) { out.push({ coleccion: "entrantes", id: "e-" + day + "-" + (n++), data: { subastas: n === 1 ? H.subastas : [], lotes: cur } }); cur = []; size = 0; } };
    for (const l of H.lotes) { const sz = JSON.stringify(l).length; if (size + sz > 200000) flush(); cur.push(l); size += sz; }
    flush(); if (!out.length) out.push({ coleccion: "entrantes", id: "e-" + day + "-0", data: { subastas: H.subastas, lotes: [] } });
    for (const [k, v] of Object.entries(H.minis)) out.push({ coleccion: "miniaturas", id: k, data: { img: v } });
    return out;
  }
  // Devuelve un bloque de paquetes como texto JSON (para pasarlo a la base de datos)
  function bloque(i, porBloque = 4) { const p = partes(); return JSON.stringify({ bloque: i, total: Math.ceil(p.length / porBloque), paquetes: p.slice(i * porBloque, (i + 1) * porBloque) }); }
  // Foto rápida de pujas/estado de los lotes de unas subastas (para el seguimiento de resultados).
  // saleIds: ids de BCA sin el prefijo "bca-". Devuelve por lote los campos de precio y estado que trae BCA.
  async function instantanea(saleIds) {
    const out = [];
    for (const sid of saleIds) {
      let total = 0;
      for (let p = 1; p <= 20; p++) {
        let r; try { r = await fetch("/buyer/facetedsearch/GetViewModel?bq=saleid_exact:" + sid + "&saleHeader=true&cultureCode=es&sort=LotNumber&page=" + p, { method: "POST" }).then(r => r.json()); } catch (e) { out.push({ saleId: sid, error: String(e) }); break; }
        const vr = r.VehicleResults || []; if (!vr.length) break; total += vr.length;
        for (const v of vr) {
          const key = v.LotId && v.LotId !== "0" ? v.LotId : v.VehicleId; const o = { id: "bca-" + key, saleId: sid, vin: v.VIN || null };
          for (const [k, x] of Object.entries(v)) if (x != null && x !== "" && typeof x !== "object" && /bid|price|sold|status|phase|state|result|winning|hammer|closed|withdraw/i.test(k)) o[k] = x;
          out.push(o);
        }
        if (vr.length < 50) break;
      }
      if (!total) out.push({ saleId: sid, lotes: 0 });
    }
    return out;
  }
  return { run, resumen, partes, bloque, instantanea, estado: () => window.__H && { estado: window.__H.estado, hechas: window.__H.hechas, total: window.__H.total } };
})();
