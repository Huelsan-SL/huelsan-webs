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
