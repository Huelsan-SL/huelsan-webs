/* Huelsan · panel «Histórico completo» (se añade a la app al generar gestion/index.html).
   Al abrir la app solo se cargan del histórico los lotes buenos (grado A/B, daños 1–2, con precio de BCA).
   Desde aquí se busca o se carga el resto, y se aligera y archiva el histórico a mano. */
"use strict";
const HP={pedido:false,cnt:null,arch:null,ult:null,msg:"",tipo:"",ocupado:false,archivo:false};
function histPanel(){
  if(!HP.pedido&&window.HUELSAN_HIST&&S.db){HP.pedido=true;
    Promise.all([HUELSAN_HIST.noCargados().catch(()=>null),HUELSAN_HIST.archivados().catch(()=>null),
      S.db.doc("historico/mantenimiento").get().then(s=>s.exists?s.data():null).catch(()=>null)])
      .then(([a,b,c])=>{HP.cnt=a;HP.arch=b;HP.ult=c;if(S.tab==="historico")render()})}
  const n=x=>x==null?"…":num(x);
  const ult=HP.ult&&HP.ult.fecha?`Última vez: ${fdate(HP.ult.fecha)} (${n(HP.ult.aligerados||0)} aligerados, ${n(HP.ult.archivados||0)} archivados).`:"";
  const dis=HP.ocupado?"disabled":"";
  return`<div class="card" style="display:grid;gap:10px;margin-bottom:16px">
    <div><b>Histórico completo</b><div class="muted" style="font-size:13px;margin-top:2px">Al abrir la app solo se cargan del histórico los lotes con grado mecánico A o B, daños 1 o 2 y precio de BCA (salida o puja). El resto sigue guardado${HP.cnt!=null?` (${n(HP.cnt)} lotes)`:""}${HP.arch?`, más ${n(HP.arch)} en el archivo de subastas de hace más de un año`:""}: escribe en «Buscar en el histórico» y pulsa «Buscar en todo el histórico».</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn sm" data-hp="buscar" ${dis}>Buscar en todo el histórico</button>
      <button class="btn sm" data-hp="todo" ${dis}>Cargar todo el histórico</button>
      <label class="toggle" style="font-size:13px"><input type="checkbox" data-hp-arch ${HP.archivo?"checked":""}><span>Incluir el archivo (más de 1 año)</span></label></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--line);padding-top:10px">
      <button class="btn sm" data-hp="aligerar" ${dis}>Aligerar y archivar ahora</button>
      <span class="muted" style="font-size:12.5px;flex:1 1 320px">Los lotes cerrados hace más de 3 meses se quedan con lo útil para comparar precios (datos del coche, daños, precios, notas del vendedor y una foto para la miniatura) y los de más de 1 año pasan al archivo. Los vuestros (interesantes, comprados, stock, vendidos o publicados) no se tocan. Se hace sola el día 1 de cada mes. ${ult}</span></div>
    ${HP.msg?`<div class="${HP.tipo==="bad"?"note":"muted"}" role="status" style="font-size:13px">${esc(HP.msg)}</div>`:""}
  </div>`}
async function hpAccion(que){
  if(HP.ocupado)return;
  const q=((document.getElementById("h-q")||{}).value||S.histQ||"").trim();
  if(que==="buscar"&&!q){HP.msg="Escribe primero algo en «Buscar en el histórico» (matrícula, marca, modelo o subasta).";HP.tipo="bad";render();return}
  if(que==="aligerar"&&!confirm("Se aligeran los lotes cerrados hace más de 3 meses y se archivan los de más de 1 año. Vuestros lotes no se tocan. ¿Seguimos?"))return;
  HP.ocupado=true;HP.msg=que==="aligerar"?"Aligerando el histórico…":"Buscando en la base de datos…";HP.tipo="";render();
  try{
    if(que==="buscar"){const k=await HUELSAN_HIST.buscar(q,HP.archivo);HP.msg=k?`${num(k)} lotes más encontrados y añadidos a la lista.`:`No hay más lotes con «${q}» fuera de los ya cargados.`}
    else if(que==="todo"){const k=await HUELSAN_HIST.cargarTodo(HP.archivo);HP.msg=`${num(k)} lotes más cargados. Al volver a abrir la app solo se cargarán otra vez los del filtro.`}
    else{const r=await HUELSAN_HIST.aligerar();HP.msg=`Hecho: ${num(r&&r.aligerados||0)} lotes aligerados y ${num(r&&r.archivados||0)} pasados al archivo.`;HP.pedido=false}
  }catch(e){HP.tipo="bad";HP.msg=/aligerar_historico|PGRST202|404/.test(String(e.message))?"Falta preparar la base de datos para esto (archivo supabase/04-historico.sql).":"No se ha podido completar: "+String(e.message||e).slice(0,200)}
  finally{HP.ocupado=false;render()}}
document.addEventListener("click",e=>{const b=e.target.closest("[data-hp]");if(b){e.preventDefault();hpAccion(b.dataset.hp)}});
document.addEventListener("change",e=>{if(e.target.matches("[data-hp-arch]"))HP.archivo=e.target.checked});
