/* Huelsan Automoción · Documentos de venta y modelos en blanco (solicitud DGT, mandato de la gestoría…).
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
  ["Comprador",[["comprador_nombre","Nombre y apellidos / razón social"],["comprador_nombre_pila","Solo el nombre (o razón social)"],["comprador_fecha_nac","Fecha de nacimiento (particular)"],["comprador_apellido1","Primer apellido"],["comprador_apellido2","Segundo apellido"],["comprador_apellidos","Apellidos (los dos)"],["comprador_tipo_via","Tipo de vía (Calle, Avenida…)"],["comprador_calle","Nombre de la vía"],["comprador_numero","Número de la vía"],["comprador_dni","DNI, NIE o CIF"],["comprador_domicilio","Domicilio (calle y número)"],["comprador_cp","Código postal"],["comprador_municipio","Municipio"],["comprador_provincia","Provincia"],["comprador_direccion","Domicilio completo (en una línea)"],["comprador_telefono","Teléfono"],["comprador_email","Correo electrónico"],["marca_particular","Marca «X» si es particular"],["marca_empresa","Marca «X» si es empresa"],["representante_nombre","Representante o administrador (empresa)"],["representante_dni","DNI del representante (empresa)"],["representante_cargo","Cargo del representante (empresa)"]]],
  ["Vendedor",[["vendedor_nombre","Razón social del vendedor"],["vendedor_nif","NIF del vendedor"],["vendedor_direccion","Domicilio del vendedor (una línea)"],["vendedor_rep_nombre","Representante de Huelsan"],["vendedor_rep_dni","DNI del representante de Huelsan"]]],
  ["Vehículo",[["vehiculo_matricula","Matrícula"],["vehiculo_bastidor","Bastidor (VIN)"],["vehiculo_marca","Marca"],["vehiculo_modelo","Modelo"],["vehiculo_marca_modelo","Marca y modelo"],["vehiculo_fecha_matric","Fecha de matriculación"],["vehiculo_km","Kilómetros"]]],
  ["Operación y firma",[["x_cambio_titularidad","Marca «Cambio de titularidad»"],["x_comprador_interesado","Marca «Interesado» (comprador)"],["x_vendedor_titular","Marca «Titular» (vendedor)"],["precio","Precio total"],["fecha_venta","Fecha de la venta"],["lugar","Lugar (municipio)"],["fecha_hoy","Fecha de hoy (dd/mm/aaaa)"],["dia_hoy","Día de hoy"],["mes_hoy","Mes de hoy (en letra)"],["anio_hoy","Año de hoy"],["gestoria_nombre","Nombre de la gestoría"]]]];
const LUGAR_REP={francisco:"Huelva",gustavo:"Murcia"}; // dónde se vende y se firma según quién vende
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
  const e=S.emisor||{},live=(cx.f&&S.clientes&&S.clientes.get(cx.f.clienteId))||{},cl=Object.assign({},(cx.f||{}).cliente||{}),cc=Object.assign({},(cx.c||{}).comprador||{}),emp=tipo==="empresa";
  if(emp){const m={nombre:live.repNombre,apellidos:live.repApellidos,dni:live.repDni,cargo:live.repCargo};for(const k in m)if(m[k])cc[k]=m[k]}
  else{if(live.nombre)cc.nombre=live.nombre;if(live.apellidos)cc.apellidos=live.apellidos}
  const v=Object.assign({},(cx.f||{}).vehiculo||{},cx.c?Object.fromEntries(Object.entries(cx.c.vehiculo||{}).filter(([,x])=>x)):{});
  const repId=cx.repId||(cx.c&&cx.c.rep)||"",rep=repId&&cx.reps?cx.reps[repId]:null,t=cx.f?(cx.f.totales||calcular(cx.f.lineas)):null;
  const dir=(a,cp,m,p)=>[a,[cp,m].filter(Boolean).join(" "),p].filter(Boolean).join(", ");
  const nombre=emp?(cl.nombre||cc.razonSocial||""):(cl.nombre||[cc.nombre,cc.apellidos].filter(Boolean).join(" "));
  const calle=cl.direccion||(emp?cc.domicilioEmpresa:cc.domicilio)||"",cp=cl.cp||cc.cp||"",mun=cl.municipio||cc.municipio||"",prov=cl.provincia||cc.provincia||"";
  const hoy=hoyISO().split("-");
  let pila=emp?nombre:(cc.nombre||""),apes=emp?"":(cc.apellidos||"");
  const fnac=!emp&&live.fechaNac?fecha(live.fechaNac):"";
  if(!emp&&!pila&&nombre){const w=nombre.trim().split(/\s+/),k=w.length>=3?w.length-2:1;pila=w.slice(0,k).join(" ");apes=w.slice(k).join(" ")}
  const ap=apes.trim().split(/\s+/).filter(Boolean),ap1=ap[0]||"",ap2=ap.slice(1).join(" ");
  const via=String(calle).match(/^\s*(c\/|calle|cl\.?|avenida|avda\.?|av\.?|plaza|pza\.?|paseo|camino|carretera|ctra\.?|urbanizaci[oó]n|ronda|traves[ií]a|pol[ií]gono|barrio|travesia)\s+(.*)$/i);
  const tipoVia=via?({"c/":"Calle","cl":"Calle","cl.":"Calle","avda":"Avenida","avda.":"Avenida","av":"Avenida","av.":"Avenida","pza":"Plaza","pza.":"Plaza","ctra":"Carretera","ctra.":"Carretera"}[via[1].toLowerCase()]||via[1].replace(/^./,c=>c.toUpperCase())):"",resto=via?via[2]:calle;
  const nm=String(resto).match(/^(.*?)[,\s]+(?:n[uú]mero|n[ºo°.]|num\.?)?\s*(\d+[A-Za-z]?)\b\s*(.*)$/i),calleSola=(nm?nm[1]:resto).replace(/[,\s]+$/,""),numVia=nm?nm[2]:"";
  const fv=(cx.f&&(cx.f.fechaOperacion||cx.f.fechaExpedicion))||(cx.c&&cx.c.fecha)||"";
  const precio=t?t.total:(cx.c&&cx.c.precio&&+cx.c.precio.total)||0;
  return{
    comprador_nombre:nombre,comprador_dni:emp?(cl.nif||cc.cif||""):(cl.nif||cc.dni||""),comprador_domicilio:calle,comprador_cp:cp,comprador_municipio:mun,comprador_provincia:prov,
    comprador_direccion:dir(calle,cp,mun,prov),comprador_telefono:cl.telefono||cc.telefono||"",comprador_email:cl.email||cc.email||"",
    comprador_nombre_pila:pila,comprador_apellido1:ap1,comprador_apellido2:ap2,comprador_apellidos:apes,comprador_tipo_via:tipoVia,comprador_calle:calleSola,comprador_numero:numVia,
    x_cambio_titularidad:"X",x_comprador_interesado:"X",x_vendedor_titular:"X",
    marca_particular:emp?"":"X",marca_empresa:emp?"X":"",
    representante_nombre:emp?[cc.nombre,cc.apellidos].filter(Boolean).join(" "):"",representante_dni:emp?(cc.dni||""):"",representante_cargo:emp?(cc.cargo||""):"",
    vendedor_nombre:e.razonSocial||"",vendedor_nif:e.nif||"",vendedor_direccion:dir(e.domicilio,e.cp,e.municipio,e.provincia),
    vendedor_rep_nombre:rep?rep.nombre||"":"",vendedor_rep_dni:rep?rep.dni||"":"",
    vehiculo_matricula:v.matricula||cx.mat||"",vehiculo_bastidor:v.bastidor||"",vehiculo_marca:v.marca||"",vehiculo_modelo:[v.modelo,v.version].filter(Boolean).join(" "),
    vehiculo_marca_modelo:[v.marca,v.modelo].filter(Boolean).join(" "),vehiculo_fecha_matric:v.fechaMatric?fecha(v.fechaMatric):"",vehiculo_km:v.km?miles(String(Math.round(+v.km))):"",
    precio:precio?eur(precio):"",fecha_venta:fv?fecha(fv):"",lugar:LUGAR_REP[repId]||(rep&&rep.lugar)||(cx.c&&cx.c.ubicacion)||e.municipio||"",comprador_fecha_nac:fnac,
    fecha_hoy:`${hoy[2]}/${hoy[1]}/${hoy[0]}`,dia_hoy:String(+hoy[2]),mes_hoy:MESES[+hoy[1]-1],anio_hoy:hoy[0],gestoria_nombre:(M.gestoria&&M.gestoria.nombre)||""};
}

/* ---------- modelos en blanco (solicitud DGT, mandato de la gestoría, etc.) ---------- */
// contratoscfg/mandato = {docs:[{id,nombre,archivo:{ruta,nombre,tipo,size},campos:{clave:{p,x,y,s}},form:{nombreCampoPDF:clave}}]}
async function cargarModelo(){
  const sn=await S.db.doc("contratoscfg/mandato").get();const d=sn&&sn.exists?sn.data():{};
  if(Array.isArray(d.docs))M.cfg={docs:d.docs};
  else if(d.archivo)M.cfg={docs:[{id:"d1",nombre:"Solicitud y mandato",archivo:d.archivo,campos:d.campos||{},form:{}}]}; // formato anterior
  else M.cfg={docs:[]};
  return M.cfg}
const guardarCfg=()=>S.db.doc("contratoscfg/mandato").set({docs:M.cfg.docs});
const docModelo=id=>M.cfg.docs.find(x=>x.id===id);
async function bytesModelo(doc){const a=doc.archivo;const b=await HUELSAN.bajar("documentos",a.ruta);return{bytes:await bytesDe(b),pdf:esPdf(a)}}

/* detección automática: busca las etiquetas (Nombre, DNI, Matrícula…) y propone escribir justo detrás */
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const SECC=[["vendedor",/\b(vendedor|transmitente|cedente|titular actual|titular del vehiculo)\b/],["gestor",/\b(mandatario|gestor|gestoria|colegiado)\b/],["comprador",/\b(comprador|adquirente|adquiriente|nuevo titular|mandante|solicitante|interesado)\b/],["vehiculo",/\b(datos del vehiculo|vehiculo)\b/]];
function reglaCampo(texto,sec){
  const l=norm(texto).replace(/[\s:._\-]+$/,"");if(!l||l.length>48)return null;
  const per=(c,v,g)=>sec==="vendedor"?v:sec==="gestor"?g:c;
  if(/^(nombre|apellidos|razon social|denominacion)/.test(l)){if(/^apellidos/.test(l)&&!/nombre/.test(l)&&sec!=="vendedor"&&sec!=="gestor")return"comprador_apellidos";return per("comprador_nombre","vendedor_nombre","gestoria_nombre")}
  if(/^(dni|nif|nie|cif|d\.? ?n\.? ?i|n\.? ?i\.? ?f|documento de identidad|numero de documento|n[º°o] ?de? ?documento)/.test(l))return/representante/.test(l)?"representante_dni":per("comprador_dni","vendedor_nif",null);
  if(/^(domicilio|direccion|calle|via publica)/.test(l))return per("comprador_domicilio","vendedor_direccion",null);
  if(/^(c\.? ?p\.?|codigo postal)/.test(l))return"comprador_cp";
  if(/^(municipio|localidad|poblacion)/.test(l))return"comprador_municipio";
  if(/^provincia/.test(l))return"comprador_provincia";
  if(/^(telefono|tel\b|movil)/.test(l))return"comprador_telefono";
  if(/^(correo|e-?mail)/.test(l))return"comprador_email";
  if(/^matricula/.test(l))return"vehiculo_matricula";
  if(/^(bastidor|vin\b|n[º°o] ?(de )?bastidor|numero de bastidor|n[º°o] ?de identificacion)/.test(l))return"vehiculo_bastidor";
  if(/^marca/.test(l))return/modelo/.test(l)?"vehiculo_marca_modelo":"vehiculo_marca";
  if(/^modelo/.test(l))return"vehiculo_modelo";
  if(/^fecha de (primera )?matriculacion/.test(l))return"vehiculo_fecha_matric";
  if(/^(kilometros|kilometraje|km\b)/.test(l))return"vehiculo_km";
  if(/^(precio|importe)/.test(l))return"precio";
  if(/^lugar/.test(l))return"lugar";
  if(l==="fecha")return"fecha_hoy";
  return null}
// nombre de un campo de formulario PDF → clave (misma idea, con nombres tipo «nombre_apellidos», «dni_comprador»…)
const DGT={"matricula":"vehiculo_matricula","nifnie del tutor":null,"codigo iae impuesto de actividades economicas":null,"otrosrow1":null,"fecha nacimiento":"comprador_fecha_nac","exencion itp":null,"codigo cet":null,"codigo cema":null,"bloque":null,"portal":null,"escalera":null,"planta":null,"puerta":null,"servicio al que se destina el vehiculo":null,"fecha matriculacion":"vehiculo_fecha_matric","tipo via":"comprador_tipo_via","nombre de la via":"comprador_calle","numero":"comprador_numero","km":null,"codigo postal":"comprador_cp","provincia":"comprador_provincia","municipio":"comprador_municipio","localidad":"comprador_municipio","correo electronico":"comprador_email","telefono":"comprador_telefono",
  "nifniecif":"comprador_dni","nombrerazon social":"comprador_nombre_pila","apellido 1":"comprador_apellido1","apellido 2":"comprador_apellido2",
  "nifniecif_2":"vendedor_nif","nombrerazon social_2":"vendedor_nombre","en":"lugar","a":"dia_hoy","de":"mes_hoy","de_2":"anio_hoy",
  "tramite":"x_cambio_titularidad|cambio","datoscomprador":"x_comprador_interesado|interesado","datosvendedor":"x_vendedor_titular|0"};
function reglaForm(nombre){const ex=DGT[norm(nombre)];if(ex!==undefined)return ex;const l=norm(nombre).replace(/[_\-.\[\]0-9]+/g," ").trim();
  const sec=/vendedor|transmitente|cedente/.test(l)?"vendedor":/mandatario|gestor/.test(l)?"gestor":"comprador";
  return reglaCampo(l,sec)||(/(^|\s)(dni|nif|nie|cif)(\s|$)/.test(l)?(sec==="vendedor"?"vendedor_nif":"comprador_dni"):null)}
async function sugerir(doc){
  const m=await bytesModelo(doc);const out={campos:{},form:{},n:0};if(!m.pdf)return out;
  // 1) formulario rellenable
  try{await cargarPDFLib();const pd=await PDFLib.PDFDocument.load(m.bytes,{ignoreEncryption:true});
    const pages=pd.getPages();
    for(const fl of pd.getForm().getFields()){const tp=fl.constructor.name;if(/Button|Signature/.test(tp))continue;const k0=reglaForm(fl.getName());if(!k0)continue;
      if(tp==="PDFRadioGroup"){ // los botones de opción se marcan con una «X» en su casilla (más fiable que rellenarlos)
        const[k,opc]=k0.split("|");let ok=false;
        for(const w of fl.acroField.getWidgets()){let ov="";try{ov=w.getOnValue().decodeText()}catch(e){}if(opc&&ov!==opc)continue;
          const r=w.getRectangle(),x0=Math.min(r.x,r.x+r.width),y0=Math.min(r.y,r.y+r.height),bw=Math.abs(r.width),bh=Math.abs(r.height),pi=Math.max(0,pages.findIndex(pg=>(pg.node.Annots()?pg.node.Annots().asArray():[]).some(a=>pd.context.lookup(a)===w.dict))),{width:W,height:H}=pages[pi].getSize();
          if(!out.campos[k]){out.campos[k]={p:pi,x:Math.round((x0+(bw-6.7)/2)/W*1e4)/1e4,y:Math.round((H-y0-(bh-7)/2)/H*1e4)/1e4,s:10};out.n++;ok=true}break}
        if(!ok&&!Object.values(out.form).includes(k0)){out.form[fl.getName()]=k0;out.n++}
        continue}
      out.form[fl.getName()]=k0;out.n++}}catch(e){}
  if(Object.keys(out.form).length||Object.keys(out.campos).length)return out;
  // 2) texto del documento: etiquetas y su posición
  const lib=await pdfjs();const pdf=await lib.getDocument({data:m.bytes.slice(),isEvalSupported:false}).promise;const etiq={};
  for(let p=0;p<pdf.numPages;p++){const pg=await pdf.getPage(p+1),v=pg.getViewport({scale:1}),W=v.width,H=v.height,tc=await pg.getTextContent();
    const items=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>({s:i.str,x:i.transform[4],y:i.transform[5],w:i.width,h:Math.abs(i.transform[3])||10}))
      .sort((a,b)=>Math.abs(b.y-a.y)>3?b.y-a.y:a.x-b.x);
    let sec=null;
    for(const it of items){const t=norm(it.s);
      const k=reglaCampo(it.s,sec);
      if(k){if(!out.campos[k]){out.campos[k]={p,x:Math.round(Math.min(0.97,(it.x+it.w+4)/W)*1e4)/1e4,y:Math.round((H-it.y)/H*1e4)/1e4,s:10};etiq[k]=t.replace(/[\s:._\-]+$/,"");out.n++}continue}
      for(const [nombre,re] of SECC)if(re.test(t)&&t.length<60){sec=nombre;break}}}
  if(out.campos.comprador_apellidos&&out.campos.comprador_nombre&&etiq.comprador_nombre==="nombre"){out.campos.comprador_nombre_pila=out.campos.comprador_nombre;delete out.campos.comprador_nombre}
  return out}

/* ---------- rellenar ---------- */
async function rellenarMandato(tplBytes,esPdfTpl,campos,vals,formMap){
  const{PDFDocument,StandardFonts,rgb}=PDFLib;let doc;
  if(esPdfTpl)doc=await PDFDocument.load(tplBytes,{ignoreEncryption:true});
  else{doc=await PDFDocument.create();const png=tplBytes[0]===0x89;const img=png?await doc.embedPng(tplBytes):await doc.embedJpg(tplBytes);
    const W=A4[0],H=W*img.height/img.width;const pg=doc.addPage([W,H]);pg.drawImage(img,{x:0,y:0,width:W,height:H})}
  const font=await doc.embedFont(StandardFonts.Helvetica),pages=doc.getPages();
  if(formMap&&Object.keys(formMap).length){const form=doc.getForm();
    for(const [nombre,clave] of Object.entries(formMap)){const[k,opc]=String(clave).split("|"),txt=limpia(vals[k]);if(!txt)continue;
      try{const fl=form.getField(nombre),tp=fl.constructor.name;
        if(tp==="PDFTextField")fl.setText(txt);
        else if(tp==="PDFCheckBox")fl.check();
        else if(tp==="PDFRadioGroup"){const o=fl.getOptions();fl.select(o.includes(opc)?opc:o[0])}
        else if(tp==="PDFDropdown"||tp==="PDFOptionList"){const o=fl.getOptions(),n=norm(txt),h=o.find(x=>norm(x)===n)||o.find(x=>norm(x).startsWith(n)||n.startsWith(norm(x)&&norm(x)));
          if(h)fl.select(h);else{fl.addOptions([txt]);fl.select(txt)}}}catch(e){}}
    try{for(const fl of form.getFields())if(/PDFTextField|PDFDropdown/.test(fl.constructor.name)){try{fl.acroField.setDefaultAppearance("/Helv 9 Tf 0 g")}catch(e){}try{fl.setFontSize(9)}catch(e){}}form.updateFieldAppearances(font);form.flatten()}catch(e){}}
  for(const [k,c] of Object.entries(campos||{})){const txt=limpia(vals[k]);if(!txt||!c)continue;const pg=pages[c.p||0];if(!pg)continue;const{width:W,height:H}=pg.getSize();
    pg.drawText(txt,{x:c.x*W,y:H-c.y*H,size:c.s||10,font,color:rgb(0,0,0)})}
  return doc.save();
}
async function modeloBytes(doc,cx,tipo){const m=await bytesModelo(doc);return rellenarMandato(m.bytes,m.pdf,doc.campos||{},valores(cx,tipo),doc.form||{})}
function abrirPDF(bytes,nombre){const b=new Blob([bytes],{type:"application/pdf"});const u=URL.createObjectURL(b);const w=window.open(u,"_blank");if(!w)descargarBlob(b,nombre);setTimeout(()=>URL.revokeObjectURL(u),120000)}
async function cargarGestoria(){try{const sn=await S.db.doc("facturacion/gestoria").get();M.gestoria=sn&&sn.exists?sn.data():{}}catch(e){M.gestoria={}}}
// genera todos los modelos (o solo uno) para una venta y los abre para imprimir
async function abrirMandato(k,docId){
  const G=GT(),cx=G.contexto(k);if(!cx)return;await cargarGestoria();
  try{toast("Preparando los documentos…",15000);await cargarPDFLib();await cargarModelo();
    const lista=docId?M.cfg.docs.filter(x=>x.id===docId):M.cfg.docs;if(!lista.length)throw new Error("Falta subir los modelos en blanco (Datos fiscales → Solicitudes y mandatos)");
    const reg=(await S.db.doc("gestoria/"+(cx.l?cx.l.id:cx.x.matricula)).get()).data()||{};cx.repId=reg.repVende||"";
    const tipo=reg.tipoComprador||G.tipoAuto(cx);
    const partes=[];for(const d of lista)partes.push({pdf:await modeloBytes(d,cx,tipo)});
    abrirPDF(await unir(partes),`${docId?lista[0].nombre:"Solicitudes y mandatos"} ${cx.mat||""}.pdf`);toast("Listo")}catch(e){toast(e.message,7000)}
}

/* ---------- configuración de los modelos ---------- */
const nombreDeArchivo=n=>String(n||"Documento").replace(/\.[a-z0-9]{2,5}$/i,"").replace(/[_\-]+/g," ").trim()||"Documento";
async function abrirConfig(){
  await cargarModelo();
  const f=$("#f-confirm"),d=$("#dlg-confirm");
  const coches=porMatricula().filter(x=>x.lote&&(x.facturas.length||x.lote.estado==="vendido"));
  const pintarC=()=>{
    f.innerHTML=`<h2>Solicitudes y mandatos · modelos en blanco</h2>
      <p class="muted" style="margin:0">Sube cada modelo vacío (solicitud de la DGT, mandato de la gestoría, etc.: PDF, JPG o PNG), el mismo para todas las ventas. Al subirlo se buscan solos los datos a rellenar (nombre, DNI, matrícula…); luego puedes retocarlos en «Colocar campos».</p>
      ${M.cfg.docs.map(x=>{const n=Object.keys(x.campos||{}).length+Object.keys(x.form||{}).length;return`<div class="card" style="padding:10px"><div class="row" style="align-items:center">
        <label style="flex:1 1 220px">Nombre<input data-m-nombre="${esc(x.id)}" value="${esc(x.nombre)}"></label>
        <span class="muted" style="flex:1 1 160px">${esc(x.archivo.nombre)}<br>${n?`${n} campos colocados`:`<b style="color:var(--warn)">Sin campos colocados</b>`}${Object.keys(x.form||{}).length?" (formulario del PDF)":""}</span></div>
        <div class="row"><button type="button" class="btn sm" data-m-ver="${esc(x.id)}">Ver</button>
          <label class="btn sm" style="display:inline-flex">Cambiar modelo<input type="file" data-m-cambiar="${esc(x.id)}" accept="application/pdf,image/jpeg,image/png" hidden></label>
          <button type="button" class="btn sm" data-m-auto="${esc(x.id)}" title="Volver a buscar los campos automáticamente">Detectar campos</button>
          <button type="button" class="btn sm primary" data-m-campos="${esc(x.id)}">Colocar campos…</button>
          <button type="button" class="btn sm" data-m-probar="${esc(x.id)}" ${coches.length?"":"disabled"}>Probar</button>
          <span style="flex:1"></span><button type="button" class="btn sm peligro" data-m-quitar="${esc(x.id)}">Quitar</button></div></div>`}).join("")||`<div class="vacio">Aún no hay ningún modelo.</div>`}
      <div class="row" style="align-items:center"><label class="btn primary" style="display:inline-flex">+ Añadir modelo<input type="file" data-m-add multiple accept="application/pdf,image/jpeg,image/png" hidden></label>
        ${M.cfg.docs.length?`<label style="flex:1 1 240px;margin:0">Probar con la venta<select data-m-coche>${coches.map(x=>`<option value="${esc(x.matricula)}">${esc(x.matricula.startsWith("lote:")?"Sin matrícula":x.matricula)} · ${esc(x.titulo||"")}</option>`).join("")||`<option value="">No hay ventas todavía</option>`}</select></label>`:""}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" value="no">Cerrar</button></div>`};
  const subir=async(fi,existente)=>{
    if(fi.size>15e6){toast(fi.name+": máximo 15 MB");return}
    toast("Subiendo "+fi.name+"…",20000);const u=await HUELSAN.subir("documentos",fi);
    const archivo={ruta:u.id,nombre:fi.name,tipo:fi.type,size:fi.size,subido:new Date().toISOString()};
    let doc=existente;
    if(doc){const ant=doc.archivo;doc.archivo=archivo;if(ant)await HUELSAN.borrarArchivo("documentos",ant.ruta).catch(()=>{})}
    else{doc={id:nid(),nombre:nombreDeArchivo(fi.name),archivo,campos:{},form:{}};M.cfg.docs.push(doc)}
    await guardarCfg();
    if(!existente||!Object.keys(doc.campos||{}).length&&!Object.keys(doc.form||{}).length){
      try{toast("Buscando los campos…",20000);const r=await sugerir(doc);doc.campos=r.campos;doc.form=r.form;await guardarCfg();
        toast(r.n?`${doc.nombre}: ${r.n} campos detectados. Revísalos en «Colocar campos».`:`${doc.nombre}: no he podido detectar campos (¿es una imagen?). Colócalos a mano.`,6000)}catch(e){toast("Modelo guardado; no se han podido detectar los campos: "+e.message,6000)}}
    else toast("Modelo cambiado: revisa la posición de los campos",5000)};
  f.onchange=async e=>{const t=e.target;
    if(t.dataset.mNombre){const x=docModelo(t.dataset.mNombre);if(x){x.nombre=t.value.trim()||x.nombre;await guardarCfg()}return}
    try{
      if(t.dataset.mAdd!=null){const fs=[...t.files];t.value="";for(const fi of fs)await subir(fi,null);pintarC();return}
      if(t.dataset.mCambiar){const fi=t.files[0],x=docModelo(t.dataset.mCambiar);t.value="";if(fi&&x)await subir(fi,x);pintarC();return}
    }catch(err){toast("No se ha podido guardar: "+err.message,6000);pintarC()}};
  f.onclick=async e=>{const t=e.target;
    const g=a=>{const el=t.closest(`[data-m-${a}]`);return el?el.dataset["m"+a[0].toUpperCase()+a.slice(1)]:null};
    try{
      let id;
      if((id=g("ver"))){e.preventDefault();const x=docModelo(id);verArchivo(x.archivo.ruta,x.archivo.nombre);return}
      if((id=g("campos"))){e.preventDefault();await editor(id,pintarC);return}
      if((id=g("auto"))){e.preventDefault();const x=docModelo(id);toast("Buscando los campos…",20000);const r=await sugerir(x);
        if(Object.keys(x.campos||{}).length&&!confirm(`Hay ${Object.keys(x.campos).length} campos colocados. ¿Sustituirlos por los detectados (${r.n})?`))return;
        x.campos=r.campos;x.form=r.form;await guardarCfg();toast(r.n?`${r.n} campos detectados`:"No he detectado ningún campo",4000);pintarC();return}
      if((id=g("probar"))){e.preventDefault();const k=f.querySelector("[data-m-coche]").value;if(k)await abrirMandato(k,id);return}
      if((id=g("quitar"))){e.preventDefault();const x=docModelo(id);if(!confirm(`¿Quitar el modelo «${x.nombre}»? Se borra el archivo y sus campos.`))return;
        await HUELSAN.borrarArchivo("documentos",x.archivo.ruta).catch(()=>{});M.cfg.docs=M.cfg.docs.filter(y=>y.id!==id);await guardarCfg();pintarC();return}
    }catch(err){toast(err.message||String(err),7000)}};
  pintarC();d.returnValue="";d.showModal();d.onclose=()=>{f.onclick=null;f.onchange=null};
}

/* editor: se pincha sobre el documento dónde va cada campo */
async function editor(docId,volver){
  await cargarPDFLib();const doc=docModelo(docId);const m=await bytesModelo(doc);const f=$("#f-confirm");
  let pdf=null,n=1,pdim=A4,img=null;
  if(m.pdf){const lib=await pdfjs();pdf=await lib.getDocument({data:m.bytes.slice(),isEvalSupported:false}).promise;n=pdf.numPages}
  else{img=await createImageBitmap(new Blob([m.bytes],{type:m.bytes[0]===0x89?"image/png":"image/jpeg"}))}
  const campos=JSON.parse(JSON.stringify(doc.campos||{}));
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
  const pintarE=()=>{const nCol=Object.keys(campos).length,delForm=Object.keys(doc.form||{}).length;
    f.innerHTML=`<h2>Colocar campos · ${esc(doc.nombre)}</h2>
      ${delForm?`<div class="aviso">Este PDF es un formulario rellenable: ${delForm} campos se rellenan solos. Aquí puedes añadir los que falten pinchando en el documento.</div>`:""}
      <p class="muted" style="margin:0">1) Elige un campo de la lista. 2) Pincha en el documento, donde debe empezar a escribirse (el punto es el inicio del texto, en la línea de base). Salta solo al siguiente. Los que no uses, déjalos sin colocar. Los azules ya estaban detectados o colocados; el rosa es el que estás moviendo.</p>
      <div class="row" style="align-items:center">${n>1?`<button type="button" class="btn sm" data-e-pag="-1" ${pag===0?"disabled":""}>←</button><span>Página ${pag+1} de ${n}</span><button type="button" class="btn sm" data-e-pag="1" ${pag===n-1?"disabled":""}>→</button>`:""}
        <label style="max-width:120px">Tamaño letra<input type="number" min="6" max="18" step="0.5" value="${tam}" data-e-tam></label><span class="muted">${nCol} colocados</span></div>
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
    if(t.closest("[data-e-guardar]")){e.preventDefault();doc.campos=campos;await guardarCfg();toast("Campos guardados");volver();return}
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
  const regId="gestoria/"+(cx.l?cx.l.id:cx.x.matricula),reg0=(await S.db.doc(regId).get().then(s=>s.data&&s.data()).catch(()=>null))||{};
  let tipo=reg0.tipoComprador||G.tipoAuto(cx),repVende=reg0.repVende||(cx.c&&cx.c.rep)||"";
  const f=$("#f-confirm"),d=$("#dlg-confirm");
  const marcados={};const marca=k=>marcados[k]!==false;
  const estado=()=>{const c=G.contexto(k);c.repId=repVende;const perm=G.docsTipo(c,TIPO_PERMISO),fic=G.docsTipo(c,TIPO_FICHA);
    return{c,perm,fic,items:[
      ["factura","Factura de venta",c.f?`Factura ${c.f.codigo}`:"",!!c.f,c.f?"":"Aún no hay factura de venta emitida."],
      ["contrato","Contrato de compraventa",c.c?"El contrato guardado, listo para firmar":"Se crea con los datos de la venta",true,""],
      ["listado","Listado de documentos necesarios","Lo que debe aportar el comprador y lo que se le entrega",true,""],
      ...M.cfg.docs.map(x=>{const nc=Object.keys(x.campos||{}).length+Object.keys(x.form||{}).length;return["tpl:"+x.id,x.nombre,"Modelo rellenado con los datos de la venta",true,"",nc?"":"Sin campos colocados: saldrá en blanco."]}),
      ...(M.cfg.docs.length?[]:[["tpl:","Solicitudes y mandatos","",false,"Falta subir los modelos en blanco (DGT, gestoría…)."]]),
      ["permiso","Permiso de circulación (copia)",perm.length?`${perm.length} archivo${perm.length>1?"s":""}`:"",perm.length>0,perm.length?"":"Sube una copia del permiso."],
      ["ficha","Ficha técnica (copia)",fic.length?`${fic.length} archivo${fic.length>1?"s":""}`:"",fic.length>0,fic.length?"":"Sube una copia de la ficha técnica."]]}};
  const pintarV=()=>{const E=estado(),c=E.c;
    f.innerHTML=`<h2>Documentos de venta</h2>
      <div class="row" style="align-items:center"><span><b>${esc(c.x.titulo||"")}</b> ${c.mat?`<span class="mat">${esc(c.mat)}</span>`:""}</span>
        <label style="max-width:190px;flex:0 0 auto">Comprador<select data-v-tipo><option value="particular" ${tipo==="particular"?"selected":""}>Particular</option><option value="empresa" ${tipo==="empresa"?"selected":""}>Empresa</option></select></label>
        <label style="max-width:190px;flex:0 0 auto">Vende (firma y lugar)<select data-v-rep><option value="">— Sin elegir —</option>${Object.entries((G.contexto(k).reps)||{}).filter(([,r])=>r&&r.nombre).map(([id,r])=>`<option value="${esc(id)}" ${repVende===id?"selected":""}>${esc(r.nombre.split(" ")[0])}${LUGAR_REP[id]?" · "+LUGAR_REP[id]:""}</option>`).join("")}</select></label></div>
      <p class="muted" style="margin:0">Se unen en un solo PDF, en este orden, para imprimirlo de una vez.</p>
      ${E.items.map(([key,tit,desc,ok,aviso,aviso2])=>`<div class="row" style="align-items:center;margin:2px 0">
        <label class="row" style="flex-direction:row;flex:1 1 260px;gap:8px;color:var(--ink);font-weight:500;align-items:flex-start"><input type="checkbox" data-v-inc="${key}" ${marca(key)&&ok?"checked":""} ${ok?"":"disabled"} style="width:auto;margin-top:3px"><span>${esc(tit)}<div class="muted" style="font-weight:400;font-size:12.5px">${esc(desc)}${aviso?` <b style="color:var(--bad)">${esc(aviso)}</b>`:""}${aviso2?` <span style="color:var(--warn)">${esc(aviso2)}</span>`:""}</div></span></label>
        ${key==="permiso"||key==="ficha"?`<label class="btn sm primary" style="display:inline-flex">Subir<input type="file" data-v-sub="${key==="permiso"?TIPO_PERMISO:TIPO_FICHA}" multiple hidden accept="application/pdf,image/*"></label>`:""}
        ${key.startsWith("tpl:")?`<button type="button" class="btn sm" data-v-modelo>${M.cfg.docs.length?"Modelos y campos…":"Subir modelos…"}</button>`:""}
        ${key==="contrato"?`<button type="button" class="btn sm" data-v-contrato>Editar contrato</button>`:""}</div>`).join("")}
      <div class="row" style="justify-content:flex-end;margin-top:6px"><button type="button" class="btn" data-v-desc>Descargar PDF</button><button type="button" class="btn primary" data-v-imp>Abrir para imprimir</button></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" value="no">Cerrar</button></div>`};
  const partesDe=async(archivos,partes)=>{for(const a of archivos){const b=await HUELSAN.bajar("documentos",a.ruta);if(esPdf(a))partes.push({pdf:await bytesDe(b)});else partes.push({img:b})}};
  const generar=async()=>{
    await cargarPDFLib();const E=estado(),c=E.c,sel=[...f.querySelectorAll("[data-v-inc]")].filter(i=>i.checked).map(i=>i.dataset.vInc);
    if(!sel.length)throw new Error("Marca al menos un documento");
    const partes=[];let n=0;
    for(const key of E.items.map(i=>i[0])){if(!sel.includes(key))continue;toast(`Preparando ${++n}/${sel.length}…`,20000);
      if(key==="factura")partes.push({pdf:new Uint8Array(await (await pdfFactura(c.f)).output("arraybuffer"))});
      else if(key==="contrato")partes.push({pdf:new Uint8Array(await (await window.HuelsanContratos.generarContrato(contratoDe(c))).output("arraybuffer"))});
      else if(key==="listado")partes.push({pdf:new Uint8Array(listadoPDF(contratoDe(c),tipo,c).output("arraybuffer"))});
      else if(key.startsWith("tpl:")){const dm=docModelo(key.slice(4));if(dm)partes.push({pdf:await modeloBytes(dm,c,tipo)})}
      else await partesDe(key==="permiso"?E.perm:E.fic,partes)}
    return unir(partes)};
  f.onchange=async e=>{const t=e.target;
    if(t.dataset.vTipo!=null){tipo=t.value;pintarV();return}
    if(t.dataset.vRep!=null){repVende=t.value;reg0.repVende=repVende||null;await S.db.doc(regId).set({...reg0,loteId:cx.l?cx.l.id:"",matricula:cx.mat});pintarV();return}
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
