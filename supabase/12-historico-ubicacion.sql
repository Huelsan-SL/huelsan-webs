-- 12 · El aligerado mensual del histórico conserva la ubicación del vehículo
-- (antes se borraba `ubicacionVehiculo`; ahora se conserva junto con marca, modelo, km, año,
-- motor, IVA, ubicación, grado mecánico y daños, que ya se mantenían).
create or replace function public.aligerar_historico()
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  corte3m text := to_char((now() - interval '3 months') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS');
  corte1a text := to_char((now() - interval '1 year')   at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS');
  n_alig int; n_arch int;
begin
  -- 1) aligerar
  update public.lotes l set data =
      (l.data - 'url' - 'combustibleOrig' - 'importadoEn')
      || jsonb_build_object(
           'fotoIds', case when jsonb_typeof(l.data->'fotoIds') = 'array' and jsonb_array_length(l.data->'fotoIds') > 0
                           then jsonb_build_array(l.data->'fotoIds'->0) else '[]'::jsonb end,
           'subasta', jsonb_strip_nulls(jsonb_build_object(
                        'nombre', l.data#>'{subasta,nombre}', 'fin', l.data#>'{subasta,fin}',
                        'online', l.data#>'{subasta,online}', 'ubicacion', l.data#>'{subasta,ubicacion}')),
           'aligerado', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))
  where l.estado in ('nuevo','descartado') and not l.publico
    and l.subasta_fin is not null and l.subasta_fin < corte3m
    and not (l.data ? 'aligerado');
  get diagnostics n_alig = row_count;

  -- 2) archivar
  with movidos as (
    delete from public.lotes l
    where l.estado in ('nuevo','descartado') and not l.publico
      and l.subasta_fin is not null and l.subasta_fin < corte1a
    returning l.id, l.data)
  insert into public.lotes_archivo (id, data)
  select id, data from movidos
  on conflict (id) do update set data = excluded.data, archivado = now();
  get diagnostics n_arch = row_count;

  -- registro para la app
  insert into public.ajustes (id, data) values ('historico/mantenimiento',
    jsonb_build_object('fecha', now(), 'aligerados', n_alig, 'archivados', n_arch))
  on conflict (id) do update set data = excluded.data;

  return jsonb_build_object('aligerados', n_alig, 'archivados', n_arch);
end $function$;
