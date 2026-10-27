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
let ses=null;try{ses=JSON.parse(localStorage.getItem(SES_KEY)||"null")}catch(e){}
const guardarSes=s=>{ses=s;try{s?localStorage.setItem(SES_KEY,JSON.stringify(s)):localStorage.removeItem(SES_KEY)}catch(e){}};
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
async function cargarTabla(tabla){
  if(cargada[tabla])return cargada[tabla];
  cargada[tabla]=(async()=>{
    const m=new Map();const N=1000;
    for(let desde=0;;desde+=N){
      const filas=await api(`/rest/v1/${tabla}?select=id,data&order=id`,{headers:{Range:`${desde}-${desde+N-1}`,"Range-Unit":"items"}});
      filas.forEach(f=>m.set(f.id,f.data||{}));
      if(filas.length<N)break;
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
        else if(d.record){aplicar(tabla,d.record.id,d.record.data||{})}}};
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
const assets={
  async upload(blob){
    const t=await token();const tipo=blob.type||"application/octet-stream";
    const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"})[tipo]||"bin";
    const id=[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,"0")).join("")+"."+ext;
    const r=await fetch(SB_URL+"/storage/v1/object/fotos/"+id,{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+t,"Content-Type":tipo,"x-upsert":"false","Cache-Control":"31536000"},body:blob});
    if(!r.ok)throw new Error("No se pudo subir: HTTP "+r.status);
    return{id,url:window.HUELSAN_BLOB+id};
  }
};

/* ---------------- window.claude de reemplazo ---------------- */
const noDisp=n=>Promise.reject(Object.assign(new Error(n+" no disponible en la web"),{code:"capability_disabled"}));
window.claude={use(n){
  if(n==="db")return listo.then(()=>db);
  if(n==="assets")return listo.then(()=>assets);
  if(n==="user")return listo.then(()=>({email:ses&&ses.email}));
  return noDisp(n);   // «sample» (estimaciones) y «mcp» (recogidas) llegarán en la siguiente fase
}};

/* ---------------- pantalla de acceso ---------------- */
let resolverListo;const listo=new Promise(r=>resolverListo=r);
function mostrarLogin(msg){
  let ov=document.getElementById("login-ov");
  if(!ov){ov=document.createElement("div");ov.id="login-ov";
    ov.innerHTML=`<form id="login-f" autocomplete="on"><div class="lg-marca">Huelsan Automoción</div><h1>Acceso del equipo</h1>
      <label>Correo<input id="login-e" type="email" autocomplete="username" required></label>
      <label>Contraseña<input id="login-p" type="password" autocomplete="current-password" required></label>
      <button type="submit" id="login-b">Entrar</button><p id="login-m" role="status"></p></form>`;
    const st=document.createElement("style");st.textContent=`#login-ov{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:var(--bg,#f6f5f2);padding:16px}
#login-f{width:100%;max-width:340px;display:grid;gap:12px;background:var(--panel,#fff);color:var(--ink,#1a1a1a);border:1px solid var(--line,#ddd);border-radius:12px;padding:24px;font:15px system-ui,sans-serif}
#login-f h1{font-size:20px;margin:0 0 4px}.lg-marca{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
#login-f label{display:grid;gap:4px;font-size:13px}#login-f input{font:inherit;padding:10px;border:1px solid var(--line,#ccc);border-radius:8px;background:transparent;color:inherit}
#login-f button{font:inherit;font-weight:600;padding:11px;border:0;border-radius:8px;background:var(--accent,#1f4e79);color:#fff;cursor:pointer}#login-f button:disabled{opacity:.6}
#login-m{margin:0;min-height:1.2em;font-size:13px;color:#b42318}`;
    document.head.appendChild(st);document.body.appendChild(ov);
    ov.querySelector("#login-f").addEventListener("submit",async e=>{e.preventDefault();
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
function arrancar(){
  if(ses)token().then(()=>resolverListo()).catch(()=>{ses?resolverListo():mostrarLogin()});
  else mostrarLogin();
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",arrancar):arrancar();
})();
