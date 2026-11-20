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
const S={db:null,tab:"facturas",emisor:{},facturas:new Map(),clientes:new Map(),gastos:new Map(),docsCoche:new Map(),proveedores:new Map(),cont:new Map(),lotes:[],
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
/* Un gasto puede tener varias líneas: con IVA (General), REBU o sin IVA (exento, suplido, particular). Los gastos antiguos tienen una sola. */
const REG_LINEA=[["General","Con IVA"],["REBU","REBU"],["Exento","Sin IVA (exento / suplido)"]];
const FORMAS_PAGO_GASTO=["Transferencia","Tarjeta","Domiciliación","Efectivo","Bizum","Otro"];
function lineasDe(g){
  if(Array.isArray(g.lineas)&&g.lineas.length)return g.lineas;
  const gen=g.regimen==="General";
  return[{id:"l0",concepto:g.concepto||g.categoria||"",regimen:gen?"General":g.regimen==="REBU"?"REBU":"Exento",base:gen?r2(g.base):r2(g.total),ivaTipo:gen?(+g.ivaTipo||21):0,cuota:gen?r2(g.cuota):0,total:r2(g.total),vehiculo:g.categoria==="Compra del vehículo"}];
}
/* Nombre estándar de los archivos de factura: «YYMMDD - Empresa - Nr Factura - Concepto.ext» (sin caracteres que OneDrive/Windows no admiten) */
const limpiaNombre=t=>String(t||"").replace(/[\\\/:*?"<>|\u0000-\u001f]+/g," ").replace(/\s+/g," ").replace(/[. ]+$/,"").trim();
function nombreEstandar(g,ext,n){
  const f=String(g.fecha||"").replace(/-/g,"").slice(2,8)||"000000";
  const concepto=g.concepto||(g.categoria==="Compra del vehículo"&&g.matricula?"Compra "+g.matricula:g.categoria)||"";
  const partes=[f,g.proveedor,g.numFactura,concepto].map(limpiaNombre).filter(Boolean);
  const base=partes.join(" - ").slice(0,150).replace(/[. ]+$/,"");
  return base+(n>1?" ("+n+")":"")+(ext||".pdf");
}
const extDe=nm=>(String(nm||"").match(/\.[a-z0-9]{2,5}$/i)||[".pdf"])[0].toLowerCase();
const costeLinea=(l,sinF)=>sinF||l.regimen!=="General"?r2(l.total):r2(l.base);
const gastoCoste=g=>r2(lineasDe(g).reduce((s,l)=>s+costeLinea(l,g.sinFactura),0));
const gastoCuota=g=>g.sinFactura?0:r2(lineasDe(g).filter(l=>l.regimen==="General").reduce((s,l)=>s+(+l.cuota||0),0));
const gastoBase=g=>g.sinFactura?0:r2(lineasDe(g).filter(l=>l.regimen==="General").reduce((s,l)=>s+(+l.base||0),0));
const lineaVehiculo=g=>lineasDe(g).find(l=>l.vehiculo)||null;
const costeVehiculo=g=>{const ls=lineasDe(g).filter(l=>l.vehiculo);return ls.length?r2(ls.reduce((s,l)=>s+costeLinea(l,g.sinFactura),0)):gastoCoste(g)};
const regimenVehiculo=g=>((lineaVehiculo(g)||lineasDe(g)[0]||{}).regimen)||"General";
const regimenTexto=g=>{if(g.sinFactura)return"Efectivo sin factura";const r=[...new Set(lineasDe(g).map(l=>l.regimen))];const t=x=>x==="General"?"IVA":x==="REBU"?"REBU":"sin IVA";return r.length>1?"Mixto ("+r.map(t).join(" + ")+")":t(r[0])};

/* ---------- carga ---------- */
(async()=>{
  try{
    S.db=await window.claude.use("db");
    const vigilar=(col,mapa,cb)=>S.db.collection(col).onSnapshot(sn=>{mapa.clear();sn.docs.forEach(d=>mapa.set(d.id,{...d.data(),id:d.id}));cb&&cb();pintarSiProcede(col)},e=>console.error(e));
    vigilar("facturas",S.facturas);vigilar("clientes",S.clientes);vigilar("gastos",S.gastos);vigilar("docscoche",S.docsCoche);vigilar("proveedores",S.proveedores);
    S.db.collection("facturacion").onSnapshot(sn=>{S.cont.clear();let em=null;sn.docs.forEach(d=>{if(d.id==="emisor")em=d.data();else S.cont.set(d.id,d.data())});
      if(em)S.emisor=em;else if(!S.emisorCargado)prellenarEmisor();S.emisorCargado=true;pintarSiProcede("facturacion")});
    await cargarLotes();
    $("#estado-con").textContent="Sincronizado";
    const qs=new URLSearchParams(location.search);
    if(qs.get("nuevoGasto")!=null){S.tab="gastos";const l=S.lotes.find(x=>x.id===qs.get("nuevoGasto"));setTimeout(()=>abrirGasto(null,l?{loteId:l.id,matricula:normMat(l.matricula)}:{}),300)}
    else if(qs.get("subirFactura")){S.tab="matriculas";const[lid,did]=qs.get("subirFactura").split(":");setTimeout(()=>subirFacturaDetalle(lid,did),300)}
    else if(qs.get("gasto")){S.tab="gastos";setTimeout(()=>{if(S.gastos.has(qs.get("gasto")))abrirGasto(qs.get("gasto"))},600)}
    else if(qs.get("lote")){S.tab="facturas";nuevaFactura({loteId:qs.get("lote")})}
    else if(qs.get("factura")){S.tab="facturas";abrirFactura(qs.get("factura"))}
    else if(qs.get("tab"))S.tab=qs.get("tab");
    pintarTabs();pintar();
  }catch(e){$("#vista").innerHTML=`<div class="aviso bad">No se ha podido cargar la facturación: ${esc(e.message)}</div>`}
})();
async function cargarLotes(){
  try{const sn=await S.db.collection("lotes").get(); // copia local de la app
    S.lotes=sn.docs.map(d=>({...d.data(),id:d.id})).filter(l=>["comprado","stock","vendido","pujar","interesante"].includes(l.estado)||l.publico===true)}catch(e){S.lotes=[]}
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
  else if(S.tab==="proveedores")v.innerHTML=vistaProveedores();
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
  if(g)return{iva:regimenVehiculo(g)==="General"?"21":"REBU",fuente:"factura de compra de "+(g.proveedor||"proveedor")};
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
    ${bor&&(f.vehiculo||{}).loteId?`<p class="muted" style="margin:0">Puedes cambiar aquí el precio de venta real: el precio de la web no se toca.</p>`:""}
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
  if(t.dataset.pq!=null){S.pq=t.value;const pos=t.selectionStart;pintar();const n=$("[data-pq]");if(n){n.focus();n.setSelectionRange(pos,pos)}return}
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
  if(t.dataset.rt!=null){S.res.tq=t.value;pintar();return}
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
  const sinArchivo=lista.filter(g=>!g.sinFactura&&!(g.archivos||[]).length).length;
  const app=porMatricula().reduce((s,x)=>s+x.appSinFactura.length,0);
  return`<div class="row sp"><div><h1>Compras y gastos</h1><p class="muted" style="margin:4px 0 0">Cada compra o gasto con su factura (PDF o foto). Al subirla se leen el proveedor, el nº de factura, la fecha y las líneas con IVA y sin IVA (o REBU): revísalas antes de guardar. Los pagos en efectivo sin factura no entran en los libros de IVA, pero sí en el balance del coche.</p></div>
    <button class="btn primary" data-acc="gasto-alta">+ Nueva compra o gasto</button></div>
  ${app?`<div class="aviso">Hay <b>${app}</b> ${app===1?"gasto anotado":"gastos anotados"} en las fichas de los coches sin su factura. Súbelas desde <a href="#" data-ir-tab="matriculas">Por matrícula</a>.</div>`:""}
  ${sinArchivo?`<div class="aviso bad">⚠ Falta subir la factura de ${sinArchivo} ${sinArchivo===1?"gasto":"gastos"} (marcados como «Falta factura»).</div>`:""}
  <div class="row"><label style="max-width:120px">Año<select data-gf="anio">${anios.map(a=>`<option ${a===F.anio?"selected":""}>${a}</option>`).join("")}<option value="" ${!F.anio?"selected":""}>Todos</option></select></label>
    <label style="max-width:260px">Categoría<select data-gf="cat"><option value="">Todas</option>${CATS_GASTO.map(c=>`<option ${c===F.cat?"selected":""}>${c}</option>`).join("")}</select></label>
    <label style="flex:1 1 240px">Buscar<input type="search" data-gf="q" value="${esc(F.q)}" placeholder="Proveedor, concepto, nº factura, matrícula…"></label></div>
  <div class="kpis"><div class="kpi"><b>${eur(tot)}</b><span>total pagado (${lista.length})</span></div><div class="kpi"><b>${eur(coste)}</b><span>coste para los márgenes (sin IVA deducible)</span></div><div class="kpi"><b>${eur(iva)}</b><span>IVA soportado deducible</span></div></div>
  ${lista.length?`<div class="tw"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Concepto</th><th>Coche</th><th>Régimen</th><th class="num">Base con IVA</th><th class="num">IVA</th><th class="num">Total</th><th>Factura</th></tr></thead><tbody>
    ${lista.map(g=>`<tr data-gasto="${esc(g.id)}" style="cursor:pointer"><td>${fecha(g.fecha)}</td><td>${esc(g.proveedor||"—")}<div class="muted">${esc(g.numFactura?(+g.total<0?"Abono ":"Fra. ")+g.numFactura:"")}</div></td>
      <td>${esc(g.categoria||"")}<div class="muted">${esc(g.concepto||"")}</div></td><td>${g.matricula?`<span class="mat">${esc(g.matricula)}</span>`:"—"}</td><td>${esc(regimenTexto(g))}</td>
      <td class="num">${gastoBase(g)?eur(gastoBase(g)):"—"}</td><td class="num">${gastoCuota(g)?eur(gastoCuota(g)):"—"}</td><td class="num">${eur(g.total)}</td>
      <td>${g.sinFactura?`<span class="tag">Efectivo sin factura</span>`:(g.archivos||[]).length?`<span class="tag acc">${g.archivos.length} ${g.archivos.length===1?"archivo":"archivos"}</span>`:`<span class="tag bad">Falta factura</span>`}</td></tr>`).join("")}</tbody></table></div>`
  :`<div class="vacio">${S.gastos.size?"Nada con estos filtros.":"Aún no hay compras ni gastos apuntados."}</div>`}`;
}

/* número escrito en España o con punto decimal → número */
function numES2(v){let s=String(v??"").trim().replace(/[\s€]/g,"");if(!s)return 0;
  if(s.includes(",")&&s.includes("."))s=s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,"");
  else if(s.includes(","))s=s.replace(",",".");
  return +s||0}
function lineaNueva(compra,reg){return{id:nid(),concepto:"",regimen:reg||"General",cantidad:1,precio:"",dto:"",base:"",ivaTipo:21,cuota:"",total:"",vehiculo:!!compra}}
/* Rellena cantidad / precio unitario / descuento de líneas antiguas o leídas de la factura (precio = importe sin IVA ÷ cantidad) */
function completaLinea(l){
  if(l.cantidad==null||l.cantidad==="")l.cantidad=1;
  if(l.dto==null)l.dto="";
  if(l.precio==null||l.precio===""){const n=l.regimen==="General"?numES2(l.base):numES2(l.total),den=(numES2(l.cantidad)||1)*(1-numES2(l.dto)/100);l.precio=n&&den?Math.round(n/den*1e4)/1e4:""}
  return l}
function abrirGasto(id,pre={}){
  const g=id?JSON.parse(JSON.stringify(S.gastos.get(id))):{fecha:hoyISO(),categoria:"Transporte y portes",archivos:[],pagado:true,formaPago:"Transferencia",...pre};
  if(!Array.isArray(g.lineas)||!g.lineas.length)g.lineas=id?lineasDe(g).map(l=>({...l})):(pre.lineas||[lineaNueva(g.categoria==="Compra del vehículo")]);
  g.lineas.forEach(l=>{l.id=l.id||nid();completaLinea(l)});
  const nuevos=[];const borrados=[];let lectura=null,leyendo=false;
  const f=$("#f-gasto");
  const provs=()=>[...S.proveedores.values()].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es"));
  const totales=()=>{let base=0,cuota=0,total=0,sinIva=0;for(const l of g.lineas){const t=numES2(l.total);total+=t;if(l.regimen==="General"){base+=numES2(l.base);cuota+=numES2(l.cuota)}else sinIva+=t}return{base:r2(base),cuota:r2(cuota),total:r2(total),sinIva:r2(sinIva)}};
  const pintarTot=()=>{const t=totales(),n=f.querySelector("#g-tot");if(n)n.innerHTML=`<div><span>Base con IVA</span><span>${eur(t.base)}</span></div><div><span>Cuota IVA</span><span>${eur(t.cuota)}</span></div>${t.sinIva?`<div><span>Sin IVA / REBU</span><span>${eur(t.sinIva)}</span></div>`:""}<div class="t"><span>TOTAL</span><span>${eur(t.total)}</span></div>${t.total<0?`<div class="muted" style="grid-column:1/-1">Nota de crédito / devolución: resta del coste del coche y del IVA soportado.</div>`:""}`};
  const pintarF=()=>{
    const compra=g.categoria==="Compra del vehículo";
    const archivos=[...(g.archivos||[]),...nuevos.map(n=>({nombre:n.name,nuevo:true,size:n.size}))];
    f.innerHTML=`<h2>${id?"Editar":"Nueva"} compra o gasto</h2>
      <div class="card" style="background:var(--bg)"><div class="row sp"><b>Factura (PDF o foto)</b><label class="btn sm primary" style="display:inline-flex">${leyendo?"Leyendo la factura…":archivos.length?"Subir otro archivo":"Subir la factura y leerla"}<input type="file" id="g-files" accept="application/pdf,image/*" multiple hidden></label></div>
        <div class="files">${archivos.map((a,i)=>`<div><span>${esc(a.nombre)} <span class="muted">${a.size?Math.round(a.size/1024)+" KB":""}${a.nuevo?" · se subirá al guardar":""}</span></span><span class="row">${a.ruta?`<button type="button" class="btn sm" data-g-ver="${esc(a.ruta)}" data-nombre="${esc(a.nombre)}">Ver</button><button type="button" class="btn sm" data-g-leerruta="${esc(a.ruta)}" data-nombre="${esc(a.nombre)}">Leer</button>`:""}${!a.ruta&&a.nuevo?`<button type="button" class="btn sm" data-g-leer="${i-(g.archivos||[]).length}">Leer otra vez</button>`:""}<button type="button" class="btn sm" data-g-desc="${i}" title="Descargar con el nombre actual (para guardarlo donde quieras)">Descargar</button><button type="button" class="btn sm" data-g-ren="${i}" title="Cambiar el nombre del archivo">Renombrar</button><button type="button" class="btn sm" data-g-std="${i}" title="${esc(nombreEstandar(g,extDe(a.nombre),1))}">Nombre estándar</button><button type="button" class="btn sm" data-g-quitar="${i}">Quitar</button></span></div>`).join("")||`<span class="muted">${g.sinFactura?"Pago en efectivo sin factura.":"⚠ Falta la factura. Puedes guardar el gasto y subirla después: quedará marcado como pendiente."}</span>`}</div>
        ${lectura?`<div class="aviso ${lectura.ok?"ok":""}">${lectura.msg}</div>`:""}
        <label class="row" style="flex-direction:row;color:var(--ink);font-weight:500"><input type="checkbox" id="g-sinf" ${g.sinFactura?"checked":""} style="width:auto"> Pago en efectivo sin factura <small class="muted">— no entra en los libros de IVA; sí en el balance del coche (por el total)</small></label></div>
      <div class="g3"><label>Proveedor guardado<select id="g-prov"><option value="">— Elegir —</option>${provs().map(p=>`<option value="${esc(p.id)}" ${g.proveedorId===p.id?"selected":""}>${esc(p.nombre)}${p.nif?" · "+esc(p.nif):""}</option>`).join("")}</select></label>
        <label>Proveedor (nombre)<input data-g="proveedor" value="${esc(g.proveedor||"")}"></label>
        <label>NIF del proveedor<input data-g="nifProveedor" value="${esc(g.nifProveedor||"")}"></label></div>
      <div class="g4"><label>Nº de factura<input data-g="numFactura" value="${esc(g.numFactura||"")}"></label>
        <label>Fecha de la factura<input type="date" data-g="fecha" value="${esc(g.fecha||"")}"></label>
        <label>Categoría<select data-g="categoria">${CATS_GASTO.map(c=>`<option ${c===g.categoria?"selected":""}>${c}</option>`).join("")}</select></label>
        <label>Forma de pago<select data-g="formaPago">${FORMAS_PAGO_GASTO.map(c=>`<option ${c===(g.formaPago||"Transferencia")?"selected":""}>${c}</option>`).join("")}</select></label></div>
      <div class="g4"><label>Coche<select data-g="loteId"><option value="">— Sin coche / gasto general —</option>${S.lotes.filter(l=>["comprado","stock","vendido"].includes(l.estado)||l.id===g.loteId).map(l=>`<option value="${esc(l.id)}" ${l.id===g.loteId?"selected":""}>${esc(l.matricula||"sin matrícula")} · ${esc([l.marca,l.modelo].filter(Boolean).join(" "))}</option>`).join("")}</select></label>
        <label>Matrícula <small>si el coche no está en la app</small><input data-g="matricula" value="${esc(g.matricula||"")}" style="text-transform:uppercase"></label>
        <label>Factura original <small>(si es una nota de crédito)</small><input data-g="rectificaNum" value="${esc(g.rectificaNum||"")}" placeholder="Nº de la factura que se devuelve"></label>
        <label>Concepto general<input data-g="concepto" value="${esc(g.concepto||"")}" placeholder="Ej.: adjudicación BCA, transporte…"></label></div>
      <div class="card"><div class="row sp"><b>Líneas de la factura</b><span class="row"><button type="button" class="btn sm" data-g-linea="General">+ Con IVA</button><button type="button" class="btn sm" data-g-linea="Exento">+ Sin IVA</button><button type="button" class="btn sm" data-g-linea="REBU">+ REBU</button></span></div>
        <div class="tw"><table class="lineas" style="min-width:900px"><thead><tr><th>Concepto</th><th style="width:140px">Tipo</th><th class="num" style="width:58px">Cant.</th><th class="num" style="width:90px" title="Precio unitario sin IVA">Precio ud.</th><th class="num" style="width:62px" title="Descuento de la línea">Dto. %</th><th class="num" style="width:100px">Base</th><th class="num" style="width:62px">IVA %</th><th class="num" style="width:95px">Cuota</th><th class="num" style="width:105px">Total</th>${compra?`<th style="width:70px" title="Marca la línea del precio del coche">Coche</th>`:""}<th></th></tr></thead><tbody>
        ${g.lineas.map((l,i)=>{const gen=l.regimen==="General";return`<tr><td><input data-gl="${i}:concepto" value="${esc(l.concepto||"")}" placeholder="${compra&&l.vehiculo?"Precio del vehículo":"Concepto"}"></td>
          <td><select data-gl="${i}:regimen">${REG_LINEA.map(([k,v])=>`<option value="${k}" ${k===l.regimen?"selected":""}>${v}</option>`).join("")}</select></td>
          <td><input data-gl="${i}:cantidad" class="num" inputmode="decimal" value="${esc(l.cantidad)}"></td>
          <td><input data-gl="${i}:precio" class="num" inputmode="decimal" value="${esc(l.precio)}"></td>
          <td><input data-gl="${i}:dto" class="num" inputmode="decimal" value="${esc(l.dto)}" placeholder="0"></td>
          <td><input data-gl="${i}:base" class="num" inputmode="decimal" value="${esc(gen?l.base:"")}" ${gen?"":"disabled"}></td>
          <td><input data-gl="${i}:ivaTipo" class="num" inputmode="decimal" value="${esc(gen?l.ivaTipo:"")}" ${gen?"":"disabled"}></td>
          <td><input data-gl="${i}:cuota" class="num" inputmode="decimal" value="${esc(gen?l.cuota:"")}" ${gen?"":"disabled"}></td>
          <td><input data-gl="${i}:total" class="num" inputmode="decimal" value="${esc(l.total)}"></td>
          ${compra?`<td style="text-align:center"><input type="checkbox" data-gl="${i}:vehiculo" ${l.vehiculo?"checked":""} style="width:auto"></td>`:""}
          <td>${g.lineas.length>1?`<button type="button" class="btn sm" data-g-qlinea="${i}" aria-label="Quitar línea">✕</button>`:""}</td></tr>`}).join("")}</tbody></table></div>
        <div class="totales" id="g-tot"></div>
        <p class="muted" style="margin:0">${compra?"Marca «Coche» en la línea del precio del vehículo: su tipo (con IVA o REBU) decide el régimen de la venta. Las demás líneas (comisiones, transporte, tasas…) suman al coche como gastos. ":""}Con IVA: escribe la base o el total y se calcula el resto; al coche suma la base (el IVA se deduce). Sin IVA o REBU: suma el total.</p></div>
      <label class="row" style="flex-direction:row;color:var(--ink);font-weight:500"><input type="checkbox" id="g-pagado" ${g.pagado!==false?"checked":""} style="width:auto"> Pagada</label>
      <div class="row"><span style="flex:1">${id?`<button class="btn peligro" value="borrar" formnovalidate>Borrar</button>`:""}</span><button class="btn" value="cancelar" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`;
    pintarTot();
  };
  const calcLinea=(i,campo)=>{const l=g.lineas[i];const row=f.querySelectorAll(".lineas tbody tr")[i];const set=(k,v)=>{l[k]=v;const n=row&&row.querySelector(`[data-gl="${i}:${k}"]`);if(n)n.value=v};
    const gen=l.regimen==="General";
    const den=(l.cantidad===""||l.cantidad==null?1:numES2(l.cantidad))*(1-numES2(l.dto)/100);
    const syncPrecio=()=>{const n=gen?numES2(l.base):numES2(l.total);if(den)set("precio",n?Math.round(n/den*1e4)/1e4:"")};
    if(campo==="cantidad"||campo==="precio"||campo==="dto"){ // importe = cantidad × precio × (1 − dto %)
      if(l.precio===""||l.precio==null)return;
      const n=r2(numES2(l.precio)*den);
      if(gen){const c=r2(n*numES2(l.ivaTipo)/100);set("base",n);set("cuota",c);set("total",r2(n+c))}else{set("total",n);l.base=n;l.cuota=0}
      return}
    if(!gen){l.base=l.total;l.cuota=0;syncPrecio();return}
    const b=numES2(l.base),p=numES2(l.ivaTipo),t=numES2(l.total);
    if(campo==="base"||campo==="ivaTipo"){if(l.base==="")return;const c=r2(b*p/100);set("cuota",c);set("total",r2(b+c))}
    else if(campo==="total"){if(l.total==="")return;const bb=r2(t/(1+p/100));set("base",bb);set("cuota",r2(t-bb))}
    else if(campo==="cuota"){set("total",r2(b+numES2(l.cuota)))}
    syncPrecio()};
  f.oninput=e=>{const t=e.target;
    if(t.dataset.g){g[t.dataset.g]=t.value;return}
    if(t.dataset.gl){const[i,k]=t.dataset.gl.split(":");if(k==="vehiculo"){g.lineas[+i].vehiculo=t.checked;return}if(k==="regimen")return;g.lineas[+i][k]=t.value;calcLinea(+i,k);pintarTot()}};
  f.onchange=e=>{const t=e.target;
    if(t.id==="g-files"){const fs=[...t.files];t.value="";let primero=null;
      for(const fi of fs){if(fi.size>15e6){toast(fi.name+": máximo 15 MB");continue}nuevos.push(fi);if(!primero)primero=fi}
      if(primero){g.sinFactura=false;leer(primero,false)}else pintarF();return}
    if(t.id==="g-sinf"){g.sinFactura=t.checked;if(t.checked)g.formaPago="Efectivo";pintarF();return}
    if(t.id==="g-pagado"){g.pagado=t.checked;return}
    if(t.id==="g-prov"){const p=S.proveedores.get(t.value);g.proveedorId=p?p.id:"";if(p){g.proveedor=p.nombre;g.nifProveedor=p.nif||"";if(p.categoria&&!id)g.categoria=p.categoria;if(p.formaPago&&!id)g.formaPago=p.formaPago;
      if(p.regimen&&!id&&g.lineas.length===1&&!numES2(g.lineas[0].total))g.lineas[0].regimen=p.regimen}pintarF();return}
    if(t.dataset.g==="categoria"){g.categoria=t.value;if(g.categoria==="Compra del vehículo"&&!g.lineas.some(l=>l.vehiculo)){const mx=g.lineas.reduce((a,l)=>numES2(l.total)>numES2(a.total)?l:a,g.lineas[0]);if(mx)mx.vehiculo=true}pintarF();return}
    if(t.dataset.g==="loteId"){g.loteId=t.value;const l=S.lotes.find(x=>x.id===t.value);if(l)g.matricula=normMat(l.matricula);pintarF();return}
    if(t.dataset.gl&&t.dataset.gl.endsWith(":regimen")){const i=+t.dataset.gl.split(":")[0],l=g.lineas[i];l.regimen=t.value;if(l.regimen==="General"){l.ivaTipo=l.ivaTipo||21;l.base="";calcLinea(i,"total")}else{l.base=l.total;l.cuota=0;l.ivaTipo=0;calcLinea(i,"total")}pintarF()}};
  f.onclick=async e=>{const t=e.target;
    const ver=t.closest("[data-g-ver]");if(ver){e.preventDefault();verArchivo(ver.dataset.gVer,ver.dataset.nombre);return}
    const ds=t.closest("[data-g-desc]");if(ds){e.preventDefault();const i=+ds.dataset.gDesc,n=(g.archivos||[]).length;
      try{const a=i<n?g.archivos[i]:null;const b=a?await HUELSAN.bajar("documentos",a.ruta):nuevos[i-n];descargarBlob(b,a?a.nombre:nuevos[i-n].name)}catch(err){toast(err.message,6000)}return}
    const rn=t.closest("[data-g-ren],[data-g-std]");if(rn){e.preventDefault();
      const est=rn.dataset.gStd!=null,i=+(est?rn.dataset.gStd:rn.dataset.gRen),n=(g.archivos||[]).length,a=i<n?g.archivos[i]:null,fi=i>=n?nuevos[i-n]:null,actual=a?a.nombre:fi.name;
      let nuevo=est?nombreEstandar(g,extDe(actual),i+1>1?i+1:1):window.prompt("Nuevo nombre del archivo:",actual);
      if(est&&(g.archivos||[]).length+nuevos.length===1)nuevo=nombreEstandar(g,extDe(actual),1);
      if(!nuevo||nuevo===actual)return;nuevo=limpiaNombre(nuevo.replace(/\.[a-z0-9]{2,5}$/i,""))+extDe(nuevo.match(/\.[a-z0-9]{2,5}$/i)?nuevo:actual);
      if(a)a.nombre=nuevo;else nuevos[i-n]=new File([fi],nuevo,{type:fi.type});
      toast("Archivo renombrado: "+nuevo+(a?" (se guarda al pulsar Guardar)":""),4500);pintarF();return}
    const q=t.closest("[data-g-quitar]");if(q){e.preventDefault();const i=+q.dataset.gQuitar,n=(g.archivos||[]).length;if(i<n)borrados.push(...g.archivos.splice(i,1));else nuevos.splice(i-n,1);pintarF();return}
    const lr=t.closest("[data-g-leerruta]");if(lr){e.preventDefault();try{const b=await HUELSAN.bajar("documentos",lr.dataset.gLeerruta);const nm=lr.dataset.nombre||"factura.pdf";leer(new File([b],nm,{type:b.type||(/\.pdf$/i.test(nm)?"application/pdf":"image/jpeg")}),true)}catch(err){toast(err.message,6000)}return}
    const rl=t.closest("[data-g-leer]");if(rl){e.preventDefault();const fi=nuevos[+rl.dataset.gLeer];if(fi)leer(fi,true);return}
    const nl=t.closest("[data-g-linea]");if(nl){e.preventDefault();g.lineas.push(lineaNueva(false,nl.dataset.gLinea));pintarF();return}
    const ql=t.closest("[data-g-qlinea]");if(ql){e.preventDefault();g.lineas.splice(+ql.dataset.gQlinea,1);pintarF();return}};
  const leer=async(fi,forzar)=>{
    if(!window.HuelsanLector){lectura={ok:false,msg:"El lector de facturas no está disponible: rellena los datos a mano."};pintarF();return}
    const vacio=!numES2(totales().total);if(!vacio&&!forzar){lectura={ok:true,msg:"Archivo añadido. Los datos ya estaban rellenos: pulsa «Leer otra vez» si quieres coger los de este archivo."};pintarF();return}
    leyendo=true;pintarF();
    try{const r=await window.HuelsanLector.leer(fi,{nifPropio:(S.emisor||{}).nif||"",proveedores:provs()});
      const cambios=[];
      if(r.proveedorId&&S.proveedores.has(r.proveedorId)){const p=S.proveedores.get(r.proveedorId);g.proveedorId=p.id;g.proveedor=p.nombre;g.nifProveedor=p.nif||r.nif||"";if(p.categoria&&!id)g.categoria=p.categoria;cambios.push("proveedor")}
      else{if(r.proveedor){g.proveedor=r.proveedor;cambios.push("proveedor")}if(r.nif){g.nifProveedor=r.nif;cambios.push("NIF")}}
      if(r.numFactura){g.numFactura=r.numFactura;cambios.push("nº de factura")}
      if(r.fecha){g.fecha=r.fecha;cambios.push("fecha")}
      if(r.compraVehiculo&&!id)g.categoria="Compra del vehículo";
      if(r.matricula&&!g.loteId){const l=S.lotes.find(x=>normMat(x.matricula)===r.matricula);if(l){g.loteId=l.id;g.matricula=r.matricula;cambios.push("coche "+r.matricula)}else{g.matricula=r.matricula;cambios.push("matrícula")}}
      if(r.lineas&&r.lineas.length){g.lineas=r.lineas.map(l=>completaLinea({...lineaNueva(false),...l,id:nid(),vehiculo:g.categoria==="Compra del vehículo"&&!!l.vehiculo}));
        if(g.categoria==="Compra del vehículo"&&!g.lineas.some(l=>l.vehiculo)){const mx=g.lineas.reduce((a,l)=>numES2(l.total)>numES2(a.total)?l:a,g.lineas[0]);mx.vehiculo=true}cambios.push(g.lineas.length+(g.lineas.length===1?" línea":" líneas"))}
      const cuadra=r.total&&Math.abs(totales().total-r.total)<0.05;
      lectura={ok:cambios.length>0,msg:cambios.length?`Leído de la factura: ${esc(cambios.join(", "))}.${r.total?` Total de la factura: <b>${eur(r.total)}</b>${cuadra?" (cuadra con las líneas)":" — <b>no cuadra con las líneas: revísalas</b>"}.`:""} Revisa todo antes de guardar.`:"No he podido leer datos de este archivo: rellénalos a mano."};
    }catch(err){lectura={ok:false,msg:"No se ha podido leer la factura ("+esc(err.message||err)+"). Rellena los datos a mano."}}
    leyendo=false;pintarF();
  };
  pintarF();
  f.onsubmit=e=>{if(!e.submitter||e.submitter.value!=="ok")return;const err=validar();if(err){e.preventDefault();toast(err,6000)}};
  const validar=()=>{
    if(!String(g.proveedor||"").trim())return"Falta el proveedor";
    if(!g.fecha)return"Falta la fecha de la factura";
    if(!totales().total)return"Falta el importe en las líneas (en una nota de crédito o devolución, escríbelo en negativo)";
    return"";
  };
  const d=$("#dlg-gasto");d.returnValue="";d.showModal();
  d.onclose=async()=>{
    try{
      if(d.returnValue==="borrar"){if(!confirm("¿Borrar este gasto y sus archivos?"))return;
        for(const a of g.archivos||[])await HUELSAN.borrarArchivo("documentos",a.ruta).catch(()=>{});
        await S.db.doc("gastos/"+id).delete();await sincronizarLote({...S.gastos.get(id)||g,id,_borrar:true});toast("Gasto borrado");return}
      if(d.returnValue!=="ok")return;
      const compra=g.categoria==="Compra del vehículo";
      const ls=g.lineas.map(l=>{const reg=l.regimen;let base=numES2(l.base),iva=reg==="General"?numES2(l.ivaTipo):0,tot=numES2(l.total),cu=numES2(l.cuota);
        if(reg==="General"){if(!base&&tot)base=r2(tot/(1+iva/100));if(!cu&&base)cu=r2(base*iva/100);if(!tot)tot=r2(base+cu)}else{base=tot;cu=0}
        return{id:l.id||nid(),concepto:String(l.concepto||"").trim(),regimen:reg,cantidad:numES2(l.cantidad)||1,precio:Math.round(numES2(l.precio)*1e4)/1e4,dto:numES2(l.dto),base:r2(base),ivaTipo:iva,cuota:r2(cu),total:r2(tot),vehiculo:compra&&!!l.vehiculo}}).filter(l=>l.total);
      if(compra&&!ls.some(l=>l.vehiculo)){const mx=ls.reduce((a,l)=>l.total>a.total?l:a,ls[0]);mx.vehiculo=true}
      const regs=[...new Set(ls.map(l=>l.regimen))];
      const dato={fecha:g.fecha,categoria:g.categoria,proveedor:String(g.proveedor||"").trim(),proveedorId:g.proveedorId||"",nifProveedor:nifLimpio(g.nifProveedor),numFactura:String(g.numFactura||"").trim(),concepto:String(g.concepto||"").trim(),
        loteId:g.loteId||"",matricula:normMat(g.matricula),pagado:g.pagado!==false,formaPago:g.formaPago||"Transferencia",sinFactura:!!g.sinFactura,lineas:ls,
        total:r2(ls.reduce((s,l)=>s+l.total,0)),base:r2(ls.filter(l=>l.regimen==="General").reduce((s,l)=>s+l.base,0)),cuota:r2(ls.filter(l=>l.regimen==="General").reduce((s,l)=>s+l.cuota,0)),
        abono:r2(ls.reduce((s,l)=>s+l.total,0))<0,rectificaNum:String(g.rectificaNum||"").trim(),regimen:g.sinFactura?"SinFactura":regs.length===1?(regs[0]==="Exento"?"Exento":regs[0]):"Mixto",ivaTipo:(ls.find(l=>l.regimen==="General")||{}).ivaTipo||0,
        archivos:[...(g.archivos||[])],actualizado:new Date().toISOString()};
      if(g.detalleOrigen)dato.detalleOrigen=g.detalleOrigen;
      if(!dato.matricula&&dato.loteId){const l=S.lotes.find(x=>x.id===dato.loteId);if(l)dato.matricula=normMat(l.matricula)}
      toast(nuevos.length?"Subiendo archivos…":"Guardando…",20000);
      for(const fi of nuevos){const r=await HUELSAN.subir("documentos",fi);dato.archivos.push({ruta:r.id,nombre:fi.name,tipo:fi.type,size:fi.size,subido:new Date().toISOString()})}
      for(const a of borrados)await HUELSAN.borrarArchivo("documentos",a.ruta).catch(()=>{});
      dato.proveedorId=await guardarProveedorDesdeGasto(dato).catch(()=>dato.proveedorId)||dato.proveedorId;
      const gid=id||nid();if(!id)dato.creado=new Date().toISOString();
      await S.db.doc("gastos/"+gid).set(dato);
      if(id&&g.loteId!==(S.gastos.get(id)||{}).loteId){const ant=S.gastos.get(id);if(ant&&ant.loteId)await sincronizarLote({...ant,id:gid,_borrar:true})}
      await sincronizarLote({...dato,id:gid});
      toast(!dato.sinFactura&&!dato.archivos.length?"Guardado. ⚠ Falta subir la factura: queda marcado como pendiente.":"Guardado",!dato.sinFactura&&!dato.archivos.length?6000:3200);
    }catch(err){toast(err.message,6000)}
  };
}
/* Gasto anotado en la ficha del coche (app) → se sube su factura y pasa a ser un gasto con factura */
function subirFacturaDetalle(loteId,detId){
  const l=S.lotes.find(x=>x.id===loteId);const gd=l&&(l.gastosDetalle||[]).find(x=>x.id===detId);
  if(!gd){toast("No encuentro ese gasto en la ficha del coche");return}
  const cat=CATS_GASTO.includes(gd.categoria)?gd.categoria:"Otros";
  abrirGasto(null,{categoria:cat,concepto:gd.concepto||"",fecha:gd.fecha||hoyISO(),loteId:l.id,matricula:normMat(l.matricula),detalleOrigen:{loteId:l.id,id:gd.id},
    lineas:[{id:nid(),concepto:gd.concepto||cat,regimen:"General",base:r2(+gd.importe/1.21),ivaTipo:21,cuota:r2(+gd.importe-r2(+gd.importe/1.21)),total:r2(+gd.importe),vehiculo:false}]});
}
/* Gasto de la ficha sin factura: eliminarlo, o marcarlo como pago en efectivo sin factura (pasa a ser un gasto «sin factura» en contabilidad) */
const detallesDe=l=>Array.isArray(l.gastosDetalle)?l.gastosDetalle:(+l.gastos>0?[{id:"g0",fecha:null,categoria:"Otros",concepto:"Gastos anotados antes del desglose",importe:+l.gastos}]:[]);
async function eliminarDetalle(loteId,detId){
  const l=S.lotes.find(x=>x.id===loteId);const gd=l&&detallesDe(l).find(x=>x.id===detId);
  if(!gd){toast("No encuentro ese gasto en la ficha del coche");return}
  if(!await confirmar("¿Eliminar este gasto?",`Se quitará de la ficha del coche: ${gd.categoria||"Otros"}${gd.concepto?" · "+gd.concepto:""} (${eur(gd.importe)}). Dejará de contar en el coste del coche.`,"Sí, eliminar"))return;
  try{const det=detallesDe(l).filter(x=>x.id!==detId);const patch={gastosDetalle:det,gastos:r2(det.reduce((s,x)=>s+(+x.importe||0),0))};
    await S.db.doc("lotes/"+loteId).update(patch);Object.assign(l,patch);toast("Gasto eliminado");pintar()}catch(err){toast("No se ha podido eliminar: "+err.message,6000)}
}
async function marcarDetalleSinFactura(loteId,detId){
  const l=S.lotes.find(x=>x.id===loteId);const gd=l&&detallesDe(l).find(x=>x.id===detId);
  if(!gd){toast("No encuentro ese gasto en la ficha del coche");return}
  if(!await confirmar("¿Marcar como pago en efectivo sin factura?",`${gd.categoria||"Otros"}${gd.concepto?" · "+gd.concepto:""} (${eur(gd.importe)}). Quedará fuera de los libros de IVA y contará por el total en el coste del coche.`,"Sí, sin factura"))return;
  try{const cat=CATS_GASTO.includes(gd.categoria)?gd.categoria:"Otros",tot=r2(+gd.importe||0),id=nid();
    const dato={fecha:gd.fecha||hoyISO(),categoria:cat,proveedor:"",proveedorId:"",nifProveedor:"",numFactura:"",concepto:String(gd.concepto||"").trim(),loteId:l.id,matricula:normMat(l.matricula),pagado:true,formaPago:"Efectivo",sinFactura:true,
      lineas:[{id:nid(),concepto:gd.concepto||cat,regimen:"Exento",base:tot,ivaTipo:0,cuota:0,total:tot,vehiculo:false}],total:tot,base:0,cuota:0,regimen:"SinFactura",ivaTipo:0,archivos:[],detalleOrigen:{loteId:l.id,id:gd.id},creado:new Date().toISOString(),actualizado:new Date().toISOString()};
    await S.db.doc("gastos/"+id).set(dato);await sincronizarLote({...dato,id});toast("Marcado como pago en efectivo sin factura");pintar()}catch(err){toast("No se ha podido marcar: "+err.message,6000)}
}
// El gasto se refleja en la ficha del coche (gastos y precio de compra), sin duplicar
async function sincronizarLote(g){
  if(!g.loteId)return;
  try{const sn=await S.db.doc("lotes/"+g.loteId).get();if(!sn.exists)return;const l=sn.data();
    const origen=g.detalleOrigen&&g.detalleOrigen.loteId===g.loteId?g.detalleOrigen.id:null;
    const det=(Array.isArray(l.gastosDetalle)?l.gastosDetalle:(+l.gastos>0?[{id:"g0",fecha:null,categoria:"Otros",concepto:"Gastos anotados antes del desglose",importe:+l.gastos}]:[])).filter(x=>x.gastoId!==g.id&&!(origen&&x.id===origen));
    const patch={};
    if(g.categoria==="Compra del vehículo"){
      const cv=costeVehiculo(g),resto=r2(gastoCoste(g)-cv);
      if(g._borrar){if(l.precioCompraGasto===g.id){patch.precioCompra=l.precioCompraAnterior||null;patch.precioCompraGasto=null}}
      else{ // la factura de compra manda: el precio de compra del coche pasa a ser el de la línea del vehículo
        if(l.precioCompra&&l.precioCompraGasto!==g.id&&r2(l.precioCompra)!==cv){patch.precioCompraAnterior=l.precioCompra;toast(`Precio de compra del coche actualizado de ${eur(l.precioCompra)} a ${eur(cv)} (el de la factura).`,6000)}
        patch.precioCompra=cv;patch.precioCompraGasto=g.id;
        patch.iva=regimenVehiculo(g)==="General"?"General":"REBU"; // la venta irá en el mismo régimen
        if(resto>0)det.push({id:"f-"+g.id,gastoId:g.id,fecha:g.fecha,categoria:"Comisiones de compra",concepto:[g.proveedor,"otros conceptos de la factura de compra"].filter(Boolean).join(" · "),importe:resto})}
    }else if(!g._borrar)det.push({id:"f-"+g.id,gastoId:g.id,fecha:g.fecha,categoria:g.categoria,concepto:[g.proveedor,g.concepto].filter(Boolean).join(" · "),importe:gastoCoste(g),sinFactura:!!g.sinFactura});
    patch.gastosDetalle=det;patch.gastos=r2(det.reduce((s,x)=>s+(+x.importe||0),0));
    await S.db.doc("lotes/"+g.loteId).update(patch);
    const lc=S.lotes.find(x=>x.id===g.loteId);if(lc)Object.assign(lc,patch);
  }catch(e){toast("Guardado, pero no se ha podido actualizar la ficha del coche: "+e.message,6000)}
}

/* ======================================================================
   PROVEEDORES
   ====================================================================== */
function vistaProveedores(){
  const q=String(S.pq||"").toLowerCase();
  const ls=[...S.proveedores.values()].filter(p=>!q||[p.nombre,p.nif,p.municipio].join(" ").toLowerCase().includes(q)).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),"es"));
  const usos=id=>[...S.gastos.values()].filter(g=>g.proveedorId===id);
  const sinFicha=[...new Map([...S.gastos.values()].filter(g=>g.proveedor&&!g.proveedorId&&![...S.proveedores.values()].some(p=>(p.nif&&nifLimpio(p.nif)===nifLimpio(g.nifProveedor))||String(p.nombre).toLowerCase()===String(g.proveedor).toLowerCase())).map(g=>[g.proveedor.toLowerCase(),g])).values()];
  return`<div class="row sp"><div><h1>Proveedores</h1><p class="muted" style="margin:4px 0 0">Al elegir un proveedor en una compra o gasto se rellenan su NIF, la categoría, el régimen y la forma de pago habituales. Los proveedores nuevos se guardan solos al guardar un gasto.</p></div>
    <span class="row">${sinFicha.length?`<button class="btn" data-acc="prov-importar">Crear ${sinFicha.length} desde los gastos</button>`:""}<button class="btn primary" data-acc="prov-alta">+ Nuevo proveedor</button></span></div>
  <label>Buscar<input type="search" data-pq value="${esc(S.pq||"")}" placeholder="Nombre, NIF o municipio"></label>
  ${ls.length?`<div class="tw"><table><thead><tr><th>Proveedor</th><th>NIF</th><th>Categoría habitual</th><th>Régimen</th><th>Forma de pago</th><th class="num">Gastos</th><th class="num">Total</th></tr></thead><tbody>
    ${ls.map(p=>{const u=usos(p.id);return`<tr data-prov="${esc(p.id)}" style="cursor:pointer"><td><b>${esc(p.nombre)}</b><div class="muted">${esc([p.municipio,p.telefono,p.email].filter(Boolean).join(" · "))}</div></td><td>${esc(p.nif||"—")}</td><td>${esc(p.categoria||"—")}</td><td>${esc((REG_LINEA.find(x=>x[0]===p.regimen)||[0,"—"])[1])}</td><td>${esc(p.formaPago||"—")}</td><td class="num">${u.length}</td><td class="num">${eur(u.reduce((s,g)=>s+(+g.total||0),0))}</td></tr>`}).join("")}</tbody></table></div>`
  :`<div class="vacio">Aún no hay proveedores guardados.</div>`}`;
}
function abrirProveedor(id){
  const p=id?{...S.proveedores.get(id)}:{nombre:"",nif:"",categoria:"",regimen:"General",formaPago:"Transferencia"};
  let d=$("#dlg-proveedor");if(!d){d=document.createElement("dialog");d.id="dlg-proveedor";d.innerHTML=`<form method="dialog" id="f-proveedor" autocomplete="off"></form>`;document.body.appendChild(d)}
  const f=$("#f-proveedor");
  f.innerHTML=`<h2>${id?"Editar":"Nuevo"} proveedor</h2>
    <div class="g2"><label>Nombre o razón social<input name="nombre" value="${esc(p.nombre||"")}" required></label><label>NIF / CIF<input name="nif" value="${esc(p.nif||"")}"></label></div>
    <label>Dirección<input name="direccion" value="${esc(p.direccion||"")}"></label>
    <div class="g3"><label>C. P.<input name="cp" value="${esc(p.cp||"")}"></label><label>Municipio<input name="municipio" value="${esc(p.municipio||"")}"></label><label>Provincia<input name="provincia" value="${esc(p.provincia||"")}"></label></div>
    <div class="g3"><label>Teléfono<input name="telefono" value="${esc(p.telefono||"")}"></label><label>Correo<input name="email" value="${esc(p.email||"")}"></label><label>IBAN<input name="iban" value="${esc(p.iban||"")}"></label></div>
    <div class="g3"><label>Categoría habitual<select name="categoria"><option value="">—</option>${CATS_GASTO.map(c=>`<option ${c===p.categoria?"selected":""}>${c}</option>`).join("")}</select></label>
      <label>Régimen habitual<select name="regimen">${REG_LINEA.map(([k,v])=>`<option value="${k}" ${k===p.regimen?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>Forma de pago habitual<select name="formaPago">${FORMAS_PAGO_GASTO.map(c=>`<option ${c===p.formaPago?"selected":""}>${c}</option>`).join("")}</select></label></div>
    <label>Palabras del extracto del banco <small>para la conciliación, separadas por comas (ej.: BCA, AUTOSUBASTAS)</small><input name="claves" value="${esc(p.claves||"")}"></label>
    <label>Notas<textarea name="notas" rows="2">${esc(p.notas||"")}</textarea></label>
    <div class="row"><span style="flex:1">${id?`<button class="btn peligro" value="borrar" formnovalidate>Borrar</button>`:""}</span><button class="btn" value="cancelar" formnovalidate>Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`;
  d.returnValue="";d.showModal();
  d.onclose=async()=>{try{
    if(d.returnValue==="borrar"){if(confirm("¿Borrar este proveedor? Sus gastos no se borran.")){await S.db.doc("proveedores/"+id).delete();toast("Proveedor borrado")}return}
    if(d.returnValue!=="ok")return;const v=Object.fromEntries(new FormData(f));
    const dato={...v,nombre:String(v.nombre||"").trim(),nif:nifLimpio(v.nif),actualizado:new Date().toISOString()};if(!dato.nombre)throw new Error("Falta el nombre");
    await S.db.doc("proveedores/"+(id||nid())).set(dato);toast("Proveedor guardado")}catch(e){toast(e.message,6000)}};
}
async function guardarProveedorDesdeGasto(g){
  if(!g.proveedor)return g.proveedorId;
  const nif=nifLimpio(g.nifProveedor);
  let p=(g.proveedorId&&S.proveedores.get(g.proveedorId))||[...S.proveedores.values()].find(x=>(nif&&nifLimpio(x.nif)===nif)||String(x.nombre).toLowerCase()===g.proveedor.toLowerCase());
  if(p){if(nif&&!p.nif)await S.db.doc("proveedores/"+p.id).set({...p,id:undefined,nif}).catch(()=>{});return p.id}
  const pid=nid();await S.db.doc("proveedores/"+pid).set({nombre:g.proveedor,nif,categoria:g.categoria,regimen:(g.lineas&&g.lineas[0]&&g.lineas[0].regimen)||"General",formaPago:g.formaPago||"Transferencia",creado:new Date().toISOString()});return pid;
}
async function importarProveedores(){
  const vistos=new Set([...S.proveedores.values()].map(p=>nifLimpio(p.nif)||String(p.nombre).toLowerCase()));let n=0;
  for(const g of S.gastos.values()){if(!g.proveedor)continue;const k=nifLimpio(g.nifProveedor)||g.proveedor.toLowerCase();if(vistos.has(k)||vistos.has(g.proveedor.toLowerCase()))continue;vistos.add(k);
    await S.db.doc("proveedores/"+nid()).set({nombre:g.proveedor,nif:nifLimpio(g.nifProveedor),categoria:g.categoria,regimen:regimenVehiculo(g),formaPago:g.formaPago||"Transferencia",creado:new Date().toISOString()});n++}
  toast(n?`${n} ${n===1?"proveedor creado":"proveedores creados"}`:"No había proveedores nuevos");
}

function descargarBlob(b,nombre){const u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
async function verArchivo(ruta,nombre){
  try{toast("Abriendo…");const b=await HUELSAN.bajar("documentos",ruta);const u=URL.createObjectURL(b);const w=open(u,"_blank");
    if(!w){const a=document.createElement("a");a.href=u;a.download=nombre||ruta;a.click()}setTimeout(()=>URL.revokeObjectURL(u),60000)}catch(e){toast(e.message,6000)}}

/* ======================================================================
   DOCUMENTOS DEL COCHE (póliza, permiso, ficha técnica, ITV…): almacén privado «documentos»,
   registro en docscoche/<id>. Las pólizas de seguro subidas a una factura de «Seguro» salen aquí solas,
   y una póliza subida aquí se puede adjuntar (copia) a la factura de seguro del coche.
   ====================================================================== */
const DOC_TIPOS=["Póliza de seguro","Permiso de circulación","Ficha técnica","ITV","Contrato de compra","Informe o peritaje","Garantía","Mandato / transferencia","Otros"];
const esPoliza=t=>t==="Póliza de seguro";
const cocheDe=k=>porMatricula().find(y=>y.matricula===k);
const gastosSeguro=x=>x.docs.filter(g=>g.categoria==="Seguro"&&!g.sinFactura).sort((a,b)=>String(b.fecha||"").localeCompare(String(a.fecha||"")));
function docsPropios(x){const l=x.lote,k=x.matricula.startsWith("lote:")?null:x.matricula;
  return[...S.docsCoche.values()].filter(d=>(l&&d.loteId===l.id)||(k&&normMat(d.matricula)===k)).sort((a,b)=>String(b.creado||"").localeCompare(String(a.creado||"")))}
function docsDerivados(x){const out=[];for(const g of x.docs)if(g.categoria==="Seguro")for(const a of g.archivos||[])if(!a.docId)out.push({tipo:"Póliza de seguro",archivo:a,fecha:g.fecha,gasto:g});return out}
const docsTotales=x=>docsPropios(x).length+docsDerivados(x).length;
const gastoConDoc=(d)=>[...S.gastos.values()].find(g=>(g.archivos||[]).some(a=>a.docId===d.id));
function tarjetaDocs(x){
  const own=docsPropios(x),der=docsDerivados(x),seg=gastosSeguro(x);
  const btns=a=>`<button class="btn sm" data-ver-archivo="${esc(a.ruta)}" data-nombre="${esc(a.nombre)}">${esc(a.nombre.length>26?a.nombre.slice(0,24)+"…":a.nombre)}</button>`;
  const filas=[...own.map(d=>{const g=gastoConDoc(d);
      return`<tr><td>${fecha(d.fecha)}</td><td><span class="tag acc">${esc(d.tipo)}</span></td><td>${esc(d.nota||"")}</td>
        <td class="muted">${g?`También en la factura de seguro de ${esc(g.proveedor||"—")} (${fecha(g.fecha)})`:"Subido aquí"}</td>
        <td style="white-space:nowrap">${(d.archivos||[]).map(btns).join(" ")}</td>
        <td style="white-space:nowrap">${esPoliza(d.tipo)&&!g&&seg.length?`<button class="btn sm" data-doc-adj="${esc(d.id)}" title="Copiar la póliza a una factura de seguro de este coche">Adjuntar a factura</button> `:""}<button class="btn sm" data-doc-del="${esc(d.id)}" title="Eliminar documento" aria-label="Eliminar documento">✕</button></td></tr>`}),
    ...der.map(r=>`<tr><td>${fecha(r.fecha)}</td><td><span class="tag acc">${esc(r.tipo)}</span></td><td></td>
        <td class="muted">De la factura de seguro de ${esc(r.gasto.proveedor||"—")}</td><td>${btns(r.archivo)}</td>
        <td><button class="btn sm" data-gasto="${esc(r.gasto.id)}">Ver factura</button></td></tr>`)];
  return`<div class="card"><div class="row sp"><h3 style="margin:0">Documentos del coche${filas.length?` (${filas.length})`:""}</h3><button class="btn sm primary" data-doc-add="${esc(x.matricula)}">+ Añadir documento</button></div>
    ${filas.length?`<div class="tw"><table><tbody>${filas.join("")}</tbody></table></div>`:`<p class="muted" style="margin:6px 0 0">Aún no hay documentos. Sube la póliza, el permiso de circulación, la ficha técnica, la ITV… Las pólizas que subas en una factura de «Seguro» aparecen aquí automáticamente.</p>`}</div>`;
}
function formDocumento(x,seg){return new Promise(res=>{
  const f=$("#f-confirm");
  f.innerHTML=`<h2>Añadir documento</h2>
    <label>Tipo<select name="tipo">${DOC_TIPOS.map(t=>`<option>${esc(t)}</option>`).join("")}</select></label>
    <label>Nota <span class="muted">(opcional)</span><input name="nota" placeholder="Ej.: Mapfre, todo riesgo, hasta 12/2027"></label>
    <label>Archivos<input type="file" name="files" multiple required accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"></label>
    ${seg.length?`<label id="adj-wrap">Adjuntar también a la factura de seguro<select name="gasto"><option value="">No adjuntar</option>${seg.map((g,i)=>`<option value="${esc(g.id)}" ${i===0?"selected":""}>${esc(fecha(g.fecha))} · ${esc(g.proveedor||"Seguro")} · ${esc(eur(g.total))}</option>`).join("")}</select></label>`:""}
    <div class="row" style="justify-content:flex-end"><button class="btn" value="no" formnovalidate>Cancelar</button><button class="btn primary" value="si">Guardar</button></div>`;
  const tipo=f.elements.tipo,w=$("#adj-wrap");const act=()=>{if(w)w.hidden=!esPoliza(tipo.value)};tipo.onchange=act;act();
  const d=$("#dlg-confirm");d.returnValue="";d.showModal();
  d.onclose=()=>{if(d.returnValue!=="si")return res(null);const fd=new FormData(f);res({tipo:String(fd.get("tipo")),nota:String(fd.get("nota")||"").trim(),files:[...f.elements.files.files],gastoId:esPoliza(String(fd.get("tipo")))?String(fd.get("gasto")||""):""})}})}
async function copiarAGasto(d,g){
  const nuevos=[];for(const a of d.archivos||[]){const b=await HUELSAN.bajar("documentos",a.ruta);const r=await HUELSAN.subir("documentos",new File([b],a.nombre,{type:a.tipo||b.type||""}));
    nuevos.push({ruta:r.id,nombre:a.nombre,tipo:a.tipo||"",size:a.size||0,subido:new Date().toISOString(),docId:d.id})}
  await S.db.doc("gastos/"+g.id).update({archivos:[...(g.archivos||[]),...nuevos],actualizado:new Date().toISOString()})}
async function anadirDocumento(k){
  const x=cocheDe(k);if(!x){toast("No encuentro ese coche");return}
  const r=await formDocumento(x,gastosSeguro(x));if(!r)return;
  try{const id=nid(),archivos=[];
    for(const fi of r.files){toast("Subiendo "+fi.name+"…",20000);const u=await HUELSAN.subir("documentos",fi);archivos.push({ruta:u.id,nombre:fi.name,tipo:fi.type,size:fi.size,subido:new Date().toISOString()})}
    const l=x.lote;const d={loteId:l?l.id:"",matricula:x.matricula.startsWith("lote:")?"":x.matricula,tipo:r.tipo,nota:r.nota,fecha:hoyISO(),archivos,creado:new Date().toISOString()};
    await S.db.doc("docscoche/"+id).set(d);
    const g=r.gastoId&&S.gastos.get(r.gastoId);if(g)await copiarAGasto({...d,id},g);
    toast(g?"Documento guardado y adjuntado a la factura de seguro":"Documento guardado");pintar()}catch(e){toast("No se ha podido guardar: "+e.message,6000)}}
async function adjuntarPolizaAGasto(docId){
  const d=S.docsCoche.get(docId);if(!d)return;const x=[...porMatricula()].find(y=>docsPropios(y).some(z=>z.id===docId));if(!x)return;
  const seg=gastosSeguro(x);if(!seg.length){toast("Este coche no tiene facturas de seguro");return}
  const f=$("#f-confirm");f.innerHTML=`<h2>Adjuntar a factura de seguro</h2><label>Factura<select name="g">${seg.map(g=>`<option value="${esc(g.id)}">${esc(fecha(g.fecha))} · ${esc(g.proveedor||"Seguro")} · ${esc(eur(g.total))}</option>`).join("")}</select></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" value="no" formnovalidate>Cancelar</button><button class="btn primary" value="si">Adjuntar</button></div>`;
  const dlg=$("#dlg-confirm");dlg.returnValue="";dlg.showModal();
  const gid=await new Promise(ok=>{dlg.onclose=()=>ok(dlg.returnValue==="si"?String(new FormData(f).get("g")):"")});if(!gid)return;
  try{toast("Adjuntando…",20000);await copiarAGasto({...d,id:docId},S.gastos.get(gid));toast("Póliza adjuntada a la factura");pintar()}catch(e){toast("No se ha podido adjuntar: "+e.message,6000)}}
async function borrarDocumento(docId){
  const d=S.docsCoche.get(docId);if(!d)return;const g=gastoConDoc(d);
  if(!await confirmar("¿Eliminar este documento?",`${d.tipo}${d.nota?" · "+d.nota:""}. Se borran sus archivos.${g?` También se quitará la copia adjunta a la factura de ${g.proveedor||"seguro"}.`:""}`,"Sí, eliminar"))return;
  try{for(const a of d.archivos||[])await HUELSAN.borrarArchivo("documentos",a.ruta).catch(()=>{});
    if(g){const quitar=(g.archivos||[]).filter(a=>a.docId===d.id);for(const a of quitar)await HUELSAN.borrarArchivo("documentos",a.ruta).catch(()=>{});
      await S.db.doc("gastos/"+g.id).update({archivos:(g.archivos||[]).filter(a=>a.docId!==d.id),actualizado:new Date().toISOString()})}
    await S.db.doc("docscoche/"+docId).delete();toast("Documento eliminado");pintar()}catch(e){toast("No se ha podido eliminar: "+e.message,6000)}}

/* ======================================================================
   POR MATRÍCULA: compra + gastos + ventas = margen
   ====================================================================== */
function porMatricula(){
  const m=new Map();
  const get=k=>{if(!m.has(k))m.set(k,{matricula:k,lote:null,titulo:"",compra:0,compraRebu:0,gastos:0,iva:0,ventas:0,ventaRebu:0,ventaBase:0,ventaCuota:0,facturas:[],docs:[],gastosApp:0,appSinFactura:[],sinFactura:0});return m.get(k)};
  for(const l of S.lotes){if(!["comprado","stock","vendido"].includes(l.estado))continue;const k=normMat(l.matricula)||("lote:"+l.id);const x=get(k);x.lote=l;x.titulo=[l.marca,l.modelo].filter(Boolean).join(" ");
    const tieneCompra=[...S.gastos.values()].some(g=>g.categoria==="Compra del vehículo"&&(g.loteId===l.id||(normMat(l.matricula)&&normMat(g.matricula)===normMat(l.matricula))));
    if(l.precioCompra&&!l.precioCompraGasto&&!tieneCompra){x.compra+=+l.precioCompra;if(l.iva!=="General")x.compraRebu+=+l.precioCompra}
    for(const gd of Array.isArray(l.gastosDetalle)?l.gastosDetalle:[])if(!gd.gastoId){x.gastos+=+gd.importe||0;x.gastosApp+=+gd.importe||0;x.appSinFactura.push(gd)}
    if(!Array.isArray(l.gastosDetalle)&&+l.gastos>0){x.gastos+=+l.gastos;x.gastosApp+=+l.gastos;x.appSinFactura.push({id:"g0",categoria:"Otros",concepto:"Gastos anotados antes del desglose",importe:+l.gastos})}}
  for(const g of S.gastos.values()){const l=g.loteId&&S.lotes.find(y=>y.id===g.loteId);const k=normMat(g.matricula)||(l?normMat(l.matricula)||("lote:"+l.id):"");if(!k)continue;const x=get(k);
    if(!x.titulo&&l)x.titulo=[l.marca,l.modelo].filter(Boolean).join(" ");
    if(g.categoria==="Compra del vehículo"){const cv=costeVehiculo(g);x.compra+=cv;if(regimenVehiculo(g)!=="General")x.compraRebu+=cv;x.gastos+=r2(gastoCoste(g)-cv)}else x.gastos+=gastoCoste(g);
    if(g.sinFactura)x.sinFactura+=gastoCoste(g);
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
  return`<div><h1>Contabilidad por matrícula</h1><p class="muted" style="margin:4px 0 0">Cada coche con su compra, sus gastos y su venta. Los gastos con IVA deducible cuentan por su base (el IVA se recupera); los de REBU, sin IVA o en efectivo sin factura, por el total. El margen neto descuenta el IVA del REBU (21/121 del margen de las ventas en REBU). Son cifras orientativas: la liquidación la confirma la gestoría.</p></div>
  <label>Buscar<input type="search" data-mq value="${esc(S.mq||"")}" placeholder="Matrícula, marca o modelo"></label>
  <div class="kpis"><div class="kpi"><b>${eur(T("coste"))}</b><span>compras + gastos</span></div><div class="kpi"><b>${eur(T("ventas"))}</b><span>ventas (sin IVA general)</span></div><div class="kpi"><b>${eur(T("margen"))}</b><span>margen bruto</span></div><div class="kpi"><b>${eur(T("margenNeto"))}</b><span>margen tras IVA del REBU</span></div></div>
  ${fil.length?`<div class="tw"><table><thead><tr><th>Matrícula</th><th>Vehículo</th><th>Estado</th><th class="num">Compra</th><th class="num">Gastos</th><th class="num">Venta</th><th class="num">Margen</th><th class="num">IVA REBU</th><th class="num">Margen neto</th><th>Documentos</th></tr></thead><tbody>
    ${fil.map(x=>`<tr data-mat="${esc(x.matricula)}" style="cursor:pointer"><td>${x.matricula.startsWith("lote:")?"—":`<span class="mat">${esc(x.matricula)}</span>`}</td><td>${esc(x.titulo)}</td>
      <td>${x.lote?esc(({comprado:"Comprado",stock:"Stock",vendido:"Vendido"})[x.lote.estado]||x.lote.estado):x.facturas.length?"Vendido":"—"}</td>
      <td class="num">${eur(x.compra)}</td><td class="num">${eur(x.gastos)}</td><td class="num">${x.ventas?eur(x.ventas):"—"}</td>
      <td class="num" style="color:${x.ventas?(x.margen>=0?"var(--ok)":"var(--bad)"):"inherit"}">${x.ventas?eur(x.margen):"—"}</td><td class="num">${x.ivaRebu?eur(x.ivaRebu):"—"}</td><td class="num"><b>${x.ventas?eur(x.margenNeto):"—"}</b></td>
      <td>${x.facturas.length?`<span class="tag ok">${x.facturas.length} venta</span> `:""}${x.docs.length?`<span class="tag acc">${x.docs.length} gasto${x.docs.length>1?"s":""}</span>`:""}${docsTotales(x)?` <span class="tag">${docsTotales(x)} doc${docsTotales(x)>1?"s":""}</span>`:""}${!x.docs.some(g=>g.categoria==="Compra del vehículo")&&x.compra?` <span class="tag warn">sin factura de compra</span>`:""}${x.appSinFactura.length?` <span class="tag bad">${x.appSinFactura.length} sin factura</span>`:""}</td></tr>`).join("")}
  </tbody></table></div>`:`<div class="vacio">Aún no hay coches comprados, gastos ni ventas.</div>`}`;
}
function detalleMatricula(x){
  const l=x.lote;
  return`<div class="row sp"><div class="row"><button class="btn sm" data-acc="mat-volver">← Todas</button><h1>${x.matricula.startsWith("lote:")?"Sin matrícula":`<span class="mat" style="font-size:18px">${esc(x.matricula)}</span>`} ${esc(x.titulo)}</h1></div>
    <span class="row"><button class="btn" data-acc="mat-gasto">+ Subir factura de compra o gasto</button>${l&&l.estado!=="vendido"&&!x.facturas.length?`<button class="btn primary" data-acc="mat-facturar">Crear factura de venta</button>`:""}</span></div>
  <div class="kpis"><div class="kpi"><b>${eur(x.compra)}</b><span>compra</span></div><div class="kpi"><b>${eur(x.gastos)}</b><span>gastos (sin IVA deducible)</span></div><div class="kpi"><b>${eur(x.iva)}</b><span>IVA soportado (se recupera)</span></div><div class="kpi"><b>${x.ventas?eur(x.ventas):"—"}</b><span>venta (sin IVA general)</span></div>
    <div class="kpi"><b>${x.ventas?eur(x.margen):"—"}</b><span>margen bruto</span></div><div class="kpi"><b>${x.ivaRebu?eur(x.ivaRebu):"—"}</b><span>IVA del REBU</span></div><div class="kpi"><b>${x.ventas?eur(x.margenNeto):"—"}</b><span>margen neto</span></div></div>
  ${l?`<p class="muted" style="margin:0">${esc([l.vin?"Bastidor "+l.vin:"",l.anio,l.km?miles(String(Math.round(l.km)))+" km":"",l.combustible,l.iva?"Compra en "+l.iva:""].filter(Boolean).join(" · "))}</p>`:""}
  ${x.appSinFactura.length?`<div class="card" style="border-color:var(--bad)"><h3 style="color:var(--bad)">Gastos anotados en la ficha sin factura (${eur(x.gastosApp)})</h3>
    <p class="muted" style="margin:0">Cada gasto necesita su factura. Súbela (se leen el IVA y la base) o márcalo como pago en efectivo sin factura.</p>
    <div class="tw"><table><tbody>${x.appSinFactura.map(gd=>`<tr><td>${gd.fecha?fecha(gd.fecha):"—"}</td><td>${esc(gd.categoria||"Otros")}</td><td>${esc(gd.concepto||"")}</td><td class="num">${eur(gd.importe)}</td>
      <td style="white-space:nowrap">${l&&gd.id!=="g0"?`<button class="btn sm primary" data-subir-detalle="${esc(l.id)}|${esc(gd.id)}">Subir factura</button> `:""}${l?`<button class="btn sm" data-sinf-detalle="${esc(l.id)}|${esc(gd.id)}" title="Pago en efectivo sin factura">Sin factura</button> <button class="btn sm" data-del-detalle="${esc(l.id)}|${esc(gd.id)}" title="Eliminar este gasto de la ficha" aria-label="Eliminar gasto">✕</button>`:""}</td></tr>`).join("")}</tbody></table></div></div>`:""}
  ${tarjetaDocs(x)}
  <h3>Ventas</h3>${x.facturas.length?`<div class="tw"><table><tbody>${x.facturas.map(f=>`<tr data-ir-factura="${esc(f.id)}" style="cursor:pointer"><td><b>${esc(f.codigo)}</b></td><td>${fecha(f.fechaExpedicion)}</td><td>${esc(f.cliente&&f.cliente.nombre)}</td><td>${etiquetaEstado(f)}</td><td class="num">${eur(f.totales&&f.totales.total)}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Sin facturas de venta.</p>`}
  <h3>Compras y gastos</h3>${x.docs.length?`<div class="tw"><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Proveedor</th><th>Régimen</th><th class="num">Total pagado</th><th class="num">IVA deducible</th><th class="num">Coste al coche</th><th>Factura</th></tr></thead><tbody>${x.docs.sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha))).map(g=>`<tr data-gasto="${esc(g.id)}" style="cursor:pointer"><td>${fecha(g.fecha)}</td><td>${esc(g.categoria)}</td><td>${esc(g.proveedor||"")}<div class="muted">${esc(g.concepto||"")}</div></td><td>${esc(regimenTexto(g))}</td><td class="num">${eur(g.total)}</td><td class="num">${gastoCuota(g)?eur(gastoCuota(g)):"—"}</td><td class="num"><b>${eur(gastoCoste(g))}</b></td>
    <td>${g.sinFactura?`<span class="tag">Efectivo sin factura</span>`:(g.archivos||[]).map(a=>`<button class="btn sm" data-ver-archivo="${esc(a.ruta)}" data-nombre="${esc(a.nombre)}">${esc(a.nombre.length>24?a.nombre.slice(0,22)+"…":a.nombre)}</button>`).join(" ")||`<span class="tag bad">Falta factura</span>`}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Aún no hay facturas de compra ni de gastos de este coche.</p>`}`;
}

/* ======================================================================
   IVA Y LIBROS
   ====================================================================== */
const enPeriodo=(f,anio,tq)=>String(f||"").startsWith(anio)&&(!tq||trimestre(f)===+tq);
const per=()=>S.res.tq?S.res.tq+"T "+S.res.anio:S.res.anio;
const sufijo=(anio,tq)=>tq?`${anio}-${tq}T`:anio;
function vistaResumen(){
  const anio=S.res.anio;S.res.filas=null;const anios=aniosDe([...emitidas().map(f=>f.fechaExpedicion),...[...S.gastos.values()].map(g=>g.fecha)]);
  const filas=[1,2,3,4].map(tq=>{
    const fs=emitidas().filter(f=>String(f.fechaExpedicion||"").startsWith(anio)&&trimestre(f.fechaExpedicion)===tq);
    const gs=[...S.gastos.values()].filter(g=>!g.sinFactura&&String(g.fecha||"").startsWith(anio)&&trimestre(g.fecha)===tq);
    const rep={};let rebuVentas=0;
    for(const f of fs){const e=efecto(f);rebuVentas+=e.rebu;for(const g of e.grupos){const x=rep[g.tipo]=rep[g.tipo]||{base:0,cuota:0};x.base+=g.base;x.cuota+=g.cuota}}
    // REBU por operación: margen de cada coche vendido en el trimestre (venta REBU − su compra REBU)
    let margenRebu=0;const vistos=new Set();
    for(const f of fs){const k=normMat(f.vehiculo&&f.vehiculo.matricula);if(!k||vistos.has(k))continue;vistos.add(k);
      const x=porMatricula().find(y=>y.matricula===k);if(x&&x.ventaRebu>0)margenRebu+=Math.max(0,x.ventaRebu-x.compraRebu)}
    const baseRebu=r2(margenRebu/1.21),cuotaRebu=r2(margenRebu-baseRebu);
    const sop=r2(gs.reduce((s,g)=>s+gastoCuota(g),0)),sopBase=r2(gs.reduce((s,g)=>s+gastoBase(g),0));
    const cuotaRep=r2(Object.values(rep).reduce((s,x)=>s+x.cuota,0));
    return{tq,n:fs.length,rep,rebuVentas:r2(rebuVentas),margenRebu:r2(margenRebu),baseRebu,cuotaRebu,sop,sopBase,cuotaRep,resultado:r2(cuotaRep+cuotaRebu-sop)};
  });S.res.filas=filas;
  return`<div class="row sp"><div><h1>IVA y libros registro</h1><p class="muted" style="margin:4px 0 0">Resumen por trimestre para preparar el modelo 303 con la gestoría y descarga de los libros (en CSV, se abren con Excel). Orientativo: el REBU se calcula coche a coche con el margen de venta sobre su compra.</p></div>
    <label style="max-width:120px">Año<select data-ra>${anios.map(a=>`<option ${a===anio?"selected":""}>${a}</option>`).join("")}</select></label></div>
  <div class="tw"><table><thead><tr><th>Trimestre</th><th class="num">Facturas</th><th class="num">Base general</th><th class="num">IVA repercutido</th><th class="num">Ventas REBU</th><th class="num">Margen REBU</th><th class="num">IVA del REBU</th><th class="num">IVA soportado</th><th class="num">Resultado</th><th></th></tr></thead><tbody>
    ${filas.map(r=>`<tr><td><b>${r.tq}T ${anio}</b></td><td class="num">${r.n}</td><td class="num">${eur(Object.values(r.rep).reduce((s,x)=>s+x.base,0))}</td><td class="num">${eur(r.cuotaRep)}</td><td class="num">${eur(r.rebuVentas)}</td><td class="num">${eur(r.margenRebu)}</td><td class="num">${eur(r.cuotaRebu)}</td><td class="num">${eur(r.sop)}</td>
      <td class="num"><b style="color:${r.resultado>0?"var(--bad)":"var(--ok)"}">${eur(r.resultado)}</b><div class="muted">${r.resultado>0?"a ingresar":r.resultado<0?"a compensar":""}</div></td><td><button class="btn sm" data-tq-bajar="${r.tq}">Libros del ${r.tq}T ↓</button></td></tr>`).join("")}
  </tbody></table></div>
  <div class="card"><div class="row sp"><h3>Descargas</h3><label style="max-width:200px;flex-direction:row;align-items:center;gap:8px">Periodo<select data-rt><option value="">Año ${anio} completo</option>${[1,2,3,4].map(t=>`<option value="${t}" ${+S.res.tq===t?"selected":""}>${t}º trimestre ${anio}</option>`).join("")}</select></label></div>
    <div class="row">
    <button class="btn" data-acc="csv-resumen">Resumen de IVA (modelo 303) ${per()}</button>
    <button class="btn" data-acc="csv-expedidas">Libro de facturas expedidas ${per()}</button>
    <button class="btn" data-acc="csv-recibidas">Libro de facturas recibidas ${per()}</button>
    <button class="btn" data-acc="csv-rebu">Libro de bienes usados (REBU) ${per()}</button>
    <button class="btn" data-acc="zip-pdf">Facturas emitidas ${per()} en PDF (ZIP)</button>
    <button class="btn" data-acc="zip-recibidas">Facturas recibidas ${per()} (ZIP)</button></div>
    <p class="muted" style="margin:0">Los pagos en efectivo sin factura no salen en los libros de IVA (sí en los balances de los coches).</p>
    <p class="muted" style="margin:0">Conservad las facturas y estos libros al menos 4 años (Ley General Tributaria) y 6 años la documentación contable (Código de Comercio).</p></div>`;
}
function bajarCSV(nombre,filas){
  const csv="﻿"+filas.map(f=>f.map(v=>{const s=typeof v==="number"?(Number.isInteger(v)?String(v):numES(v).replace(/\./g,"")):String(v??"");return/[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}).join(";")).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
function csvExpedidas(anio,tq){
  const fs=emitidas().filter(f=>enPeriodo(f.fechaExpedicion,anio,tq)).sort((a,b)=>String(a.serie).localeCompare(String(b.serie))||a.numero-b.numero);
  const filas=[["Fecha expedición","Fecha operación","Serie","Número","Factura","Tipo","Rectifica a","Motivo","Cliente","NIF","Matrícula","Bastidor","Régimen","Base imponible","Tipo IVA %","Cuota IVA","Importe REBU","Total factura","Estado","Huella"]];
  for(const f of fs){const t=f.totales||calcular(f.lineas);const base=[f.fechaExpedicion,f.fechaOperacion||"",f.serie,f.numero,f.codigo,f.tipo==="rectificativa"?"Rectificativa ("+((f.rectifica||{}).tipo||"")+")":"Ordinaria",(f.rectifica||{}).codigo||"",(f.rectifica||{}).motivo||"",f.cliente.nombre,f.cliente.nif,(f.vehiculo||{}).matricula||"",(f.vehiculo||{}).bastidor||""];
    const est=f.anulada?"Anulada":f.estado==="rectificada"?"Rectificada":"Emitida";
    if(t.rebu)filas.push([...base,TXT_REBU,"","","",t.rebu,t.total,est,f.huella||""]);
    for(const g of t.grupos)filas.push([...base,"General",g.base,g.tipo,g.cuota,"",t.total,est,f.huella||""])}
  bajarCSV(`libro-expedidas-${sufijo(anio,tq)}.csv`,filas);
}
function csvRecibidas(anio,tq){
  const gs=[...S.gastos.values()].filter(g=>!g.sinFactura&&enPeriodo(g.fecha,anio,tq)).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));
  const filas=[["Fecha","Proveedor","NIF proveedor","Nº factura","Categoría","Concepto","Matrícula","Línea","Régimen","Base imponible","Tipo IVA %","Cuota IVA deducible","Importe sin IVA / REBU","Total línea","Total factura","Forma de pago","Pagada","Archivos"]];
  for(const g of gs)for(const l of lineasDe(g)){const gen=l.regimen==="General";
    filas.push([g.fecha,g.proveedor,g.nifProveedor||"",g.numFactura||"",g.categoria,g.concepto||"",g.matricula||"",l.concepto||"",gen?"General":l.regimen==="REBU"?TXT_REBU:"Exento / no sujeto",gen?l.base:"",gen?l.ivaTipo:"",gen?l.cuota:"",gen?"":l.total,l.total,g.total,g.formaPago||"",g.pagado?"Sí":"No",(g.archivos||[]).length])}
  bajarCSV(`libro-recibidas-${sufijo(anio,tq)}.csv`,filas);
}
function csvResumen(anio,tq){
  if(!S.res.filas)vistaResumen();const fl=(S.res.filas||[]).filter(r=>!tq||r.tq===+tq);
  const filas=[["Periodo","Facturas emitidas","Base IVA general","IVA repercutido","Ventas REBU","Margen REBU","Base REBU (margen/1,21)","IVA del REBU","Base IVA soportado","IVA soportado deducible","Resultado (a ingresar + / a compensar −)"]];
  for(const r of fl)filas.push([r.tq+"T "+anio,r.n,r2(Object.values(r.rep).reduce((s,x)=>s+x.base,0)),r.cuotaRep,r.rebuVentas,r.margenRebu,r.baseRebu,r.cuotaRebu,r.sopBase,r.sop,r.resultado]);
  bajarCSV(`resumen-iva-${sufijo(anio,tq)}.csv`,filas);
}
function csvRebu(anio,tq){
  const filas=[["Matrícula","Vehículo","Bastidor","Documento de compra","Fecha compra","Precio de compra","Factura de venta","Fecha venta","Precio de venta","Margen","Base imponible (margen/1,21)","IVA (21 %)"]];
  for(const x of porMatricula()){const vs=x.facturas.filter(f=>enPeriodo(f.fechaExpedicion,anio,tq)&&efecto(f).rebu);if(!vs.length||!r2(x.ventaRebu))continue;
    const comp=x.docs.filter(g=>g.categoria==="Compra del vehículo");const m=r2(x.ventaRebu-x.compraRebu);const base=m>0?r2(m/1.21):0;
    filas.push([x.matricula,x.titulo,(x.lote&&x.lote.vin)||(vs[0].vehiculo||{}).bastidor||"",comp.map(g=>[g.proveedor,g.numFactura].filter(Boolean).join(" ")).join(" / ")||"Ficha del coche",comp[0]&&comp[0].fecha||"",x.compraRebu,vs.map(f=>f.codigo).join(" / "),vs[vs.length-1].fechaExpedicion,x.ventaRebu,m,base,m>0?r2(m-base):0])}
  bajarCSV(`libro-bienes-usados-${sufijo(anio,tq)}.csv`,filas);
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
  else if(a==="mat-gasto"){const x=porMatricula().find(y=>y.matricula===S.mat);abrirGasto(null,{matricula:S.mat.startsWith("lote:")?"":S.mat,loteId:x&&x.lote?x.lote.id:"",categoria:x&&!x.docs.some(g=>g.categoria==="Compra del vehículo")?"Compra del vehículo":"Transporte y portes",lineas:(()=>{const c=x&&!x.docs.some(g=>g.categoria==="Compra del vehículo");return[lineaNueva(c,c&&x.lote&&x.lote.iva!=="General"?"REBU":"General")]})()})}
  else if(a==="mat-facturar"){const x=porMatricula().find(y=>y.matricula===S.mat);S.tab="facturas";pintarTabs();nuevaFactura({loteId:x&&x.lote?x.lote.id:""})}
  else if(a==="csv-expedidas")csvExpedidas(S.res.anio,S.res.tq);
  else if(a==="csv-recibidas")csvRecibidas(S.res.anio,S.res.tq);
  else if(a==="csv-rebu")csvRebu(S.res.anio,S.res.tq);
  else if(a==="csv-resumen")csvResumen(S.res.anio,S.res.tq);
  else if(a==="zip-pdf")zipPDF(S.res.anio,S.res.tq).catch(e=>toast(e.message,6000));
  else if(a==="zip-recibidas")zipRecibidas(S.res.anio,S.res.tq).catch(e=>toast(e.message,6000));
  else if(a==="prov-alta")abrirProveedor(null);
  else if(a==="prov-importar")importarProveedores().catch(e=>toast(e.message,6000));
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
  const pv=t.closest("[data-prov]");if(pv){abrirProveedor(pv.dataset.prov);return}
  const da=t.closest("[data-doc-add]");if(da){e.stopPropagation();anadirDocumento(da.dataset.docAdd);return}
  const dx=t.closest("[data-doc-del]");if(dx){e.stopPropagation();borrarDocumento(dx.dataset.docDel);return}
  const dj=t.closest("[data-doc-adj]");if(dj){e.stopPropagation();adjuntarPolizaAGasto(dj.dataset.docAdj);return}
  const sf=t.closest("[data-sinf-detalle]");if(sf){e.stopPropagation();const[lid,did]=sf.dataset.sinfDetalle.split("|");marcarDetalleSinFactura(lid,did);return}
  const dd=t.closest("[data-del-detalle]");if(dd){e.stopPropagation();const[lid,did]=dd.dataset.delDetalle.split("|");eliminarDetalle(lid,did);return}
  const sd=t.closest("[data-subir-detalle]");if(sd){e.stopPropagation();const[lid,did]=sd.dataset.subirDetalle.split("|");subirFacturaDetalle(lid,did);return}
  const it=t.closest("[data-ir-tab]");if(it){e.preventDefault();S.tab=it.dataset.irTab;S.ed=null;history.replaceState(null,"","?tab="+S.tab);pintarTabs();pintar();return}
  const tb=t.closest("[data-tq-bajar]");if(tb){S.res.tq=tb.dataset.tqBajar;pintar();const c=$("[data-rt]");if(c)c.closest(".card").scrollIntoView({behavior:"smooth",block:"center"});toast("Descargas del "+S.res.tq+"º trimestre");return}
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
async function cargarJSZip(){if(!window.JSZip)await new Promise((ok,ko)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=ok;s.onerror=()=>ko(new Error("No se ha podido cargar el compresor"));document.head.appendChild(s)})}
async function zipRecibidas(anio,tq){
  const gs=[...S.gastos.values()].filter(g=>!g.sinFactura&&enPeriodo(g.fecha,anio,tq)&&(g.archivos||[]).length);if(!gs.length)throw new Error("No hay facturas recibidas con archivo en ese periodo");
  await cargarJSZip();const z=new JSZip();let i=0;
  for(const g of gs)for(const a of g.archivos){toast(`Descargando ${++i}…`,20000);const b=await HUELSAN.bajar("documentos",a.ruta);
    const ext=(a.nombre.match(/\.[a-z0-9]+$/i)||[".pdf"])[0];z.file(nombreEstandar(g,ext,g.archivos.indexOf(a)+1),b)}
  const el=document.createElement("a");el.href=URL.createObjectURL(await z.generateAsync({type:"blob"}));el.download=`facturas-recibidas-${sufijo(anio,tq)}.zip`;el.click();setTimeout(()=>URL.revokeObjectURL(el.href),4000);toast("ZIP descargado");
}
async function zipPDF(anio,tq){
  const fs=emitidas().filter(f=>enPeriodo(f.fechaExpedicion,anio,tq));if(!fs.length)throw new Error("No hay facturas emitidas en ese periodo");
  if(!window.JSZip)await new Promise((ok,ko)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=ok;s.onerror=()=>ko(new Error("No se ha podido cargar el compresor"));document.head.appendChild(s)});
  const z=new JSZip();let i=0;for(const f of fs){toast(`Generando ${++i}/${fs.length}…`,20000);z.file(`${f.codigo}.pdf`,(await pdfFactura(f)).output("blob"))}
  const a=document.createElement("a");a.href=URL.createObjectURL(await z.generateAsync({type:"blob"}));a.download=`facturas-emitidas-${sufijo(anio,tq)}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast("ZIP descargado");
}
