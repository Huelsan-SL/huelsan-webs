/* Huelsan Automoción · adaptador de la app de gestión a Supabase.
   Imita la API que la app usaba dentro de Claude (window.claude.use("db"|"assets"|…))
   para que el código de la app no cambie: colecciones, documentos, cambios en tiempo real y fotos.
   Sin librerías externas: REST de Supabase (PostgREST, Auth, Storage) y Realtime por WebSocket. */
(function(){
"use strict";
const SB_URL="https://ajxdzchffqaphkmetswx.supabase.co";
const SB_KEY="sb_publishable_8n9P6btJois-b7B3-kNTTQ_YG6D4S1X";
const TABLAS=["lotes","subastas","demandas","miniaturas","ajustes"];
const SES_KEY="huelsan-sesion";
window.HUELSAN_BLOB=SB_URL+"/storage/v1/object/public/fotos/";

/* ---------------- sesión ---------------- */
// «Mantener la sesión iniciada»: en localStorage (sigue al cerrar el navegador) o solo en esta pestaña (sessionStorage)
const recordar=()=>{try{return localStorage.getItem("huelsan-recordar")!=="0"}catch(e){return true}};
let ses=null;try{ses=JSON.parse(localStorage.getItem(SES_KEY)||sessionStorage.getItem(SES_KEY)||"null")}catch(e){}
const guardarSes=s=>{ses=s;try{localStorage.removeItem(SES_KEY);sessionStorage.removeItem(SES_KEY);
  if(s)(recordar()?localStorage:sessionStorage).setItem(SES_KEY,JSON.stringify(s))}catch(e){}};
async function authPost(q,body){
  const r=await fetch(SB_URL+"/auth/v1/token?grant_type="+q,{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(j.error_description||j.msg||j.message||("HTTP "+r.status)),{status:r.status});
  return{access_token:j.access_token,refresh_token:j.refresh_token,expires_at:j.expires_at||Math.floor(Date.now()/1000)+(j.expires_in||3600),email:j.user&&j.user.email};
}
let refrescando=null;
async function token(){
  if(!ses)throw Object.assign(new Error("Sin sesión"),{code:"unauthenticated"});
  if(ses.expires_at-Date.now()/1000>90)return ses.access_token;
  if(!refrescando)refrescando=authPost("refresh_token",{refresh_token:ses.refresh_token})
    .then(s=>{guardarSes({...s,email:s.email||ses.email});rt.nuevoToken();return s.access_token})
    .catch(e=>{if(e.status===400||e.status===401){guardarSes(null);mostrarLogin("La sesión ha caducado. Vuelve a entrar.")}throw e})
    .finally(()=>{refrescando=null});
  return refrescando;
}
setInterval(()=>{if(ses)token().catch(()=>{})},60000);

async function api(path,opt={}){
  const t=await token();
  const r=await fetch(SB_URL+path,{...opt,headers:{apikey:SB_KEY,Authorization:"Bearer "+t,"Content-Type":"application/json",...(opt.headers||{})}});
  if(!r.ok){const tx=await r.text().catch(()=>"");throw Object.assign(new Error(tx||("HTTP "+r.status)),{code:r.status===401?"unauthenticated":"http_"+r.status})}
  const tx=await r.text();if(!tx)return null;
  const ct=r.headers.get("content-type")||"";if(ct.includes("json")){try{return JSON.parse(tx)}catch(e){return null}}return tx;
}

/* ---------------- rutas: colección/documento → tabla + id ---------------- */
function ruta(col,id){return TABLAS.includes(col)&&col!=="ajustes"?{tabla:col,id}:{tabla:"ajustes",id:col+"/"+id,pref:col+"/"}}
function colDe(col){return TABLAS.includes(col)&&col!=="ajustes"?{tabla:col}:{tabla:"ajustes",pref:col+"/"}}

/* ---------------- caché local + avisos ---------------- */
const cache={};          // tabla → Map(id → data)
const cargada={};        // tabla → Promise
const oyentes=new Set(); // {tabla,pref?,id?,cb,err,timer}
function enc(s){return encodeURIComponent(s)}
/* ---------------- lotes que se cargan al abrir la app ----------------
   Se cargan: los de subastas abiertas (o cerradas hace menos de 1 día), los nuestros (interesante, pujar, comprado,
   stock, vendido), los publicados en la web y, del histórico, solo los de grado mecánico A o B, daños 1 o 2 y con
   precio de BCA (salida o puja). El resto sigue en la base de datos: se busca o se carga desde la pestaña Histórico. */
const ESTADOS_SIEMPRE=["interesante","pujar","comprado","stock","vendido"];
const corteFin=()=>new Date(Date.now()-24*3600e3).toISOString();
const FILTRO_BUENOS='and(data->>gradoMecanico.in.(A,B),data->>danosClasif.in.(1,2),or(data->>precioSalida.not.is.null,data->>pujaActual.not.is.null))';
const filtroInicio=()=>`(estado.in.(${ESTADOS_SIEMPRE.join(",")}),publico.is.true,subasta_fin.is.null,subasta_fin.gte."${corteFin()}",${FILTRO_BUENOS})`;
function seCargaAlInicio(d){
  if(!d)return false;const fin=d.subasta&&d.subasta.fin;
  if(ESTADOS_SIEMPRE.includes(d.estado)||d.publico===true||!fin||String(fin)>=corteFin())return true;
  return["A","B"].includes(d.gradoMecanico)&&["1","2"].includes(String(d.danosClasif))&&(d.precioSalida!=null||d.pujaActual!=null);
}
async function cargarTabla(tabla){
  if(cargada[tabla])return cargada[tabla];
  cargada[tabla]=(async()=>{
    // Por páginas de 500 siguiendo el id (rápido aunque haya muchos lotes; con «offset» las últimas páginas
    // tardaban más de 8 s y Supabase las cortaba, y entonces no se veía ningún lote). Cada página se reintenta.
    const m=new Map();const N=500;let ultimo=null;
    for(;;){
      const url=`/rest/v1/${tabla}?select=id,data&order=id&limit=${N}`+(ultimo!=null?`&id=gt.${enc(ultimo)}`:"")+(tabla==="lotes"?"&or="+enc(filtroInicio()):"");
      let filas,err;
      for(let i=0;i<4;i++){try{filas=await api(url);break}catch(e){err=e;if(e.code==="unauthenticated")break;await new Promise(r=>setTimeout(r,800*(i+1)))}}
      if(!filas)throw err;
      filas.forEach(f=>m.set(f.id,f.data||{}));
      if(filas.length<N)break;
      ultimo=filas[filas.length-1].id;
    }
    cache[tabla]=m;rt.suscribir();return m;
  })().catch(e=>{delete cargada[tabla];throw e});
  return cargada[tabla];
}
function docSnap(id,data){return{id,exists:data!=null,data:()=>data==null?undefined:JSON.parse(JSON.stringify(data)),get:k=>data?data[k]:undefined}}
function colSnap(tabla,pref){
  const m=cache[tabla]||new Map();const docs=[];
  for(const[id,d]of m){if(pref){if(id.startsWith(pref))docs.push(docSnap(id.slice(pref.length),d))}else docs.push(docSnap(id,d))}
  return{docs,size:docs.length,empty:!docs.length,metadata:{fromCache:false,hasPendingWrites:false},forEach:f=>docs.forEach(f)};
}
function emitir(o){try{o.id!=null?o.cb(docSnap(o.idCorto,(cache[o.tabla]||new Map()).get(o.id))):o.cb(colSnap(o.tabla,o.pref))}catch(e){console.error(e)}}
function avisar(tabla,id){
  for(const o of oyentes){
    if(o.tabla!==tabla)continue;
    if(o.id!=null&&o.id!==id)continue;
    if(o.pref&&id!=null&&!id.startsWith(o.pref))continue;
    clearTimeout(o.timer);o.timer=setTimeout(()=>emitir(o),o.id!=null?50:400);
  }
}
function aplicar(tabla,id,data){const m=cache[tabla];if(!m)return;data==null?m.delete(id):m.set(id,data);avisar(tabla,id)}

/* ---------------- tiempo real (Phoenix / Supabase Realtime) ---------------- */
const rt=(()=>{
  let ws=null,ref=0,latido=null,activo=false,reintento=0,unido=false;
  const topic="realtime:huelsan";
  const enviar=m=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify({...m,ref:String(++ref)}))};
  async function conectar(){
    if(ws||!ses)return;
    const t=await token().catch(()=>null);if(!t)return;
    ws=new WebSocket(SB_URL.replace("https","wss")+"/realtime/v1/websocket?apikey="+enc(SB_KEY)+"&vsn=1.0.0");
    ws.onopen=()=>{reintento=0;
      enviar({topic,event:"phx_join",payload:{config:{broadcast:{self:false},presence:{key:""},postgres_changes:TABLAS.map(t=>({event:"*",schema:"public",table:t}))},access_token:t}});
      latido=setInterval(()=>enviar({topic:"phoenix",event:"heartbeat",payload:{}}),25000)};
    ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch(e){return}
      if(m.topic===topic&&m.event==="phx_reply"&&m.payload&&m.payload.status==="ok"&&!unido){unido=true;if(reintento===0&&huboCorte){huboCorte=false;recargarTodo()}}
      if(m.event==="postgres_changes"&&m.payload&&m.payload.data){const d=m.payload.data;const tabla=d.table;
        if(d.type==="DELETE"){const id=d.old_record&&d.old_record.id;if(id!=null)aplicar(tabla,id,null)}
        else if(d.record){const m=cache[tabla];if(tabla==="lotes"&&m&&!m.has(d.record.id)&&!seCargaAlInicio(d.record.data))return;aplicar(tabla,d.record.id,d.record.data||{})}}};
    ws.onclose=()=>{clearInterval(latido);ws=null;unido=false;if(!activo)return;huboCorte=true;
      reintento++;setTimeout(conectar,Math.min(30000,1000*2**Math.min(reintento,5)))};
    ws.onerror=()=>{try{ws&&ws.close()}catch(e){}};
  }
  let huboCorte=false;
  async function recargarTodo(){for(const t of Object.keys(cache)){delete cargada[t];try{await cargarTabla(t);avisar(t,null)}catch(e){}}}
  return{
    suscribir(){if(!activo){activo=true;conectar()}},
    nuevoToken(){if(ws&&ses)enviar({topic,event:"access_token",payload:{access_token:ses.access_token}})},
    cerrar(){activo=false;try{ws&&ws.close()}catch(e){}}
  };
})();
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&ses)rt.suscribir()});

/* ---------------- API tipo «db» ---------------- */
function docRef(path){
  const p=String(path).split("/");const idCorto=p.slice(1).join("/");const{tabla,id}=ruta(p[0],idCorto);
  return{
    id:idCorto,path,
    async get(){const f=await api(`/rest/v1/${tabla}?select=data&id=eq.${enc(id)}`);return docSnap(idCorto,f[0]?f[0].data:null)},
    async set(data){const d=JSON.parse(JSON.stringify(data||{}));
      await api(`/rest/v1/${tabla}?on_conflict=id`,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({id,data:d})});
      aplicar(tabla,id,d)},
    async update(patch){const p=JSON.parse(JSON.stringify(patch||{}));
      const ok=await api("/rest/v1/rpc/merge_doc",{method:"POST",body:JSON.stringify({tabla,doc_id:id,patch:p})});
      if(ok!==true)throw Object.assign(new Error("No existe el documento "+path),{code:"not-found"});
      const m=cache[tabla];if(m&&m.has(id))aplicar(tabla,id,{...m.get(id),...p})},
    async delete(){await api(`/rest/v1/${tabla}?id=eq.${enc(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});aplicar(tabla,id,null)},
    onSnapshot(cb,err){const o={tabla,id,idCorto,cb,err};oyentes.add(o);
      cargarTabla(tabla).then(()=>emitir(o)).catch(e=>{err&&err(e)});
      return()=>{clearTimeout(o.timer);oyentes.delete(o)}}
  };
}
function colRef(nombre){
  const{tabla,pref}=colDe(nombre);
  return{
    id:nombre,
    doc:id=>docRef(nombre+"/"+id),
    async get(){await cargarTabla(tabla);return colSnap(tabla,pref)},
    onSnapshot(cb,err){const o={tabla,pref,cb,err};oyentes.add(o);
      cargarTabla(tabla).then(()=>emitir(o)).catch(e=>{err&&err(e)});
      return()=>{clearTimeout(o.timer);oyentes.delete(o)}}
  };
}
const db={collection:colRef,doc:docRef};

/* ---------------- fotos y PDF ---------------- */
async function subir(bucket,blob,nombre){
  const t=await token();const tipo=blob.type||"application/octet-stream";
  const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"})[tipo]||"bin";
  const id=nombre||[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,"0")).join("")+"."+ext;
  const r=await fetch(SB_URL+"/storage/v1/object/"+bucket+"/"+encodeURIComponent(id),{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+t,"Content-Type":tipo,"x-upsert":"true","Cache-Control":"31536000"},body:blob});
  if(!r.ok)throw new Error("No se pudo subir: HTTP "+r.status);
  return{id,url:SB_URL+"/storage/v1/object/public/"+bucket+"/"+id};
}
const assets={upload:blob=>subir("fotos",blob)};
/* ---------------- estimaciones (Gemini, a través de la función «estimar» de Supabase) ---------------- */
const sample={async json(prompt,opt={}){
  const t=await token();
  let r;try{r=await fetch(SB_URL+"/functions/v1/estimar",{method:"POST",signal:opt.signal,headers:{apikey:SB_KEY,Authorization:"Bearer "+t,"Content-Type":"application/json"},
    body:JSON.stringify({prompt,calidad:opt.modelTier==="default"?"alta":"rapida"})})}
  catch(e){if(e&&e.name==="AbortError")throw Object.assign(new Error("Cancelado"),{code:"cancelled"});throw Object.assign(new Error("Sin conexión"),{code:"network"})}
  const j=await r.json().catch(()=>({}));
  if(!r.ok){const c=r.status===429?"rate_limited":r.status===401?"session_expired":j.error==="invalid_json"?"invalid_json":j.error==="sin_clave"?"sampling_disabled":"error";
    throw Object.assign(new Error(j.msg||j.error||("HTTP "+r.status)),{code:c})}
  return j.data}};
// Para páginas propias de la app (estudio de folletos, datos de empresa)
/* ---------------- histórico completo bajo demanda ---------------- */
async function contar(tabla,params){
  const t=await token();
  const r=await fetch(SB_URL+`/rest/v1/${tabla}?select=id&${params}`,{method:"HEAD",headers:{apikey:SB_KEY,Authorization:"Bearer "+t,Prefer:"count=exact",Range:"0-0","Range-Unit":"items"}});
  if(!r.ok&&r.status!==206)throw new Error("HTTP "+r.status);
  const cr=r.headers.get("content-range")||"";const n=+cr.split("/")[1];return isNaN(n)?null:n;
}
// Trae lotes que no se cargaron al abrir (o del archivo) y los añade a la app. Devuelve cuántos.
async function traerLotes(params,{tabla="lotes",max=20000}={}){
  await cargarTabla("lotes");const m=cache.lotes;let n=0,ultimo=null;const N=500;
  for(;;){
    const filas=await api(`/rest/v1/${tabla}?select=id,data&order=id&limit=${N}`+(ultimo!=null?`&id=gt.${enc(ultimo)}`:"")+(params?"&"+params:""));
    for(const f of filas){if(!m.has(f.id)){m.set(f.id,tabla==="lotes"?(f.data||{}):{...(f.data||{}),archivado:true});n++}}
    if(filas.length<N||n>=max)break;ultimo=filas[filas.length-1].id;
  }
  if(n)avisar("lotes",null);return n;
}
// Busca en todo el histórico: cada palabra debe aparecer en matrícula, bastidor, marca, modelo, versión o subasta
function filtroBusqueda(q){
  const pal=String(q||"").trim().split(/\s+/).filter(Boolean).slice(0,5).map(w=>w.replace(/[(),"*\\]/g,""));
  if(!pal.length)return "";
  const campos=["data->>matricula","data->>vin","data->>marca","data->>modelo","data->>derivado","data->subasta->>nombre"];
  return "and="+enc("("+pal.map(w=>`or(${campos.map(c=>`${c}.ilike."*${w}*"`).join(",")})`).join(",")+")");
}
// Antes de incorporar una recogida: trae de la base de datos los lotes que ya existan pero no estén cargados,
// para actualizarlos sin pisar lo que tengan anotado.
async function precargarLotes(ids){
  await cargarTabla("lotes");const m=cache.lotes;const faltan=[...new Set(ids)].filter(id=>!m.has(id));const out=new Map();
  for(let i=0;i<faltan.length;i+=80){
    const lote=faltan.slice(i,i+80);
    const filas=await api(`/rest/v1/lotes?select=id,data&id=in.(${lote.map(x=>'"'+String(x).replace(/"/g,"")+'"').join(",")})`);
    for(const f of filas){m.set(f.id,f.data||{});out.set(f.id,f.data||{})}
  }
  if(out.size)avisar("lotes",null);return out;
}
window.HUELSAN_HIST={
  noCargados:()=>listo.then(()=>contar("lotes","not.or="+enc(filtroInicio()))),
  archivados:()=>listo.then(()=>contar("lotes_archivo","").catch(()=>null)),
  buscar:(q,archivo)=>listo.then(async()=>{const f=filtroBusqueda(q);if(!f)return 0;let n=await traerLotes(f,{max:3000});
    if(archivo)n+=await traerLotes(f,{tabla:"lotes_archivo",max:3000}).catch(()=>0);return n}),
  cargarTodo:archivo=>listo.then(async()=>{let n=await traerLotes("");if(archivo)n+=await traerLotes("",{tabla:"lotes_archivo"}).catch(()=>0);return n}),
  aligerar:()=>listo.then(()=>api("/rest/v1/rpc/aligerar_historico",{method:"POST",body:"{}"})),
  precargar:ids=>listo.then(()=>precargarLotes(ids)),
};
window.HUELSAN={rest:(path,opt)=>listo.then(()=>api(path,opt)),subir:(bucket,blob,nombre)=>listo.then(()=>subir(bucket,blob,nombre)),SB_URL,FOTOS_WEB:SB_URL+"/storage/v1/object/public/fotos-web/"};

/* ---------------- window.claude de reemplazo ---------------- */
const noDisp=n=>Promise.reject(Object.assign(new Error(n+" no disponible en la web"),{code:"capability_disabled"}));
window.claude={use(n){
  if(n==="db")return listo.then(()=>db);
  if(n==="assets")return listo.then(()=>assets);
  if(n==="user")return listo.then(()=>({email:ses&&ses.email}));
  if(n==="sample")return listo.then(()=>sample);
  return noDisp(n);   // «mcp» no existe en la web: las recogidas van por la extensión
}};

/* ---------------- pantalla de acceso ---------------- */
let resolverListo;const listo=new Promise(r=>resolverListo=r);
function cssLogin(){if(document.getElementById("login-css"))return;const st=document.createElement("style");st.id="login-css";st.textContent=`#login-ov{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:var(--bg,#f6f5f2);padding:16px}
#login-f{width:100%;max-width:340px;display:grid;gap:12px;background:var(--panel,#fff);color:var(--ink,#1a1a1a);border:1px solid var(--line,#ddd);border-radius:12px;padding:24px;font:15px system-ui,sans-serif}
#login-f h1{font-size:20px;margin:0 0 4px}.lg-marca{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
#login-f label{display:grid;gap:4px;font-size:13px}#login-f input{font:inherit;padding:10px;border:1px solid var(--line,#ccc);border-radius:8px;background:transparent;color:inherit}
#login-f button{font:inherit;font-weight:600;padding:11px;border:0;border-radius:8px;background:var(--accent,#1f4e79);color:#fff;cursor:pointer}#login-f button:disabled{opacity:.6}
#login-m{margin:0;min-height:1.2em;font-size:13px;color:#b42318}#login-m.ok{color:#067647}
#login-f .lg-chk{display:flex;gap:8px;align-items:center;font-size:13px}#login-f .lg-chk input{width:auto;padding:0}
#login-f .lg-link{background:none;color:inherit;font-weight:500;text-decoration:underline;padding:0;font-size:13px;justify-self:start}`;document.head.appendChild(st)}
function mostrarLogin(msg){
  let ov=document.getElementById("login-ov");
  if(!ov){ov=document.createElement("div");ov.id="login-ov";
    ov.innerHTML=`<form id="login-f" autocomplete="on"><div class="lg-marca">Huelsan Automoción</div><h1>Acceso del equipo</h1>
      <label>Correo<input id="login-e" type="email" autocomplete="username" required></label>
      <label>Contraseña<input id="login-p" type="password" autocomplete="current-password" required></label>
      <label class="lg-chk"><input id="login-r" type="checkbox"> Mantener la sesión iniciada en este equipo</label>
      <button type="submit" id="login-b">Entrar</button>
      <button type="button" id="login-o" class="lg-link">¿Has olvidado la contraseña?</button>
      <p id="login-m" role="status"></p></form>`;
    cssLogin();document.body.appendChild(ov);
    ov.querySelector("#login-r").checked=recordar();
    ov.querySelector("#login-o").addEventListener("click",async()=>{
      const m=ov.querySelector("#login-m"),email=ov.querySelector("#login-e").value.trim();m.className="";
      if(!email){m.textContent="Escribe tu correo y vuelve a pulsar.";ov.querySelector("#login-e").focus();return}
      try{const r=await fetch(SB_URL+"/auth/v1/recover",{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({email})});
        if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.msg||j.message||j.error_description||("HTTP "+r.status))}
        m.className="ok";m.textContent="Si el correo está dado de alta, te llegará un enlace para crear una contraseña nueva (mira también en spam)."}
      catch(err){m.textContent="No se ha podido enviar: "+err.message}});
    ov.querySelector("#login-f").addEventListener("submit",async e=>{e.preventDefault();
      try{localStorage.setItem("huelsan-recordar",ov.querySelector("#login-r").checked?"1":"0")}catch(err){}
      const b=ov.querySelector("#login-b"),m=ov.querySelector("#login-m");b.disabled=true;m.textContent="";
      try{const s=await authPost("password",{email:ov.querySelector("#login-e").value.trim(),password:ov.querySelector("#login-p").value});
        guardarSes(s);ov.querySelector("#login-p").value="";ov.remove();resolverListo()}
      catch(err){m.textContent=err.status===400?"Correo o contraseña incorrectos.":"No se ha podido entrar: "+err.message}
      finally{b.disabled=false}});
  }
  ov.querySelector("#login-m").textContent=msg||"";
  setTimeout(()=>{const e=ov.querySelector(ses&&ses.email?"#login-p":"#login-e");e&&e.focus()},0);
}
window.HUELSAN_SALIR=()=>{const s=ses;guardarSes(null);rt.cerrar();
  if(s)fetch(SB_URL+"/auth/v1/logout",{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+s.access_token}}).catch(()=>{});
  location.reload()};
function nuevaClave(h){
  history.replaceState(null,"",location.pathname);
  const ov=document.createElement("div");ov.id="login-ov";
  ov.innerHTML=`<form id="login-f"><div class="lg-marca">Huelsan Automoción</div><h1>Contraseña nueva</h1>
    <label>Contraseña nueva (mínimo 8 caracteres)<input id="nc-1" type="password" autocomplete="new-password" minlength="8" required></label>
    <label>Repítela<input id="nc-2" type="password" autocomplete="new-password" minlength="8" required></label>
    <button type="submit" id="login-b">Guardar y entrar</button><p id="login-m" role="status"></p></form>`;
  cssLogin();document.body.appendChild(ov);setTimeout(()=>ov.querySelector("#nc-1").focus(),0);
  ov.querySelector("form").addEventListener("submit",async e=>{e.preventDefault();const m=ov.querySelector("#login-m"),a=ov.querySelector("#nc-1").value,b=ov.querySelector("#nc-2").value;
    if(a!==b){m.textContent="Las dos contraseñas no coinciden.";return}
    try{const r=await fetch(SB_URL+"/auth/v1/user",{method:"PUT",headers:{apikey:SB_KEY,Authorization:"Bearer "+h.get("access_token"),"Content-Type":"application/json"},body:JSON.stringify({password:a})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.msg||j.message||j.error_description||("HTTP "+r.status));
      guardarSes({access_token:h.get("access_token"),refresh_token:h.get("refresh_token"),expires_at:+h.get("expires_at")||Math.floor(Date.now()/1000)+(+h.get("expires_in")||3600),email:j.email});
      ov.remove();resolverListo()}
    catch(err){m.textContent="No se ha podido cambiar: "+err.message}});
}
function arrancar(){
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.get("type")==="recovery"&&h.get("access_token")){nuevaClave(h);return}
  if(h.get("error_description")){history.replaceState(null,"",location.pathname);mostrarLogin("El enlace no es válido o ha caducado: "+h.get("error_description").replace(/\+/g," "));return}
  if(ses)token().then(()=>resolverListo()).catch(()=>{ses?resolverListo():mostrarLogin()});
  else mostrarLogin();
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",arrancar):arrancar();
/* App instalable en el móvil (PWA): copia de seguridad sin conexión y botón «Instalar app» cuando el navegador lo permite */
if("serviceWorker" in navigator&&location.protocol==="https:")addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
let avisoInstalar=null;
addEventListener("beforeinstallprompt",e=>{e.preventDefault();avisoInstalar=e;document.querySelectorAll("[data-instalar]").forEach(b=>b.hidden=false)});
addEventListener("appinstalled",()=>{avisoInstalar=null;document.querySelectorAll("[data-instalar]").forEach(b=>b.hidden=true)});
document.addEventListener("click",e=>{document.querySelectorAll("details.hmenu[open]").forEach(d=>{if(!d.contains(e.target)||e.target.closest("nav a"))d.open=false})});
window.HUELSAN_INSTALAR=async()=>{if(!avisoInstalar)return;avisoInstalar.prompt();await avisoInstalar.userChoice.catch(()=>{});avisoInstalar=null;document.querySelectorAll("[data-instalar]").forEach(b=>b.hidden=true)};
})();
