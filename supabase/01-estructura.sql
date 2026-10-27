-- Huelsan Automoción · estructura de la base de datos en Supabase
-- Pegar entero en Supabase → SQL Editor → New query → Run. Se puede ejecutar más de una vez sin romper nada.

-- ---------- Tablas ----------
-- Cada registro guarda el documento completo tal y como lo usa la app (columna "data"),
-- y algunas columnas sueltas para poder filtrar rápido.

create table if not exists public.lotes (
  id           text primary key,
  data         jsonb not null default '{}'::jsonb,
  estado       text generated always as (coalesce(data->>'estado','nuevo')) stored,
  publico      boolean generated always as (coalesce((data->>'publico')::boolean,false)) stored,
  subasta_id   text generated always as (data->>'subastaId') stored,
  subasta_fin  text generated always as (data#>>'{subasta,fin}') stored,
  actualizado  timestamptz not null default now()
);
create index if not exists lotes_estado_idx      on public.lotes (estado);
create index if not exists lotes_publico_idx     on public.lotes (publico) where publico;
create index if not exists lotes_subasta_fin_idx on public.lotes (subasta_fin);
create index if not exists lotes_subasta_id_idx  on public.lotes (subasta_id);

create table if not exists public.subastas (
  id text primary key, data jsonb not null default '{}'::jsonb, actualizado timestamptz not null default now());
create table if not exists public.demandas (
  id text primary key, data jsonb not null default '{}'::jsonb, actualizado timestamptz not null default now());
create table if not exists public.miniaturas (
  id text primary key, data jsonb not null default '{}'::jsonb, actualizado timestamptz not null default now());
-- Estado de la recogida y de la sesión de BCA, revisiones diarias, etc.
create table if not exists public.ajustes (
  id text primary key, data jsonb not null default '{}'::jsonb, actualizado timestamptz not null default now());

-- Fecha de modificación automática
create or replace function public.tocar_actualizado() returns trigger language plpgsql as $$
begin new.actualizado := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['lotes','subastas','demandas','miniaturas','ajustes'] loop
    execute format('drop trigger if exists %I_tocar on public.%I', t, t);
    execute format('create trigger %I_tocar before update on public.%I for each row execute function public.tocar_actualizado()', t, t);
  end loop; end $$;

-- ---------- Seguridad ----------
-- Solo los usuarios con cuenta (tú y tu socio) leen y escriben. Los visitantes anónimos no ven nada de estas tablas.
do $$ declare t text; begin
  foreach t in array array['lotes','subastas','demandas','miniaturas','ajustes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipo" on public.%I', t);
    execute format('create policy "equipo" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop; end $$;

-- ---------- Lo que ve la web pública ----------
-- Solo coches marcados «Mostrar en la web», no vendidos ni descartados, y los de subasta solo hasta su cierre.
-- Solo campos básicos: nada de precios de subasta, reserva, ubicación, lote ni enlaces a BCA.
create or replace view public.coches_web as
select
  'h' || left(md5('huelsan' || l.id), 8)                       as id,
  l.data->>'marca'                                              as marca,
  l.data->>'modelo'                                             as modelo,
  l.data->>'derivado'                                           as version,
  round(nullif(l.data->>'anio','')::numeric)::int                               as anio,
  round(nullif(l.data->>'km','')::numeric)::int                                 as km,
  l.data->>'combustible'                                        as combustible,
  round(nullif(l.data->>'cv','')::numeric)::int                                 as cv,
  nullif(l.data->>'motor','')::numeric                          as motor,
  l.data->>'cambio'                                             as cambio,
  l.data->>'tipo'                                               as tipo,
  round(nullif(l.data->>'plazas','')::numeric)::int                             as plazas,
  l.data->>'color'                                              as color,
  l.data->>'equipamiento'                                       as equipamiento,
  case when l.estado in ('comprado','stock') then 'stock' else 'encargo' end as disponibilidad,
  case when l.estado in ('comprado','stock') then null else l.subasta_fin end as caduca,
  nullif(l.data->>'precioVenta','')::numeric                    as precio,
  coalesce(l.data->'fotosWeb','[]'::jsonb)                      as fotos
from public.lotes l
where l.publico
  and l.estado not in ('vendido','descartado')
  and (l.estado in ('comprado','stock') or (l.subasta_fin is not null and l.subasta_fin::timestamptz > now()));

grant select on public.coches_web to anon, authenticated;

-- ---------- Fotos ----------
-- "fotos": fotos internas (solo el equipo). "fotos-web": fotos con matrícula difuminada que ve todo el mundo.
insert into storage.buckets (id, name, public) values ('fotos','fotos',false)        on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('fotos-web','fotos-web',true) on conflict (id) do nothing;

drop policy if exists "equipo fotos" on storage.objects;
create policy "equipo fotos" on storage.objects for all to authenticated
  using (bucket_id in ('fotos','fotos-web')) with check (bucket_id in ('fotos','fotos-web'));
