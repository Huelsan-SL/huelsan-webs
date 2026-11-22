/* Huelsan Automoción · Contrato de reserva de vehículo (módulo de Facturación, 22/11/2026).
   Se abre desde la ficha del coche (botón «Contrato de reserva», solo coches marcados INTERESANTES) con ?reservaLote=<id>.
   Pregunta antes: precio de venta, vendedor (Francisco o Gustavo, con su DNI de Contratos → Representantes), lugar de venta y comprador
   (cliente guardado o nuevo: nombre completo y DNI como mínimo, dirección si la hay; si no existe se da de alta como cliente).
   Con peritaje (PDF de la ficha de BCA) añade los datos, la tabla de daños y TODAS las fotos del peritaje; con historial de mantenimiento (PDF)
   añade el historial. Sin peritaje/historial lo hace constar en el contrato y usa las fotos del anuncio (extensión de Huelsan).
   Condiciones: señal 10 %; devolución íntegra si hay avería o daños no declarados, si pasan 21 días, o si no se consigue el coche en la subasta
   (o traspaso a otro coche, a elección del comprador); sin devolución por desistimiento voluntario o financiación (traspasable a otro coche
   si la unidad se vende en 30 días). Datos en ajustes «reservas/<id>». No necesita SQL. */
(function(root){
"use strict";

/* ======================================================================
   Lectura del peritaje y del historial (puro: recibe filas de celdas de texto)
   ====================================================================== */
const NIVEL_RE=/^(DAÑO|DANO|SUSTITUCI|REP\.|REPARAR|RECORDATORIO|DESMONT|PINTURA)/i;
const NIVELES={"DAÑO LEVE":"Daño leve","DAÑO MEDIO":"Daño medio","DAÑO GRAVE":"Daño grave","SUSTITUCION":"Sustitución","SUSTITUCIÓN":"Sustitución","REP./INTERVEN.":"Reparar/intervenir","RECORDATORIO":"Recordatorio"};
const nivelBonito=s=>{const k=s.trim().toUpperCase();return NIVELES[k]||(s.charAt(0)+s.slice(1).toLowerCase())};
const celdas=r=>r.map(c=>String(c).trim()).filter(Boolean);
function parsePeritaje(rows){
  rows=rows.map(celdas).filter(r=>r.length);
  const txt=rows.map(r=>r.join(" ")).join("\n");
  const g=re=>{const m=txt.match(re);return m?m[1].trim():""};
  const km=g(/\bKM:\s*([\d.]+)/);
  const datos={perito:(rows[0]||[""])[0],matricula:g(/MATRICULA:\s*([A-Z0-9]+)/i),fecha:g(/FECHA TASACI[ÓO]N:\s*([\d/]+)/i),
    km:km?km.replace(/\B(?=(\d{3})+(?!\d))/g,".")+" km":"",bastidor:g(/BASTIDOR\s*:?\s*([A-Z0-9]{11,17})/i),modelo:g(/MODELO:\s*([^\n]+?)(?:\s+FECHA|\n|$)/i),color:g(/COLOR:\s*([^\n]+?)(?:\s+LUGAR|\n|$)/i)};
  const danos=[];let dentro=false;
  for(const r of rows){const t=r.join(" ");
    if(/\bNIVEL\b/i.test(t)&&/DESCRIPCI/i.test(t)){dentro=true;continue}
    if(/CONDICIONES DE VALORACI/i.test(t))break;
    if(!dentro||/MONTAJE|OBSERVACIONES/i.test(t))continue;
    const i=r.findIndex((c,k)=>k>0&&NIVEL_RE.test(c));if(i<0)continue;
    // el nivel puede venir partido en dos celdas («DAÑO» «LEVE»): se junta con la siguiente si no es una descripción
    let nivel=r[i],j=i+1;if(/^(DAÑO|DANO)$/i.test(nivel)&&r[j]&&/^(LEVE|MEDIO|GRAVE)$/i.test(r[j])){nivel+=" "+r[j];j++}
    danos.push([r.slice(0,i).join(" "),nivelBonito(nivel),r.slice(j).join(" ")])}
  return{datos,danos}}
const RUIDO=/^(Coste Gesti|Tasa de residuos|Pequeño Material|Importe Mano|Mano de obra)/i;
function parseHistorial(rows){
  rows=rows.map(celdas).filter(r=>r.length);
  const txt=rows.map(r=>r.join(" ")).join("\n");
  const g=re=>{const m=txt.match(re);return m?m[1].trim():""};
  const datos={bastidor:g(/Bastidor\s*:?\s*([A-Z0-9]{11,17})/i),matricula:g(/Matr[íi]cula\s*:?\s*([A-Z0-9]+)/i),modelo:(rows.find(r=>/^NISSAN|^[A-Z]{3,}\s/.test(r[0])&&!/Historial|Descripci/i.test(r[0]))||[""])[0]};
  const grupos=new Map();
  for(const r of rows){const i=r.findIndex(c=>/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c));if(i<1)continue;
    const desc=r.slice(0,i).join(" ").trim();if(!desc||RUIDO.test(desc))continue;
    const [m,d,a]=r[i].split("/");const fecha=`${d.padStart(2,"0")}/${m.padStart(2,"0")}/${a}`;
    const km=(r.slice(i+1).find(c=>/^\d{2,7}$/.test(c))||"");
    const k=fecha+"|"+km;if(!grupos.has(k))grupos.set(k,{fecha,iso:a+m.padStart(2,"0")+d.padStart(2,"0"),km,items:[]});
    const gr=grupos.get(k);if(!gr.items.some(x=>x.toLowerCase()===desc.toLowerCase()))gr.items.push(desc)}
  const entradas=[...grupos.values()].sort((a,b)=>b.iso.localeCompare(a.iso)).map(x=>[x.fecha,x.km?x.km.replace(/\B(?=(\d{3})+(?!\d))/g,"."):"",x.items.join("; ")]);
  return{datos,entradas}}

/* ======================================================================
   PDF del contrato (jsPDF). Una sola función: pdfReserva(R) → doc
   ====================================================================== */
const CH=[184,151,106],CHD=[140,110,68],INK=[27,29,32],GR=[94,99,106];
const eurS=x=>{const v=Math.round(x*100)/100;const [e,d]=Math.abs(v).toFixed(2).split(".");return e.replace(/\B(?=(\d{3})+(?!\d))/g,".")+","+d+" €"};

async function pdfReserva(R){
  const doc=new root.jspdf.jsPDF({unit:"mm",format:"a4",compress:true});
  const W=210,M=18,AW=W-2*M,TOP=24,LIM=278;
  const E=R.empresa,V=R.vehiculo,C=R.comprador||{},VEN=R.vendedor||{};
  const precio=+R.precio||0,senal=precio?Math.round(precio*10)/100:0;
  let y=TOP;
  const font=(b,s,col)=>{doc.setFont("helvetica",b?"bold":"normal");doc.setFontSize(s);doc.setTextColor(...(col||INK))};
  const nueva=()=>{doc.addPage();y=TOP};
  const sitio=h=>{if(y+h>LIM)nueva()};
  const blanco=n=>"_".repeat(n);
  /* texto con **negrita**, ajustado al ancho; devuelve nada y avanza y */
  function rico(txt,{x=M,w=AW,s=9.2,lead=4.3,col=INK,after=1.6}={}){
    const toks=String(txt).split(/(\*\*.+?\*\*)/).filter(Boolean);const palabras=[];
    for(const t of toks){const b=/^\*\*.+\*\*$/.test(t);const tx=b?t.slice(2,-2):t;for(const p of tx.split(/(\s+)/)){if(!p)continue;palabras.push({p,b})}}
    let linea=[],lw=0;const lineas=[];
    for(const q of palabras){doc.setFont("helvetica",q.b?"bold":"normal");doc.setFontSize(s);const ww=doc.getTextWidth(q.p);
      if(/^\s+$/.test(q.p)){if(linea.length){linea.push({...q,w:doc.getTextWidth(" ")});lw+=doc.getTextWidth(" ")}continue}
      if(lw+ww>w&&linea.length){lineas.push(linea);linea=[];lw=0}
      linea.push({...q,w:ww});lw+=ww}
    if(linea.length)lineas.push(linea);
    for(const l of lineas){sitio(lead);let cx=x;for(const q of l){doc.setFont("helvetica",q.b?"bold":"normal");doc.setFontSize(s);doc.setTextColor(...col);doc.text(q.p,cx,y+lead*.78);cx+=q.w}y+=lead}
    y+=after}
  const h2=t=>{sitio(10);y+=2;font(1,8.4,CHD);doc.text(t,M,y+3);y+=5.6};
  /* campo etiqueta + valor sobre línea */
  const campo=(x,yy,w,lab,val)=>{font(0,6.4,CHD);doc.text(lab,x,yy);doc.setDrawColor(190,190,190);doc.setLineWidth(.15);doc.line(x,yy+5,x+w-2,yy+5);
    val=String(val??"").trim();if(!val)return;let s=9.2;font(1,s);while(s>5.5&&doc.getTextWidth(val)>w-3){s-=.3;doc.setFontSize(s)}doc.text(val,x,yy+4.2)};
  const fila=cs=>{sitio(9.5);let x=M;const tot=cs.reduce((s,q)=>s+(q.w||1),0);for(const q of cs){const w=AW*(q.w||1)/tot;campo(x,y+3,w,q.l,q.v);x+=w}y+=9.5};
  const caja=(x,yy,on)=>{doc.setDrawColor(...INK);doc.setLineWidth(.25);doc.rect(x,yy-2.6,2.8,2.8);if(on){doc.setLineWidth(.4);doc.line(x+.4,yy-2.2,x+2.4,yy-.2);doc.line(x+2.4,yy-2.2,x+.4,yy-.2)}};
  const opciones=(lab,ops,sel)=>{sitio(6);let x=M;font(1,8.6);if(lab){doc.text(lab,x,y+3.4);x+=doc.getTextWidth(lab)+3}
    for(const [k,t] of ops){caja(x,y+3.4,sel===k);font(0,8.6);doc.text(t,x+4,y+3.4);x+=4+doc.getTextWidth(t)+6}y+=6.4};

  /* ---- título */
  font(1,17);doc.text("CONTRATO DE RESERVA DE VEHÍCULO",M,y+5);y+=8;
  font(0,8.4,GR);doc.text("Reserva con señal del 10 %: el vehículo queda retirado de la venta a favor del comprador",M,y+2.4);y+=7;
  const lugar=R.lugar||"",fechaTxt=R.fecha||"";
  rico(`En **${lugar||blanco(18)}**, a **${fechaTxt||blanco(5)+" de "+blanco(11)+" de 20"+blanco(2)}**.`,{after:2});

  h2("REUNIDOS");
  const repTxt=VEN.nombre?`representada por **${VEN.nombre}**, con DNI/NIE **${VEN.dni||blanco(14)}**`:`representada por D. ${blanco(24)}, con DNI/NIE ${blanco(14)}`;
  rico(`**DE UNA PARTE (EL VENDEDOR):** **${E.nombre}** (nombre comercial Huelsan Automoción), con CIF **${E.cif}** y domicilio en ${E.domicilio}, ${repTxt}, en adelante «HUELSAN SL».`.replace(/\*Huelsan Automoción\*/,"Huelsan Automoción"),{});
  rico("**DE OTRA PARTE (EL COMPRADOR):**",{after:1});
  fila([{l:"Nombre y apellidos / razón social",v:C.nombre,w:1.7},{l:"DNI / NIE / CIF",v:C.dni,w:1}]);
  fila([{l:"Domicilio (calle, nº, CP, localidad)",v:C.direccion,w:1.7},{l:"Teléfono / correo",v:[C.telefono,C.email].filter(Boolean).join(" · "),w:1}]);
  rico("Ambas partes se reconocen capacidad legal suficiente para obligarse y",{});
  h2("EXPONEN");
  rico("**I.** Que HUELSAN SL se dedica a la compraventa de vehículos de ocasión y es quien comercializa el vehículo descrito a continuación.",{after:1});
  rico("**II.** Que el COMPRADOR desea adquirir dicho vehículo y que HUELSAN SL accede a reservárselo mediante la entrega de una señal, con arreglo a las siguientes",{});
  h2("CLÁUSULAS");

  rico("**PRIMERA. Objeto y vehículo reservado.** HUELSAN SL reserva al COMPRADOR el siguiente vehículo y se compromete a no ofrecerlo ni venderlo a terceros mientras esta reserva esté vigente:");
  fila([{l:"Marca / modelo / versión",v:V.descripcion,w:2.2},{l:"Matrícula",v:V.matricula,w:1},{l:"Color",v:V.color,w:1}]);
  fila([{l:"Nº de bastidor (VIN)",v:V.bastidor,w:2.2},{l:"Kilómetros",v:V.km,w:1},{l:"Combustible / cambio",v:V.combustible,w:1}]);
  y+=1.5;
  rico("Los **kilómetros indicados son estimados**: pueden variar por la recogida del vehículo, su desplazamiento para servicio o los trabajos de preparación previos a la entrega. Esta variación **no superará en ningún caso los 1.000 km** respecto de los indicados.");
  rico("**SEGUNDA. Precio.** El precio total de venta del vehículo es el siguiente, con los impuestos que correspondan incluidos (IVA o régimen especial de bienes usados, según el vehículo). **El precio incluye los gastos de cambio de titularidad** del vehículo a nombre del COMPRADOR. Los demás extremos se detallarán en el contrato de compraventa.");
  sitio(15);{const w3=AW/3;doc.setDrawColor(...CH);doc.setLineWidth(.5);doc.rect(M,y,AW,14);doc.setFillColor(244,238,227);doc.rect(M+w3,y,w3,14,"F");doc.rect(M+w3,y,w3,14);
    const cab=[["Precio total de venta","impuestos incluidos"],["Señal (10 %)","se paga hoy"],["Resto a pagar","al formalizar la compraventa"]];
    const val=[precio?eurS(precio):blanco(12)+" €",precio?eurS(senal):blanco(12)+" €",precio?eurS(precio-senal):blanco(12)+" €"];
    cab.forEach((c,i)=>{const x=M+i*w3+3;font(0,8.6);doc.text(c[0],x,y+4);font(0,6.8,CHD);doc.text(c[1],x,y+7);font(1,12.5,i===1?CHD:INK);doc.text(val[i],x,y+12.2)});y+=17}
  rico("**TERCERA. Señal.** El COMPRADOR entrega en este acto a HUELSAN SL el **10 % del precio** en concepto de señal, que se descuenta del precio al formalizarse la compraventa. El pago se hace por transferencia o tarjeta; el pago en efectivo solo se admite hasta el límite que fija la ley. HUELSAN SL entrega al COMPRADOR justificante de la cantidad recibida, identificando el vehículo (ver «Recibí» al final). El resto del precio se abonará al firmar el contrato de compraventa y antes de la entrega.");
  rico("**CUARTA. Plazo de disponibilidad.** HUELSAN SL pondrá el vehículo a disposición del COMPRADOR para su revisión y para formalizar la compraventa en un plazo máximo de **21 días naturales** desde la fecha de este contrato, y se lo comunicará por teléfono, WhatsApp o correo. Si el vehículo todavía debe adquirirse en subasta, la reserva queda condicionada a que HUELSAN SL lo consiga (cláusula sexta, c). Desde el aviso de disponibilidad, el COMPRADOR dispone de **7 días naturales** para revisarlo, firmar el contrato de compraventa y pagar el resto del precio. Este plazo de 7 días **podrá ampliarse si las partes lo acuerdan previamente** (por escrito, incluido correo o WhatsApp).");
  const per=R.peritaje,man=R.mantenimiento;
  let estado;
  if(!per&&!man)estado="**QUINTA. Estado del vehículo.** Este vehículo **no dispone de informe de peritaje ni de historial de mantenimiento**, circunstancia que el COMPRADOR conoce y acepta. "+((R.danosFicha||[]).length?"Los únicos daños o defectos declarados en la ficha de venta son los que figuran en el Anexo I. ":"La ficha de venta no declara daños ni defectos. ")+(R.fotos&&R.fotos.length?"En el Anexo II se incluyen las fotografías del anuncio. ":"")+"HUELSAN SL entregará el vehículo en el estado en que consta en esta reserva, sin otros daños ni averías.";
  else{const partes=[];if(per)partes.push("el informe de peritaje de un perito independiente");if(man)partes.push("el historial de mantenimiento");
    estado=`**QUINTA. Estado del vehículo.** El estado del vehículo es el que reflejan ${partes.join(" y ")} (Anexo I)${R.fotos&&R.fotos.length?" y las fotografías (Anexo II)":""}, que forman parte de este contrato.`+(!per?" El vehículo **no dispone de informe de peritaje**.":"")+(!man?" El vehículo **no dispone de historial de mantenimiento**.":"")+(per?" El peritaje es de un tercero y se entrega a título informativo; incluye la reserva habitual de golpes ocultos o reparaciones anteriores no visibles sin desmontajes.":"")+" HUELSAN SL entregará el vehículo en el estado en que consta en esta reserva, sin otros daños ni averías."}
  rico(estado);
  rico("**SEXTA. Devolución íntegra de la señal.** HUELSAN SL devolverá al COMPRADOR la señal completa, en un máximo de 14 días naturales y por el mismo medio de pago, si el COMPRADOR lo solicita por escrito (correo o WhatsApp) en alguno de estos casos: **a)** el vehículo presenta una avería o daños que no constaban en esta reserva (Anexos), o sus kilómetros superan en más de 1.000 km los indicados; **b)** el vehículo no está disponible para su entrega en el plazo de 21 días de la cláusula cuarta; **c)** HUELSAN SL no consigue adquirir el vehículo en la subasta; en este caso, **a elección del COMPRADOR**, la señal se devuelve íntegra o se traspasa a otro vehículo de HUELSAN SL; **d)** HUELSAN SL no puede entregar el vehículo por cualquier otra causa que no dependa del COMPRADOR (venta a un tercero, cargas o circunstancias no declaradas). En el caso a), si el COMPRADOR lo prefiere, puede seguir adelante con la compraventa una vez reparado el vehículo a cargo de HUELSAN SL.");
  rico("**SÉPTIMA. Desistimiento voluntario y financiación.** Si el COMPRADOR desiste por su propia voluntad, o no formaliza la compraventa en el plazo de la cláusula cuarta, o no obtiene la financiación que pretendía o no dispone de los fondos, **la señal no se devuelve**: compensa a HUELSAN SL por haber retirado el vehículo de la venta. No obstante, si HUELSAN SL vende esta unidad a un tercero dentro de los **30 días naturales** siguientes a la fecha de este contrato, la señal se conserva a favor del COMPRADOR y puede aplicarla al precio de **otro vehículo de HUELSAN SL** que adquiera.");
  rico("**OCTAVA. Derechos del consumidor.** Lo pactado se entiende sin perjuicio de los derechos que la normativa de consumidores (Real Decreto Legislativo 1/2007) reconoce al COMPRADOR cuando tenga la condición de consumidor y que son irrenunciables, incluida la garantía legal en la compraventa, que se detallará en el contrato de compraventa. Si este contrato se firma a distancia o fuera del establecimiento, se aplican los derechos de desistimiento que la ley prevé en esos casos. HUELSAN SL dispone de hojas de reclamaciones.");
  rico("**NOVENA. Protección de datos.** Los datos del COMPRADOR se tratan por HUELSAN SL (responsable) para gestionar esta reserva y la posterior compraventa, y para cumplir sus obligaciones legales. No se ceden a terceros salvo obligación legal o gestoría y garantía necesarias para la operación. El COMPRADOR puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a HUELSAN SL.");
  rico("**DÉCIMA. Ley y jurisdicción.** Este contrato se rige por la ley española. Si el COMPRADOR es consumidor, los conflictos se someten a los juzgados de su domicilio; si es empresa o profesional, a los juzgados de Murcia.");
  rico("**ANEXOS.** Forman parte de este contrato el Anexo I (estado del vehículo)"+(R.fotos&&R.fotos.length?" y el Anexo II (fotografías)":"")+".",{after:3});

  /* ---- firmas */
  sitio(78);
  rico("En prueba de conformidad, firman por duplicado y a un solo efecto, en el lugar y la fecha indicados al inicio.",{after:2});
  if(R.lugar){font(1,9);doc.text("Lugar de venta y firma: "+R.lugar,M,y+4);y+=7}
  else opciones("Lugar de venta y firma:",[["m","Murcia"],["h","Huelva"],["o","Otro: "+blanco(20)]],null);
  y+=2;sitio(46);const hw=AW/2-2;
  doc.setDrawColor(...CH);doc.setLineWidth(.4);doc.rect(M,y,hw,40);doc.rect(M+hw+4,y,hw,40);
  font(1,8.6);doc.text("EL VENDEDOR",M+3,y+5);font(0,8.6);doc.text(E.nombre,M+3,y+9.4);
  if(VEN.nombre){font(0,7.8);doc.text(VEN.nombre,M+3,y+13.6)}else{font(0,7.8);doc.text("[   ] F. J. Álvarez   [   ] G. Fornell",M+3,y+13.6)}
  font(1,8.6);doc.text("EL COMPRADOR",M+hw+7,y+5);font(0,8.6);doc.text(C.nombre||blanco(22),M+hw+7,y+9.4);font(0,7.8);doc.text("DNI "+(C.dni||blanco(14)),M+hw+7,y+13.6);
  y+=44;
  rico(`**RECIBÍ** la cantidad de ${precio?eurS(senal):blanco(14)+" €"} en concepto de señal del 10 % por la reserva del vehículo **${V.matricula||""}**. Fecha: ${blanco(4)} / ${blanco(4)} / ${blanco(8)}  Firma de HUELSAN SL: ${blanco(20)}`);

  /* ---- Anexo I */
  nueva();font(1,15);doc.text("ANEXO I · ESTADO DEL VEHÍCULO",M,y+5);y+=8;font(0,8.4,GR);doc.text([V.descripcion,V.matricula,V.bastidor?"Bastidor "+V.bastidor:""].filter(Boolean).join(" · "),M,y+2.4);y+=6;
  const tabla=(cab,filas,anchos)=>{const lh=3.9;const cx=[];let a=M;for(const w of anchos){cx.push(a);a+=AW*w}
    const cabecera=()=>{sitio(8);doc.setFillColor(...INK);doc.rect(M,y,AW,5.6,"F");font(1,7.6,[255,255,255]);cab.forEach((c,i)=>doc.text(c,cx[i]+2,y+3.9));y+=5.6};
    cabecera();filas.forEach((f,ri)=>{font(0,8.4);const ls=f.map((c,i)=>doc.splitTextToSize(String(c||""),AW*anchos[i]-4));const n=Math.max(...ls.map(l=>l.length));const h=n*lh+1.8;
      if(y+h>LIM){nueva();cabecera()}
      if(ri%2)doc.setFillColor(250,248,244),doc.rect(M,y,AW,h,"F");
      font(0,8.4);ls.forEach((l,i)=>doc.text(l,cx[i]+2,y+3.6));doc.setDrawColor(226,219,204);doc.setLineWidth(.15);doc.line(M,y+h,M+AW,y+h);y+=h});
    doc.setDrawColor(...CH);doc.setLineWidth(.3);y+=2};
  if(per){h2("1. DATOS DEL PERITAJE");
    fila([{l:"Empresa peritadora",v:per.datos.perito,w:2},{l:"Fecha de tasación",v:per.datos.fecha,w:1},{l:"Km en la tasación",v:per.datos.km,w:1}]);
    rico("Daños, defectos y elementos que constan en el informe:",{after:1});
    tabla(["PIEZA / ELEMENTO","NIVEL","DESCRIPCIÓN"],per.danos,[.36,.2,.44]);
    rico("Informe pericial de "+(per.datos.perito||"perito independiente")+(per.datos.fecha?" (tasación del "+per.datos.fecha+")":"")+". El informe queda con reserva de golpes ocultos o reparaciones anteriores no visibles sin desmontajes.",{s:7.8,lead:3.7,col:GR})}
  else{h2("1. PERITAJE");rico("Este vehículo **no dispone de informe de peritaje**.");
    h2("DAÑOS O DEFECTOS DECLARADOS EN LA FICHA DE VENTA");
    if((R.danosFicha||[]).length)R.danosFicha.forEach(t=>rico("• "+t,{after:.4}));else rico("La ficha de venta no declara daños ni defectos.")}
  h2("2. HISTORIAL DE MANTENIMIENTO");
  if(man){tabla(["FECHA","KILÓMETROS","INTERVENCIONES REGISTRADAS"],man.entradas,[.15,.15,.7]);}
  else rico("Este vehículo **no dispone de historial de mantenimiento**.");

  /* ---- Anexo II: fotos, 12 por página (3×4) */
  const fotos=R.fotos||[];
  if(fotos.length){
    const gap=3,pw=(AW-2*gap)/3,ph=pw*.75;
    for(let i=0;i<fotos.length;i++){
      if(i%12===0){nueva();font(1,15);doc.text("ANEXO II · FOTOGRAFÍAS",M,y+5);y+=8;font(0,8.4,GR);
        doc.text(`${fotos.length} fotografías ${per?"del informe de peritaje":"del anuncio de venta"} · ${V.descripcion||""} · ${V.matricula||""}`,M,y+2.4);y+=7}
      const k=i%12,cx=M+(k%3)*(pw+gap),cy=y+Math.floor(k/3)*(ph+7);
      try{doc.addImage(fotos[i],"JPEG",cx,cy,pw,ph,undefined,"FAST")}catch(e){console.warn("Foto no añadida",e)}
      font(0,7,CHD);doc.text("Foto "+(i+1),cx,cy+ph+3.4)}}

  /* ---- cabecera y pie en todas las páginas */
  const N=doc.getNumberOfPages();
  for(let p=1;p<=N;p++){doc.setPage(p);
    font(1,12.5,INK);doc.text("HUELSAN",M,14,{charSpace:1.6});font(0,5,CHD);doc.text("AUTOMOCIÓN",M,16.8,{charSpace:1.8});
    font(0,8,CHD);doc.text(R.referencia||"Reserva nº ______________",W-M,13,{align:"right"});
    doc.setDrawColor(...CH);doc.setLineWidth(.3);doc.line(M,19,W-M,19);doc.line(M,286,W-M,286);
    font(0,7.4,GR);doc.text(`${E.nombre} · ${E.cif} · Contrato de reserva ${V.matricula||""}`,M,290);doc.text(`Página ${p} de ${N}`,W-M,290,{align:"right"})}
  return doc}

/* ======================================================================
   Interfaz: ventana con las preguntas (solo en el navegador, con la app de facturación)
   ====================================================================== */
const ST={lote:null,per:null,man:null,fotosPdf:[],busy:false,ubics:[],msg:""};
const q=s=>document.querySelector(s);
const aBlob=(c,t,qq)=>new Promise(r=>c.toBlob(r,t,qq));
const aDataURL=b=>new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>ko(r.error);r.readAsDataURL(b)});
async function reducirJPG(src,max=900){const bm=src instanceof ImageBitmap?src:await createImageBitmap(src);const k=Math.min(1,max/Math.max(bm.width,bm.height));
  const c=document.createElement("canvas");c.width=Math.round(bm.width*k);c.height=Math.round(bm.height*k);const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.imageSmoothingQuality="high";x.drawImage(bm,0,0,c.width,c.height);
  return await aDataURL(await aBlob(c,"image/jpeg",.74))}

async function pdfjs(){if(root.__pdfjs)return root.__pdfjs;const lib=await import("../pdf.min.mjs");
  if(!globalThis.pdfjsWorker)globalThis.pdfjsWorker=await import("../pdf.worker.min.mjs");lib.GlobalWorkerOptions.workerSrc="../pdf.worker.min.mjs";return root.__pdfjs=lib}
/* filas de celdas de una página: se juntan los trozos de texto que están a la misma altura, de izquierda a derecha */
async function filasDePagina(page){
  const vp=page.getViewport({scale:1}),tc=await page.getTextContent();const it=[];
  for(const i of tc.items){if(!i.str||!i.str.trim())continue;const t=i.transform,v=vp.transform;
    it.push({x:v[0]*t[4]+v[2]*t[5]+v[4],y:v[1]*t[4]+v[3]*t[5]+v[5],w:i.width||0,s:i.str})}
  it.sort((a,b)=>a.y-b.y||a.x-b.x);const filas=[];
  for(const i of it){const f=filas.find(f=>Math.abs(f.y-i.y)<=3);if(f)f.items.push(i);else filas.push({y:i.y,items:[i]})}
  filas.sort((a,b)=>a.y-b.y);
  return filas.map(f=>{f.items.sort((a,b)=>a.x-b.x);const cel=[];let fin=-1e9;
    for(const i of f.items){if(cel.length&&i.x-fin<5)cel[cel.length-1]+=(i.x-fin>1.2?" ":"")+i.s;else cel.push(i.s);fin=i.x+i.w}
    return cel})}
async function leerPdf(file,fotos){
  const lib=await pdfjs();const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
  let filas=[];const imgs=[];const vistos=new Set();
  for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p);
    filas=filas.concat(await filasDePagina(page));
    if(fotos){const ops=await page.getOperatorList();
      for(let i=0;i<ops.fnArray.length;i++){if(ops.fnArray[i]!==lib.OPS.paintImageXObject)continue;const nom=ops.argsArray[i][0];if(vistos.has(p+nom))continue;vistos.add(p+nom);
        try{const o=await new Promise((ok,ko)=>{const tm=setTimeout(()=>ko(new Error("t")),8000);page.objs.get(nom,v=>{clearTimeout(tm);ok(v)})});
          if(!o||(o.width||0)<400||(o.height||0)<300)continue;
          const c=document.createElement("canvas");c.width=o.width;c.height=o.height;const x=c.getContext("2d");
          if(o.bitmap)x.drawImage(o.bitmap,0,0);else if(o.data){const id=x.createImageData(o.width,o.height),d=id.data,s=o.data;
            if(s.length===o.width*o.height*4)d.set(s);else if(s.length===o.width*o.height*3){for(let a=0,b=0;a<s.length;a+=3,b+=4){d[b]=s[a];d[b+1]=s[a+1];d[b+2]=s[a+2];d[b+3]=255}}else continue;x.putImageData(id,0,0)}else continue;
          imgs.push(await reducirJPG(await aBlob(c,"image/jpeg",.9)))}catch(e){console.warn("Imagen del PDF no leída",e)}}}}
  return{filas,imgs}}
function extPedir(tipo,extra){return new Promise((res,rej)=>{if(!document.documentElement.dataset.huelsanExt){rej(new Error("sin extensión"));return}
  const id=Math.random().toString(36).slice(2);const fin=()=>{removeEventListener("message",h);clearTimeout(tm)};
  const h=e=>{if(e.source===window&&e.data&&e.data.respuesta&&e.data.id===id){fin();e.data.ok?res(e.data):rej(new Error(e.data.msg||"Error"))}};
  const tm=setTimeout(()=>{fin();rej(new Error("La extensión no responde"))},30000);
  addEventListener("message",h);postMessage({huelsanExt:tipo,id,...extra},location.origin)})}
const b64Blob=(b64,tipo)=>{const s=atob(b64),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return new Blob([u],{type:tipo||"image/jpeg"})};
/* fotos del anuncio: las de BCA con la extensión (todas) y las que ya están guardadas en la app */
async function fotosDelAnuncio(l,aviso){
  const out=[];const ids=(l.fotoIds||[]);const lote=[];let n=0;
  for(const id of ids){lote.push((async()=>{try{const r=await extPedir("foto-bca",{docId:id,ancho:1280});return await reducirJPG(b64Blob(r.base64,r.tipo))}catch(e){return null}})())}
  const bca=ids.length&&document.documentElement.dataset.huelsanExt?await Promise.all(lote):[];
  bca.forEach(x=>{if(x)out.push(x)});
  if(!out.length)for(const id of (l.fotos||[])){try{const bid=(l.fotosBcaMap||{})[id];let bl=null;
    if(bid&&document.documentElement.dataset.huelsanExt){try{const r=await extPedir("foto-bca",{docId:bid,ancho:1280});bl=b64Blob(r.base64,r.tipo)}catch(e){}}
    if(!bl){const r=await fetch((root.HUELSAN_BLOB||"/_blob/")+id);if(r.ok)bl=await r.blob()}
    if(bl)out.push(await reducirJPG(bl))}catch(e){}}
  if(ids.length&&!document.documentElement.dataset.huelsanExt&&!out.length)aviso("Las fotos de BCA necesitan la extensión de Huelsan en este navegador; el contrato saldrá sin fotos.");
  return out}

const REPS_FB={francisco:{nombre:"Francisco José Álvarez González",dni:""},gustavo:{nombre:"Gustavo Fornell Lacida",dni:""}};
const repsOk=()=>{const r=(root.HuelsanContratos&&HuelsanContratos.reps())||{};return{francisco:r.francisco||REPS_FB.francisco,gustavo:r.gustavo||REPS_FB.gustavo}};
/* Lee un PDF (de BCA o subido a mano) y lo guarda como peritaje o historial. tipo: "per" | "man" | null (se reconoce por el contenido) */
async function usarPdf(blob,tipo,v,msg){
  const r0=await leerPdf(blob,false);const txt=r0.filas.map(f=>f.join(" ")).join("\n");
  if(!tipo)tipo=/CONDICIONES DE VALORACI|TASADOR|\bNIVEL\b/i.test(txt)?"per":/Historial de mantenimiento|Kil[óo]metros/i.test(txt)&&/Descripci[óo]n/i.test(txt)?"man":null;
  if(tipo==="per"){const x=parsePeritaje(r0.filas);if(!(x.danos.length||x.datos.matricula))return false;const r=await leerPdf(blob,true);ST.per=x;ST.fotosPdf=r.imgs;
    const mal=x.datos.matricula&&v.matricula&&x.datos.matricula.replace(/\W/g,"")!==v.matricula.replace(/\W/g,"");
    msg(`Peritaje leído: ${x.danos.length} puntos y ${r.imgs.length} fotos.${mal?" ¡Ojo! La matrícula del peritaje ("+x.datos.matricula+") no coincide con la del coche.":""}`);return true}
  if(tipo==="man"){const x=parseHistorial(r0.filas);if(!x.entradas.length)return false;ST.man=x;msg(`Historial leído: ${x.entradas.length} fechas de intervención.`);return true}
  return false}
/* Coge solo los documentos de la ficha de BCA (necesita la extensión de Huelsan v1.3 y la sesión de BCA iniciada) */
async function traerDeBca(l,v,msg){
  const el=q("#rs-bca");const say=t=>{if(el)el.textContent=t};
  if(!l.url){return}
  if(!document.documentElement.dataset.huelsanExt){say("No puedo coger los documentos de BCA: falta la extensión de Huelsan en este navegador. Adjunta el peritaje y el historial a mano.");return}
  ST.cargando=true;
  try{const r=await extPedir("docs-bca",{url:l.url});const docs=r.docs||[];let nPer=0,nMan=0;
    for(const d of docs){try{if(await usarPdf(b64Blob(d.base64,"application/pdf"),null,v,()=>{})){}}catch(e){console.warn("Documento de BCA no leído",d.nombre,e)}}
    nPer=ST.per?1:0;nMan=ST.man?1:0;
    say(`Ficha de BCA: ${docs.length} documento${docs.length===1?"":"s"} PDF encontrados · peritaje ${nPer?"✓ cogido":"no encontrado"} · historial ${nMan?"✓ cogido":"no encontrado"}.${nPer&&nMan?"":" Lo que falte, adjúntalo a mano o marca que el coche no lo tiene."}`);
    if(ST.per)msg(`Peritaje leído de BCA: ${ST.per.danos.length} puntos y ${ST.fotosPdf.length} fotos.`)}
  catch(e){say("No se han podido coger los documentos de BCA ("+(e.message||e)+"). ¿Tienes la sesión de BCA abierta? Adjúntalos a mano.")}
  finally{ST.cargando=false}}
const val=n=>((q("#rs-"+n)||{}).value||"").trim();
function opciones(arr,sel){return arr.map(([k,t])=>`<option value="${esc(k)}" ${k===sel?"selected":""}>${esc(t)}</option>`).join("")}
function abrir(l){
  ST.lote=l;ST.per=null;ST.man=null;ST.fotosPdf=[];ST.msg="";ST.cargando=false;
  let dlg=q("#dlg-reserva");if(!dlg){dlg=document.createElement("dialog");dlg.id="dlg-reserva";document.body.appendChild(dlg)}
  const reps=repsOk();const rf=reps.francisco,rg=reps.gustavo;
  const v=root.HuelsanContratos?HuelsanContratos.desdeLote(l).vehiculo:{};
  const desc=[v.marca,v.modelo,v.version].filter(Boolean).join(" ");
  const clientes=[...S.clientes.values()].sort((a,b)=>nombreCliente(a).localeCompare(nombreCliente(b)));
  const interes=l.estado==="interesante";
  dlg.innerHTML=`<form method="dialog" id="f-reserva">
    <div class="row sp"><h2>Contrato de reserva</h2><button class="btn" value="cancel" formnovalidate>Cerrar</button></div>
    <div class="muted"><b>${esc(desc||"Vehículo")}</b> · ${esc(v.matricula||"sin matrícula")} · ${esc(v.km?v.km+" km":"")}</div>
    ${interes?"":`<div class="note" style="background:var(--warnbg);color:var(--warn);padding:8px;border-radius:8px">Este coche no está marcado como Interesante. El contrato de reserva está pensado para coches Interesantes.</div>`}
    <h3>1. Precio y vendedor</h3>
    <div class="g3"><label>Precio de venta (impuestos incluidos, €)<input id="rs-precio" type="number" step="50" min="0" value="${+l.precioVenta||""}" required></label>
      <label>Vendedor<select id="rs-vend" required><option value="">— Elige —</option>${opciones([["francisco",rf.nombre||"Francisco José Álvarez González"],["gustavo",rg.nombre||"Gustavo Fornell Lacida"]],"")}</select></label>
      <label>Lugar de venta y firma<select id="rs-lugar"><option value="">— Elige —</option>${opciones([...ST.ubics.map(x=>[x,x]),["__otro","Otro (escribir)"]],"")}</select></label></div>
    <div class="g3"><label id="rs-otro-l" hidden>Otro lugar<input id="rs-otro"></label><div class="muted" id="rs-senal" style="align-self:end"></div><div class="muted" id="rs-dni" style="align-self:end"></div></div>
    <h3>2. Comprador</h3>
    <label>Cliente guardado<select id="rs-cli"><option value="">— Cliente nuevo —</option>${clientes.map(c=>`<option value="${esc(c.id)}">${esc(nombreCliente(c))}${c.nif?" · "+esc(c.nif):""}</option>`).join("")}</select></label>
    <div class="g2"><label>Nombre y apellidos / razón social<input id="rs-nom"></label><label>DNI / NIE / CIF<input id="rs-dni-c"></label></div>
    <div class="g2"><label>Dirección (si la hay)<input id="rs-dir" placeholder="Calle, nº, CP, localidad"></label><label>Teléfono / correo<input id="rs-con" placeholder="Opcional"></label></div>
    <label class="row" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="rs-blanco" style="width:auto"> Dejar los datos del comprador en blanco (se rellenan a mano; no se crea cliente)</label>
    <h3>3. Peritaje, historial y fotos</h3>
    <div class="muted" id="rs-bca">${l.url?"Buscando el peritaje y el historial en la ficha de BCA…":"Este coche no tiene ficha de BCA: adjunta los documentos a mano."}</div>
    <div class="g2"><label>Peritaje (PDF) <small>si no se ha cogido solo</small><input id="rs-per" type="file" accept="application/pdf"></label><label>Historial de mantenimiento (PDF) <small>si no se ha cogido solo</small><input id="rs-man" type="file" accept="application/pdf"></label></div>
    <div class="g2"><label class="row" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="rs-noper" style="width:auto"> Este coche NO tiene peritaje</label><label class="row" style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" id="rs-noman" style="width:auto"> Este coche NO tiene historial de mantenimiento</label></div>
    <div class="muted">No se puede crear el contrato hasta que cada documento esté adjunto o marques que el coche no lo tiene (entonces el contrato lo hace constar y usa las fotos del anuncio: ${(l.fotoIds||[]).length+(l.fotos||[]).length} disponibles). Daños de la ficha de venta (solo si no hay peritaje y los declara, uno por línea):</div>
    <textarea id="rs-danos" rows="2" placeholder="Solo si no hay peritaje y la ficha de venta declara daños"></textarea>
    <div class="note" id="rs-msg" role="status"></div>
    <div class="bar"><button class="btn primary" id="rs-crear" value="x">Crear contrato (PDF)</button><span class="muted">Se descarga el PDF y, si el comprador es nuevo, se guarda como cliente.</span></div></form>`;
  dlg.showModal();enlazar(dlg,l,v,desc)}
function enlazar(dlg,l,v,desc){
  const msg=t=>{const m=q("#rs-msg");if(m)m.textContent=t||""};
  const reps=repsOk;
  const pintaResumen=()=>{const p=+val("precio")||0;q("#rs-senal").textContent=p?`Señal 10 %: ${eurS(p*.1)} · Resto: ${eurS(p*.9)}`:"";
    const k=val("vend");const r=k?reps()[k]:null;q("#rs-dni").innerHTML=r?(r.dni?"":`<span style="color:var(--warn)">Falta el DNI de ${esc(r.nombre||k)} en Contratos → Representantes</span>`):""};
  dlg.addEventListener("input",e=>{if(e.target.id==="rs-precio"||e.target.id==="rs-vend")pintaResumen();if(e.target.id==="rs-lugar")q("#rs-otro-l").hidden=val("lugar")!=="__otro"});
  dlg.addEventListener("change",async e=>{const t=e.target;
    if(t.id==="rs-lugar")q("#rs-otro-l").hidden=t.value!=="__otro";
    if(t.id==="rs-cli"){const c=S.clientes.get(t.value);if(c){q("#rs-nom").value=nombreCliente(c);q("#rs-dni-c").value=c.nif||"";q("#rs-dir").value=[c.direccion,c.cp,c.municipio].filter(Boolean).join(", ");q("#rs-con").value=[c.telefono,c.email].filter(Boolean).join(" · ")}}
    if(t.id==="rs-per"||t.id==="rs-man"){const f=t.files[0];const per=t.id==="rs-per";if(!f){ST[per?"per":"man"]=null;if(per)ST.fotosPdf=[];return}
      msg("Leyendo "+f.name+"…");try{const ok=await usarPdf(f,per?"per":"man",v,msg);if(!ok)msg("No he podido leer ese PDF como "+(per?"ficha de peritaje.":"historial de mantenimiento."))}
      catch(err){msg("No se ha podido leer el PDF: "+(err.message||err))}}
  });
  q("#f-reserva").addEventListener("submit",async e=>{
    if(e.submitter&&e.submitter.id!=="rs-crear")return;e.preventDefault();if(ST.busy)return;
    const precio=+val("precio");if(!precio){msg("Escribe el precio de venta.");return}
    if(ST.cargando){msg("Espera un momento: se están leyendo los documentos de BCA.");return}
    if(!ST.per&&!q("#rs-noper").checked){msg("Falta el peritaje: se coge solo de la ficha de BCA o adjúntalo. Si el coche no lo tiene, marca «NO tiene peritaje».");return}
    if(!ST.man&&!q("#rs-noman").checked){msg("Falta el historial de mantenimiento: se coge solo de la ficha de BCA o adjúntalo. Si el coche no lo tiene, marca «NO tiene historial».");return}
    const kv=val("vend");if(!kv){msg("Elige quién vende (Francisco o Gustavo).");return}
    let lugar=val("lugar");if(lugar==="__otro")lugar=val("otro");
    const blanco=q("#rs-blanco").checked;
    const comp=blanco?{}:{nombre:val("nom"),dni:val("dni-c"),direccion:val("dir"),telefono:"",email:"",contacto:val("con")};
    if(!blanco&&(!comp.nombre||!comp.dni)&&!confirm("Faltan el nombre completo o el DNI del comprador. ¿Crear el contrato igualmente con esos datos en blanco?"))return;
    ST.busy=true;const btn=q("#rs-crear");btn.disabled=true;btn.textContent="Preparando…";
    try{const rep=reps()[kv]||{};
      let fotos=ST.fotosPdf;if(!ST.per||!fotos.length){msg("Leyendo las fotos del anuncio…");fotos=await fotosDelAnuncio(l,msg)}
      const v2=root.HuelsanContratos?HuelsanContratos.desdeLote(l).vehiculo:{};
      const E=S.emisor||{};
      const R={empresa:{nombre:E.razonSocial||"Huelsan SL",cif:E.nif||"B25979543",domicilio:[E.domicilio,[E.cp,E.municipio].filter(Boolean).join(" ")].filter(Boolean).join(", ")||"Guadalupe (30107), Murcia"},
        vendedor:{nombre:rep.nombre||"",dni:rep.dni||""},lugar,precio,comprador:comp,
        vehiculo:{descripcion:ST.per&&ST.per.datos.modelo&&!desc?ST.per.datos.modelo:desc,matricula:v2.matricula||(ST.per&&ST.per.datos.matricula)||"",bastidor:v2.bastidor||(ST.per&&ST.per.datos.bastidor)||"",
          color:v2.color||(ST.per&&ST.per.datos.color)||"",km:(ST.per&&ST.per.datos.km)||(v2.km?v2.km+" km":""),combustible:[v2.combustible,v2.cambio].filter(Boolean).join(" · ")},
        peritaje:ST.per,mantenimiento:ST.man,danosFicha:ST.per?[]:val("danos").split(/\n+/).map(s=>s.trim()).filter(Boolean),fotos};
      const doc=await pdfReserva(R);
      const nombre=`Reserva-${(R.vehiculo.matricula||"coche").replace(/\W+/g,"")}${comp.nombre?"-"+comp.nombre.replace(/[^\wÀ-ÿ ]+/g,"").trim().replace(/\s+/g,"-"):""}.pdf`;
      doc.save(nombre);
      let pdfRef=null;try{const bl=doc.output("blob");const up=await HUELSAN.subir("documentos",new Blob([bl],{type:"application/pdf"}));pdfRef={ruta:up.id,nombre,size:bl.size}}catch(e){console.warn("PDF no guardado",e);toast("El PDF se ha descargado pero no se ha podido guardar en Contratos",6000)}
      /* alta de cliente y registro de la reserva */
      let clienteId=val("cli");
      if(!blanco&&!clienteId&&comp.nombre&&comp.dni){clienteId=nid();const p=comp.nombre.split(/\s+/);
        await S.db.doc("clientes/"+clienteId).set({tipo:/^[ABCDEFGHJNPQRSUVW]\d/.test(nifLimpio(comp.dni))?"empresa":"particular",nombre:p[0],apellidos:p.slice(1).join(" "),razonSocial:/^[ABCDEFGHJNPQRSUVW]\d/.test(nifLimpio(comp.dni))?comp.nombre:"",
          nif:nifLimpio(comp.dni),direccion:comp.direccion||"",telefono:"",email:"",pais:"España",notas:"Alta desde un contrato de reserva ("+R.vehiculo.matricula+")",creado:new Date().toISOString()});toast("Cliente nuevo guardado")}
      const rid=nid();await S.db.doc("reservas/"+rid).set({loteId:l.id,matricula:R.vehiculo.matricula,clienteId:clienteId||"",comprador:comp.nombre||"",vendedor:kv,lugar,precio,senal:Math.round(precio*10)/100,
        conPeritaje:!!ST.per,conHistorial:!!ST.man,fotos:fotos.length,vehiculo:R.vehiculo.descripcion||"",pdf:pdfRef,creada:new Date().toISOString()});
      msg("Contrato creado y descargado ("+doc.getNumberOfPages()+" páginas).");
    }catch(err){console.error(err);msg("No se ha podido crear el contrato: "+(err.message||err))}
    finally{ST.busy=false;btn.disabled=false;btn.textContent="Crear contrato (PDF)"}});
  pintaResumen();traerDeBca(l,v,msg)}

/* ---------- Contratos → Reservas (lista en la pestaña Contratos) ---------- */
const RES=new Map();
function seccion(){
  const ls=[...RES.values()].sort((a,b)=>String(b.creada||"").localeCompare(String(a.creada||"")));
  const f=d=>d?new Date(d).toLocaleDateString("es-ES"):"—";
  return`<div class="card"><h3>Contratos de reserva <span class="muted">(${ls.length})</span></h3>
    <p class="muted" style="margin:0">Se crean desde la ficha del coche (botón «Contrato de reserva», coches Interesantes). Aquí queda guardado el PDF de cada uno.</p>
    ${ls.length?`<div class="tw"><table><thead><tr><th>Fecha</th><th>Comprador</th><th>Vehículo</th><th>Precio</th><th>Señal 10 %</th><th>Peritaje</th><th></th></tr></thead><tbody>
    ${ls.map(r=>`<tr><td>${f(r.creada)}</td><td>${esc(r.comprador||"— en blanco —")}</td><td>${esc(r.vehiculo||"")} ${r.matricula?`<span class="mat">${esc(r.matricula)}</span>`:""}</td><td>${eurS(+r.precio||0)}</td><td>${eurS(+r.senal||0)}</td><td>${r.conPeritaje?"Sí":"No"}${r.conHistorial?" · historial":""}</td>
      <td class="row">${r.pdf?`<button class="btn sm" data-rs-ver="${esc(r.id)}">Descargar PDF</button>`:`<span class="muted">sin PDF guardado</span>`}<button class="btn sm peligro" data-rs-del="${esc(r.id)}">Borrar</button></td></tr>`).join("")}</tbody></table></div>`
    :`<div class="vacio">Aún no hay contratos de reserva.</div>`}</div>`}
if(typeof document!=="undefined")document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-rs-ver],[data-rs-del]");if(!t)return;e.preventDefault();
  try{if(t.dataset.rsVer){const r=RES.get(t.dataset.rsVer);if(!r||!r.pdf)return;descargarBlob(await HUELSAN.bajar("documentos",r.pdf.ruta),r.pdf.nombre||"reserva.pdf")}
  else{const r=RES.get(t.dataset.rsDel);if(!r)return;if(!confirm("¿Borrar este contrato de reserva? Se elimina también su PDF guardado."))return;
    if(r.pdf)await HUELSAN.borrarArchivo("documentos",r.pdf.ruta).catch(()=>{});await S.db.doc("reservas/"+r.id).delete();toast("Reserva borrada")}}
  catch(err){toast(err.message||String(err),6000)}});

(async function esperar(){
  if(typeof document==="undefined")return;
  if(typeof S==="undefined"||!S.db||!S.lotes){setTimeout(esperar,200);return}
  S.db.collection("reservas").onSnapshot(sn=>{RES.clear();sn.docs.forEach(d=>RES.set(d.id,{...d.data(),id:d.id}));if(root.HuelsanContratos&&HuelsanContratos.repintarLista)HuelsanContratos.repintarLista()},e=>console.error(e));
  try{const sn=await S.db.doc("config/ubicaciones").get();const d=sn&&sn.exists&&sn.data&&sn.data();if(d&&Array.isArray(d.lista))ST.ubics=d.lista.filter(x=>typeof x==="string"&&x.trim())}catch(e){}
  if(!ST.ubics.length)ST.ubics=["Murcia","Huelva"];
  const id=new URLSearchParams(location.search).get("reservaLote");if(!id)return;
  (function intento(n){const l=S.lotes.find(x=>x.id===id);if(!l){if(n<40)setTimeout(()=>intento(n+1),250);return}abrir(l)})(0)})();

root.HuelsanReserva={seccion,abrir,parsePeritaje,parseHistorial,pdfReserva};
if(typeof module!=="undefined")module.exports=root.HuelsanReserva;
})(typeof window!=="undefined"?window:globalThis);
