from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
G='/usr/share/fonts/truetype/google-fonts/'
C='/usr/share/fonts/truetype/crosextra/'
for n,f in [('Pop',G+'Poppins-Regular.ttf'),('PopM',G+'Poppins-Medium.ttf'),('PopB',G+'Poppins-Bold.ttf'),('PopL',G+'Poppins-Light.ttf'),
            ('Car',C+'Carlito-Regular.ttf'),('CarB',C+'Carlito-Bold.ttf'),('CarI',C+'Carlito-Italic.ttf'),('CarBI',C+'Carlito-BoldItalic.ttf')]:
    pdfmetrics.registerFont(TTFont(n,f))
pdfmetrics.registerFontFamily('Car',normal='Car',bold='CarB',italic='CarI',boldItalic='CarBI')
GRAFITO=colors.HexColor('#1B1D20'); CHAMPAN=colors.HexColor('#B8976A'); CHAMPAN_D=colors.HexColor('#8C6E44')
CHAMPAN_L=colors.HexColor('#CDB084'); ROTO=colors.HexColor('#F0EFED')
import os
if os.environ.get('HUELSAN_PAL')=='web':  # colores de huelsanautomocion.com: azul marino y dorado
    GRAFITO=colors.HexColor('#0E2A47'); CHAMPAN=colors.HexColor('#C29B57'); CHAMPAN_D=colors.HexColor('#8F6C2E'); CHAMPAN_L=colors.HexColor('#DDBE86'); ROTO=colors.HexColor('#F3F6F9')
def eur(x):
    s=f"{x:,.2f}".replace(',','X').replace('.',',').replace('X','.')
    return s+' €'
def wordmark(c,x,y,size=16,color=GRAFITO,sub=True,align='left'):
    c.saveState(); c.setFillColor(color); c.setFont('PopB',size)
    w=c.stringWidth('HUELSAN','PopB',size)+6*0.18*size
    if align=='center': x=x-w/2
    t=c.beginText(x,y); t.setFont('PopB',size); t.setCharSpace(0.18*size); t.textOut('HUELSAN'); c.drawText(t)
    if sub:
        c.setFillColor(CHAMPAN_D if color==GRAFITO else CHAMPAN_L)
        s2=size*0.36; t=c.beginText(x,y-size*0.62); t.setFont('Car',s2); t.setCharSpace(0.34*s2); t.textOut('AUTOMOCIÓN'); c.drawText(t)
    c.restoreState()
    return w
