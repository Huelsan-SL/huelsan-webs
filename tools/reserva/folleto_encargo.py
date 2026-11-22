#!/usr/bin/env python3
"""Folleto A4 (2 caras) «Coches por encargo» de Huelsan Automoción.

Uso:  python3 folleto_encargo.py salida.pdf [--peritaje] [--historial]

Variantes (según el coche):
  sin flags              → coche sin peritaje ni historial: no se menciona ninguno de los dos.
  --peritaje             → coche con peritaje.
  --peritaje --historial → coche con peritaje e historial de mantenimiento.
"""
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import Paragraph
from common import *

W, H = A4
M = 16 * mm
WEB = 'huelsanautomocion.com'
WEB_URL = 'https://huelsanautomocion.com'
MAIL = 'info@huelsanautomocion.com'
ZONA = 'Andalucía · Murcia · Alicante'

PRECIO = 12000
STOCK_LO, STOCK_HI = PRECIO * 1.10, PRECIO * 1.15
AH_LO, AH_HI = STOCK_LO - PRECIO, STOCK_HI - PRECIO


def n0(x):
    return f"{x:,.0f}".replace(',', '.')


def P(c, text, x, ytop, w, font='Car', size=10, lead=None, color=colors.white, align=TA_LEFT):
    st = ParagraphStyle('x', fontName=font, fontSize=size, leading=lead or size * 1.28, textColor=color, alignment=align)
    p = Paragraph(text, st)
    _, h = p.wrap(w, 1000)
    p.drawOn(c, x, ytop - h)
    return h


def rrect(c, x, y, w, h, r, fill=None, stroke=None, lw=0.8):
    if fill is not None: c.setFillColor(fill)
    if stroke is not None: c.setStrokeColor(stroke); c.setLineWidth(lw)
    c.roundRect(x, y, w, h, r, stroke=1 if stroke is not None else 0, fill=1 if fill is not None else 0)


def track(c, x, y, cs, text):
    c.saveState()
    t = c.beginText(x, y); t.setCharSpace(cs); t.textOut(text); c.drawText(t)
    c.restoreState()


def sup(n):
    return f'<super rise="4" size="8.5">{n}</super>'


def condiciones(peritaje, historial):
    if peritaje:
        estado = ('Informe de peritaje de un perito independiente, entregado a título informativo (incluye la reserva habitual de golpes ocultos o reparaciones '
                  'anteriores no visibles sin desmontajes)' + (' e historial de mantenimiento. ' if historial else '. ')
                  + 'Forman parte del contrato de reserva junto con las fotografías.')
    else:
        estado = 'El contrato de reserva recoge por escrito el estado conocido del vehículo y las fotografías disponibles; HUELSAN lo entrega en ese estado, sin otros daños ni averías.'
    return [
        (1, f'<b>Ahorro orientativo.</b> Ejemplo ilustrativo con un coche de {n0(PRECIO)} € por encargo; el mismo coche en stock suele costar entre un 10 % y un 15 % más '
            f'({n0(STOCK_LO)} a {n0(STOCK_HI)} €), de ahí un ahorro de {n0(AH_LO)} a {n0(AH_HI)} €. El ahorro real depende de cada vehículo y no es una oferta vinculante. Precios con impuestos incluidos.'),
        (2, '<b>Subastas profesionales.</b> HUELSAN SL adquiere los vehículos en subastas profesionales. La adjudicación de cada vehículo no está garantizada: si finalmente no se consigue, '
            'se devuelve la señal íntegra o, a elección del cliente, se traspasa a otro vehículo (condición 7).'),
        (3, '<b>Tú decides.</b> Se reserva con el 10 % del precio de venta; el resto solo se paga al formalizar la compraventa, después de revisar el vehículo en persona.'),
        (4, '<b>Estado del vehículo.</b> ' + estado),
        (5, '<b>Plazos.</b> HUELSAN pone el vehículo a disposición del cliente en un máximo de 21 días naturales desde la firma de la reserva y se lo comunica; desde el aviso, el cliente dispone de 7 días naturales para formalizar la compraventa.'),
        (6, '<b>Garantía.</b> 1 año de garantía en la compraventa de vehículos de segunda mano, conforme al Real Decreto Legislativo 1/2007; sus términos se detallan en el contrato de compraventa. Los derechos irrenunciables del consumidor se mantienen en todo caso.'),
        (7, '<b>Devolución de la señal.</b> Se devuelve íntegra en 14 días naturales si: a) aparece una avería o daños que no constaban en la reserva; b) el vehículo no está disponible en 21 días; '
            'c) HUELSAN no consigue adquirirlo en la subasta (en este caso, a elección del cliente, la señal puede traspasarse a otro vehículo); d) HUELSAN no puede entregarlo por causa ajena al cliente.'),
        (8, '<b>Sin devolución.</b> Si el cliente desiste por voluntad propia, no formaliza la compraventa en plazo, no obtiene financiación o no dispone de fondos, la señal no se devuelve; '
            'si HUELSAN vende esa unidad a un tercero en los 30 días naturales siguientes a la reserva, la señal puede aplicarse a otro vehículo de HUELSAN.'),
    ]


def pagina1(c, peritaje, historial):
    c.setFillColor(GRAFITO); c.rect(0, 0, W, H, stroke=0, fill=1)
    c.saveState(); c.setFillColor(colors.HexColor('#24272b'))
    p = c.beginPath(); p.moveTo(W * .45, H); p.lineTo(W, H); p.lineTo(W, H * .52); p.close(); c.drawPath(p, stroke=0, fill=1); c.restoreState()
    wordmark(c, M, H - 20 * mm, size=17, color=ROTO)
    c.setFillColor(CHAMPAN); c.setFont('PopM', 8); track(c, W - M - 62 * mm, H - 19 * mm, 2, 'COCHES POR ENCARGO')
    c.setStrokeColor(CHAMPAN); c.setLineWidth(0.8); c.line(M, H - 28 * mm, W - M, H - 28 * mm)

    y = H - 46 * mm
    c.setFillColor(colors.white); c.setFont('PopB', 41)
    c.drawString(M, y, 'Pagas el coche.')
    c.setFillColor(CHAMPAN); c.drawString(M, y - 17 * mm, 'No el escaparate.')
    y -= 29 * mm
    h = P(c, f'El mismo coche en stock suele costar <b><font color="#CDB084">entre un 10 % y un 15 % más</font></b>{sup(1)}. '
             f'Nosotros lo buscamos para ti en subastas profesionales{sup(2)} y tú decides <b>antes de pagarlo todo</b>{sup(3)}.',
          M, y, W - 2 * M - 14 * mm, 'Car', 14.5, 19, ROTO)
    y -= h + 8 * mm

    bx, bw, bh = M, W - 2 * M, 74 * mm
    rrect(c, bx, y - bh, bw, bh, 5, fill=colors.HexColor('#23262a'), stroke=colors.HexColor('#3a3d42'), lw=0.6)
    c.setFillColor(CHAMPAN_L); c.setFont('PopM', 7.6)
    track(c, bx + 8 * mm, y - 9 * mm, 1.6, 'EJEMPLO ORIENTATIVO · MISMO COCHE')
    P(c, sup(1), bx + 8 * mm + 70 * mm, y - 3.6 * mm, 10 * mm, 'Car', 9, 10, CHAMPAN_L)
    maxw = bw - 16 * mm - 42 * mm
    sc = maxw / STOCK_HI
    by = y - 25 * mm
    c.setFillColor(CHAMPAN_L); c.setFont('PopM', 9); c.drawString(bx + 8 * mm, by + 9.5 * mm, 'POR ENCARGO')
    rrect(c, bx + 8 * mm, by, PRECIO * sc, 7.5 * mm, 2, fill=CHAMPAN)
    c.setFillColor(colors.white); c.setFont('PopB', 15); c.drawString(bx + 8 * mm + PRECIO * sc + 4 * mm, by + 1.6 * mm, f'{n0(PRECIO)} €')
    by2 = by - 22 * mm
    c.setFillColor(colors.HexColor('#9a9ea4')); c.setFont('PopM', 9); c.drawString(bx + 8 * mm, by2 + 9.5 * mm, 'EN STOCK')
    c.setFillColor(colors.HexColor('#5b5f66')); c.roundRect(bx + 8 * mm, by2, STOCK_LO * sc, 7.5 * mm, 2, stroke=0, fill=1)
    c.setFillColor(colors.HexColor('#7b7f86')); c.rect(bx + 8 * mm + STOCK_LO * sc, by2, (STOCK_HI - STOCK_LO) * sc, 7.5 * mm, stroke=0, fill=1)
    c.setFillColor(colors.HexColor('#c4c7cc')); c.setFont('PopB', 11.5); c.drawString(bx + 8 * mm + STOCK_HI * sc + 4 * mm, by2 + 1.9 * mm, f'{n0(STOCK_LO)} – {n0(STOCK_HI)} €')
    ay = y - bh + 4 * mm
    rrect(c, bx + 8 * mm, ay, bw - 16 * mm, 15 * mm, 3, fill=CHAMPAN)
    c.setFillColor(GRAFITO); c.setFont('PopB', 10); track(c, bx + 13 * mm, ay + 8.6 * mm, 2.2, 'AHORRO')
    c.setFont('PopB', 19); c.drawString(bx + 13 * mm + 28 * mm, ay + 4.6 * mm, f'entre {n0(AH_LO)} € y {n0(AH_HI)} €')
    y -= bh + 8 * mm

    c.setFillColor(CHAMPAN_L); c.setFont('PopM', 8.2)
    track(c, M, y, 1.8, 'POR QUÉ SALE MÁS BARATO')
    y -= 5 * mm
    razones = [
        ('1', 'Sin coste de escaparate', 'Un coche en stock paga exposición en el concesionario, preparación y meses parado. Por encargo, ese coste no existe.'),
        ('2', 'Subasta profesional' + sup(2), 'Revisamos cada semana las subastas de toda España y solo traemos los coches que merecen la pena.'),
        ('3', 'Sin capital dormido', 'No compramos coches “por si acaso”. Compramos el tuyo, así que no te cargamos el riesgo de los que no se venden.'),
        ('4', 'Lo eliges tú', 'Marca, año, kilómetros y presupuesto los pones tú, no lo que casualmente hay en el concesionario.'),
    ]
    gw = (W - 2 * M - 6 * mm) / 2; gh = 33 * mm
    for i, (n, tt, tx) in enumerate(razones):
        cx = M + (i % 2) * (gw + 6 * mm); cy = y - (i // 2) * (gh + 4 * mm)
        rrect(c, cx, cy - gh, gw, gh, 4, fill=colors.HexColor('#23262a'), stroke=colors.HexColor('#3a3d42'), lw=0.6)
        c.setFillColor(CHAMPAN); c.setFont('PopB', 20); c.drawString(cx + 5 * mm, cy - 11 * mm, n)
        P(c, tt, cx + 15 * mm, cy - 6.2 * mm, gw - 18 * mm, 'PopB', 10.5, 13, colors.white)
        P(c, tx, cx + 15 * mm, cy - 14 * mm, gw - 20 * mm, 'Car', 9.6, 11.8, colors.HexColor('#d7d9dc'))
    c.setFillColor(colors.HexColor('#7b7f86')); c.setFont('Car', 7.2)
    c.drawString(M, 15.5 * mm, 'Condiciones numeradas al final del folleto (cara 2).')
    c.setFillColor(CHAMPAN); c.rect(0, 0, W, 13 * mm, stroke=0, fill=1)
    c.setFillColor(GRAFITO); c.setFont('PopB', 10.5); c.drawString(M, 5 * mm, WEB)
    c.linkURL(WEB_URL, (M, 2 * mm, M + c.stringWidth(WEB, 'PopB', 10.5), 9 * mm), relative=0, thickness=0)
    c.setFont('PopM', 8.6); c.drawRightString(W - M, 5.2 * mm, ZONA)


def pagina2(c, peritaje, historial):
    c.setFillColor(ROTO); c.rect(0, 0, W, H, stroke=0, fill=1)
    hb = 52 * mm
    c.setFillColor(GRAFITO); c.rect(0, H - hb, W, hb, stroke=0, fill=1)
    wordmark(c, M, H - 15 * mm, size=12, color=ROTO)
    y = H - 29 * mm
    c.setFillColor(colors.white); c.setFont('PopB', 23); c.drawString(M, y, '¿Comprar sin verlo?')
    c.setFillColor(CHAMPAN)
    if peritaje:
        c.drawString(M, y - 9.5 * mm, 'Verás más que en el concesionario.')
        sub = 'Antes de reservar ya tienes sobre la mesa lo que otros te enseñan cuando ya has decidido.'
    else:
        c.drawString(M, y - 9.5 * mm, 'Con todo por escrito y sin riesgo.')
        sub = 'Fotografías del vehículo, su estado por escrito y tu señal protegida desde el primer día.'
    P(c, sub, M, y - 13.5 * mm, W - 2 * M, 'Car', 11.6, 14, ROTO)

    y = H - hb - 9 * mm
    c.setFillColor(CHAMPAN_D); c.setFont('PopM', 8.2)
    track(c, M, y, 1.8, 'LO QUE RECIBES ANTES DE PONER UN EURO' if peritaje else 'LO QUE TIENES ANTES DE PONER UN EURO')
    y -= 4.5 * mm
    if peritaje:
        items = [('Peritaje independiente' + sup(4), 'Daños pieza a pieza, realizados por un perito independiente, no por nosotros.'),
                 ('Decenas de fotos', 'Cada daño fotografiado y señalado. Interior, exterior, neumáticos y cuadro.')]
        items.append(('Historial de mantenimiento' + sup(4), 'Revisiones y reparaciones registradas del vehículo.') if historial
                     else ('Garantía de 1 año' + sup(6), 'Incluida en la compra de todos nuestros coches de ocasión.'))
        items.append(('Contrato de reserva claro', 'Todo lo anterior queda recogido por escrito en el contrato. Sin sorpresas.'))
    else:
        items = [('Fotografías del vehículo', 'Todas las disponibles, para que veas el coche por fuera y por dentro.'),
                 ('Estado por escrito' + sup(4), 'El estado conocido del vehículo consta en el contrato de reserva.'),
                 ('Garantía de 1 año' + sup(6), 'Incluida en la compra de todos nuestros coches de ocasión.'),
                 ('Contrato de reserva claro', 'Condiciones simples y a la vista antes de pagar nada.')]
    gw = (W - 2 * M - 6 * mm) / 2; gh = 21 * mm
    for i, (tt, tx) in enumerate(items):
        cx = M + (i % 2) * (gw + 6 * mm); cy = y - (i // 2) * (gh + 3 * mm)
        rrect(c, cx, cy - gh, gw, gh, 4, fill=colors.white, stroke=CHAMPAN_L, lw=0.7)
        c.setFillColor(CHAMPAN); c.circle(cx + 6 * mm, cy - 6 * mm, 2.1 * mm, stroke=0, fill=1)
        P(c, tt, cx + 11.5 * mm, cy - 3.6 * mm, gw - 14 * mm, 'PopB', 9.6, 12, GRAFITO)
        P(c, tx, cx + 11.5 * mm, cy - 9 * mm, gw - 14 * mm, 'Car', 9.2, 10.8, colors.HexColor('#3a3d42'))
    y -= 2 * (gh + 3 * mm) + 3 * mm

    c.setFillColor(CHAMPAN_D); c.setFont('PopM', 8.2)
    track(c, M, y, 1.8, 'ASÍ DE SENCILLO')
    y -= 4.5 * mm
    pasos = [('Eliges', 'Con toda la información delante.'), ('Reservas' + sup(3), 'Solo con el 10 % del precio.'),
             ('Lo revisas' + sup(5), 'Te avisamos cuando llega (máx. 21 días) y lo ves en persona.'), ('Firmas y pagas', 'El resto, solo si todo está como en la reserva.')]
    sw = (W - 2 * M - 3 * 4 * mm) / 4; sh = 30 * mm
    for i, (tt, tx) in enumerate(pasos):
        sx = M + i * (sw + 4 * mm)
        rrect(c, sx, y - sh, sw, sh, 4, fill=GRAFITO)
        c.setFillColor(CHAMPAN); c.setFont('PopB', 20); c.drawString(sx + 4 * mm, y - 10 * mm, str(i + 1))
        P(c, tt, sx + 4 * mm, y - 12 * mm, sw - 6 * mm, 'PopB', 9.6, 11.5, colors.white)
        P(c, tx, sx + 4 * mm, y - 18 * mm, sw - 8 * mm, 'Car', 8.8, 10.4, colors.HexColor('#d7d9dc'))
    y -= sh + 6 * mm

    bh = 40 * mm
    rrect(c, M, y - bh, W - 2 * M, bh, 5, fill=colors.white, stroke=CHAMPAN, lw=1.4)
    c.setFillColor(CHAMPAN_D); c.setFont('PopB', 12.5); c.drawString(M + 6 * mm, y - 8.5 * mm, 'Tu señal, protegida')
    P(c, sup(7), M + 6 * mm + 42 * mm, y - 5.4 * mm, 8 * mm, 'Car', 10, 11, CHAMPAN_D)
    P(c, 'Te devolvemos <b>el 10 % íntegro</b> si:', M + 6 * mm, y - 11.5 * mm, 90 * mm, 'Car', 10.4, 12.5, GRAFITO)
    bl = ['Aparece una avería o un daño que no estaba en la reserva.', 'El coche tarda más de 21 días en estar disponible.',
          'No conseguimos el coche en la subasta (o lo traspasas a otro).', 'No podemos entregártelo por causa ajena a ti.']
    yy = y - 18 * mm
    for b in bl:
        c.setFillColor(CHAMPAN); c.circle(M + 8 * mm, yy - 1.3 * mm, 1 * mm, stroke=0, fill=1)
        P(c, b, M + 12 * mm, yy + 1.4 * mm, 108 * mm, 'Car', 9.6, 11.4, GRAFITO); yy -= 5.3 * mm
    sx = W - M - 31 * mm; sy = y - bh / 2
    c.setFillColor(GRAFITO); c.circle(sx, sy, 14.5 * mm, stroke=0, fill=1)
    c.setStrokeColor(CHAMPAN); c.setLineWidth(1); c.circle(sx, sy, 12.4 * mm, stroke=1, fill=0)
    c.setFillColor(CHAMPAN); c.setFont('PopB', 21); c.drawCentredString(sx, sy - 1 * mm, '1 año')
    c.setFillColor(colors.white); c.setFont('PopM', 6.6); c.drawCentredString(sx, sy - 5.6 * mm, 'DE GARANTÍA')
    c.setFont('Car', 7); c.drawCentredString(sx, sy + 6.2 * mm, 'Incluido')
    y -= bh + 5 * mm

    ch = 17 * mm
    rrect(c, M, y - ch, W - 2 * M, ch, 4, fill=CHAMPAN)
    c.setFillColor(GRAFITO); c.setFont('PopB', 13); c.drawString(M + 6 * mm, y - 7.2 * mm, 'Dinos qué coche buscas.')
    c.setFont('Car', 10.2); c.drawString(M + 6 * mm, y - 12.8 * mm, 'Lo encontramos, te lo enseñamos con todo detalle y decides tú.')
    c.setFont('PopB', 11.5)
    wx = W - M - 6 * mm - c.stringWidth(WEB, 'PopB', 11.5)
    c.drawString(wx, y - 7.4 * mm, WEB)
    c.linkURL(WEB_URL, (wx, y - 9.4 * mm, wx + c.stringWidth(WEB, 'PopB', 11.5), y - 4.6 * mm), relative=0, thickness=0)
    c.setFont('PopM', 8.6)
    mx = W - M - 6 * mm - c.stringWidth(MAIL, 'PopM', 8.6)
    c.drawString(mx, y - 13.2 * mm, MAIL)
    c.linkURL('mailto:' + MAIL, (mx, y - 15 * mm, mx + c.stringWidth(MAIL, 'PopM', 8.6), y - 11.4 * mm), relative=0, thickness=0)
    y -= ch + 4 * mm

    c.setFillColor(GRAFITO); c.setFont('PopM', 6.8)
    track(c, M, y - 2 * mm, 1.4, 'CONDICIONES · HUELSAN SL · CIF B25979543')
    c.setStrokeColor(CHAMPAN_L); c.setLineWidth(0.5); c.line(M, y - 3.6 * mm, W - M, y - 3.6 * mm)
    conds = condiciones(peritaje, historial)
    colw = (W - 2 * M - 6 * mm) / 2
    st = ParagraphStyle('cond', fontName='Car', fontSize=6.3, leading=7.5, textColor=colors.HexColor('#444444'), alignment=4)
    paras = [Paragraph(f'<b>{n}.</b> {t}', st) for n, t in conds]
    alturas = [p.wrap(colw, 1000)[1] + 1.4 * mm for p in paras]
    total = sum(alturas); acum = 0; corte = len(paras)
    for i, a in enumerate(alturas):
        acum += a
        if acum >= total / 2: corte = i + 1; break
    top = y - 5.2 * mm
    for col, grupo in enumerate((paras[:corte], paras[corte:])):
        yy = top
        for p in grupo:
            h = p.wrap(colw, 1000)[1]
            p.drawOn(c, M + col * (colw + 6 * mm), yy - h)
            yy -= h + 1.4 * mm
    c.setFillColor(GRAFITO); c.rect(0, 0, W, 9 * mm, stroke=0, fill=1)
    c.setFillColor(CHAMPAN_L); c.setFont('PopM', 7.6); c.drawString(M, 3.3 * mm, 'Huelsan Automoción')
    c.drawRightString(W - M, 3.3 * mm, ZONA)
    return top - max(sum(alturas[:corte]), sum(alturas[corte:]))


if __name__ == '__main__':
    out = sys.argv[1]
    peritaje = '--peritaje' in sys.argv
    historial = '--historial' in sys.argv
    c = canvas.Canvas(out, pagesize=A4)
    c.setTitle('Coches por encargo – Huelsan Automoción'); c.setAuthor('Huelsan SL')
    pagina1(c, peritaje, historial); c.showPage()
    fin = pagina2(c, peritaje, historial); c.showPage(); c.save()
    print('ok · fin de condiciones a', round(fin / mm, 1), 'mm del borde inferior (mínimo 9)')
