/* Huelsan Automoción · Documentos de venta y modelo de «Solicitud y mandato».
   - Modelo en blanco de la solicitud y mandato (PDF o imagen, el mismo para todas las ventas) guardado en contratoscfg/mandato,
     con los campos colocados encima (se pinchan una vez sobre el documento) para rellenarlo solo con los datos de cada venta.
   - Botón «Documentos de venta»: une en un solo PDF para imprimir: factura, contrato de compraventa, listado de documentos necesarios,
     solicitud y mandato rellenado y copia del permiso de circulación y de la ficha técnica.
   Usa pdf-lib (cdnjs) para rellenar y unir PDF, y jsPDF (ya cargado) para la factura, el contrato y el listado. */
(function(){
"use strict";
const M={cfg:null};
const A4=[595.28,841.89];
const MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const TIPO_PERMISO="Permiso de circulación",TIPO_FICHA="Ficha técnica";
const BASE=new URL("../",location.href).href;
const GT=()=>window.HuelsanGestoria&&window.HuelsanGestoria._t;

/* campos que se pueden colocar en el modelo */
const CAMPOS=[
  ["Comprador",[["comprador_nombre","Nombre y apellidos / razón social"],["comprador_dni","DNI, NIE o CIF"],["comprador_domicilio","Domicilio (calle y número)"],["comprador_cp","Código postal"],["comprador_municipio","Municipio"],["comprador_provincia","Provincia"],["comprador_direccion","Domicilio completo (en una línea)"],["comprador_telefono","Teléfono"],["comprador_email","Correo electrónico"],["marca_particular","Marca «X» si es particular"],["marca_empresa","Marca «X» si es empresa"],["representante_nombre","Representante o administrador (empresa)"],["representante_dni","DNI del representante (empresa)"],["representante_cargo","Cargo del representante (empresa)"]]],
  ["Vendedor",[["vendedor_nombre","Razón social del vendedor"],["vendedor_nif","NIF del vendedor"],["vendedor_direccion","Domicilio del vendedor (una línea)"],["vendedor_rep_nombre","Representante de Huelsan"],["vendedor_rep_dni","DNI del representante de Huelsan"]]],
  ["Vehículo",[["vehiculo_matricula","Matrícula"],["vehiculo_bastidor","Bastidor (VIN)"],["vehiculo_marca","Marca"],["vehiculo_modelo","Modelo"],["vehiculo_marca_modelo","Marca y modelo"],["vehiculo_fecha_matric","Fecha de matriculación"],["vehiculo_km","Kilómetros"]]],
  ["Operación y firma",[["precio","Precio total"],["fecha_venta","Fecha de la venta"],["lugar","Lugar (municipio)"],["fecha_hoy","Fecha de hoy (dd/mm/aaaa)"],["dia_hoy","Día de hoy"],["mes_hoy","Mes de hoy (en letra)"],["anio_hoy","Año de hoy"],["gestoria_nombre","Nombre de la gestoría"]]]];
const TODOS=CAMPOS.flatMap(g=>g[1]);

/* ---------- utilidades ---------- */
async function cargarPDFLib(){if(window.PDFLib)return;await new Promise((ok,ko)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";s.onload=ok;s.onerror=()=>ko(new Error("No se ha podido cargar el editor de PDF"));document.head.appendChild(s)})}
async function pdfjs(){if(window.__pdfjs)return window.__pdfjs;const lib=await import(BASE+"pdf.min.mjs");
  if(!globalThis.pdfjsWorker)globalThis.pdfjsWorker=await import(BASE+"pdf.worker.min.mjs");lib.GlobalWorkerOptions.workerSrc=BASE+"pdf.worker.min.mjs";return window.__pdfjs=lib}
const esPdf=a=>(a.tipo||"")==="application/pdf"||/\.pdf$/i.test(a.nombre||"");
const bytesDe=async b=>new Uint8Array(await b.arrayBuffer());
const limpia=t=>String(t==null?"":t).replace(/[^ -~ -ÿ€]/g,"").trim(); // solo caracteres de la fuente estándar del PDF
async function aJpeg(blob){let src;try{src=await createImageBitmap(blob,{imageOrientation:"from-image"})}catch(e){src=new Image();src.src=URL.createObjectURL(blob);await src.decode()}
  const cv=document.createElement("canvas");cv.width=src.width;cv.height=src.height;const x=cv.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,cv.width,cv.height);x.drawImage(src,0,0);
  return await new Promise((ok,ko)=>cv.toBlob(b=>b?ok(b):ko(new Error("No se pudo convertir la imagen")),"image/jpeg",.92))}
async function imagenPDF(blob){ // → {bytes, png:boolean}
  if(blob.type==="image/png")return{bytes:await bytesDe(blob),png:true};
  if(blob.type==="image/jpeg")return{bytes:await bytesDe(blob),png:false};
  return{bytes:await bytesDe(await aJpeg(blob)),png:false}}
async function paginaImagen(out,blob){
  const{bytes,png}=await imagenPDF(blob);const img=png?await out.embedPng(bytes):await out.embedJpg(bytes);
  const page=out.addPage(A4),m=30,r=Math.min((A4[0]-2*m)/img.width,(A4[1]-2*m)/img.height);const w=img.width*r,h=img.height*r;
  page.drawImage(img,{x:(A4[0]-w)/2,y:A4[1]-m-h,width:w,height:h});
}
/* une PDF (bytes) e imágenes (Blob) en un solo PDF */
async function unir(partes){
  const{PDFDocument}=PDFLib;const out=await PDFDocument.create();
  for(const p of partes){
    if(p.pdf){const src=await PDFDocument.load(p.pdf,{ignoreEncryption:true});(await out.copyPages(src,src.getPageIndices())).forEach(pg=>out.addPage(pg))}
    else if(p.img)await paginaImagen(out,p.img)}
  return out.save();
}

/* ---------- valores para rellenar ---------- */
function valores(cx,tipo){
  const e=S.emisor||{},cl=(cx.f||{}).cliente||{},cc=(cx.c||{}).comprador||{},emp=tipo==="empresa";
  const v=Object.assign({},(cx.f||{}).vehiculo||{},cx.c?Object.fromEntries(Object.entries(cx.c.vehiculo||{}).filter(([,x])=>x)):{});
  const rep=cx.c&&cx.c.rep?cx.reps[cx.c.rep]:null,t=cx.f?(cx.f.totales||calcular(cx.f.lineas)):null;
  const dir=(a,cp,m,p)=>[a,[cp,m].filter(Boolean).join(" "),p].filter(Boolean).join(", ");
  const nombre=emp?(cl.nombre||cc.razonSocial||""):(cl.nombre||[cc.nombre,cc.apellidos].filter(Boolean).join(" "));
  const calle=cl.direccion||(emp?cc.domicilioEmpresa:cc.domicilio)||"",cp=cl.cp||cc.cp||"",mun=cl.municipio||cc.municipio||"",prov=cl.provincia||cc.provincia||"";
  const hoy=hoyISO().split("-");
  const fv=(cx.f&&(cx.f.fechaOperacion||cx.f.fechaExpedicion))||(cx.c&&cx.c.fecha)||"";
  const precio=t?t.total:(cx.c&&cx.c.precio&&+cx.c.precio.total)||0;
  return{
    comprador_nombre:nombre,comprador_dni:emp?(cl.nif||cc.cif||""):(cl.nif||cc.dni||""),comprador_domicilio:calle,comprador_cp:cp,comprador_municipio:mun,comprador_provincia:prov,
    comprador_direccion:dir(calle,cp,mun,prov),comprador_telefono:cl.telefono||cc.telefono||"",comprador_email:cl.email||cc.email||"",
    marca_particular:emp?"":"X",marca_empresa:emp?"X":"",
    representante_nombre:emp?[cc.nombre,cc.apellidos].filter(Boolean).join(" "):"",representante_dni:emp?(cc.dni||""):"",representante_cargo:emp?(cc.cargo||""):"",
    vendedor_nombre:e.razonSocial||"",vendedor_nif:e.nif||"",vendedor_direccion:dir(e.domicilio,e.cp,e.municipio,e.provincia),
    vendedor_rep_nombre:rep?rep.nombre||"":"",vendedor_rep_dni:rep?rep.dni||"":"",
    vehiculo_matricula:v.matricula||cx.mat||"",vehiculo_bastidor:v.bastidor||"",vehiculo_marca:v.marca||"",vehiculo_modelo:[v.modelo,v.version].filter(Boolean).join(" "),
    vehiculo_marca_modelo:[v.marca,v.modelo].filter(Boolean).join(" "),vehiculo_fecha_matric:v.fechaMatric?fecha(v.fechaMatric):"",vehiculo_km:v.km?miles(String(Math.round(+v.km))):"",
    precio:precio?eur(precio):"",fecha_venta:fv?fecha(fv):"",lugar:(cx.c&&cx.c.ubicacion)||e.municipio||"",
    fecha_hoy:`${hoy[2]}/${hoy[1]}/${hoy[0]}`,dia_hoy:String(+hoy[2]),mes_hoy:MESES[+hoy[1]-1],anio_hoy:hoy[0],gestoria_nombre:(M.gestoria&&M.gestoria.nombre)||""};
}

/* ---------- solicitud y mandato rellenado ---------- */
async function rellenarMandato(tplBytes,esPdfTpl,campos,vals){
  const{PDFDocument,StandardFonts,rgb}=PDFLib;let doc;
  if(esPdfTpl)doc=await PDFDocument.load(tplBytes,{ignoreEncryption:true});
  else{doc=await PDFDocument.create();const png=tplBytes[0]===0x89;const img=png?await doc.embedPng(tplBytes):await doc.embedJpg(tplBytes);
    const W=A4[0],H=W*img.height/img.width;const pg=doc.addPage([W,H]);pg.drawImage(img,{x:0,y:0,width:W,height:H})}
  const font=await doc.embedFont(StandardFonts.Helvetica),pages=doc.getPages();
  for(const [k,c] of Object.entries(campos||{})){const txt=limpia(vals[k]);if(!txt||!c)continue;const pg=pages[c.p||0];if(!pg)continue;const{width:W,height:H}=pg.getSize();
    pg.drawText(txt,{x:c.x*W,y:H-c.y*H,size:c.s||10,font,color:rgb(0,0,0)})}
  return doc.save();
}
async function cargarModelo(){const sn=await S.db.doc("contratoscfg/mandato").get();M.cfg=sn&&sn.exists?sn.data():{};return M.cfg}
async function bytesModelo(){const a=M.cfg.archivo;const b=await HUELSAN.bajar("documentos",a.ruta);return{bytes:await bytesDe(b),pdf:esPdf(a)}}
async function mandatoBytes(cx,tipo){
  await cargarPDFLib();await cargarModelo();
  if(!M.cfg.archivo)throw new Error("Falta subir el modelo de solicitud y mandato (Datos fiscales → Solicitud y mandato)");
  const m=await bytesModelo();return rellenarMandato(m.bytes,m.pdf,M.cfg.campos||{},valores(cx,tipo));
}
function abrirPDF(bytes,nombre){const b=new Blob([bytes],{type:"application/pdf"});const u=URL.createObjectURL(b);const w=window.open(u,"_blank");if(!w)descargarBlob(b,nombre);setTimeout(()=>URL.revokeObjectURL(u),120000)}
async function cargarGestoria(){try{const sn=await S.db.doc("facturacion/gestoria").get();M.gestoria=sn&&sn.exists?sn.data():{}}catch(e){M.gestoria={}}}
async function abrirMandato(k){
  const G=GT(),cx=G.contexto(k);if(!cx)return;await cargarGestoria();
  try{toast("Preparando la solicitud y mandato…",15000);const tipo=((await S.db.doc("gestoria/"+(cx.l?cx.l.id:cx.x.matricula)).get()).data()||{}).tipoComprador||G.tipoAuto(cx);
    abrirPDF(await mandatoBytes(cx,tipo),`Solicitud y mandato ${cx.mat||""}.pdf`);toast("Listo")}catch(e){toast(e.message,7000)}
}

/* ---------- configuración del modelo ---------- */
async function abrirConfig(){
  await cargarModelo();
  const f=$("#f-confirm"),d=$("#dlg-confirm");
  const coches=porMatricula().filter(x=>x.lote&&(x.facturas.length||x.lote.estado==="vendido"));
  const pintarC=()=>{const a=M.cfg.archivo,n=Object.keys(M.cfg.campos||{}).length;
    f.innerHTML=`<h2>Solicitud y mandato · modelo en blanco</h2>
      <p class="muted" style="margin:0">Sube el modelo vacío (PDF, JPG o PNG), el mismo para todas las ventas. Después pincha sobre el documento dónde va cada dato y se rellenará solo con los datos de cada venta.</p>
      <div class="row" style="align-items:center"><span style="flex:1 1 200px">${a?`Modelo: <b>${esc(a.nombre)}</b>`:`<span class="tag bad">Aún no hay modelo</span>`}</span>${a?`<button type="button" class="btn sm" data-m-ver>Ver</button>`:""}
        <label class="btn sm primary" style="display:inline-flex">${a?"Cambiar modelo":"Subir modelo"}<input type="file" data-m-sub accept="application/pdf,image/jpeg,image/png" hidden></label></div>
      ${a?`<div class="row" style="align-items:center"><span style="flex:1 1 200px">Campos colocados: <b>${n}</b> de ${TODOS.length} <span class="muted">(solo hace falta colocar los que lleve tu modelo)</span></span><button type="button" class="btn primary" data-m-campos>Colocar campos…</button></div>
        <div class="row" style="align-items:center"><label style="flex:1 1 240px">Probar con una venta<select data-m-coche>${coches.map(x=>`<option value="${esc(x.matricula)}">${esc(x.matricula.startsWith("lote:")?"Sin matrícula":x.matricula)} · ${esc(x.titulo||"")}</option>`).join("")||`<option value="">No hay ventas todavía</option>`}</select></label>
        <button type="button" class="btn" data-m-probar ${coches.length?"":"disabled"}>Generar prueba</button></div>`:""}
      <div class="row" style="justify-content:flex-end"><button class="btn" value="no">Cerrar</button></div>`};
  f.onchange=async e=>{const t=e.target;if(t.dataset.mSub==null)return;const fi=t.files[0];t.value="";if(!fi)return;
    if(fi.size>15e6){toast("Máximo 15 MB");return}
    try{toast("Subiendo el modelo…",20000);const u=await HUELSAN.subir("documentos",fi);const ant=M.cfg.archivo;
      // al cambiar el modelo se conservan los campos colocados: pueden no coincidir, por eso se avisa
      M.cfg={...M.cfg,archivo:{ruta:u.id,nombre:fi.name,tipo:fi.type,size:fi.size,subido:new Date().toISOString()}};await S.db.doc("contratoscfg/mandato").set(M.cfg);
      if(ant)await HUELSAN.borrarArchivo("documentos",ant.ruta).catch(()=>{});
      toast(ant&&Object.keys(M.cfg.campos||{}).length?"Modelo cambiado: revisa la posición de los campos":"Modelo guardado",5000)}catch(err){toast("No se ha podido subir: "+err.message,6000)}
    pintarC()};
  f.onclick=async e=>{const t=e.target;
    if(t.closest("[data-m-ver]")){e.preventDefault();verArchivo(M.cfg.archivo.ruta,M.cfg.archivo.nombre);return}
    if(t.closest("[data-m-campos]")){e.preventDefault();try{await editor(pintarC)}catch(err){toast(err.message||String(err),7000)}return}
    if(t.closest("[data-m-probar]")){e.preventDefault();const k=f.querySelector("[data-m-coche]").value;if(k)await abrirMandato(k);return}};
  pintarC();d.returnValue="";d.showModal();d.onclose=()=>{f.onclick=null;f.onchange=null};
}

/* editor: se pincha sobre el documento dónde va cada campo */
async function editor(volver){
  await cargarPDFLib();const m=await bytesModelo();const f=$("#f-confirm"),d=$("#dlg-confirm");
  let pdf=null,n=1,pdim=A4,img=null;
  if(m.pdf){const lib=await pdfjs();pdf=await lib.getDocument({data:m.bytes.slice(),isEvalSupported:false}).promise;n=pdf.numPages}
  else{img=await createImageBitmap(new Blob([m.bytes],{type:m.bytes[0]===0x89?"image/png":"image/jpeg"}))}
  const campos=JSON.parse(JSON.stringify(M.cfg.campos||{}));
  let pag=0,sel=TODOS[0][0],tam=10,base=null;
  const render=async()=>{
    if(pdf){const pg=await pdf.getPage(pag+1);const v1=pg.getViewport({scale:1});pdim=[v1.width,v1.height];const vp=pg.getViewport({scale:1100/v1.width});
      const cv=document.createElement("canvas");cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);const x=cv.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,cv.width,cv.height);await pg.render({canvasContext:x,viewport:vp}).promise;base=cv}
    else{const cv=document.createElement("canvas");cv.width=1100;cv.height=Math.round(1100*img.height/img.width);const x=cv.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,cv.width,cv.height);x.drawImage(img,0,0,cv.width,cv.height);pdim=[A4[0],A4[0]*img.height/img.width];base=cv}};
  const dibujar=()=>{const cv=f.querySelector("#m-cv");if(!cv||!base)return;cv.width=base.width;cv.height=base.height;const x=cv.getContext("2d");x.drawImage(base,0,0);
    const k=cv.width/pdim[0];
    for(const [key,c] of Object.entries(campos)){if((c.p||0)!==pag)continue;const lab=(TODOS.find(t=>t[0]===key)||[0,key])[1];const px=c.x*cv.width,py=c.y*cv.height;
      x.fillStyle=key===sel?"#d6336c":"#1c63d6";x.font=`${Math.max(8,(c.s||10)*k)}px Helvetica,Arial,sans-serif`;x.fillText(lab,px,py);
      x.beginPath();x.arc(px,py,3.5,0,7);x.fill()}};
  const pintarE=()=>{const nColocados=Object.keys(campos).length;
    f.innerHTML=`<h2>Colocar campos</h2>
      <p class="muted" style="margin:0">1) Elige un campo de la lista. 2) Pincha en el documento, donde debe empezar a escribirse (el punto es el inicio del texto, en la línea de base). Salta solo al siguiente campo. Los que no uses, déjalos sin colocar.</p>
      <div class="row" style="align-items:center">${n>1?`<button type="button" class="btn sm" data-e-pag="-1" ${pag===0?"disabled":""}>←</button><span>Página ${pag+1} de ${n}</span><button type="button" class="btn sm" data-e-pag="1" ${pag===n-1?"disabled":""}>→</button>`:""}
        <label style="max-width:120px">Tamaño letra<input type="number" min="6" max="18" step="0.5" value="${tam}" data-e-tam></label><span class="muted">${nColocados} colocados</span></div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:10px;align-items:start">
        <div style="overflow:auto;max-height:62vh;border:1px solid var(--line,#ccc)"><canvas id="m-cv" style="width:100%;cursor:crosshair;display:block"></canvas></div>
        <div style="overflow:auto;max-height:62vh">${CAMPOS.map(([g,cs])=>`<b style="font-size:12px">${esc(g)}</b>${cs.map(([k,l])=>`<div class="row" style="gap:4px;margin:2px 0"><button type="button" class="btn sm ${sel===k?"primary":""}" style="flex:1;text-align:left;white-space:normal" data-e-sel="${k}">${campos[k]?"✓ ":""}${esc(l)}</button>${campos[k]?`<button type="button" class="btn sm" data-e-quitar="${k}" aria-label="Quitar" title="Quitar">✕</button>`:""}</div>`).join("")}`).join("")}</div></div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-e-volver>Volver</button><button type="button" class="btn primary" data-e-guardar>Guardar campos</button></div>`;
    dibujar();
    const cv=f.querySelector("#m-cv");cv.onclick=e=>{const r=cv.getBoundingClientRect();const x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
      campos[sel]={p:pag,x:Math.round(x*1e4)/1e4,y:Math.round(y*1e4)/1e4,s:tam};
      const i=TODOS.findIndex(t=>t[0]===sel),sig=TODOS.slice(i+1).find(t=>!campos[t[0]])||TODOS.find(t=>!campos[t[0]]);if(sig)sel=sig[0];pintarE()}};
  f.onclick=async e=>{const t=e.target;
    const p=t.closest("[data-e-pag]");if(p){e.preventDefault();pag=Math.max(0,Math.min(n-1,pag+(+p.dataset.ePag)));await render();pintarE();return}
    const s=t.closest("[data-e-sel]");if(s){e.preventDefault();sel=s.dataset.eSel;if(campos[sel]&&(campos[sel].p||0)!==pag){pag=campos[sel].p||0;await render()}pintarE();return}
    const q=t.closest("[data-e-quitar]");if(q){e.preventDefault();delete campos[q.dataset.eQuitar];pintarE();return}
    if(t.closest("[data-e-guardar]")){e.preventDefault();M.cfg={...M.cfg,campos};await S.db.doc("contratoscfg/mandato").set(M.cfg);toast("Campos guardados");volver();return}
    if(t.closest("[data-e-volver]")){e.preventDefault();volver();return}};
  f.onchange=e=>{const t=e.target;if(t.dataset.eTam!=null){tam=+t.value||10;if(campos[sel])campos[sel].s=tam;dibujar()}};
  await render();pintarE();
}

/* ---------- Documentos de venta ---------- */
function listadoPDF(c,tipo,cx){
  const J=window.jspdf.jsPDF,doc=new J({unit:"mm",format:"a4"}),C=window.HuelsanContratos,e=S.emisor||{};
  const v=c.vehiculo||{},W=210,m=18;let y=20;
  const nuevaPag=()=>{doc.addPage();y=20};
  doc.setFont("helvetica","bold").setFontSize(16).text(e.nombreComercial||e.razonSocial||"Huelsan Automoción",m,y);y+=8;
  doc.setFontSize(13).text("Documentación necesaria para la compra",m,y);y+=7;
  doc.setFont("helvetica","normal").setFontSize(10.5);
  const comp=((cx.f||{}).cliente||{}).nombre||[(c.comprador||{}).nombre,(c.comprador||{}).apellidos].filter(Boolean).join(" ")||(c.comprador||{}).razonSocial||"";
  doc.text([[v.marca,v.modelo].filter(Boolean).join(" ")+(v.matricula?" · "+v.matricula:""),comp?"Comprador: "+comp+(tipo==="empresa"?" (empresa)":" (particular)"):""].filter(Boolean),m,y);y+=(comp?12:7);
  const caja=(x0,y0,ok)=>{doc.setDrawColor(40).setLineWidth(.3).rect(x0,y0-3.4,4,4);if(ok){doc.line(x0+.7,y0-2.7,x0+3.3,y0-.1);doc.line(x0+3.3,y0-2.7,x0+.7,y0-.1)}};
  const lista=(titulo,items)=>{if(y>262)nuevaPag();doc.setFont("helvetica","bold").setFontSize(11.5).text(titulo,m,y);y+=6.5;doc.setFont("helvetica","normal").setFontSize(10.5);
    for(const [txt,ok] of items){const l=doc.splitTextToSize(txt,W-2*m-9);if(y+l.length*5>280)nuevaPag();caja(m,y,ok);doc.text(l,m+8,y);y+=l.length*5+2.2}y+=4};
  lista("Documentos que debe aportar el comprador",C.docsDelContrato(c).map(d=>[d.texto,!!(c.docsPedir||{})[d.id]]));
  lista("Documentación y elementos que se entregan con el vehículo",(C.DOCS||[]).map(([k,t])=>[t,!!(c.docs||{})[k]]));
  doc.setFontSize(9).setTextColor(100).text("Marca con una X lo que ya se ha recibido o entregado.",m,Math.min(y,284));
  return doc;
}
function contratoDe(cx){
  const C=window.HuelsanContratos;if(cx.c)return cx.c;
  if(cx.f)return C.desdeFactura(cx.f);
  return C.desdeLote?C.desdeLote(cx.l):C.contratoVacio();
}
async function abrirVenta(k){
  const G=GT(),cx=G&&G.contexto(k);if(!cx){toast("No encuentro ese coche");return}
  await cargarModelo();await cargarGestoria();
  let tipo=((await S.db.doc("gestoria/"+(cx.l?cx.l.id:cx.x.matricula)).get().then(s=>s.data&&s.data()).catch(()=>null))||{}).tipoComprador||G.tipoAuto(cx);
  const f=$("#f-confirm"),d=$("#dlg-confirm");
  const marcados={factura:true,contrato:true,listado:true,mandato:true,permiso:true,ficha:true};
  const estado=()=>{const c=G.contexto(k),perm=G.docsTipo(c,TIPO_PERMISO),fic=G.docsTipo(c,TIPO_FICHA);
    return{c,perm,fic,items:[
      ["factura","Factura de venta",c.f?`Factura ${c.f.codigo}`:"",!!c.f,c.f?"":"Aún no hay factura de venta emitida."],
      ["contrato","Contrato de compraventa",c.c?"El contrato guardado, listo para firmar":"Se crea con los datos de la venta",true,""],
      ["listado","Listado de documentos necesarios","Lo que debe aportar el comprador y lo que se le entrega",true,""],
      ["mandato","Solicitud y mandato","Modelo rellenado con los datos de la venta",!!M.cfg.archivo,M.cfg.archivo?"":"Falta subir el modelo en blanco.",M.cfg.archivo&&!Object.keys(M.cfg.campos||{}).length?"Aún no has colocado los campos: saldrá el modelo en blanco.":""],
      ["permiso","Permiso de circulación (copia)",perm.length?`${perm.length} archivo${perm.length>1?"s":""}`:"",perm.length>0,perm.length?"":"Sube una copia del permiso."],
      ["ficha","Ficha técnica (copia)",fic.length?`${fic.length} archivo${fic.length>1?"s":""}`:"",fic.length>0,fic.length?"":"Sube una copia de la ficha técnica."]]}};
  const pintarV=()=>{const E=estado(),c=E.c;
    f.innerHTML=`<h2>Documentos de venta</h2>
      <div class="row" style="align-items:center"><span><b>${esc(c.x.titulo||"")}</b> ${c.mat?`<span class="mat">${esc(c.mat)}</span>`:""}</span>
        <label style="max-width:190px;flex:0 0 auto">Comprador<select data-v-tipo><option value="particular" ${tipo==="particular"?"selected":""}>Particular</option><option value="empresa" ${tipo==="empresa"?"selected":""}>Empresa</option></select></label></div>
      <p class="muted" style="margin:0">Se unen en un solo PDF, en este orden, para imprimirlo de una vez.</p>
      ${E.items.map(([key,tit,desc,ok,aviso,aviso2])=>`<div class="row" style="align-items:center;margin:2px 0">
        <label class="row" style="flex-direction:row;flex:1 1 260px;gap:8px;color:var(--ink);font-weight:500;align-items:flex-start"><input type="checkbox" data-v-inc="${key}" ${marcados[key]&&ok?"checked":""} ${ok?"":"disabled"} style="width:auto;margin-top:3px"><span>${esc(tit)}<div class="muted" style="font-weight:400;font-size:12.5px">${esc(desc)}${aviso?` <b style="color:var(--bad)">${esc(aviso)}</b>`:""}${aviso2?` <span style="color:var(--warn)">${esc(aviso2)}</span>`:""}</div></span></label>
        ${key==="permiso"||key==="ficha"?`<label class="btn sm primary" style="display:inline-flex">Subir<input type="file" data-v-sub="${key==="permiso"?TIPO_PERMISO:TIPO_FICHA}" multiple hidden accept="application/pdf,image/*"></label>`:""}
        ${key==="mandato"?`<button type="button" class="btn sm" data-v-modelo>${M.cfg.archivo?"Modelo y campos…":"Subir modelo…"}</button>`:""}
        ${key==="contrato"?`<button type="button" class="btn sm" data-v-contrato>Editar contrato</button>`:""}</div>`).join("")}
      <div class="row" style="justify-content:flex-end;margin-top:6px"><button type="button" class="btn" data-v-desc>Descargar PDF</button><button type="button" class="btn primary" data-v-imp>Abrir para imprimir</button></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" value="no">Cerrar</button></div>`};
  const partesDe=async(archivos,partes)=>{for(const a of archivos){const b=await HUELSAN.bajar("documentos",a.ruta);if(esPdf(a))partes.push({pdf:await bytesDe(b)});else partes.push({img:b})}};
  const generar=async()=>{
    await cargarPDFLib();const E=estado(),c=E.c,sel=[...f.querySelectorAll("[data-v-inc]")].filter(i=>i.checked).map(i=>i.dataset.vInc);
    if(!sel.length)throw new Error("Marca al menos un documento");
    const partes=[];let n=0;
    for(const key of ["factura","contrato","listado","mandato","permiso","ficha"]){if(!sel.includes(key))continue;toast(`Preparando ${++n}/${sel.length}…`,20000);
      if(key==="factura")partes.push({pdf:new Uint8Array(await (await pdfFactura(c.f)).output("arraybuffer"))});
      else if(key==="contrato")partes.push({pdf:new Uint8Array(await (await window.HuelsanContratos.generarContrato(contratoDe(c))).output("arraybuffer"))});
      else if(key==="listado")partes.push({pdf:new Uint8Array(listadoPDF(contratoDe(c),tipo,c).output("arraybuffer"))});
      else if(key==="mandato")partes.push({pdf:await mandatoBytes(c,tipo)});
      else await partesDe(key==="permiso"?E.perm:E.fic,partes)}
    return unir(partes)};
  f.onchange=async e=>{const t=e.target;
    if(t.dataset.vTipo!=null){tipo=t.value;pintarV();return}
    if(t.dataset.vInc){marcados[t.dataset.vInc]=t.checked;return}
    if(t.dataset.vSub){const tp=t.dataset.vSub,fs=[...t.files];t.value="";if(!fs.length)return;const c=G.contexto(k);
      try{const archivos=[];for(const fi of fs){if(fi.size>15e6){toast(fi.name+": máximo 15 MB");continue}toast("Subiendo "+fi.name+"…",20000);const u=await HUELSAN.subir("documentos",fi);archivos.push({ruta:u.id,nombre:fi.name,tipo:fi.type,size:fi.size,subido:new Date().toISOString()})}
        if(archivos.length){const id=nid(),dc={loteId:c.l?c.l.id:"",matricula:c.mat,tipo:tp,nota:"Documentos de venta",fecha:hoyISO(),archivos,creado:new Date().toISOString()};await S.db.doc("docscoche/"+id).set(dc);S.docsCoche.set(id,{...dc,id});toast("Guardado")}}
      catch(err){toast("No se ha podido subir: "+err.message,6000)}
      pintarV()}};
  f.onclick=async e=>{const t=e.target;
    if(t.closest("[data-v-modelo]")){e.preventDefault();d.close();setTimeout(abrirConfig,50);return}
    if(t.closest("[data-v-contrato]")){e.preventDefault();d.close();const C=window.HuelsanContratos,c=G.contexto(k);S.tab="contratos";pintarTabs();if(c.c)C.abrir(c.c);else if(c.f)C.abrirDesdeFactura(c.f);else if(C.abrirDesdeLote)C.abrirDesdeLote(c.l);return}
    if(t.closest("[data-v-imp]")||t.closest("[data-v-desc]")){e.preventDefault();const imp=!!t.closest("[data-v-imp]");
      try{const bytes=await generar(),nom=`Documentos de venta ${G.contexto(k).mat||""}.pdf`;if(imp)abrirPDF(bytes,nom);else descargarBlob(new Blob([bytes],{type:"application/pdf"}),nom);toast(imp?"PDF abierto: imprímelo desde el visor":"PDF descargado",4000)}
      catch(err){toast(err.message||String(err),7000)}return}};
  pintarV();d.returnValue="";d.showModal();d.onclose=()=>{f.onclick=null;f.onchange=null};
}

document.addEventListener("click",e=>{
  const v=e.target.closest("[data-venta]");if(v){e.preventDefault();e.stopPropagation();abrirVenta(v.dataset.venta).catch(err=>toast(err.message||String(err),6000));return}
  const c=e.target.closest("[data-mandato-cfg]");if(c){e.preventDefault();e.stopPropagation();abrirConfig().catch(err=>toast(err.message||String(err),6000))}},true);
window.HuelsanVenta={abrirVenta,abrirMandato,abrirConfig,_t:{valores,rellenarMandato,unir,listadoPDF,limpia,TODOS}};
})();
