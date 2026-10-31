/* Huelsan Automoción · facturación
   Clientes, facturas de venta (borrador → emitida, con numeración correlativa asignada por la base de datos),
   rectificativas y anulaciones, cobros, compras y gastos con sus facturas en PDF, contabilidad por matrícula,
   resumen de IVA y libros registro. Normativa: RD 1619/2012 (Reglamento de facturación) y Ley 37/1992 del IVA
   (régimen especial de bienes usados, arts. 135-139). */
"use strict";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const r2=n=>Math.round((+n||0)*100+Number.EPSILON*Math.sign(+n||0))/100;
const miles=s=>s.replace(/\B(?=(\d{3})+(?!\d))/g,".");
const eur=n=>{if(n==null||n===""||isNaN(+n))return"—";const v=r2(n);const neg=v<0;const [e,d]=Math.abs(v).toFixed(2).split(".");return(neg?"−":"")+miles(e)+","+d+" €"};
const numES=n=>{const v=r2(n);const [e,d]=Math.abs(v).toFixed(2).split(".");return(v<0?"-":"")+miles(e)+","+d};
const fecha=s=>{if(!s)return"—";const d=String(s).slice(0,10).split("-");return d.length===3?`${d[2]}/${d[1]}/${d[0]}`:s};
const hoyISO=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const nid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const normMat=s=>String(s||"").toUpperCase().replace(/[\s-]/g,"");
const trimestre=f=>f?Math.floor((+String(f).slice(5,7)-1)/3)+1:null;
let toastT;function toast(m,ms=3200){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,ms)}

/* ---------- catálogos ---------- */
const TIPOS_IVA=[["REBU","REBU (bienes usados)"],["21","IVA 21 %"],["10","IVA 10 %"],["4","IVA 4 %"],["0","Exento / 0 %"]];
const FORMAS_PAGO=["Transferencia bancaria","Efectivo","Tarjeta","Financiación","Bizum","Cheque / pagaré","Permuta y diferencia"];
const CATS_GASTO=["Compra del vehículo","Transporte y portes","Limpieza y estética","Mecánica y mantenimiento","Chapa y pintura","Neumáticos","ITV","Gestoría, transferencia e impuestos","Seguro","Comisiones de compra","Publicidad y venta","Garantía","Otros"];
const REGIMEN_GASTO=[["General","Con IVA deducible (factura normal)"],["REBU","REBU (sin IVA desglosado)"],["Particular","Compra a particular (sin IVA)"],["Exento","Exento / sin IVA"]];
const LIM_EFECTIVO=1000; // Ley 7/2012 art. 7: pagos en efectivo entre empresario y consumidor/empresario, máximo 1.000 € (Ley 11/2021)
const TXT_REBU="Régimen especial de los bienes usados";
const TXT_GARANTIA="Vehículo de ocasión con garantía legal de 1 año desde la entrega para compradores consumidores (Real Decreto Legislativo 1/2007, arts. 114 y ss.). El comprador declara conocer y aceptar el estado del vehículo, sus kilómetros y su equipamiento.";
const TXT_RGPD="Sus datos se tratan para gestionar la venta y cumplir obligaciones legales (fiscales y de Tráfico). Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a nuestro correo.";

/* ---------- estado ---------- */
const S={db:null,tab:"facturas",emisor:{},facturas:new Map(),clientes:new Map(),gastos:new Map(),cont:new Map(),lotes:[],
  ed:null,edSucio:false,filtro:{anio:String(new Date().getFullYear()),estado:"",q:""},gfiltro:{anio:String(new Date().getFullYear()),cat:"",q:""},mat:null,res:{anio:String(new Date().getFullYear())}};

/* ---------- NIF / NIE / CIF ---------- */
function validarNIF(v,pais){
  const s=String(v||"").toUpperCase().replace(/[\s.-]/g,"");if(!s)return false;
  if(pais&&!/^espa/i.test(pais))return s.length>=4; // extranjero: documento libre
  const L="TRWAGMYFPDXBNJZSQVHLCKE";
  if(/^\d{8}[A-Z]$/.test(s))return L[+s.slice(0,8)%23]===s[8];
  if(/^[XYZ]\d{7}[A-Z]$/.test(s))return L[+("XYZ".indexOf(s[0])+s.slice(1,8))%23]===s[8];
  if(/^[KLM]\d{7}[A-Z]$/.test(s))return L[+s.slice(1,8)%23]===s[8];
  if(/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)){
    let a=0,b=0;const d=s.slice(1,8);
    for(let i=0;i<7;i++){const n=+d[i];if(i%2===0){const x=n*2;b+=Math.floor(x/10)+x%10}else a+=n}
    const c=(10-(a+b)%10)%10,ctl=s[8],letra="JABCDEFGHI"[c];
    if("PQRSNW".includes(s[0]))return ctl===letra;
    if("ABEH".includes(s[0]))return ctl===String(c);
    return ctl===String(c)||ctl===letra;
  }
  return false;
}
const nifLimpio=v=>String(v||"").toUpperCase().replace(/[\s.-]/g,"");

/* ---------- cálculo de importes ---------- */
// Cada línea: cantidad × precio − descuento. En REBU el precio es el final (el IVA va incluido y no se desglosa).
function importeLinea(l){return r2((+l.cantidad||0)*(+l.precio||0)*(1-(+l.dto||0)/100))}
function calcular(lineas){
  const g={};let rebu=0;
  for(const l of lineas||[]){const imp=importeLinea(l);const t=String(l.iva??"REBU");
    if(t==="REBU"){rebu+=imp;continue}
    (g[t]=g[t]||{tipo:+t,base:0,cuota:0}).base+=imp}
  const grupos=Object.values(g).map(x=>({tipo:x.tipo,base:r2(x.base),cuota:r2(x.base*x.tipo/100)})).sort((a,b)=>b.tipo-a.tipo);
  const base=r2(grupos.reduce((s,x)=>s+x.base,0)),cuota=r2(grupos.reduce((s,x)=>s+x.cuota,0));rebu=r2(rebu);
  return{grupos,base,cuota,rebu,total:r2(base+cuota+rebu)};
}
// Efecto contable: una rectificativa por sustitución sustituye a la original (cuenta la diferencia)
function efecto(f){
  const t=f.totales||calcular(f.lineas);
  if(f.tipo==="rectificativa"&&f.rectifica&&f.rectifica.tipo==="sustitucion"){
    const o=S.facturas.get(f.rectifica.id);if(o&&o.totales){const ot=o.totales;
      const mapa={};for(const x of t.grupos)mapa[x.tipo]={tipo:x.tipo,base:x.base,cuota:x.cuota};
      for(const x of ot.grupos){const m=mapa[x.tipo]=mapa[x.tipo]||{tipo:x.tipo,base:0,cuota:0};m.base=r2(m.base-x.base);m.cuota=r2(m.cuota-x.cuota)}
      const grupos=Object.values(mapa);return{grupos,base:r2(t.base-ot.base),cuota:r2(t.cuota-ot.cuota),rebu:r2(t.rebu-ot.rebu),total:r2(t.total-ot.total)}}}
  return t;
}
const emitidas=()=>[...S.facturas.values()].filter(f=>f.estado&&f.estado!=="borrador");
const cobrado=f=>r2((f.cobros||[]).reduce((s,c)=>s+(+c.importe||0),0));
function estadoCobro(f){if(f.estado==="borrador")return null;if(f.anulada)return null;const t=(f.totales||{}).total||0;if(t<=0)return null;const c=cobrado(f);
  return c>=t-0.005?["Cobrada","ok"]:c>0?["Cobro parcial","warn"]:["Pendiente de cobro","warn"]}
function etiquetaEstado(f){
  if(f.estado==="borrador")return`<span class="tag">Borrador</span>`;
  if(f.anulada)return`<span class="tag bad">Anulada</span>`;
  if(f.estado==="rectificada")return`<span class="tag warn">Rectificada</span>`;
  return`<span class="tag ok">Emitida</span>`}
const contador=(serie,anio)=>S.cont.get(`contador/${serie}${anio}`)||{};
const refrescarCont=(serie,anio)=>S.db.doc(`facturacion/contador/${serie}${anio}`).refrescar().catch(()=>{});
const esUltima=f=>{const c=contador(f.serie,f.anio);return c.ultimoId===f.id&&+c.ultimo===+f.numero};
const gastoCoste=g=>g.regimen==="General"?r2(g.base):r2(g.total);
const gastoCuota=g=>g.regimen==="General"?r2(g.cuota):0;

/* ---------- carga ---------- */
(async()=>{
  try{
    S.db=await window.claude.use("db");
    const vigilar=(col,mapa,cb)=>S.db.collection(col).onSnapshot(sn=>{mapa.clear();sn.docs.forEach(d=>mapa.set(d.id,{...d.data(),id:d.id}));cb&&cb();pintarSiProcede(col)},e=>console.error(e));
    vigilar("facturas",S.facturas);vigilar("clientes",S.clientes);vigilar("gastos",S.gastos);
    S.db.collection("facturacion").onSnapshot(sn=>{S.cont.clear();let em=null;sn.docs.forEach(d=>{if(d.id==="emisor")em=d.data();else S.cont.set(d.id,d.data())});
      if(em)S.emisor=em;else if(!S.emisorCargado)prellenarEmisor();S.emisorCargado=true;pintarSiProcede("facturacion")});
    await cargarLotes();
    $("#estado-con").textContent="Sincronizado";
    const qs=new URLSearchParams(location.search);
    if(qs.get("lote")){S.tab="facturas";nuevaFactura({loteId:qs.get("lote")})}
    else if(qs.get("factura")){S.tab="facturas";abrirFactura(qs.get("factura"))}
    else if(qs.get("tab"))S.tab=qs.get("tab");
    pintarTabs();pintar();
  }catch(e){$("#vista").innerHTML=`<div class="aviso bad">No se ha podido cargar la facturación: ${esc(e.message)}</div>`}
})();
async function cargarLotes(){
  try{const f=await HUELSAN.rest("/rest/v1/lotes?select=id,data&or=(estado.in.(comprado,stock,vendido,pujar,interesante),publico.is.true)&order=actualizado.desc&limit=1000");
    S.lotes=(f||[]).map(x=>({...x.data,id:x.id}))}catch(e){S.lotes=[]}
}
async function prellenarEmisor(){
  try{const e=await HUELSAN.rest("/rest/v1/ajustes?select=data&id=eq.web%2Fempresa");const d=(e&&e[0]&&e[0].data)||{};
    S.emisor={razonSocial:d.razonSocial||"",nombreComercial:d.nombre||"Huelsan Automoción",nif:d.nif||"",domicilio:d.domicilio||"",email:d.email||"",
      telefono:(Array.isArray(d.contactos)&&d.contactos[0]&&d.contactos[0].telefono)||d.telefono||"",web:"huelsanautomocion.com",registro:d.registro||"",
      textoGarantia:TXT_GARANTIA,textoPie:TXT_RGPD,pais:"España",_nuevo:true};
    if(S.tab==="emisor")pintar()}catch(e){}
}
let pintarT;function pintarSiProcede(col){clearTimeout(pintarT);pintarT=setTimeout(()=>{if(S.tab==="facturas"&&S.ed){if(!S.edSucio&&col==="facturas"&&S.ed.id&&S.facturas.has(S.ed.id)){S.ed=JSON.parse(JSON.stringify(S.facturas.get(S.ed.id)));pintar()}return}pintar()},120)}

/* ---------- pestañas ---------- */
function pintarTabs(){$$("nav.tabs [data-tab]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===S.tab)))}
$("nav.tabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b)return;
  if(S.ed&&S.edSucio&&!confirm("Hay cambios sin guardar en la factura. ¿Salir sin guardarlos?"))return;
  S.tab=b.dataset.tab;S.ed=null;S.edSucio=false;S.mat=null;history.replaceState(null,"","?tab="+S.tab);pintarTabs();pintar()});
addEventListener("beforeunload",e=>{if(S.ed&&S.edSucio){e.preventDefault();e.returnValue=""}});
function pintar(){
  const v=$("#vista");
  if(S.tab==="facturas")v.innerHTML=S.ed?vistaEditor():vistaFacturas();
  else if(S.tab==="clientes")v.innerHTML=vistaClientes();
  else if(S.tab==="gastos")v.innerHTML=vistaGastos();
  else if(S.tab==="matriculas")v.innerHTML=vistaMatriculas();
  else if(S.tab==="resumen")v.innerHTML=vistaResumen();
  else if(S.tab==="emisor")v.innerHTML=vistaEmisor();
  if(S.tab==="facturas"&&S.ed)despuesEditor();
}

/* ======================================================================
   FACTURAS: listado
   ====================================================================== */
function aniosDe(fechas){const a=new Set([String(new Date().getFullYear())]);fechas.forEach(f=>{if(f)a.add(String(f).slice(0,4))});return[...a].sort().reverse()}
function vistaFacturas(){
  const F=S.filtro,todas=[...S.facturas.values()];
  const anios=aniosDe(todas.map(f=>f.fechaExpedicion));
  const q=F.q.trim().toLowerCase(),qm=normMat(F.q);
  const lista=todas.filter(f=>(!F.anio||String(f.fechaExpedicion||"").startsWith(F.anio)||f.estado==="borrador")
    &&(!F.estado||(F.estado==="borrador"?f.estado==="borrador":F.estado==="pendiente"?(estadoCobro(f)||[])[0]&&estadoCobro(f)[0]!=="Cobrada":F.estado==="noentregada"?f.estado!=="borrador"&&!f.entregada&&!f.anulada:F.estado==="rectificativa"?f.tipo==="rectificativa":f.estado!=="borrador"))
    &&(!q||[f.codigo,f.cliente&&f.cliente.nombre,f.cliente&&f.cliente.nif,f.vehiculo&&f.vehiculo.marca,f.vehiculo&&f.vehiculo.modelo].join(" ").toLowerCase().includes(q)||(qm.length>=3&&normMat(f.vehiculo&&f.vehiculo.matricula).includes(qm))))
    .sort((a,b)=>(a.estado==="borrador"?0:1)-(b.estado==="borrador"?0:1)||String(b.fechaExpedicion||"").localeCompare(String(a.fechaExpedicion||""))||String(b.serie||"").localeCompare(String(a.serie||""))||(+b.numero||0)-(+a.numero||0));
  const anio=F.anio||String(new Date().getFullYear());
  const em=emitidas().filter(f=>String(f.fechaExpedicion||"").startsWith(anio));
  const fact=r2(em.reduce((s,f)=>s+efecto(f).total,0));
  const pend=r2(em.filter(f=>!f.anulada&&f.estado==="emitida").reduce((s,f)=>s+Math.max(0,(f.totales||{}).total-cobrado(f)),0));
  const cF=contador("F",anio),cR=contador("R",anio);
  return`<div class="row sp"><div><h1>Facturas de venta</h1><p class="muted" style="margin:4px 0 0">Los borradores se pueden cambiar o borrar. Al pulsar «Emitir» la base de datos les da el número siguiente de su serie (sin saltos) y ya no se pueden modificar: se corrigen con una rectificativa o se anulan.</p></div>
    <button class="btn primary" data-acc="nueva">+ Nueva factura</button></div>
  ${!S.emisor.nif||!S.emisor.razonSocial||S.emisor._nuevo?`<div class="aviso">Antes de emitir, revisa y guarda nuestros datos fiscales en la pestaña «Datos fiscales».</div>`:""}
  <div class="kpis"><div class="kpi"><b>${em.filter(f=>f.tipo!=="rectificativa").length}</b><span>facturas emitidas en ${anio}${cF.ultimo?` (última ${esc(fCodigo("F",anio,cF.ultimo))})`:""}</span></div>
    <div class="kpi"><b>${em.filter(f=>f.tipo==="rectificativa").length}</b><span>rectificativas en ${anio}${cR.ultimo?` (última ${esc(fCodigo("R",anio,cR.ultimo))})`:""}</span></div>
    <div class="kpi"><b>${eur(fact)}</b><span>facturado en ${anio} (IVA incl.)</span></div>
    <div class="kpi"><b>${eur(pend)}</b><span>pendiente de cobro</span></div></div>
  <div class="row"><label style="max-width:120px">Año<select data-f="anio">${anios.map(a=>`<option ${a===F.anio?"selected":""}>${a}</option>`).join("")}<option value="" ${!F.anio?"selected":""}>Todos</option></select></label>
    <label style="max-width:220px">Mostrar<select data-f="estado">${[["","Todas"],["emitidas","Emitidas"],["borrador","Borradores"],["rectificativa","Rectificativas"],["pendiente","Pendientes de cobro"],["noentregada","Sin entregar al cliente"]].map(([k,t])=>`<option value="${k}" ${k===F.estado?"selected":""}>${t}</option>`).join("")}</select></label>
    <label style="flex:1 1 240px">Buscar<input type="search" data-f="q" value="${esc(F.q)}" placeholder="Número, cliente, NIF, matrícula, marca…"></label></div>
  ${lista.length?`<div class="tw"><table><thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Vehículo</th><th class="num">Total</th><th>Estado</th></tr></thead><tbody>
    ${lista.map(f=>{const ec=estadoCobro(f);return`<tr data-abrir="${esc(f.id)}"><td><b>${f.codigo?esc(f.codigo):"—"}</b>${f.tipo==="rectificativa"?`<div class="muted">Rect. de ${esc(f.rectifica&&f.rectifica.codigo||"")}</div>`:""}</td>
      <td>${fecha(f.fechaExpedicion)}</td><td>${esc(f.cliente&&f.cliente.nombre||"—")}<div class="muted">${esc(f.cliente&&f.cliente.nif||"")}</div></td>
      <td>${f.vehiculo&&f.vehiculo.matricula?`<span class="mat">${esc(f.vehiculo.matricula)}</span> `:""}${esc([f.vehiculo&&f.vehiculo.marca,f.vehiculo&&f.vehiculo.modelo].filter(Boolean).join(" "))}</td>
      <td class="num">${eur((f.totales||calcular(f.lineas)).total)}</td>
      <td>${etiquetaEstado(f)} ${f.estado!=="borrador"&&!f.anulada?(f.entregada?`<span class="tag acc">Entregada</span>`:`<span class="tag">Sin entregar</span>`):""} ${ec?`<span class="tag ${ec[1]}">${ec[0]}</span>`:""}</td></tr>`}).join("")}
  </tbody></table></div>`:`<div class="vacio">${S.facturas.size?"Ninguna factura con estos filtros.":"Aún no hay facturas. Pulsa «Nueva factura» o, desde la ficha de un coche de la app, «Crear factura de venta»."}</div>`}`;
}
const fCodigo=(serie,anio,n)=>(serie==="R"?"R":"")+anio+"-"+String(n).padStart(4,"0");

/* ======================================================================
   FACTURAS: editor
   ====================================================================== */
function facturaVacia(){
  const e=S.emisor||{};
  return{id:nid(),estado:"borrador",tipo:"ordinaria",fechaExpedicion:hoyISO(),fechaOperacion:"",clienteId:"",cliente:{tipo:"particular",pais:"España"},
    vehiculo:{},lineas:[],formaPago:"Transferencia bancaria",iban:e.iban||"",vencimiento:"",observaciones:"",garantia:e.textoGarantia||TXT_GARANTIA,
    marcarVendido:true,historial:[],creadaEn:new Date().toISOString()};
}
function lineaCoche(l,iva){
  const v=[l.marca,(l.modelo||"").replace(/\b(diesel|gasolina)\b/ig,"").trim(),versionDe(l)].filter(Boolean).join(" ");
  return{id:nid(),concepto:"Vehículo de ocasión "+v,detalle:[l.matricula?"Matrícula "+l.matricula:"",l.vin?"Bastidor "+l.vin:"",l.km?miles(String(Math.round(l.km)))+" km":""].filter(Boolean).join(" · "),cantidad:1,precio:+l.precioVenta||0,dto:0,iva:iva||"REBU",coche:true};
}
const versionDe=l=>{let v=(l.derivado||l.version||"").trim();for(const p of [l.marca,(l.modelo||"").split(" ")[0]])if(p)v=v.replace(new RegExp("^"+p.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\s+","i"),"");return v};
function vehiculoDe(l){return{loteId:l.id,marca:l.marca||"",modelo:(l.modelo||"").replace(/\b(diesel|gasolina)\b/ig,"").trim(),version:versionDe(l),matricula:normMat(l.matricula),bastidor:l.vin||"",km:l.km||"",fechaMatric:l.fechaMatric||"",color:l.color||"",combustible:l.combustible||""}}
// La venta va en el mismo régimen que la compra del coche: compra con IVA general → venta con IVA 21 %; REBU o particular → REBU
function regimenCompra(l){
  if(!l)return null;const mat=normMat(l.matricula);
  const g=[...S.gastos.values()].find(x=>x.categoria==="Compra del vehículo"&&(x.loteId===l.id||(mat&&normMat(x.matricula)===mat)));
  if(g)return{iva:g.regimen==="General"?"21":"REBU",fuente:"factura de compra de "+(g.proveedor||"proveedor")};
  if(l.iva)return{iva:l.iva==="General"?"21":"REBU",fuente:"ficha del coche (IVA "+l.iva+")"};
  return{iva:"REBU",fuente:"sin datos de la compra: se supone REBU"};
}
function nuevaFactura(op={}){
  const f=facturaVacia();
  if(op.loteId){const l=S.lotes.find(x=>x.id===op.loteId);if(l){f.vehiculo=vehiculoDe(l);f.lineas=[lineaCoche(l,regimenCompra(l).iva)]}}
  if(op.clienteId){const c=S.clientes.get(op.clienteId);if(c){f.clienteId=c.id;f.cliente=snapCliente(c)}}
  if(!f.lineas.length)f.lineas=[{id:nid(),concepto:"",detalle:"",cantidad:1,precio:0,dto:0,iva:"REBU"}];
  S.ed=f;S.edSucio=true;S.tab="facturas";pintarTabs();pintar();
}
function abrirFactura(id){const f=S.facturas.get(id);if(!f){toast("No encuentro esa factura");return}S.ed=JSON.parse(JSON.stringify(f));S.edSucio=false;history.replaceState(null,"","?factura="+encodeURIComponent(id));pintar()}
const snapCliente=c=>({id:c.id,tipo:c.tipo,nombre:nombreCliente(c),nif:nifLimpio(c.nif),direccion:c.direccion||"",cp:c.cp||"",municipio:c.municipio||"",provincia:c.provincia||"",pais:c.pais||"España",email:c.email||"",telefono:c.telefono||""});
const nombreCliente=c=>c.tipo==="empresa"?(c.razonSocial||""):[c.nombre,c.apellidos].filter(Boolean).join(" ");

function vistaEditor(){
  const f=S.ed,bor=f.estado==="borrador",ro=bor?"":"readonly",dis=bor?"":"disabled";
  const t=calcular(f.lineas);
  const rect=f.tipo==="rectificativa";
  const lotesOpc=S.lotes.filter(l=>l.matricula||l.marca).sort((a,b)=>(["stock","comprado"].includes(b.estado)?1:0)-(["stock","comprado"].includes(a.estado)?1:0));
  const c=f.cliente||{};const nifOk=!c.nif||validarNIF(c.nif,c.pais);
  const efectivoAlto=f.formaPago==="Efectivo"&&t.total>=LIM_EFECTIVO;
  const ultima=!bor&&esUltima(f);
  return`<div class="row sp"><div class="row"><button class="btn sm" data-acc="volver">← Facturas</button>
      <h1>${rect?"Factura rectificativa":"Factura"} ${f.codigo?esc(f.codigo):"(borrador)"}</h1> ${etiquetaEstado(f)}
      ${!bor&&!f.anulada?(f.entregada?`<span class="tag acc">Entregada al cliente</span>`:`<span class="tag">Sin entregar</span>`):""}</div>
    ${!bor?`<span class="muted">Emitida el ${fecha(f.fechaExpedicion)}${f.huella?` · huella ${esc(f.huella.slice(0,12))}…`:""}</span>`:""}</div>
  ${!bor?`<div class="aviso ok">Factura emitida: sus datos fiscales ya no se pueden cambiar. Puedes descargar el PDF, apuntar cobros y marcarla como entregada. Para corregirla usa «Rectificar» o «Anular»${ultima&&!f.entregada?"; como es la última de su serie y aún no se ha entregado, también puedes «Deshacer emisión»":""}.</div>`:""}
  ${rect?`<div class="card"><h3>Rectificación</h3><div class="g3">
      <label>Factura rectificada<input value="${esc((f.rectifica||{}).codigo||"")} · ${fecha((f.rectifica||{}).fecha)}" readonly></label>
      <label>Tipo<select data-e="rectifica.tipo" ${dis}>${[["sustitucion","Por sustitución (la nueva sustituye a la original)"],["diferencias","Por diferencias (solo lo que cambia)"],["anulacion","Anulación total"]].map(([k,v])=>`<option value="${k}" ${(f.rectifica||{}).tipo===k?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>Motivo (obligatorio)<input data-e="rectifica.motivo" value="${esc((f.rectifica||{}).motivo||"")}" ${ro} placeholder="Ej.: error en el NIF del cliente"></label></div></div>`:""}
  <div class="g2">
    <div class="card"><div class="row sp"><h3>Cliente</h3>${bor?`<span class="row"><button class="btn sm" data-acc="cliente-nuevo">+ Nuevo cliente</button></span>`:""}</div>
      ${bor?`<label>Elegir cliente guardado<select data-acc-change="elegir-cliente"><option value="">— Escribe o elige —</option>${[...S.clientes.values()].sort((a,b)=>nombreCliente(a).localeCompare(nombreCliente(b))).map(x=>`<option value="${esc(x.id)}" ${f.clienteId===x.id?"selected":""}>${esc(nombreCliente(x))} · ${esc(x.nif||"")}</option>`).join("")}</select></label>`:""}
      <div class="g2"><label>Nombre o razón social<input data-e="cliente.nombre" value="${esc(c.nombre||"")}" ${ro}></label>
        <label>NIF / NIE / CIF${nifOk?"":` <small style="color:var(--bad)">no parece válido</small>`}<input data-e="cliente.nif" value="${esc(c.nif||"")}" ${ro} class="${nifOk?"":"mal"}"></label></div>
      <label>Dirección<input data-e="cliente.direccion" value="${esc(c.direccion||"")}" ${ro}></label>
      <div class="g3"><label>C. P.<input data-e="cliente.cp" value="${esc(c.cp||"")}" ${ro}></label><label>Municipio<input data-e="cliente.municipio" value="${esc(c.municipio||"")}" ${ro}></label><label>Provincia<input data-e="cliente.provincia" value="${esc(c.provincia||"")}" ${ro}></label></div>
      <div class="g3"><label>País<input data-e="cliente.pais" value="${esc(c.pais||"España")}" ${ro}></label><label>Correo<input data-e="cliente.email" value="${esc(c.email||"")}" ${ro}></label><label>Teléfono<input data-e="cliente.telefono" value="${esc(c.telefono||"")}" ${ro}></label></div>
      ${bor&&c.nombre&&!f.clienteId?`<button class="btn sm" data-acc="guardar-cliente-desde">Guardar como cliente</button>`:""}
    </div>
    <div class="card"><h3>Factura</h3>
      <div class="g2"><label>Fecha de expedición<input type="date" data-e="fechaExpedicion" value="${esc(f.fechaExpedicion||"")}" ${ro}></label>
        <label>Fecha de la operación <small>si es distinta (entrega)</small><input type="date" data-e="fechaOperacion" value="${esc(f.fechaOperacion||"")}" ${ro}></label></div>
      <div class="g2"><label>Forma de pago<select data-e="formaPago" ${dis}>${FORMAS_PAGO.map(x=>`<option ${x===f.formaPago?"selected":""}>${x}</option>`).join("")}</select></label>
        <label>Vencimiento<input type="date" data-e="vencimiento" value="${esc(f.vencimiento||"")}" ${ro}></label></div>
      <label>IBAN para el pago<input data-e="iban" value="${esc(f.iban||"")}" ${ro} placeholder="ES00 0000 0000 0000 0000 0000"></label>
      ${efectivoAlto?`<div class="aviso bad">Pago en efectivo de ${eur(t.total)}: la ley limita los pagos en efectivo con empresarios a menos de 1.000 € (Ley 7/2012). Cobra el resto por banco.</div>`:""}
    </div></div>
  <div class="card"><div class="row sp"><h3>Vehículo</h3>${bor?`<label style="flex:1 1 320px;max-width:520px">Coger datos de un coche de la app<select data-acc-change="elegir-lote"><option value="">— Elige un coche —</option>${lotesOpc.map(l=>`<option value="${esc(l.id)}" ${(f.vehiculo||{}).loteId===l.id?"selected":""}>${esc([l.marca,l.modelo].filter(Boolean).join(" "))} · ${esc(l.matricula||"sin matrícula")} · ${esc(({stock:"Stock",comprado:"Comprado",vendido:"Vendido",pujar:"Pujar",interesante:"Interesante"})[l.estado]||"Web")}</option>`).join("")}</select></label>`:""}</div>
    <div class="g4"><label>Marca<input data-e="vehiculo.marca" value="${esc((f.vehiculo||{}).marca||"")}" ${ro}></label><label>Modelo<input data-e="vehiculo.modelo" value="${esc((f.vehiculo||{}).modelo||"")}" ${ro}></label>
      <label>Versión<input data-e="vehiculo.version" value="${esc((f.vehiculo||{}).version||"")}" ${ro}></label><label>Color<input data-e="vehiculo.color" value="${esc((f.vehiculo||{}).color||"")}" ${ro}></label></div>
    <div class="g4"><label>Matrícula<input data-e="vehiculo.matricula" value="${esc((f.vehiculo||{}).matricula||"")}" ${ro} style="text-transform:uppercase"></label><label>Nº de bastidor (VIN)<input data-e="vehiculo.bastidor" value="${esc((f.vehiculo||{}).bastidor||"")}" ${ro} style="text-transform:uppercase" maxlength="17"></label>
      <label>Kilómetros<input data-e="vehiculo.km" inputmode="numeric" value="${esc((f.vehiculo||{}).km||"")}" ${ro}></label><label>1ª matriculación<input type="date" data-e="vehiculo.fechaMatric" value="${esc(String((f.vehiculo||{}).fechaMatric||"").slice(0,10))}" ${ro}></label></div>
    ${(f.vehiculo||{}).bastidor&&String(f.vehiculo.bastidor).length!==17?`<p class="muted" style="margin:0;color:var(--bad)">El número de bastidor suele tener 17 caracteres (tiene ${String(f.vehiculo.bastidor).length}).</p>`:""}
  </div>
  <div class="card"><div class="row sp"><h3>Conceptos</h3>${bor?`<span class="row"><button class="btn sm" data-acc="linea">+ Línea</button><button class="btn sm" data-acc="linea-coche" ${(f.vehiculo||{}).marca?"":"disabled"}>+ Línea del coche</button><button class="btn sm" data-acc="linea-transf">+ Gestión de transferencia</button><button class="btn sm" data-acc="linea-garantia">+ Garantía ampliada</button></span>`:""}</div>
    <div class="tw"><table class="lineas"><thead><tr><th style="min-width:240px">Concepto</th><th style="width:70px" class="num">Cant.</th><th style="width:120px" class="num">Precio (€)</th><th style="width:70px" class="num">Dto. %</th><th style="width:150px">IVA</th><th style="width:110px" class="num">Importe</th>${bor?"<th></th>":""}</tr></thead><tbody>
    ${f.lineas.map((l,i)=>`<tr><td><input data-l="${i}" data-k="concepto" value="${esc(l.concepto)}" ${ro} placeholder="Concepto"><textarea data-l="${i}" data-k="detalle" ${ro} rows="1" placeholder="Detalle (opcional)">${esc(l.detalle||"")}</textarea></td>
      <td><input data-l="${i}" data-k="cantidad" inputmode="decimal" value="${esc(l.cantidad)}" ${ro} class="num"></td>
      <td><input data-l="${i}" data-k="precio" inputmode="decimal" value="${esc(l.precio)}" ${ro} class="num"></td>
      <td><input data-l="${i}" data-k="dto" inputmode="decimal" value="${esc(l.dto||0)}" ${ro} class="num"></td>
      <td><select data-l="${i}" data-k="iva" ${dis}>${TIPOS_IVA.map(([k,v])=>`<option value="${k}" ${String(l.iva)===k?"selected":""}>${v}</option>`).join("")}</select></td>
      <td class="num" style="padding-top:12px">${eur(importeLinea(l))}</td>${bor?`<td><button class="btn sm" data-quitar-linea="${i}" title="Quitar línea" aria-label="Quitar línea">✕</button></td>`:""}</tr>`).join("")}
    </tbody></table></div>
    ${(()=>{const lc=S.lotes.find(x=>x.id===(f.vehiculo||{}).loteId);const rc=lc&&regimenCompra(lc);if(!rc)return"";const mal=f.lineas.filter(l=>l.coche&&String(l.iva)!==rc.iva&&!(rc.iva==="21"&&String(l.iva)!=="REBU"));
      return mal.length?`<div class="aviso bad">La compra de este coche fue ${rc.iva==="REBU"?"en REBU":"con IVA general"} (${esc(rc.fuente)}): la venta del coche debe ir ${rc.iva==="REBU"?"en REBU":"con IVA 21 %"}.</div>`:`<p class="muted" style="margin:0">Régimen del coche: ${rc.iva==="REBU"?"REBU":"IVA general 21 %"}, igual que su compra (${esc(rc.fuente)}).</p>`})()}
    ${t.rebu?`<p class="muted" style="margin:0">En REBU el precio es el final: el IVA va incluido y no se desglosa en la factura (art. 138 Ley del IVA); en la factura constará «${TXT_REBU}».</p>`:""}
    <div class="totales">${t.grupos.map(g=>`<div><span>Base imponible ${g.tipo} %</span><span>${eur(g.base)}</span></div><div><span>IVA ${g.tipo} %</span><span>${eur(g.cuota)}</span></div>`).join("")}
      ${t.rebu?`<div><span>Importe en REBU</span><span>${eur(t.rebu)}</span></div>`:""}<div class="t"><span>TOTAL</span><span>${eur(t.total)}</span></div>
      ${!bor&&!f.anulada&&t.total>0?`<div class="muted"><span>Cobrado</span><span>${eur(cobrado(f))}</span></div>`:""}</div>
  </div>
  <div class="g2"><div class="card"><h3>Observaciones y garantía</h3>
      <label>Observaciones (salen en la factura)<textarea data-e="observaciones" ${ro} rows="3">${esc(f.observaciones||"")}</textarea></label>
      <label>Texto de garantía y condiciones<textarea data-e="garantia" ${ro} rows="4">${esc(f.garantia||"")}</textarea></label>
      <label>Notas internas (no salen en la factura)<textarea data-e="notasInternas" rows="2">${esc(f.notasInternas||"")}</textarea></label></div>
    <div class="card"><h3>${bor?"Al emitir":"Cobros"}</h3>
      ${bor?`${(f.vehiculo||{}).loteId&&f.tipo!=="rectificativa"?`<label class="row" style="flex-direction:row;color:var(--ink);font-weight:500"><input type="checkbox" data-e="marcarVendido" ${f.marcarVendido!==false?"checked":""} style="width:auto"> Marcar el coche como «Vendido» en la app</label>`:""}
        <p class="muted" style="margin:0">Se le asignará el número ${esc(fCodigo(rect?"R":"F",String(f.fechaExpedicion||hoyISO()).slice(0,4),(+contador(rect?"R":"F",String(f.fechaExpedicion||hoyISO()).slice(0,4)).ultimo||0)+1))} (si nadie emite otra antes). Revisa la vista previa: después no se puede cambiar.</p>`
      :`${(f.cobros||[]).length?`<div class="tw"><table><tbody>${f.cobros.map((x,i)=>`<tr><td>${fecha(x.fecha)}</td><td>${esc(x.medio||"")}</td><td class="num">${eur(x.importe)}</td><td><button class="btn sm" data-quitar-cobro="${i}" aria-label="Quitar cobro">✕</button></td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Sin cobros apuntados.</p>`}
        ${!f.anulada?`<button class="btn sm" data-acc="cobro">+ Apuntar cobro</button>`:""}`}
      ${(f.historial||[]).length?`<div class="hist"><b>Historial</b>${f.historial.map(h=>`<span>${new Date(h.fecha).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"})} · ${esc(h.accion)}</span>`).join("")}</div>`:""}
      ${(f.rectificadaPor||[]).length?`<div class="hist"><b>Rectificaciones</b>${f.rectificadaPor.map(r=>`<a href="#" data-ir-factura="${esc(r.id)}">${esc(r.codigo)} (${esc(r.tipo)})</a>`).join("")}</div>`:""}
      ${rect&&f.rectifica?`<div class="hist"><b>Rectifica a</b><a href="#" data-ir-factura="${esc(f.rectifica.id)}">${esc(f.rectifica.codigo)}</a></div>`:""}
    </div></div>
  <div class="bar">
    ${bor?`<button class="btn" data-acc="guardar">Guardar borrador</button><button class="btn" data-acc="pdf">Vista previa PDF</button><button class="btn primary" data-acc="emitir">Emitir factura…</button>
      <span style="flex:1"></span>${S.facturas.has(f.id)?`<button class="btn peligro" data-acc="borrar">Borrar borrador</button>`:""}`
    :`<button class="btn primary" data-acc="pdf">Descargar PDF</button>
      ${!f.anulada?`<button class="btn" data-acc="entregada">${f.entregada?"Marcar como no entregada":"Marcar como entregada"}</button>`:""}
      ${!f.anulada&&f.estado==="emitida"?`<button class="btn" data-acc="rectificar">Rectificar…</button><button class="btn peligro" data-acc="anular">Anular…</button>`:""}
      <button class="btn" data-acc="duplicar">Duplicar como borrador</button>
      <span style="flex:1"></span>${ultima&&!f.entregada&&!(f.rectificadaPor||[]).length?`<button class="btn peligro" data-acc="deshacer">Deshacer emisión</button>`:""}
      ${S.edSucio?`<button class="btn" data-acc="guardar-notas">Guardar notas</button>`:""}`}
  </div>`;
}
function despuesEditor(){$$("#vista textarea[data-k=detalle]").forEach(t=>{t.style.height="auto";t.style.height=Math.max(34,t.scrollHeight)+"px"})}

/* edición en vivo */
function setRuta(o,ruta,v){const p=ruta.split(".");let x=o;for(let i=0;i<p.length-1;i++){x[p[i]]=x[p[i]]||{};x=x[p[i]]}x[p[p.length-1]]=v}
$("#vista").addEventListener("input",e=>{
  const t=e.target;
  if(t.dataset.f!=null&&S.tab==="facturas"&&!S.ed){S.filtro[t.dataset.f]=t.value;if(t.dataset.f==="q"){const pos=t.selectionStart;pintar();const n=$("[data-f=q]");if(n){n.focus();n.setSelectionRange(pos,pos)}}else pintar();return}
  if(t.dataset.gf!=null){S.gfiltro[t.dataset.gf]=t.value;const pos=t.selectionStart;pintar();const n=$(`[data-gf=${t.dataset.gf}]`);if(n&&n.setSelectionRange&&t.type==="search"){n.focus();n.setSelectionRange(pos,pos)}return}
  if(t.dataset.cq!=null){S.cq=t.value;const pos=t.selectionStart;pintar();const n=$("[data-cq]");if(n){n.focus();n.setSelectionRange(pos,pos)}return}
  if(t.dataset.mq!=null){S.mq=t.value;const pos=t.selectionStart;pintar();const n=$("[data-mq]");if(n){n.focus();n.setSelectionRange(pos,pos)}return}
  if(!S.ed)return;
  if(t.dataset.e){const k=t.dataset.e;let v=t.type==="checkbox"?t.checked:t.value;
    if(k==="vehiculo.matricula")v=normMat(v);if(k==="vehiculo.bastidor")v=String(v).toUpperCase().replace(/\s/g,"");if(k==="cliente.nif")v=nifLimpio(v);
    setRuta(S.ed,k,v);S.edSucio=true;
    if(["formaPago","rectifica.tipo","fechaExpedicion","cliente.nif","cliente.pais","vehiculo.bastidor"].includes(k)||t.type==="checkbox")repintarEditor(t);
    else if(t.dataset.e==="notasInternas"&&S.ed.estado!=="borrador")repintarEditor(t);
    return}
  if(t.dataset.l!=null){const l=S.ed.lineas[+t.dataset.l];let v=t.value;if(["cantidad","precio","dto"].includes(t.dataset.k))v=String(v).replace(",",".");
    l[t.dataset.k]=["cantidad","precio","dto"].includes(t.dataset.k)?(v===""||v==="-"?v:(isNaN(+v)?l[t.dataset.k]:v)):v;S.edSucio=true;
    if(t.dataset.k==="detalle"){t.style.height="auto";t.style.height=t.scrollHeight+"px";return}
    if(t.dataset.k!=="concepto")repintarEditor(t)}
});
$("#vista").addEventListener("change",e=>{
  const t=e.target;
  if(t.dataset.f!=null&&!S.ed&&t.tagName==="SELECT"){S.filtro[t.dataset.f]=t.value;pintar();return}
  if(t.dataset.gf!=null&&t.tagName==="SELECT"){S.gfiltro[t.dataset.gf]=t.value;pintar();return}
  if(t.dataset.ra!=null){S.res.anio=t.value;pintar();return}
  const a=t.dataset.accChange;
  if(a==="elegir-cliente"&&S.ed){const c=S.clientes.get(t.value);if(c){S.ed.clienteId=c.id;S.ed.cliente=snapCliente(c)}else S.ed.clienteId="";S.edSucio=true;pintar()}
  if(a==="elegir-lote"&&S.ed){const l=S.lotes.find(x=>x.id===t.value);if(!l)return;S.ed.vehiculo=vehiculoDe(l);
    if(!S.ed.lineas.some(x=>x.coche)){const vacia=S.ed.lineas.findIndex(x=>!x.concepto&&!+x.precio);const ln=lineaCoche(l,regimenCompra(l).iva);if(vacia>=0)S.ed.lineas[vacia]=ln;else S.ed.lineas.unshift(ln)}
    S.edSucio=true;pintar()}
  if(t.dataset.l!=null&&t.tagName==="SELECT"){S.ed.lineas[+t.dataset.l][t.dataset.k]=t.value;S.edSucio=true;repintarEditor(t)}
  if(t.dataset.e&&t.tagName==="SELECT"){setRuta(S.ed,t.dataset.e,t.value);S.edSucio=true;repintarEditor(t)}
});
function repintarEditor(foco){
  const sel=foco&&(foco.dataset.e?`[data-e="${foco.dataset.e}"]`:foco.dataset.l!=null?`[data-l="${foco.dataset.l}"][data-k="${foco.dataset.k}"]`:null);
  const pos=foco&&foco.selectionStart,y=scrollY;pintar();scrollTo(0,y);
  if(sel){const n=$(sel);if(n){n.focus({preventScroll:true});try{if(pos!=null&&n.setSelectionRange)n.setSelectionRange(pos,pos)}catch(e){}}}
}

/* acciones */
document.addEventListener("click",async e=>{
  const t=e.target;
  const ab=t.closest("[data-abrir]");if(ab&&S.tab==="facturas"&&!S.ed){abrirFactura(ab.dataset.abrir);return}
  const irf=t.closest("[data-ir-factura]");if(irf){e.preventDefault();if(S.edSucio&&!confirm("Hay cambios sin guardar. ¿Salir sin guardarlos?"))return;S.tab="facturas";pintarTabs();abrirFactura(irf.dataset.irFactura);return}
  const ql=t.closest("[data-quitar-linea]");if(ql&&S.ed){S.ed.lineas.splice(+ql.dataset.quitarLinea,1);S.edSucio=true;pintar();return}
  const qc=t.closest("[data-quitar-cobro]");if(qc&&S.ed){if(!confirm("¿Quitar este cobro?"))return;const cobros=[...(S.ed.cobros||[])];cobros.splice(+qc.dataset.quitarCobro,1);await guardarCampos({cobros},"Cobro quitado");return}
  const b=t.closest("[data-acc]");if(!b)return;
  const a=b.dataset.acc;
  try{
    if(a==="nueva")nuevaFactura();
    else if(a==="volver"){if(S.edSucio&&!confirm("Hay cambios sin guardar. ¿Salir sin guardarlos?"))return;S.ed=null;S.edSucio=false;history.replaceState(null,"","?tab=facturas");pintar()}
    else if(a==="linea"){S.ed.lineas.push({id:nid(),concepto:"",detalle:"",cantidad:1,precio:0,dto:0,iva:"21"});S.edSucio=true;pintar()}
    else if(a==="linea-coche"){const l=S.lotes.find(x=>x.id===(S.ed.vehiculo||{}).loteId)||S.ed.vehiculo;S.ed.lineas.push(lineaCoche({...l,derivado:l.derivado||l.version,vin:l.vin||l.bastidor},(regimenCompra(S.lotes.find(x=>x.id===(S.ed.vehiculo||{}).loteId))||{iva:"REBU"}).iva));S.edSucio=true;pintar()}
    else if(a==="linea-transf"){S.ed.lineas.push({id:nid(),concepto:"Gestión de transferencia",detalle:"Tramitación del cambio de titularidad ante la DGT",cantidad:1,precio:0,dto:0,iva:"21"});S.edSucio=true;pintar()}
    else if(a==="linea-garantia"){S.ed.lineas.push({id:nid(),concepto:"Garantía ampliada",detalle:"Ampliación de garantía (12 meses adicionales)",cantidad:1,precio:0,dto:0,iva:"21"});S.edSucio=true;pintar()}
    else if(a==="guardar"){await guardarBorrador();toast("Borrador guardado")}
    else if(a==="guardar-notas"){await guardarCampos({notasInternas:S.ed.notasInternas||""},"Notas guardadas")}
    else if(a==="borrar"){if(await confirmar("¿Borrar este borrador?","El borrador no tiene número, así que no afecta a la numeración.","Borrar")){await S.db.doc("facturas/"+S.ed.id).delete();S.ed=null;S.edSucio=false;toast("Borrador borrado");pintar()}}
    else if(a==="pdf"){await descargarPDF(S.ed)}
    else if(a==="emitir")await emitir();
    else if(a==="entregada"){await guardarCampos({entregada:!S.ed.entregada,entregadaEn:!S.ed.entregada?new Date().toISOString():null},S.ed.entregada?"Marcada como no entregada":"Marcada como entregada")}
    else if(a==="cobro")abrirCobro();
    else if(a==="rectificar")await rectificar("sustitucion");
    else if(a==="anular")await rectificar("anulacion");
    else if(a==="deshacer")await deshacer();
    else if(a==="duplicar"){const o=S.ed,f=facturaVacia();Object.assign(f,{cliente:{...o.cliente},clienteId:o.clienteId,vehiculo:{...o.vehiculo},lineas:o.lineas.map(l=>({...l,id:nid()})),formaPago:o.formaPago,iban:o.iban,observaciones:o.observaciones,garantia:o.garantia});
      S.ed=f;S.edSucio=true;pintar();toast("Copia creada como borrador nuevo")}
    else if(a==="cliente-nuevo")abrirCliente(null,true);
    else if(a==="guardar-cliente-desde"){const c=S.ed.cliente;const id=nid();const esEmp=/^[ABCDEFGHJNPQRSUVW]/.test(nifLimpio(c.nif));
      const d={tipo:esEmp?"empresa":"particular",[esEmp?"razonSocial":"nombre"]:c.nombre,nif:nifLimpio(c.nif),direccion:c.direccion,cp:c.cp,municipio:c.municipio,provincia:c.provincia,pais:c.pais,email:c.email,telefono:c.telefono,creado:new Date().toISOString()};
      await S.db.doc("clientes/"+id).set(d);S.ed.clienteId=id;S.edSucio=true;pintar();toast("Cliente guardado")}
    else accionesOtras(a,b);
  }catch(err){toast(err.message||String(err),6000)}
});
function limpiaFactura(f){const d=JSON.parse(JSON.stringify(f));delete d.id;d.lineas=(d.lineas||[]).map(l=>({...l,cantidad:+l.cantidad||0,precio:+l.precio||0,dto:+l.dto||0}));d.totales=calcular(d.lineas);d.matricula=normMat(d.vehiculo&&d.vehiculo.matricula);return d}
async function guardarBorrador(){
  const f=S.ed;if(f.estado!=="borrador")throw new Error("Solo se guardan borradores");
  const d=limpiaFactura(f);d.actualizadoEn=new Date().toISOString();d.actualizadoPor=HUELSAN.email&&HUELSAN.email();
  await S.db.doc("facturas/"+f.id).set(d);S.edSucio=false;S.ed.totales=d.totales;
}
async function guardarCampos(campos,txt){
  await S.db.doc("facturas/"+S.ed.id).update({...campos,actualizadoPor:HUELSAN.email&&HUELSAN.email()});Object.assign(S.ed,campos);S.edSucio=false;pintar();if(txt)toast(txt)}
function problemas(f){
  const p=[],c=f.cliente||{},t=calcular(f.lineas);
  if(!c.nombre)p.push("Falta el nombre del cliente.");
  if(!c.nif)p.push("Falta el NIF/NIE/CIF del cliente (obligatorio para vender un vehículo y para la factura completa).");else if(!validarNIF(c.nif,c.pais))p.push("El NIF/NIE/CIF del cliente no parece válido.");
  if(!c.direccion||!c.municipio)p.push("Falta el domicilio del cliente.");
  if(!f.lineas.length||!f.lineas.some(l=>l.concepto&&importeLinea(l)!==0))p.push("Añade al menos un concepto con importe.");
  if(f.lineas.some(l=>!l.concepto&&importeLinea(l)!==0))p.push("Hay una línea con importe pero sin concepto.");
  if(f.tipo!=="rectificativa"&&t.total<=0)p.push("El total debe ser mayor que cero.");
  if(f.tipo==="rectificativa"&&!(f.rectifica||{}).motivo)p.push("Indica el motivo de la rectificación.");
  if(!f.fechaExpedicion)p.push("Falta la fecha de expedición.");
  if(!S.emisor.nif||!S.emisor.razonSocial||S.emisor._nuevo)p.push("Guarda primero nuestros datos fiscales (pestaña «Datos fiscales»).");
  {const lc=S.lotes.find(x=>x.id===(f.vehiculo||{}).loteId);const rc=lc&&regimenCompra(lc);if(rc&&f.lineas.some(l=>l.coche&&(rc.iva==="REBU"?String(l.iva)!=="REBU":String(l.iva)==="REBU")))p.push(`La venta del coche debe ir ${rc.iva==="REBU"?"en REBU":"con IVA general"}, como su compra (${rc.fuente}).`)}
  const v=f.vehiculo||{};if(f.lineas.some(l=>l.coche)&&!v.matricula&&!v.bastidor)p.push("Falta la matrícula o el bastidor del vehículo.");
  return p;
}
async function emitir(){
  const f=S.ed,p=problemas(f);
  if(p.length){await confirmar("Antes de emitir hay que corregir esto",p.map(x=>"• "+x).join("\n"),null);return}
  const anio=String(f.fechaExpedicion).slice(0,4),serie=f.tipo==="rectificativa"?"R":"F",sig=fCodigo(serie,anio,(+contador(serie,anio).ultimo||0)+1);
  const t=calcular(f.lineas);
  if(!await confirmar(`¿Emitir la factura ${sig}?`,`Cliente: ${f.cliente.nombre} (${f.cliente.nif})\nTotal: ${eur(t.total)}\nFecha: ${fecha(f.fechaExpedicion)}\n\nDespués de emitirla ya no se podrá modificar (solo rectificar o anular). Si aún no se la has entregado al cliente y es la última, podrás deshacer la emisión.`,"Emitir"))return;
  await guardarBorrador();
  const r=await HUELSAN.rpc("emitir_factura",{fid:f.id});
  await refrescarCont(r.serie,r.anio);
  if(f.rectifica&&f.rectifica.id)await S.db.doc("facturas/"+f.rectifica.id).refrescar().catch(()=>{});
  toast(`Factura ${r.codigo} emitida`,4500);
  if(f.marcarVendido!==false&&f.vehiculo&&f.vehiculo.loteId&&f.tipo!=="rectificativa"){
    try{await S.db.doc("lotes/"+f.vehiculo.loteId).update({estado:"vendido",vendidoEn:f.fechaOperacion||f.fechaExpedicion,facturaVenta:{id:f.id,codigo:r.codigo,total:t.total}});const l=S.lotes.find(x=>x.id===f.vehiculo.loteId);if(l)l.estado="vendido"}catch(e){toast("Factura emitida, pero no se ha podido marcar el coche como vendido: "+e.message,6000)}}
  const sn=await S.db.doc("facturas/"+f.id).refrescar();S.ed={...sn.data(),id:f.id};S.edSucio=false;pintar();
  if(await confirmar("Factura emitida",`Número ${r.codigo}. ¿Descargar el PDF ahora?`,"Descargar PDF"))await descargarPDF(S.ed);
}
async function rectificar(tipo){
  const o=S.ed;
  const motivo=await pedirTexto(tipo==="anulacion"?`Anular la factura ${o.codigo}`:`Rectificar la factura ${o.codigo}`,
    tipo==="anulacion"?"Se emitirá una factura rectificativa por el importe total en negativo (serie R) y la original quedará anulada. Indica el motivo:":"Se creará un borrador de factura rectificativa (serie R) con los datos actuales para que los corrijas. Indica el motivo:",
    tipo==="anulacion"?"Ej.: operación cancelada, el cliente desiste de la compra":"Ej.: error en el domicilio del cliente");
  if(!motivo)return;
  const f=facturaVacia();
  Object.assign(f,{tipo:"rectificativa",rectifica:{id:o.id,codigo:o.codigo,fecha:o.fechaExpedicion,tipo,motivo},cliente:{...o.cliente},clienteId:o.clienteId,vehiculo:{...o.vehiculo},
    lineas:o.lineas.map(l=>({...l,id:nid(),cantidad:tipo==="anulacion"?-Math.abs(+l.cantidad||1):l.cantidad})),formaPago:o.formaPago,iban:o.iban,observaciones:"",garantia:"",marcarVendido:false});
  if(tipo==="anulacion"){
    S.ed=f;await guardarBorrador();
    if(!await confirmar(`¿Emitir la anulación de ${o.codigo}?`,`Se emitirá la rectificativa ${fCodigo("R",String(f.fechaExpedicion).slice(0,4),(+contador("R",String(f.fechaExpedicion).slice(0,4)).ultimo||0)+1)} por ${eur(calcular(f.lineas).total)}.\nMotivo: ${motivo}`,"Emitir anulación")){S.ed=f;S.edSucio=false;pintar();toast("Queda como borrador de rectificativa");return}
    const r=await HUELSAN.rpc("emitir_factura",{fid:f.id});await refrescarCont(r.serie,r.anio);await S.db.doc("facturas/"+o.id).refrescar().catch(()=>{});toast(`Anulada con la rectificativa ${r.codigo}`,4500);
    if(o.vehiculo&&o.vehiculo.loteId&&await confirmar("¿Volver a poner el coche en stock?","La venta se ha anulado. ¿Cambio el estado del coche de «Vendido» a «Stock» en la app?","Sí, a stock")){try{await S.db.doc("lotes/"+o.vehiculo.loteId).update({estado:"stock",facturaVenta:null})}catch(e){}}
    const sn=await S.db.doc("facturas/"+f.id).refrescar();S.ed={...sn.data(),id:f.id};S.edSucio=false;pintar();return}
  S.ed=f;S.edSucio=true;pintar();toast("Corrige los datos y emite la rectificativa");
}
async function deshacer(){
  const f=S.ed;
  if(!await confirmar(`¿Deshacer la emisión de ${f.codigo}?`,"Solo debe hacerse si la factura no ha llegado al cliente. Volverá a ser un borrador y su número quedará libre para la siguiente factura.","Deshacer emisión"))return;
  const r=await HUELSAN.rpc("deshacer_emision",{fid:f.id});
  await refrescarCont(f.serie,f.anio);
  if(f.rectifica&&f.rectifica.id)await S.db.doc("facturas/"+f.rectifica.id).refrescar().catch(()=>{});
  if(f.vehiculo&&f.vehiculo.loteId&&f.tipo!=="rectificativa"){try{const sn=await S.db.doc("lotes/"+f.vehiculo.loteId).get();const l=sn.data()||{};if(l.facturaVenta&&l.facturaVenta.id===f.id)await S.db.doc("lotes/"+f.vehiculo.loteId).update({estado:"stock",facturaVenta:null})}catch(e){}}
  const sn=await S.db.doc("facturas/"+f.id).refrescar();S.ed={...sn.data(),id:f.id};S.edSucio=false;pintar();toast(`Emisión deshecha: ${r.liberado} queda libre`,4500);
}

/* ---------- cobros ---------- */
function abrirCobro(){
  const f=S.ed,pend=r2((f.totales||{}).total-cobrado(f));
  $("#f-cobro").innerHTML=`<h2>Apuntar cobro · ${esc(f.codigo)}</h2><div class="g3"><label>Fecha<input type="date" name="fecha" value="${hoyISO()}" required></label>
    <label>Importe (€)<input name="importe" inputmode="decimal" value="${pend>0?pend:""}" required></label><label>Medio<select name="medio">${FORMAS_PAGO.map(x=>`<option ${x===f.formaPago?"selected":""}>${x}</option>`).join("")}</select></label></div>
    <label>Nota<input name="nota" placeholder="Ej.: señal, resto a la entrega, financiera…"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" value="cancelar">Cancelar</button><button class="btn primary" value="ok">Apuntar</button></div>`;
  const d=$("#dlg-cobro");d.returnValue="";d.showModal();
  d.onclose=async()=>{if(d.returnValue!=="ok")return;const fd=new FormData($("#f-cobro"));const imp=+String(fd.get("importe")).replace(",",".");if(!imp)return toast("Importe no válido");
    if(fd.get("medio")==="Efectivo"&&cobrado(f)+imp>=LIM_EFECTIVO)toast("Ojo: los pagos en efectivo con empresarios deben ser menores de 1.000 € (Ley 7/2012)",6000);
    await guardarCampos({cobros:[...(f.cobros||[]),{fecha:fd.get("fecha"),importe:r2(imp),medio:fd.get("medio"),nota:fd.get("nota")||""}]},"Cobro apuntado")};
}

/* ---------- diálogos ---------- */
function confirmar(titulo,texto,boton){return new Promise(res=>{
  $("#f-confirm").innerHTML=`<h2>${esc(titulo)}</h2><p style="white-space:pre-line;margin:0">${esc(texto)}</p><div class="row" style="justify-content:flex-end">${boton?`<button class="btn" value="no">Cancelar</button><button class="btn primary" value="si">${esc(boton)}</button>`:`<button class="btn primary" value="no">Entendido</button>`}</div>`;
  const d=$("#dlg-confirm");d.returnValue="";d.showModal();d.onclose=()=>res(d.returnValue==="si")})}
function pedirTexto(titulo,texto,ph){return new Promise(res=>{
  $("#f-confirm").innerHTML=`<h2>${esc(titulo)}</h2><p style="margin:0">${esc(texto)}</p><input name="txt" placeholder="${esc(ph||"")}" required><div class="row" style="justify-content:flex-end"><button class="btn" value="no" formnovalidate>Cancelar</button><button class="btn primary" value="si">Continuar</button></div>`;
  const d=$("#dlg-confirm");d.returnValue="";d.showModal();d.onclose=()=>res(d.returnValue==="si"?String(new FormData($("#f-confirm")).get("txt")||"").trim():"")})}

/* ======================================================================
   CLIENTES
   ====================================================================== */
function vistaClientes(){
  const q=String(S.cq||"").toLowerCase();
  const lista=[...S.clientes.values()].filter(c=>!q||[nombreCliente(c),c.nif,c.email,c.telefono,c.municipio,c.contacto].join(" ").toLowerCase().includes(q)).sort((a,b)=>nombreCliente(a).localeCompare(nombreCliente(b)));
  const nFact=id=>emitidas().filter(f=>f.clienteId===id).length;
  return`<div class="row sp"><div><h1>Clientes</h1><p class="muted" style="margin:4px 0 0">Datos fiscales y de contacto para facturar. Particulares (nombre, apellidos y DNI/NIE) o empresas (razón social y CIF).</p></div>
    <span class="row"><button class="btn" data-acc="importar-demandas">Importar desde «Clientes» de la app</button><button class="btn primary" data-acc="cliente-alta">+ Nuevo cliente</button></span></div>
  <label>Buscar<input type="search" data-cq value="${esc(S.cq||"")}" placeholder="Nombre, NIF, correo, teléfono, municipio…"></label>
  ${lista.length?`<div class="tw"><table><thead><tr><th>Cliente</th><th>NIF</th><th>Tipo</th><th>Contacto</th><th>Localidad</th><th class="num">Facturas</th><th></th></tr></thead><tbody>
    ${lista.map(c=>`<tr><td><b>${esc(nombreCliente(c))}</b>${c.tipo==="empresa"&&c.contacto?`<div class="muted">${esc(c.contacto)}</div>`:""}</td><td>${esc(c.nif||"")}${c.nif&&!validarNIF(c.nif,c.pais)?` <span class="tag bad">revisar</span>`:""}</td>
      <td>${c.tipo==="empresa"?"Empresa":"Particular"}</td><td>${esc(c.telefono||"")}<div class="muted">${esc(c.email||"")}</div></td><td>${esc([c.municipio,c.provincia].filter(Boolean).join(", "))}</td><td class="num">${nFact(c.id)}</td>
      <td class="row" style="flex-wrap:nowrap"><button class="btn sm" data-cli-editar="${esc(c.id)}">Editar</button><button class="btn sm" data-cli-facturar="${esc(c.id)}">Facturar</button></td></tr>`).join("")}</tbody></table></div>`
  :`<div class="vacio">${S.clientes.size?"Ningún cliente coincide.":"Aún no hay clientes. Añádelos aquí o al hacer una factura."}</div>`}`;
}
function abrirCliente(id,paraFactura){
  const c=id?{...S.clientes.get(id)}:{tipo:"particular",pais:"España"};
  const f=$("#f-cliente");
  const pintarF=()=>{const emp=c.tipo==="empresa";
    f.innerHTML=`<div class="row sp"><h2>${id?"Editar cliente":"Nuevo cliente"}</h2><div class="seg"><label><input type="radio" name="tipo" value="particular" ${!emp?"checked":""}> Particular</label><label><input type="radio" name="tipo" value="empresa" ${emp?"checked":""}> Empresa</label></div></div>
      ${emp?`<div class="g2"><label>Razón social<input name="razonSocial" value="${esc(c.razonSocial||"")}" required></label><label>CIF<input name="nif" value="${esc(c.nif||"")}" required></label></div>
        <div class="g2"><label>Persona de contacto<input name="contacto" value="${esc(c.contacto||"")}"></label><label>Nombre comercial<input name="nombreComercial" value="${esc(c.nombreComercial||"")}"></label></div>`
      :`<div class="g3"><label>Nombre<input name="nombre" value="${esc(c.nombre||"")}" required></label><label>Apellidos<input name="apellidos" value="${esc(c.apellidos||"")}" required></label><label>DNI / NIE<input name="nif" value="${esc(c.nif||"")}" required></label></div>`}
      <label>Dirección<input name="direccion" value="${esc(c.direccion||"")}" placeholder="Calle, número, piso"></label>
      <div class="g4"><label>C. P.<input name="cp" value="${esc(c.cp||"")}" inputmode="numeric"></label><label>Municipio<input name="municipio" value="${esc(c.municipio||"")}"></label><label>Provincia<input name="provincia" value="${esc(c.provincia||"")}"></label><label>País<input name="pais" value="${esc(c.pais||"España")}"></label></div>
      <div class="g3"><label>Teléfono<input name="telefono" type="tel" value="${esc(c.telefono||"")}"></label><label>Correo<input name="email" type="email" value="${esc(c.email||"")}"></label><label>IBAN <small>opcional</small><input name="iban" value="${esc(c.iban||"")}"></label></div>
      <label>Notas<textarea name="notas" rows="2">${esc(c.notas||"")}</textarea></label>
      <p class="muted" id="cli-aviso" style="margin:0"></p>
      <div class="row"><span style="flex:1">${id&&!emitidas().some(x=>x.clienteId===id)?`<button class="btn peligro" value="borrar" formnovalidate>Borrar cliente</button>`:""}</span><button class="btn" value="cancelar" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`;
    f.querySelectorAll("[name=tipo]").forEach(r=>r.onchange=()=>{Object.assign(c,Object.fromEntries(new FormData(f)));c.tipo=r.value;pintarF()});
    const nif=f.querySelector("[name=nif]");nif.oninput=()=>{const ok=!nif.value||validarNIF(nif.value,f.querySelector("[name=pais]").value);nif.classList.toggle("mal",!ok);$("#cli-aviso").textContent=ok?"":"El documento no parece válido: revisa números y letra."};
  };
  pintarF();const d=$("#dlg-cliente");d.returnValue="";d.showModal();
  d.onclose=async()=>{
    if(d.returnValue==="borrar"){if(confirm("¿Borrar este cliente?")){await S.db.doc("clientes/"+id).delete();toast("Cliente borrado")}return}
    if(d.returnValue!=="ok")return;
    const v=Object.fromEntries(new FormData(f));const datos={...c,...v,nif:nifLimpio(v.nif),actualizado:new Date().toISOString()};delete datos.id;
    if(!validarNIF(datos.nif,datos.pais)&&!confirm("El NIF/NIE/CIF no parece válido. ¿Guardar de todas formas?"))return abrirCliente(id,paraFactura);
    const nuevoId=id||nid();if(!id)datos.creado=new Date().toISOString();
    await S.db.doc("clientes/"+nuevoId).set(datos);toast("Cliente guardado");
    if(paraFactura&&S.ed&&S.ed.estado==="borrador"){S.ed.clienteId=nuevoId;S.ed.cliente=snapCliente({...datos,id:nuevoId});S.edSucio=true;pintar()}
  };
}
async function importarDemandas(){
  const sn=await S.db.collection("demandas").get();const ya=new Set([...S.clientes.values()].map(c=>(c.telefono||"").replace(/\D/g,"")).filter(Boolean));
  let n=0;for(const d of sn.docs){const x=d.data();const tel=String(x.telefono||x.tel||"").replace(/\D/g,"");const nom=String(x.nombre||x.cliente||"").trim();if(!nom||(tel&&ya.has(tel)))continue;
    const p=nom.split(/\s+/);await S.db.doc("clientes/"+nid()).set({tipo:"particular",nombre:p[0],apellidos:p.slice(1).join(" "),telefono:x.telefono||x.tel||"",email:x.email||"",pais:"España",notas:"Importado de las peticiones de la app",creado:new Date().toISOString()});if(tel)ya.add(tel);n++}
  toast(n?`${n} clientes importados (completa su DNI y dirección antes de facturar)`:"No hay clientes nuevos que importar",5000);
}

/* ======================================================================
   COMPRAS Y GASTOS (con sus facturas en PDF o foto)
   ====================================================================== */
function vistaGastos(){
  const F=S.gfiltro,todos=[...S.gastos.values()];
  const anios=aniosDe(todos.map(g=>g.fecha));
  const q=F.q.trim().toLowerCase(),qm=normMat(F.q);
  const lista=todos.filter(g=>(!F.anio||String(g.fecha||"").startsWith(F.anio))&&(!F.cat||g.categoria===F.cat)&&(!q||[g.proveedor,g.concepto,g.numFactura,g.nifProveedor].join(" ").toLowerCase().includes(q)||(qm.length>=3&&normMat(g.matricula).includes(qm))))
    .sort((a,b)=>String(b.fecha||"").localeCompare(String(a.fecha||"")));
  const tot=lista.reduce((s,g)=>s+(+g.total||0),0),coste=lista.reduce((s,g)=>s+gastoCoste(g),0),iva=lista.reduce((s,g)=>s+gastoCuota(g),0);
  return`<div class="row sp"><div><h1>Compras y gastos</h1><p class="muted" style="margin:4px 0 0">Facturas de compra de los coches (BCA, particulares…) y de gastos (transporte, taller, ITV, gestoría…). Sube el PDF o una foto de cada factura: se guarda en un almacén privado. Si eliges el coche, el gasto se suma a su ficha en la app.</p></div>
    <button class="btn primary" data-acc="gasto-alta">+ Nueva compra o gasto</button></div>
  <div class="row"><label style="max-width:120px">Año<select data-gf="anio">${anios.map(a=>`<option ${a===F.anio?"selected":""}>${a}</option>`).join("")}<option value="" ${!F.anio?"selected":""}>Todos</option></select></label>
    <label style="max-width:260px">Categoría<select data-gf="cat"><option value="">Todas</option>${CATS_GASTO.map(c=>`<option ${c===F.cat?"selected":""}>${c}</option>`).join("")}</select></label>
    <label style="flex:1 1 240px">Buscar<input type="search" data-gf="q" value="${esc(F.q)}" placeholder="Proveedor, concepto, nº factura, matrícula…"></label></div>
  <div class="kpis"><div class="kpi"><b>${eur(tot)}</b><span>total de facturas (${lista.length})</span></div><div class="kpi"><b>${eur(coste)}</b><span>coste para los márgenes</span></div><div class="kpi"><b>${eur(iva)}</b><span>IVA soportado deducible</span></div></div>
  ${lista.length?`<div class="tw"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Concepto</th><th>Coche</th><th>Régimen</th><th class="num">Base</th><th class="num">IVA</th><th class="num">Total</th><th>Archivos</th></tr></thead><tbody>
    ${lista.map(g=>`<tr data-gasto="${esc(g.id)}" style="cursor:pointer"><td>${fecha(g.fecha)}</td><td>${esc(g.proveedor||"—")}<div class="muted">${esc(g.numFactura?"Fra. "+g.numFactura:"")}</div></td>
      <td>${esc(g.categoria||"")}<div class="muted">${esc(g.concepto||"")}</div></td><td>${g.matricula?`<span class="mat">${esc(g.matricula)}</span>`:"—"}</td><td>${esc(g.regimen||"")}</td>
      <td class="num">${g.regimen==="General"?eur(g.base):"—"}</td><td class="num">${g.regimen==="General"?eur(g.cuota):"—"}</td><td class="num">${eur(g.total)}</td>
      <td>${(g.archivos||[]).length?`<span class="tag acc">${g.archivos.length} ${g.archivos.length===1?"archivo":"archivos"}</span>`:`<span class="tag warn">Sin factura</span>`}</td></tr>`).join("")}</tbody></table></div>`
  :`<div class="vacio">${S.gastos.size?"Nada con estos filtros.":"Aún no hay compras ni gastos apuntados."}</div>`}`;
}
function abrirGasto(id,pre={}){
  const g=id?JSON.parse(JSON.stringify(S.gastos.get(id))):{fecha:hoyISO(),categoria:"Transporte y portes",regimen:"General",ivaTipo:21,base:"",cuota:"",total:"",archivos:[],...pre};
  const nuevos=[];const borrados=[];
  const f=$("#f-gasto");
  const provs=[...new Set([...S.gastos.values()].map(x=>x.proveedor).filter(Boolean))];
  const pintarF=()=>{
    const gen=g.regimen==="General";
    f.innerHTML=`<h2>${id?"Editar":"Nueva"} compra o gasto</h2>
      <div class="g3"><label>Fecha de la factura<input type="date" name="fecha" value="${esc(g.fecha||"")}" required></label>
        <label>Categoría<select name="categoria">${CATS_GASTO.map(c=>`<option ${c===g.categoria?"selected":""}>${c}</option>`).join("")}</select></label>
        <label>Régimen<select name="regimen">${REGIMEN_GASTO.map(([k,v])=>`<option value="${k}" ${k===g.regimen?"selected":""}>${v}</option>`).join("")}</select></label></div>
      <div class="g3"><label>Proveedor<input name="proveedor" list="provs" value="${esc(g.proveedor||"")}" required><datalist id="provs">${provs.map(p=>`<option value="${esc(p)}">`).join("")}</datalist></label>
        <label>NIF del proveedor<input name="nifProveedor" value="${esc(g.nifProveedor||"")}"></label><label>Nº de factura<input name="numFactura" value="${esc(g.numFactura||"")}"></label></div>
      <label>Concepto<input name="concepto" value="${esc(g.concepto||"")}" placeholder="Ej.: adjudicación subasta BCA, transporte Madrid–Murcia…"></label>
      <div class="g2"><label>Coche<select name="loteId"><option value="">— Sin coche / gasto general —</option>${S.lotes.filter(l=>["comprado","stock","vendido"].includes(l.estado)||l.id===g.loteId).map(l=>`<option value="${esc(l.id)}" ${l.id===g.loteId?"selected":""}>${esc(l.matricula||"sin matrícula")} · ${esc([l.marca,l.modelo].filter(Boolean).join(" "))}</option>`).join("")}</select></label>
        <label>Matrícula <small>si el coche no está en la app</small><input name="matricula" value="${esc(g.matricula||"")}" style="text-transform:uppercase"></label></div>
      <div class="g4">${gen?`<label>Base (€)<input name="base" inputmode="decimal" value="${esc(g.base)}"></label><label>IVA %<input name="ivaTipo" inputmode="decimal" value="${esc(g.ivaTipo??21)}"></label><label>Cuota IVA (€)<input name="cuota" inputmode="decimal" value="${esc(g.cuota)}"></label>`:`<span></span><span></span><span></span>`}
        <label>Total factura (€)<input name="total" inputmode="decimal" value="${esc(g.total)}" required></label></div>
      ${g.categoria==="Compra del vehículo"?`<p class="aviso" style="margin:0">El régimen de la compra decide el de la venta: compra con IVA general → venta con IVA 21 %; compra en REBU o a un particular → venta en REBU.</p>`:""}
      <p class="muted" style="margin:0">${gen?"Escribe la base o el total: lo demás se calcula. El coste que suma al coche es la base (el IVA se deduce).":g.regimen==="REBU"?"Compra en REBU: el IVA no se desglosa ni se deduce; el coste del coche es el total.":"Sin IVA: el coste es el total."}</p>
      <label class="row" style="flex-direction:row;color:var(--ink);font-weight:500"><input type="checkbox" name="pagado" ${g.pagado?"checked":""} style="width:auto"> Pagada</label>
      <div class="card"><div class="row sp"><b>Factura (PDF o foto)</b><label class="btn sm" style="display:inline-flex;color:var(--ink)">Subir archivos<input type="file" id="g-files" accept="application/pdf,image/*" multiple hidden></label></div>
        <div class="files" id="g-lista">${[...(g.archivos||[]),...nuevos.map(n=>({nombre:n.name,nuevo:true,size:n.size}))].map((a,i)=>`<div><span>${esc(a.nombre)} <span class="muted">${a.size?Math.round(a.size/1024)+" KB":""}${a.nuevo?" · se subirá al guardar":""}</span></span><span class="row">${a.ruta?`<button class="btn sm" data-ver-archivo="${esc(a.ruta)}" data-nombre="${esc(a.nombre)}" value="nada" formnovalidate>Ver</button>`:""}<button class="btn sm" data-quitar-archivo="${i}" value="nada" formnovalidate>Quitar</button></span></div>`).join("")||`<span class="muted">Sin archivos.</span>`}</div></div>
      <div class="row"><span style="flex:1">${id?`<button class="btn peligro" value="borrar" formnovalidate>Borrar</button>`:""}</span><button class="btn" value="cancelar" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`;
    const leer=()=>{const v=Object.fromEntries(new FormData(f));Object.assign(g,v,{pagado:!!f.querySelector("[name=pagado]").checked})};
    f.querySelector("[name=regimen]").onchange=()=>{leer();pintarF()};
    f.querySelector("[name=categoria]").onchange=()=>{leer();pintarF()};
    f.querySelector("[name=loteId]").onchange=e=>{leer();const l=S.lotes.find(x=>x.id===e.target.value);if(l){g.matricula=normMat(l.matricula)}pintarF()};
    const num=n=>+String(n||"").replace(",",".")||0;
    const B=f.querySelector("[name=base]"),T=f.querySelector("[name=total]"),C=f.querySelector("[name=cuota]"),P=f.querySelector("[name=ivaTipo]");
    if(B){const desdeBase=()=>{const b=num(B.value),p=num(P.value);C.value=r2(b*p/100);T.value=r2(b+b*p/100)};
      B.oninput=desdeBase;P.oninput=desdeBase;T.oninput=()=>{const t=num(T.value),p=num(P.value);const b=r2(t/(1+p/100));B.value=b;C.value=r2(t-b)};}
    f.querySelector("#g-files").onchange=e=>{leer();for(const fi of e.target.files){if(fi.size>15e6){toast(fi.name+": máximo 15 MB");continue}nuevos.push(fi)}pintarF()};
    f.querySelectorAll("[data-quitar-archivo]").forEach(b=>b.onclick=ev=>{ev.preventDefault();leer();const i=+b.dataset.quitarArchivo,n=(g.archivos||[]).length;if(i<n)borrados.push(...g.archivos.splice(i,1));else nuevos.splice(i-n,1);pintarF()});
    f.querySelectorAll("[data-ver-archivo]").forEach(b=>b.onclick=ev=>{ev.preventDefault();verArchivo(b.dataset.verArchivo,b.dataset.nombre)});
  };
  pintarF();const d=$("#dlg-gasto");d.returnValue="";d.showModal();
  d.onclose=async()=>{
    try{
      if(d.returnValue==="borrar"){if(!confirm("¿Borrar este gasto y sus archivos?"))return;
        for(const a of g.archivos||[])await HUELSAN.borrarArchivo("documentos",a.ruta).catch(()=>{});
        await S.db.doc("gastos/"+id).delete();await sincronizarLote({...g,id,_borrar:true});toast("Gasto borrado");return}
      if(d.returnValue!=="ok")return;
      const v=Object.fromEntries(new FormData(f));const num=n=>r2(+String(n||"").replace(",",".")||0);
      const dato={fecha:v.fecha,categoria:v.categoria,regimen:v.regimen,proveedor:String(v.proveedor||"").trim(),nifProveedor:nifLimpio(v.nifProveedor),numFactura:String(v.numFactura||"").trim(),concepto:String(v.concepto||"").trim(),
        loteId:v.loteId||"",matricula:normMat(v.matricula),pagado:!!f.querySelector("[name=pagado]").checked,total:num(v.total),archivos:[...(g.archivos||[])],actualizado:new Date().toISOString()};
      if(dato.regimen==="General"){dato.ivaTipo=num(v.ivaTipo);dato.base=num(v.base)||r2(dato.total/(1+dato.ivaTipo/100));dato.cuota=num(v.cuota)||r2(dato.total-dato.base)}else{dato.base=dato.total;dato.cuota=0;dato.ivaTipo=0}
      if(!dato.total)throw new Error("Falta el total de la factura");
      if(!dato.matricula&&dato.loteId){const l=S.lotes.find(x=>x.id===dato.loteId);if(l)dato.matricula=normMat(l.matricula)}
      toast(nuevos.length?"Subiendo archivos…":"Guardando…",20000);
      for(const fi of nuevos){const r=await HUELSAN.subir("documentos",fi);dato.archivos.push({ruta:r.id,nombre:fi.name,tipo:fi.type,size:fi.size,subido:new Date().toISOString()})}
      for(const a of borrados)await HUELSAN.borrarArchivo("documentos",a.ruta).catch(()=>{});
      const gid=id||nid();if(!id)dato.creado=new Date().toISOString();
      await S.db.doc("gastos/"+gid).set(dato);
      if(id&&g.loteId&&g.loteId!==dato.loteId)await sincronizarLote({...S.gastos.get(id),id:gid,_borrar:true});
      await sincronizarLote({...dato,id:gid});
      toast("Guardado");
    }catch(err){toast(err.message,6000)}
  };
}
// El gasto se refleja en la ficha del coche (gastos y precio de compra), sin duplicar
async function sincronizarLote(g){
  if(!g.loteId)return;
  try{const sn=await S.db.doc("lotes/"+g.loteId).get();if(!sn.exists)return;const l=sn.data();
    const det=(Array.isArray(l.gastosDetalle)?l.gastosDetalle:(+l.gastos>0?[{id:"g0",fecha:null,categoria:"Otros",concepto:"Gastos anotados antes del desglose",importe:+l.gastos}]:[])).filter(x=>x.gastoId!==g.id);
    const patch={};
    if(g.categoria==="Compra del vehículo"){
      if(g._borrar){if(l.precioCompraGasto===g.id){patch.precioCompra=l.precioCompraAnterior||null;patch.precioCompraGasto=null}}
      else{ // la factura de compra manda: el precio de compra del coche pasa a ser el de la factura
        if(l.precioCompra&&l.precioCompraGasto!==g.id&&r2(l.precioCompra)!==gastoCoste(g)){patch.precioCompraAnterior=l.precioCompra;toast(`Precio de compra del coche actualizado de ${eur(l.precioCompra)} a ${eur(gastoCoste(g))} (el de la factura).`,6000)}
        patch.precioCompra=gastoCoste(g);patch.precioCompraGasto=g.id;
        patch.iva=g.regimen==="General"?"General":"REBU"} // la venta irá en el mismo régimen
    }else if(!g._borrar)det.push({id:"f-"+g.id,gastoId:g.id,fecha:g.fecha,categoria:g.categoria,concepto:[g.proveedor,g.concepto].filter(Boolean).join(" · "),importe:gastoCoste(g)});
    patch.gastosDetalle=det;patch.gastos=r2(det.reduce((s,x)=>s+(+x.importe||0),0));
    await S.db.doc("lotes/"+g.loteId).update(patch);
    const lc=S.lotes.find(x=>x.id===g.loteId);if(lc)Object.assign(lc,patch);
  }catch(e){toast("Guardado, pero no se ha podido actualizar la ficha del coche: "+e.message,6000)}
}
async function verArchivo(ruta,nombre){
  try{toast("Abriendo…");const b=await HUELSAN.bajar("documentos",ruta);const u=URL.createObjectURL(b);const w=open(u,"_blank");
    if(!w){const a=document.createElement("a");a.href=u;a.download=nombre||ruta;a.click()}setTimeout(()=>URL.revokeObjectURL(u),60000)}catch(e){toast(e.message,6000)}}

/* ======================================================================
   POR MATRÍCULA: compra + gastos + ventas = margen
   ====================================================================== */
function porMatricula(){
  const m=new Map();
  const get=k=>{if(!m.has(k))m.set(k,{matricula:k,lote:null,titulo:"",compra:0,compraRebu:0,gastos:0,iva:0,ventas:0,ventaRebu:0,ventaBase:0,ventaCuota:0,facturas:[],docs:[],gastosApp:0});return m.get(k)};
  for(const l of S.lotes){if(!["comprado","stock","vendido"].includes(l.estado))continue;const k=normMat(l.matricula)||("lote:"+l.id);const x=get(k);x.lote=l;x.titulo=[l.marca,l.modelo].filter(Boolean).join(" ");
    const tieneCompra=[...S.gastos.values()].some(g=>g.categoria==="Compra del vehículo"&&(g.loteId===l.id||(normMat(l.matricula)&&normMat(g.matricula)===normMat(l.matricula))));
    if(l.precioCompra&&!l.precioCompraGasto&&!tieneCompra){x.compra+=+l.precioCompra;if(l.iva!=="General")x.compraRebu+=+l.precioCompra}
    for(const gd of Array.isArray(l.gastosDetalle)?l.gastosDetalle:[])if(!gd.gastoId){x.gastos+=+gd.importe||0;x.gastosApp+=+gd.importe||0}
    if(!Array.isArray(l.gastosDetalle)&&+l.gastos>0){x.gastos+=+l.gastos;x.gastosApp+=+l.gastos}}
  for(const g of S.gastos.values()){const l=g.loteId&&S.lotes.find(y=>y.id===g.loteId);const k=normMat(g.matricula)||(l?normMat(l.matricula)||("lote:"+l.id):"");if(!k)continue;const x=get(k);
    if(!x.titulo&&l)x.titulo=[l.marca,l.modelo].filter(Boolean).join(" ");
    if(g.categoria==="Compra del vehículo"){x.compra+=gastoCoste(g);if(g.regimen!=="General")x.compraRebu+=gastoCoste(g)}else x.gastos+=gastoCoste(g);
    x.iva+=gastoCuota(g);x.docs.push(g)}
  for(const f of emitidas()){const k=normMat(f.vehiculo&&f.vehiculo.matricula);if(!k)continue;const x=get(k);if(!x.titulo)x.titulo=[f.vehiculo.marca,f.vehiculo.modelo].filter(Boolean).join(" ");
    const e=efecto(f);x.ventaRebu+=e.rebu;x.ventaBase+=e.base;x.ventaCuota+=e.cuota;x.ventas+=e.rebu+e.base;x.facturas.push(f)}
  for(const x of m.values()){x.coste=r2(x.compra+x.gastos);x.margen=r2(x.ventas-x.coste);
    const mr=r2(x.ventaRebu-x.compraRebu);x.ivaRebu=x.ventaRebu>0&&mr>0?r2(mr*21/121):0;x.margenNeto=r2(x.margen-x.ivaRebu)}
  return[...m.values()];
}
function vistaMatriculas(){
  const lista=porMatricula();const q=normMat(S.mq||""),qt=String(S.mq||"").toLowerCase();
  if(S.mat){const x=lista.find(y=>y.matricula===S.mat);if(x)return detalleMatricula(x);S.mat=null}
  const fil=lista.filter(x=>!q||x.matricula.includes(q)||x.titulo.toLowerCase().includes(qt)).sort((a,b)=>(b.facturas.length?1:0)-(a.facturas.length?1:0)||b.coste-a.coste);
  const T=k=>r2(fil.reduce((s,x)=>s+x[k],0));
  return`<div><h1>Contabilidad por matrícula</h1><p class="muted" style="margin:4px 0 0">Cada coche con su compra, sus gastos y su venta. El margen neto descuenta el IVA del REBU (21/121 del margen de las ventas en REBU). Son cifras orientativas: la liquidación la confirma la gestoría.</p></div>
  <label>Buscar<input type="search" data-mq value="${esc(S.mq||"")}" placeholder="Matrícula, marca o modelo"></label>
  <div class="kpis"><div class="kpi"><b>${eur(T("coste"))}</b><span>compras + gastos</span></div><div class="kpi"><b>${eur(T("ventas"))}</b><span>ventas (sin IVA general)</span></div><div class="kpi"><b>${eur(T("margen"))}</b><span>margen bruto</span></div><div class="kpi"><b>${eur(T("margenNeto"))}</b><span>margen tras IVA del REBU</span></div></div>
  ${fil.length?`<div class="tw"><table><thead><tr><th>Matrícula</th><th>Vehículo</th><th>Estado</th><th class="num">Compra</th><th class="num">Gastos</th><th class="num">Venta</th><th class="num">Margen</th><th class="num">IVA REBU</th><th class="num">Margen neto</th><th>Documentos</th></tr></thead><tbody>
    ${fil.map(x=>`<tr data-mat="${esc(x.matricula)}" style="cursor:pointer"><td>${x.matricula.startsWith("lote:")?"—":`<span class="mat">${esc(x.matricula)}</span>`}</td><td>${esc(x.titulo)}</td>
      <td>${x.lote?esc(({comprado:"Comprado",stock:"Stock",vendido:"Vendido"})[x.lote.estado]||x.lote.estado):x.facturas.length?"Vendido":"—"}</td>
      <td class="num">${eur(x.compra)}</td><td class="num">${eur(x.gastos)}</td><td class="num">${x.ventas?eur(x.ventas):"—"}</td>
      <td class="num" style="color:${x.ventas?(x.margen>=0?"var(--ok)":"var(--bad)"):"inherit"}">${x.ventas?eur(x.margen):"—"}</td><td class="num">${x.ivaRebu?eur(x.ivaRebu):"—"}</td><td class="num"><b>${x.ventas?eur(x.margenNeto):"—"}</b></td>
      <td>${x.facturas.length?`<span class="tag ok">${x.facturas.length} venta</span> `:""}${x.docs.length?`<span class="tag acc">${x.docs.length} gasto${x.docs.length>1?"s":""}</span>`:""}${!x.docs.some(g=>g.categoria==="Compra del vehículo")&&x.compra?` <span class="tag warn">sin factura de compra</span>`:""}</td></tr>`).join("")}
  </tbody></table></div>`:`<div class="vacio">Aún no hay coches comprados, gastos ni ventas.</div>`}`;
}
function detalleMatricula(x){
  const l=x.lote;
  return`<div class="row sp"><div class="row"><button class="btn sm" data-acc="mat-volver">← Todas</button><h1>${x.matricula.startsWith("lote:")?"Sin matrícula":`<span class="mat" style="font-size:18px">${esc(x.matricula)}</span>`} ${esc(x.titulo)}</h1></div>
    <span class="row"><button class="btn" data-acc="mat-gasto">+ Subir factura de compra o gasto</button>${l&&l.estado!=="vendido"&&!x.facturas.length?`<button class="btn primary" data-acc="mat-facturar">Crear factura de venta</button>`:""}</span></div>
  <div class="kpis"><div class="kpi"><b>${eur(x.compra)}</b><span>compra</span></div><div class="kpi"><b>${eur(x.gastos)}</b><span>gastos</span></div><div class="kpi"><b>${x.ventas?eur(x.ventas):"—"}</b><span>venta (sin IVA general)</span></div>
    <div class="kpi"><b>${x.ventas?eur(x.margen):"—"}</b><span>margen bruto</span></div><div class="kpi"><b>${x.ivaRebu?eur(x.ivaRebu):"—"}</b><span>IVA del REBU</span></div><div class="kpi"><b>${x.ventas?eur(x.margenNeto):"—"}</b><span>margen neto</span></div></div>
  ${l?`<p class="muted" style="margin:0">${esc([l.vin?"Bastidor "+l.vin:"",l.anio,l.km?miles(String(Math.round(l.km)))+" km":"",l.combustible,l.iva?"Compra en "+l.iva:""].filter(Boolean).join(" · "))}${x.gastosApp?` · ${eur(x.gastosApp)} de gastos anotados en la ficha del coche (sin factura subida)`:""}</p>`:""}
  <h3>Ventas</h3>${x.facturas.length?`<div class="tw"><table><tbody>${x.facturas.map(f=>`<tr data-ir-factura="${esc(f.id)}" style="cursor:pointer"><td><b>${esc(f.codigo)}</b></td><td>${fecha(f.fechaExpedicion)}</td><td>${esc(f.cliente&&f.cliente.nombre)}</td><td>${etiquetaEstado(f)}</td><td class="num">${eur(f.totales&&f.totales.total)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Sin facturas de venta.</p>`}
  <h3>Compras y gastos con factura</h3>${x.docs.length?`<div class="tw"><table><tbody>${x.docs.sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha))).map(g=>`<tr data-gasto="${esc(g.id)}" style="cursor:pointer"><td>${fecha(g.fecha)}</td><td>${esc(g.categoria)}</td><td>${esc(g.proveedor||"")}<div class="muted">${esc(g.concepto||"")}</div></td><td class="num">${eur(gastoCoste(g))}</td>
    <td>${(g.archivos||[]).map(a=>`<button class="btn sm" data-ver-archivo="${esc(a.ruta)}" data-nombre="${esc(a.nombre)}">${esc(a.nombre.length>24?a.nombre.slice(0,22)+"…":a.nombre)}</button>`).join(" ")||`<span class="tag warn">Sin archivo</span>`}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Aún no hay facturas de compra ni de gastos de este coche.</p>`}`;
}

/* ======================================================================
   IVA Y LIBROS
   ====================================================================== */
function vistaResumen(){
  const anio=S.res.anio;const anios=aniosDe([...emitidas().map(f=>f.fechaExpedicion),...[...S.gastos.values()].map(g=>g.fecha)]);
  const filas=[1,2,3,4].map(tq=>{
    const fs=emitidas().filter(f=>String(f.fechaExpedicion||"").startsWith(anio)&&trimestre(f.fechaExpedicion)===tq);
    const gs=[...S.gastos.values()].filter(g=>String(g.fecha||"").startsWith(anio)&&trimestre(g.fecha)===tq);
    const rep={};let rebuVentas=0;
    for(const f of fs){const e=efecto(f);rebuVentas+=e.rebu;for(const g of e.grupos){const x=rep[g.tipo]=rep[g.tipo]||{base:0,cuota:0};x.base+=g.base;x.cuota+=g.cuota}}
    // REBU por operación: margen de cada coche vendido en el trimestre (venta REBU − su compra REBU)
    let margenRebu=0;const vistos=new Set();
    for(const f of fs){const k=normMat(f.vehiculo&&f.vehiculo.matricula);if(!k||vistos.has(k))continue;vistos.add(k);
      const x=porMatricula().find(y=>y.matricula===k);if(x&&x.ventaRebu>0)margenRebu+=Math.max(0,x.ventaRebu-x.compraRebu)}
    const baseRebu=r2(margenRebu/1.21),cuotaRebu=r2(margenRebu-baseRebu);
    const sop=r2(gs.reduce((s,g)=>s+gastoCuota(g),0)),sopBase=r2(gs.filter(g=>g.regimen==="General").reduce((s,g)=>s+(+g.base||0),0));
    const cuotaRep=r2(Object.values(rep).reduce((s,x)=>s+x.cuota,0));
    return{tq,n:fs.length,rep,rebuVentas:r2(rebuVentas),margenRebu:r2(margenRebu),baseRebu,cuotaRebu,sop,sopBase,cuotaRep,resultado:r2(cuotaRep+cuotaRebu-sop)};
  });
  return`<div class="row sp"><div><h1>IVA y libros registro</h1><p class="muted" style="margin:4px 0 0">Resumen por trimestre para preparar el modelo 303 con la gestoría y descarga de los libros (en CSV, se abren con Excel). Orientativo: el REBU se calcula coche a coche con el margen de venta sobre su compra.</p></div>
    <label style="max-width:120px">Año<select data-ra>${anios.map(a=>`<option ${a===anio?"selected":""}>${a}</option>`).join("")}</select></label></div>
  <div class="tw"><table><thead><tr><th>Trimestre</th><th class="num">Facturas</th><th class="num">Base general</th><th class="num">IVA repercutido</th><th class="num">Ventas REBU</th><th class="num">Margen REBU</th><th class="num">IVA del REBU</th><th class="num">IVA soportado</th><th class="num">Resultado</th></tr></thead><tbody>
    ${filas.map(r=>`<tr><td><b>${r.tq}T ${anio}</b></td><td class="num">${r.n}</td><td class="num">${eur(Object.values(r.rep).reduce((s,x)=>s+x.base,0))}</td><td class="num">${eur(r.cuotaRep)}</td><td class="num">${eur(r.rebuVentas)}</td><td class="num">${eur(r.margenRebu)}</td><td class="num">${eur(r.cuotaRebu)}</td><td class="num">${eur(r.sop)}</td>
      <td class="num"><b style="color:${r.resultado>0?"var(--bad)":"var(--ok)"}">${eur(r.resultado)}</b><div class="muted">${r.resultado>0?"a ingresar":r.resultado<0?"a compensar":""}</div></td></tr>`).join("")}
  </tbody></table></div>
  <div class="card"><h3>Descargas</h3><div class="row">
    <button class="btn" data-acc="csv-expedidas">Libro de facturas expedidas ${anio}</button>
    <button class="btn" data-acc="csv-recibidas">Libro de facturas recibidas ${anio}</button>
    <button class="btn" data-acc="csv-rebu">Libro de bienes usados (REBU) ${anio}</button>
    <button class="btn" data-acc="zip-pdf">Todas las facturas ${anio} en PDF (ZIP)</button></div>
    <p class="muted" style="margin:0">Conservad las facturas y estos libros al menos 4 años (Ley General Tributaria) y 6 años la documentación contable (Código de Comercio).</p></div>`;
}
function bajarCSV(nombre,filas){
  const csv="﻿"+filas.map(f=>f.map(v=>{const s=typeof v==="number"?(Number.isInteger(v)?String(v):numES(v).replace(/\./g,"")):String(v??"");return/[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}).join(";")).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function csvExpedidas(anio){
  const fs=emitidas().filter(f=>String(f.fechaExpedicion||"").startsWith(anio)).sort((a,b)=>String(a.serie).localeCompare(String(b.serie))||a.numero-b.numero);
  const filas=[["Fecha expedición","Fecha operación","Serie","Número","Factura","Tipo","Rectifica a","Motivo","Cliente","NIF","Matrícula","Bastidor","Régimen","Base imponible","Tipo IVA %","Cuota IVA","Importe REBU","Total factura","Estado","Huella"]];
  for(const f of fs){const t=f.totales||calcular(f.lineas);const base=[f.fechaExpedicion,f.fechaOperacion||"",f.serie,f.numero,f.codigo,f.tipo==="rectificativa"?"Rectificativa ("+((f.rectifica||{}).tipo||"")+")":"Ordinaria",(f.rectifica||{}).codigo||"",(f.rectifica||{}).motivo||"",f.cliente.nombre,f.cliente.nif,(f.vehiculo||{}).matricula||"",(f.vehiculo||{}).bastidor||""];
    const est=f.anulada?"Anulada":f.estado==="rectificada"?"Rectificada":"Emitida";
    if(t.rebu)filas.push([...base,TXT_REBU,"","","",t.rebu,t.total,est,f.huella||""]);
    for(const g of t.grupos)filas.push([...base,"General",g.base,g.tipo,g.cuota,"",t.total,est,f.huella||""])}
  bajarCSV(`libro-expedidas-${anio}.csv`,filas);
}
function csvRecibidas(anio){
  const gs=[...S.gastos.values()].filter(g=>String(g.fecha||"").startsWith(anio)).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  const filas=[["Fecha","Proveedor","NIF proveedor","Nº factura","Categoría","Concepto","Matrícula","Régimen","Base imponible","Tipo IVA %","Cuota IVA deducible","Total","Pagada","Archivos"]];
  gs.forEach(g=>filas.push([g.fecha,g.proveedor,g.nifProveedor||"",g.numFactura||"",g.categoria,g.concepto||"",g.matricula||"",g.regimen,g.regimen==="General"?g.base:"",g.regimen==="General"?g.ivaTipo:"",gastoCuota(g),g.total,g.pagado?"Sí":"No",(g.archivos||[]).length]));
  bajarCSV(`libro-recibidas-${anio}.csv`,filas);
}
function csvRebu(anio){
  const filas=[["Matrícula","Vehículo","Bastidor","Documento de compra","Fecha compra","Precio de compra","Factura de venta","Fecha venta","Precio de venta","Margen","Base imponible (margen/1,21)","IVA (21 %)"]];
  for(const x of porMatricula()){const vs=x.facturas.filter(f=>String(f.fechaExpedicion||"").startsWith(anio)&&efecto(f).rebu);if(!vs.length||!r2(x.ventaRebu))continue;
    const comp=x.docs.filter(g=>g.categoria==="Compra del vehículo");const m=r2(x.ventaRebu-x.compraRebu);const base=m>0?r2(m/1.21):0;
    filas.push([x.matricula,x.titulo,(x.lote&&x.lote.vin)||(vs[0].vehiculo||{}).bastidor||"",comp.map(g=>[g.proveedor,g.numFactura].filter(Boolean).join(" ")).join(" / ")||"Ficha del coche",comp[0]&&comp[0].fecha||"",x.compraRebu,vs.map(f=>f.codigo).join(" / "),vs[vs.length-1].fechaExpedicion,x.ventaRebu,m,base,m>0?r2(m-base):0])}
  bajarCSV(`libro-bienes-usados-${anio}.csv`,filas);
}

/* ======================================================================
   DATOS FISCALES (emisor)
   ====================================================================== */
function vistaEmisor(){
  const e=S.emisor||{};
  const nifOk=!e.nif||validarNIF(e.nif,"España");
  return`<div><h1>Nuestros datos fiscales</h1><p class="muted" style="margin:4px 0 0">Salen en todas las facturas. Cada factura emitida guarda una copia de estos datos, así que cambiarlos solo afecta a las siguientes.</p></div>
  ${e._nuevo?`<div class="aviso">He rellenado lo que había en «Datos de empresa». Revisa y completa (sobre todo el domicilio completo y el Registro Mercantil) y pulsa «Guardar».</div>`:""}
  <form id="f-emisor" class="card" autocomplete="off">
    <div class="g2"><label>Razón social<input name="razonSocial" value="${esc(e.razonSocial||"")}" required placeholder="Huelsan SL"></label><label>Nombre comercial<input name="nombreComercial" value="${esc(e.nombreComercial||"")}"></label></div>
    <div class="g2"><label>NIF${nifOk?"":` <small style="color:var(--bad)">no parece válido</small>`}<input name="nif" value="${esc(e.nif||"")}" required class="${nifOk?"":"mal"}"></label><label>Datos registrales <small>Registro Mercantil, tomo, folio, hoja</small><input name="registro" value="${esc(e.registro||"")}"></label></div>
    <label>Domicilio fiscal (calle y número)<input name="domicilio" value="${esc(e.domicilio||"")}" required></label>
    <div class="g4"><label>C. P.<input name="cp" value="${esc(e.cp||"")}"></label><label>Municipio<input name="municipio" value="${esc(e.municipio||"")}"></label><label>Provincia<input name="provincia" value="${esc(e.provincia||"")}"></label><label>País<input name="pais" value="${esc(e.pais||"España")}"></label></div>
    <div class="g3"><label>Teléfono<input name="telefono" value="${esc(e.telefono||"")}"></label><label>Correo<input name="email" value="${esc(e.email||"")}"></label><label>Web<input name="web" value="${esc(e.web||"")}"></label></div>
    <div class="g2"><label>IBAN para cobros<input name="iban" value="${esc(e.iban||"")}" placeholder="ES00 0000 0000 0000 0000 0000"></label><label>Banco<input name="banco" value="${esc(e.banco||"")}"></label></div>
    <label>Texto de garantía por defecto<textarea name="textoGarantia" rows="3">${esc(e.textoGarantia||TXT_GARANTIA)}</textarea></label>
    <label>Pie de factura (protección de datos)<textarea name="textoPie" rows="3">${esc(e.textoPie||TXT_RGPD)}</textarea></label>
    <div class="row"><button class="btn primary" data-acc="guardar-emisor">Guardar datos fiscales</button><span class="muted">${e.actualizado?"Última actualización: "+new Date(e.actualizado).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"}):""}</span></div>
  </form>
  <div class="card"><h3>Numeración</h3><p style="margin:0">Serie ordinaria <b>AAAA-0001</b> y rectificativas <b>RAAAA-0001</b>. Empiezan en 0001 cada 1 de enero. El número lo pone la base de datos al emitir, nunca a mano.</p>
    <div class="row">${[...S.cont.entries()].filter(([k])=>k.startsWith("contador/")).map(([k,v])=>`<span class="tag acc">${esc(k.replace("contador/","Serie "))}: última ${esc(fCodigo(k.includes("/R")?"R":"F",k.slice(-4),v.ultimo||0))} (${fecha(v.ultimaFecha)})</span>`).join(" ")||`<span class="muted">Aún no se ha emitido ninguna factura.</span>`}</div></div>`;
}
async function guardarEmisor(){
  const f=$("#f-emisor");const v=Object.fromEntries(new FormData(f));
  if(!v.razonSocial||!v.nif||!v.domicilio)throw new Error("Razón social, NIF y domicilio son obligatorios");
  const d={...v,nif:nifLimpio(v.nif),actualizado:new Date().toISOString()};
  await S.db.doc("facturacion/emisor").set(d);S.emisor=d;toast("Datos fiscales guardados");pintar();
}

/* otras acciones (clientes, gastos, matrículas, libros, emisor) */
function accionesOtras(a){
  if(a==="cliente-alta")abrirCliente(null,false);
  else if(a==="importar-demandas")importarDemandas().catch(e=>toast(e.message));
  else if(a==="gasto-alta")abrirGasto(null);
  else if(a==="mat-volver"){S.mat=null;pintar()}
  else if(a==="mat-gasto"){const x=porMatricula().find(y=>y.matricula===S.mat);abrirGasto(null,{matricula:S.mat.startsWith("lote:")?"":S.mat,loteId:x&&x.lote?x.lote.id:"",categoria:x&&!x.docs.some(g=>g.categoria==="Compra del vehículo")?"Compra del vehículo":"Transporte y portes",regimen:x&&!x.docs.some(g=>g.categoria==="Compra del vehículo")&&x.lote&&x.lote.iva!=="General"?"REBU":"General"})}
  else if(a==="mat-facturar"){const x=porMatricula().find(y=>y.matricula===S.mat);S.tab="facturas";pintarTabs();nuevaFactura({loteId:x&&x.lote?x.lote.id:""})}
  else if(a==="csv-expedidas")csvExpedidas(S.res.anio);
  else if(a==="csv-recibidas")csvRecibidas(S.res.anio);
  else if(a==="csv-rebu")csvRebu(S.res.anio);
  else if(a==="zip-pdf")zipPDF(S.res.anio).catch(e=>toast(e.message,6000));
  else if(a==="guardar-emisor")guardarEmisor().catch(e=>toast(e.message,6000));
}
document.addEventListener("click",e=>{
  const t=e.target;
  if(t.closest("[data-acc=guardar-emisor]"))e.preventDefault();
  const ce=t.closest("[data-cli-editar]");if(ce){abrirCliente(ce.dataset.cliEditar,false);return}
  const cf=t.closest("[data-cli-facturar]");if(cf){nuevaFactura({clienteId:cf.dataset.cliFacturar});return}
  const va=t.closest("[data-ver-archivo]");if(va&&!t.closest("dialog")){e.stopPropagation();verArchivo(va.dataset.verArchivo,va.dataset.nombre);return}
  const gs=t.closest("[data-gasto]");if(gs){abrirGasto(gs.dataset.gasto);return}
  const mt=t.closest("[data-mat]");if(mt){S.mat=mt.dataset.mat;pintar();scrollTo(0,0);return}
},true);

/* ======================================================================
   PDF de la factura (A4, jsPDF)
   ====================================================================== */
let logoPNG=null;
async function logo(){
  if(logoPNG)return logoPNG;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="3 3 58 49" width="580" height="490"><path d="M8.6 49.5 A27 27 0 1 1 55.4 49.5" fill="none" stroke="#1B1D20" stroke-width="4.5" stroke-linecap="round"/><path d="M55.4 22.5 A27 27 0 0 1 56.47 43.41" fill="none" stroke="#B8976A" stroke-width="4.5" stroke-linecap="round"/><path d="M13.340 45.510 L16.660 50.490 L17.500 49.874 L17.500 42.998 Z" fill="#B8976A"/><path d="M28.500 41.806 L35.500 36.672 L35.500 32.130 L28.500 36.357 Z" fill="#B8976A"/><path d="M46.500 28.604 L48.960 26.800 L47.640 24.800 L46.500 25.488 Z" fill="#B8976A"/><rect x="19" y="22" width="8" height="28" fill="#1B1D20"/><rect x="37" y="22" width="8" height="28" fill="#1B1D20"/><circle cx="15" cy="48" r="3.0" fill="#1B1D20"/></svg>`;
  const img=new Image();img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);await img.decode();
  const c=document.createElement("canvas");c.width=232;c.height=196;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,232,196);x.imageSmoothingQuality="high";x.drawImage(img,0,0,232,196);logoPNG=c.toDataURL("image/jpeg",.92);return logoPNG;
}
async function pdfFactura(f){
  if(!window.jspdf)throw new Error("No se ha podido cargar el generador de PDF");
  const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"});
  const W=210,M=16,C1="#1B1D20",CH=[140,110,68],GR=[94,99,106];
  const e=f.estado==="borrador"?(S.emisor||{}):(f.emisor||S.emisor||{});
  const t=f.totales||calcular(f.lineas);const rect=f.tipo==="rectificativa";
  const txt=(s,x,y,o={})=>{doc.setFont("helvetica",o.b?"bold":"normal");doc.setFontSize(o.s||9);doc.setTextColor(...(o.c||[27,29,32]));doc.text(String(s??""),x,y,o.a?{align:o.a,maxWidth:o.w}:(o.w?{maxWidth:o.w}:undefined))};
  const lineasTxt=(s,w,size=9)=>{doc.setFontSize(size);return doc.splitTextToSize(String(s||""),w)};
  let pag=1;
  const cabecera=async()=>{
    doc.addImage(await logo(),"JPEG",M,12,15,12.7,"logo","FAST");
    txt("HUELSAN",M+19,19,{b:1,s:15});txt("AUTOMOCIÓN",M+19.3,24,{s:7.5,c:CH});
    txt(rect?"FACTURA RECTIFICATIVA":"FACTURA",W-M,17,{b:1,s:rect?13:16,a:"right"});
    txt(f.codigo?("Nº "+f.codigo):"BORRADOR",W-M,23.5,{b:1,s:11,a:"right",c:f.codigo?[27,29,32]:[180,35,24]});
    doc.setDrawColor(...CH);doc.setLineWidth(.6);doc.line(M,29,W-M,29);
  };
  const pie=()=>{
    doc.setDrawColor(217,214,208);doc.setLineWidth(.2);doc.line(M,280,W-M,280);
    const ident=[e.razonSocial,e.nif?"NIF "+e.nif:"",[e.domicilio,[e.cp,e.municipio].filter(Boolean).join(" "),e.provincia].filter(Boolean).join(", "),e.registro].filter(Boolean).join(" · ");
    txt(ident,W/2,284,{s:7,c:GR,a:"center",w:W-2*M});
    if(e.textoPie){const l=lineasTxt(e.textoPie,W-2*M,6.3);doc.setFontSize(6.3);doc.setTextColor(...GR);doc.text(l.slice(0,2),W/2,288,{align:"center"})}
    txt(`Página ${pag}`,W-M,294,{s:6.5,c:GR,a:"right"});
    if(f.huella)txt("Huella: "+f.huella,M,294,{s:5.5,c:[150,150,150]});
  };
  const marcaAgua=()=>{if(f.estado!=="borrador")return;doc.saveGraphicsState&&doc.saveGraphicsState();doc.setTextColor(246,228,225);doc.setFont("helvetica","bold");doc.setFontSize(46);doc.text("BORRADOR · SIN VALOR",W/2,170,{align:"center",angle:30});doc.restoreGraphicsState&&doc.restoreGraphicsState()};
  marcaAgua();await cabecera();
  let y=37;
  // fechas
  txt("Fecha de expedición",M,y,{s:7.5,c:GR});txt(fecha(f.fechaExpedicion),M,y+4.5,{b:1,s:10});
  if(f.fechaOperacion&&f.fechaOperacion!==f.fechaExpedicion){txt("Fecha de la operación",M+45,y,{s:7.5,c:GR});txt(fecha(f.fechaOperacion),M+45,y+4.5,{b:1,s:10})}
  if(f.vencimiento){txt("Vencimiento",M+90,y,{s:7.5,c:GR});txt(fecha(f.vencimiento),M+90,y+4.5,{b:1,s:10})}
  y+=12;
  // emisor y cliente
  const bw=(W-2*M-8)/2;
  const bloque=(x,tit,lin)=>{doc.setFillColor(243,242,239);doc.roundedRect(x,y,bw,33,2,2,"F");txt(tit,x+4,y+5.5,{s:7,c:CH,b:1});let yy=y+11;lin.filter(Boolean).forEach((s,i)=>{const l=lineasTxt(s,bw-8,i===0?10:8.5);txt(l[0],x+4,yy,{b:i===0,s:i===0?10:8.5});yy+=i===0?5:4.2})};
  bloque(M,"EMISOR",[e.razonSocial||"—",e.nif?"NIF: "+e.nif:"",e.domicilio,[e.cp,e.municipio,e.provincia].filter(Boolean).join(" "),[e.telefono,e.email].filter(Boolean).join(" · ")]);
  const c=f.cliente||{};
  bloque(M+bw+8,"CLIENTE",[c.nombre||"—",c.nif?(c.tipo==="empresa"||/^[ABCDEFGHJNPQRSUVW]/.test(c.nif)?"CIF: ":"NIF: ")+c.nif:"",c.direccion,[c.cp,c.municipio,c.provincia,c.pais&&!/^espa/i.test(c.pais)?c.pais:""].filter(Boolean).join(" "),[c.telefono,c.email].filter(Boolean).join(" · ")]);
  y+=39;
  // rectificativa
  if(rect&&f.rectifica){doc.setFillColor(254,240,199);const mot=lineasTxt("Motivo: "+(f.rectifica.motivo||""),W-2*M-8,8.5);const h=10+mot.length*4;doc.roundedRect(M,y,W-2*M,h,2,2,"F");
    txt(`Rectifica la factura nº ${f.rectifica.codigo} de ${fecha(f.rectifica.fecha)} · ${({sustitucion:"por sustitución",diferencias:"por diferencias",anulacion:"anulación total"})[f.rectifica.tipo]||""} (art. 15 RD 1619/2012)`,M+4,y+5.5,{b:1,s:8.5});
    doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.text(mot,M+4,y+10);y+=h+5}
  // vehículo
  const v=f.vehiculo||{};
  if(v.marca||v.matricula||v.bastidor){
    doc.setDrawColor(217,214,208);doc.setLineWidth(.3);doc.roundedRect(M,y,W-2*M,17,2,2);
    txt("VEHÍCULO",M+4,y+5,{s:7,c:CH,b:1});txt([v.marca,v.modelo,v.version].filter(Boolean).join(" "),M+24,y+5.2,{b:1,s:10,w:W-2*M-30});
    const datos=[["Matrícula",v.matricula],["Nº bastidor",v.bastidor],["Kilómetros",v.km?miles(String(Math.round(+v.km)))+" km":""],["1ª matriculación",fecha(v.fechaMatric)!=="—"?fecha(v.fechaMatric):""],["Color",v.color]].filter(x=>x[1]);
    const anchos={"Matrícula":26,"Nº bastidor":50,"Kilómetros":30,"1ª matriculación":32,"Color":30};let xx=M+4;
    datos.forEach(([k,val])=>{txt(k,xx,y+10.5,{s:6.8,c:GR});txt(val,xx,y+14.6,{b:1,s:9});xx+=anchos[k]||30});
    y+=22}
  // líneas
  const cols=[{t:"Concepto",x:M+2,w:88},{t:"Cant.",x:M+98,a:"right"},{t:"Precio",x:M+122,a:"right"},{t:"Dto.",x:M+134,a:"right"},{t:"IVA",x:M+149,a:"right"},{t:"Importe",x:W-M-2,a:"right"}];
  const cabTabla=()=>{doc.setFillColor(27,29,32);doc.rect(M,y,W-2*M,7,"F");cols.forEach(cc=>txt(cc.t,cc.x,y+4.8,{s:7.5,b:1,c:[240,239,237],a:cc.a}));y+=10};
  cabTabla();
  for(const l of f.lineas){
    const con=lineasTxt(l.concepto,88,9.2),det=l.detalle?lineasTxt(l.detalle,88,7.8):[];const h=con.length*4.2+det.length*3.6+3;
    if(y+h>232){pie();doc.addPage();pag++;marcaAgua();await cabecera();y=37;cabTabla()}
    doc.setFont("helvetica","bold");doc.setFontSize(9.2);doc.setTextColor(27,29,32);doc.text(con,M+2,y);
    if(det.length){doc.setFont("helvetica","normal");doc.setFontSize(7.8);doc.setTextColor(...GR);doc.text(det,M+2,y+con.length*4.2-0.6)}
    const iva=String(l.iva)==="REBU"?"REBU":(+l.iva===0?"Exento":l.iva+" %");
    txt(String(l.cantidad).replace(".",","),M+98,y,{a:"right",s:9});txt(numES(l.precio),M+122,y,{a:"right",s:9});txt(+l.dto?String(l.dto).replace(".",",")+" %":"",M+134,y,{a:"right",s:9});
    txt(iva,M+149,y,{a:"right",s:8.5});txt(numES(importeLinea(l))+" €",W-M-2,y,{a:"right",s:9,b:1});
    y+=h;doc.setDrawColor(233,231,226);doc.setLineWidth(.2);doc.line(M,y-1.5,W-M,y-1.5);y+=2;
  }
  // totales
  if(y>205){pie();doc.addPage();pag++;marcaAgua();await cabecera();y=40}
  const tx=W-M-72;let ty=y+2;
  const filaT=(k,val,o={})=>{txt(k,tx,ty,{s:o.s||9,b:o.b,c:o.c});txt(val,W-M-2,ty,{a:"right",s:o.s||9,b:o.b,c:o.c});ty+=o.s?7:5};
  for(const g of t.grupos){filaT(`Base imponible (${g.tipo} %)`,numES(g.base)+" €");filaT(`IVA ${g.tipo} %`,numES(g.cuota)+" €")}
  if(t.rebu)filaT("Importe REBU (IVA incluido)",numES(t.rebu)+" €");
  doc.setDrawColor(27,29,32);doc.setLineWidth(.6);doc.line(tx,ty-2.5,W-M,ty-2.5);ty+=2.5;
  filaT("TOTAL FACTURA",numES(t.total)+" €",{b:1,s:12});
  // menciones y pago (columna izquierda)
  let ly=y+2;const lw=tx-M-8;
  const parrafo=(tit,s,size=8)=>{if(!s)return;txt(tit,M,ly,{s:7,c:CH,b:1});ly+=4;const l=lineasTxt(s,lw,size);doc.setFont("helvetica","normal");doc.setFontSize(size);doc.setTextColor(27,29,32);doc.text(l,M,ly);ly+=l.length*size*.42+3};
  if(t.rebu)parrafo("RÉGIMEN DE IVA",TXT_REBU+". La cuota de IVA está incluida en el precio y no se desglosa (art. 138 de la Ley 37/1992 del IVA).");
  if(t.grupos.some(g=>g.tipo===0))parrafo("EXENCIÓN","Operación exenta o no sujeta de IVA.");
  parrafo("FORMA DE PAGO",[f.formaPago,f.iban&&/Transferencia/i.test(f.formaPago||"")?"IBAN "+f.iban:"",f.vencimiento?"Vencimiento "+fecha(f.vencimiento):""].filter(Boolean).join(" · "));
  ly=Math.max(ly,ty+4);
  if(f.observaciones){if(ly>255){pie();doc.addPage();pag++;await cabecera();ly=40}const ow=W-2*M;txt("OBSERVACIONES",M,ly,{s:7,c:CH,b:1});ly+=4;const l=lineasTxt(f.observaciones,ow,8);doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(27,29,32);doc.text(l,M,ly);ly+=l.length*3.4+3}
  if(f.garantia&&!rect){if(ly>258){pie();doc.addPage();pag++;await cabecera();ly=40}const l=lineasTxt(f.garantia,W-2*M,7.3);txt("GARANTÍA Y CONDICIONES",M,ly,{s:7,c:CH,b:1});ly+=4;doc.setFont("helvetica","normal");doc.setFontSize(7.3);doc.setTextColor(...GR);doc.text(l,M,ly);ly+=l.length*3.1+3}
  pie();
  return doc;
}
async function descargarPDF(f){
  const doc=await pdfFactura(f);
  const nombre=(f.codigo?("Factura-"+f.codigo):"Borrador")+(f.cliente&&f.cliente.nombre?"-"+f.cliente.nombre.replace(/[^\wÀ-ÿ ]+/g,"").trim().replace(/\s+/g,"-"):"")+".pdf";
  doc.save(nombre);
  if(f.estado!=="borrador"&&!f.pdfDescargado)try{await S.db.doc("facturas/"+f.id).update({pdfDescargado:new Date().toISOString()});f.pdfDescargado=true}catch(e){}
  if(f.estado!=="borrador"&&!f.entregada&&!f.anulada)toast("PDF descargado. Cuando se lo entregues al cliente, pulsa «Marcar como entregada».",5000);
}
async function zipPDF(anio){
  const fs=emitidas().filter(f=>String(f.fechaExpedicion||"").startsWith(anio));if(!fs.length)throw new Error("No hay facturas emitidas en "+anio);
  if(!window.JSZip)await new Promise((ok,ko)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=ok;s.onerror=()=>ko(new Error("No se ha podido cargar el compresor"));document.head.appendChild(s)});
  const z=new JSZip();let i=0;for(const f of fs){toast(`Generando ${++i}/${fs.length}…`,20000);z.file(`${f.codigo}.pdf`,(await pdfFactura(f)).output("blob"))}
  const a=document.createElement("a");a.href=URL.createObjectURL(await z.generateAsync({type:"blob"}));a.download=`facturas-${anio}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast("ZIP descargado");
}
