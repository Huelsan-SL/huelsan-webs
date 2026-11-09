-- Huelsan Automoción · coches duplicados
-- Causa: BCA a veces vuelve a dar de alta el mismo coche en la misma subasta con otro número de lote interno (LotId).
-- La app guardaba cada LotId como un coche distinto, así que aparecía dos veces (mismo bastidor, misma subasta).
-- Solución: un coche = bastidor (VIN) + subasta.
--   · Al entrar un lote nuevo con un bastidor que ya está en esa subasta, se fusiona con el que había:
--     se conservan nuestras decisiones (estado, notas, precios, fotos, campos corregidos a mano…)
--     y se actualizan los datos de BCA (enlace nuevo, pujas, fotos de BCA…).
--   · Si el anterior ya es nuestro (comprado, stock, vendido), está publicado o tiene factura/folleto, se queda con su id
--     (para no romper facturas ni enlaces) y el lote nuevo no se crea.
--   · Si no, se queda el id nuevo (su enlace a BCA es el que funciona) y el anterior pasa a «lotes_archivo» con «duplicadoDe».
-- Se puede ejecutar más de una vez.

create index if not exists lotes_vin_subasta_idx on public.lotes ((data->>'vin'), subasta_id);

-- Junta los datos de BCA del lote nuevo sobre el documento anterior sin pisar lo nuestro
create or replace function public.fusionar_datos_lote(viejo jsonb, nuevo jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  protegidos text[] := array['id','estado','publico','importadoEn','notas','fotos','fotosWeb','precioCompra','precioVenta',
    'gastos','pujaMax','mercado','precioRemate','resultado','manual','tipoManual','miniatura','folleto','folletos','anuncio',
    'portales','textoVenta','facturaVenta','editado','idsBCA'];
  man jsonb := coalesce(viejo->'manual','{}'::jsonb);
  extra jsonb := '{}'::jsonb; k text; v jsonb;
begin
  for k, v in select * from jsonb_each(nuevo) loop
    continue when k = any(protegidos);
    continue when coalesce((man->>k)::boolean, false);
    continue when k = 'tipo' and coalesce((viejo->>'tipoManual')::boolean, false);
    continue when v = 'null'::jsonb or v = '""'::jsonb;
    extra := extra || jsonb_build_object(k, v);
  end loop;
  -- estimaciones de precio: solo si el anterior no tenía
  if viejo->'mercado' is null or viejo->'mercado' = 'null'::jsonb then
    if nuevo->'mercado' is not null then extra := extra || jsonb_build_object('mercado', nuevo->'mercado'); end if;
  end if;
  return viejo || extra;
end $$;

create or replace function public.lote_es_nuestro(d jsonb)
returns boolean language sql immutable as $$
  select coalesce(d->>'estado','nuevo') in ('comprado','stock','vendido')
      or coalesce((d->>'publico')::boolean,false)
      or d ? 'facturaVenta' or d ? 'folleto' or d ? 'folletos'
$$;

create or replace function public.lotes_evitar_duplicado()
returns trigger language plpgsql set search_path = public as $$
declare
  o record; destino text; datos jsonb; ids jsonb;
begin
  if coalesce(new.data->>'vin','') = '' or coalesce(new.data->>'subastaId','') = '' then return new; end if;
  if exists (select 1 from public.lotes where id = new.id) then return new; end if;   -- es una actualización (upsert)

  select * into o from public.lotes
   where data->>'vin' = new.data->>'vin' and subasta_id = new.data->>'subastaId' and id <> new.id
   order by public.lote_es_nuestro(data) desc, (estado <> 'nuevo') desc, actualizado desc
   limit 1;
  if not found then return new; end if;

  ids := coalesce(o.data->'idsBCA','[]'::jsonb) || to_jsonb(o.id) || to_jsonb(new.id);
  datos := public.fusionar_datos_lote(o.data, new.data) || jsonb_build_object('idsBCA', ids);

  if public.lote_es_nuestro(o.data) then destino := o.id; else destino := new.id; end if;
  datos := datos || jsonb_build_object('id', destino);

  -- los demás con el mismo bastidor en esa subasta, al archivo
  insert into public.lotes_archivo (id, data)
    select l.id, l.data || jsonb_build_object('duplicadoDe', destino) from public.lotes l
     where l.data->>'vin' = new.data->>'vin' and l.subasta_id = new.data->>'subastaId' and l.id <> destino and l.id <> new.id
  on conflict (id) do update set data = excluded.data, archivado = now();
  delete from public.lotes l
   where l.data->>'vin' = new.data->>'vin' and l.subasta_id = new.data->>'subastaId' and l.id <> destino and l.id <> new.id;

  if destino = o.id then
    update public.lotes set data = datos where id = o.id;
    return null;          -- no se crea el lote repetido
  end if;
  new.data := datos;
  return new;
end $$;

drop trigger if exists lotes_evitar_duplicado on public.lotes;
create trigger lotes_evitar_duplicado before insert on public.lotes
  for each row execute function public.lotes_evitar_duplicado();

-- Limpieza de los duplicados que ya existen (una vez; se puede repetir)
create or replace function public.fusionar_duplicados()
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  g record; mejor record; reciente record; destino text; datos jsonb; n_grupos int := 0; n_quitados int := 0; q int;
begin
  for g in
    select data->>'vin' vin, subasta_id sub from public.lotes
     where coalesce(data->>'vin','') <> '' and subasta_id is not null
     group by 1, 2 having count(*) > 1
  loop
    select * into reciente from public.lotes where data->>'vin' = g.vin and subasta_id = g.sub
      order by coalesce(data->>'importadoEn','') desc, actualizado desc limit 1;
    select * into mejor from public.lotes where data->>'vin' = g.vin and subasta_id = g.sub
      order by public.lote_es_nuestro(data) desc, (estado <> 'nuevo') desc, coalesce(data->>'importadoEn','') desc limit 1;
    if mejor.id = reciente.id then datos := mejor.data;
    else datos := public.fusionar_datos_lote(mejor.data, reciente.data); end if;
    destino := case when public.lote_es_nuestro(mejor.data) then mejor.id else reciente.id end;
    datos := datos || jsonb_build_object('id', destino, 'idsBCA',
      (select jsonb_agg(id order by id) from public.lotes where data->>'vin' = g.vin and subasta_id = g.sub));

    insert into public.lotes_archivo (id, data)
      select id, data || jsonb_build_object('duplicadoDe', destino) from public.lotes
       where data->>'vin' = g.vin and subasta_id = g.sub and id <> destino
    on conflict (id) do update set data = excluded.data, archivado = now();
    delete from public.lotes where data->>'vin' = g.vin and subasta_id = g.sub and id <> destino;
    get diagnostics q = row_count;
    update public.lotes set data = datos where id = destino;
    n_grupos := n_grupos + 1; n_quitados := n_quitados + q;
  end loop;
  return jsonb_build_object('coches', n_grupos, 'duplicados_quitados', n_quitados);
end $$;
revoke all on function public.fusionar_duplicados() from public, anon;
grant execute on function public.fusionar_duplicados() to authenticated;
-- select public.fusionar_duplicados();
