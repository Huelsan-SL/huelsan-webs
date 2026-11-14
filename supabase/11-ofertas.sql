-- Huelsan Automoción · ofertas por campaña en la web pública (15/11/2026)
-- Cada coche publicado puede llevar una oferta (copia publicada `web`):
--   ofertaCampana     clave de la campaña (black-friday, navidad, …, otra)
--   ofertaEtiqueta    texto propio cuando la campaña es «otra»
--   ofertaHasta       último día de la oferta (AAAA-MM-DD, opcional; el día indicado aún cuenta)
--   ofertaPrecioNormal precio sin oferta (sale tachado); el precio de oferta es `precioVenta`
-- Mientras la oferta está vigente, la vista da `oferta`, `oferta_etiqueta`, `oferta_hasta` y el precio tachado.
-- Al pasar la fecha, la oferta desaparece sola y el precio vuelve al normal (sin tocar nada en la gestión).
-- Las columnas nuevas van al final de la vista: la web publicada con el código anterior sigue funcionando.

create or replace view public.coches_web_v2 as
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
  case when l.estado = 'vendido' then 'vendido' when l.estado in ('comprado','stock') then 'stock' else 'encargo' end as disponibilidad,
  case when l.estado in ('comprado','stock','vendido') then null else l.subasta_fin end as caduca,
  case when l.estado = 'vendido' then null
       when o.camp is not null and not o.vigente and o.normal is not null then o.normal
       else nullif(w->>'precioVenta','')::numeric end          as precio,
  case when l.estado = 'vendido' then null
       when o.camp is not null and not o.vigente then null
       when o.camp is not null and o.normal > nullif(w->>'precioVenta','')::numeric then o.normal
       when nullif(w->>'precioAnterior','')::numeric > nullif(w->>'precioVenta','')::numeric
         then nullif(w->>'precioAnterior','')::numeric end      as precio_anterior,
  coalesce(w->'fotosWeb','[]'::jsonb)                          as fotos,
  nullif(btrim(w->>'textoVenta'),'')                           as descripcion,
  nullif(w->>'etiquetaDGT','')                                 as etiqueta,
  coalesce(nullif(w->>'publicadoEn','')::timestamptz, l.actualizado) as actualizado,
  case when l.estado in ('comprado','stock','vendido') then nullif(btrim(w->>'ubicacionVenta'),'') end as ubicacion,
  -- 15/11 (migración 12_ofertas)
  case when l.estado <> 'vendido' and o.camp is not null and o.vigente then o.camp end                          as oferta,
  case when l.estado <> 'vendido' and o.camp is not null and o.vigente
       then left(nullif(btrim(w->>'ofertaEtiqueta'),''), 40) end                                                as oferta_etiqueta,
  case when l.estado <> 'vendido' and o.camp is not null and o.vigente then o.hasta end                         as oferta_hasta
from public.lotes l
cross join lateral (select l.data->'web' as w) x
cross join lateral (
  select nullif(left(btrim(w->>'ofertaCampana'), 40), '')                                       as camp,
         case when w->>'ofertaPrecioNormal' ~ '^[0-9]+(\.[0-9]+)?$' then (w->>'ofertaPrecioNormal')::numeric end as normal,
         case when w->>'ofertaHasta' ~ '^\d{4}-\d{2}-\d{2}$' then (w->>'ofertaHasta')::date end  as hasta,
         case when w->>'ofertaHasta' ~ '^\d{4}-\d{2}-\d{2}$'
              then (w->>'ofertaHasta')::date >= (now() at time zone 'Europe/Madrid')::date
              else true end                                                                      as vigente
) o
where l.publico
  and jsonb_typeof(w) = 'object'
  and l.estado <> 'descartado'
  and (l.estado in ('comprado','stock','vendido') or (l.subasta_fin is not null and l.subasta_fin::timestamptz > now()));
grant select on public.coches_web_v2 to anon, authenticated;

-- ficha_web (copia inicial de un coche al publicar por SQL): incluye los campos de oferta
create or replace function public.ficha_web(d jsonb) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'marca', d->'marca', 'modelo', d->'modelo', 'derivado', d->'derivado', 'anio', d->'anio', 'km', d->'km',
    'combustible', d->'combustible', 'cv', d->'cv', 'motor', d->'motor', 'cambio', d->'cambio', 'tipo', d->'tipo',
    'plazas', d->'plazas', 'color', d->'color', 'equipamiento', d->'equipamiento', 'etiquetaDGT', d->'etiquetaDGT',
    'ubicacionVenta', d->'ubicacionVenta',
    'precioVenta', d->'precioVenta', 'textoVenta', d->'textoVenta', 'fotosWeb', coalesce(d->'fotosWeb','[]'::jsonb),
    'ofertaCampana', d->'ofertaCampana', 'ofertaEtiqueta', d->'ofertaEtiqueta', 'ofertaHasta', d->'ofertaHasta',
    'ofertaPrecioNormal', d->'ofertaPrecioNormal'))
$$;
