# Huelsan Automoción · webs

- `publica/` → **huelsanautomocion.com**: web para clientes. Lee solo la vista `coches_web` de Supabase (sin datos de subasta).
- `gestion/` → **gestion.huelsanautomocion.com**: app privada del equipo (Subastas, Stock, Clientes, Histórico). Requiere usuario de Supabase.
- `supabase/` → SQL de la base de datos (ejecutar en orden en el SQL Editor).
- `tools/generar_gestion.py` → regenera `gestion/index.html` a partir de la app del artifact.

Ambos sitios son estáticos en Netlify (sin compilación), cada uno con su carpeta base.

## Añadidos del 10/11/2026
- `gestion/extra.js`: clientes con seguimiento (etapa, próximo seguimiento, comentarios, coches propuestos, coincidencias que se pueden quitar), pestaña «Búsquedas» (búsquedas clave con avisos), panel «En la web» en la ficha del coche (mostrar, precio, texto de venta, fotos con un toque y tapado automático de matrícula), proponer coches a clientes y pedir reseñas. Se carga después del código principal y lo amplía sin tocarlo por dentro.
- `gestion/resenas/`: enlaces de reseña para clientes y aprobación antes de publicarlas. Página pública del cuestionario: `publica/opinion/`.
- `supabase/07-duplicados.sql`: un coche = bastidor + subasta (BCA a veces cambia el LotId del mismo coche).
- `supabase/08-busquedas-resenas.sql` + función `supabase/functions/avisos`: coincidencias de búsquedas clave, reseñas, texto de venta en la web y formulario v2. Tarea pg_cron `huelsan-avisos` cada 15 min.
- `gestion/index.html` ya no se regenera desde el artifact: se edita directamente (el artifact quedó como copia el 27/10).

## Contratos de compraventa (13/11/2026)
- `gestion/facturacion/contrato.js`: pestaña «Contratos» en Facturación y botón «Contrato de compraventa» en cada factura. Genera el PDF (máx. 2 páginas) con los datos de la factura; lo que no se rellena sale en blanco para completarlo a mano. Incluye la ubicación de la compra (lista `config/ubicaciones`). Datos en `ajustes` → `contratos/<id>` y representantes en `contratoscfg/representantes`. No necesita SQL.

## Facturación ampliada (15/11/2026)
- Gastos con varias líneas (con IVA, sin IVA/suplidos y REBU), «Pago en efectivo sin factura» (fuera de los libros de IVA, dentro del balance del coche) y factura obligatoria en el resto. En compras de coche se marca la línea del vehículo (decide el régimen de la venta); las demás suman al coche como gastos.
- `gestion/facturacion/lector.js`: lee las facturas al subirlas (pdf.js para PDF con texto, Tesseract.js en español para fotos y escaneos; CSP de /facturacion/* ampliada a cdn.jsdelivr.net y wasm).
- Pestaña «Proveedores» (`ajustes` → `proveedores/<id>`): autorrelleno en los gastos y palabras clave para el banco.
- Los gastos que se apuntaban en la ficha del coche ahora se añaden desde Facturación con su factura; los antiguos salen en «Por matrícula» con «Subir factura».
- IVA y libros por trimestre (resumen 303, expedidas, recibidas por línea, REBU, ZIP de emitidas y de recibidas).
- `gestion/facturacion/banco.js`: pestaña «Banco» (Excel, CSV o Norma 43 → `banco/<id>`), enlace automático y manual con gastos y facturas, pagos/cobros sin factura y facturas sin movimiento.
- Contratos: crear desde un coche sin factura (también botón en la ficha del coche) y plantilla de documentos a pedir al comprador (`contratoscfg/plantillaDocs`).
