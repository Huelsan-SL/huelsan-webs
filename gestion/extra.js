/* Huelsan · funciones añadidas a la app de gestión (10/11/2026). Se carga después del código principal (index.html)
   y lo amplía sin tocarlo por dentro:
   · Clientes con seguimiento: etapa, próximo seguimiento, comentarios, coches propuestos, coincidencias que se pueden quitar,
     fecha y hora de llegada de las peticiones de la web.
   · Búsquedas clave (pestaña «Búsquedas»): filtros guardados; la base de datos compara cada recogida y avisa por correo.
   · Ficha del coche: panel «En la web» (mostrar, precio, texto de venta y fotos con un toque), proponer a clientes y pedir reseña.
   Datos: búsquedas en ajustes «busquedas/<id>», coincidencias en «coincidencias/<id>», reseñas en «resenas/<código>»
   (ver supabase/08-busquedas-resenas.sql). */
"use strict";
(function(){
const X={busquedas:new Map(),coinc:new Map(),resenas:new Map(),user:"",cli:null,cliFiltro:"activas",cliQ:"",cliNueva:false,cliEdit:false,cliBusca:"",
  bEdit:null,bAbiertas:new Set(),fotoOcupada:new Set(),fotoMsg:"",iaOcupada:false,resLink:null};
window.HX=X;
const BCA_IMG=(id,w)=>"https://www1.bcaimage.com/Document?DocType=VehicleImage&docId="+id+"&width="+w;
const FOTOS_WEB=()=>(window.HUELSAN_BLOB||"").replace("/fotos/","/fotos-web/");
const hoyISO=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const ahora=()=>new Date().toISOString();
const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const fechaHora=iso=>{if(!iso)return"";const d=new Date(iso);if(isNaN(d))return"";return d.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"})+" a las "+d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})};
const hace=iso=>{const d=new Date(iso);if(isNaN(d))return"";const m=Math.round((Date.now()-d)/60000);if(m<1)return"ahora";if(m<60)return`hace ${m} min`;const h=Math.round(m/60);if(h<24)return`hace ${h} h`;const dd=Math.round(h/24);return dd===1?"ayer":`hace ${dd} días`};
const enfoque=()=>{const a=document.activeElement;return a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)};
const norm=t=>String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]/g,"");
const precioDe=l=>isOwned(l)&&l.precioVenta!=null?l.precioVenta:refPrice(l);
const esAuto=l=>/autom/i.test(l.cambio||"")||/(\baut\b|autom|dsg|tiptronic|s[ -]?tronic|steptronic|\beat\d?\b|\bedc\b|\bdct\b|xtronic|\bcvt\b|powershift|\bat\d\b)/i.test([l.derivado,l.modelo].join(" "));
const cerrado=l=>isPast(l)&&!isOwned(l);

/* ---------- estilos ---------- */
const css=document.createElement("style");css.textContent=`
.xbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.xbar input[type=search]{flex:1 1 220px;max-width:340px}
.xcli{display:grid;gap:6px;cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit}
.xcli:hover{border-color:var(--accent)}
.xcli+.xcli{margin-top:10px}
.xcli .top{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:space-between}
.xcli .nom{font:650 15px var(--f-display,inherit)}
.xmeta{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;color:var(--muted)}
.tag.bad{background:var(--bad-soft);color:var(--bad)}.tag.warn{background:var(--warn-soft);color:var(--warn)}.tag.good{background:var(--good-soft);color:var(--good)}
.tag.acc{background:var(--accent-soft);color:var(--accent)}
.xetapa{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:2px 7px;border-radius:4px;border:1px solid var(--line)}
.xetapa.nuevo{border-color:var(--accent);color:var(--accent)}.xetapa.ganado{background:var(--good-soft);color:var(--good);border-color:transparent}.xetapa.perdido{color:var(--muted)}
.xetapa.propuesta,.xetapa.negociando{background:var(--accent-soft);color:var(--accent);border-color:transparent}
.xlist{display:grid;gap:6px}
.xitem{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--bg)}
.xitem .t{font-weight:600;min-width:0;flex:1 1 220px;cursor:pointer}
.xitem .t small{display:block;font-weight:400;color:var(--muted);font-size:12px}
.xitem select{font-size:12.5px;padding:3px 6px}
.xcom{border-left:3px solid var(--accent-soft);padding:4px 0 4px 10px;display:grid;gap:2px}
.xcom small{color:var(--muted);font-size:11.5px}
.xcom p{margin:0;white-space:pre-line;font-size:13.5px}
.xnew{background:var(--accent);color:var(--accent-ink);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:1px 6px;border-radius:4px}
.xb{display:grid;gap:8px}.xb+.xb{margin-top:12px}
.xb h2{margin:0;font-size:16px}
.xfotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}
.xfoto{position:relative;border:2px solid transparent;border-radius:8px;overflow:hidden;cursor:pointer;background:var(--sunk);aspect-ratio:4/3;padding:0}
.xfoto img{width:100%;height:100%;object-fit:cover;display:block;opacity:.55;transition:opacity .15s}
.xfoto.on{border-color:var(--good)}.xfoto.on img{opacity:1}
.xfoto .n{position:absolute;left:5px;top:5px;background:var(--good);color:#fff;border-radius:999px;font-size:11.5px;font-weight:700;min-width:22px;height:22px;display:grid;place-items:center;padding:0 5px}
.xfoto .ck{position:absolute;right:5px;top:5px;width:22px;height:22px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.35);display:grid;place-items:center;color:#fff;font-size:13px}
.xfoto.on .ck{background:var(--good);border-color:var(--good)}
.xfoto .src{position:absolute;left:0;right:0;bottom:0;font-size:10.5px;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.6));padding:10px 6px 4px;text-align:left}
.xfoto .pri{position:absolute;right:5px;bottom:5px;border:0;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:2px 6px;cursor:pointer}
.xfoto.busy::after{content:"Preparando…";position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.45);color:#fff;font-size:12px;font-weight:600}
.xfoto .mat{position:absolute;left:5px;bottom:22px;font-size:10px;border-radius:4px;padding:1px 5px;background:var(--warn);color:#fff}
.xfoto .mat.ok{background:var(--good)}
.xlink{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.xlink input{flex:1 1 240px;font-size:12.5px}
.xpub{border-radius:8px;padding:8px 10px;font-size:13px;display:flex;gap:8px;align-items:flex-start}
.xpub.off{background:var(--sunk);color:var(--muted)}.xpub.ok{background:var(--good-soft);color:var(--good)}.xpub.warn{background:var(--warn-soft);color:var(--warn)}
.xpubbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-top:1px solid var(--line);padding-top:12px}
.xrev{border:2px solid var(--accent);border-radius:10px;padding:12px;display:grid;gap:10px;background:var(--surface)}
.xrev-car{display:flex;gap:10px;align-items:center}.xrev-car img,.xrev-nof{width:96px;height:72px;object-fit:cover;border-radius:6px;background:var(--sunk);flex:none;display:grid;place-items:center;font-size:11px;color:var(--muted)}
.xrev ul{margin:0;padding-left:18px;font-size:13px;display:grid;gap:3px}.xrev-ok li::marker{content:"✓  ";color:var(--good)}.xrev-av li::marker{content:"⚠  ";color:var(--warn)}
`;document.head.appendChild(css);

/* ---------- datos ---------- */
const guardar=async(path,data,merge=true)=>{if(!S.db)return;const ref=S.db.doc(path);
  if(merge){try{await ref.update(data)}catch(e){if(e.code!=="not-found")throw e;await ref.set(data)}}else await ref.set(data)};
async function guardarDemanda(id,patch){const d=S.demandas.get(id);if(!d)return;const next={...d,...patch};S.demandas.set(id,next);
  try{await guardar("demandas/"+id,patch)}catch(e){toast("No se ha podido guardar: "+(e.message||e))}refrescar()}
function refrescar(){if(["clientes","busquedas"].includes(S.tab)&&!enfoque())render();else contadores();if(X.cli)pintarCliente();if(S.open&&!enfoque())renderDrawer()}
(async()=>{
  const db=window.claude?await window.claude.use("db").catch(()=>null):null;if(!db)return;
  window.claude.use("user").then(u=>{X.user=(u&&u.email)||""}).catch(()=>{});
  const vigila=(col,mapa)=>db.collection(col).onSnapshot(s=>{X[mapa]=new Map(s.docs.map(d=>[d.id,{...d.data(),id:d.id}]));
    if(["clientes","busquedas"].includes(S.tab)&&!enfoque())render();else contadores();if(X.cli&&!enfoque())pintarCliente()},()=>{});
  vigila("busquedas","busquedas");vigila("coincidencias","coinc");vigila("resenas","resenas");
})();

/* ---------- pestaña nueva y contadores ---------- */
const origRender=window.render;
window.render=function(){origRender.apply(this,arguments);contadores()};
function nuevasDe(bid){let n=0;for(const c of X.coinc.values())if(c.busqueda===bid&&!c.visto)n++;return n}
function contadores(){
  const e=document.getElementById("c-busquedas");if(e){let n=0;for(const c of X.coinc.values())if(!c.visto&&X.busquedas.has(c.busqueda))n++;e.textContent=n?"("+n+")":"";e.classList.toggle("xnuevas",n>0)}
  const c=document.getElementById("c-clientes");if(c){const hoy=hoyISO();const pend=[...S.demandas.values()].filter(d=>d.estado!=="cerrada"&&d.proximo&&d.proximo.fecha&&d.proximo.fecha<=hoy).length;
    const act=[...S.demandas.values()].filter(d=>d.estado!=="cerrada").length;c.textContent=act?`(${act}${pend?" · "+pend+" hoy":""})`:""}
}

/* ---------- cruce clientes ↔ coches (amplía el de la app: modelo, potencia, cilindrada, cambio y coches quitados) ---------- */
window.matchDemand=function(d,l){
  if(d.estado==="cerrada")return false;
  if(l.estado==="descartado"||l.estado==="vendido")return false;
  if(cerrado(l))return false;
  if((d.ocultos||[]).includes(l.id))return false;
  if(d.tipos&&d.tipos.length&&!(l.tipo&&d.tipos.includes(l.tipo)))return false;
  if(d.combustibles&&d.combustibles.length&&!(l.combustible&&d.combustibles.includes(l.combustible)))return false;
  if(d.anioMin&&l.anio&&l.anio<+d.anioMin)return false;
  if(d.kmMax&&l.km&&l.km>+d.kmMax)return false;
  if(d.plazasMin&&l.plazas&&l.plazas<+d.plazasMin)return false;
  if(d.cvMin&&l.cv&&l.cv<+d.cvMin)return false;
  if(d.motorMin&&l.motor&&l.motor<+d.motorMin-0.05)return false;
  if(d.motorMax&&l.motor&&l.motor>+d.motorMax+0.05)return false;
  if(d.cambio==="Automático"&&!esAuto(l))return false;
  if(d.cambio==="Manual"&&esAuto(l))return false;
  const p=isOwned(l)?l.precioVenta:(l.mercado??refPrice(l));
  if(d.presupuestoMax&&p&&p>+d.presupuestoMax*1.05)return false;
  if(d.marca&&!norm(l.marca).includes(norm(d.marca))&&!norm(titleOf(l)).includes(norm(d.marca)))return false;
  if(d.modelo&&!/^(cualquiera|indiferente|cualquier)/i.test(d.modelo)){const t=norm([l.modelo,l.derivado].join(" "));if(!String(d.modelo).split(/[,;/]/).map(norm).filter(Boolean).some(m=>t.includes(m)))return false}
  return true};

/* ---------- vista: clientes ---------- */
const ETAPAS=[["nuevo","Nuevo"],["contactado","Contactado"],["buscando","Buscando coche"],["propuesta","Propuesta enviada"],["negociando","Negociando"],["ganado","Compró"],["perdido","No compró"]];
const ETAPA_LBL=Object.fromEntries(ETAPAS);
const etapaDe=d=>d.etapa||(d.estado==="cerrada"?"perdido":"nuevo");
const PROP=[["propuesto","Propuesto"],["enviado","Enviado al cliente"],["interesa","Le interesa"],["no","No le interesa"]];
function proximoTag(d){const p=d.proximo;if(!p||!p.fecha||d.estado==="cerrada")return"";const hoy=hoyISO();
  const cls=p.fecha<hoy?"bad":p.fecha===hoy?"warn":"";const txt=p.fecha<hoy?"Seguimiento atrasado":p.fecha===hoy?"Seguimiento hoy":"Seguimiento "+new Date(p.fecha+"T12:00").toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"});
  return`<span class="tag ${cls}" title="${esc(p.nota||"")}">${txt}${p.nota?" · "+esc(String(p.nota).slice(0,40)):""}</span>`}
function buscaTags(d){return[d.marca||d.modelo?`<span class="tag acc">${esc([d.marca,d.modelo].filter(Boolean).join(" "))}</span>`:"",d.presupuestoMax?`<span class="tag">Hasta ${eur(d.presupuestoMax)}</span>`:"",
  ...(d.tipos||[]).map(t=>`<span class="tag">${esc(t)}</span>`),...(d.combustibles||[]).map(t=>`<span class="tag">${esc(t)}</span>`),d.cambio&&/autom|manual/i.test(d.cambio)?`<span class="tag">${esc(d.cambio)}</span>`:"",
  d.anioMin?`<span class="tag">Desde ${d.anioMin}</span>`:"",d.kmMax?`<span class="tag">Máx. ${num(d.kmMax)} km</span>`:"",d.cvMin?`<span class="tag">${d.cvMin}+ CV</span>`:"",
  d.motorMin||d.motorMax?`<span class="tag">${d.motorMin?d.motorMin+" l":""}${d.motorMin&&d.motorMax?"–":d.motorMax?"hasta ":"+"}${d.motorMax?d.motorMax+" l":""}</span>`:"",d.plazasMin?`<span class="tag">${d.plazasMin}+ plazas</span>`:""].join("")}
function filtroCli(d){const hoy=hoyISO(),f=X.cliFiltro;
  if(f==="activas"&&d.estado==="cerrada")return false;
  if(f==="hoy"&&!(d.estado!=="cerrada"&&d.proximo&&d.proximo.fecha&&d.proximo.fecha<=hoy))return false;
  if(f==="web"&&d.origen!=="web")return false;
  if(f==="cerradas"&&d.estado!=="cerrada")return false;
  if(X.cliQ){const q=norm(X.cliQ);if(!norm([d.nombre,d.telefono,d.email,d.marca,d.modelo,d.notas,d.residencia].join(" ")).includes(q))return false}
  return true}
function formPeticion(d={},pref="xf"){const v=k=>esc(d[k]??"");return`<div class="form">
  <label>Nombre<input name="nombre" required value="${v("nombre")}" autocomplete="off"></label>
  <label>Teléfono<input name="telefono" type="tel" value="${v("telefono")}"></label>
  <label>Email<input name="email" type="email" value="${v("email")}"></label>
  <label>Reside en<input name="residencia" value="${v("residencia")}"></label>
  <label>Marca<input name="marca" value="${v("marca")}" placeholder="Mazda"></label>
  <label>Modelo <span class="muted" style="font-weight:400">(varios con comas)</span><input name="modelo" value="${v("modelo")}" placeholder="MX-5"></label>
  <label>Presupuesto máx. (€)<input type="number" name="presupuestoMax" step="500" value="${v("presupuestoMax")}"></label>
  <label>Año desde<input type="number" name="anioMin" value="${v("anioMin")}"></label>
  <label>Km máx.<input type="number" name="kmMax" step="10000" value="${v("kmMax")}"></label>
  <label>Potencia mín. (CV)<input type="number" name="cvMin" step="10" value="${v("cvMin")}"></label>
  <label>Plazas mín.<input type="number" name="plazasMin" min="2" max="9" value="${v("plazasMin")}"></label>
  <label>Cambio<select name="cambio"><option value="">Indiferente</option>${["Automático","Manual"].map(x=>`<option ${d.cambio===x?"selected":""}>${x}</option>`).join("")}</select></label>
  <label class="wide">Tipo de vehículo<span class="chips">${TIPOS.map(t=>`<label class="chk"><input type="checkbox" name="tipos" value="${t}" ${(d.tipos||[]).includes(t)?"checked":""}>${t}</label>`).join("")}</span></label>
  <label class="wide">Combustible<span class="chips">${COMBUS.map(t=>`<label class="chk"><input type="checkbox" name="combustibles" value="${t}" ${(d.combustibles||[]).includes(t)?"checked":""}>${t}</label>`).join("")}</span></label>
  <label class="wide">Qué busca, en sus palabras<textarea name="notas" placeholder="Ej.: familiar automático para viajes, que gaste poco">${v("notas")}</textarea></label></div>`}
function leerPeticion(form){const fd=new FormData(form);const o={};
  for(const k of["nombre","telefono","email","marca","modelo","notas","residencia","cambio"])o[k]=(fd.get(k)||"").trim()||null;
  for(const k of["presupuestoMax","anioMin","kmMax","plazasMin","cvMin"]){const v=fd.get(k);o[k]=v?+v:null}
  o.tipos=fd.getAll("tipos");o.combustibles=fd.getAll("combustibles");return o}
window.renderClientes=function(){
  const todas=[...S.demandas.values()],hoy=hoyISO();
  const cnt={activas:todas.filter(d=>d.estado!=="cerrada").length,hoy:todas.filter(d=>d.estado!=="cerrada"&&d.proximo&&d.proximo.fecha&&d.proximo.fecha<=hoy).length,web:todas.filter(d=>d.origen==="web").length,cerradas:todas.filter(d=>d.estado==="cerrada").length,todas:todas.length};
  const ds=todas.filter(filtroCli).sort((a,b)=>{const pa=a.estado!=="cerrada"&&a.proximo&&a.proximo.fecha?a.proximo.fecha:"9",pb=b.estado!=="cerrada"&&b.proximo&&b.proximo.fecha?b.proximo.fecha:"9";
    const va=pa<=hoy?0:1,vb=pb<=hoy?0:1;if(va!==vb)return va-vb;if(va===0&&pa!==pb)return pa.localeCompare(pb);return String(b.creado||"").localeCompare(String(a.creado||""))});
  $("#main").innerHTML=`<div class="pagehead"><div><h1>Clientes y seguimiento</h1><p>Cada petición se cruza sola con las subastas y el stock. Abre un cliente para anotar llamadas, fijar el próximo seguimiento y proponerle coches. Las peticiones de la web llegan con su fecha y hora.</p></div>
    <button class="btn primary" id="xcli-nueva">${X.cliNueva?"Cerrar":"Nueva petición"}</button></div>
  ${X.cliNueva?`<form class="card" id="xcli-form" style="display:grid;gap:12px;margin-bottom:16px"><h2 style="margin:0">Nueva petición</h2>${formPeticion()}<div class="row"><button class="btn primary" type="submit">Guardar petición</button><label class="toggle"><input type="checkbox" name="crearBusqueda" checked><span>Crear también una búsqueda clave con avisos</span></label></div></form>`:""}
  <div class="xbar" role="group" aria-label="Filtrar clientes">${[["activas","Activos"],["hoy","Seguimiento para hoy"],["web","Desde la web"],["cerradas","Cerrados"],["todas","Todos"]].map(([k,t])=>`<label class="chk"><input type="radio" name="xcf" value="${k}" ${X.cliFiltro===k?"checked":""} data-xcf>${t} <span class="n tnum">${cnt[k]}</span></label>`).join("")}
    <input type="search" id="xcli-q" placeholder="Buscar por nombre, teléfono, marca…" value="${esc(X.cliQ)}" autocomplete="off"></div>
  ${ds.length?ds.map(d=>{const cs=carsFor(d),pr=(d.propuestos||[]).length,co=(d.comentarios||[]).length,ult=(d.comentarios||[]).slice(-1)[0];const et=etapaDe(d);const b=busquedaDe(d);
    return`<div class="card xcli" role="button" tabindex="0" data-xcli="${esc(d.id)}">
      <div class="top"><span><span class="nom">${esc(d.nombre||"Sin nombre")}</span> <span class="muted" style="font-size:12.5px">${esc([d.telefono,d.residencia].filter(Boolean).join(" · "))}</span></span>
        <span class="row"><span class="xetapa ${et}">${ETAPA_LBL[et]}</span>${d.origen==="web"?`<span class="tag">Desde la web</span>`:""}${proximoTag(d)}</span></div>
      <div class="xmeta"><span>${d.origen==="web"?"Llegó":"Creada"} el ${esc(fechaHora(d.creado)||"—")}${d.creado?" ("+hace(d.creado)+")":""}</span>${pr?`<span>${pr} coche${pr>1?"s":""} propuesto${pr>1?"s":""}</span>`:""}<span>${cs.length} coche${cs.length==1?"":"s"} encaja${cs.length==1?"":"n"} ahora</span>${co?`<span>${co} comentario${co>1?"s":""}</span>`:""}${b?`<span>🔔 Búsqueda clave${nuevasDe(b.id)?" · "+nuevasDe(b.id)+" nuevas":""}</span>`:""}</div>
      <div class="flags">${buscaTags(d)}</div>
      ${ult?`<div class="muted" style="font-size:12.5px">Último comentario (${esc(fdate(ult.fecha))}): ${esc(String(ult.texto).slice(0,140))}</div>`:d.notas?`<div class="muted" style="font-size:12.5px;white-space:pre-line;max-height:3.2em;overflow:hidden">${esc(d.notas)}</div>`:""}
    </div>`}).join(""):`<div class="empty"><strong>${todas.length?"Ningún cliente con este filtro":"Sin peticiones todavía"}</strong>${todas.length?"Prueba con otro filtro.":"Apunta lo que te pide cada cliente; también llegarán las que dejen en la web."}</div>`}`;
  contadores()};

/* ---------- ficha del cliente ---------- */
function busquedaDe(d){if(d.busquedaId&&X.busquedas.has(d.busquedaId))return X.busquedas.get(d.busquedaId);for(const b of X.busquedas.values())if(b.clienteId===d.id)return b;return null}
function abrirCliente(id){X.cli=id;X.cliEdit=false;X.cliBusca="";pintarCliente()}
function cerrarCliente(){X.cli=null;const a=$("#xcdrawer"),b=$("#xcscrim");a&&a.remove();b&&b.remove();if(!S.open)document.body.style.overflow=""}
function filaLote(l,extra=""){return`<div class="xitem"><span class="t" data-open="${esc(l.id)}">${esc(titleOf(l))}${l.matricula?` · ${esc(l.matricula)}`:""}<small>${[l.anio,l.km!=null?num(l.km)+" km":null,l.cv?l.cv+" CV":null,l.combustible,isOwned(l)?(l.estado==="vendido"?"Vendido":"En stock"):cerrado(l)?"Subasta cerrada":(l.subasta?"Subasta "+fdt(cierreOf(l)):null)].filter(Boolean).map(esc).join(" · ")} · <b>${eur(precioDe(l))}</b></small></span>${extra}</div>`}
function pintarCliente(){
  const d=X.cli&&S.demandas.get(X.cli);if(!d){cerrarCliente();return}
  let sc=$("#xcscrim"),dr=$("#xcdrawer");
  if(!sc){sc=document.createElement("div");sc.id="xcscrim";sc.className="scrim";document.body.appendChild(sc);sc.onclick=cerrarCliente}
  if(!dr){dr=document.createElement("aside");dr.id="xcdrawer";dr.className="drawer";dr.setAttribute("role","dialog");dr.setAttribute("aria-modal","true");document.body.appendChild(dr)}
  document.body.style.overflow="hidden";const st=dr.scrollTop;
  const tel=String(d.telefono||"").replace(/\D/g,""),tel34=tel.length===9?"34"+tel:tel,et=etapaDe(d);
  const props=(d.propuestos||[]).map(p=>({...p,l:S.lots.get(p.id)}));
  const propIds=new Set(props.map(p=>p.id));
  const cs=carsFor(d).filter(l=>!propIds.has(l.id)).sort((a,b)=>(isOwned(b)?1:0)-(isOwned(a)?1:0)||String(cierreOf(a)||"").localeCompare(String(cierreOf(b)||"")));
  const ocultos=(d.ocultos||[]).length;const b=busquedaDe(d);
  const q=norm(X.cliBusca);const busq=q.length>=2?[...S.lots.values()].filter(l=>!propIds.has(l.id)&&!cerrado(l)&&l.estado!=="vendido"&&norm([l.matricula,l.marca,l.modelo,l.derivado].join(" ")).includes(q)).slice(0,8):[];
  dr.innerHTML=`<div class="dhead"><div style="display:grid;gap:4px;min-width:0"><h2 style="font-size:21px">${esc(d.nombre||"Sin nombre")}</h2>
      <div class="muted" style="font-size:12.5px">${d.origen==="web"?"Petición desde la web":"Petición interna"} · ${esc(fechaHora(d.creado)||"sin fecha")}</div></div><button class="btn" id="xc-cerrar">Cerrar</button></div>
    <div class="dsec"><div class="row">${tel?`<a class="btn sm" href="tel:+${tel34}">Llamar ${esc(d.telefono)}</a><a class="btn sm" href="https://wa.me/${tel34}" target="_blank" rel="noopener">WhatsApp</a>`:""}${d.email?`<a class="btn sm" href="mailto:${esc(d.email)}">Correo</a>`:""}</div>
      <div class="form"><label>Etapa<select id="xc-etapa">${ETAPAS.map(([k,t])=>`<option value="${k}" ${et===k?"selected":""}>${t}</option>`).join("")}</select></label>
        <label>Próximo seguimiento<input type="date" id="xc-fecha" value="${esc(d.proximo&&d.proximo.fecha||"")}"></label>
        <label class="wide">Qué hay que hacer<input id="xc-nota" value="${esc(d.proximo&&d.proximo.nota||"")}" placeholder="Ej.: llamarle con el Mazda de la subasta del jueves"></label></div>
      <div class="row">${[["1","Mañana"],["3","En 3 días"],["7","En una semana"]].map(([n,t])=>`<button class="btn sm" data-xcdias="${n}">${t}</button>`).join("")}${d.proximo&&d.proximo.fecha?`<button class="btn sm ghost" data-xcdias="0">Quitar fecha</button>`:""}</div></div>
    <div class="dsec"><h3>Lo que busca</h3>
      ${X.cliEdit?`<form id="xc-editar" style="display:grid;gap:10px">${formPeticion(d)}<div class="row"><button class="btn primary sm" type="submit">Guardar cambios</button><button class="btn sm" type="button" id="xc-noeditar">Cancelar</button></div></form>`
        :`<div class="flags">${buscaTags(d)||`<span class="muted" style="font-size:12.5px">Sin filtros: añade marca, presupuesto… para que se crucen coches.</span>`}</div>${d.notas?`<div class="equip" style="white-space:pre-line">${esc(d.notas)}</div>`:""}
        <div class="row"><button class="btn sm" id="xc-editarbtn">Editar petición</button>${b?`<button class="btn sm" data-xbir="${esc(b.id)}">Ver su búsqueda clave${nuevasDe(b.id)?" ("+nuevasDe(b.id)+" nuevas)":""}</button>`:`<button class="btn sm" id="xc-crearb">Crear búsqueda clave con avisos</button>`}</div>`}</div>
    <div class="dsec"><h3>Comentarios y llamadas</h3>
      <div style="display:grid;gap:6px"><textarea id="xc-com" placeholder="Ej.: le he llamado, prefiere gris y que tenga cámara trasera"></textarea><div class="row"><button class="btn primary sm" id="xc-addcom">Añadir comentario</button></div></div>
      ${(d.comentarios||[]).slice().reverse().map(c=>`<div class="xcom"><small>${esc(fechaHora(c.fecha))}${c.autor?" · "+esc(String(c.autor).split("@")[0]):""} <button class="btn sm ghost" data-xcdelcom="${esc(c.id)}" title="Borrar comentario" style="padding:0 4px">✕</button></small><p>${esc(c.texto)}</p></div>`).join("")||`<span class="muted" style="font-size:12.5px">Aún no hay comentarios.</span>`}</div>
    <div class="dsec"><h3>Coches propuestos (${props.length})</h3>
      <div class="xlist">${props.map(p=>p.l?filaLote(p.l,`<span class="row"><select data-xcprop="${esc(p.id)}">${PROP.map(([k,t])=>`<option value="${k}" ${p.estado===k?"selected":""}>${t}</option>`).join("")}</select><button class="btn sm ghost" data-xcquitar="${esc(p.id)}" title="Quitar de la lista">✕</button></span>`)
        :`<div class="xitem"><span class="t">${esc(p.titulo||p.id)}<small>Ya no está cargado en la app (subasta antigua o archivado)</small></span><button class="btn sm ghost" data-xcquitar="${esc(p.id)}">✕</button></div>`).join("")||`<span class="muted" style="font-size:12.5px">Todavía no le has propuesto ninguno. Usa «Proponer» en las coincidencias de abajo, busca un coche, o hazlo desde la ficha del coche.</span>`}</div>
      <input type="search" id="xc-busca" placeholder="Buscar un coche para proponérselo (matrícula, marca, modelo)…" value="${esc(X.cliBusca)}" autocomplete="off">
      ${busq.length?`<div class="xlist">${busq.map(l=>filaLote(l,`<button class="btn sm primary" data-xcproponer="${esc(l.id)}">Proponer</button>`)).join("")}</div>`:q.length>=2?`<span class="muted" style="font-size:12.5px">Nada con «${esc(X.cliBusca)}».</span>`:""}</div>
    <div class="dsec"><h3>Coinciden con lo que busca (${cs.length})</h3>
      <div class="muted" style="font-size:12.5px">Se calculan solos con sus filtros. «Quitar» lo saca de esta lista para este cliente${ocultos?` · ${ocultos} quitado${ocultos>1?"s":""} <button class="btn sm ghost" id="xc-restaurar">Volver a mostrarlos</button>`:""}.</div>
      <div class="xlist">${cs.slice(0,40).map(l=>filaLote(l,`<span class="row"><button class="btn sm primary" data-xcproponer="${esc(l.id)}">Proponer</button><button class="btn sm" data-xcocultar="${esc(l.id)}">Quitar</button></span>`)).join("")||`<span class="muted" style="font-size:12.5px">Ningún coche encaja ahora mismo.</span>`}${cs.length>40?`<span class="muted" style="font-size:12.5px">…y ${cs.length-40} más. Afina los filtros para ver menos.</span>`:""}</div></div>
    <div class="dsec"><h3>Petición</h3><div class="row"><button class="btn sm" id="xc-cerrarpet">${d.estado==="cerrada"?"Reabrir petición":"Cerrar petición"}</button><button class="btn sm ghost" id="xc-borrar">Borrar cliente</button></div></div>`;
  dr.scrollTop=st}
document.addEventListener("click",async e=>{const t=e.target;
  if(t.closest("#xcli-nueva")){X.cliNueva=!X.cliNueva;render();return}
  const cc=t.closest("[data-xcli]");if(cc&&!t.closest("a,button,select,input")){abrirCliente(cc.dataset.xcli);return}
  if(!X.cli)return;
  const d=S.demandas.get(X.cli);if(!d)return;
  if(t.closest("#xc-cerrar")){cerrarCliente();return}
  if(t.closest("[data-open]")&&t.closest("#xcdrawer")){/* la app abre la ficha del coche encima */return}
  const dd=t.closest("[data-xcdias]");if(dd){const n=+dd.dataset.xcdias;if(!n){await guardarDemanda(d.id,{proximo:null});return}
    const f=new Date();f.setDate(f.getDate()+n);const iso=f.getFullYear()+"-"+String(f.getMonth()+1).padStart(2,"0")+"-"+String(f.getDate()).padStart(2,"0");
    await guardarDemanda(d.id,{proximo:{fecha:iso,nota:($("#xc-nota")||{}).value||(d.proximo&&d.proximo.nota)||""}});return}
  if(t.closest("#xc-addcom")){const tx=$("#xc-com").value.trim();if(!tx)return;const c={id:nid(),fecha:ahora(),autor:X.user,texto:tx};
    const patch={comentarios:[...(d.comentarios||[]),c]};if(etapaDe(d)==="nuevo")patch.etapa="contactado";await guardarDemanda(d.id,patch);return}
  const dc=t.closest("[data-xcdelcom]");if(dc){if(dc.dataset.ok!=="1"){dc.dataset.ok="1";dc.textContent="¿Borrar?";setTimeout(()=>{if(dc.isConnected){dc.dataset.ok="";dc.textContent="✕"}},3000);return}
    await guardarDemanda(d.id,{comentarios:(d.comentarios||[]).filter(c=>c.id!==dc.dataset.xcdelcom)});return}
  const pp=t.closest("[data-xcproponer]");if(pp){await proponer(d.id,pp.dataset.xcproponer);X.cliBusca="";pintarCliente();return}
  const pq=t.closest("[data-xcquitar]");if(pq){await guardarDemanda(d.id,{propuestos:(d.propuestos||[]).filter(p=>p.id!==pq.dataset.xcquitar)});return}
  const po=t.closest("[data-xcocultar]");if(po){await guardarDemanda(d.id,{ocultos:[...new Set([...(d.ocultos||[]),po.dataset.xcocultar])]});return}
  if(t.closest("#xc-restaurar")){await guardarDemanda(d.id,{ocultos:[]});return}
  if(t.closest("#xc-editarbtn")){X.cliEdit=true;pintarCliente();return}
  if(t.closest("#xc-noeditar")){X.cliEdit=false;pintarCliente();return}
  if(t.closest("#xc-crearb")){const b=busquedaDesdeCliente(d);await guardar("busquedas/"+b.id,b,false);X.busquedas.set(b.id,b);await guardarDemanda(d.id,{busquedaId:b.id});toast("Búsqueda clave creada: te avisaremos por correo cuando entre un coche que encaje");return}
  if(t.closest("#xc-cerrarpet")){const cerrar=d.estado!=="cerrada";await guardarDemanda(d.id,{estado:cerrar?"cerrada":"activa",etapa:cerrar?(etapaDe(d)==="ganado"?"ganado":"perdido"):"buscando"});return}
  const bd=t.closest("#xc-borrar");if(bd){if(bd.dataset.ok!=="1"){bd.dataset.ok="1";bd.textContent="¿Seguro? Pulsa otra vez";setTimeout(()=>{if(bd.isConnected){bd.dataset.ok="";bd.textContent="Borrar cliente"}},3000);return}
    S.demandas.delete(d.id);cerrarCliente();render();if(S.db)await S.db.doc("demandas/"+d.id).delete().catch(()=>{});return}
},true);
// la ficha del cliente va por encima de la lista; los clics en coches abren la ficha del coche (z-index mayor)
const zcss=document.createElement("style");zcss.textContent=`#xcscrim{z-index:38}#xcdrawer{z-index:39}`;document.head.appendChild(zcss);
async function proponer(did,lid){const d=S.demandas.get(did),l=S.lots.get(lid);if(!d||!l)return;if((d.propuestos||[]).some(p=>p.id===lid)){toast("Ya estaba propuesto");return}
  const patch={propuestos:[...(d.propuestos||[]),{id:lid,fecha:ahora(),estado:"propuesto",titulo:titleOf(l)}]};if(["nuevo","contactado","buscando"].includes(etapaDe(d)))patch.etapa="propuesta";
  await guardarDemanda(did,patch);toast(`${titleOf(l)} propuesto a ${d.nombre||"el cliente"}`)}
document.addEventListener("change",async e=>{const t=e.target;
  if(t.matches("[data-xcf]")){X.cliFiltro=t.value;render();return}
  if(!X.cli)return;const d=S.demandas.get(X.cli);if(!d)return;
  if(t.id==="xc-etapa"){const v=t.value;await guardarDemanda(d.id,{etapa:v,estado:["ganado","perdido"].includes(v)?"cerrada":"activa"});return}
  if(t.id==="xc-fecha"){await guardarDemanda(d.id,{proximo:t.value?{fecha:t.value,nota:($("#xc-nota")||{}).value||""}:null});return}
  if(t.id==="xc-nota"){await guardarDemanda(d.id,{proximo:{fecha:(d.proximo&&d.proximo.fecha)||"",nota:t.value.trim()}});return}
  if(t.matches("[data-xcprop]")){await guardarDemanda(d.id,{propuestos:(d.propuestos||[]).map(p=>p.id===t.dataset.xcprop?{...p,estado:t.value}:p)});return}
});
let qT;document.addEventListener("input",e=>{const t=e.target;
  if(t.id==="xcli-q"){X.cliQ=t.value;clearTimeout(qT);qT=setTimeout(()=>{render();const i=$("#xcli-q");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},300);return}
  if(t.id==="xc-busca"){X.cliBusca=t.value;clearTimeout(qT);qT=setTimeout(()=>{pintarCliente();const i=$("#xc-busca");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},250);return}
  if(t.closest("#xb-form"))previewBusqueda();
});
document.addEventListener("submit",async e=>{const f=e.target;
  if(f.id==="xcli-form"){e.preventDefault();const o=leerPeticion(f);if(!o.nombre){toast("Escribe el nombre");return}
    const d={...o,id:"d-"+Date.now().toString(36),origen:"interno",estado:"activa",etapa:"nuevo",creado:ahora()};
    const crear=f.elements.crearBusqueda&&f.elements.crearBusqueda.checked&&(o.marca||o.modelo);
    S.demandas.set(d.id,d);X.cliNueva=false;
    try{if(S.db)await S.db.doc("demandas/"+d.id).set(d);
      if(crear){const b=busquedaDesdeCliente(d);await guardar("busquedas/"+b.id,b,false);X.busquedas.set(b.id,b);d.busquedaId=b.id;await guardar("demandas/"+d.id,{busquedaId:b.id})}}
    catch(err){toast("No se ha podido guardar: "+(err.message||err))}
    const n=carsFor(d).length;toast(`Petición guardada · ${n} coche${n==1?"":"s"} encaja${n==1?"":"n"} ahora${crear?" · búsqueda clave creada":""}`);render();abrirCliente(d.id);return}
  if(f.id==="xc-editar"&&X.cli){e.preventDefault();const o=leerPeticion(f);X.cliEdit=false;await guardarDemanda(X.cli,o);return}
  if(f.id==="xb-form"){e.preventDefault();await guardarBusqueda(f);return}
},true);
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&X.cli&&!S.open&&!S.pubOpen){cerrarCliente();return}
  const t=e.target;if((e.key==="Enter"||e.key===" ")&&t.matches&&t.matches("[data-xcli]")){e.preventDefault();abrirCliente(t.dataset.xcli)}});

/* ---------- búsquedas clave ---------- */
// misma lógica que la base de datos (coincide_busqueda en supabase/08-busquedas-resenas.sql)
function coincide(b,l){
  if(l.estado==="descartado"||l.estado==="vendido")return false;
  if(b.marca&&!norm(l.marca).includes(norm(b.marca)))return false;
  if(b.modelo){const t=norm([l.marca,l.modelo,l.derivado].join(" "));if(!String(b.modelo).split(/\s*[,;/]\s*/).map(norm).filter(Boolean).some(m=>t.includes(m)))return false}
  if((b.combustibles||[]).length&&!b.combustibles.includes(l.combustible||""))return false;
  if((b.tipos||[]).length&&!b.tipos.includes(l.tipo||""))return false;
  const amin=Math.max(+b.anioMin||0,b.antiguedadMax?new Date().getFullYear()-(+b.antiguedadMax):0);if(amin&&(+l.anio||0)<amin)return false;
  if(b.kmMax&&l.km!=null&&+l.km>+b.kmMax)return false;
  if(b.cvMin&&(+l.cv||0)<+b.cvMin)return false;
  if(b.precioMax){const p=precioDe(l);if(p!=null&&p>+b.precioMax)return false}
  if(b.cambio==="Automático"&&!esAuto(l))return false;
  if(b.cambio==="Manual"&&esAuto(l))return false;
  return true}
const vivos=b=>[...S.lots.values()].filter(l=>!cerrado(l)&&!(b.ocultos||[]).includes(l.id)&&coincide(b,l));
function busquedaDesdeCliente(d){const id="b-"+nid();
  return{id,nombre:(d.nombre||"Cliente")+(d.marca||d.modelo?" · "+[d.marca,d.modelo].filter(Boolean).join(" "):""),clienteId:d.id,marca:d.marca||null,modelo:d.modelo&&!/^(cualquiera|indiferente)/i.test(d.modelo)?d.modelo:null,
    combustibles:d.combustibles||[],tipos:d.tipos||[],anioMin:d.anioMin||null,antiguedadMax:null,precioMax:d.presupuestoMax||null,kmMax:d.kmMax||null,cvMin:d.cvMin||null,
    cambio:/^(Automático|Manual)$/.test(d.cambio||"")?d.cambio:null,activa:true,correo:true,creado:ahora(),ocultos:[]}}
function formBusqueda(b){const v=k=>esc(b[k]??"");const cli=[...S.demandas.values()].filter(d=>d.estado!=="cerrada"||d.id===b.clienteId).sort((a,c)=>String(a.nombre||"").localeCompare(String(c.nombre||""),"es"));
  return`<form class="card" id="xb-form" style="display:grid;gap:12px;margin-bottom:16px" data-id="${esc(b.id||"")}"><h2 style="margin:0">${b.id?"Editar búsqueda":"Nueva búsqueda clave"}</h2>
  <div class="form"><label class="wide">Nombre<input name="nombre" required value="${v("nombre")}" placeholder="Ej.: Juan · Mazda MX-5 diésel"></label>
    <label class="wide">Cliente <span class="muted" style="font-weight:400">(opcional)</span><select name="clienteId"><option value="">Sin cliente</option>${cli.map(d=>`<option value="${esc(d.id)}" ${b.clienteId===d.id?"selected":""}>${esc(d.nombre||"Sin nombre")}${d.telefono?" · "+esc(d.telefono):""}</option>`).join("")}</select></label>
    <label>Marca<input name="marca" value="${v("marca")}" placeholder="Mazda"></label>
    <label>Modelo <span class="muted" style="font-weight:400">(varios con comas)</span><input name="modelo" value="${v("modelo")}" placeholder="MX5, MX-5"></label>
    <label>Antigüedad máx. (años)<input type="number" name="antiguedadMax" min="1" max="40" value="${v("antiguedadMax")}" placeholder="10"></label>
    <label>o año desde<input type="number" name="anioMin" value="${v("anioMin")}"></label>
    <label>Precio máx. (€)<input type="number" name="precioMax" step="500" value="${v("precioMax")}" placeholder="8000"></label>
    <label>Km máx.<input type="number" name="kmMax" step="10000" value="${v("kmMax")}"></label>
    <label>Potencia mín. (CV)<input type="number" name="cvMin" step="10" value="${v("cvMin")}"></label>
    <label>Cambio<select name="cambio"><option value="">Indiferente</option>${["Automático","Manual"].map(x=>`<option ${b.cambio===x?"selected":""}>${x}</option>`).join("")}</select></label>
    <label class="wide">Combustible<span class="chips">${COMBUS.map(t=>`<label class="chk"><input type="checkbox" name="combustibles" value="${t}" ${(b.combustibles||[]).includes(t)?"checked":""}>${t}</label>`).join("")}</span></label>
    <label class="wide">Tipo de vehículo<span class="chips">${TIPOS.map(t=>`<label class="chk"><input type="checkbox" name="tipos" value="${t}" ${(b.tipos||[]).includes(t)?"checked":""}>${t}</label>`).join("")}</span></label></div>
  <div class="row"><label class="toggle"><input type="checkbox" name="correo" ${b.correo!==false?"checked":""}><span>Avisar por correo (huelsan26@gmail.com) cuando entre un coche que encaje</span></label>
    <label class="toggle"><input type="checkbox" name="activa" ${b.activa!==false?"checked":""}><span>Activa</span></label></div>
  <div class="note" id="xb-prev"></div>
  <div class="row"><button class="btn primary" type="submit">${b.id?"Guardar cambios":"Guardar búsqueda"}</button><button class="btn" type="button" id="xb-cancelar">Cancelar</button></div>
  <div class="muted" style="font-size:12px">El precio se compara con el precio de BCA (salida, puja actual, reserva o compra ya) en subastas y con el precio de venta en el stock.</div></form>`}
function leerBusqueda(f){const fd=new FormData(f);const o={};for(const k of["nombre","clienteId","marca","modelo","cambio"])o[k]=(fd.get(k)||"").trim()||null;
  for(const k of["antiguedadMax","anioMin","precioMax","kmMax","cvMin"]){const v=fd.get(k);o[k]=v?+v:null}
  o.combustibles=fd.getAll("combustibles");o.tipos=fd.getAll("tipos");o.correo=!!fd.get("correo");o.activa=!!fd.get("activa");return o}
function previewBusqueda(){const f=$("#xb-form"),p=$("#xb-prev");if(!f||!p)return;const b=leerBusqueda(f);const n=vivos(b).length;
  p.textContent=`Ahora mismo encajan ${n} coche${n==1?"":"s"} de las subastas abiertas y el stock. A partir de ahora, cada recogida se compara sola.`}
async function guardarBusqueda(f){const o=leerBusqueda(f);if(!o.nombre){toast("Ponle un nombre");return}
  const id=f.dataset.id||("b-"+nid());const prev=X.busquedas.get(id)||{creado:ahora(),ocultos:[]};const b={...prev,...o,id};
  X.busquedas.set(id,b);X.bEdit=null;X.bAbiertas.add(id);
  try{await guardar("busquedas/"+id,b,false);if(b.clienteId){const d=S.demandas.get(b.clienteId);if(d&&d.busquedaId!==id)await guardarDemanda(d.id,{busquedaId:id})}toast("Búsqueda guardada")}
  catch(e){toast("No se ha podido guardar: "+(e.message||e))}render()}
function resumenB(b){return[b.marca||b.modelo?`<span class="tag acc">${esc([b.marca,b.modelo].filter(Boolean).join(" "))}</span>`:"",...(b.combustibles||[]).map(t=>`<span class="tag">${esc(t)}</span>`),...(b.tipos||[]).map(t=>`<span class="tag">${esc(t)}</span>`),
  b.antiguedadMax?`<span class="tag">Menos de ${b.antiguedadMax} años</span>`:"",b.anioMin?`<span class="tag">Desde ${b.anioMin}</span>`:"",b.precioMax?`<span class="tag">Hasta ${eur(b.precioMax)}</span>`:"",
  b.kmMax?`<span class="tag">Máx. ${num(b.kmMax)} km</span>`:"",b.cvMin?`<span class="tag">${b.cvMin}+ CV</span>`:"",b.cambio?`<span class="tag">${esc(b.cambio)}</span>`:""].join("")}
window.renderBusquedas=function(){
  const bs=[...X.busquedas.values()].sort((a,b)=>(nuevasDe(b.id)-nuevasDe(a.id))||String(b.creado||"").localeCompare(String(a.creado||"")));
  const ed=X.bEdit==="nueva"?{correo:true,activa:true}:(X.bEdit?X.busquedas.get(X.bEdit):null);
  $("#main").innerHTML=`<div class="pagehead"><div><h1>Búsquedas clave</h1><p>Guarda lo que te pide un cliente (marca, modelo, año, precio…). Cada recogida de BCA se compara sola con estas búsquedas: lo que encaja aparece aquí marcado como <span class="xnew">nuevo</span> y llega un correo con el resumen.</p></div>
    ${ed?"":`<button class="btn primary" id="xb-nueva">Nueva búsqueda</button>`}</div>
  ${ed?formBusqueda(ed):""}
  ${bs.length?bs.map(b=>{const live=vivos(b),cli=b.clienteId&&S.demandas.get(b.clienteId);const nuevas=[...X.coinc.values()].filter(c=>c.busqueda===b.id&&!c.visto);
    const nuevasIds=new Set(nuevas.map(c=>c.lote));const nuevasVin=new Set(nuevas.map(c=>c.vin).filter(Boolean));
    const esNueva=l=>nuevasIds.has(l.id)||(l.vin&&nuevasVin.has(l.vin));
    const pend=nuevas.filter(c=>!S.lots.has(c.lote)&&!live.some(l=>l.vin&&l.vin===c.vin));
    const lista=live.slice().sort((x,y)=>(esNueva(y)?1:0)-(esNueva(x)?1:0)||String(cierreOf(x)||"9").localeCompare(String(cierreOf(y)||"9")));
    const abierta=X.bAbiertas.has(b.id)||nuevas.length>0;
    return`<div class="card xb"><div class="row" style="justify-content:space-between"><div><h2>${esc(b.nombre||"Búsqueda")} ${nuevas.length?`<span class="xnew">${nuevas.length} nueva${nuevas.length>1?"s":""}</span>`:""}</h2>
        <div class="muted" style="font-size:12.5px">${cli?`Cliente: <a href="#" data-xcliabrir="${esc(cli.id)}">${esc(cli.nombre||"")}</a> · `:""}${b.activa===false?"<b>En pausa</b> · ":""}${b.correo!==false?"Aviso por correo":"Sin correo"} · creada el ${esc(fdate(b.creado))}</div></div>
      <div class="row"><button class="btn sm" data-xbeditar="${esc(b.id)}">Editar</button><button class="btn sm" data-xbpausa="${esc(b.id)}">${b.activa===false?"Activar":"Pausar"}</button>${nuevas.length?`<button class="btn sm" data-xbvisto="${esc(b.id)}">Marcar como vistas</button>`:""}<button class="btn sm ghost" data-xbborrar="${esc(b.id)}">Borrar</button></div></div>
      <div class="flags">${resumenB(b)||`<span class="muted" style="font-size:12.5px">Sin filtros</span>`}</div>
      <button class="btn sm ghost" data-xbtoggle="${esc(b.id)}" style="justify-self:start">${abierta?"▾":"▸"} ${live.length} coche${live.length==1?"":"s"} encaja${live.length==1?"":"n"} ahora${pend.length?` · ${pend.length} pendiente${pend.length>1?"s":""} de incorporar`:""}</button>
      ${abierta?`<div class="xlist">${pend.map(c=>`<div class="xitem"><span class="t">${esc(c.titulo||"")} <span class="xnew">nuevo</span><small>${[c.anio,c.km!=null?num(c.km)+" km":null,c.cv?c.cv+" CV":null,c.subasta,c.cierre?"cierra "+fdt(c.cierre):null].filter(Boolean).map(esc).join(" · ")} · <b>${eur(c.precio)}</b> · aún no incorporado (se añade al abrir la recogida)</small></span>${c.url?`<a class="btn sm" href="${esc(c.url)}" target="_blank" rel="noopener">BCA ↗</a>`:""}</div>`).join("")}
        ${lista.slice(0,60).map(l=>filaLote(l,`<span class="row">${esNueva(l)?`<span class="xnew">nuevo</span>`:""}${cli?`<button class="btn sm" data-xbproponer="${esc(b.id)}|${esc(l.id)}">Proponer a ${esc(String(cli.nombre||"cliente").split(" ")[0])}</button>`:""}<button class="btn sm ghost" data-xbocultar="${esc(b.id)}|${esc(l.id)}" title="No volver a mostrar este coche en esta búsqueda">Quitar</button></span>`)).join("")}
        ${!lista.length&&!pend.length?`<span class="muted" style="font-size:12.5px">Ahora mismo no encaja ningún coche. Te avisaremos cuando entre uno.</span>`:""}${lista.length>60?`<span class="muted" style="font-size:12.5px">…y ${lista.length-60} más: afina los filtros.</span>`:""}</div>`:""}
    </div>`}).join(""):ed?"":`<div class="empty"><strong>Sin búsquedas clave</strong>Crea una con «Nueva búsqueda» o desde la ficha de un cliente («Crear búsqueda clave con avisos»).</div>`}`;
  if(ed)previewBusqueda();contadores()};
document.addEventListener("click",async e=>{const t=e.target;
  if(t.closest("#xb-nueva")){X.bEdit="nueva";render();return}
  if(t.closest("#xb-cancelar")){X.bEdit=null;render();return}
  const bi=t.closest("[data-xbir]");if(bi){cerrarCliente();S.tab="busquedas";X.bAbiertas.add(bi.dataset.xbir);document.querySelectorAll("#tabs [data-tab]").forEach(x=>x.setAttribute("aria-selected",x.dataset.tab==="busquedas"));render();scrollTo(0,0);return}
  const ca=t.closest("[data-xcliabrir]");if(ca){e.preventDefault();abrirCliente(ca.dataset.xcliabrir);return}
  const be=t.closest("[data-xbeditar]");if(be){X.bEdit=be.dataset.xbeditar;render();scrollTo(0,0);return}
  const bt=t.closest("[data-xbtoggle]");if(bt){const id=bt.dataset.xbtoggle;X.bAbiertas.has(id)?X.bAbiertas.delete(id):X.bAbiertas.add(id);render();return}
  const bp=t.closest("[data-xbpausa]");if(bp){const b=X.busquedas.get(bp.dataset.xbpausa);if(!b)return;b.activa=b.activa===false;await guardar("busquedas/"+b.id,{activa:b.activa});render();return}
  const bv=t.closest("[data-xbvisto]");if(bv){const id=bv.dataset.xbvisto;const cs=[...X.coinc.values()].filter(c=>c.busqueda===id&&!c.visto);cs.forEach(c=>c.visto=true);render();
    for(const c of cs){try{await S.db.doc("coincidencias/"+c.id).update({visto:true})}catch(err){}}return}
  const bb=t.closest("[data-xbborrar]");if(bb){if(bb.dataset.ok!=="1"){bb.dataset.ok="1";bb.textContent="¿Seguro?";setTimeout(()=>{if(bb.isConnected){bb.dataset.ok="";bb.textContent="Borrar"}},3000);return}
    const id=bb.dataset.xbborrar;X.busquedas.delete(id);render();try{await S.db.doc("busquedas/"+id).delete();for(const c of [...X.coinc.values()].filter(c=>c.busqueda===id))await S.db.doc("coincidencias/"+c.id).delete().catch(()=>{})}catch(err){toast("No se ha podido borrar")}return}
  const bo=t.closest("[data-xbocultar]");if(bo){const[bid,lid]=bo.dataset.xbocultar.split("|");const b=X.busquedas.get(bid);if(!b)return;b.ocultos=[...new Set([...(b.ocultos||[]),lid])];render();await guardar("busquedas/"+bid,{ocultos:b.ocultos});
    const c=[...X.coinc.values()].find(c=>c.busqueda===bid&&c.lote===lid&&!c.visto);if(c){c.visto=true;S.db.doc("coincidencias/"+c.id).update({visto:true}).catch(()=>{})}return}
  const bpp=t.closest("[data-xbproponer]");if(bpp){const[bid,lid]=bpp.dataset.xbproponer.split("|");const b=X.busquedas.get(bid);if(b&&b.clienteId)await proponer(b.clienteId,lid);return}
});

/* ---------- publicar en la web con paso previo ----------
   La web pública lee la copia publicada del coche (l.web), no los datos que se están editando (supabase/09-publicar-web.sql).
   «Revisar y publicar» / «Revisar y actualizar» enseñan qué va a salir y avisan de lo que falta antes de confirmar. */
const CAMPOS_WEB=["marca","modelo","derivado","anio","km","combustible","cv","motor","cambio","tipo","plazas","color","equipamiento","etiquetaDGT","precioVenta","textoVenta","fotosWeb"];
const fichaWeb=l=>{const o={};for(const k of CAMPOS_WEB){const v=k==="fotosWeb"?(l.fotosWeb||[]):l[k];if(v!=null&&v!==""&&!(k==="fotosWeb"&&!v.length))o[k]=v}return o};
const copiaWeb=l=>{const o={};for(const k of CAMPOS_WEB)o[k]=k==="fotosWeb"?[...(l.fotosWeb||[])]:(l[k]??null);o.publicadoEn=ahora();o.publicadoPor=X.user||null;return o};
const publicada=l=>!!(l&&l.publico&&l.web&&typeof l.web==="object");
function cambiosWeb(l){if(!publicada(l))return[];const a=fichaWeb(l),b=fichaWeb(l.web),out=[];
  for(const k of CAMPOS_WEB){if(JSON.stringify(a[k]??null)===JSON.stringify(b[k]??null))continue;
    const n=k==="precioVenta"?"precio":k==="textoVenta"?"texto de venta":k==="fotosWeb"?"fotos":k==="equipamiento"?"equipamiento":"datos del coche";if(!out.includes(n))out.push(n)}return out}
window.cambiosWeb=cambiosWeb;window.publicadaWeb=publicada;
function revisionWeb(l,actualizar){const owned=isOwned(l),w=l.fotosWeb||[],mat=l.fotosWebMat||{};
  const avisos=[],ok=[];const t=titleOf(l);
  if(!l.marca||/^nuevo coche$/i.test(String(l.marca).trim())||!l.modelo)avisos.push("Revisa la marca y el modelo: ahora sale «"+(t||"sin nombre")+"».");else ok.push("Nombre: "+t);
  if(!owned&&cerrado(l))avisos.push("La subasta ya ha cerrado: no saldrá en la web hasta que el coche esté en stock.");
  if(owned){if(l.precioVenta==null)avisos.push("Sin precio de venta: saldrá «Consultar precio».");else ok.push("Precio: "+eur(l.precioVenta))}
  if(!w.length)avisos.push("Sin fotos: saldrá «Fotos disponibles bajo petición».");else{ok.push(w.length+" foto"+(w.length>1?"s":""));
    const sinRev=w.filter(n=>mat[n]===false).length;if(sinRev)avisos.push(sinRev+" foto"+(sinRev>1?"s":"")+" con la matrícula sin tapar automáticamente: compruébala"+(sinRev>1?"s":"")+" antes.")}
  if(!String(l.textoVenta||"").trim())avisos.push("Sin texto de venta (es opcional).");else ok.push("Texto de venta");
  if(l.anio==null||l.km==null)avisos.push("Falta el año o los kilómetros.");
  const camb=actualizar?cambiosWeb(l):[];const w0=l.web||{};
  const det=actualizar?camb.map(c=>c==="precio"?`precio (${w0.precioVenta!=null?eur(w0.precioVenta):"sin precio"} → ${l.precioVenta!=null?eur(l.precioVenta):"sin precio"})`:c==="fotos"?`fotos (${(w0.fotosWeb||[]).length} → ${w.length}${(w0.fotosWeb||[]).length===w.length?", cambia el orden o alguna foto":""})`:c):[];
  const f0=w[0];
  return`<div class="xrev" role="region" aria-label="Revisión antes de publicar"><b>${actualizar?"Revisa los cambios antes de actualizar la web":"Revisa cómo va a salir en la web"}</b>
    <div class="xrev-car">${f0?`<img src="${esc(/^https?:/.test(f0)?f0:FOTOS_WEB()+f0)}" alt="">`:`<div class="xrev-nof">Sin fotos</div>`}<div><div style="font-weight:700">${esc(t)}</div><div class="muted" style="font-size:12.5px">${[l.anio,l.km!=null?num(l.km)+" km":null,l.combustible,l.cv?l.cv+" CV":null].filter(Boolean).map(esc).join(" · ")}</div><div style="font-weight:700;margin-top:2px">${owned?(l.precioVenta!=null?eur(l.precioVenta):"Consultar precio"):"Por encargo"}</div></div></div>
    ${actualizar?`<div style="font-size:13px">Se va a cambiar en la web: <b>${esc(det.join(", ")||"nada")}</b>.</div>`:""}
    ${ok.length?`<ul class="xrev-ok">${ok.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}
    ${avisos.length?`<ul class="xrev-av">${avisos.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}
    <div class="row"><button class="btn primary sm" id="xw-confirmar">${actualizar?"Actualizar en la web":"Publicar en la web"}</button><button class="btn sm" id="xw-cancelar">Cancelar</button></div></div>`}

/* ---------- ficha del coche: panel «En la web», clientes y reseña ---------- */
const origDrawer=window.renderDrawer;
window.renderDrawer=function(){origDrawer.apply(this,arguments);try{ampliarFicha()}catch(e){console.error(e)}};
function fotosCandidatas(l){
  const web=l.fotosWeb||[],org=l.fotosWebOrigen||{},mat=l.fotosWebMat||{},mapa=l.fotosBcaMap||{};
  const usados=new Map(Object.entries(org).filter(([n])=>web.includes(n)).map(([n,k])=>[k,n]));
  const out=[];
  web.forEach((n,i)=>{const k=org[n];out.push({clave:k||"web:"+n,web:n,n:i+1,src:/^https?:/.test(n)?n:FOTOS_WEB()+n,origen:k?(k.startsWith("bca:")?"BCA":"Propia"):"Estudio",mat:mat[n]})});
  for(const id of l.fotos||[]){const k="int:"+id;if(usados.has(k))continue;if(mapa[id]&&usados.has("bca:"+mapa[id]))continue;out.push({clave:k,src:BLOB+id,origen:mapa[id]?"BCA (guardada)":"Propia"})}
  const ya=new Set([...Object.values(mapa)]);
  for(const id of l.fotoIds||[]){const k="bca:"+id;if(usados.has(k)||ya.has(id))continue;out.push({clave:k,src:BCA_IMG(id,320),origen:"BCA"})}
  return out}
function ampliarFicha(){
  const l=S.open&&S.lots.get(S.open),dr=$("#drawer");if(!l||!dr)return;
  const secs=[...dr.querySelectorAll(".dsec")],dec=secs.find(s=>{const h=s.querySelector("h3");return h&&h.textContent.trim()==="Decisión"});if(!dec)return;
  // se retira lo antiguo (interruptor de la web y línea de fotos) y se pone el panel nuevo justo debajo de «Decisión»
  const viejo=dec.querySelector("#d-publico");if(viejo)viejo.closest("label").remove();
  [...dec.querySelectorAll(".row")].forEach(r=>{if(/Fotos para la web/.test(r.textContent))r.remove()});
  const ds=demandsFor(l),propuestoA=[...S.demandas.values()].filter(d=>(d.propuestos||[]).some(p=>p.id===l.id));
  [...dec.children].forEach(c=>{if(/busca.{0,3}algo así/.test(c.textContent))c.remove()});
  const fotos=fotosCandidatas(l),nWeb=(l.fotosWeb||[]).length,owned=isOwned(l);
  const anun=l.anuncio&&l.anuncio.descripcion;
  const web=document.createElement("div");web.className="dsec";web.id="xweb";
  web.innerHTML=`<h3>En la web <a href="https://huelsanautomocion.com/#stock" target="_blank" rel="noopener" style="font-weight:400;font-size:12.5px;margin-left:6px">Ver la web ↗</a></h3>
    ${estadoWeb(l)}
    <div class="muted" style="font-size:12px">Lo que cambies aquí (precio, texto, fotos) no sale en la web hasta que pulses ${publicada(l)?"«Revisar y actualizar cambios»":"«Revisar y publicar»"}, abajo.</div>
    ${owned?`<div class="form"><label>Precio de venta en la web (€)<input type="number" id="xw-precio" data-e="precioVenta" step="100" value="${esc(l.precioVenta??"")}" placeholder="Sin precio: «Consultar precio»"></label></div>`:""}
    <label style="display:grid;gap:4px;font-size:12px;font-weight:600;color:var(--muted)">Texto de venta <span style="font-weight:400">(sale en la ficha del coche, debajo de las fotos)</span>
      <textarea id="xw-texto" data-e="textoVenta" data-kind="text" rows="4" maxlength="1500" placeholder="Ej.: Único propietario, libro de revisiones al día y neumáticos nuevos. Garantía de 12 meses.">${esc(l.textoVenta??"")}</textarea></label>
    <div class="row">${anun?`<button class="btn sm" id="xw-anuncio">Usar el texto del anuncio</button>`:""}${S.sample?`<button class="btn sm" id="xw-ia" ${X.iaOcupada?"disabled":""}>${X.iaOcupada?"Redactando…":"Redactar con IA"}</button>`:""}</div>
    <div style="display:grid;gap:6px"><div class="row" style="justify-content:space-between"><b style="font-size:13px">Fotos en la web: ${nWeb||"ninguna"}</b><span class="muted" style="font-size:12px">Toca una foto para ponerla o quitarla · la nº 1 es la principal</span></div>
      ${fotos.length?`<div class="xfotos">${fotos.map(f=>`<button type="button" class="xfoto ${f.web?"on":""} ${X.fotoOcupada.has(l.id+"|"+f.clave)?"busy":""}" data-xfoto="${esc(f.clave)}" aria-pressed="${f.web?"true":"false"}" aria-label="${f.web?"Quitar de la web":"Poner en la web"} (${esc(f.origen)})"><img src="${esc(f.src)}" alt="" loading="lazy">${f.web?`<span class="n">${f.n}</span>`:""}<span class="ck">${f.web?"✓":""}</span>${f.web&&f.mat!=null?`<span class="mat ${f.mat?"ok":""}">${f.mat?"Matrícula tapada":"Revisa la matrícula"}</span>`:""}<span class="src">${esc(f.origen)}</span>${f.web&&f.n>1?`<span class="pri" data-xprincipal="${esc(f.web)}">Principal</span>`:""}</button>`).join("")}</div>`
        :`<div class="muted" style="font-size:12.5px">Este coche no tiene fotos. Súbelas con el botón de abajo.</div>`}
      ${X.fotoMsg?`<div class="note" role="status">${esc(X.fotoMsg)}</div>`:""}
      <div class="row"><label class="btn sm">Subir fotos<input type="file" id="xw-subir" accept="image/*" multiple hidden></label><a class="btn sm" href="folleto/?id=${encodeURIComponent(l.id)}" style="text-decoration:none">Retocar en el Estudio (matrícula, fondo, folleto)</a>${nWeb?`<button class="btn sm ghost" id="xw-quitartodas">Quitar todas</button>`:""}</div>
      <div class="muted" style="font-size:12px">Al poner una foto se intenta tapar la matrícula sola (placa europea con franja azul). Si sale «Revisa la matrícula», ábrela en el Estudio y tápala a mano.${(l.fotoIds||[]).length?" Las fotos de BCA necesitan la extensión de Huelsan instalada en este navegador.":""}</div></div>`;
  const bar=document.createElement("div");
  bar.innerHTML=X.revisar===l.id?revisionWeb(l,publicada(l)):`<div class="xpubbar">${publicada(l)?(cambiosWeb(l).length?`<button class="btn primary sm" id="xw-revisar">Revisar y actualizar cambios</button>`:`<span class="muted" style="font-size:12.5px">La web está al día.</span>`)+`<button class="btn sm ghost" id="xw-retirar">Retirar de la web</button>`:`<button class="btn primary sm" id="xw-revisar">Revisar y publicar</button>`}</div>`;
  web.appendChild(bar);
  dec.after(web);
  // clientes
  const cl=document.createElement("div");cl.className="dsec";cl.id="xclientes";
  const activos=[...S.demandas.values()].filter(d=>d.estado!=="cerrada"&&!propuestoA.includes(d)).sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es"));
  cl.innerHTML=`<h3>Clientes</h3>
    ${propuestoA.length?`<div class="xlist">${propuestoA.map(d=>{const p=d.propuestos.find(x=>x.id===l.id);return`<div class="xitem"><span class="t" data-xcliabrir="${esc(d.id)}">${esc(d.nombre||"Cliente")}<small>Propuesto el ${esc(fdate(p.fecha))}</small></span><span class="tag ${p.estado==="interesa"?"good":p.estado==="no"?"":"acc"}">${esc((PROP.find(x=>x[0]===p.estado)||[,"Propuesto"])[1])}</span></div>`}).join("")}</div>`:""}
    ${ds.filter(d=>!propuestoA.includes(d)).length?`<div class="muted" style="font-size:12.5px">Encaja con lo que buscan:</div><div class="xlist">${ds.filter(d=>!propuestoA.includes(d)).map(d=>`<div class="xitem"><span class="t" data-xcliabrir="${esc(d.id)}">${esc(d.nombre||"Cliente")}<small>${esc([d.marca,d.modelo].filter(Boolean).join(" ")||"")}${d.presupuestoMax?" · hasta "+eur(d.presupuestoMax):""}</small></span><button class="btn sm primary" data-xproponera="${esc(d.id)}">Proponer</button></div>`).join("")}</div>`:""}
    ${activos.length?`<div class="row"><select id="xw-cli" style="flex:1 1 200px;min-width:0"><option value="">Proponer a otro cliente…</option>${activos.map(d=>`<option value="${esc(d.id)}">${esc(d.nombre||"Sin nombre")}</option>`).join("")}</select><button class="btn sm" id="xw-cli-ok">Proponer</button></div>`:`<span class="muted" style="font-size:12.5px">No hay clientes activos.</span>`}`;
  web.after(cl);
  // reseña (coches vendidos)
  if(l.estado==="vendido"){const inv=[...X.resenas.values()].filter(r=>r.loteId===l.id);
    const rs=document.createElement("div");rs.className="dsec";rs.id="xresena";
    rs.innerHTML=`<h3>Reseña del cliente</h3>
      ${inv.map(r=>`<div class="xitem"><span class="t">${esc(r.cliente||"Cliente")}<small>${r.estado==="invitada"?"Enlace creado el "+esc(fdate(r.creada))+", sin responder":r.estado==="recibida"?"Respondida: "+"★".repeat(+(r.respuesta&&r.respuesta.estrellas)||0)+" · pendiente de aprobar":r.estado==="publicada"?"Publicada en la web":"No publicada"}</small></span>${r.estado==="invitada"?`<button class="btn sm" data-xrcopiar="${esc(r.id)}">Copiar enlace</button>`:`<a class="btn sm" href="resenas/" style="text-decoration:none">Ver</a>`}</div>`).join("")}
      ${X.resLink&&X.resLink.lote===l.id?`<div class="xlink"><input readonly value="${esc(X.resLink.url)}" id="xr-url"><button class="btn sm primary" data-xrcopiar="${esc(X.resLink.id)}">Copiar enlace</button></div><div class="muted" style="font-size:12px">Envíaselo al cliente por WhatsApp o correo. Cuando responda, llega un aviso y la apruebas en Menú → Reseñas.</div>`:""}
      <div class="row"><input id="xr-nombre" placeholder="Nombre del cliente" value="${esc(l.facturaVenta&&l.facturaVenta.cliente||"")}" style="flex:1 1 180px;min-width:0"><button class="btn sm primary" id="xr-crear">Crear enlace de reseña</button></div>`;
    cl.after(rs)}
}
function estadoWeb(l){const f=d=>d?new Date(d).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
  if(!publicada(l))return`<div class="xpub off"><span>●</span><span><b>No está en la web.</b> ${isOwned(l)?"Saldrá como «En stock».":"Saldrá como «Por encargo» hasta que cierre la subasta, sin ningún dato de la subasta."}</span></div>`;
  if(["vendido","descartado"].includes(l.estado))return`<div class="xpub off"><span>●</span><span><b>${l.estado==="vendido"?"Vendido":"Descartado"}:</b> ya no sale en la web.</span></div>`;
  if(!isOwned(l)&&cerrado(l))return`<div class="xpub off"><span>●</span><span><b>Subasta cerrada:</b> ya no sale en la web.</span></div>`;
  const c=cambiosWeb(l);
  return c.length?`<div class="xpub warn"><span>●</span><span><b>Hay cambios sin publicar</b> (${esc(c.join(", "))}). La web sigue mostrando la versión del ${esc(f(l.web.publicadoEn))}.</span></div>`
    :`<div class="xpub ok"><span>●</span><span><b>Publicado en la web</b> · actualizado el ${esc(f(l.web.publicadoEn))}.</span></div>`}
async function codigoNuevo(){const a=new Uint8Array(12);crypto.getRandomValues(a);return[...a].map(b=>b.toString(36).padStart(2,"0")).join("").slice(0,20)}
const urlResena=c=>(/^prueba--/.test(location.hostname)?"https://prueba--huelsan-automocion.netlify.app":"https://huelsanautomocion.com")+"/opinion/?c="+c;
async function copiar(txt){try{await navigator.clipboard.writeText(txt);toast("Enlace copiado")}catch(e){prompt("Copia el enlace",txt)}}
window.HUELSAN_RESENA_NUEVA=async(cliente,coche,loteId)=>{const c=await codigoNuevo();const r={id:c,cliente:cliente||"",coche:coche||"",loteId:loteId||null,creada:ahora(),estado:"invitada",avisado:true,creadaPor:X.user};
  await guardar("resenas/"+c,r,false);X.resenas.set(c,r);return{...r,url:urlResena(c)}};
document.addEventListener("click",async e=>{const t=e.target;if(!t.closest("#drawer"))return;
  const l=S.open&&S.lots.get(S.open);if(!l)return;
  const fx=t.closest("[data-xprincipal]");if(fx){e.stopPropagation();const n=fx.dataset.xprincipal;const w=(l.fotosWeb||[]).filter(x=>x!==n);await saveLot(l.id,{fotosWeb:[n,...w]});return}
  const fb=t.closest("[data-xfoto]");if(fb){await alternarFoto(l,fb.dataset.xfoto);return}
  if(t.closest("#xw-revisar")){X.revisar=l.id;renderDrawer();const r=$("#xweb .xrev");r&&r.scrollIntoView({block:"nearest",behavior:"smooth"});return}
  if(t.closest("#xw-cancelar")){X.revisar=null;renderDrawer();return}
  if(t.closest("#xw-confirmar")){const act=publicada(l);X.revisar=null;
    try{await saveLot(l.id,{publico:true,web:copiaWeb(S.lots.get(l.id)||l)});toast(act?"Cambios publicados en la web":"Coche publicado en la web")}catch(err){toast("No se ha podido publicar: "+(err.message||err))}
    renderDrawer();return}
  const rt=t.closest("#xw-retirar");if(rt){if(rt.dataset.ok!=="1"){rt.dataset.ok="1";rt.textContent="¿Seguro? Pulsa otra vez";setTimeout(()=>{if(rt.isConnected){rt.dataset.ok="";rt.textContent="Retirar de la web"}},3000);return}
    await saveLot(l.id,{publico:false});toast("Retirado de la web");renderDrawer();return}
  if(t.closest("#xw-quitartodas")){if(!confirm("¿Quitar todas las fotos de la web de este coche?"))return;await saveLot(l.id,{fotosWeb:[]});return}
  if(t.closest("#xw-anuncio")){await saveLot(l.id,{textoVenta:l.anuncio.descripcion});toast("Texto del anuncio copiado: revísalo");return}
  if(t.closest("#xw-ia")){await redactarIA(l);return}
  const pa=t.closest("[data-xproponera]");if(pa){await proponer(pa.dataset.xproponera,l.id);renderDrawer();return}
  if(t.closest("#xw-cli-ok")){const v=($("#xw-cli")||{}).value;if(!v){toast("Elige un cliente");return}await proponer(v,l.id);renderDrawer();return}
  const ca=t.closest("[data-xcliabrir]");if(ca){S.open=null;renderDrawer();abrirCliente(ca.dataset.xcliabrir);return}
  if(t.closest("#xr-crear")){const nom=($("#xr-nombre")||{}).value||"";try{const r=await window.HUELSAN_RESENA_NUEVA(nom.trim(),titleOf(l)+(l.anio?" "+l.anio:""),l.id);X.resLink={id:r.id,url:r.url,lote:l.id};renderDrawer();copiar(r.url)}catch(err){toast("No se ha podido crear: "+(err.message||err))}return}
  const rc=t.closest("[data-xrcopiar]");if(rc){copiar(urlResena(rc.dataset.xrcopiar));return}
});
document.addEventListener("change",async e=>{const t=e.target;if(t.id!=="xw-subir"||!S.open)return;const l=S.lots.get(S.open);const fs=[...t.files];t.value="";if(!fs.length)return;
  X.fotoMsg=`Subiendo ${fs.length} foto${fs.length>1?"s":""}…`;renderDrawer();const ids=[];
  try{for(const f of fs){ids.push((await HUELSAN.subir("fotos",await reducir(f,3000))).id)}
    await saveLot(l.id,{fotos:[...(l.fotos||[]),...ids]});X.fotoMsg=`${ids.length} foto${ids.length>1?"s":""} subida${ids.length>1?"s":""}. Tócalas para ponerlas en la web.`}
  catch(err){X.fotoMsg="No se han podido subir: "+(err.message||err)}renderDrawer()});

/* fotos: poner / quitar con un toque */
function extPedir(tipo,extra){return new Promise((res,rej)=>{if(!document.documentElement.dataset.huelsanExt){rej(new Error("Para traer fotos de BCA instala la extensión de Huelsan en este navegador (Chrome o Edge)."));return}
  const id=Math.random().toString(36).slice(2);const fin=()=>{window.removeEventListener("message",h);clearTimeout(tm)};
  const h=e=>{if(e.source===window&&e.data&&e.data.respuesta&&e.data.id===id){fin();e.data.ok?res(e.data):rej(new Error(e.data.msg||"Error"))}};
  const tm=setTimeout(()=>{fin();rej(new Error("La extensión no responde"))},30000);
  window.addEventListener("message",h);window.postMessage({huelsanExt:tipo,id,...extra},location.origin)})}
function b64Blob(b64,tipo){const s=atob(b64),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return new Blob([u],{type:tipo||"image/jpeg"})}
async function blobDe(l,clave){
  if(clave.startsWith("bca:")){const r=await extPedir("foto-bca",{docId:clave.slice(4),ancho:1920});return b64Blob(r.base64,r.tipo)}
  if(clave.startsWith("int:")){const id=clave.slice(4),bid=(l.fotosBcaMap||{})[id];
    if(bid&&document.documentElement.dataset.huelsanExt){try{const r=await extPedir("foto-bca",{docId:bid,ancho:1920});return b64Blob(r.base64,r.tipo)}catch(e){}}
    const r=await fetch(BLOB+id);if(!r.ok)throw new Error("No se pudo leer la foto");return await r.blob()}
  throw new Error("Foto desconocida")}
async function reducir(blob,max){const bm=await createImageBitmap(blob);const k=Math.min(1,max/Math.max(bm.width,bm.height));
  const c=document.createElement("canvas");c.width=Math.round(bm.width*k);c.height=Math.round(bm.height*k);const x=c.getContext("2d");x.imageSmoothingQuality="high";x.drawImage(bm,0,0,c.width,c.height);
  return await new Promise(r=>c.toBlob(r,"image/jpeg",.92))}
async function alternarFoto(l,clave){
  const web=[...(l.fotosWeb||[])],org={...(l.fotosWebOrigen||{})};
  if(clave.startsWith("web:")){const n=clave.slice(4);await saveLot(l.id,{fotosWeb:web.filter(x=>x!==n)});return}
  const ya=web.find(n=>org[n]===clave);if(ya){await saveLot(l.id,{fotosWeb:web.filter(x=>x!==ya)});return}
  const key=l.id+"|"+clave;if(X.fotoOcupada.has(key))return;X.fotoOcupada.add(key);X.fotoMsg="";renderDrawer();
  try{const blob=await blobDe(l,clave);const{blob:out,tapada}=await taparMatricula(blob);
    const r=await HUELSAN.subir("fotos-web",out);const cur=S.lots.get(l.id)||l;const w=[...(cur.fotosWeb||[]),r.id];
    await saveLot(l.id,{fotosWeb:w,fotosWebOrigen:{...(cur.fotosWebOrigen||{}),[r.id]:clave},fotosWebMat:{...(cur.fotosWebMat||{}),[r.id]:tapada}});
    if(!tapada)X.fotoMsg="Foto añadida, pero no he encontrado la matrícula: comprueba que no se lee (si se lee, quítala y retócala en el Estudio).";
    if(publicada(cur))X.fotoMsg=(X.fotoMsg?X.fotoMsg+" ":"")+"Pulsa «Revisar y actualizar cambios» para que se vea en la web.";}
  catch(err){X.fotoMsg="No se ha podido añadir la foto: "+(err.message||err)}
  finally{X.fotoOcupada.delete(key);renderDrawer()}}
/* Tapado automático de matrícula: busca la franja azul de la placa europea y difumina la placa que va a su derecha.
   Es una ayuda: si no la encuentra, la foto se sube igual y se avisa para revisarla. */
async function taparMatricula(blob){
  const bm=await createImageBitmap(blob);const k=Math.min(1,2400/Math.max(bm.width,bm.height));
  const W=Math.round(bm.width*k),Hh=Math.round(bm.height*k);const c=document.createElement("canvas");c.width=W;c.height=Hh;const x=c.getContext("2d");x.imageSmoothingQuality="high";x.drawImage(bm,0,0,W,Hh);
  const caja=detectarPlaca(c);
  if(caja){const{x0,y0,w,h}=caja;const p=Math.round(h*.25);const rx=Math.max(0,x0-p),ry=Math.max(0,y0-p),rw=Math.min(W-rx,w+2*p),rh=Math.min(Hh-ry,h+2*p);
    // pixelado fuerte + desenfoque: ilegible y discreto
    const t=document.createElement("canvas");const n=Math.max(4,Math.round(rw/22));t.width=n;t.height=Math.max(2,Math.round(n*rh/rw));const tx=t.getContext("2d");tx.drawImage(c,rx,ry,rw,rh,0,0,t.width,t.height);
    x.save();x.imageSmoothingEnabled=true;x.filter="blur("+Math.max(4,Math.round(h/6))+"px)";x.drawImage(t,0,0,t.width,t.height,rx,ry,rw,rh);x.restore()}
  const out=await new Promise(r=>c.toBlob(r,"image/jpeg",.92));return{blob:out,tapada:!!caja}}
function detectarPlaca(c){
  const W0=c.width,H0=c.height,s=Math.min(1,720/W0),W=Math.round(W0*s),H=Math.round(H0*s);
  const t=document.createElement("canvas");t.width=W;t.height=H;const tx=t.getContext("2d",{willReadFrequently:true});tx.drawImage(c,0,0,W,H);
  const d=tx.getImageData(0,0,W,H).data;const azul=new Uint8Array(W*H);
  for(let i=0,p=0;i<d.length;i+=4,p++){const r=d[i],g=d[i+1],b=d[i+2];if(b>90&&b-r>55&&b-g>25&&r<110)azul[p]=1}
  const vis=new Uint8Array(W*H);let mejor=null;
  for(let p=0;p<W*H;p++){if(!azul[p]||vis[p])continue;
    let x0=1e9,x1=-1,y0=1e9,y1=-1,n=0;const pila=[p];vis[p]=1;
    while(pila.length){const q=pila.pop();const qx=q%W,qy=(q/W)|0;n++;if(qx<x0)x0=qx;if(qx>x1)x1=qx;if(qy<y0)y0=qy;if(qy>y1)y1=qy;
      for(const r of[q-1,q+1,q-W,q+W]){if(r<0||r>=W*H||vis[r]||!azul[r])continue;if((r===q-1||r===q+1)&&((r/W)|0)!==qy)continue;vis[r]=1;pila.push(r)}}
    const w=x1-x0+1,h=y1-y0+1;if(h<6||w<2||n<10)continue;const ratio=h/w;if(ratio<1.3||ratio>4.5)continue;if(n/(w*h)<.45)continue;
    // a la derecha debe haber una zona clara (la placa) de unas 4-5 alturas
    const pw=Math.round(h*4.4),px0=x1+1,px1=Math.min(W-1,x1+pw);if(px1-px0<h*2.5)continue;
    let claros=0,tot=0;for(let yy=y0+Math.round(h*.15);yy<=y1-Math.round(h*.15);yy+=1)for(let xx=px0;xx<=px1;xx+=2){const i=(yy*W+xx)*4;const r=d[i],g=d[i+1],b=d[i+2];const mx=Math.max(r,g,b),mn=Math.min(r,g,b);tot++;if(mx>150&&mx-mn<45)claros++}
    const frac=claros/tot;if(frac<.45)continue;
    const punt=frac*n;if(!mejor||punt>mejor.punt)mejor={punt,x0,y0,w:pw+w,h}}
  if(!mejor)return null;const k=1/s;return{x0:Math.round(mejor.x0*k),y0:Math.round(mejor.y0*k),w:Math.round(mejor.w*k),h:Math.round(mejor.h*k)}}
window.HUELSAN_DETECTAR_PLACA=detectarPlaca;

/* texto de venta con IA (misma función de estimaciones: Gemini en Supabase) */
async function redactarIA(l){if(!S.sample||X.iaOcupada)return;X.iaOcupada=true;renderDrawer();
  const datos={marca:l.marca,modelo:l.modelo,version:l.derivado,anio:l.anio,km:l.km,combustible:l.combustible,cv:l.cv,cambio:l.cambio||(esAuto(l)?"Automático":null),color:l.color,plazas:l.plazas,duenos:l.duenos,libroMantenimiento:l.libro,equipamiento:String(l.equipamiento||"").slice(0,800),notasInternas:String(l.notas||"").slice(0,400),garantia:"12 meses"};
  const prompt=`Eres el vendedor de Huelsan Automoción, compraventa de coches de ocasión. Escribe el texto de venta para la ficha de este coche en nuestra web, en español de España: 3-5 frases, tono cercano y profesional, sin exagerar ni inventar nada que no esté en los datos, destacando lo que más valora un comprador (estado, mantenimiento, equipamiento útil, consumo, garantía). Sin emojis, sin precio, sin mencionar subastas ni BCA, sin matrícula. Datos: ${JSON.stringify(datos)}. Responde solo con JSON: {"texto":"..."}`;
  try{const r=await S.sample.json(prompt,{modelTier:"default"});const tx=r&&(r.texto||r.text);if(!tx)throw new Error("Respuesta vacía");
    await saveLot(l.id,{textoVenta:String(tx).trim().slice(0,1500)});toast("Texto redactado: revísalo antes de publicarlo")}
  catch(err){toast("No se ha podido redactar: "+(err.message||err))}
  finally{X.iaOcupada=false;renderDrawer()}}
})();
