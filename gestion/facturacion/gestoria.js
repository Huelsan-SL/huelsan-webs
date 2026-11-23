/* Huelsan Automoción · Envío a la gestoría para el cambio de nombre (transferencia del vehículo vendido).
   Desde la ficha por matrícula (o la factura de venta): lista de la documentación según el comprador sea particular o empresa,
   con lo que ya está subido y lo que falta, sitio para subir lo que falte, datos de la operación, paquete ZIP y mensaje para la gestoría.
   Los archivos subidos aquí se guardan como «Documentos del coche» (docscoche). Seguimiento en gestoria/<id>; contacto en facturacion/gestoria. */
(function(){
"use strict";
/* Lo que pide la gestoría (nov. 2026):
   · De sociedad a particular: DNI del comprador, orden de mandato firmada por el comprador, permiso, ficha técnica y factura de venta.
   · De sociedad a sociedad: CIF, DNI del administrador, orden de mandato firmada por el administrador, certificado sustitutivo de poderes
     firmado por el administrador, escrituras de la sociedad con los datos registrales, permiso, ficha técnica y factura de venta.
   El contrato de compraventa no lo piden, pero se envía igualmente (apartado «además»). Los valores de TIPOS se guardan en «Documentos del coche»: no cambiarlos. */
const TIPOS={permiso:"Permiso de circulación",ficha:"Ficha técnica",dniC:"DNI / NIE del comprador",cif:"CIF del comprador",repr:"Representación de persona jurídica",dniA:"DNI del administrador",mandato:"Solicitud y mandato",certificado:"Certificado sustitutivo de escrituras y poderes"};
const G={cfg:{},reg:null,k:null,tipo:null};
const esEmpresaNif=n=>/^[ABCDEFGHJNPQRSUVW]/i.test(nifLimpio(n||""));
const pad=n=>String(n).padStart(2,"0");

/* ---------- datos del traspaso ---------- */
function contexto(k){
  const x=cocheDe(k);if(!x)return null;const l=x.lote,CTR=window.HuelsanContratos||{};
  const f=(x.facturas||[]).filter(f=>!f.anulada&&f.tipo!=="rectificativa").sort((a,b)=>String(b.fechaExpedicion).localeCompare(String(a.fechaExpedicion)))[0]||null;
  const mat=normMat(x.matricula.startsWith("lote:")?"":x.matricula);
  const c=(CTR.lista?CTR.lista():[]).filter(c=>(f&&c.facturaId===f.id)||(l&&c.loteId===l.id)||(mat&&normMat((c.vehiculo||{}).matricula)===mat))
    .sort((a,b)=>(((b.firmado||{}).archivos||[]).length-((a.firmado||{}).archivos||[]).length)||String(b.actualizado||"").localeCompare(String(a.actualizado||"")))[0]||null;
  return{x,l,f,c,reps:CTR.reps?CTR.reps():{},mat};
}
function tipoAuto(cx){
  if(cx.f){const cl=cx.f.cliente||{};return cl.tipo==="empresa"||esEmpresaNif(cl.nif)?"empresa":"particular"}
  if(cx.c&&(cx.c.comprador||{}).tipo)return cx.c.comprador.tipo;
  return"particular";
}
const docsTipo=(cx,t)=>docsPropios(cx.x).filter(d=>d.tipo===t).flatMap(d=>(d.archivos||[]).map(a=>({...a,docId:d.id})));
function grupos(cx,tipo){
  const emp=tipo==="empresa",rep=cx.c&&cx.c.rep?cx.reps[cx.c.rep]:null,contr=cx.c?((cx.c.firmado||{}).archivos||[]):[];
  const V=window.HuelsanVenta,fe=emp&&V&&V.faltanEscrituras?V.faltanEscrituras(cx):[];
  const veh={titulo:"Documentación del vehículo",items:[
    {key:"permiso",label:"Permiso de circulación",archivos:docsTipo(cx,TIPOS.permiso),sube:TIPOS.permiso},
    {key:"ficha",label:"Ficha técnica (tarjeta ITV)",archivos:docsTipo(cx,TIPOS.ficha),sube:TIPOS.ficha}]};
  const factura={titulo:"Factura de venta",items:[{key:"factura",label:cx.f?`Factura ${cx.f.codigo}`:"Factura de venta",archivos:cx.f?[{nombre:`Factura ${cx.f.codigo}.pdf`,gen:"factura"}]:[],hint:cx.f?"Se genera sola al crear el paquete.":"Falta emitir la factura de venta (pestaña Facturas)."}]};
  const mandato={titulo:"Orden de mandato",items:[{key:"mandato",label:emp?"Orden de mandato firmada por el administrador (mandante)":"Orden de mandato firmada por el comprador (mandante)",archivos:docsTipo(cx,TIPOS.mandato),sube:TIPOS.mandato,genera:"mandato",hint:"«Generar para firmar» saca el modelo de la gestoría ya relleno: imprímelo, que lo firme "+(emp?"el administrador":"el comprador")+" y sube aquí el firmado."}]};
  const contrato={key:"contrato",label:"Contrato de compraventa firmado",opc:true,archivos:contr,contrato:true,hint:"La gestoría no lo pide, pero se envía igualmente."+(contr.length?"":cx.c?" Sube el contrato firmado en Contratos.":" Aún no hay contrato: créalo en Contratos.")};
  const ademas=items=>({titulo:"Se envía además (no lo pide la gestoría)",items});
  if(emp)return[
    {titulo:"Documentación de la sociedad compradora",items:[
      {key:"cif",label:"CIF de la sociedad",archivos:docsTipo(cx,TIPOS.cif),sube:TIPOS.cif},
      {key:"dniA",label:"DNI del administrador de la sociedad",archivos:[...((cx.c||{}).dniComprador||[]),...docsTipo(cx,TIPOS.dniA)],sube:TIPOS.dniA}]},
    mandato,
    {titulo:"Poderes y escrituras de la sociedad",items:[
      {key:"certificado",label:"Certificado sustitutivo de escrituras y poderes, firmado por el administrador",archivos:docsTipo(cx,TIPOS.certificado),sube:TIPOS.certificado,genera:"certificado",hint:"«Generar para firmar» lo rellena con los datos de la sociedad y de sus escrituras."+(fe.length?" Faltan en la ficha del cliente (Clientes → empresa): "+fe.join(", ")+".":"")},
      {key:"repr",label:"Escrituras de la sociedad donde aparezcan los datos registrales",archivos:docsTipo(cx,TIPOS.repr),sube:TIPOS.repr}]},
    veh,factura,ademas([contrato])];
  return[
    {titulo:"Documentación del comprador",items:[{key:"dniC",label:"DNI / NIE del comprador",archivos:[...((cx.c||{}).dniComprador||[]),...docsTipo(cx,TIPOS.dniC)],sube:TIPOS.dniC}]},
    mandato,veh,factura,
    ademas([contrato,{key:"dniV",label:"DNI del vendedor (representante de Huelsan)"+(rep&&rep.nombre?": "+rep.nombre:""),opc:true,archivos:rep?(rep.dniArchivos||[]):[],hint:cx.c?(cx.c.rep?"Se coge de Contratos → representantes.":"Elige el representante en el contrato."):"Se coge del contrato."}])];
}
function datosTxt(cx,tipo){
  const e=S.emisor||{},v=Object.assign({},(cx.f||{}).vehiculo||{},cx.c?Object.fromEntries(Object.entries(cx.c.vehiculo||{}).filter(([,x])=>x)):{}),cl=(cx.f||{}).cliente||{},cc=(cx.c||{}).comprador||{};
  const rep=cx.c&&cx.c.rep?cx.reps[cx.c.rep]:null,t=cx.f?(cx.f.totales||calcular(cx.f.lineas)):null;
  const dir=(a,cp,m,p)=>[a,[cp,m].filter(Boolean).join(" "),p].filter(Boolean).join(", ");
  const L=[];const add=(k,val)=>{if(val!=null&&String(val).trim()!=="")L.push(k+": "+val)};
  L.push("DATOS PARA EL CAMBIO DE NOMBRE ("+(tipo==="empresa"?"comprador empresa":"comprador particular")+")","","VEHÍCULO");
  add("Matrícula",v.matricula||cx.mat);add("Bastidor",v.bastidor);add("Marca",v.marca);add("Modelo",[v.modelo,v.version].filter(Boolean).join(" "));add("Fecha de matriculación",v.fechaMatric?fecha(v.fechaMatric):"");add("Kilómetros",v.km?miles(String(Math.round(+v.km)))+" km":"");add("Combustible",v.combustible);add("Color",v.color);
  L.push("","VENDEDOR");add("Razón social",e.razonSocial);add("NIF",e.nif);add("Domicilio",dir(e.domicilio,e.cp,e.municipio,e.provincia));add("Teléfono",e.telefono);add("Correo",e.email);
  if(rep){add("Representante",rep.nombre);add("DNI del representante",rep.dni);add("Cargo",rep.cargo)}
  L.push("","COMPRADOR");
  if(tipo==="empresa"){add("Razón social",cl.nombre||cc.razonSocial);add("CIF",cl.nif||cc.cif);add("Domicilio",dir(cl.direccion,cl.cp,cl.municipio,cl.provincia)||cc.domicilioEmpresa);
    add("Administrador / representante",[cc.nombre,cc.apellidos].filter(Boolean).join(" "));add("DNI del representante",cc.dni);add("Cargo",cc.cargo)}
  else{add("Nombre",cl.nombre||[cc.nombre,cc.apellidos].filter(Boolean).join(" "));add("DNI / NIE",cl.nif||cc.dni);add("Domicilio",dir(cl.direccion||cc.domicilio,cl.cp||cc.cp,cl.municipio||cc.municipio,cl.provincia||cc.provincia))}
  add("Teléfono",cl.telefono||cc.telefono);add("Correo",cl.email||cc.email);
  if(tipo==="empresa"){const lv=(cx.f&&S.clientes&&S.clientes.get(cx.f.clienteId))||{};
    L.push("","ESCRITURAS Y REGISTRO MERCANTIL (comprador)");add("Fecha de la escritura",lv.escrFecha?fecha(lv.escrFecha):"");add("Colegio Notarial",lv.escrColegio);add("Notario",lv.escrNotario);add("Nº de protocolo",lv.escrProtocolo);
    add("Registro Mercantil de",lv.rmRegistro);add("Tomo",lv.rmTomo);add("Folio",lv.rmFolio);add("Hoja",lv.rmHoja);add("Fecha de inscripción",lv.rmFecha?fecha(lv.rmFecha):"")}
  L.push("","OPERACIÓN");
  add("Fecha de la venta",fecha((cx.f&&(cx.f.fechaOperacion||cx.f.fechaExpedicion))||(cx.c&&cx.c.fecha)||""));
  add("Precio total",t?eur(t.total):cx.c&&cx.c.precio&&cx.c.precio.total?eur(+cx.c.precio.total):"");
  add("Régimen",t?(t.rebu&&!t.base?"REBU (bienes usados)":"IVA general"):"");
  add("Forma de pago",(cx.f||{}).formaPago||(cx.c&&cx.c.pago&&cx.c.pago.medio));
  add("Factura",cx.f&&cx.f.codigo);add("Contrato",cx.c&&cx.c.numero);
  return L.join("\n");
}
const faltan=gs=>gs.flatMap(g=>g.items).filter(i=>!i.opc&&!i.archivos.length);
function mensaje(cx,tipo,gs){
  const e=S.emisor||{},v=cx.x.titulo||"",cl=(cx.f||{}).cliente||{},cc=(cx.c||{}).comprador||{};
  const comprador=cl.nombre||cc.razonSocial||[cc.nombre,cc.apellidos].filter(Boolean).join(" ")||"el comprador";
  const todos=gs.flatMap(g=>g.items),ok=todos.filter(i=>i.archivos.length),fa=faltan(gs);
  return`Hola${G.cfg.nombre?" "+G.cfg.nombre:""}, os pedimos que tramitéis el cambio de titularidad del ${v}${cx.mat?", matrícula "+cx.mat:""}, vendido a ${comprador} (${tipo==="empresa"?"empresa":"particular"}).

Documentación que os enviamos:
${ok.map(i=>"✓ "+i.label).join("\n")||"—"}
${fa.length?"\nPendiente de enviaros:\n"+fa.map(i=>"• "+i.label).join("\n")+"\n":""}
${datosTxt(cx,tipo)}

Gracias.
${e.nombreComercial||e.razonSocial||"Huelsan Automoción"}`;
}

/* ---------- diálogo ---------- */
const idReg=cx=>cx.l?cx.l.id:cx.x.matricula;
async function abrir(k){
  const cx=contexto(k);if(!cx){toast("No encuentro ese coche");return}
  try{const sn=await S.db.doc("facturacion/gestoria").get();G.cfg=sn&&sn.exists?sn.data():{}}catch(e){G.cfg={}}
  try{const sn=await S.db.doc("gestoria/"+idReg(cx)).get();G.reg=sn&&sn.exists?sn.data():{}}catch(e){G.reg={}}
  G.k=k;G.tipo=G.reg.tipoComprador||tipoAuto(cx);
  const f=$("#f-confirm"),d=$("#dlg-confirm");
  const pintarD=()=>{const c=contexto(G.k),gs=grupos(c,G.tipo),fa=faltan(gs),auto=tipoAuto(c),y=d.scrollTop;
    f.innerHTML=`<h2>Cambio de nombre · gestoría</h2>
      <div class="row"><span><b>${esc(c.x.titulo||"")}</b> ${c.mat?`<span class="mat">${esc(c.mat)}</span>`:""}</span><label style="max-width:190px;flex:0 0 auto">Comprador<select data-g-tipo><option value="particular" ${G.tipo==="particular"?"selected":""}>Particular</option><option value="empresa" ${G.tipo==="empresa"?"selected":""}>Empresa</option></select></label>${G.tipo!==auto?`<span class="muted">(en la factura/contrato figura como ${auto})</span>`:""}</div>
      ${c.f?"":`<div class="aviso">Este coche aún no tiene factura de venta emitida: el comprador y el precio salen del contrato, si existe.</div>`}
      <div class="g3"><label>Gestoría<input data-g-cfg="nombre" value="${esc(G.cfg.nombre||"")}" placeholder="Nombre o contacto"></label><label>Correo de la gestoría<input data-g-cfg="email" type="email" value="${esc(G.cfg.email||"")}" placeholder="tramites@gestoria.es"></label><label>Jefatura de Tráfico <small>(certificado)</small><input data-g-cfg="jefatura" value="${esc(G.cfg.jefatura||"")}" placeholder="Huelva"></label></div>
      ${gs.map((g,gi)=>`<div class="card" style="padding:10px"><b>${gi+1}. ${esc(g.titulo)}</b>${g.items.map(i=>`<div class="row" style="align-items:center;margin-top:6px">
          <span class="tag ${i.archivos.length?"ok":i.opc?"":"bad"}">${i.archivos.length?"✓":i.opc?"Opcional":"Falta"}</span><span style="flex:1 1 200px">${esc(i.label)}${i.hint?`<div class="muted" style="font-size:12px">${esc(i.hint)}</div>`:""}</span>
          ${i.archivos.map(a=>a.gen?`<span class="tag">PDF automático</span>`:`<button type="button" class="btn sm" data-g-ver="${esc(a.ruta)}" data-nombre="${esc(a.nombre||"archivo")}">${esc((a.nombre||"archivo").length>24?(a.nombre||"").slice(0,22)+"…":a.nombre||"archivo")}</button>${a.docId?`<button type="button" class="btn sm" data-g-del="${esc(a.docId)}" aria-label="Eliminar" title="Eliminar">✕</button>`:""}`).join(" ")}
          ${i.sube?`<label class="btn sm primary" style="display:inline-flex">Subir<input type="file" data-g-sub="${esc(i.sube)}" multiple hidden accept="application/pdf,image/*"></label>`:""}
          ${i.genera?`<button type="button" class="btn sm" data-g-gen="${esc(i.genera)}">Generar para firmar</button>`:""}
          ${i.contrato?`<button type="button" class="btn sm" data-g-contrato>${c.c?"Abrir contrato":"Crear contrato"}</button>`:""}</div>`).join("")}</div>`).join("")}
      <details><summary>Datos que se envían</summary><pre style="white-space:pre-wrap;font-size:12.5px;margin:6px 0 0">${esc(datosTxt(c,G.tipo))}</pre></details>
      ${G.reg.enviado?`<div class="aviso ok">Enviado a la gestoría el ${fecha(G.reg.enviado)}${G.reg.completado?` · Cambio de nombre hecho el ${fecha(G.reg.completado)}`:""}.</div>`:""}
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn" data-g-copiar>Copiar mensaje</button><button type="button" class="btn" data-g-mail>Abrir correo</button>
        <button type="button" class="btn primary" data-g-zip>Descargar paquete (ZIP)${fa.length?` · faltan ${fa.length}`:""}</button></div>
      <div class="row" style="justify-content:space-between"><span class="row"><button type="button" class="btn sm" data-g-env>${G.reg.enviado?"Quitar «enviado»":"Marcar como enviado"}</button>${G.reg.enviado?`<button type="button" class="btn sm" data-g-fin>${G.reg.completado?"Quitar «hecho»":"Cambio de nombre hecho"}</button>`:""}</span><button class="btn" value="no">Cerrar</button></div>`;
    d.scrollTop=y};
  const guardarReg=async p=>{G.reg={...G.reg,...p,loteId:cx.l?cx.l.id:"",matricula:cx.mat,facturaId:cx.f?cx.f.id:"",actualizado:new Date().toISOString()};
    for(const kk of Object.keys(G.reg))if(G.reg[kk]===null)delete G.reg[kk];await S.db.doc("gestoria/"+idReg(cx)).set(G.reg)};
  f.onchange=async e=>{const t=e.target,c=contexto(G.k);
    if(t.dataset.gTipo!=null){G.tipo=t.value;await guardarReg({tipoComprador:t.value===tipoAuto(c)?null:t.value});pintarD();return}
    if(t.dataset.gCfg){G.cfg={...G.cfg,[t.dataset.gCfg]:t.value.trim()};await S.db.doc("facturacion/gestoria").set(G.cfg);return}
    if(t.dataset.gSub){const tipo=t.dataset.gSub,fs=[...t.files];t.value="";if(!fs.length)return;
      try{const archivos=[];for(const fi of fs){if(fi.size>15e6){toast(fi.name+": máximo 15 MB");continue}toast("Subiendo "+fi.name+"…",20000);const u=await HUELSAN.subir("documentos",fi);archivos.push({ruta:u.id,nombre:fi.name,tipo:fi.type,size:fi.size,subido:new Date().toISOString()})}
        if(archivos.length){const id=nid(),doc={loteId:c.l?c.l.id:"",matricula:c.mat,tipo,nota:"Cambio de nombre",fecha:hoyISO(),archivos,creado:new Date().toISOString()};
          await S.db.doc("docscoche/"+id).set(doc);S.docsCoche.set(id,{...doc,id});toast("Guardado")}}catch(err){toast("No se ha podido subir: "+err.message,6000)}
      pintarD()}};
  f.onclick=async e=>{const t=e.target,c=contexto(G.k);
    const ver=t.closest("[data-g-ver]");if(ver){e.preventDefault();verArchivo(ver.dataset.gVer,ver.dataset.nombre);return}
    const del=t.closest("[data-g-del]");if(del){e.preventDefault();await borrarDocumento(del.dataset.gDel);setTimeout(pintarD,700);return}
    if(t.closest("[data-g-contrato]")){e.preventDefault();d.close();S.tab="contratos";pintarTabs&&pintarTabs();const C=window.HuelsanContratos||{};
      if(c.c&&C.abrir)C.abrir(c.c);else if(c.f&&C.abrirDesdeFactura)C.abrirDesdeFactura(c.f);else if(c.l&&C.abrirDesdeLote)C.abrirDesdeLote(c.l);return}
    const gen=t.closest("[data-g-gen]");if(gen){e.preventDefault();if(window.HuelsanVenta)window.HuelsanVenta.abrirMandato(G.k,null,gen.dataset.gGen);return}
    if(t.closest("[data-g-copiar]")){e.preventDefault();const m=mensaje(c,G.tipo,grupos(c,G.tipo));try{await navigator.clipboard.writeText(m);toast("Mensaje copiado")}catch(err){window.prompt("Copia el mensaje",m)}return}
    if(t.closest("[data-g-mail]")){e.preventDefault();const m=mensaje(c,G.tipo,grupos(c,G.tipo));
      location.href=`mailto:${encodeURIComponent(G.cfg.email||"")}?subject=${encodeURIComponent("Cambio de nombre "+(c.mat||c.x.titulo||""))}&body=${encodeURIComponent(m.slice(0,1800))}`;toast("Se abre tu correo: adjunta el ZIP del paquete",5000);return}
    if(t.closest("[data-g-zip]")){e.preventDefault();try{await paquete(c,G.tipo)}catch(err){toast(err.message||String(err),6000)}return}
    if(t.closest("[data-g-env]")){e.preventDefault();await guardarReg(G.reg.enviado?{enviado:null,completado:null}:{enviado:hoyISO()});pintarD();return}
    if(t.closest("[data-g-fin]")){e.preventDefault();await guardarReg({completado:G.reg.completado?null:hoyISO()});pintarD();return}};
  pintarD();d.returnValue="";d.showModal();
  d.onclose=()=>{f.onclick=null;f.onchange=null;pintar()};
}
async function paquete(cx,tipo){
  const gs=grupos(cx,tipo),fa=faltan(gs);
  if(fa.length&&!await confirmar("Faltan documentos",fa.map(i=>"• "+i.label).join("\n")+"\n\n¿Crear el paquete igualmente con lo que hay?","Crear el paquete"))return;
  await cargarJSZip();const z=new JSZip();z.file("00 - Datos para la gestoria.txt",datosTxt(cx,tipo));
  let n=0,hechas=0;
  for(const g of gs){n++;let m=0;for(const i of g.items)for(const a of i.archivos){m++;
    const nombre=limpiaNombre(`${pad(n)} - ${i.label.replace(/:.*$/,"")}${i.archivos.length>1?" ("+m+")":""}`)+extDe(a.nombre);
    toast(`Preparando ${++hechas}…`,20000);
    if(a.gen==="factura"){z.file(nombre.replace(/\.[a-z0-9]+$/i,"")+".pdf",(await pdfFactura(cx.f)).output("blob"))}
    else z.file(nombre,await HUELSAN.bajar("documentos",a.ruta))}}
  descargarBlob(await z.generateAsync({type:"blob"}),`Cambio de nombre ${cx.mat||cx.x.titulo||"vehiculo"}.zip`);toast("Paquete descargado: adjúntalo al correo de la gestoría",5000);
}

document.addEventListener("click",e=>{const b=e.target.closest("[data-gest]");if(!b)return;e.preventDefault();e.stopPropagation();abrir(b.dataset.gest).catch(err=>toast(err.message||String(err),6000))},true);
window.HuelsanGestoria={abrir,_t:{contexto,grupos,datosTxt,mensaje,tipoAuto,faltan,docsTipo}};
})();
