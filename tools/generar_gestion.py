"""Genera gestion/index.html a partir de la app del artifact (Huelsan Lotes).
Uso: python3 tools/generar_gestion.py ruta/al/index.html-del-artifact
Cambios: carga el adaptador de Supabase, fotos desde Supabase Storage, botón «Salir»
y mensajes de recogida/estimación adaptados a la web."""
import sys, re, pathlib
src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
out = pathlib.Path(__file__).resolve().parent.parent / "gestion" / "index.html"
s = src
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
# la recogida desde la web llegará con la extensión del navegador
rep('return({not_granted:', 'if(c==="capability_disabled")return"Desde la web todavía no se pueden lanzar recogidas: de momento se siguen haciendo con Claude. Pronto: extensión del navegador para lanzarlas desde aquí.";\n  return({not_granted:')
out.write_text(s, encoding="utf-8")
print("ok", out, len(s))
