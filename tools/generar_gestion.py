"""Genera gestion/index.html a partir de la app del artifact (Huelsan Lotes).
Uso: python3 tools/generar_gestion.py ruta/al/index.html-del-artifact
Cambios: carga el adaptador de Supabase, fotos desde Supabase Storage, botón «Salir»
y mensajes de recogida/estimación adaptados a la web."""
import sys, re, pathlib
src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
out = pathlib.Path(__file__).resolve().parent.parent / "gestion" / "index.html"
s = src
def s_count(x): return s.count(x)
def s_replace(a,b):
    global s
    s = s.replace(a,b)
def rep(old, new, count=1):
    global s
    assert old in s, "no encontrado: " + old[:80]
    s = s.replace(old, new, count)
rep("<title>Huelsan Lotes</title>", '<title>Huelsan · Gestión</title>\n<meta name="robots" content="noindex,nofollow">\n<link rel="icon" href="favicon.svg">\n<script src="adaptador.js"></script>')
# fotos y PDF: /_blob/ID → URL pública del almacén
n = s.count('"/_blob/${'); s = s.replace('"/_blob/${', '"${BLOB}${')
assert n == 7, n
rep('"/_blob/"+id', 'BLOB+id')
assert "_blob" not in s
rep("<script>\n", '<script>\nconst BLOB=window.HUELSAN_BLOB||"/_blob/";\n', 1)
# botón salir junto al estado
rep('<div class="status" id="status">Conectando…</div>',
    '<div class="status" id="status">Conectando…</div><button type="button" class="btn" id="salir" style="margin-left:8px" onclick="HUELSAN_SALIR()">Salir</button>')
# enlace a la web pública
s = s.replace("https://claude.ai/artifact/KfiJ9cEvT8971YQqNibYTr", "https://huelsanautomocion.com")
# recogidas: la web habla con la extensión «Huelsan · Recogida BCA» (Chrome/Edge)
rep('return({not_granted:', 'if(c==="no_ext")return"Para lanzar recogidas desde la web instala en este ordenador la extensión «Huelsan · Recogida BCA» (Chrome o Edge) y entra en ella con tu usuario.";\n  if(c==="ext")return e.message||"La extensión no ha podido lanzar la recogida.";\n  return({not_granted:')
rep('async function fireTrigger(id){return S.mcp.callTool("Claude Code Remote","fire_trigger",{trigger_id:id})}',
    'const hayExt=()=>!!document.documentElement.dataset.huelsanExt;\n'
    'function extPedir(tipo){return new Promise((res,rej)=>{const id=Math.random().toString(36).slice(2);'
    'const fin=()=>{window.removeEventListener("message",h);clearTimeout(t)};'
    'const h=e=>{if(e.source===window&&e.data&&e.data.respuesta&&e.data.id===id){fin();e.data.ok?res(e.data):rej(Object.assign(new Error(e.data.msg||"Error"),{code:"ext"}))}};'
    'const t=setTimeout(()=>{fin();rej(Object.assign(new Error("La extensión no responde. Recarga la página."),{code:"ext"}))},20000);'
    'window.addEventListener("message",h);window.postMessage({huelsanExt:tipo,id},location.origin)})}\n'
    'async function fireTrigger(id){if(hayExt())return extPedir(id===LOGIN_TRIGGER?"abrir-bca":"recoger");if(S.mcp)return S.mcp.callTool("Claude Code Remote","fire_trigger",{trigger_id:id});throw Object.assign(new Error(""),{code:"no_ext"})}')
assert s_count('if(!S.mcp){REC.msg=recErr({code:"capability_disabled"});')==2
s_replace('if(!S.mcp){REC.msg=recErr({code:"capability_disabled"});','if(!S.mcp&&!hayExt()){REC.msg=recErr({code:"no_ext"});')
rep('mensaje:"Esperando a que Claude empiece…"', 'mensaje:"Abriendo BCA…"')
rep('REC.msg="En menos de un minuto se abrirá BCA en el navegador integrado de la app de escritorio de Claude, en el ordenador. Inicia sesión ahí con tu usuario: la app detecta sola cuándo estás dentro (durante unos 8 minutos).";',
    'REC.msg="Se ha abierto BCA en una ventana nueva: inicia sesión ahí con tu usuario.";')
rep('REC.msg="Recogida lanzada. Puedes cerrar la app: al terminar te llegará un aviso.";',
    'REC.msg="Recogida lanzada en una ventana de BCA. Si no tienes la sesión iniciada, entra en esa ventana y empezará sola. Tarda 15–25 min: no cierres esa ventana; puedes cerrar esta página.";')
rep('Los dos botones funcionan desde cualquier sitio (web, móvil u ordenador): el trabajo se hace en el ordenador de la oficina, que debe estar encendido con la app de escritorio de Claude abierta. «Abrir BCA» abre BCA en el navegador integrado de esa app para que inicies sesión allí; después, «Lanzar recogida» (15–25 min). Si la sesión ha caducado, la recogida se detiene sin cargar nada y te avisa.',
    'Funciona en el ordenador donde esté instalada la extensión «Huelsan · Recogida BCA» (Chrome o Edge). «Lanzar recogida» abre BCA en una ventana: si no tienes la sesión iniciada, entra ahí y la recogida empieza sola (15–25 min). Los lotes aparecen aquí al terminar. En la extensión puedes activar una recogida automática diaria.')

out.write_text(s, encoding="utf-8")
print("ok", out, len(s))
