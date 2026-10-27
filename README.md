# Huelsan Automoción · webs

- `publica/` → **huelsanautomocion.com**: web para clientes. Lee solo la vista `coches_web` de Supabase (sin datos de subasta).
- `gestion/` → **gestion.huelsanautomocion.com**: app privada del equipo (Subastas, Stock, Clientes, Histórico). Requiere usuario de Supabase.
- `supabase/` → SQL de la base de datos (ejecutar en orden en el SQL Editor).
- `tools/generar_gestion.py` → regenera `gestion/index.html` a partir de la app del artifact.

Ambos sitios son estáticos en Netlify (sin compilación), cada uno con su carpeta base.
