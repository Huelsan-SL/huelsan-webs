/* ======================================================================
   VEHÍCULOS: expediente de cada coche que hemos tenido (comprado, en stock o vendido).
   Junta en un solo sitio todo lo que ya se guarda en otras pestañas: facturas de compra y de venta,
   gastos, contratos (compraventa y reserva), DNI y documentos del comprador, gestoría y cambio de nombre,
   póliza de seguro, permiso, ficha técnica, ITV… Nada se duplica: son los mismos archivos y registros.
   Usa lo de facturacion.js (porMatricula, docsPropios, verArchivo…), contrato.js, reserva.js y gestoria.js.
   ====================================================================== */
(function(){
const V={q:"",est:"",falta:"",sel:null,gest:new Map()};

/* ---------- carga del registro de gestoría (gestoria/<id del coche>) ---------- */
(function esperar(){
  if(typeof S==="undefined"||!S.db){setTimeout(esperar,200);return}
  S.db.collection("gestoria").onSnapshot(sn=>{V.gest.clear();sn.docs.forEach(d=>V.gest.set(d.id,{...d.data(),id:d.id}));if(S.tab==="vehiculos")pintar()},e=>console.error(e));
})();

/* ---------- agrupación de los documentos subidos por tipo ---------- */
const SEC_TIPOS={
  vehiculo:["Permiso de circulación","Ficha técnica","ITV","Informe o peritaje","Garantía"],
  compra:["Contrato de compra"],
  comprador:["DNI / NIE del comprador","CIF del comprador","DNI del administrador","Representación de persona jurídica"],
  gestoria:["Solicitud y mandato","Mandato / transferencia","Certificado sustitutivo de escrituras y poderes"],
  seguro:["Póliza de seguro"]};
const enSec=(d,s)=>SEC_TIPOS[s].includes(d.tipo);
const conocido=d=>Object.values(SEC_TIPOS).some(l=>l.includes(d.tipo));

/* ---------- datos de un coche ---------- */
const ctsDe=x=>{const C=window.HuelsanContratos;if(!C)return[];const l=x.lote,mat=x.matricula.startsWith("lote:")?"":normMat(x.matricula),fids=new Set((x.facturas||[]).map(f=>f.id));
  return C.lista().filter(c=>fids.has(c.facturaId)||(l&&c.loteId===l.id)||(mat&&normMat((c.vehiculo||{}).matricula)===mat)).sort((a,b)=>String(a.fecha||"").localeCompare(String(b.fecha||"")))};
const resDe=x=>{const R=window.HuelsanReserva;if(!R||!R.lista)return[];const l=x.lote,mat=x.matricula.startsWith("lote:")?"":normMat(x.matricula);
  return R.lista().filter(r=>(l&&r.loteId===l.id)||(mat&&normMat(r.matricula)===mat)).sort((a,b)=>String(a.creada||"").localeCompare(String(b.creada||"")))};
const regDe=x=>V.gest.get(x.lote?x.lote.id:x.matricula)||V.gest.get(x.matricula)||{};
const ventasDe=x=>(x.facturas||[]).filter(f=>!f.anulada&&f.tipo!=="rectificativa"&&f.estado!=="borrador");
const compraDe=x=>x.docs.filter(g=>g.categoria==="Compra del vehículo");
const nombreC=c=>[c&&c.nombre,c&&c.apellidos].filter(Boolean).join(" ")||(c&&c.razonSocial)||"";
const vendido=x=>(x.lote&&x.lote.estado==="vendido")||ventasDe(x).length>0;
const estadoTxt=x=>vendido(x)?"Vendido":x.lote?({comprado:"Comprado",stock:"En stock"})[x.lote.estado]||x.lote.estado:"—";

/* Lo que debería haber en el expediente: [clave, etiqueta, cumplido, solo si está vendido] */
function checks(x){
  const cts=ctsDe(x),own=docsPropios(x),reg=regDe(x);
  const dni=cts.some(c=>(c.dniComprador||[]).length)||own.some(d=>enSec(d,"comprador"));
  return[
    ["compra","Factura de compra",compraDe(x).some(g=>g.sinFactura||(g.archivos||[]).length),false],
    ["seguro","Seguro",own.some(d=>enSec(d,"seguro"))||docsDerivados(x).length>0,false],
    ["venta","Factura de venta",ventasDe(x).length>0,true],
    ["contrato","Contrato firmado",cts.some(c=>((c.firmado||{}).archivos||[]).length),true],
    ["dni","DNI del comprador",dni,true],
    ["gestoria",reg.completado?"Cambio de nombre hecho":reg.enviado?"Enviado a gestoría":"Cambio de nombre",!!reg.completado,true]];
}
const aplicables=x=>checks(x).filter(c=>!c[3]||vendido(x));
const pendientes=x=>aplicables(x).filter(c=>!c[2]);
const chip=(c,x)=>{const ap=!c[3]||vendido(x);if(!ap)return`<span class="tag" style="opacity:.45" title="${esc(c[1])}: aún no aplica">${esc(c[1])}</span>`;
  const reg=regDe(x);const parcial=c[0]==="gestoria"&&reg.enviado&&!reg.completado;
  return`<span class="tag ${c[2]?"ok":parcial?"warn":"bad"}" title="${esc(c[1])}">${c[2]?"✓":parcial?"…":"✗"} ${esc(c[1])}</span>`};

/* ---------- lista ---------- */
function lista(){
  const q=normMat(V.q),qt=V.q.toLowerCase();
  return porMatricula().filter(x=>x.lote||x.facturas.length||x.docs.length)
    .filter(x=>!q&&!qt||x.matricula.includes(q)||x.titulo.toLowerCase().includes(qt)||(x.lote&&String(x.lote.vin||"").toLowerCase().includes(qt))||ventasDe(x).some(f=>String((f.cliente||{}).nombre||"").toLowerCase().includes(qt)))
    .filter(x=>!V.est||(V.est==="vendido"?vendido(x):!vendido(x)))
    .filter(x=>!V.falta||pendientes(x).length>0)
    .sort((a,b)=>(vendido(a)===vendido(b)?0:vendido(a)?1:-1)||String(ultimaFecha(b)).localeCompare(String(ultimaFecha(a))));
}
const ultimaFecha=x=>{const v=ventasDe(x).map(f=>f.fechaExpedicion).sort().pop();const c=compraDe(x).map(g=>g.fecha).sort().pop();return v||c||""};

function vista(){
  if(V.sel){const x=porMatricula().find(y=>y.matricula===V.sel);if(x)return detalle(x);V.sel=null}
  const todos=porMatricula().filter(x=>x.lote||x.facturas.length||x.docs.length),fil=lista();
  const nVend=todos.filter(vendido).length,nPend=todos.filter(x=>pendientes(x).length).length;
  return`<div><h1>Vehículos</h1><p class="muted" style="margin:4px 0 0">Todos los coches que hemos tenido, con su expediente: facturas, contratos, DNI del comprador, gestoría, seguro y el resto de documentos. Pulsa un coche para ver todo lo suyo.</p></div>
  <div class="row" style="gap:12px;align-items:flex-end"><label style="flex:1">Buscar<input type="search" data-vq value="${esc(V.q)}" placeholder="Matrícula, marca, modelo, bastidor o comprador"></label>
    <label style="width:170px">Mostrar<select data-vest>${[["","Todos"],["stock","En stock / comprados"],["vendido","Vendidos"]].map(([k,t])=>`<option value="${k}" ${V.est===k?"selected":""}>${t}</option>`).join("")}</select></label>
    <label class="row" style="flex-direction:row;color:var(--ink);font-weight:500;align-items:center;gap:6px;flex:0 0 auto"><input type="checkbox" data-vfalta ${V.falta?"checked":""} style="width:auto"> Solo con documentación pendiente</label></div>
  <div class="kpis"><div class="kpi"><b>${todos.length}</b><span>vehículos</span></div><div class="kpi"><b>${todos.length-nVend}</b><span>en stock o comprados</span></div><div class="kpi"><b>${nVend}</b><span>vendidos</span></div><div class="kpi"><b>${nPend}</b><span>con documentación pendiente</span></div></div>
  ${fil.length?`<div class="tw"><table><thead><tr><th>Matrícula</th><th>Vehículo</th><th>Estado</th><th>Compra</th><th>Venta / comprador</th><th>Expediente</th><th class="num">Archivos</th></tr></thead><tbody>
    ${fil.map(x=>{const cp=compraDe(x).map(g=>g.fecha).sort()[0],vs=ventasDe(x).sort((a,b)=>String(b.fechaExpedicion).localeCompare(String(a.fechaExpedicion)))[0];
      return`<tr data-veh="${esc(x.matricula)}" style="cursor:pointer"><td>${x.matricula.startsWith("lote:")?"—":`<span class="mat">${esc(x.matricula)}</span>`}</td><td>${esc(x.titulo||"—")}${x.lote&&x.lote.anio?` <span class="muted">${esc(x.lote.anio)}</span>`:""}</td>
      <td><span class="tag ${vendido(x)?"ok":"acc"}">${estadoTxt(x)}</span></td><td>${cp?fecha(cp):"—"}</td>
      <td>${vs?`${fecha(vs.fechaExpedicion)} · ${esc((vs.cliente||{}).nombre||"")}`:"—"}</td>
      <td style="white-space:normal">${checks(x).map(c=>chip(c,x)).join(" ")}</td><td class="num">${nArchivos(x)}</td></tr>`}).join("")}</tbody></table></div>`
    :`<div class="vacio">${todos.length?"Ningún coche coincide con el filtro.":"Aún no hay coches comprados ni en stock."}</div>`}`;
}

/* ---------- expediente ---------- */
const nombreCorto=(n,m)=>n.length>m?n.slice(0,m-2)+"…":n;
const btnArch=a=>`<button class="btn sm" data-ver-archivo="${esc(a.ruta)}" data-nombre="${esc(a.nombre||"archivo")}">${esc(nombreCorto(a.nombre||"archivo",26))}</button>`;
const filaDoc=d=>({fecha:d.fecha,etq:d.tipo,nota:d.nota||"",archivos:d.archivos||[],acc:`<button class="btn sm" data-doc-del="${esc(d.id)}" title="Eliminar documento" aria-label="Eliminar documento">✕</button>`});

function secciones(x){
  const own=docsPropios(x),cts=ctsDe(x),res=resDe(x),reg=regDe(x),vs=(x.facturas||[]).filter(f=>f.estado!=="borrador").sort((a,b)=>String(a.fechaExpedicion).localeCompare(String(b.fechaExpedicion)));
  const gastoFila=g=>({fecha:g.fecha,etq:g.categoria==="Compra del vehículo"?"Factura de compra":g.categoria||"Gasto",nota:[g.proveedor,g.numFactura,eur(g.total)].filter(Boolean).join(" · "),
    archivos:(g.archivos||[]).filter(a=>!a.docId),falta:!g.sinFactura&&!(g.archivos||[]).length,sinF:!!g.sinFactura,acc:`<button class="btn sm" data-gasto="${esc(g.id)}">Ver ficha</button>`});
  const clienteFac=(vs.find(f=>f.tipo!=="rectificativa")||{}).cliente||{},cc=(cts.find(c=>nombreC(c.comprador))||{}).comprador||{};
  const comp=Object.keys(clienteFac).length?clienteFac:cc;
  const S_=[];
  S_.push({id:"compra",titulo:"Compra",vacio:"Sin factura de compra todavía.",filas:[...compraDe(x).map(gastoFila),...own.filter(d=>enSec(d,"compra")).map(filaDoc)]});
  S_.push({id:"gastos",titulo:"Gastos y facturas de proveedores",vacio:"Sin otros gastos.",filas:x.docs.filter(g=>g.categoria!=="Compra del vehículo"&&g.categoria!=="Seguro").sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha))).map(gastoFila)});
  S_.push({id:"vehiculo",titulo:"Documentación del vehículo",hint:"Permiso de circulación, ficha técnica, ITV, peritaje, garantía…",vacio:"Aún no hay documentos del vehículo.",filas:own.filter(d=>enSec(d,"vehiculo")).map(filaDoc)});
  S_.push({id:"seguro",titulo:"Seguro",vacio:"Sin póliza ni facturas de seguro.",filas:[...x.docs.filter(g=>g.categoria==="Seguro").map(gastoFila),...own.filter(d=>enSec(d,"seguro")).map(filaDoc)]});
  S_.push({id:"venta",titulo:"Venta",vacio:vendido(x)?"Sin factura de venta emitida.":"Todavía no se ha vendido.",filas:[
    ...vs.map(f=>({fecha:f.fechaExpedicion,etq:f.tipo==="rectificativa"?"Factura rectificativa":"Factura de venta",nota:[f.codigo,(f.cliente||{}).nombre,eur((f.totales||{}).total),f.anulada?"ANULADA":f.estado==="rectificada"?"Rectificada":""].filter(Boolean).join(" · "),archivos:[],
      gen:[{nombre:`${f.codigo||"factura"}.pdf`,pdf:f.id}],acc:`<button class="btn sm" data-ir-factura="${esc(f.id)}">Abrir factura</button>`})),
    ...cts.map(c=>({fecha:c.fecha,etq:"Contrato de compraventa",nota:[c.numero?"Nº "+c.numero:"",nombreC(c.comprador),((c.firmado||{}).archivos||[]).length?"Firmado":"Pendiente de firma"].filter(Boolean).join(" · "),
      archivos:(c.firmado||{}).archivos||[],falta:!((c.firmado||{}).archivos||[]).length,faltaTxt:"Falta el contrato firmado",acc:`<button class="btn sm" data-veh-contrato="${esc(c.id)}">Abrir contrato</button>`})),
    ...res.map(r=>({fecha:String(r.creada||"").slice(0,10),etq:"Contrato de reserva",nota:[r.comprador||"comprador en blanco",r.precio?eur(r.precio):"",r.senal?"señal "+eur(r.senal):""].filter(Boolean).join(" · "),
      archivos:r.pdf?[{ruta:r.pdf.ruta,nombre:r.pdf.nombre||"Reserva.pdf"}]:[],acc:""}))]});
  S_.push({id:"comprador",titulo:"Comprador",comprador:comp,hint:"DNI/NIE o CIF, documentos de la sociedad y del administrador.",vacio:"Aún no hay DNI ni documentos del comprador.",filas:[
    ...cts.filter(c=>(c.dniComprador||[]).length).map(c=>({fecha:c.fecha,etq:"DNI / NIE del comprador",nota:"Del contrato "+(c.numero||""),archivos:c.dniComprador,acc:""})),
    ...own.filter(d=>enSec(d,"comprador")).map(filaDoc)]});
  S_.push({id:"gestoria",titulo:"Gestoría y cambio de nombre",reg,hint:"Solicitud y mandato, certificados y todo lo enviado a la gestoría.",vacio:"Aún no hay documentos de gestoría.",filas:own.filter(d=>enSec(d,"gestoria")).map(filaDoc)});
  const otros=own.filter(d=>!conocido(d));
  S_.push({id:"otros",titulo:"Otros documentos",vacio:"Sin otros documentos.",filas:otros.map(filaDoc),ocultarVacio:true});
  return S_;
}
function nArchivos(x){let n=0;for(const s of secciones(x))for(const f of s.filas)n+=(f.archivos||[]).length+(f.gen||[]).length;return n}

function detalle(x){
  const l=x.lote,cts=ctsDe(x),secs=secciones(x),mat=x.matricula.startsWith("lote:")?"":x.matricula,pend=pendientes(x);
  const reg=regDe(x),ven=ventasDe(x).sort((a,b)=>String(b.fechaExpedicion).localeCompare(String(a.fechaExpedicion)))[0];
  const tabla=s=>{
    const cab=s.comprador&&(s.comprador.nombre||s.comprador.nif)?`<p style="margin:6px 0">${esc(s.comprador.nombre||"")}${s.comprador.nif?` · <b>${esc(s.comprador.nif)}</b>`:""}${[s.comprador.direccion,s.comprador.cp,s.comprador.municipio,s.comprador.provincia].filter(Boolean).length?` · ${esc([s.comprador.direccion,[s.comprador.cp,s.comprador.municipio].filter(Boolean).join(" "),s.comprador.provincia].filter(Boolean).join(", "))}`:""}${s.comprador.telefono?` · ${esc(s.comprador.telefono)}`:""}${s.comprador.email?` · ${esc(s.comprador.email)}`:""}</p>`:"";
    const gest=s.reg&&(s.reg.enviado||s.reg.completado)?`<div class="aviso ${s.reg.completado?"ok":""}">${s.reg.enviado?`Enviado a la gestoría el ${fecha(s.reg.enviado)}`:""}${s.reg.completado?`${s.reg.enviado?" · ":""}Cambio de nombre hecho el ${fecha(s.reg.completado)}`:""}.</div>`:"";
    return`<div class="card"><div class="row sp"><h3 style="margin:0">${esc(s.titulo)}${s.filas.length?` (${s.filas.length})`:""}</h3>${s.id==="gestoria"&&mat?`<button class="btn sm" data-gest="${esc(mat)}" title="Documentación y datos para el cambio de nombre">Abrir cambio de nombre</button>`:""}</div>
      ${cab}${gest}
      ${s.filas.length?`<div class="tw"><table><tbody>${s.filas.map(f=>`<tr><td style="width:84px">${f.fecha?fecha(f.fecha):""}</td><td><span class="tag acc">${esc(f.etq)}</span></td><td style="white-space:normal">${esc(f.nota)}</td>
        <td style="white-space:normal">${(f.archivos||[]).map(btnArch).join(" ")}${(f.gen||[]).map(g=>`<button class="btn sm" data-veh-pdf="${esc(g.pdf)}">PDF ${esc(nombreCorto(g.nombre,18))}</button>`).join(" ")}${f.sinF?`<span class="tag">Efectivo sin factura</span>`:""}${f.falta?`<span class="tag bad">${esc(f.faltaTxt||"Falta factura")}</span>`:""}</td>
        <td style="white-space:nowrap">${f.acc||""}</td></tr>`).join("")}</tbody></table></div>`
      :`<p class="muted" style="margin:6px 0 0">${esc(s.vacio)}</p>`}
      ${s.hint&&!s.filas.length?`<p class="muted" style="margin:4px 0 0;font-size:12.5px">${esc(s.hint)}</p>`:""}</div>`};
  return`<div class="row sp"><div class="row"><button class="btn sm" data-veh-volver>← Todos los vehículos</button><h1>${mat?`<span class="mat" style="font-size:18px">${esc(mat)}</span>`:"Sin matrícula"} ${esc(x.titulo)}</h1><span class="tag ${vendido(x)?"ok":"acc"}">${estadoTxt(x)}</span></div>
    <span class="row"><button class="btn primary" data-doc-add="${esc(x.matricula)}">+ Añadir documento</button><button class="btn" data-veh-zip title="Descarga todos los archivos del coche ordenados por carpetas">Descargar expediente (ZIP)</button>
      ${mat&&vendido(x)?`<button class="btn" data-venta="${esc(mat)}" title="Factura, contrato, listado, solicitud y mandato y copias para imprimir">Documentos de venta</button>`:""}
      <button class="btn" data-veh-conta="${esc(x.matricula)}">Contabilidad</button></span></div>
  <div class="card"><p class="muted" style="margin:0">${esc([l&&l.vin?"Bastidor "+l.vin:"",l&&l.anio,l&&l.km?miles(String(Math.round(l.km)))+" km":"",l&&l.combustible,l&&l.iva?"Compra en "+l.iva:"",x.compra?"Compra "+eur(x.compra):"",x.gastos?"Gastos "+eur(x.gastos):"",ven?"Venta "+fecha(ven.fechaExpedicion)+" · "+eur((ven.totales||{}).total):""].filter(Boolean).join(" · "))}</p>
    <div class="row" style="margin-top:8px;flex-wrap:wrap">${checks(x).map(c=>chip(c,x)).join(" ")}</div>
    ${pend.length?`<p class="muted" style="margin:8px 0 0">Pendiente: ${pend.map(c=>esc(c[1])).join(", ")}.</p>`:`<p class="muted" style="margin:8px 0 0">El expediente está completo.</p>`}</div>
  ${secs.filter(s=>!(s.ocultarVacio&&!s.filas.length)).map(tabla).join("")}`;
}

/* ---------- ZIP del expediente ---------- */
const limpio=t=>String(t||"").replace(/[\\\/:*?"<>|\u0000-\u001f]+/g," ").replace(/\s+/g," ").trim();
async function zip(x){
  await cargarJSZip();const z=new JSZip(),secs=secciones(x).filter(s=>s.filas.some(f=>(f.archivos||[]).length||(f.gen||[]).length));
  if(!secs.length){toast("Este coche aún no tiene archivos");return}
  const total=secs.reduce((n,s)=>n+s.filas.reduce((m,f)=>m+(f.archivos||[]).length+(f.gen||[]).length,0),0);let i=0;const fallos=[],usados=new Set();
  const nombreLibre=(c,n)=>{let r=`${c}/${n}`,k=2;while(usados.has(r.toLowerCase())){r=`${c}/${n.replace(/(\.[a-z0-9]{2,5})?$/i,m=>` (${k++})${m}`)}`}usados.add(r.toLowerCase());return r};
  let ord=0;
  for(const s of secs){const carpeta=`${String(++ord).padStart(2,"0")} - ${limpio(s.titulo)}`;
    for(const f of s.filas){
      for(const a of f.archivos||[]){toast(`Preparando ${++i}/${total}…`,30000);
        try{z.file(nombreLibre(carpeta,limpio(a.nombre||"archivo")),await HUELSAN.bajar("documentos",a.ruta))}catch(e){fallos.push(a.nombre||a.ruta)}}
      for(const g of f.gen||[]){toast(`Preparando ${++i}/${total}…`,30000);
        try{const fa=S.facturas.get(g.pdf);z.file(nombreLibre(carpeta,limpio(g.nombre)),(await pdfFactura(fa)).output("blob"))}catch(e){fallos.push(g.nombre)}}}}
  const mat=x.matricula.startsWith("lote:")?"":x.matricula;
  descargarBlob(await z.generateAsync({type:"blob"}),`Expediente ${limpio([mat,x.titulo].filter(Boolean).join(" ")||"vehiculo")}.zip`);
  toast(fallos.length?`Descargado, pero no se pudieron incluir: ${fallos.join(", ")}`:"Expediente descargado",fallos.length?8000:4000);
}

/* ---------- eventos ---------- */
document.addEventListener("click",e=>{
  const t=e.target;
  const ir=t.closest("[data-veh-ir]");if(ir){e.preventDefault();e.stopPropagation();V.sel=ir.dataset.vehIr;S.tab="vehiculos";S.ed=null;S.edSucio=false;S.mat=null;history.replaceState(null,"","?tab=vehiculos");pintarTabs();pintar();scrollTo(0,0);return}
  if(S.tab!=="vehiculos")return;
  const c=t.closest("[data-veh]");if(c){V.sel=c.dataset.veh;pintar();scrollTo(0,0);return}
  if(t.closest("[data-veh-volver]")){V.sel=null;pintar();return}
  const zp=t.closest("[data-veh-zip]");if(zp){e.stopPropagation();const x=porMatricula().find(y=>y.matricula===V.sel);if(x)zip(x).catch(err=>toast(err.message||String(err),6000));return}
  const pf=t.closest("[data-veh-pdf]");if(pf){e.stopPropagation();const f=S.facturas.get(pf.dataset.vehPdf);if(f)descargarPDF(f).catch(err=>toast(err.message||String(err),6000));return}
  const ct=t.closest("[data-veh-contrato]");if(ct){e.stopPropagation();const k=(window.HuelsanContratos?HuelsanContratos.lista():[]).find(y=>y.id===ct.dataset.vehContrato);if(k)HuelsanContratos.abrir(k);return}
  const cn=t.closest("[data-veh-conta]");if(cn){e.stopPropagation();S.tab="matriculas";S.mat=cn.dataset.vehConta;history.replaceState(null,"","?tab=matriculas");pintarTabs();pintar();scrollTo(0,0);return}
},true);
const vista_=document.getElementById("vista");
vista_.addEventListener("input",e=>{const t=e.target;if(S.tab!=="vehiculos"||t.dataset.vq==null)return;V.q=t.value;const pos=t.selectionStart;pintar();const n=document.querySelector("[data-vq]");if(n){n.focus();n.setSelectionRange(pos,pos)}});
vista_.addEventListener("change",e=>{const t=e.target;if(S.tab!=="vehiculos")return;
  if(t.dataset.vest!=null){V.est=t.value;pintar()}else if(t.dataset.vfalta!=null){V.falta=t.checked?"1":"";pintar()}});

window.HuelsanVehiculos={vista,reset:()=>{V.sel=null},abrir:m=>{V.sel=m},_t:{secciones,checks,lista}};
})();
