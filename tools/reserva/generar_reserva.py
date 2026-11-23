#!/usr/bin/env python3
"""Genera el CONTRATO DE RESERVA de Huelsan Automoción en PDF.

Uso:  python3 generar_reserva.py datos.json salida.pdf

Reglas (acordadas con el usuario, 22/11/2026):
 - Solo para coches marcados INTERESANTES.
 - Señal = 10 % del precio de venta. El precio de venta se pregunta ANTES y se mete a mano.
 - Vendedor declarado (Francisco / Gustavo) + lugar de venta (Murcia / Huelva / otro, a mano).
 - Con peritaje: datos + fotos del peritaje. Con historial de mantenimiento: se añade.
 - Sin peritaje ni mantenimiento: se hace constar en el contrato; solo se listan daños si la ficha
   de venta los menciona; fotos: el máximo posible del anuncio.
 - Comprador: nombre completo y DNI como mínimo (dirección, si la hay). Si falta, líneas en blanco.
"""
import json, sys, io, os
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_CENTER
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, KeepTogether, Image as RLImage, NextPageTemplate, CondPageBreak)
from reportlab.pdfgen import canvas as rlcanvas
from common import *

W, H = A4
LM = RM = 18 * mm

ST = {
    'body': ParagraphStyle('body', fontName='Car', fontSize=9.6, leading=12.4, alignment=TA_JUSTIFY, textColor=GRAFITO),
    'clau': ParagraphStyle('clau', fontName='Car', fontSize=9.6, leading=12.4, alignment=TA_JUSTIFY, textColor=GRAFITO, spaceAfter=4),
    'h1': ParagraphStyle('h1', fontName='PopB', fontSize=15, leading=19, textColor=GRAFITO, alignment=TA_LEFT),
    'h2': ParagraphStyle('h2', fontName='PopM', fontSize=9.4, leading=12, textColor=CHAMPAN_D, spaceBefore=9, spaceAfter=3),
    'small': ParagraphStyle('small', fontName='Car', fontSize=8.3, leading=10.4, textColor=colors.HexColor('#444444'), alignment=TA_JUSTIFY),
    'cell': ParagraphStyle('cell', fontName='Car', fontSize=9, leading=11, textColor=GRAFITO),
    'cellb': ParagraphStyle('cellb', fontName='CarB', fontSize=9, leading=11, textColor=GRAFITO),
    'lab': ParagraphStyle('lab', fontName='Car', fontSize=7.6, leading=9, textColor=colors.HexColor('#7a6a52')),
    'th': ParagraphStyle('th', fontName='PopM', fontSize=7.4, leading=9, textColor=colors.white),
    'td': ParagraphStyle('td', fontName='Car', fontSize=8.6, leading=10.2, textColor=GRAFITO),
}
LINE = '<font color="#8a8a8a">' + '_' * 26 + '</font>'


def F(label, value, blank=28):
    """Celda etiqueta+valor; si no hay valor, línea en blanco para rellenar a mano."""
    v = value if value not in (None, '') else '<font color="#9a9a9a">' + '_' * blank + '</font>'
    return [Paragraph(label, ST['lab']), Paragraph(v, ST['cellb'])]


def box_table(rows, widths, head=None):
    data = []
    if head:
        data.append([Paragraph(head, ST['th'])] + [''] * (len(widths) - 1))
    data += rows
    t = Table(data, colWidths=widths)
    sty = [('BOX', (0, 0), (-1, -1), 0.6, CHAMPAN), ('LINEBELOW', (0, 0), (-1, -2), 0.25, colors.HexColor('#dcd3c3')),
           ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
           ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6)]
    if head:
        sty += [('BACKGROUND', (0, 0), (-1, 0), GRAFITO), ('SPAN', (0, 0), (-1, 0))]
    t.setStyle(TableStyle(sty))
    return t


class NumCanvas(rlcanvas.Canvas):
    meta = {}

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self._pages = []

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        n = len(self._pages)
        for st in self._pages:
            self.__dict__.update(st)
            self.footer(n)
            super().showPage()
        super().save()

    def footer(self, n):
        m = NumCanvas.meta
        self.setStrokeColor(CHAMPAN); self.setLineWidth(0.6); self.line(LM, 14 * mm, W - RM, 14 * mm)
        self.setFont('Car', 7.8); self.setFillColor(colors.HexColor('#555555'))
        self.drawString(LM, 10 * mm, f"Huelsan SL · {m.get('cif','')} · Contrato de reserva {m.get('mat','')}")
        self.drawRightString(W - RM, 10 * mm, f"Página {self._pageNumber} de {n}")
        # cabecera
        wordmark(self, LM, H - 13 * mm, size=12)
        self.setFont('Car', 8); self.setFillColor(colors.HexColor('#7a6a52'))
        self.drawRightString(W - RM, H - 12 * mm, m.get('ref', ''))
        self.setStrokeColor(CHAMPAN); self.line(LM, H - 17.5 * mm, W - RM, H - 17.5 * mm)


def foto_flowable(path, w, h):
    im = Image.open(path).convert('RGB')
    im.thumbnail((900, 675))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=72, optimize=True); b.seek(0)
    return RLImage(b, width=w, height=h)


def build(d, out):
    emp = d['empresa']; v = d['vehiculo']; comp = d.get('comprador') or {}
    ven = d.get('vendedor')
    precio = d.get('precio_venta')
    senal = round(precio * 0.10, 2) if precio else None
    mat = v['matricula']
    NumCanvas.meta = {'cif': emp['cif'], 'mat': mat, 'ref': d.get('referencia') or 'Reserva nº ______________'}

    doc = BaseDocTemplate(out, pagesize=A4, leftMargin=LM, rightMargin=RM, topMargin=24 * mm, bottomMargin=19 * mm,
                          title=f"Contrato de reserva {mat} – Huelsan Automoción", author='Huelsan SL')
    fr = Frame(LM, 19 * mm, W - LM - RM, H - 24 * mm - 19 * mm, id='f', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id='p', frames=[fr])])
    S = []
    cw = W - LM - RM

    S.append(Paragraph('CONTRATO DE RESERVA DE VEHÍCULO', ST['h1']))
    S.append(Spacer(1, 2))
    S.append(Paragraph('Reserva con señal del 10 % · el vehículo queda retirado de la venta a favor del comprador', ST['small']))
    S.append(Spacer(1, 6))

    # Lugar y fecha
    if d.get('lugar_venta'):
        lugar = d['lugar_venta']
    else:
        lugar = None
    fecha = d.get('fecha')
    lf = Paragraph(f"En <b>{lugar if lugar else '<font color=\"#9a9a9a\">' + '_' * 18 + '</font>'}</b>, a "
                   f"<b>{fecha if fecha else '<font color=\"#9a9a9a\">' + '_' * 6 + ' de ' + '_' * 12 + ' de 20__</font>'}</b>.", ST['body'])
    S.append(lf)
    S.append(Spacer(1, 3))

    # ---------------- PARTES
    S.append(Paragraph('REUNIDOS', ST['h2']))
    if ven:
        rep = f"{ven['nombre']}, con DNI/NIE {ven.get('dni') or '______________'}"
        rep_txt = f"representada por <b>{rep}</b>"
    else:
        rep_txt = ("representada por D. <font color='#9a9a9a'>______________________________</font> ([&nbsp;&nbsp;&nbsp;] Francisco José Álvarez González &nbsp; [&nbsp;&nbsp;&nbsp;] Gustavo Fornell Lacida), "
                   "con DNI/NIE <font color='#9a9a9a'>______________</font>")
    S.append(Paragraph(
        f"<b>DE UNA PARTE (EL VENDEDOR):</b> <b>{emp['nombre']}</b> (nombre comercial Huelsan Automoción), con CIF <b>{emp['cif']}</b> y domicilio en {emp['domicilio']}, {rep_txt}, en adelante «HUELSAN».",
        ST['body']))
    S.append(Spacer(1, 4))
    nom = comp.get('nombre'); dni = comp.get('dni'); dire = comp.get('direccion')
    rows = [[F('Nombre y apellidos / razón social', nom, 34)[0], F('DNI / NIE / CIF', dni, 18)[0]],
            [F('Nombre y apellidos / razón social', nom, 34)[1], F('DNI / NIE / CIF', dni, 18)[1]],
            [F('Domicilio (calle, nº, CP, localidad)', dire, 46)[0], F('Teléfono / correo', comp.get('contacto'), 18)[0]],
            [F('Domicilio (calle, nº, CP, localidad)', dire, 46)[1], F('Teléfono / correo', comp.get('contacto'), 18)[1]]]
    t = Table(rows, colWidths=[cw * 0.62, cw * 0.38])
    t.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, CHAMPAN), ('TOPPADDING', (0, 0), (-1, -1), 1.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
                           ('LEFTPADDING', (0, 0), (-1, -1), 6), ('LINEBELOW', (0, 1), (-1, 1), 0.25, colors.HexColor('#dcd3c3'))]))
    S.append(Paragraph('<b>DE OTRA PARTE (EL COMPRADOR):</b>', ST['body']))
    S.append(Spacer(1, 2)); S.append(t)
    S.append(Spacer(1, 5))
    S.append(Paragraph('Ambas partes se reconocen capacidad legal suficiente para obligarse y', ST['body']))

    S.append(Paragraph('EXPONEN', ST['h2']))
    S.append(Paragraph('<b>I.</b> Que HUELSAN SL se dedica a la compraventa de vehículos de ocasión y es quien comercializa el vehículo descrito a continuación.', ST['body']))
    S.append(Paragraph('<b>II.</b> Que el COMPRADOR desea adquirir dicho vehículo y que HUELSAN SL accede a reservárselo mediante la entrega de una señal, con arreglo a las siguientes', ST['body']))

    S.append(Paragraph('CLÁUSULAS', ST['h2']))

    # ---------------- VEHÍCULO / DATOS CLAVE (resumen)
    S.append(Paragraph('<b>PRIMERA. Objeto y vehículo reservado.</b> HUELSAN SL reserva al COMPRADOR el siguiente vehículo y se compromete a no ofrecerlo ni venderlo a terceros mientras esta reserva esté vigente:', ST['clau']))
    vrows = [
        [F('Marca / modelo / versión', v['descripcion'])[0], F('Matrícula', v['matricula'])[0], F('Color', v.get('color'))[0]],
        [F('Marca / modelo / versión', v['descripcion'])[1], F('Matrícula', v['matricula'])[1], F('Color', v.get('color'))[1]],
        [F('Nº de bastidor (VIN)', v.get('bastidor'))[0], F('Kilómetros', v.get('km_txt'))[0], F('Combustible / cambio', v.get('combustible'))[0]],
        [F('Nº de bastidor (VIN)', v.get('bastidor'))[1], F('Kilómetros', v.get('km_txt'))[1], F('Combustible / cambio', v.get('combustible'))[1]],
    ]
    t = Table(vrows, colWidths=[cw * 0.5, cw * 0.22, cw * 0.28])
    t.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, CHAMPAN), ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#faf8f4')),
                           ('TOPPADDING', (0, 0), (-1, -1), 1.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5), ('LEFTPADDING', (0, 0), (-1, -1), 6),
                           ('LINEBELOW', (0, 1), (-1, 1), 0.25, colors.HexColor('#dcd3c3'))]))
    S.append(t); S.append(Spacer(1, 5))

    # ---------------- PRECIO Y SEÑAL
    pr = eur(precio) if precio else '<font color="#9a9a9a">______________ €</font>'
    sn = eur(senal) if senal else '<font color="#9a9a9a">______________ €</font>'
    rest = eur(precio - senal) if precio else '<font color="#9a9a9a">______________ €</font>'
    pt = Table([[Paragraph('Precio total de venta<br/><font size=7.4 color="#7a6a52">impuestos incluidos</font>', ST['cell']), Paragraph('Señal (10 %)<br/><font size=7.4 color="#7a6a52">se paga hoy</font>', ST['cell']), Paragraph('Resto a pagar<br/><font size=7.4 color="#7a6a52">al formalizar la compraventa</font>', ST['cell'])],
                [Paragraph(f'<font name="PopB" size=12>{pr}</font>', ST['cell']), Paragraph(f'<font name="PopB" size=12 color="#8C6E44">{sn}</font>', ST['cell']), Paragraph(f'<font name="PopB" size=12>{rest}</font>', ST['cell'])]],
               colWidths=[cw / 3] * 3)
    pt.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 1, CHAMPAN), ('LINEAFTER', (0, 0), (1, -1), 0.25, CHAMPAN_L), ('BACKGROUND', (1, 0), (1, -1), colors.HexColor('#f4eee3')),
                            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4), ('LEFTPADDING', (0, 0), (-1, -1), 8)]))
    S.append(Paragraph('Los <b>kilómetros indicados son estimados</b>: pueden variar por la recogida del vehículo, su desplazamiento para servicio o los trabajos de preparación previos a la entrega. Esta variación <b>no superará en ningún caso los 1.000 km</b> respecto de los indicados.', ST['clau']))
    S.append(Paragraph('<b>SEGUNDA. Precio.</b> El precio total de venta del vehículo es el siguiente, con los impuestos que correspondan incluidos (IVA o régimen especial de bienes usados, según el vehículo). <b>El precio incluye los gastos de cambio de titularidad</b> del vehículo a nombre del COMPRADOR. Los demás extremos se detallarán en el contrato de compraventa.', ST['clau']))
    S.append(KeepTogether([pt])); S.append(Spacer(1, 5))

    S.append(Paragraph('<b>TERCERA. Señal.</b> El COMPRADOR entrega en este acto a HUELSAN SL el <b>10 % del precio</b> en concepto de señal, que se descuenta del precio al formalizarse la compraventa. El pago se hace por transferencia o tarjeta; el pago en efectivo solo se admite hasta el límite que fija la ley. HUELSAN SL entrega al COMPRADOR justificante de la cantidad recibida, identificando el vehículo (ver «Recibí» al final). El resto del precio se abonará al firmar el contrato de compraventa y antes de la entrega.', ST['clau']))
    S.append(Paragraph('<b>CUARTA. Plazo de disponibilidad.</b> HUELSAN SL pondrá el vehículo a disposición del COMPRADOR para su revisión y para formalizar la compraventa en un plazo máximo de <b>21 días naturales</b> desde la fecha de este contrato, y se lo comunicará por teléfono, WhatsApp o correo. Si el vehículo todavía debe adquirirse en subasta, la reserva queda condicionada a que HUELSAN SL lo consiga (cláusula sexta, c). Desde el aviso de disponibilidad, el COMPRADOR dispone de <b>7 días naturales</b> para revisarlo, firmar el contrato de compraventa y pagar el resto del precio. Este plazo de 7 días <b>podrá ampliarse si las partes lo acuerdan previamente</b> (por escrito, incluido correo o WhatsApp).', ST['clau']))

    # --- estado del vehículo
    sin_peritaje = not d.get('peritaje')
    sin_mant = not d.get('mantenimiento')
    if sin_peritaje and sin_mant:
        estado = ('<b>QUINTA. Estado del vehículo.</b> Este vehículo <b>no dispone de informe de peritaje ni de historial de mantenimiento</b>, circunstancia que el COMPRADOR conoce y acepta. '
                  + ('Los únicos daños o defectos declarados por el vendedor original en la ficha de venta son los que figuran en el Anexo I. ' if d.get('danos_ficha') else 'La ficha de venta no declara daños ni defectos. ')
                  + 'En el Anexo II se incluyen las fotografías del anuncio. HUELSAN SL entregará el vehículo en el estado en que consta en esta reserva, sin otros daños ni averías.')
    else:
        partes = []
        if not sin_peritaje: partes.append('el informe de peritaje de un perito independiente')
        if not sin_mant: partes.append('el historial de mantenimiento')
        faltan = ''
        if sin_peritaje: faltan = ' El vehículo <b>no dispone de informe de peritaje</b>.'
        if sin_mant: faltan = ' El vehículo <b>no dispone de historial de mantenimiento</b>.'
        estado = (f'<b>QUINTA. Estado del vehículo.</b> El estado del vehículo es el que reflejan {" y ".join(partes)} (Anexo I) y las fotografías (Anexo II), que forman parte de este contrato.{faltan} '
                  'El peritaje es de un tercero y se entrega a título informativo. '
                  'HUELSAN SL entregará el vehículo en el estado en que consta en esta reserva, sin otros daños ni averías.')
    S.append(Paragraph(estado, ST['clau']))

    S.append(Paragraph('<b>SEXTA. Devolución íntegra de la señal.</b> HUELSAN SL devolverá al COMPRADOR la señal completa, en un máximo de 14 días naturales y por el mismo medio de pago, si el COMPRADOR lo solicita por escrito (correo o WhatsApp) en alguno de estos casos: '
                       '<b>a)</b> el vehículo presenta una avería o daños que no constaban en esta reserva (Anexos I y II); '
                       '<b>b)</b> el vehículo no está disponible para su entrega en el plazo de 21 días de la cláusula cuarta; '
                       '<b>c)</b> HUELSAN SL no consigue adquirir el vehículo en la subasta; en este caso, <b>a elección del COMPRADOR</b>, la señal se devuelve íntegra o se traspasa a otro vehículo de HUELSAN SL; '
                       '<b>d)</b> HUELSAN SL no puede entregar el vehículo por cualquier otra causa que no dependa del COMPRADOR (venta a un tercero, cargas o circunstancias no declaradas). '
                       'En el caso a), si el COMPRADOR lo prefiere, puede seguir adelante con la compraventa una vez reparado el vehículo a cargo de HUELSAN SL.', ST['clau']))
    S.append(Paragraph('<b>SÉPTIMA. Desistimiento voluntario y financiación.</b> Si el COMPRADOR desiste por su propia voluntad, o no formaliza la compraventa en el plazo de la cláusula cuarta, o no obtiene la financiación que pretendía o no dispone de los fondos, <b>la señal no se devuelve</b>: compensa a HUELSAN SL por haber retirado el vehículo de la venta. '
                       'No obstante, si HUELSAN SL vende esta unidad a un tercero dentro de los <b>30 días naturales</b> siguientes a la fecha de este contrato, la señal se conserva a favor del COMPRADOR y puede aplicarla al precio de <b>otro vehículo de HUELSAN SL</b> que adquiera.', ST['clau']))
    S.append(Paragraph('<b>OCTAVA. Derechos del consumidor.</b> Lo pactado se entiende sin perjuicio de los derechos que la normativa de consumidores (Real Decreto Legislativo 1/2007) reconoce al COMPRADOR cuando tenga la condición de consumidor y que son irrenunciables, incluida la garantía legal en la compraventa, que se detallará en el contrato de compraventa. Si este contrato se firma a distancia o fuera del establecimiento, se aplican los derechos de desistimiento que la ley prevé en esos casos. HUELSAN SL dispone de hojas de reclamaciones.', ST['clau']))
    S.append(Paragraph('<b>NOVENA. Protección de datos.</b> Los datos del COMPRADOR se tratan por HUELSAN SL (responsable) para gestionar esta reserva y la posterior compraventa, y para cumplir sus obligaciones legales. No se ceden a terceros salvo obligación legal o gestoría y garantía necesarias para la operación. El COMPRADOR puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a HUELSAN SL.', ST['clau']))
    S.append(Paragraph('<b>DÉCIMA. Ley y jurisdicción.</b> Este contrato se rige por la ley española. Si el COMPRADOR es consumidor, los conflictos se someten a los juzgados de su domicilio; si es empresa o profesional, a los juzgados de Murcia.', ST['clau']))
    S.append(Paragraph('<b>ANEXOS.</b> Forman parte de este contrato el Anexo I (estado del vehículo)' + (' y el Anexo II (fotografías)' if d.get('fotos') else '') + '.', ST['clau']))
    S.append(Spacer(1, 4))

    # ---------------- FIRMAS
    S.append(CondPageBreak(75 * mm))
    S.append(Paragraph('En prueba de conformidad, firman por duplicado y a un solo efecto, en el lugar y la fecha indicados al inicio.', ST['body']))
    S.append(Spacer(1, 4))
    loc = Table([[Paragraph('<b>Lugar de venta y firma:</b>', ST['cell']),
                  Paragraph('<b>' + (d['lugar_venta'] if d.get('lugar_venta') else '[&nbsp;&nbsp;&nbsp;] Murcia &nbsp;&nbsp; [&nbsp;&nbsp;&nbsp;] Huelva &nbsp;&nbsp; [&nbsp;&nbsp;&nbsp;] Otro: <font color="#9a9a9a">____________________</font>') + '</b>', ST['cell'])]],
                colWidths=[cw * 0.26, cw * 0.74])
    loc.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.5, CHAMPAN_L), ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#faf8f4')), ('LEFTPADDING', (0, 0), (-1, -1), 6), ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
    S.append(loc); S.append(Spacer(1, 5))
    vend_nom = ven['nombre'] if ven else '[&nbsp;&nbsp;&nbsp;] F. J. Álvarez &nbsp; [&nbsp;&nbsp;&nbsp;] G. Fornell'
    firm = Table([[Paragraph('<b>EL VENDEDOR</b><br/>' + emp['nombre'] + '<br/><font size=8>' + vend_nom + '</font>', ST['cell']), Paragraph('<b>EL COMPRADOR</b><br/>' + (nom or '<font color="#9a9a9a">______________________</font>') + '<br/><font size=8>DNI ' + (dni or '<font color="#9a9a9a">______________</font>') + '</font>', ST['cell'])],
                  ['', '']], colWidths=[cw / 2, cw / 2], rowHeights=[None, 26 * mm])
    firm.setStyle(TableStyle([('BOX', (0, 0), (0, 1), 0.5, CHAMPAN), ('BOX', (1, 0), (1, 1), 0.5, CHAMPAN), ('LEFTPADDING', (0, 0), (-1, -1), 6), ('TOPPADDING', (0, 0), (-1, 0), 4)]))
    S.append(firm); S.append(Spacer(1, 6))
    S.append(Paragraph('<b>RECIBÍ</b> la cantidad de ' + (sn if senal else '<font color="#9a9a9a">______________ €</font>') + f' en concepto de señal del 10 % por la reserva del vehículo <b>{mat}</b>.  Fecha: <font color="#9a9a9a">____ / ____ / ________</font>  Firma de HUELSAN SL: <font color="#9a9a9a">______________________</font>', ST['body']))

    # ---------------- ANEXO I
    S.append(PageBreak())
    S.append(Paragraph('ANEXO I · ESTADO DEL VEHÍCULO', ST['h1']))
    S.append(Spacer(1, 2))
    S.append(Paragraph(f"{v['descripcion']} · {mat} · Bastidor {v.get('bastidor','')}", ST['small']))
    per = d.get('peritaje')
    if per:
        S.append(Paragraph('1. DATOS DEL PERITAJE', ST['h2']))
        pr_rows = [[F('Empresa peritadora', per['perito'])[0], F('Fecha de tasación', per['fecha'])[0], F('Km en la tasación', per['km'])[0]],
                   [F('Empresa peritadora', per['perito'])[1], F('Fecha de tasación', per['fecha'])[1], F('Km en la tasación', per['km'])[1]]]
        t = Table(pr_rows, colWidths=[cw * .5, cw * .25, cw * .25])
        t.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), 0.6, CHAMPAN), ('TOPPADDING', (0, 0), (-1, -1), 1.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5), ('LEFTPADDING', (0, 0), (-1, -1), 6)]))
        S.append(t); S.append(Spacer(1, 5))
        S.append(Paragraph('Daños, defectos y elementos que constan en el informe:', ST['body'])); S.append(Spacer(1, 2))
        data = [[Paragraph(x, ST['th']) for x in ('PIEZA / ELEMENTO', 'NIVEL', 'DESCRIPCIÓN')]]
        for p, n, ds in per['danos']:
            data.append([Paragraph(p, ST['td']), Paragraph(n, ST['td']), Paragraph(ds, ST['td'])])
        t = Table(data, colWidths=[cw * .36, cw * .2, cw * .44], repeatRows=1)
        t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), GRAFITO), ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#faf8f4')]),
                               ('BOX', (0, 0), (-1, -1), 0.6, CHAMPAN), ('LINEBELOW', (0, 0), (-1, -2), 0.2, colors.HexColor('#e2dbcc')),
                               ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.4), ('LEFTPADDING', (0, 0), (-1, -1), 5)]))
        S.append(t); S.append(Spacer(1, 3))
        S.append(Paragraph(per.get('nota', ''), ST['small']))
    else:
        S.append(Paragraph('1. PERITAJE', ST['h2']))
        S.append(Paragraph('Este vehículo <b>no dispone de informe de peritaje</b>.', ST['body']))
        S.append(Paragraph('Daños o defectos declarados en la ficha de venta', ST['h2']))
        if d.get('danos_ficha'):
            for x in d['danos_ficha']: S.append(Paragraph('• ' + x, ST['body']))
        else:
            S.append(Paragraph('La ficha de venta no declara daños ni defectos.', ST['body']))

    S.append(Paragraph('2. HISTORIAL DE MANTENIMIENTO', ST['h2']))
    mant = d.get('mantenimiento')
    if mant:
        data = [[Paragraph(x, ST['th']) for x in ('FECHA', 'KILÓMETROS', 'INTERVENCIONES REGISTRADAS')]]
        for f_, km, tx in mant['entradas']:
            data.append([Paragraph(f_, ST['td']), Paragraph(km, ST['td']), Paragraph(tx, ST['td'])])
        t = Table(data, colWidths=[cw * .15, cw * .15, cw * .70], repeatRows=1)
        t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), GRAFITO), ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#faf8f4')]),
                               ('BOX', (0, 0), (-1, -1), 0.6, CHAMPAN), ('LINEBELOW', (0, 0), (-1, -2), 0.2, colors.HexColor('#e2dbcc')), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                               ('TOPPADDING', (0, 0), (-1, -1), 2), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.4), ('LEFTPADDING', (0, 0), (-1, -1), 5)]))
        S.append(t); S.append(Spacer(1, 3))
    else:
        S.append(Paragraph('Este vehículo <b>no dispone de historial de mantenimiento</b>.', ST['body']))

    # ---------------- ANEXO II · FOTOS
    fotos = d.get('fotos') or []
    if fotos:
        origen = 'del informe de peritaje' if per else 'del anuncio de venta'
        S.append(PageBreak())
        S.append(Paragraph('ANEXO II · FOTOGRAFÍAS', ST['h1']))
        S.append(Spacer(1, 2))
        S.append(Paragraph(f"{len(fotos)} fotografías {origen} · {v['descripcion']} · {mat}. Las flechas señalan los daños recogidos en el informe.", ST['small']))
        S.append(Spacer(1, 6))
        cols = 3; gap = 3 * mm
        pw = (cw - gap * (cols - 1)) / cols; ph = pw * 0.75
        per_page = 12
        for pg in range(0, len(fotos), per_page):
            chunk = fotos[pg:pg + per_page]
            rows = []
            for i in range(0, len(chunk), cols):
                r = [foto_flowable(p, pw, ph) for p in chunk[i:i + cols]]
                r += [''] * (cols - len(r))
                rows.append(r)
                nums = [Paragraph(f'<font color="#7a6a52" size=7.5>Foto {pg + i + j + 1}</font>', ST['small']) if j < len(chunk[i:i + cols]) else '' for j in range(cols)]
                rows.append(nums)
            t = Table(rows, colWidths=[pw + gap] * cols if False else [pw] * cols, hAlign='LEFT')
            t.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), gap), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5)]))
            # ancho total con huecos
            t._argW = [pw + gap] * cols
            S.append(t)
            if pg + per_page < len(fotos): S.append(PageBreak())

    doc.build(S, canvasmaker=NumCanvas)


if __name__ == '__main__':
    d = json.load(open(sys.argv[1]))
    build(d, sys.argv[2])
    print('ok', sys.argv[2])
