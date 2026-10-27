#!/usr/bin/env python3
"""Genera gestion/textos/catalogo.json con todos los textos editables de la web pública.

Lee publica/index.html y recoge:
  - elementos con data-t="clave"   (texto por defecto = su contenido)
  - placeholders con data-t-ph="clave"
  - llamadas T("clave","texto por defecto") del código
Ejecutar cada vez que se cambie la web pública:  python3 tools/catalogo_textos.py
"""
import html, json, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(RAIZ, "publica/index.html"), encoding="utf-8").read()

SECCIONES = [
    ("seo", "Buscadores y pestaña del navegador"),
    ("menu", "Menú superior"),
    ("portada", "Portada"),
    ("estado", "Etiquetas de disponibilidad"),
    ("coches", "Listado de coches"),
    ("filtros", "Filtros del listado"),
    ("ficha", "Ficha de cada coche"),
    ("que", "Qué hacemos"),
    ("quienes", "Quiénes somos"),
    ("contacto", "Contacto"),
    ("pie", "Pie de página"),
]
# Textos que ya vivían en «Datos de empresa» (se guardan como campos propios)
PROPIOS = {
    "@titular": ("portada", "Titular (la primera frase en blanco y la segunda en dorado)", "Buscamos en Europa. Respondemos aquí."),
    "@subtitulo": ("portada", "Texto bajo el titular", None),
    "@quienesTitulo": ("quienes", "Título", "Huelsan Automoción"),
    "@quienesTexto": ("quienes", "Texto (un párrafo por línea; [Nombre de la empresa] se sustituye solo)", None),
}
EXTRA = {
    "seo.titulo": ("Título de la pestaña y de Google", None),
    "seo.descripcion": ("Descripción en Google", None),
}
AYUDA = {
    "quienes.zona": "{zonas} se sustituye por las zonas de los contactos",
    "contacto.boton.whatsappzona": "cuando hay varios WhatsApp; {zona} es la zona de cada contacto",
    "contacto.form.rgpd": "lo que va entre llaves { } es el enlace a la política de privacidad",
    "estado.stock": "también en los filtros, las fichas y la portada",
}


def limpio(frag):
    frag = re.sub(r"<a\b[^>]*>(.*?)</a>", r"{\1}", frag, flags=re.S)
    frag = re.sub(r"<[^>]+>", "", frag)
    return re.sub(r"\s+", " ", html.unescape(frag)).strip()


ETIQ = {
    "menu.coches": "Enlace «Coches»", "menu.que": "Enlace «Qué hacemos»", "menu.quienes": "Enlace «Quiénes somos»", "menu.contacto": "Enlace «Contacto»",
    "portada.antetitulo": "Antetítulo (letras pequeñas sobre el titular)", "portada.boton1": "Botón principal", "portada.boton2": "Botón secundario",
    "portada.dato.stock": "Dato 1: texto junto al número de coches en stock", "portada.dato.encargo": "Dato 2: texto junto al número de coches por encargo",
    "portada.dato3.titulo": "Dato 3: título", "portada.dato3.texto": "Dato 3: texto",
    "estado.stock": "Coches en stock", "estado.encargo": "Coches por encargo",
    "coches.antetitulo": "Antetítulo", "coches.titulo": "Título", "coches.intro": "Introducción", "coches.consultar": "Coche sin precio",
    "coches.vacio.titulo": "Sin coches publicados: título", "coches.vacio.texto": "Sin coches publicados: texto",
    "coches.sinresultados.titulo": "Filtros sin resultados: título", "coches.sinresultados.texto": "Filtros sin resultados: texto",
    "filtros.disponibilidad": "Filtro de disponibilidad", "filtros.tipo": "Filtro de tipo", "filtros.combustible": "Filtro de combustible",
    "filtros.anio": "Filtro de año", "filtros.todos": "Opción «todos»", "filtros.cualquiera": "Opción «cualquier año»",
    "ficha.aviso.fotos": "Aviso bajo las fotos", "ficha.mas.info": "Enlace «más información»", "ficha.sinfotos": "Coche sin fotos",
    "ficha.encargo": "Aviso en coches por encargo", "ficha.boton": "Botón de interés",
    "que.antetitulo": "Antetítulo", "que.titulo": "Título",
    "quienes.antetitulo": "Antetítulo", "quienes.zona": "Frase de zonas",
    "contacto.antetitulo": "Antetítulo", "contacto.titulo": "Título", "contacto.form.titulo": "Título del formulario",
    "contacto.form.nombre": "Campo nombre", "contacto.form.telefono": "Campo teléfono", "contacto.form.tipo": "Campo tipo de coche",
    "contacto.form.tipo.igual": "Opción «me da igual»", "contacto.form.presupuesto": "Campo presupuesto", "contacto.form.mensaje": "Campo mensaje",
    "contacto.form.ejemplo": "Ejemplo dentro del campo mensaje", "contacto.form.rgpd": "Casilla de privacidad", "contacto.form.nota": "Nota bajo el formulario",
    "contacto.etiqueta.telefono": "Etiqueta de teléfono", "contacto.etiqueta.correo": "Etiqueta de correo",
    "contacto.boton.whatsapp": "Botón WhatsApp (un solo contacto)", "contacto.boton.whatsappzona": "Botón WhatsApp (varios contactos)",
    "contacto.boton.correo": "Botón correo", "contacto.boton.copiar": "Botón copiar",
    "pie.aviso": "Enlace aviso legal", "pie.privacidad": "Enlace privacidad", "pie.cookies": "Enlace cookies", "pie.fotos": "Enlace fotos e información",
}
for i in range(1, 4):
    ETIQ[f"que.servicio{i}.titulo"], ETIQ[f"que.servicio{i}.texto"] = f"Servicio {i}: título", f"Servicio {i}: texto"
for i in range(1, 5):
    ETIQ[f"que.paso{i}.titulo"], ETIQ[f"que.paso{i}.texto"] = f"Paso {i}: título", f"Paso {i}: texto"
    ETIQ[f"quienes.valor{i}.titulo"], ETIQ[f"quienes.valor{i}.texto"] = f"Valor {i}: título", f"Valor {i}: texto"


def etiqueta(clave):
    return ETIQ.get(clave) or clave


items = {}
for m in re.finditer(r'<(\w+)([^>]*?)\sdata-t="([^"]+)"([^>]*)>(.*?)</\1>', src, flags=re.S):
    clave = m.group(3)
    items.setdefault(clave, limpio(m.group(5)))
for m in re.finditer(r'data-t-ph="([^"]+)"\s+placeholder="([^"]*)"', src):
    items.setdefault(m.group(1), html.unescape(m.group(2)))
for m in re.finditer(r'\bT\("([^"]+)",\s*"((?:[^"\\]|\\.)*)"\)', src):
    items.setdefault(m.group(1), m.group(2).replace('\\"', '"'))
t = re.search(r"<title>(.*?)</title>", src).group(1)
d = re.search(r'<meta name="description" content="([^"]*)"', src).group(1)
items["seo.titulo"], items["seo.descripcion"] = html.unescape(t), html.unescape(d)
sub = re.search(r'<p id="h-sub">(.*?)</p>', src, flags=re.S)
qt = re.search(r'<div id="q-txt">(.*?)</div>', src, flags=re.S)

salida = []
for pref, nombre in SECCIONES:
    campos = []
    for k, (sec, lab, dflt) in PROPIOS.items():
        if sec != pref:
            continue
        if k == "@subtitulo":
            dflt = limpio(sub.group(1))
        if k == "@quienesTexto":
            dflt = "\n".join(limpio(p) for p in re.findall(r"<p>(.*?)</p>", qt.group(1), flags=re.S))
        campos.append({"clave": k, "etiqueta": lab, "defecto": dflt, "largo": True})
    for k, v in items.items():
        if k.split(".")[0] != pref:
            continue
        c = {"clave": k, "etiqueta": EXTRA.get(k, (etiqueta(k),))[0], "defecto": v, "largo": len(v) > 70}
        if k in AYUDA:
            c["ayuda"] = AYUDA[k]
        campos.append(c)
    if campos:
        salida.append({"seccion": nombre, "ancla": pref, "campos": campos})

usadas = {c["clave"] for s in salida for c in s["campos"]}
sobran = set(items) - usadas
assert not sobran, f"claves sin sección: {sobran}"
os.makedirs(os.path.join(RAIZ, "gestion/textos"), exist_ok=True)
json.dump(salida, open(os.path.join(RAIZ, "gestion/textos/catalogo.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(usadas)} textos en {len(salida)} secciones")
