-- Huelsan Automoción · publicar en la web con paso previo (10/11/2026)
-- La web pública ya no lee los datos que se están editando: lee la copia publicada de cada coche (data.web),
-- que se crea con «Publicar en la web» y se renueva con «Actualizar cambios» desde la ficha (gestion/extra.js).
-- «Retirar de la web» pone publico=false (la copia se guarda para volver a publicar).
-- Aplicado el 10/11/2026 (migración 09_publicar_web). La copia inicial se hizo para los coches ya publicados,
-- salvo el coche de stock que se estaba creando (man-mwaktb9g), que sale cuando se publique.

create or replace function public.ficha_web(d jsonb) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'marca', d->'marca', 'modelo', d->'modelo', 'derivado', d->'derivado', 'anio', d->'anio', 'km', d->'km',
    'combustible', d->'combustible', 'cv', d->'cv', 'motor', d->'motor', 'cambio', d->'cambio', 'tipo', d->'tipo',
    'plazas', d->'plazas', 'color', d->'color', 'equipamiento', d->'equipamiento', 'etiquetaDGT', d->'etiquetaDGT',
    'precioVenta', d->'precioVenta', 'textoVenta', d->'textoVenta', 'fotosWeb', coalesce(d->'fotosWeb','[]'::jsonb)))
$$;

create or replace view public.coches_web as
select
  'h' || left(md5('huelsan' || l.id), 8)                       as id,
  w->>'marca'                                                   as marca,
  w->>'modelo'                                                  as modelo,
  w->>'derivado'                                                as version,
  round(nullif(w->>'anio','')::numeric)::int                   as anio,
  round(nullif(w->>'km','')::numeric)::int                     as km,
  w->>'combustible'                                             as combustible,
  round(nullif(w->>'cv','')::numeric)::int                     as cv,
  nullif(w->>'motor','')::numeric                              as motor,
  w->>'cambio'                                                  as cambio,
  w->>'tipo'                                                    as tipo,
  round(nullif(w->>'plazas','')::numeric)::int                 as plazas,
  w->>'color'                                                   as color,
  w->>'equipamiento'                                            as equipamiento,
  case when l.estado in ('comprado','stock') then 'stock' else 'encargo' end as disponibilidad,
  case when l.estado in ('comprado','stock') then null else l.subasta_fin end as caduca,
  nullif(w->>'precioVenta','')::numeric                        as precio,
  coalesce(w->'fotosWeb','[]'::jsonb)                          as fotos,
  nullif(btrim(w->>'textoVenta'),'')                           as descripcion,
  nullif(w->>'etiquetaDGT','')                                 as etiqueta,
  coalesce(nullif(w->>'publicadoEn','')::timestamptz, l.actualizado) as actualizado
from public.lotes l
cross join lateral (select l.data->'web' as w) x
where l.publico
  and jsonb_typeof(w) = 'object'
  and l.estado not in ('vendido','descartado')
  and (l.estado in ('comprado','stock') or (l.subasta_fin is not null and l.subasta_fin::timestamptz > now()));
grant select on public.coches_web to anon, authenticated;
