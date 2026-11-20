/* Huelsan Automoción · Conciliación bancaria (pestaña «Banco» de Facturación).
   Se sube el extracto del banco (Excel .xls/.xlsx, CSV o Norma 43 .n43) y se enlaza cada movimiento con su gasto o su factura.
   Avisa de pagos sin factura, cobros sin factura y facturas sin movimiento en el banco.
   Datos: ajustes «banco/<id>» (un documento por movimiento; el id evita duplicados al subir el mismo extracto dos veces). */
(function(){
"use strict";
const B={movs:new Map(),vista:"pagos",q:""};
const MOTIVOS=["Traspaso entre cuentas","Impuestos o Seguridad Social","Nómina","Préstamo o financiación","Aportación de socios","Comisión o cuota del banco","Pago en efectivo ya apuntado","Otro"];
(async function esperar(){if(!S.db){setTimeout(esperar,150);return}
  S.db.collection("banco").onSnapshot(sn=>{B.movs.clear();sn.docs.forEach(d=>B.movs.set(d.id,{...d.data(),id:d.id}));if(S.tab==="banco")pintar();else if(S.tab==="facturas"&&!S.ed&&window.HuelsanRepintar)window.HuelsanRepintar()},e=>console.error(e));
})();
const _pintar=pintar;
pintar=function(){if(S.tab!=="banco")return _pintar();$("#vista").innerHTML=vistaBanco()};

/* ---------- lectura de extractos ---------- */
async function cargarXLSX(){if(window.XLSX)return;await new Promise((ok,ko)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=ok;s.onerror=()=>ko(new Error("No se ha podido cargar el lector de Excel"));document.head.appendChild(s)})}
const hash=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h.toString(36)};
function fechaISO(v){
  if(v instanceof Date&&!isNaN(v))return new Date(v.getTime()-v.getTimezoneOffset()*6e4).toISOString().slice(0,10);
  if(typeof v==="number"&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*864e5));return d.toISOString().slice(0,10)}
  const s=String(v||"").trim();let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);if(m){let a=+m[3];if(a<100)a+=2000;return`${a}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`}
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:"";
}
function importe(v){if(typeof v==="number")return r2(v);let s=String(v||"").trim().replace(/[\s€]/g,"");if(!s)return NaN;
  if(s.includes(",")&&s.includes("."))s=s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,"");else if(s.includes(","))s=s.replace(",",".");return r2(+s)}
function leerN43(texto){
  const out=[];let cuenta="",ult=null;
  for(const raw of texto.split(/\r?\n/)){const l=raw.padEnd(80," ");const t=l.slice(0,2);
    if(t==="11")cuenta=l.slice(2,6)+"-"+l.slice(6,10)+"-"+l.slice(10,20);
    else if(t==="22"){const f=l.slice(10,16),signo=l[27]==="1"?-1:1,imp=signo*(+l.slice(28,42)/100);
      ult={fecha:`20${f.slice(0,2)}-${f.slice(2,4)}-${f.slice(4,6)}`,importe:r2(imp),concepto:[l.slice(52,64).trim(),l.slice(64,80).trim()].filter(x=>x&&!/^0+$/.test(x)).join(" "),saldo:null,cuenta};out.push(ult)}
    else if(t==="23"&&ult){ult.concepto=[ult.concepto,l.slice(4,42).trim(),l.slice(42,80).trim()].filter(Boolean).join(" ").replace(/\s+/g," ").trim()}}
  return out;
}
async function textoArchivo(file){const buf=new Uint8Array(await file.arrayBuffer());let t=new TextDecoder("utf-8").decode(buf);if(t.includes("\uFFFD"))t=new TextDecoder("windows-1252").decode(buf);return t.replace(/^\uFEFF/,"")}
function leerCSV(t){const lin=t.split(/\r?\n/);const muestra=lin.slice(0,30).join("\n");
  const sep=[";","\t",","].map(c=>[c,(muestra.match(new RegExp(c==="\t"?"\t":c,"g"))||[]).length]).sort((a,b)=>b[1]-a[1])[0][0];
  return lin.map(l=>{const out=[];let cur="",q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(q){if(ch==='"'){if(l[i+1]==='"'){cur+='"';i++}else q=false}else cur+=ch}else if(ch==='"')q=true;else if(ch===sep){out.push(cur);cur=""}else cur+=ch}out.push(cur);return out.map(x=>x.trim())})}
function leerTabla(filas){
  const norm=v=>String(v??"").trim().toLowerCase();
  let h=-1;for(let i=0;i<Math.min(filas.length,40);i++){const r=filas[i].map(norm);if(r.some(c=>/^f(echa|\.)/.test(c)||c==="fecha")&&r.some(c=>/importe|cantidad|cargo|abono|debe|haber/.test(c))){h=i;break}}
  if(h<0)throw new Error("No encuentro la fila de títulos (Fecha, Concepto, Importe…) en el archivo");
  const cab=filas[h].map(norm);
  const idx=re=>cab.findIndex(c=>re.test(c));
  let cF=idx(/f\.?\s*(operativa|contable|operaci)|fecha\s*(operaci|contable)/);if(cF<0)cF=idx(/^fecha$|^f\.?\s*fecha/);if(cF<0)cF=idx(/fecha|^f\./);
  const cI=idx(/importe|cantidad/),cCargo=idx(/cargo|debe/),cAbono=idx(/abono|haber/),cS=idx(/saldo/);
  const cC=cab.map((c,i)=>/concepto|descrip|beneficiario|observa|referencia|detalle|movimiento|ordenante|remitente/.test(c)?i:-1).filter(i=>i>=0);
  let cuenta="";for(const r of filas.slice(0,h)){const k=r.findIndex(c=>/cuenta|iban/i.test(String(c||"")));if(k>=0){cuenta=String(r.slice(k+1).find(x=>x!=null&&String(x).trim())||"").trim();break}}
  const out=[];
  for(const r of filas.slice(h+1)){const f=fechaISO(r[cF]);if(!f)continue;
    let imp=cI>=0?importe(r[cI]):NaN;if(isNaN(imp)&&(cCargo>=0||cAbono>=0)){const c=importe(r[cCargo]),a=importe(r[cAbono]);imp=r2((isNaN(a)?0:a)-(isNaN(c)?0:Math.abs(c)))}
    if(isNaN(imp)||!imp)continue;
    out.push({fecha:f,importe:imp,concepto:[...new Set(cC.map(i=>String(r[i]??"").trim()).filter(x=>x&&x!=="nan"))].join(" · "),saldo:cS>=0?importe(r[cS]):null,cuenta})}
  return out;
}
async function importar(file){
  let movs;
  if(/\.(n43|aeb|q43|txt)$/i.test(file.name)&&/^(11|22)/m.test(await textoArchivo(file))){movs=leerN43(await textoArchivo(file))}
  else if(/\.(csv|txt)$/i.test(file.name)){movs=leerTabla(leerCSV(await textoArchivo(file)))}
  else{await cargarXLSX();const wb=XLSX.read(new Uint8Array(await file.arrayBuffer()),{type:"array",cellDates:true});
    movs=[];for(const n of wb.SheetNames){try{movs=leerTabla(XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null}));if(movs.length)break}catch(e){if(n===wb.SheetNames[wb.SheetNames.length-1])throw e}}}
  if(!movs.length)throw new Error("No he encontrado movimientos en el archivo");
  let nuevos=0,rep=0;const vistos=new Map();
  for(const m of movs){let k=[m.cuenta,m.fecha,m.importe,m.concepto,m.saldo].join("|");const n=(vistos.get(k)||0)+1;vistos.set(k,n);if(n>1)k+="|"+n; // movimientos iguales el mismo día
    const id="m"+hash(k);if(B.movs.has(id)){rep++;continue}
    toast(`Guardando movimientos… ${nuevos+1}/${movs.length}`,20000);
    await S.db.doc("banco/"+id).set({...m,origen:file.name,importado:new Date().toISOString()});nuevos++}
  toast(`${nuevos} movimientos nuevos${rep?` · ${rep} ya estaban`:""}`,5000);
  if(nuevos)await autoEnlazar(true);
}

/* ---------- enlaces ---------- */
/* Un movimiento puede enlazar con varios documentos (enlaces[] con el importe asignado a cada uno) y un documento con varios movimientos (varios pagos de una misma factura). */
const enls=m=>Array.isArray(m.enlaces)&&m.enlaces.length?m.enlaces:(m.enlace?[m.enlace]:[]);
const asig=(e,m)=>e.importe!=null?+e.importe:Math.abs(m.importe);
const enlazados=()=>{const g=new Map(),f=new Map();for(const m of B.movs.values())for(const e of enls(m)){if(e.tipo!=="gasto"&&e.tipo!=="factura")continue;const mp=e.tipo==="gasto"?g:f;if(!mp.has(e.id))mp.set(e.id,[]);mp.get(e.id).push({m,e})}return{g,f}};
const cubierto=(mp,id)=>r2((mp.get(id)||[]).reduce((s,x)=>s+asig(x.e,x.m),0)); // importe del documento ya cubierto por movimientos del banco
const dias=(a,b)=>Math.abs((new Date(a)-new Date(b))/864e5);
const palabras=s=>String(s||"").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"").split(/[^A-Z0-9]+/).filter(w=>w.length>=4&&!/^(ESPANA|SOCIEDAD|LIMITADA|ANONIMA|TRANSFERENCIA|COMPRA|RECIBO|PAGO|TARJ|TARJETA)$/.test(w));
function parecido(concepto,nombre,claves){const c=String(concepto||"").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  if(claves&&claves.split(",").map(s=>s.trim().toUpperCase()).filter(Boolean).some(k=>c.includes(k)))return 1;
  const ws=palabras(nombre);return ws.length?ws.filter(w=>c.includes(w)).length/ws.length:0}
function candidatos(m){
  const{g:gU,f:fU}=enlazados();const out=[];const ya=new Set(enls(m).map(e=>e.tipo+"|"+e.id));const imp=Math.abs(m.importe);
  const pon=(tipo,id,txt,total,pend,fechaDoc,nombre,claves,cobros,maxD)=>{
    if(pend<=0.02||ya.has(tipo+"|"+id))return;const d=dias(fechaDoc,m.fecha);if(d>maxD)return;
    const exacto=Math.abs(total-imp)<=0.02||Math.abs(pend-imp)<=0.02||(cobros||[]).some(c=>Math.abs((+c.importe||0)-imp)<=0.02);
    const p=parecido(m.concepto,nombre,claves);
    if(exacto)out.push({tipo,id,txt,score:100-d+p*50});
    else if(imp<pend&&p>=0.5)out.push({tipo,id,txt:txt+" · pago parcial (pendiente "+eur(pend)+")",score:60-d+p*20}); // nunca se enlaza sola
  };
  if(m.importe<0){
    for(const g of S.gastos.values()){if(g.sinFactura||+g.total<0)continue;const t=+g.total||0;
      pon("gasto",g.id,`${g.proveedor||"Gasto"} · ${g.numFactura?"Fra. "+g.numFactura+" · ":""}${fecha(g.fecha)} · ${eur(g.total)}`,t,r2(t-cubierto(gU,g.id)),g.fecha,g.proveedor,(S.proveedores.get(g.proveedorId)||{}).claves,null,60)}}
  else{
    for(const g of S.gastos.values()){if(g.sinFactura||!(+g.total<0))continue;const t=-(+g.total); // abono de un proveedor: llega como cobro
      pon("gasto",g.id,`Abono ${g.proveedor||""} · ${g.numFactura?g.numFactura+" · ":""}${fecha(g.fecha)} · ${eur(g.total)}`,t,r2(t-cubierto(gU,g.id)),g.fecha,g.proveedor,(S.proveedores.get(g.proveedorId)||{}).claves,null,90)}
    for(const f of emitidas()){if(f.anulada)continue;const t=(f.totales||{}).total||0;
      pon("factura",f.id,`Factura ${f.codigo} · ${(f.cliente||{}).nombre||""} · ${eur(t)}`,t,r2(t-cubierto(fU,f.id)),f.fechaExpedicion,(f.cliente||{}).nombre,null,f.cobros,90)}}
  return out.sort((a,b)=>b.score-a.score);
}
async function guardarEnlaces(id,lista){const m=B.movs.get(id);if(!m)return;const d={...m};delete d.id;delete d.enlace;delete d.enlaces;
  if(lista.length){const ahora=new Date().toISOString();lista=lista.map(e=>({...e,fecha:e.fecha||ahora}));d.enlace=lista[0];if(lista.length>1||lista.some(e=>e.importe!=null))d.enlaces=lista}
  await S.db.doc("banco/"+id).set(d);B.movs.set(id,{...d,id}); // actualiza ya la copia local (la enlazada automática no se pisa con la siguiente)
}
const enlazar=(id,enlace)=>guardarEnlaces(id,enlace?[enlace]:[]);
/* Añade otro documento a un movimiento ya enlazado (importe = parte del movimiento que corresponde a este documento) */
async function anadirEnlace(id,enlace,imp){const m=B.movs.get(id);if(!m)return;const tot=Math.abs(m.importe);
  let lista=enls(m).filter(e=>e.tipo==="gasto"||e.tipo==="factura").map(e=>({...e}));
  if(!(imp>0.001))throw new Error("Indica qué parte del movimiento corresponde a este documento");
  if(lista.length===1&&lista[0].importe==null){const resto=r2(tot-imp);if(resto<=0.001)throw new Error("Ese importe es todo el movimiento: desenlázalo primero o indica solo una parte");lista[0].importe=resto}
  else{const asignado=r2(lista.reduce((s,e)=>s+asig(e,m),0));if(imp>r2(tot-asignado)+0.02)throw new Error(`Solo quedan ${eur(r2(tot-asignado))} por asignar de este movimiento`)}
  lista.push({...enlace,importe:r2(imp)});await guardarEnlaces(id,lista);
}
async function quitarUno(id,idx){const m=B.movs.get(id);if(!m)return;const lista=enls(m).filter((_,i)=>i!==idx).map(e=>({...e}));if(lista.length===1)delete lista[0].importe;await guardarEnlaces(id,lista)}
async function autoEnlazar(silencio){let n=0;
  for(const m of [...B.movs.values()].filter(m=>!enls(m).length).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)))){
    const c=candidatos(m).filter(x=>x.score>=85);if(c.length===1||(c.length>1&&c[0].score-c[1].score>=30)){await enlazar(m.id,{tipo:c[0].tipo,id:c[0].id,auto:true});n++}}
  if(!silencio||n)toast(n?`${n} ${n===1?"movimiento enlazado":"movimientos enlazados"} automáticamente (revísalos en «Enlazados»)`:"No hay coincidencias seguras para enlazar solas",5000);
}

/* ---------- vista ---------- */
function vistaBanco(){
  const movs=[...B.movs.values()].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  const{g:gU,f:fU}=enlazados();
  const fechas=movs.map(m=>m.fecha).sort();const desde=fechas[0],hasta=fechas[fechas.length-1];
  const pagos=movs.filter(m=>m.importe<0&&!enls(m).length),cobros=movs.filter(m=>m.importe>0&&!enls(m).length),enl=movs.filter(m=>enls(m).length);
  const enRango=f=>desde&&f&&f>=desde&&f<=hasta;
  const gSin=[...S.gastos.values()].filter(g=>!g.sinFactura&&g.formaPago!=="Efectivo"&&g.pagado!==false&&enRango(g.fecha)&&cubierto(gU,g.id)<Math.abs(+g.total||0)-0.02).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  const cobroBanco=f=>r2((f.cobros||[]).filter(c=>c.medio!=="Efectivo").reduce((s,c)=>s+(+c.importe||0),0));
  const fSin=emitidas().filter(f=>!f.anulada&&cobroBanco(f)>0&&enRango(f.fechaExpedicion)&&cubierto(fU,f.id)<cobroBanco(f)-0.02);
  const pendTxt=(cub,tot)=>cub>0.02?`<div class="muted">cubierto ${eur(cub)} · pendiente ${eur(r2(tot-cub))}</div>`:"";
  const q=B.q.trim().toLowerCase();const filtra=ls=>q?ls.filter(m=>[m.concepto,m.importe,m.fecha].join(" ").toLowerCase().includes(q)):ls;
  const tab=(k,t,n)=>`<button class="btn sm ${B.vista===k?"primary":""}" data-bk-vista="${k}">${t}${n!=null?` (${n})`:""}</button>`;
  const txtEnlace=e=>e.tipo==="gasto"?(()=>{const g=S.gastos.get(e.id);return g?`<a href="#" data-gasto="${esc(g.id)}">${+g.total<0?"Abono":"Gasto"}: ${esc(g.proveedor||"")} ${g.numFactura?"· "+esc(g.numFactura):""} · ${eur(g.total)}</a>`:"Gasto borrado"})()
      :e.tipo==="factura"?(()=>{const f=S.facturas.get(e.id);return f?`<a href="#" data-ir-factura="${esc(f.id)}">Factura ${esc(f.codigo||"")} · ${esc((f.cliente||{}).nombre||"")}</a>`:"Factura borrada"})()
      :`No necesita factura: ${esc(e.motivo||"")}`;
  const filaMov=m=>{const lst=enls(m);const c=lst.length?[]:candidatos(m).slice(0,3);const multi=lst.length>1,ign=lst.some(e=>e.tipo==="ignorar");
    const sobra=r2(Math.abs(m.importe)-lst.reduce((s,e)=>s+asig(e,m),0));
    const enlTxt=lst.map((e,i)=>`<div>${txtEnlace(e)}${multi||e.importe!=null?` <span class="muted">(${eur(asig(e,m))} de este movimiento)</span>`:""}${e.auto?` <span class="tag">auto</span>`:""}${multi?` <button class="btn sm" data-bk-quitar1="${esc(m.id)}|${i}" title="Quitar solo este enlace">✕</button>`:""}</div>`).join("");
    return`<tr><td>${fecha(m.fecha)}</td><td>${esc(m.concepto||"—")}<div class="muted">${esc(m.origen||"")}</div></td><td class="num" style="color:${m.importe<0?"var(--bad)":"var(--ok)"}"><b>${eur(m.importe)}</b></td>
      <td>${lst.length?`${enlTxt}${!ign&&sobra>0.02?`<div class="muted">Sin asignar: ${eur(sobra)}</div>`:""}<span class="row"><button class="btn sm" data-bk-quitar="${esc(m.id)}">${multi?"Desenlazar todo":"Desenlazar"}</button>${ign?"":`<button class="btn sm" data-bk-mas="${esc(m.id)}" title="Este movimiento paga también otra factura o gasto">+ Otra factura</button>`}</span>`
      :`<div style="display:grid;gap:4px">${c.map(x=>`<button class="btn sm" data-bk-enlazar="${esc(m.id)}|${x.tipo}|${esc(x.id)}" style="justify-content:flex-start;white-space:normal;text-align:left">Enlazar: ${esc(x.txt)}</button>`).join("")}
        <span class="row">${m.importe<0?`<button class="btn sm primary" data-bk-gasto="${esc(m.id)}">Crear gasto con su factura</button>`:""}<button class="btn sm" data-bk-elegir="${esc(m.id)}">Elegir…</button><button class="btn sm" data-bk-ignorar="${esc(m.id)}">No necesita factura</button></span></div>`}</td></tr>`};
  const tabla=ls=>ls.length?`<div class="tw"><table><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Importe</th><th>Enlace</th></tr></thead><tbody>${ls.map(filaMov).join("")}</tbody></table></div>`:`<div class="vacio">Nada aquí.</div>`;
  let cuerpo="";
  if(B.vista==="pagos")cuerpo=`<p class="muted" style="margin:0">Pagos del banco sin factura enlazada. Enlázalos con su gasto, crea el gasto subiendo la factura, o márcalos si no necesitan factura (traspasos, impuestos, nóminas…).</p>`+tabla(filtra(pagos));
  else if(B.vista==="cobros")cuerpo=`<p class="muted" style="margin:0">Cobros del banco sin factura de venta enlazada.</p>`+tabla(filtra(cobros));
  else if(B.vista==="faltan")cuerpo=`<p class="muted" style="margin:0">Facturas pagadas o cobradas por banco entre el ${fecha(desde)} y el ${fecha(hasta)} que no tienen movimientos enlazados por todo su importe (una factura puede tener varios pagos; se avisa mientras quede parte sin enlazar). Puede que falte subir el extracto o que se pagaran de otra forma (cámbialo en el gasto).</p>
    <h3>Gastos sin movimiento (${gSin.length})</h3>${gSin.length?`<div class="tw"><table><tbody>${gSin.map(g=>`<tr data-gasto="${esc(g.id)}" style="cursor:pointer"><td>${fecha(g.fecha)}</td><td>${esc(g.proveedor||"")}<div class="muted">${esc(g.numFactura?"Fra. "+g.numFactura:"")} · ${esc(g.formaPago||"")}</div></td><td class="num">${eur(g.total)}${pendTxt(cubierto(gU,g.id),Math.abs(+g.total||0))}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Ninguno.</p>`}
    <h3>Facturas de venta sin movimiento (${fSin.length})</h3>${fSin.length?`<div class="tw"><table><tbody>${fSin.map(f=>`<tr data-ir-factura="${esc(f.id)}" style="cursor:pointer"><td>${esc(f.codigo)}</td><td>${fecha(f.fechaExpedicion)}</td><td>${esc((f.cliente||{}).nombre||"")}</td><td class="num">${eur((f.totales||{}).total)}${pendTxt(cubierto(fU,f.id),cobroBanco(f))}</td></tr>`).join("")}</tbody></table></div>`:`<p class="muted" style="margin:0">Ninguna.</p>`}`;
  else if(B.vista==="enlazados")cuerpo=tabla(filtra(enl));
  else cuerpo=tabla(filtra(movs));
  return`<div class="row sp"><div><h1>Conciliación bancaria</h1><p class="muted" style="margin:4px 0 0">Sube el extracto del banco (Excel, CSV o Norma 43). Se cogen la fecha, el importe y el concepto de cada movimiento y se enlazan con los gastos y las facturas para ver qué pago no tiene factura y qué factura no aparece en el banco. Subir el mismo extracto otra vez no duplica nada.</p></div>
    <span class="row"><label class="btn primary" style="display:inline-flex">Subir extracto<input type="file" id="bk-file" accept=".xls,.xlsx,.csv,.n43,.aeb,.q43,.txt" multiple hidden></label>${movs.length?`<button class="btn" data-bk="auto">Enlazar automáticamente</button>`:""}</span></div>
  ${movs.length?`<div class="kpis"><div class="kpi"><b>${movs.length}</b><span>movimientos (${fecha(desde)} – ${fecha(hasta)})</span></div><div class="kpi"><b>${enl.length}</b><span>enlazados</span></div><div class="kpi"><b style="color:${pagos.length?"var(--bad)":"inherit"}">${pagos.length}</b><span>pagos sin factura · ${eur(pagos.reduce((s,m)=>s+m.importe,0))}</span></div><div class="kpi"><b>${cobros.length}</b><span>cobros sin factura</span></div><div class="kpi"><b style="color:${gSin.length+fSin.length?"var(--warn)":"inherit"}">${gSin.length+fSin.length}</b><span>facturas sin movimiento</span></div></div>
  <div class="row">${tab("pagos","Pagos sin factura",pagos.length)}${tab("cobros","Cobros sin factura",cobros.length)}${tab("faltan","Facturas sin movimiento",gSin.length+fSin.length)}${tab("enlazados","Enlazados",enl.length)}${tab("todos","Todos",movs.length)}
    <label style="flex:1 1 200px;max-width:320px"><input type="search" data-bk-q value="${esc(B.q)}" placeholder="Buscar concepto o importe"></label><span style="flex:1"></span><button class="btn sm peligro" data-bk="vaciar">Borrar movimientos</button></div>
  ${cuerpo}`:`<div class="vacio">Aún no hay movimientos. Descarga el extracto del banco en Excel o Norma 43 y súbelo aquí.</div>`}`;
}

/* ---------- eventos ---------- */
document.addEventListener("change",async e=>{const t=e.target;if(t.id!=="bk-file")return;const fs=[...t.files];t.value="";
  for(const f of fs){try{await importar(f)}catch(err){toast(f.name+": "+(err.message||err),7000)}}});
document.addEventListener("input",e=>{const t=e.target;if(t.dataset.bkQ==null)return;B.q=t.value;const pos=t.selectionStart;pintar();const n=$("[data-bk-q]");if(n){n.focus();n.setSelectionRange(pos,pos)}});
document.addEventListener("click",async e=>{if(S.tab!=="banco")return;const t=e.target;
  const v=t.closest("[data-bk-vista]");if(v){B.vista=v.dataset.bkVista;pintar();return}
  try{
    const en=t.closest("[data-bk-enlazar]");if(en){const[id,tipo,ref]=en.dataset.bkEnlazar.split("|");await enlazar(id,{tipo,id:ref});toast("Enlazado");return}
    const q1=t.closest("[data-bk-quitar1]");if(q1){const[id,ix]=q1.dataset.bkQuitar1.split("|");await quitarUno(id,+ix);toast("Enlace quitado");return}
    const ms=t.closest("[data-bk-mas]");if(ms){await elegirManual(ms.dataset.bkMas,true);return}
    const qu=t.closest("[data-bk-quitar]");if(qu){await enlazar(qu.dataset.bkQuitar,null);toast("Desenlazado");return}
    const ig=t.closest("[data-bk-ignorar]");if(ig){const m=await pedirMotivo();if(m)await enlazar(ig.dataset.bkIgnorar,{tipo:"ignorar",motivo:m});return}
    const el=t.closest("[data-bk-elegir]");if(el){await elegirManual(el.dataset.bkElegir);return}
    const cg=t.closest("[data-bk-gasto]");if(cg){crearGasto(cg.dataset.bkGasto);return}
    const b=t.closest("[data-bk]");if(!b)return;
    if(b.dataset.bk==="auto")await autoEnlazar(false);
    else if(b.dataset.bk==="vaciar"){if(!confirm(`¿Borrar los ${B.movs.size} movimientos importados y sus enlaces? Los gastos y las facturas no se tocan.`))return;let i=0;for(const id of [...B.movs.keys()]){toast(`Borrando… ${++i}/${B.movs.size}`,20000);await S.db.doc("banco/"+id).delete()}toast("Movimientos borrados")}
  }catch(err){toast(err.message||String(err),6000)}
});
function pedirMotivo(){return new Promise(res=>{const d=$("#dlg-confirm"),f=$("#f-confirm");
  f.innerHTML=`<h2>¿Por qué no necesita factura?</h2><label>Motivo<select id="bk-motivo">${MOTIVOS.map(m=>`<option>${m}</option>`).join("")}</select></label><label>Nota (opcional)<input id="bk-nota"></label><div class="row" style="justify-content:flex-end"><button class="btn" value="no">Cancelar</button><button class="btn primary" value="si">Guardar</button></div>`;
  d.returnValue="";d.showModal();d.onclose=()=>{const m=$("#bk-motivo").value,n=$("#bk-nota").value.trim();res(d.returnValue==="si"?m+(n?" · "+n:""):null)}})}
async function elegirManual(id,mas){const m=B.movs.get(id);if(!m)return;const{g:gU,f:fU}=enlazados();const tot=Math.abs(m.importe);
  const ya=new Set(enls(m).map(e=>e.tipo+"|"+e.id));
  const pend=(mp,k,t)=>{const c=cubierto(mp,k);return c>0.02?` · pendiente ${eur(r2(t-c))}`:""};
  const ops=m.importe<0?[...S.gastos.values()].filter(g=>!g.sinFactura&&!(+g.total<0)&&!ya.has("gasto|"+g.id)).sort((a,b)=>dias(a.fecha,m.fecha)-dias(b.fecha,m.fecha)).slice(0,60).map(g=>({v:"gasto|"+g.id,t:`${fecha(g.fecha)} · ${g.proveedor||""} · ${g.numFactura||""} · ${eur(g.total)}${pend(gU,g.id,+g.total)}`}))
    :[...[...S.gastos.values()].filter(g=>!g.sinFactura&&+g.total<0&&!ya.has("gasto|"+g.id)).map(g=>({f:g.fecha,v:"gasto|"+g.id,t:`Abono · ${fecha(g.fecha)} · ${g.proveedor||""} · ${g.numFactura||""} · ${eur(g.total)}`})),
      ...emitidas().filter(f=>!f.anulada&&!ya.has("factura|"+f.id)).map(f=>({f:f.fechaExpedicion,v:"factura|"+f.id,t:`${f.codigo} · ${fecha(f.fechaExpedicion)} · ${(f.cliente||{}).nombre||""} · ${eur((f.totales||{}).total)}${pend(fU,f.id,(f.totales||{}).total||0)}`}))]
      .sort((a,b)=>dias(a.f,m.fecha)-dias(b.f,m.fecha)).slice(0,60);
  const lst=enls(m).filter(e=>e.tipo==="gasto"||e.tipo==="factura");
  const libre=lst.length===1&&lst[0].importe==null?"":r2(tot-lst.reduce((s,e)=>s+asig(e,m),0)); // si ya hay un solo enlace por todo el movimiento, hay que indicar la parte
  const r=await new Promise(res=>{const d=$("#dlg-confirm"),f=$("#f-confirm");
    f.innerHTML=`<h2>${mas?"Añadir otra factura o gasto al":"Enlazar"} movimiento de ${eur(m.importe)}</h2><p class="muted" style="margin:0">${esc(m.concepto||"")} · ${fecha(m.fecha)}</p><label>${m.importe<0?"Gasto":"Factura o abono"} (los más cercanos en fecha)<select id="bk-sel">${ops.map(o=>`<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("")}</select></label>
      <label>Parte del movimiento para este documento (€)<input id="bk-imp" inputmode="decimal" value="${mas?esc(libre):esc(tot)}"></label>
      <p class="muted" style="margin:0">Una factura puede tener varios pagos: enlaza cada movimiento con ella (indica la parte que corresponde si no es todo). Si un movimiento paga varias facturas juntas, enlaza la primera y añade las demás con «+ Otra factura».</p><div class="row" style="justify-content:flex-end"><button class="btn" value="no">Cancelar</button><button class="btn primary" value="si" ${ops.length?"":"disabled"}>${mas?"Añadir":"Enlazar"}</button></div>`;
    d.returnValue="";d.showModal();d.onclose=()=>res(d.returnValue==="si"?{sel:$("#bk-sel").value,imp:importe($("#bk-imp").value)}:null)});
  if(r){const[tipo,ref]=r.sel.split("|");const imp=isNaN(r.imp)?tot:r.imp;
    if(mas)await anadirEnlace(id,{tipo,id:ref},imp);
    else await guardarEnlaces(id,[imp<tot-0.02?{tipo,id:ref,importe:r2(imp)}:{tipo,id:ref}]);
    toast(mas?"Añadido":"Enlazado")}
}
function crearGasto(id){const m=B.movs.get(id);if(!m)return;
  const prov=[...S.proveedores.values()].find(p=>parecido(m.concepto,p.nombre,p.claves)>=0.5);
  const tarj=/tarj|tpv|visa|mastercard/i.test(m.concepto),dom=/recibo|adeudo|domicil/i.test(m.concepto);
  const imp=Math.abs(m.importe);
  window.__bkPendiente=id; // al guardar el gasto se enlaza con este movimiento
  abrirGasto(null,{fecha:m.fecha,proveedor:prov?prov.nombre:"",proveedorId:prov?prov.id:"",nifProveedor:prov?prov.nif||"":"",categoria:(prov&&prov.categoria)||"Otros",formaPago:tarj?"Tarjeta":dom?"Domiciliación":"Transferencia",concepto:m.concepto?String(m.concepto).slice(0,80):"",
    lineas:[{id:nid(),concepto:"",regimen:(prov&&prov.regimen)||"General",base:r2(imp/1.21),ivaTipo:21,cuota:r2(imp-r2(imp/1.21)),total:imp,vehiculo:false}]});
  const d=$("#dlg-gasto");const antes=new Set(S.gastos.keys());
  const vigila=setInterval(async()=>{if(d.open)return;clearInterval(vigila);if(window.__bkPendiente!==id)return;window.__bkPendiente=null;
    for(let i=0;i<20;i++){const nuevo=[...S.gastos.keys()].find(k=>!antes.has(k));if(nuevo){await enlazar(id,{tipo:"gasto",id:nuevo});toast("Gasto creado y enlazado con el movimiento");return}await new Promise(r=>setTimeout(r,500))}},400);
}
const cubiertoFactura=id=>cubierto(enlazados().f,id);
window.HuelsanBanco={leerN43,leerTabla,leerCSV,candidatos,cubiertoFactura};
})();
