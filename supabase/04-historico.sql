-- Huelsan Automoción · histórico ligero y archivo (28/10/2026)
-- Pegar entero en Supabase → SQL Editor → New query → Run. Se puede ejecutar más de una vez.
--
-- aligerar_historico():
--   1) Lotes cerrados hace más de 3 meses: se quedan con lo útil para comparar precios.
--      Se quitan los enlaces de BCA, las fotos de BCA salvo la primera (sirve de miniatura) y datos repetidos de la subasta.
--      Se conservan las notas del vendedor, los precios, los daños y los datos del coche.
--   2) Lotes de subastas de hace más de 1 año: pasan a la tabla «lotes_archivo» (la app no los carga, pero se pueden buscar).
--   Nunca toca lotes nuestros (interesante, pujar, comprado, stock, vendido) ni los publicados en la web.
--   Se ejecuta sola el día 1 de cada mes a las 04:00 (UTC) y con el botón «Aligerar y archivar ahora» del Histórico.

create table if not exists public.lotes_archivo (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  subasta_fin text generated always as (data#>>'{subasta,fin}') stored,
  archivado   timestamptz not null default now()
);
alter table public.lotes_archivo enable row level security;
drop policy if exists "equipo" on public.lotes_archivo;
create policy "equipo" on public.lotes_archivo for all to authenticated using (true) with check (true);

create or replace function public.aligerar_historico()
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  corte3m text := to_char((now() - interval '3 months') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS');
  corte1a text := to_char((now() - interval '1 year')   at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS');
  n_alig int; n_arch int;
begin
  -- 1) aligerar
  update public.lotes l set data =
      (l.data - 'url' - 'combustibleOrig' - 'importadoEn' - 'ubicacionVehiculo')
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
end $$;
revoke all on function public.aligerar_historico() from public, anon;
grant execute on function public.aligerar_historico() to authenticated;

-- Tarea mensual (día 1 a las 04:00 UTC). Necesita la extensión pg_cron (incluida en Supabase).
create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule('huelsan-historico-mensual');
exception when others then null; end $$;
select cron.schedule('huelsan-historico-mensual', '0 4 1 * *', 'select public.aligerar_historico()');
