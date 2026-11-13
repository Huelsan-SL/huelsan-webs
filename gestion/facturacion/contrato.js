/* Huelsan Automoción · Contrato de compraventa de vehículo de ocasión (módulo de Facturación).
   Se carga después de facturacion.js y lo amplía sin tocarlo por dentro:
   - Pestaña «Contratos»: lista, contrato en blanco y editor (todos los campos opcionales).
   - Botón «Contrato de compraventa» en cada factura: crea o abre el contrato con los datos de la factura.
   - PDF A4 de 2 páginas como máximo (jsPDF). Lo que no se rellena sale en blanco (líneas y casillas) para completarlo a mano con el cliente.
   Datos: ajustes «contratos/<id>» y representantes en «contratoscfg/representantes». Ubicaciones: «config/ubicaciones» (la misma lista que la ficha del coche).
   Normativa: garantía de 1 año pactada (art. 120.1 RDL 1/2007, bienes de segunda mano) y presunción de 1 año (art. 121); desistimiento solo a distancia (arts. 102 y ss.);
   cambio de titularidad en 30 días (Reglamento General de Vehículos); efectivo máx. 1.000 € (Ley 7/2012); REBU (arts. 135-139 Ley 37/1992); RGPD y LO 3/2018. */
(function(){
"use strict";
const CT={lista:new Map(),ed:null,sucio:false,reps:{},ubics:["Huelva","Murcia"],forzar:false};
const REPS_DEF={francisco:{nombre:"Francisco José Álvarez González",dni:"49107393R",cargo:"",dniArchivos:[]},gustavo:{nombre:"Gustavo Fornell Lacida",dni:"48121035K",cargo:"",dniArchivos:[]}};
const DOCS=[["permiso","Permiso de circulación"],["ficha","Tarjeta ITV (ficha técnica)"],["itv","Informe ITV en vigor"],["factura","Factura de compraventa"],["libro","Libro de mantenimiento"],["manual","Manual de usuario"],["llaves","Llaves"],["garantia","Documento de garantía"],["dgt","Informe DGT del vehículo"]];
const MEDIOS=["Transferencia bancaria","Financiación","Tarjeta","Efectivo","Bizum","Mixto"];
const get=(o,r)=>r.split(".").reduce((x,k)=>x==null?x:x[k],o);

/* ---------- carga ---------- */
(async function esperar(){
  if(!S.db){setTimeout(esperar,150);return}
  S.db.collection("contratos").onSnapshot(sn=>{CT.lista.clear();sn.docs.forEach(d=>CT.lista.set(d.id,{...d.data(),id:d.id}));if(S.tab==="contratos"&&!CT.ed)pintar()},e=>console.error(e));
  S.db.doc("contratoscfg/representantes").onSnapshot(sn=>{const d=sn&&sn.exists&&sn.data&&sn.data();CT.reps=d&&d.francisco?d:JSON.parse(JSON.stringify(REPS_DEF));if(S.tab==="contratos"&&!CT.ed)pintar()},()=>{CT.reps=JSON.parse(JSON.stringify(REPS_DEF))});
  S.db.doc("config/ubicaciones").onSnapshot(sn=>{const d=sn&&sn.exists&&sn.data&&sn.data();if(d&&Array.isArray(d.lista))CT.ubics=d.lista.filter(x=>typeof x==="string"&&x.trim())},()=>{});
})();

/* ---------- integración con facturacion.js ---------- */
const _pintar=pintar;
pintar=function(){
  if(S.tab!=="contratos")return _pintar();
  if(CT.ed&&!CT.forzar)return; // no repintar el editor por cambios de la base de datos (se perdería el foco)
  CT.forzar=false;$("#vista").innerHTML=CT.ed?vistaEditorC():vistaLista();
};
const repintar=()=>{CT.forzar=true;const y=scrollY;pintar();scrollTo(0,y)};
$("nav.tabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b)return;
  if(CT.ed&&CT.sucio&&b.dataset.tab!=="contratos"&&!confirm("Hay cambios sin guardar en el contrato. ¿Salir sin guardarlos?")){e.stopImmediatePropagation();return}
  CT.ed=null;CT.sucio=false},true);
const _vistaEditor=vistaEditor;
vistaEditor=function(){const h=_vistaEditor();const ex=[...CT.lista.values()].find(c=>c.facturaId===S.ed.id);
  return h.replace('<div class="bar">',`<div class="bar"><button class="btn" data-ct="desde-factura">${ex?"Ver contrato de compraventa":"Contrato de compraventa"}</button>`)};

/* ---------- datos ---------- */
function contratoVacio(){
  return{id:nid(),numero:"",ubicacion:"",fecha:"",hora:"",rep:"",vendedor:{nombre:"",dni:"",cargo:""},
    comprador:{tipo:"",nombre:"",apellidos:"",dni:"",domicilio:"",cp:"",municipio:"",provincia:"",telefono:"",email:"",razonSocial:"",cif:"",domicilioEmpresa:"",cargo:""},
    vehiculo:{marca:"",modelo:"",version:"",matricula:"",bastidor:"",fechaMatric:"",km:"",combustible:"",cambio:"",cv:"",color:"",etiqueta:"",itvHasta:"",llaves:""},
    defectos:"",aceptaDefectos:false,
    precio:{regimen:"",base:"",cuota:"",total:"",letra:"",gastos:"",gastosImporte:""},
    pago:{senal:"",senalFecha:"",medio:"",fechaLimite:"",entidad:"",financiado:"",detalle:""},
    permuta:{marcaModelo:"",matricula:"",bastidor:"",km:"",valor:""},
    entrega:{fecha:"",hora:"",lugar:""},docs:{},transferencia:"",dniComprador:[],contratacion:"establecimiento",observaciones:"",
    creado:new Date().toISOString()};
}
const loteDe=id=>S.lotes.find(x=>x.id===id);
function cocheEnContrato(c,l){
  const v=vehiculoDe(l);
  Object.assign(c.vehiculo,{marca:v.marca,modelo:v.modelo,version:v.version,matricula:v.matricula,bastidor:v.bastidor,km:v.km?String(Math.round(+v.km)):"",fechaMatric:String(v.fechaMatric||"").slice(0,10),
    color:v.color,combustible:l.combustible||"",cambio:l.cambio||"",cv:l.cv?String(l.cv):"",etiqueta:l.etiquetaDGT||""});
  c.loteId=l.id;
  if(!c.ubicacion&&l.ubicacionVenta)c.ubicacion=l.ubicacionVenta;
  if(!c.precio.total&&+l.precioVenta)c.precio.total=String(l.precioVenta);
  if(!c.precio.regimen){const rc=regimenCompra(l);if(rc)c.precio.regimen=rc.iva==="REBU"?"rebu":"general"}
}
function desdeFactura(f,c){
  c=c||contratoVacio();c.facturaId=f.id;c.facturaCodigo=f.codigo||"";
  if(f.codigo&&!c.numero)c.numero=f.codigo;
  const cl=f.cliente||{};const emp=cl.tipo==="empresa"||/^[ABCDEFGHJNPQRSUVW]/.test(nifLimpio(cl.nif));
  if(cl.nombre){
    c.comprador.tipo=emp?"empresa":"particular";
    if(emp)Object.assign(c.comprador,{razonSocial:cl.nombre,cif:cl.nif||"",domicilioEmpresa:[cl.direccion,[cl.cp,cl.municipio].filter(Boolean).join(" "),cl.provincia].filter(Boolean).join(", ")});
    else{const g=S.clientes.get(f.clienteId);
      Object.assign(c.comprador,{nombre:g&&g.nombre?g.nombre:cl.nombre,apellidos:g&&g.nombre?(g.apellidos||""):"",dni:cl.nif||"",domicilio:cl.direccion||"",cp:cl.cp||"",municipio:cl.municipio||"",provincia:cl.provincia||""})}
    Object.assign(c.comprador,{telefono:cl.telefono||c.comprador.telefono,email:cl.email||c.comprador.email});
  }
  const v=f.vehiculo||{};const l=v.loteId&&loteDe(v.loteId);
  if(l)cocheEnContrato(c,l);
  Object.assign(c.vehiculo,Object.fromEntries(Object.entries({marca:v.marca,modelo:v.modelo,version:v.version,matricula:v.matricula,bastidor:v.bastidor,km:v.km?String(Math.round(+v.km)):"",fechaMatric:String(v.fechaMatric||"").slice(0,10),color:v.color,combustible:v.combustible}).filter(([,x])=>x)));
  const t=f.totales||calcular(f.lineas||[]);const coche=(f.lineas||[]).find(x=>x.coche)||(f.lineas||[])[0];
  if(t.total){c.precio.total=String(r2(t.total));
    c.precio.regimen=coche&&String(coche.iva)==="REBU"?"rebu":"general";
    if(c.precio.regimen==="general"){c.precio.base=String(r2(t.grupos.reduce((s,g)=>s+g.base,0)));c.precio.cuota=String(r2(t.grupos.reduce((s,g)=>s+g.cuota,0)))}
    c.precio.letra=enLetra(t.total)}
  if((f.lineas||[]).some(x=>/transferencia/i.test(x.concepto||"")))c.precio.gastos="incluidos";
  if(f.formaPago){const m={"Transferencia bancaria":"Transferencia bancaria","Efectivo":"Efectivo","Tarjeta":"Tarjeta","Financiación":"Financiación","Bizum":"Bizum"}[f.formaPago];c.pago.medio=m||"Mixto";if(!m)c.pago.detalle=f.formaPago}
  if(f.vencimiento)c.pago.fechaLimite=f.vencimiento;
  if(!c.fecha)c.fecha=f.fechaOperacion||"";
  return c;
}
/* número en letra (euros y céntimos) */
function enLetra(n){
  n=r2(n);if(!(n>0))return"";
  const U=["","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve","veinte","veintiuno","veintidós","veintitrés","veinticuatro","veinticinco","veintiséis","veintisiete","veintiocho","veintinueve"];
  const D=["","","","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"];
  const C=["","ciento","doscientos","trescientos","cuatrocientos","quinientos","seiscientos","setecientos","ochocientos","novecientos"];
  const cien=x=>{if(x===0)return"";if(x===100)return"cien";const c=Math.floor(x/100),r=x%100;let s=C[c];
    if(r){s+=(s?" ":"")+(r<30?U[r]:D[Math.floor(r/10)]+(r%10?" y "+U[r%10]:""))}return s};
  const ent=Math.floor(n),cts=Math.round((n-ent)*100);
  const mill=Math.floor(ent/1e6),mil=Math.floor(ent%1e6/1000),res=ent%1000;
  let s=[];if(mill)s.push(mill===1?"un millón":cien(mill).replace(/uno$/,"un")+" millones");
  if(mil)s.push(mil===1?"mil":cien(mil).replace(/uno$/,"ún").replace(/veintiún$/,"veintiún")+" mil");
  if(res)s.push(cien(res));
  let out=(s.join(" ")||"cero").replace(/uno$/,"un")+(ent===1?" euro":" euros");
  if(cts)out+=" con "+cien(cts).replace(/uno$/,"un")+(cts===1?" céntimo":" céntimos");
  return out.charAt(0).toUpperCase()+out.slice(1);
}

/* ---------- vistas ---------- */
const nombreComprador=c=>{const p=c.comprador||{};const pers=[p.nombre,p.apellidos].filter(Boolean).join(" ");return p.tipo==="empresa"&&p.razonSocial?p.razonSocial+(pers?" ("+pers+")":""):pers||p.razonSocial||""};
const listaArch=(arr,quien)=>`<div class="files">${(arr||[]).map((a,i)=>`<div><span>${esc(a.nombre||"Copia")} <span class="muted">${a.size?Math.round(a.size/1024)+" KB":""}</span></span><span class="row"><button class="btn sm" data-ver-archivo="${esc(a.ruta)}" data-nombre="${esc(a.nombre||"dni.jpg")}">Ver</button><button class="btn sm" data-ct-quitar="${esc(quien)}|${i}">Quitar</button></span></div>`).join("")||`<span class="muted">Sin copia: en el contrato sale una página con recuadros para grapar la fotocopia.</span>`}</div>`;
const dniSi=(c,q)=>c["dniPag"+q]!=null?c["dniPag"+q]!==false:c.incluirDNI!==false; // por defecto se añaden
function vistaLista(){
  const ls=[...CT.lista.values()].sort((a,b)=>String(b.fecha||b.creado||"").localeCompare(String(a.fecha||a.creado||"")));
  const facts=[...S.facturas.values()].sort((a,b)=>String(b.fechaExpedicion||"").localeCompare(String(a.fechaExpedicion||""))).slice(0,80);
  const r=CT.reps||REPS_DEF;
  return`<div class="row sp"><div><h1>Contratos de compraventa</h1><p class="muted" style="margin:4px 0 0">PDF de 2 páginas. Lo que no rellenes sale en blanco para completarlo a mano con el cliente.</p></div>
    <div class="row"><button class="btn primary" data-ct="nuevo">+ Contrato en blanco</button>
      <select data-ct-change="desde-factura" style="width:auto;max-width:340px"><option value="">Crear desde una factura…</option>${facts.map(f=>`<option value="${esc(f.id)}">${esc(f.codigo||"Borrador")} · ${esc((f.cliente||{}).nombre||"sin cliente")} · ${esc((f.vehiculo||{}).matricula||"")}</option>`).join("")}</select></div></div>
  ${ls.length?`<div class="tw"><table><thead><tr><th>Nº</th><th>Fecha</th><th>Comprador</th><th>Vehículo</th><th>Ubicación</th><th>Factura</th></tr></thead><tbody>
    ${ls.map(c=>`<tr data-ct-abrir="${esc(c.id)}" style="cursor:pointer"><td>${esc(c.numero||"—")}</td><td>${fecha(c.fecha)}</td><td>${esc(nombreComprador(c)||"—")}</td>
      <td>${esc([c.vehiculo.marca,c.vehiculo.modelo].filter(Boolean).join(" ")||"—")} ${c.vehiculo.matricula?`<span class="mat">${esc(c.vehiculo.matricula)}</span>`:""}</td><td>${esc(c.ubicacion||"—")}</td><td>${esc(c.facturaCodigo||(c.facturaId?"Borrador":"—"))}</td></tr>`).join("")}</tbody></table></div>`
    :`<div class="vacio">Aún no hay contratos. Crea uno en blanco o desde una factura (también con el botón «Contrato de compraventa» dentro de cada factura).</div>`}
  <div class="card"><h3>Representantes de Huelsan (firman por la empresa)</h3>
    ${["francisco","gustavo"].map(k=>`<div class="g3"><label>Nombre y apellidos<input data-rep="${k}.nombre" value="${esc((r[k]||{}).nombre||"")}"></label><label>DNI / NIE<input data-rep="${k}.dni" value="${esc((r[k]||{}).dni||"")}"></label><label>Cargo <small>administrador, apoderado…</small><input data-rep="${k}.cargo" value="${esc((r[k]||{}).cargo||"")}"></label></div>
      <div class="row sp"><span class="muted">Copia del DNI de ${esc(((r[k]||{}).nombre||k).split(" ")[0])} (anverso y reverso):</span><label class="btn sm" style="display:inline-flex;color:var(--ink)">Subir foto o PDF<input type="file" data-ct-file="rep:${k}" accept="image/*,application/pdf" multiple hidden></label></div>${listaArch((r[k]||{}).dniArchivos,"rep:"+k)}`).join("")}
    <div class="row"><button class="btn" data-ct="guardar-reps">Guardar representantes</button><span class="muted">Se copian en cada contrato al elegir quién firma. La copia del DNI sale en una página aparte del contrato.</span></div></div>`;
}
const inp=(ruta,lab,o={})=>{const v=get(CT.ed,ruta);return`<label${o.cls?` class="${o.cls}"`:""}>${lab}${o.small?` <small>${o.small}</small>`:""}<input data-c="${ruta}" value="${esc(v??"")}"${o.type?` type="${o.type}"`:""}${o.list?` list="${o.list}"`:""}${o.ph?` placeholder="${esc(o.ph)}"`:""}${o.num?' inputmode="decimal"':""}></label>`};
const sel=(ruta,lab,ops)=>{const v=get(CT.ed,ruta)||"";return`<label>${lab}<select data-c="${ruta}"><option value="">— En blanco —</option>${ops.map(o=>{const[k,t]=Array.isArray(o)?o:[o,o];return`<option value="${esc(k)}" ${v===k?"selected":""}>${esc(t)}</option>`}).join("")}</select></label>`};
const seg=(ruta,ops)=>`<div class="seg">${ops.map(([k,t])=>`<label><input type="radio" name="${ruta}" data-c="${ruta}" value="${esc(k)}" ${(get(CT.ed,ruta)||"")===k?"checked":""}> ${esc(t)}</label>`).join("")}</div>`;
function vistaEditorC(){
  const c=CT.ed,p=c.comprador,emp=p.tipo==="empresa";
  const ubics=[...new Set([...CT.ubics,...[...CT.lista.values()].map(x=>x.ubicacion),...S.lotes.map(l=>l.ubicacionVenta)].filter(x=>x&&String(x).trim()))].sort((a,b)=>a.localeCompare(b,"es"));
  const lotesOpc=S.lotes.filter(l=>l.matricula||l.marca).sort((a,b)=>(["stock","comprado"].includes(b.estado)?1:0)-(["stock","comprado"].includes(a.estado)?1:0));
  const efectivo=c.pago.medio==="Efectivo"&&+c.precio.total>=LIM_EFECTIVO;
  return`<div class="row sp"><div class="row"><button class="btn sm" data-ct="volver">← Contratos</button><h1>Contrato ${esc(c.numero||"")}</h1>${c.facturaId?`<span class="tag acc">Factura ${esc(c.facturaCodigo||"borrador")}</span>`:""}</div>
    <span class="muted">Todo es opcional: lo vacío sale en blanco en el PDF.</span></div>
  <datalist id="ct-ubics">${ubics.map(u=>`<option value="${esc(u)}">`).join("")}</datalist>
  <div class="card"><h3>Contrato</h3><div class="g4">
    ${inp("numero","Nº de contrato")}${inp("ubicacion","Ubicación de la compra",{list:"ct-ubics",ph:"Ej.: Murcia",small:"lugar donde se firma"})}${inp("fecha","Fecha",{type:"date"})}${inp("hora","Hora",{type:"time"})}</div>
    <div class="row"><span class="muted">Modalidad:</span>${seg("contratacion",[["establecimiento","En nuestras instalaciones"],["distancia","A distancia / fuera del establecimiento"]])}<span class="muted">${c.contratacion==="distancia"?"Se añade el derecho de desistimiento de 14 días.":""}</span></div></div>
  <div class="g2">
    <div class="card"><h3>Vendedor · ${esc((S.emisor||{}).razonSocial||"Huelsan SL")}</h3>
      <p class="muted" style="margin:0">Razón social, CIF, domicilio y registro salen de «Datos fiscales».</p>
      <label>Firma por Huelsan<select data-ct-change="rep"><option value="">— En blanco —</option>${["francisco","gustavo"].map(k=>`<option value="${k}" ${c.rep===k?"selected":""}>${esc(((CT.reps||{})[k]||REPS_DEF[k]).nombre)}</option>`).join("")}</select></label>
      <div class="g3">${inp("vendedor.nombre","Nombre y apellidos")}${inp("vendedor.dni","DNI / NIE")}${inp("vendedor.cargo","Cargo")}</div>
      ${(()=>{const n=c.rep&&((CT.reps||{})[c.rep]||{}).dniArchivos?CT.reps[c.rep].dniArchivos.length:0;return`<p class="muted" style="margin:0">Copia del DNI del vendedor: ${n?`${n} ${n===1?"imagen guardada":"imágenes guardadas"} en «Representantes»`:"sin copia (se sube en la lista de Contratos → Representantes); sale una página con recuadros"}.</p>`})()}</div>
    <div class="card"><div class="row sp"><h3>Comprador</h3>${seg("comprador.tipo",[["","Sin indicar"],["particular","Particular"],["empresa","Empresa"]])}</div>
      <label>Coger de un cliente guardado<select data-ct-change="cliente"><option value="">— Elige —</option>${[...S.clientes.values()].sort((a,b)=>nombreCliente(a).localeCompare(nombreCliente(b))).map(x=>`<option value="${esc(x.id)}">${esc(nombreCliente(x))} · ${esc(x.nif||"")}</option>`).join("")}</select></label>
      ${emp?`<div class="g3">${inp("comprador.razonSocial","Razón social")}${inp("comprador.cif","CIF")}${inp("comprador.cargo","Cargo de quien firma")}</div>${inp("comprador.domicilioEmpresa","Domicilio social")}<p class="muted" style="margin:0">Persona que firma en nombre de la empresa:</p>`:""}
      <div class="g3">${inp("comprador.nombre","Nombre")}${inp("comprador.apellidos","Apellidos")}${inp("comprador.dni","DNI / NIE")}</div>
      ${inp("comprador.domicilio","Domicilio")}
      <div class="g3">${inp("comprador.cp","C. P.")}${inp("comprador.municipio","Localidad")}${inp("comprador.provincia","Provincia")}</div>
      <div class="g2">${inp("comprador.telefono","Teléfono")}${inp("comprador.email","Correo")}</div>
      <div class="row sp"><b style="font-size:13px">Copia del DNI del comprador</b><label class="btn sm" style="display:inline-flex;color:var(--ink)">Subir foto o PDF<input type="file" data-ct-file="comprador" accept="image/*,application/pdf" multiple hidden></label></div>
      ${listaArch(c.dniComprador,"comprador")}</div></div>
  <div class="card"><div class="row sp"><h3>Vehículo</h3><label style="flex:1 1 320px;max-width:520px">Coger datos de un coche de la app<select data-ct-change="lote"><option value="">— Elige un coche —</option>${lotesOpc.map(l=>`<option value="${esc(l.id)}" ${c.loteId===l.id?"selected":""}>${esc([l.marca,l.modelo].filter(Boolean).join(" "))} · ${esc(l.matricula||"sin matrícula")}</option>`).join("")}</select></label></div>
    <div class="g4">${inp("vehiculo.marca","Marca")}${inp("vehiculo.modelo","Modelo")}${inp("vehiculo.version","Versión")}${inp("vehiculo.color","Color")}</div>
    <div class="g4">${inp("vehiculo.matricula","Matrícula")}${inp("vehiculo.bastidor","Nº de bastidor (VIN)")}${inp("vehiculo.fechaMatric","1ª matriculación",{type:"date"})}<label>Kilómetros <small>se rellenan a mano en el contrato</small><input value="" placeholder="A mano" disabled></label></div>
    <div class="g4">${inp("vehiculo.combustible","Combustible")}${inp("vehiculo.cambio","Cambio")}${inp("vehiculo.cv","Potencia (CV)",{num:1})}${inp("vehiculo.etiqueta","Distintivo DGT")}</div>
    <div class="g4">${inp("vehiculo.itvHasta","ITV válida hasta",{type:"date"})}${inp("vehiculo.llaves","Nº de llaves",{num:1})}</div>
    <label>Defectos y particularidades conocidos <small>se aceptan expresamente y no cuentan como falta de conformidad; vacío = líneas para escribir a mano</small><textarea data-c="defectos" rows="2">${esc(c.defectos||"")}</textarea></label>
    <label style="flex-direction:row;display:flex;gap:6px;align-items:center;color:var(--ink);font-weight:500"><input type="checkbox" data-c="aceptaDefectos" ${c.aceptaDefectos?"checked":""} style="width:auto"> Marcar ya la casilla «el comprador acepta los defectos» (si no, sale vacía para marcarla a mano)</label></div>
  <div class="card"><h3>Precio y pago</h3>
    <div class="row"><span class="muted">Régimen:</span>${seg("precio.regimen",[["","Sin indicar"],["rebu","REBU"],["general","IVA general"]])}</div>
    <div class="g4">${c.precio.regimen==="general"?inp("precio.base","Base imponible (€)",{num:1})+inp("precio.cuota","Cuota IVA (€)",{num:1}):""}${inp("precio.total","Precio total (€)",{num:1})}<label>Precio en letra<span class="row" style="gap:4px;flex-wrap:nowrap"><input data-c="precio.letra" value="${esc(c.precio.letra||"")}"><button class="btn sm" data-ct="letra" title="Escribir el precio en letra">Auto</button></span></label></div>
    <div class="row"><span class="muted">Gastos de transferencia:</span>${seg("precio.gastos",[["","Sin indicar"],["incluidos","Incluidos en el precio"],["comprador","A cargo del comprador"]])}${c.precio.gastos==="comprador"?`<span style="width:160px">${inp("precio.gastosImporte","Importe (€)",{num:1})}</span>`:""}</div>
    <div class="g4">${inp("pago.senal","Señal entregada (€)",{num:1})}${inp("pago.senalFecha","Fecha de la señal",{type:"date"})}${sel("pago.medio","Medio de pago",MEDIOS)}${inp("pago.fechaLimite","Fecha límite de pago",{type:"date"})}</div>
    ${c.pago.medio==="Financiación"?`<div class="g2">${inp("pago.entidad","Entidad financiera")}${inp("pago.financiado","Importe financiado (€)",{num:1})}</div>`:""}
    ${c.pago.medio==="Mixto"?inp("pago.detalle","Detalle del pago"):""}
    ${efectivo?`<div class="aviso bad">Pago en efectivo: con empresarios el máximo legal es inferior a 1.000 € (Ley 7/2012). Cobra el resto por banco.</div>`:""}
    <p class="muted" style="margin:0">Vehículo entregado como parte del pago (si lo hay):</p>
    <div class="g4">${inp("permuta.marcaModelo","Marca y modelo")}${inp("permuta.matricula","Matrícula")}${inp("permuta.bastidor","Nº bastidor")}${inp("permuta.valor","Valor de tasación (€)",{num:1})}</div></div>
  <div class="g2">
    <div class="card"><h3>Entrega</h3><div class="g3">${inp("entrega.fecha","Fecha",{type:"date"})}${inp("entrega.hora","Hora",{type:"time"})}${inp("entrega.lugar","Lugar",{list:"ct-ubics"})}</div>
      <p class="muted" style="margin:0">Documentación entregada (las que no marques salen como casilla vacía para marcar a mano):</p>
      <div class="g3">${DOCS.map(([k,t])=>`<label style="flex-direction:row;display:flex;gap:6px;align-items:center;color:var(--ink);font-weight:500"><input type="checkbox" data-c="docs.${k}" ${c.docs[k]?"checked":""} style="width:auto"> ${t}</label>`).join("")}</div></div>
    <div class="card"><h3>Transferencia y otros</h3>
      <div class="row"><span class="muted">Gestiona el cambio de titular:</span>${seg("transferencia",[["","Sin indicar"],["huelsan","Huelsan"],["comprador","El comprador"]])}</div>
            <label>Observaciones y pactos adicionales<textarea data-c="observaciones" rows="3">${esc(c.observaciones||"")}</textarea></label></div></div>
  <div class="bar"><button class="btn" data-ct="guardar">Guardar</button><button class="btn primary" data-ct="pdf">Descargar PDF</button>
    <span class="muted">Añadir copia del DNI:</span><label style="flex-direction:row;display:flex;gap:6px;align-items:center;color:var(--ink);font-weight:500"><input type="checkbox" data-c="dniPagComprador" ${dniSi(c,"Comprador")?"checked":""} style="width:auto"> comprador</label><label style="flex-direction:row;display:flex;gap:6px;align-items:center;color:var(--ink);font-weight:500"><input type="checkbox" data-c="dniPagVendedor" ${dniSi(c,"Vendedor")?"checked":""} style="width:auto"> vendedor</label>
    ${c.facturaId&&S.facturas.has(c.facturaId)?`<button class="btn" data-ct="refrescar">Volver a coger datos de la factura</button><button class="btn" data-ct="ir-factura">Ir a la factura</button>`:""}
    <span style="flex:1"></span>${CT.lista.has(c.id)?`<button class="btn peligro" data-ct="borrar">Borrar contrato</button>`:""}</div>`;
}

/* ---------- eventos ---------- */
const NUM_RUTAS=/^(precio\.(base|cuota|total|gastosImporte)|pago\.(senal|financiado)|permuta\.valor|vehiculo\.(km|cv|llaves))$/;
const REPINTA=/^(comprador\.tipo|precio\.regimen|precio\.gastos|pago\.medio|contratacion|transferencia)$/;
function escribir(t){
  const r=t.dataset.c;let v=t.type==="checkbox"?t.checked:t.value;
  if(NUM_RUTAS.test(r))v=String(v).replace(/\s/g,"").replace(",",".");
  if(r==="vehiculo.matricula")v=normMat(v);if(r==="vehiculo.bastidor")v=String(v).toUpperCase().replace(/\s/g,"");
  setRuta(CT.ed,r,v);CT.sucio=true;
  if(r==="ubicacion"&&!CT.ed.entrega.lugar){CT.ed.entrega.lugar=v}
  return r;
}
$("#vista").addEventListener("input",e=>{const t=e.target;if(S.tab!=="contratos"||!CT.ed||!t.dataset.c||t.type==="radio"||t.type==="checkbox")return;escribir(t)});
$("#vista").addEventListener("change",e=>{const t=e.target;if(S.tab!=="contratos")return;
  if(t.dataset.ctChange==="desde-factura"){const f=S.facturas.get(t.value);if(f)abrirDesdeFactura(f);return}
  if(t.dataset.ctFile){const files=[...t.files];t.value="";if(files.length)subirCopias(t.dataset.ctFile,files).catch(err=>toast(err.message||String(err),6000));return}
  if(!CT.ed)return;
  if(t.dataset.c){const r=escribir(t);if(t.type==="radio"||t.tagName==="SELECT"||REPINTA.test(r))repintar();return}
  const a=t.dataset.ctChange;
  if(a==="rep"){CT.ed.rep=t.value;const r=(CT.reps||{})[t.value]||REPS_DEF[t.value];CT.ed.vendedor=r?{nombre:r.nombre||"",dni:r.dni||"",cargo:r.cargo||""}:{nombre:"",dni:"",cargo:""};CT.sucio=true;repintar()}
  if(a==="lote"){const l=loteDe(t.value);if(l){cocheEnContrato(CT.ed,l);if(!CT.ed.entrega.lugar&&CT.ed.ubicacion)CT.ed.entrega.lugar=CT.ed.ubicacion;CT.sucio=true;repintar()}}
  if(a==="cliente"){const g=S.clientes.get(t.value);if(!g)return;const p=CT.ed.comprador;
    if(g.tipo==="empresa")Object.assign(p,{tipo:"empresa",razonSocial:g.razonSocial||"",cif:nifLimpio(g.nif),domicilioEmpresa:[g.direccion,[g.cp,g.municipio].filter(Boolean).join(" "),g.provincia].filter(Boolean).join(", ")});
    else Object.assign(p,{tipo:"particular",nombre:g.nombre||"",apellidos:g.apellidos||"",dni:nifLimpio(g.nif),domicilio:g.direccion||"",cp:g.cp||"",municipio:g.municipio||"",provincia:g.provincia||""});
    Object.assign(p,{telefono:g.telefono||"",email:g.email||""});CT.sucio=true;repintar()}
});
function abrir(c){CT.ed=JSON.parse(JSON.stringify(c));CT.sucio=false;S.tab="contratos";S.ed=null;S.edSucio=false;history.replaceState(null,"","?tab=contratos");pintarTabs();repintar();scrollTo(0,0)}
function abrirDesdeFactura(f){const ex=[...CT.lista.values()].find(c=>c.facturaId===f.id);if(ex)return abrir(ex);const c=desdeFactura(f);abrir(c);CT.sucio=true}
document.addEventListener("click",async e=>{
  const t=e.target;
  const ab=t.closest("[data-ct-abrir]");if(ab&&S.tab==="contratos"&&!CT.ed){const c=CT.lista.get(ab.dataset.ctAbrir);if(c)abrir(c);return}
  const qa=t.closest("[data-ct-quitar]");if(qa){e.preventDefault();const[quien,i]=qa.dataset.ctQuitar.split("|");quitarCopia(quien,+i).catch(err=>toast(err.message||String(err),6000));return}
  const b=t.closest("[data-ct]");if(!b)return;e.preventDefault();const a=b.dataset.ct;
  try{
    if(a==="desde-factura"){if(S.edSucio&&S.ed.estado==="borrador"&&!confirm("La factura tiene cambios sin guardar. El contrato se hará con los datos que ves ahora. ¿Seguir sin guardar la factura?"))return;abrirDesdeFactura(S.ed)}
    else if(a==="nuevo"){abrir(contratoVacio());CT.sucio=true}
    else if(a==="volver"){if(CT.sucio&&!confirm("Hay cambios sin guardar. ¿Salir sin guardarlos?"))return;CT.ed=null;CT.sucio=false;repintar()}
    else if(a==="guardar"){await guardarC();toast("Contrato guardado")}
    else if(a==="pdf"){if(CT.sucio)await guardarC();await descargarContrato(CT.ed)}
    else if(a==="letra"){CT.ed.precio.letra=enLetra(+CT.ed.precio.total);CT.sucio=true;repintar()}
    else if(a==="refrescar"){const f=S.facturas.get(CT.ed.facturaId);if(f&&confirm("Se sustituyen comprador, vehículo y precio por los de la factura. ¿Seguir?")){desdeFactura(f,CT.ed);CT.sucio=true;repintar();toast("Datos de la factura cogidos")}}
    else if(a==="ir-factura"){if(CT.sucio&&!confirm("Hay cambios sin guardar. ¿Salir sin guardarlos?"))return;const id=CT.ed.facturaId;CT.ed=null;CT.sucio=false;S.tab="facturas";pintarTabs();abrirFactura(id)}
    else if(a==="borrar"){if(await confirmar("¿Borrar este contrato?","Solo se borra el contrato; la factura no cambia.","Borrar")){for(const x of CT.ed.dniComprador||[])await HUELSAN.borrarArchivo("documentos",x.ruta).catch(()=>{});await S.db.doc("contratos/"+CT.ed.id).delete();CT.ed=null;CT.sucio=false;repintar();toast("Contrato borrado")}}
    else if(a==="guardar-reps"){await guardarReps(repsDelFormulario());toast("Representantes guardados")}
  }catch(err){toast(err.message||String(err),6000)}
});
/* ---------- copias del DNI (almacén privado «documentos», como imágenes JPEG) ---------- */
const BASE=new URL("../",location.href).href;
async function pdfjs(){if(window.__pdfjs)return window.__pdfjs;const lib=await import(BASE+"pdf.min.mjs");
  if(!globalThis.pdfjsWorker)globalThis.pdfjsWorker=await import(BASE+"pdf.worker.min.mjs");lib.GlobalWorkerOptions.workerSrc=BASE+"pdf.worker.min.mjs";return window.__pdfjs=lib}
const aJPEG=cv=>new Promise((ok,ko)=>cv.toBlob(b=>b?ok(b):ko(new Error("No se pudo convertir la imagen")),"image/jpeg",.85));
function lienzo(src,w,h,max=1800){const r=Math.min(1,max/Math.max(w,h));const cv=document.createElement("canvas");cv.width=Math.round(w*r);cv.height=Math.round(h*r);
  const x=cv.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,cv.width,cv.height);x.drawImage(src,0,0,cv.width,cv.height);return cv}
async function imagenesDe(file){
  if(file.type==="application/pdf"||/\.pdf$/i.test(file.name)){const lib=await pdfjs();const d=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;const out=[];
    for(let n=1;n<=Math.min(2,d.numPages);n++){const pg=await d.getPage(n);const v1=pg.getViewport({scale:1});const vp=pg.getViewport({scale:Math.min(3,1800/Math.max(v1.width,v1.height))});
      const cv=document.createElement("canvas");cv.width=vp.width;cv.height=vp.height;const x=cv.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,cv.width,cv.height);await pg.render({canvasContext:x,viewport:vp}).promise;out.push(await aJPEG(cv))}
    return out}
  let src;try{src=await createImageBitmap(file,{imageOrientation:"from-image"})}catch(e){src=new Image();src.src=URL.createObjectURL(file);await src.decode()}
  return[await aJPEG(lienzo(src,src.width,src.height))]}
async function subirArchivos(files){const res=[];for(const f of files){toast("Subiendo "+f.name+"…",20000);
  for(const b of await imagenesDe(f)){const r=await HUELSAN.subir("documentos",b);res.push({ruta:r.id,nombre:f.name.replace(/\.[^.]+$/,"")+".jpg",tipo:"image/jpeg",size:b.size,subido:new Date().toISOString()})}}return res}
function repsDelFormulario(){const r=JSON.parse(JSON.stringify(CT.reps&&CT.reps.francisco?CT.reps:REPS_DEF));$$("[data-rep]").forEach(i=>setRuta(r,i.dataset.rep,i.value.trim()));return r}
async function guardarReps(r){await S.db.doc("contratoscfg/representantes").set(r);CT.reps=r}
async function subirCopias(quien,files){
  const nuevos=await subirArchivos(files);
  if(quien==="comprador"){CT.ed.dniComprador=[...(CT.ed.dniComprador||[]),...nuevos];await guardarC();repintar()}
  else{const k=quien.split(":")[1];const r=repsDelFormulario();r[k]=r[k]||{};r[k].dniArchivos=[...(r[k].dniArchivos||[]),...nuevos];await guardarReps(r);repintar()}
  toast("Copia guardada");
}
async function quitarCopia(quien,i){
  if(!confirm("¿Quitar esta copia del DNI? Se borra del almacén."))return;
  if(quien==="comprador"){const[x]=CT.ed.dniComprador.splice(i,1);if(x)await HUELSAN.borrarArchivo("documentos",x.ruta).catch(()=>{});await guardarC();repintar()}
  else{const k=quien.split(":")[1];const r=repsDelFormulario();const[x]=((r[k]||{}).dniArchivos||[]).splice(i,1);if(x)await HUELSAN.borrarArchivo("documentos",x.ruta).catch(()=>{});await guardarReps(r);repintar()}
}
async function guardarC(){const d=JSON.parse(JSON.stringify(CT.ed));delete d.id;d.actualizado=new Date().toISOString();await S.db.doc("contratos/"+CT.ed.id).set(d);CT.sucio=false}

/* ======================================================================
   PDF del contrato (A4, máximo 2 páginas)
   ====================================================================== */
async function pdfContrato(c,k){
  const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4",compress:true});
  const W=210,M=14,AW=W-2*M,LIM=279,CH=[140,110,68],GR=[94,99,106],INK=[27,29,32];
  const e=S.emisor||{};const p=c.comprador||{},v=c.vehiculo||{},pr=c.precio||{},pg=c.pago||{},pm=c.permuta||{},en=c.entrega||{};
  const tipo=p.tipo||"";
  let y=0,pag=1;
  const font=(b,s,col)=>{doc.setFont("helvetica",b?"bold":"normal");doc.setFontSize(s);doc.setTextColor(...(col||INK))};
  const lh=s=>s*1.18*0.3528;
  const nuevaPag=async()=>{doc.addPage();pag++;y=14};
  const sitio=async h=>{if(y+h>LIM)await nuevaPag()};
  const eurS=x=>x!==""&&x!=null&&!isNaN(+x)&&+x!==0?numES(+x)+" €":"";
  const fechaS=x=>x?fecha(x):"";
  // campo: etiqueta pequeña + valor sobre una línea (o línea vacía)
  const campo=(x,yy,w,lab,val)=>{font(0,5.9*k,GR);doc.text(lab,x,yy);
    doc.setDrawColor(150,150,150);doc.setLineWidth(.15);doc.line(x,yy+4.6*k,x+w-2,yy+4.6*k);
    val=String(val??"").trim();if(!val)return;let s=8.6*k;font(1,s);while(s>5.5&&doc.getTextWidth(val)>w-2.5){s-=.3;doc.setFontSize(s)}doc.text(val,x,yy+3.9*k)};
  const fila=async(cs)=>{const h=8.4*k;await sitio(h);let x=M;const tot=cs.reduce((s,q)=>s+(q.w||1),0);for(const q of cs){const w=AW*(q.w||1)/tot;campo(x,y+2.4*k,w,q.l,q.v);x+=w}y+=h};
  const caja=(x,yy,on)=>{const s=2.7*k;doc.setDrawColor(...INK);doc.setLineWidth(.25);doc.rect(x,yy-s+.35,s,s);if(on){doc.setLineWidth(.45);doc.line(x+.5,yy-s+.85,x+s-.5,yy-.15);doc.line(x+s-.5,yy-s+.85,x+.5,yy-.15)}};
  const opciones=async(lab,ops,valor)=>{const h=5.2*k;await sitio(h);let x=M;font(1,7.4*k);if(lab){doc.text(lab,x,y+3.4*k);x+=doc.getTextWidth(lab)+3}
    for(const[kk,t]of ops){caja(x,y+3.4*k,valor===kk);font(0,7.6*k);doc.text(t,x+3.6*k,y+3.4*k);x+=3.6*k+doc.getTextWidth(t)+5}y+=h};
  const titulo=async t=>{await sitio(22*k);y+=2.2*k;font(1,8.2*k,CH);doc.text(t.toUpperCase(),M,y+2.6*k);doc.setDrawColor(...CH);doc.setLineWidth(.3);doc.line(M,y+3.8*k,W-M,y+3.8*k);y+=6*k};
  const parrafo=async(t,o={})=>{const s=(o.s||7.5)*k;font(0,s,o.c);const w=o.w||AW,x=o.x||M;
    const partes=doc.splitTextToSize(t,w);const h=partes.length*lh(s);
    if(y+h>LIM){ // partir el párrafo entre páginas
      const caben=Math.max(0,Math.floor((LIM-y)/lh(s)));if(caben>0){doc.text(partes.slice(0,caben),x,y+lh(s)*.8)}await nuevaPag();font(0,s,o.c);doc.text(partes.slice(caben),x,y+lh(s)*.8);y+=(partes.length-caben)*lh(s)+(o.sep??1.4)*k;return}
    if(o.b){font(1,s,o.c)}
    doc.text(partes,x,y+lh(s)*.8);y+=h+(o.sep??1.4)*k};
  const clausula=async(n,tit,txt)=>{const s=7.5*k;font(1,s);const cab=n+". "+tit+". ";const wc=doc.getTextWidth(cab);
    font(0,s);
    // título en negrita en la primera línea y el texto a continuación
    const prim=doc.splitTextToSize(txt,AW-wc)[0]||"";const rest=doc.splitTextToSize(txt.slice(prim.length).trim(),AW);
    const h=(1+rest.length)*lh(s);await sitio(Math.min(h,lh(s)*3));
    font(1,s);doc.text(cab,M,y+lh(s)*.8);font(0,s);doc.text(prim,M+wc,y+lh(s)*.8);y+=lh(s);
    if(rest.length){if(y+rest.length*lh(s)>LIM){const caben=Math.max(0,Math.floor((LIM-y)/lh(s)));if(caben)doc.text(rest.slice(0,caben),M,y+lh(s)*.8);await nuevaPag();font(0,s);doc.text(rest.slice(caben),M,y+lh(s)*.8);y+=(rest.length-caben)*lh(s)}
      else{doc.text(rest,M,y+lh(s)*.8);y+=rest.length*lh(s)}}
    y+=1.5*k};
  const lineasVacias=async(n)=>{for(let i=0;i<n;i++){await sitio(5.5*k);doc.setDrawColor(150,150,150);doc.setLineWidth(.15);doc.line(M,y+4.6*k,W-M,y+4.6*k);y+=5.5*k}};

  /* --- cabecera --- */
  doc.addImage(await logo(),"JPEG",M,9,12,10.2,"logo","FAST");
  font(1,13);doc.text("HUELSAN",M+15,15);font(0,6.5,CH);doc.text("AUTOMOCIÓN",M+15.2,19);
  font(1,11.5*Math.min(1,k+.05));doc.text("CONTRATO DE COMPRAVENTA DE VEHÍCULO DE OCASIÓN",W-M,14.5,{align:"right"});
  font(0,8.5,GR);doc.text("Nº "+(c.numero||"________________"),W-M,19.5,{align:"right"});
  doc.setDrawColor(...CH);doc.setLineWidth(.6);doc.line(M,23,W-M,23);y=24;
  await fila([{l:"Ubicación de la compra (lugar de firma)",v:c.ubicacion,w:2.2},{l:"Fecha",v:fechaS(c.fecha)},{l:"Hora",v:c.hora,w:.6}]);

  /* --- partes --- */
  await titulo("Reunidos");
  await parrafo("De una parte, como PARTE VENDEDORA:",{b:1,sep:0});
  await fila([{l:"Razón social",v:e.razonSocial||"Huelsan SL",w:1.4},{l:"CIF",v:e.nif},{l:"Domicilio social",v:[e.domicilio,[e.cp,e.municipio].filter(Boolean).join(" "),e.provincia].filter(Boolean).join(", "),w:2.6}]);
  await fila([{l:"Representada por (nombre y apellidos)",v:c.vendedor.nombre,w:1.8},{l:"DNI / NIE",v:c.vendedor.dni},{l:"Cargo",v:c.vendedor.cargo}]);
  await parrafo("De otra parte, como PARTE COMPRADORA:",{b:1,sep:0});
  await opciones("",[["particular","Particular (consumidor)"],["empresa","Empresa o profesional"]],tipo);
  if(tipo!=="particular")await fila([{l:"Razón social (si es empresa)",v:p.razonSocial,w:1.6},{l:"CIF",v:p.cif},{l:"Domicilio social",v:p.domicilioEmpresa,w:2.2},{l:"Cargo de quien firma",v:p.cargo}]);
  await fila([{l:"Nombre",v:p.nombre,w:1.2},{l:"Apellidos",v:p.apellidos,w:1.8},{l:"DNI / NIE / Pasaporte",v:p.dni},{l:"Teléfono",v:p.telefono}]);
  await fila([{l:"Domicilio",v:p.domicilio,w:2.2},{l:"C. P.",v:p.cp,w:.6},{l:"Localidad",v:p.municipio},{l:"Provincia",v:p.provincia},{l:"Correo electrónico",v:p.email,w:1.5}]);
  await parrafo(`Ambas partes se reconocen capacidad legal para obligarse y EXPONEN que ${e.razonSocial||"Huelsan SL"} (en adelante, HUELSAN) se dedica profesionalmente a la compraventa de vehículos y es propietaria o está facultada para vender el vehículo que se describe; que la PARTE COMPRADORA lo ha examinado, ha podido probarlo y ha recibido antes de firmar información clara sobre sus características, estado, precio final, garantía y condiciones; y que acuerdan la compraventa con arreglo a las siguientes CLÁUSULAS:`,{sep:.6});

  /* --- 1. vehículo --- */
  await titulo("1. Vehículo objeto de la compraventa");
  await fila([{l:"Marca",v:v.marca},{l:"Modelo",v:v.modelo},{l:"Versión",v:v.version,w:1.6},{l:"Color",v:v.color,w:.8}]);
  await fila([{l:"Matrícula",v:v.matricula,w:.8},{l:"Nº de bastidor (VIN)",v:v.bastidor,w:1.7},{l:"Fecha 1ª matriculación",v:fechaS(v.fechaMatric)},{l:"Kilómetros",v:"",w:.9}]);
  await fila([{l:"Combustible",v:v.combustible},{l:"Cambio",v:v.cambio},{l:"Potencia (CV)",v:v.cv,w:.8},{l:"Distintivo DGT",v:v.etiqueta,w:.8},{l:"ITV válida hasta",v:fechaS(v.itvHasta)},{l:"Nº de llaves",v:v.llaves,w:.7}]);
  await parrafo("Estado y kilometraje. La PARTE COMPRADORA sabe que adquiere un vehículo usado cuyo estado y desgaste corresponden a su antigüedad y kilometraje. HUELSAN declara que, según su leal saber y entender, los kilómetros indicados son los reales. Se informan los siguientes defectos o particularidades conocidos, que la PARTE COMPRADORA acepta de forma expresa y que no constituirán falta de conformidad:",{sep:.4});
  if(String(c.defectos||"").trim())await parrafo(c.defectos,{s:8,sep:.4});else await lineasVacias(2);
  await opciones("",[["si","La PARTE COMPRADORA acepta expresamente los defectos y particularidades descritos."]],c.aceptaDefectos?"si":"");

  /* --- 2. precio y pago --- */
  await titulo("2. Precio y forma de pago");
  await opciones("Régimen:",[["rebu","Régimen especial de bienes usados (REBU)"],["general","Régimen general de IVA"]],pr.regimen||"");
  await fila(pr.regimen==="rebu"?[{l:"Precio total, IVA incluido (€)",v:eurS(pr.total)},{l:"Precio total en letra",v:pr.letra,w:3}]
    :[{l:"Base imponible (€)",v:eurS(pr.base),w:.8},{l:"Cuota IVA (€)",v:eurS(pr.cuota),w:.8},{l:"Precio total, IVA incluido (€)",v:eurS(pr.total)},{l:"Precio total en letra",v:pr.letra,w:2.4}]);
  await opciones("Gastos de transferencia:",[["incluidos","Incluidos en el precio"],["comprador","A cargo de la PARTE COMPRADORA, importe: "+(pr.gastos==="comprador"&&+pr.gastosImporte?numES(+pr.gastosImporte)+" €":"__________ €")]],pr.gastos||"");
  const pend=+pr.total?r2(+pr.total+(pr.gastos==="comprador"?(+pr.gastosImporte||0):0)-(+pg.senal||0)-(+pm.valor||0)):"";
  await fila([{l:"Señal / reserva entregada (€)",v:eurS(pg.senal)},{l:"Fecha de la señal",v:fechaS(pg.senalFecha),w:.8},{l:"Importe pendiente (€)",v:pend!==""&&(+pg.senal||+pm.valor)?eurS(pend):""},{l:"Medio de pago",v:pg.medio==="Mixto"&&pg.detalle?pg.detalle:pg.medio,w:1.3},{l:"Fecha límite de pago",v:fechaS(pg.fechaLimite),w:.8}]);
  if(!pg.medio||pg.medio==="Financiación")await fila([{l:"Entidad financiera (si hay financiación)",v:pg.entidad,w:2},{l:"Importe financiado (€)",v:eurS(pg.financiado)}]);
  await fila([{l:"Vehículo entregado como parte del pago: marca y modelo",v:pm.marcaModelo,w:2},{l:"Matrícula",v:pm.matricula,w:.8},{l:"Nº bastidor",v:pm.bastidor,w:1.5},{l:"Valor de tasación (€)",v:eurS(pm.valor)}]);
  await parrafo(`${pr.regimen==="general"?"":"Si la operación está en REBU, el IVA va incluido en el precio y no se desglosa ni es deducible (arts. 135 y ss. Ley 37/1992). "}El vehículo entregado como parte del pago se transmite libre de cargas y su valor se descuenta del importe pendiente. Pagos en efectivo: máximo inferior a 1.000 € (Ley 7/2012). Hasta el pago completo del precio, HUELSAN conserva la propiedad del vehículo y podrá retener su entrega y documentación.`);

  /* --- 3. entrega --- */
  await titulo("3. Entrega y documentación");
  await fila([{l:"Fecha de entrega",v:fechaS(en.fecha)},{l:"Hora de entrega",v:en.hora,w:.7},{l:"Lugar de entrega",v:en.lugar,w:2.3}]);
  { const cols=3,cw=AW/cols,h=4.6*k;font(1,7.4*k);await sitio(h*4);doc.text("Documentación que se entrega:",M,y+3.2*k);y+=h;
    DOCS.forEach(([kk,t],i)=>{const x=M+(i%cols)*cw,yy=y+Math.floor(i/cols)*h+3.2*k;caja(x,yy,!!(c.docs||{})[kk]);font(0,7.5*k);doc.text(t+(kk==="llaves"&&v.llaves?" ("+v.llaves+")":""),x+3.6*k,yy)});
    y+=Math.ceil(DOCS.length/cols)*h+1.2*k}
  await parrafo("Desde la fecha y hora de entrega la PARTE COMPRADORA asume la posesión y los riesgos del vehículo y responde de las infracciones, sanciones, peajes, daños y demás responsabilidades derivadas de su uso; HUELSAN responde de las anteriores.");

  /* --- cláusulas --- */
  await titulo("Condiciones");
  let n=4;
  await clausula(n++,"Cargas y cambio de titularidad","HUELSAN declara que el vehículo está libre de cargas, embargos, reservas de dominio, precintos y sanciones pendientes y al corriente del Impuesto sobre Vehículos de Tracción Mecánica, y responde de cualquier carga anterior a la entrega no declarada. El cambio de titularidad ante la DGT se realizará en el plazo máximo de 30 días desde la firma; la PARTE COMPRADORA facilitará la documentación necesaria. Si lo gestiona la PARTE COMPRADORA, HUELSAN comunicará la venta a la DGT.");
  await opciones("Gestiona la transferencia:",[["huelsan","HUELSAN"],["comprador","La PARTE COMPRADORA"]],c.transferencia||"");
  const gCons="Al tratarse de un vehículo de segunda mano, las partes pactan expresamente, conforme al art. 120.1 del Real Decreto Legislativo 1/2007 (TRLGDCU), que HUELSAN responde de las faltas de conformidad que se manifiesten en el plazo de UN (1) AÑO desde la entrega y, conforme a su art. 121, que se presumirá que las faltas de conformidad manifestadas en ese año ya existían al entregarlo, salvo que sea incompatible con la naturaleza del vehículo o de la falta. La PARTE COMPRADORA podrá exigir la reparación o, si procede, la sustitución, gratis y en un plazo razonable, y en los casos legales la rebaja del precio o la resolución del contrato. La acción prescribe a los cinco años desde la manifestación de la falta de conformidad.";
  const gEmp="Si la PARTE COMPRADORA compra para su actividad empresarial o profesional, no se aplica el régimen del TRLGDCU; HUELSAN le otorga contractualmente una garantía de UN (1) AÑO desde la entrega frente a averías o defectos preexistentes, mediante reparación sin coste en el taller que HUELSAN designe, y supletoriamente rigen el Código de Comercio y el Código Civil.";
  const ga=c.garantia||{};
  const gCia="La garantía se presta a través de una compañía de garantías contratada por HUELSAN. Su nombre y el número de garantía o póliza, que se conocen después de la venta, se comunicarán a la PARTE COMPRADORA junto con las condiciones de la garantía: compañía ______________________________, nº ____________________. Ello no limita la responsabilidad legal de HUELSAN como vendedora. ";
  const gComun=gCia+"Procedimiento: comunicar la incidencia por escrito lo antes posible a HUELSAN o a la compañía de garantías y poner el vehículo a disposición de HUELSAN o del taller que se designe; el plazo se suspende mientras el vehículo esté en reparación. No son falta de conformidad ni están cubiertos: el desgaste normal de piezas de uso y consumo (neumáticos, frenos, embrague, escobillas, batería, lámparas, filtros, líquidos y similares) acorde con la antigüedad y los kilómetros; las averías por uso inadecuado, accidente, falta del mantenimiento del fabricante, competición o modificaciones posteriores a la entrega; los defectos aceptados en la cláusula 1; y las reparaciones hechas por terceros sin avisar antes a HUELSAN, salvo urgencia justificada o falta de respuesta en un plazo razonable. Todo ello sin perjuicio de los derechos irrenunciables de los consumidores.";
  await clausula(n++,"Garantía de un año",(tipo==="empresa"?gEmp:tipo==="particular"?gCons:"Si la PARTE COMPRADORA es consumidora: "+gCons+" "+gEmp)+" "+gComun);
  if(c.contratacion==="distancia")await clausula(n++,"Derecho de desistimiento","Al celebrarse el contrato a distancia o fuera del establecimiento, la PARTE COMPRADORA consumidora puede desistir sin justificación en el plazo de 14 días naturales desde la entrega (arts. 102 y ss. TRLGDCU), comunicándolo por cualquier medio fehaciente. HUELSAN reembolsará lo pagado en 14 días desde la comunicación, pudiendo retenerlo hasta recibir el vehículo; la PARTE COMPRADORA asume el coste directo de devolución y responde de la pérdida de valor por un uso distinto del necesario para comprobar el vehículo.");
  await clausula(n++,"Protección de datos",`Responsable: ${e.razonSocial||"Huelsan SL"}${e.nif?", CIF "+e.nif:""}. Los datos se tratan para gestionar este contrato, la transferencia, la factura, la garantía y las obligaciones legales (base: ejecución del contrato y obligación legal; RGPD y LO 3/2018). Se comunican a la DGT, a la Administración tributaria, a la gestoría y, en su caso, a la entidad financiera, y se conservan los plazos legales. Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad en ${e.email||"__________________________"} y reclamar ante la AEPD.`);
  await clausula(n++,"Reclamaciones, ley y jurisdicción","HUELSAN dispone de hojas de reclamaciones. El contrato se rige por la ley española. "+(tipo==="particular"?"Serán competentes los juzgados del domicilio de la PARTE COMPRADORA, conforme a la normativa de consumidores.":tipo==="empresa"?"Las partes se someten a los juzgados y tribunales de Murcia, con renuncia a cualquier otro fuero.":"Las partes se someten a los juzgados y tribunales de Murcia, salvo que la PARTE COMPRADORA sea consumidora, en cuyo caso serán competentes los de su domicilio."));
  await clausula(n++,"Observaciones y pactos adicionales",String(c.observaciones||"").trim()||" ");
  if(!String(c.observaciones||"").trim())await lineasVacias(2);
  await parrafo("Y en prueba de conformidad, las partes firman este contrato por duplicado y en cada una de sus hojas, en el lugar, fecha y hora del encabezamiento.",{sep:1});

  /* --- firmas --- */
  const hF=30*k;await sitio(hF);const bw=(AW-8)/2;
  [[M,"PARTE VENDEDORA",[e.razonSocial||"Huelsan SL",c.vendedor.nombre?"p.p. "+c.vendedor.nombre:"p.p. ______________________________"]],
   [M+bw+8,"PARTE COMPRADORA",tipo==="empresa"&&p.razonSocial?[p.razonSocial,"p.p. "+([p.nombre,p.apellidos].filter(Boolean).join(" ")||"______________________________")]:[[p.nombre,p.apellidos].filter(Boolean).join(" ")||"______________________________",p.dni?"DNI "+p.dni:""]]]
   .forEach(([x,tit,lin])=>{doc.setDrawColor(200,197,190);doc.setLineWidth(.3);doc.roundedRect(x,y,bw,hF,2,2);font(1,7*k,CH);doc.text(tit,x+3,y+4.5*k);
     font(0,7.6*k);doc.text(lin.filter(Boolean),x+3,y+hF-6.5*k)});
  y+=hF;

  return doc;
}
function pies(doc,c){
  const e=S.emisor||{},W=210,M=14,N=doc.getNumberOfPages();
  for(let i=1;i<=N;i++){doc.setPage(i);doc.setDrawColor(217,214,208);doc.setLineWidth(.2);doc.line(M,283,W-M,283);
    doc.setFont("helvetica","normal");doc.setFontSize(6.6);doc.setTextColor(94,99,106);
    doc.text([e.razonSocial||"Huelsan SL",e.nif?"CIF "+e.nif:"",[e.domicilio,[e.cp,e.municipio].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(" · "),M,287);
    doc.text(`Contrato ${c.numero||""} · Página ${i} de ${N}`,W-M,287,{align:"right"});
    doc.text("Firma vendedor: ____________   Firma comprador: ____________",M,292)}
}
const aDataURL=b=>new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>ko(r.error);r.readAsDataURL(b)});
async function anexoDNI(doc,c,titulo,nombre,dni,archivos){
  doc.addPage();const W=210,M=14,AW=W-2*M,CH=[140,110,68],GR=[94,99,106];
  doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(27,29,32);doc.text("ANEXO · COPIA DEL DOCUMENTO DE IDENTIDAD",M,16);
  doc.setFontSize(8.5);doc.setTextColor(...CH);doc.text(titulo.toUpperCase(),W-M,16,{align:"right"});
  doc.setDrawColor(...CH);doc.setLineWidth(.6);doc.line(M,19,W-M,19);
  doc.setFont("helvetica","normal");doc.setFontSize(6);doc.setTextColor(...GR);doc.text("Titular (nombre y apellidos)",M,24.5);doc.text("DNI / NIE",M+128,24.5);
  doc.setDrawColor(150,150,150);doc.setLineWidth(.15);doc.line(M,30,M+124,30);doc.line(M+128,30,W-M,30);
  doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(27,29,32);if(nombre)doc.text(nombre,M,29);if(dni)doc.text(dni,M+128,29);
  const y0=36,y1=272,hueco=6;
  const imgs=[];for(const a of (archivos||[]).slice(0,4)){try{const u=await aDataURL(await HUELSAN.bajar("documentos",a.ruta));const im=new Image();im.src=u;await im.decode();imgs.push({u,w:im.naturalWidth,h:im.naturalHeight})}catch(e){console.warn("Copia DNI no disponible",e)}}
  if(!imgs.length){const h=(y1-y0-hueco)/2;["Anverso","Reverso"].forEach((t,i)=>{const y=y0+i*(h+hueco);doc.setDrawColor(170,170,170);doc.setLineWidth(.3);doc.setLineDashPattern([2,1.5],0);doc.rect(M,y,AW,h);doc.setLineDashPattern([],0);
      doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(...GR);doc.text(`${t}: adjuntar aquí la fotocopia del documento de identidad`,W/2,y+h/2,{align:"center"})});
    doc.setFontSize(6.5);doc.text(`Copia aportada solo para el contrato de compraventa nº ${c.numero||"________"}.`,W/2,y1+4,{align:"center"});return}
  const h=(y1-y0-hueco*(imgs.length-1))/imgs.length;
  imgs.forEach((im,i)=>{const r=Math.min(AW/im.w,h/im.h);const w=im.w*r,hh=im.h*r;const x=M+(AW-w)/2,y=y0+i*(h+hueco)+(h-hh)/2;
    doc.addImage(im.u,"JPEG",x,y,w,hh,undefined,"FAST");doc.setDrawColor(200,197,190);doc.setLineWidth(.2);doc.rect(x,y,w,hh);
    try{doc.saveGraphicsState();doc.setGState(new doc.GState({opacity:.35}))}catch(e){}
    doc.setFont("helvetica","bold");doc.setFontSize(Math.max(9,Math.min(16,w/11)));doc.setTextColor(150,40,30);
    doc.text(`COPIA SOLO PARA EL CONTRATO Nº ${c.numero||"______"} · HUELSAN`,x+w/2,y+hh/2,{align:"center",angle:18});
    try{doc.restoreGraphicsState()}catch(e){}});
  if((archivos||[]).length>4){doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(...GR);doc.text("Solo caben 4 imágenes por página: se muestran las 4 primeras.",W/2,y1+4,{align:"center"})}
}
async function generarContrato(c){
  if(!window.jspdf)throw new Error("No se ha podido cargar el generador de PDF");
  let k=1,doc=null;
  for(;;){doc=await pdfContrato(c,k);if(doc.getNumberOfPages()<=2||k<=.72)break;k=Math.round((k-.04)*100)/100}
  doc.__principal=doc.getNumberOfPages();
  const p=c.comprador||{},rep=(CT.reps||{})[c.rep]||{};
  if(dniSi(c,"Comprador"))await anexoDNI(doc,c,"Parte compradora",[p.nombre,p.apellidos].filter(Boolean).join(" "),p.dni,c.dniComprador);
  if(dniSi(c,"Vendedor"))await anexoDNI(doc,c,"Parte vendedora · representante de HUELSAN",(c.vendedor||{}).nombre,(c.vendedor||{}).dni,c.rep?rep.dniArchivos:[]);
  pies(doc,c);
  return doc;
}
async function descargarContrato(c){
  const doc=await generarContrato(c);
  const quien=nombreComprador(c).replace(/[^\wÀ-ÿ ]+/g,"").trim().replace(/\s+/g,"-");
  doc.save("Contrato"+(c.numero?"-"+c.numero:"")+(quien?"-"+quien:"")+(c.vehiculo&&c.vehiculo.matricula?"-"+c.vehiculo.matricula:"")+".pdf");
  if(doc.__principal>2)toast("El contrato ocupa más de 2 páginas: acorta las observaciones o los defectos.",6000);
}
window.HuelsanContratos={generarContrato,desdeFactura,contratoVacio,enLetra};
})();
