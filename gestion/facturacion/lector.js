/* Huelsan Automoción · Lector de facturas y tickets (gratis, en el navegador, sin enviar nada fuera).
   - PDF con texto: se lee con pdf.js (../pdf.min.mjs).
   - Foto o PDF escaneado: reconocimiento de texto (OCR) con Tesseract.js en español.
   Saca: proveedor y NIF, nº de factura, fecha, matrícula y las líneas con IVA (base + cuota por tipo),
   sin IVA (exentas, suplidos) y REBU. Todo se puede corregir a mano después. */
(function(){
"use strict";
const BASE=new URL("../",location.href).href;
const TESS="https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/";
const r2=n=>Math.round((+n||0)*100+Number.EPSILON*Math.sign(+n||0))/100;

async function pdfjs(){if(window.__pdfjs)return window.__pdfjs;const lib=await import(BASE+"pdf.min.mjs");
  if(!globalThis.pdfjsWorker)globalThis.pdfjsWorker=await import(BASE+"pdf.worker.min.mjs");lib.GlobalWorkerOptions.workerSrc=BASE+"pdf.worker.min.mjs";return window.__pdfjs=lib}
async function cargarTesseract(){if(window.Tesseract)return window.Tesseract;
  await new Promise((ok,ko)=>{const s=document.createElement("script");s.src=TESS+"tesseract.min.js";s.onload=ok;s.onerror=()=>ko(new Error("no se ha podido cargar el lector de fotos"));document.head.appendChild(s)});return window.Tesseract}
async function ocr(imagenes){
  const T=await cargarTesseract();
  const w=await T.createWorker("spa",1,{workerPath:TESS+"worker.min.js",corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",langPath:"https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa/4.0.0_best_int"});
  try{let t="";for(const im of imagenes){const{data}=await w.recognize(im);t+=data.text+"\n"}return t}finally{await w.terminate().catch(()=>{})}
}
async function textoPDF(file){
  const lib=await pdfjs();const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
  let texto="";
  for(let n=1;n<=Math.min(doc.numPages,4);n++){const page=await doc.getPage(n);const vp=page.getViewport({scale:1});const tc=await page.getTextContent();const rows=[];
    for(const it of tc.items){if(!it.str||!it.str.trim())continue;const x=it.transform[4],y=vp.height-it.transform[5];let r=rows.find(r=>Math.abs(r.y-y)<3);if(!r){r={y,items:[]};rows.push(r)}r.items.push({x,w:it.width,s:it.str})}
    rows.sort((a,b)=>a.y-b.y);
    texto+=rows.map(r=>{r.items.sort((a,b)=>a.x-b.x);let t="",end=null;for(const i of r.items){if(end!=null)t+=(i.x-end>12?"   ":(i.x-end>1?" ":""));t+=i.s;end=i.x+i.w}return t.trim()}).join("\n")+"\n"}
  if(texto.replace(/\s/g,"").length>40)return texto;
  // PDF escaneado: se pasa a imagen y se lee con OCR
  const imgs=[];for(let n=1;n<=Math.min(doc.numPages,2);n++){const page=await doc.getPage(n);const vp=page.getViewport({scale:2.2});const c=document.createElement("canvas");c.width=vp.width;c.height=vp.height;
    const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);await page.render({canvasContext:x,viewport:vp}).promise;imgs.push(c)}
  return ocr(imgs);
}
async function textoImagen(file){
  let src;try{src=await createImageBitmap(file,{imageOrientation:"from-image"})}catch(e){src=new Image();src.src=URL.createObjectURL(file);await src.decode()}
  const k=Math.min(2,2400/Math.max(src.width,src.height));const c=document.createElement("canvas");c.width=Math.round(src.width*k);c.height=Math.round(src.height*k);
  const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.filter="grayscale(1) contrast(1.3)";x.drawImage(src,0,0,c.width,c.height);
  return ocr([c]);
}

/* ---------- interpretación ---------- */
const AMT=/(?<![\d.,])-?\d{1,3}(?:\.\d{3})+,\d{2}(?!\d)|(?<![\d.,])-?\d+,\d{2}(?!\d)|(?<![\d.,])-?\d{1,3}(?:,\d{3})+\.\d{2}(?!\d)|(?<![\d.,%])-?\d+\.\d{2}(?![\d%])/g;
function num(s){s=String(s).replace(/\s/g,"");if(s.includes(",")&&s.includes("."))s=s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,"");else if(s.includes(","))s=s.replace(",",".");return +s}
const importes=l=>(l.match(AMT)||[]).map(num).filter(n=>isFinite(n));
const limpiarNif=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"").replace(/^ES(?=[A-Z0-9]{9}$)/,"");
function nifs(t){const out=[];const re=/\b(?:ES[-\s]?)?([ABCDEFGHJNPQRSUVW])[-.\s]?(\d{2})[-.\s]?(\d{3})[-.\s]?(\d{2})[-.\s]?([0-9A-J])\b|\b([XYZ])[-\s]?(\d{7})[-\s]?([A-Z])\b|\b(\d{8})[-\s]?([A-Z])\b/g;let m;
  while((m=re.exec(t))){const v=m[1]?m[1]+m[2]+m[3]+m[4]+m[5]:m[6]?m[6]+m[7]+m[8]:m[9]+m[10];if(!out.includes(v))out.push(v)}return out}
const MESES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
function iso(d,m,a){a=+a;if(a<100)a+=2000;d=+d;m=+m;if(!(d>=1&&d<=31&&m>=1&&m<=12&&a>=2000&&a<=2100))return"";return`${a}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`}
function fechaDe(t){
  let m=t.match(/fecha[^\n\d]{0,40}?(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i);if(m&&iso(m[1],m[2],m[3]))return iso(m[1],m[2],m[3]);
  m=t.match(/fecha[^\n]{0,30}?\b([a-záé]+)\s+(\d{1,2}),?\s+(\d{4})/i);if(m&&MESES[m[1].toLowerCase()])return iso(m[2],MESES[m[1].toLowerCase()],m[3]);
  m=t.match(/(\d{1,2})\s+de\s+([a-záé]+)\s+(?:de\s+)?(\d{4})/i);if(m&&MESES[m[2].toLowerCase()])return iso(m[1],MESES[m[2].toLowerCase()],m[3]);
  m=t.match(/\b([a-záé]+)\s+(\d{1,2}),\s+(\d{4})/i);if(m&&MESES[m[1].toLowerCase()])return iso(m[2],MESES[m[1].toLowerCase()],m[3]);
  const re=/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/g;while((m=re.exec(t))){const f=iso(m[1],m[2],m[3]);if(f)return f}
  m=t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);if(m)return iso(m[3],m[2],m[1]);return"";
}
function numeroDe(t,nombreArchivo){
  const malas=/^(FECHA|DE|DEL|N[ºO°]?|NUMERO|NÚMERO|CLIENTE|PAGINA|PÁGINA|DATE|NO|NUMBER|SIMPLIFICADA|RECTIFICATIVA)$/i;
  const re=/(?:n[º°o]\.?\s*(?:de\s*)?factura|factura\s*(?:simplificada\s*|de\s+venta\s*|venta\s*|de\s+compra\s*|compra\s*)?(?:n[º°o]\.?|n[uú]m(?:ero)?\.?|n\.)?|invoice\s*(?:no\.?|number|n[º°])?|fra\.?\s*(?:n[º°o]\.?)?|ticket\s*(?:n[º°o]\.?)?|n[º°]\s*documento)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{2,24})/gi;let m;
  while((m=re.exec(t))){const v=m[1].replace(/[.\-\/]+$/,"");if(/\d/.test(v)&&!malas.test(v)&&!/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(v))return v}
  m=String(nombreArchivo||"").match(/(?:invoice|factura|fra)[\s_\-]*(?:n[º°o]?[\s_\-]*)?([A-Z]{0,4}[\-_]?\d{4,})/i);return m?m[1].replace(/_/g,"-"):"";
}
function matriculaDe(t){const m=t.match(/\b(\d{4})\s?-?\s?([BCDFGHJKLMNPRSTVWXYZ]{3})\b/);return m?m[1]+m[2]:""}
function nombreProveedor(lineas,nif,nifPropio){
  const soc=/\b(S\.?\s?L\.?\s?U?\.?|S\.?\s?A\.?\s?U?\.?|SOCIEDAD LIMITADA|SOCIEDAD AN[OÓ]NIMA|S\.?\s?COOP\.?|C\.?\s?B\.?)\s*$/i;
  const idx=nif?lineas.findIndex(l=>limpiarNif(l).includes(nif)):-1;
  const cerca=idx>=0?[idx,idx-1,idx-2,idx+1]:[];
  for(const i of cerca){const l=(lineas[i]||"").replace(/(C\.?I\.?F\.?|N\.?I\.?F\.?)[:\s]*[A-Z0-9\-.\s]{8,14}/i,"").trim();if(l&&soc.test(l.split(/\s{3,}/)[0])&&!/huelsan/i.test(l))return l.split(/\s{3,}/)[0].trim()}
  for(const l of lineas.slice(0,20)){const p=l.split(/\s{3,}/)[0].trim();if(soc.test(p)&&!/huelsan/i.test(p)&&p.length<70)return p}
  return"";
}
/* Tabla de conceptos con columna de IVA (p. ej. BCA): «5976KFZ  Comisión del comprador  353.00  IVA21  427.13» o «… REBU 21  450.12» o «… NO SUJETO  55.70» */
const AMT1="-?\\d{1,3}(?:[.,]\\d{3})*[.,]\\d{2}|-?\\d+[.,]\\d{2}";
const RE_FILA=new RegExp("^\\s*(?:(\\d{4}\\s?[A-Z]{3})\\s+)?(.*?[A-Za-zÁÉÍÓÚáéíóúñÑ].*?)\\s+(?:("+AMT1+")\\s+)?(IVA\\s?\\d{1,2}(?:[.,]\\d+)?\\s?%?|REBU(?:\\s?\\d{1,2})?|NO\\s+SUJET[OA]|EXENT[OA]|SUPLIDO)\\s+("+AMT1+")\\s*$","i");
function lineasTabla(lineas){
  const out=[];
  for(const l of lineas){const m=l.replace(/\s+/g," ").match(RE_FILA);if(!m)continue;
    const concepto=m[2].trim();if(/^(iva|total|base|identific|importe|%)/i.test(concepto)||/^[\d\s.,%]+$/.test(concepto))continue;
    const cod=m[4].toUpperCase().replace(/\s+/g," "),imp=num(m[5]),pre=m[3]?num(m[3]):null;if(!(imp>0))continue;
    const esVeh=/\bcar\b|veh[íi]culo|turismo|qualified|margin/i.test(concepto);
    if(/^IVA/.test(cod)){const t=+(cod.match(/\d+(?:[.,]\d+)?/)||[21])[0].replace(",",".");const base=pre&&pre<imp?pre:r2(imp/(1+t/100));
      out.push({concepto,regimen:"General",base:r2(base),ivaTipo:t,cuota:r2(imp-base),total:r2(imp),vehiculo:esVeh})}
    else if(/^REBU/.test(cod))out.push({concepto,regimen:"REBU",base:r2(imp),ivaTipo:0,cuota:0,total:r2(imp),vehiculo:esVeh})
    else out.push({concepto,regimen:"Exento",base:r2(imp),ivaTipo:0,cuota:0,total:r2(imp),vehiculo:false})}
  return out;
}
function interpretar(texto,op={}){
  const lineas=texto.split(/\n/).map(l=>l.replace(/\s+$/,"")).filter(l=>l.trim());
  const t=lineas.join("\n");
  const propio=limpiarNif(op.nifPropio);
  const numF=limpiarNif(numeroDe(t,op.nombreArchivo));
  const conEtiqueta=[];{const re=/(?:C\.?\s?I\.?\s?F|N\.?\s?I\.?\s?F)[^A-Z0-9\n]{0,10}([A-Z0-9][A-Z0-9\-.\s]{7,12})/gi;let m;while((m=re.exec(t))){const v=nifs(m[1])[0];if(v&&!conEtiqueta.includes(v))conEtiqueta.push(v)}}
  const todos=[...conEtiqueta,...nifs(t)].filter((n,i,a)=>n!==propio&&n!==numF&&a.indexOf(n)===i);
  const provs=op.proveedores||[];
  let prov=provs.find(p=>p.nif&&todos.includes(limpiarNif(p.nif)));
  if(!prov)prov=provs.find(p=>p.nombre&&p.nombre.length>3&&new RegExp(p.nombre.split(/\s+/).slice(0,2).join("\\s+").replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i").test(t))||null;
  const claves=provs.filter(p=>p.claves).find(p=>p.claves.split(",").map(s=>s.trim()).filter(Boolean).some(k=>t.toUpperCase().includes(k.toUpperCase())));
  if(!prov&&claves)prov=claves;
  const nif=prov&&prov.nif?limpiarNif(prov.nif):(todos[0]||"");
  const rebu=/bienes\s+usados|r[eé]gimen\s+especial|\bREBU\b|art(?:[íi]culo|\.)\s*13[5-9]/i.test(t);
  const vehiculo=/bastidor|\bVIN\b|chasis|n[º°]\s*de\s*serie|adjudicaci[oó]n|subasta|veh[íi]culo\s+usado|compra\s+de\s+veh/i.test(t);
  // pares base/cuota por tipo de IVA: la cuota tiene que salir en una línea que hable de IVA, cuota o %
  const amtsTodos=[...new Set(lineas.flatMap(importes))].filter(n=>n>0);
  const cuotasPosibles=new Set(lineas.filter(l=>/iva|i\.v\.a|cuota|impuesto|%/i.test(l)).flatMap(importes).filter(n=>n>0));
  const grupos=[];const usados=new Set();
  for(const tipo of [21,10,4]){
    let mejor=null;
    for(const c of cuotasPosibles){if(usados.has(c))continue;for(const b of amtsTodos){if(b<=c||usados.has(b))continue;if(Math.abs(r2(b*tipo/100)-c)<=0.02&&(!mejor||b>mejor.base))mejor={base:b,cuota:c,tipo}}}
    if(mejor&&(new RegExp("\\b"+tipo+"([.,]0+)?\\s*%").test(t)||tipo===21)){grupos.push(mejor);usados.add(mejor.base);usados.add(mejor.cuota)}
  }
  // total: el mayor importe de las líneas que dicen «total» (si no, el mayor del documento)
  const lt=lineas.filter(l=>/total|importe\s+a\s+pagar|a\s+pagar|l[íi]quido/i.test(l)&&!/subtotal|total\s+base|base\s+total|total\s+iva|total\s+cuota/i.test(l));
  let total=Math.max(0,...lt.flatMap(importes));
  const maxDoc=Math.max(0,...amtsTodos);
  if(!total||total<grupos.reduce((s,g)=>s+g.base+g.cuota,0)-0.05)total=maxDoc;
  const tabla=lineasTabla(lineas),sumTabla=r2(tabla.reduce((s,l)=>s+l.total,0));
  if(tabla.length&&(!total||Math.abs(sumTabla-total)<=0.05||Math.abs(sumTabla-maxDoc)<=0.05)){
    return{proveedorId:prov?prov.id:"",proveedor:prov?prov.nombre:nombreProveedor(lineas,nif,propio),nif,numFactura:numeroDe(t,op.nombreArchivo),fecha:fechaDe(t),matricula:matriculaDe(t),
      lineas:tabla,total:sumTabla,rebu,compraVehiculo:vehiculo||tabla.some(l=>l.vehiculo),texto:t,desglosado:true}}
  const lineasOut=[];
  const sumGen=r2(grupos.reduce((s,g)=>s+g.base+g.cuota,0));
  for(const g of grupos.sort((a,b)=>b.base-a.base))lineasOut.push({concepto:`Conceptos con IVA ${g.tipo} %`,regimen:"General",base:r2(g.base),ivaTipo:g.tipo,cuota:r2(g.cuota),total:r2(g.base+g.cuota)});
  const resto=r2(total-sumGen);
  if(resto>0.05){const reg=rebu?"REBU":"Exento";lineasOut.push({concepto:rebu?"Vehículo (REBU)":"Conceptos sin IVA (exentos o suplidos)",regimen:reg,base:resto,ivaTipo:0,cuota:0,total:resto,vehiculo:rebu})}
  if(!lineasOut.length&&total){const exento=/exent|no\s+sujet|sin\s+iva|suplido/i.test(t);
    lineasOut.push(rebu?{concepto:"Vehículo (REBU)",regimen:"REBU",base:total,ivaTipo:0,cuota:0,total,vehiculo:true}:exento?{concepto:"Conceptos sin IVA",regimen:"Exento",base:total,ivaTipo:0,cuota:0,total}:{concepto:"Conceptos con IVA 21 % (revisar)",regimen:"General",base:r2(total/1.21),ivaTipo:21,cuota:r2(total-r2(total/1.21)),total})}
  if(vehiculo&&!lineasOut.some(l=>l.vehiculo)&&lineasOut.length){const mx=lineasOut.reduce((a,l)=>l.total>a.total?l:a,lineasOut[0]);mx.vehiculo=true;if(/^Conceptos con IVA/.test(mx.concepto))mx.concepto="Vehículo (con IVA "+mx.ivaTipo+" %)"}
  return{proveedorId:prov?prov.id:"",proveedor:prov?prov.nombre:nombreProveedor(lineas,nif,propio),nif,numFactura:numeroDe(t,op.nombreArchivo),fecha:fechaDe(t),matricula:matriculaDe(t),
    lineas:lineasOut,total:r2(total),rebu,compraVehiculo:vehiculo&&(rebu||total>1500),texto:t};
}
async function leer(file,op={}){
  const esPdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name);
  const texto=esPdf?await textoPDF(file):await textoImagen(file);
  return interpretar(texto,{...op,nombreArchivo:file.name});
}
window.HuelsanLector={leer,interpretar,textoPDF};
})();
