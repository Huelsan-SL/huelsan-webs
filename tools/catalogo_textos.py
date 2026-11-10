#!/usr/bin/env python3
"""Genera gestion/textos/catalogo.json con todos los textos editables de la web pública.

Lee publica/index.html y recoge:
  - elementos con data-t="clave"   (texto por defecto = su contenido)
  - placeholders con data-t-ph="clave"
  - llamadas T("clave","texto por defecto") del código
  - las opciones del formulario (bloque OPC)
Ejecutar cada vez que se cambie la web pública:  python3 tools/catalogo_textos.py
"""
import html, json, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(RAIZ, "publica/index.html"), encoding="utf-8").read()

SECCIONES = [
    ("seo", "Buscadores y pestaña del navegador"),
    ("menu", "Cabecera y menú"),
    ("inicio", "Portada"),
    ("encargo", "Búsqueda por encargo"),
    ("proceso", "Cómo funciona"),
    ("dif", "Nuestra diferencia"),
    ("stock", "Vehículos en stock"),
    ("estado", "Etiquetas de disponibilidad"),
    ("filtros", "Filtros del listado"),
    ("coches", "Listado de coches"),
    ("ficha", "Ficha de cada coche"),
    ("quienes", "Quiénes somos"),
    ("form", "Formulario «¿Qué coche estás buscando?»"),
    ("zona", "Área de servicio y contacto"),
    ("whatsapp", "WhatsApp"),
    ("redes", "Redes sociales (el bloque solo aparece si hay alguna en Datos de empresa)"),
    ("opiniones", "Opiniones (el bloque solo aparece cuando hay opiniones)"),
    ("faq", "Preguntas frecuentes"),
    ("final", "Llamada final"),
    ("pie", "Pie de página"),
]
EXTRA = {"seo.titulo": "Título de la pestaña y de Google", "seo.descripcion": "Descripción en Google"}
AYUDA = {
    "inicio.zonas": "{zonas} se sustituye por las zonas de trabajo",
    "quienes.zona": "{zonas} se sustituye por las zonas de trabajo",
    "form.rgpd": "lo que va entre llaves { } es el enlace a la política de privacidad",
    "estado.stock": "también en los filtros y las fichas",
    "zona.intro": "{zonas} se sustituye por las zonas de trabajo",
    "zona.lista": "separadas por comas y «y»; salen en la portada, Quiénes somos, Área de servicio y el pie",
}
ETIQ = {
    "menu.whatsapp": "Botón WhatsApp", "inicio.titular": "Titular", "encargo.lista.nota": "Frase bajo la lista", "zona.intro": "Introducción", "zona.lista": "Zonas de trabajo", "form.elegir": "Texto inicial de los desplegables", "menu.boton": "Botón de la cabecera", "inicio.texto": "Texto bajo el titular", "inicio.zonas": "Frase de zonas",
    "inicio.boton1": "Botón principal", "inicio.boton2": "Botón secundario",
    "encargo.p4": "Frase destacada", "encargo.lista.titulo": "Título de la lista",
    "stock.aviso": "Aviso bajo el listado", "quienes.lema": "Frase final", "quienes.zona": "Frase de zonas",
    "quienes.servicio.antetitulo": "Recuadro: antetítulo", "quienes.servicio.titulo": "Recuadro: título",
    "form.p2.ejemplo": "Ejemplo dentro del campo 2", "form.p6.ejemplo": "Ejemplo dentro del campo 6", "form.p8.ejemplo": "Ejemplo dentro del campo 8",
    "form.rgpd": "Casilla de privacidad", "form.nota": "Texto bajo el botón", "form.ok": "Mensaje al enviar",
    "form.alternativa": "Texto tras un error de envío", "form.interes": "Nota al pulsar «Me interesa» en un coche",
    "zona.correo": "Frase antes del correo", "zona.atencion": "Ciudad sin contacto asignado", "zona.europa": "Recuadro Europa",
    "whatsapp.saludo": "Mensaje que se escribe al abrir WhatsApp", "whatsapp.sin": "Menú sin WhatsApp configurado",
    "coches.consultar": "Coche sin precio", "coches.fotos": "Palabra «fotos» en la tarjeta",
    "estado.stock": "Coches en stock", "estado.encargo": "Coches por encargo",
    "ficha.aviso.fotos": "Aviso bajo las fotos", "ficha.mas.info": "Enlace «más información»", "ficha.sinfotos": "Coche sin fotos",
    "ficha.encargo": "Aviso en coches por encargo", "ficha.boton": "Botón de interés",
    "filtros.todos": "Opción «todos»", "filtros.cualquiera": "Opción «cualquier año»",
    "final.lema": "Frase final", "pie.texto1": "Texto 1", "pie.texto2": "Texto 2", "pie.stock": "Enlace «Coches en stock»",
    "pie.enlaces": "Título «Enlaces»", "pie.legal": "Título «Legal»",
    # formulario (10/11/2026: todas las preguntas obligatorias)
    "form.obligatorio": "Aviso «todas las preguntas son obligatorias»",
    "form.p1": "Pregunta 1 (tipo)", "form.p2m": "Pregunta 2 (marca)", "form.p3m": "Pregunta 3 (modelo)", "form.p3": "Pregunta 4 (presupuesto)",
    "form.pkm": "Pregunta 5 (kilometraje)", "form.panio": "Pregunta 6 (antigüedad)", "form.p4": "Pregunta 7 (combustible)", "form.p5": "Pregunta 8 (cambio)",
    "form.pcv": "Pregunta 9 (potencia)", "form.pcil": "Pregunta 10 (cilindrada)", "form.p7": "Pregunta 11 (plazo)", "form.p8": "Pregunta 12 (residencia)",
    "form.p6": "Pregunta 13 (características)", "form.p9": "Pregunta 14 (contacto)", "form.email2": "Campo correo",
    "form.p2m.ejemplo": "Ejemplo dentro de la pregunta 2", "form.p3m.ejemplo": "Ejemplo dentro de la pregunta 3", "form.p6b.ejemplo": "Ejemplo dentro de la pregunta 13",
    "opiniones.ver": "Opiniones: botón «Ver valoración completa»", "opiniones.verificado": "Opiniones: sello «Cliente verificado»",
    "opiniones.atencion": "Opiniones: atención y trato", "opiniones.coche": "Opiniones: estado del coche", "opiniones.rapidez": "Opiniones: rapidez",
    "opiniones.tramites": "Opiniones: papeleo y entrega", "opiniones.precio": "Opiniones: precio",
    "opiniones.rec.si": "Opiniones: «Nos recomendaría»", "opiniones.rec.quizas": "Opiniones: «Probablemente nos recomendaría»", "opiniones.rec.no": "Opiniones: «No nos recomendaría»",
    "estado.vendido": "Etiqueta «Vendido»", "coches.vendido": "Texto en lugar del precio de un vendido", "coches.antes": "Lectura del precio tachado («Antes»)",
    "coches.rebajado": "Etiqueta «Precio rebajado»", "ficha.ahorro": "Ahorro en la ficha ({v} = importe)", "ficha.vendido": "Aviso en la ficha de un vendido",
    "ficha.boton.vendido": "Botón de la ficha de un vendido", "filtros.vendidos": "Opción «Vendidos» del filtro",
    "ficha.compartir": "Botón «Compartir este coche»", "ficha.copiado": "Aviso «enlace copiado»",
}
PREG_FORM = {"tipo": "1 (tipo)", "pres": "4 (presupuesto)", "km": "5 (kilometraje)", "antig": "6 (antigüedad)", "comb": "7 (combustible)", "cambio": "8 (cambio)", "pot": "9 (potencia)", "cil": "10 (cilindrada)", "plazo": "11 (plazo)"}
PALABRA = {"antetitulo": "Antetítulo", "titulo": "Título", "intro": "Introducción", "texto": "Texto", "boton": "Botón",
           "boton1": "Botón 1", "boton2": "Botón 2", "nombre": "Campo nombre", "telefono": "Campo teléfono", "email": "Campo correo"}


def etiqueta(k, v=""):
    if k in EXTRA:
        return EXTRA[k]
    if k in ETIQ:
        return ETIQ[k]
    p = k.split(".")
    ult = p[-1]
    if m := re.fullmatch(r"form\.op\.(\w+)\.(\d+)", k):
        return f"Pregunta {PREG_FORM.get(m.group(1), m.group(1))}: opción {m.group(2)}"
    if m := re.fullmatch(r"form\.error\.(\w+)", k):
        return f"Aviso de error ({ {'nombre': 'nombre', 'telefono': 'teléfono', 'email': 'correo', 'rgpd': 'privacidad', 'envio': 'envío'}.get(m.group(1), m.group(1)) })"
    if m := re.fullmatch(r"form\.(p\d)", k):
        return f"Pregunta {m.group(1)[1:]}"
    if m := re.fullmatch(r"form\.punto(\d)", k):
        return f"Punto {m.group(1)} junto al formulario"
    if m := re.fullmatch(r"faq\.(\d)\.([pr])", k):
        return f"{'Pregunta' if m.group(2) == 'p' else 'Respuesta'} {m.group(1)}"
    if m := re.fullmatch(r"dif\.(\d)\.(titulo|texto)", k):
        return f"Ventaja {m.group(1)}: {m.group(2).replace('titulo', 'título')}"
    if m := re.fullmatch(r"proceso\.paso(\d)\.(titulo|texto)", k):
        return f"Paso {m.group(1)}: {m.group(2).replace('titulo', 'título')}"
    if m := re.fullmatch(r"proceso\.paso(\d)", k):
        return f"Infografía: paso {m.group(1)}"
    if k == "proceso.financiacion":
        return "Nota de financiación bajo la infografía"
    if m := re.fullmatch(r"inicio\.titular(\d)", k):
        return f"Titular, línea {m.group(1)}"
    if m := re.fullmatch(r"inicio\.sello(\d)", k):
        return f"Sello {m.group(1)} bajo los botones"
    if m := re.fullmatch(r"encargo\.lista(\d)", k):
        return f"Lista: elemento {m.group(1)}"
    if m := re.fullmatch(r"\w+\.p(\d)", k):
        return f"Párrafo {m.group(1)}"
    if m := re.fullmatch(r"quienes\.valor(\d)", k):
        return f"Recuadro de valores {m.group(1)}"
    if p[0] == "menu":
        return f"Enlace del menú «{v}»"
    if p[0] == "filtros":
        return f"Filtro «{v}»"
    if p[0] == "pie" and len(p) == 2:
        return f"Enlace «{v}»"
    if ".vacio." in k or ".sinresultados." in k:
        return ("Sin coches publicados" if ".vacio." in k else "Filtros sin resultados") + ": " + ult.replace("titulo", "título")
    return PALABRA.get(ult, k)


def limpio(frag):
    frag = re.sub(r"<a\b[^>]*>(.*?)</a>", r"{\1}", frag, flags=re.S)
    frag = re.sub(r"<[^>]+>", "", frag)
    return re.sub(r"\s+", " ", html.unescape(frag)).strip()


items = {}
for m in re.finditer(r'<(\w+)([^>]*?)\sdata-t="([^"]+)"([^>]*)>(.*?)</\1>', src, flags=re.S):
    if "$" not in m.group(3):
        items.setdefault(m.group(3), limpio(m.group(5)))
for m in re.finditer(r'data-t-ph="([^"]+)"\s+placeholder="([^"]*)"', src):
    items.setdefault(m.group(1), html.unescape(m.group(2)))
for m in re.finditer(r'\bT\("([^"]+)",\s*"((?:[^"\\]|\\.)*)"\)', src):
    items.setdefault(m.group(1), m.group(2).replace('\\"', '"'))
# Opciones del formulario
opc = re.search(r"const OPC=\{(.*?)\}\};", src, flags=re.S).group(1)
for linea in opc.splitlines():
    m = re.match(r"\s*(\w+):\{", linea)
    if not m:
        continue
    for i, t in enumerate(re.findall(r'(?:v:\[|\],)\["([^"]+)"', linea), 1):
        items.setdefault(f"form.op.{m.group(1)}.{i}", t)
t = re.search(r"<title>(.*?)</title>", src).group(1)
d = re.search(r'<meta name="description" content="([^"]*)"', src).group(1)
items["seo.titulo"], items["seo.descripcion"] = html.unescape(t), html.unescape(d)


def orden(k):
    # opciones del formulario detrás de su pregunta
    if m := re.fullmatch(r"form\.op\.(\w+)\.(\d+)", k):
        n = {"tipo": 1, "pres": 3, "comb": 4, "cambio": 5, "plazo": 7}.get(m.group(1), 9)
        return (list(items).index(f"form.p{n}") if f"form.p{n}" in items else 999) + int(m.group(2)) / 100
    return list(items).index(k)


salida = []
for pref, nombre in SECCIONES:
    campos = []
    for k in sorted((k for k in items if k.split(".")[0] == pref), key=orden):
        v = items[k]
        c = {"clave": k, "etiqueta": etiqueta(k, v), "defecto": v, "largo": len(v) > 70}
        if k in AYUDA:
            c["ayuda"] = AYUDA[k]
        campos.append(c)
    if campos:
        salida.append({"seccion": nombre, "ancla": pref, "campos": campos})

usadas = {c["clave"] for s in salida for c in s["campos"]}
sobran = set(items) - usadas
assert not sobran, f"claves sin sección: {sobran}"
sin_etiqueta = [c["clave"] for s in salida for c in s["campos"] if c["etiqueta"] == c["clave"]]
assert not sin_etiqueta, f"claves sin etiqueta: {sin_etiqueta}"
os.makedirs(os.path.join(RAIZ, "gestion/textos"), exist_ok=True)
json.dump(salida, open(os.path.join(RAIZ, "gestion/textos/catalogo.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(usadas)} textos en {len(salida)} secciones")
