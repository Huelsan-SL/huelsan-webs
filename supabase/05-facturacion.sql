-- Huelsan Automoción · facturación (31/10/2026)
-- Pegar entero en Supabase → SQL Editor → New query → Run. Se puede ejecutar más de una vez.
--
-- Las facturas, clientes y gastos se guardan en «ajustes» (como el resto de colecciones de la app):
--   facturas/<id>, clientes/<id>, gastos/<id>, facturacion/emisor, facturacion/contador/<serie><año>
-- La numeración la asigna SIEMPRE la base de datos al emitir (emitir_factura), bloqueando el contador:
-- es correlativa por serie y año, sin saltos ni duplicados aunque emitáis los dos a la vez.
--   Serie F (ordinarias): 2026-0001, 2026-0002…   Serie R (rectificativas): R2026-0001…
-- Una factura emitida no se puede cambiar ni borrar (lo impide un disparador). Solo:
--   · rectificarla o anularla con una factura rectificativa (serie R), o
--   · deshacer la emisión si es la ÚLTIMA de su serie y no se ha entregado al cliente (su número se reutiliza).
-- Cada factura emitida guarda una huella SHA-256 encadenada con la anterior de su serie (como pide VERI*FACTU).

-- ---------- utilidades ----------
drop function if exists public.fact_permitir();

create or replace function public.fact_codigo(serie text, anio int, n int) returns text language sql immutable as $$
  select case when serie = 'R' then 'R' else '' end || anio::text || '-' || lpad(n::text, 4, '0') $$;

-- ---------- protección de facturas emitidas y contadores ----------
-- Campos que se pueden tocar en una factura emitida (no fiscales)
create or replace function public.fact_proteger() returns trigger language plpgsql as $$
declare libres text[] := array['entregada','entregadaEn','cobros','notasInternas','pdfDescargado','historial','actualizadoPor'];
        k text; o jsonb; n jsonb;
begin
  if coalesce(current_setting('huelsan.fact', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op in ('UPDATE','DELETE') and old.id like 'facturacion/contador/%' then
    raise exception 'El contador de facturas solo lo cambia la base de datos al emitir.';
  end if;
  if tg_op = 'INSERT' and new.id like 'facturacion/contador/%' then
    raise exception 'El contador de facturas solo lo crea la base de datos al emitir.';
  end if;
  if tg_op = 'DELETE' then
    if old.id like 'facturas/%' and coalesce(old.data->>'estado','borrador') <> 'borrador' then
      raise exception 'Una factura emitida no se puede borrar: rectifícala o anúlala.';
    end if;
    return old;
  end if;
  if new.id like 'facturas/%' then
    if tg_op = 'INSERT' and coalesce(new.data->>'estado','borrador') <> 'borrador' then
      raise exception 'Las facturas se crean como borrador y se emiten con «Emitir».';
    end if;
    if tg_op = 'UPDATE' then
      if coalesce(old.data->>'estado','borrador') = 'borrador' then
        if coalesce(new.data->>'estado','borrador') <> 'borrador' or new.data ? 'numero' or new.data ? 'codigo' or new.data ? 'huella' then
          raise exception 'El número de factura solo lo asigna la base de datos al emitir.';
        end if;
      else
        o := old.data; n := new.data;
        foreach k in array libres loop o := o - k; n := n - k; end loop;
        if o is distinct from n then
          raise exception 'La factura % ya está emitida: no se puede modificar. Haz una rectificativa.', old.data->>'codigo';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ajustes_fact_proteger on public.ajustes;
create trigger ajustes_fact_proteger before insert or update or delete on public.ajustes
  for each row execute function public.fact_proteger();

-- ---------- emitir ----------
create or replace function public.emitir_factura(fid text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare f jsonb; e jsonb; c jsonb; serie text; anio int; n int; codigo text; fecha date; ant text; huella text;
        cid text; total numeric; orig jsonb; oid text;
begin
  perform set_config('huelsan.fact', 'on', true);
  select data into f from ajustes where id = 'facturas/' || fid for update;
  if f is null then raise exception 'No existe la factura.'; end if;
  if coalesce(f->>'estado','borrador') <> 'borrador' then raise exception 'La factura ya está emitida (%).', f->>'codigo'; end if;
  select data into e from ajustes where id = 'facturacion/emisor';
  if e is null or coalesce(e->>'nif','') = '' or coalesce(e->>'razonSocial','') = '' then
    raise exception 'Faltan nuestros datos fiscales (razón social y NIF) en «Datos fiscales».'; end if;
  if coalesce(f#>>'{cliente,nif}','') = '' or coalesce(f#>>'{cliente,nombre}','') = '' then
    raise exception 'Faltan el nombre y el NIF del cliente.'; end if;
  if jsonb_typeof(f->'lineas') <> 'array' or jsonb_array_length(f->'lineas') = 0 then
    raise exception 'La factura no tiene ninguna línea.'; end if;
  fecha := coalesce(nullif(f->>'fechaExpedicion','')::date, current_date);
  anio := extract(year from fecha)::int;
  serie := case when f->>'tipo' = 'rectificativa' then 'R' else 'F' end;
  cid := 'facturacion/contador/' || serie || anio;
  insert into ajustes (id, data) values (cid, jsonb_build_object('ultimo', 0)) on conflict (id) do nothing;
  select data into c from ajustes where id = cid for update;
  if c->>'ultimaFecha' is not null and fecha < (c->>'ultimaFecha')::date then
    raise exception 'La fecha (%) es anterior a la de la última factura de la serie (%): las facturas deben ir en orden de fecha.',
      to_char(fecha,'DD/MM/YYYY'), to_char((c->>'ultimaFecha')::date,'DD/MM/YYYY'); end if;
  n := coalesce((c->>'ultimo')::int, 0) + 1;
  codigo := fact_codigo(serie, anio, n);
  ant := coalesce(c->>'ultimaHuella', '');
  total := coalesce((f#>>'{totales,total}')::numeric, 0);
  huella := encode(sha256(convert_to(concat_ws('|', e->>'nif', codigo, to_char(fecha,'DD-MM-YYYY'),
             f#>>'{cliente,nif}', to_char(total,'FM999999990.00'), ant), 'UTF8')), 'hex');
  update ajustes set data = data || jsonb_build_object(
      'estado', 'emitida', 'serie', serie, 'anio', anio, 'numero', n, 'codigo', codigo,
      'fechaExpedicion', to_char(fecha,'YYYY-MM-DD'), 'emisor', e, 'emitidaEn', now(),
      'huella', huella, 'huellaAnterior', ant, 'entregada', false,
      'historial', coalesce(data->'historial','[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha', now(), 'accion', 'Emitida ' || codigo)))
    where id = 'facturas/' || fid;
  update ajustes set data = data || jsonb_build_object('ultimo', n, 'ultimaHuella', huella, 'ultimoId', fid, 'ultimaFecha', to_char(fecha,'YYYY-MM-DD'))
    where id = cid;
  -- rectificativa: deja constancia en la original
  oid := f#>>'{rectifica,id}';
  if serie = 'R' and oid is not null then
    select data into orig from ajustes where id = 'facturas/' || oid for update;
    if orig is not null then
      update ajustes set data = data || jsonb_build_object(
          'rectificadaPor', coalesce(data->'rectificadaPor','[]'::jsonb) || jsonb_build_array(jsonb_build_object('id', fid, 'codigo', codigo, 'tipo', f#>>'{rectifica,tipo}')),
          'estado', case when f#>>'{rectifica,tipo}' in ('anulacion','sustitucion') then 'rectificada' else data->>'estado' end,
          'anulada', (f#>>'{rectifica,tipo}') = 'anulacion' or coalesce((data->>'anulada')::boolean, false),
          'historial', coalesce(data->'historial','[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha', now(), 'accion',
             case when f#>>'{rectifica,tipo}' = 'anulacion' then 'Anulada por ' else 'Rectificada por ' end || codigo)))
        where id = 'facturas/' || oid;
    end if;
  end if;
  return jsonb_build_object('codigo', codigo, 'numero', n, 'serie', serie, 'anio', anio, 'huella', huella);
end $$;

-- ---------- deshacer la última emisión ----------
create or replace function public.deshacer_emision(fid text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare f jsonb; c jsonb; cid text; prev_id text; prev jsonb; oid text;
begin
  perform set_config('huelsan.fact', 'on', true);
  select data into f from ajustes where id = 'facturas/' || fid for update;
  if f is null or coalesce(f->>'estado','borrador') = 'borrador' then raise exception 'La factura no está emitida.'; end if;
  if coalesce((f->>'entregada')::boolean, false) then raise exception 'La factura % ya se entregó al cliente: hay que rectificarla o anularla.', f->>'codigo'; end if;
  if jsonb_typeof(f->'rectificadaPor') = 'array' and jsonb_array_length(f->'rectificadaPor') > 0 then
    raise exception 'La factura % tiene rectificativas: no se puede deshacer.', f->>'codigo'; end if;
  cid := 'facturacion/contador/' || (f->>'serie') || (f->>'anio');
  select data into c from ajustes where id = cid for update;
  if (c->>'ultimo')::int <> (f->>'numero')::int then
    raise exception 'Solo se puede deshacer la última factura de la serie (la última es %).', fact_codigo(f->>'serie', (f->>'anio')::int, (c->>'ultimo')::int); end if;
  select id, data into prev_id, prev from ajustes
    where id like 'facturas/%' and data->>'serie' = f->>'serie' and data->>'anio' = f->>'anio'
      and (data->>'numero')::int = (f->>'numero')::int - 1 limit 1;
  update ajustes set data = (data - 'numero' - 'codigo' - 'serie' - 'anio' - 'emisor' - 'emitidaEn' - 'huella' - 'huellaAnterior' - 'entregada')
      || jsonb_build_object('estado', 'borrador', 'historial', coalesce(data->'historial','[]'::jsonb) ||
         jsonb_build_array(jsonb_build_object('fecha', now(), 'accion', 'Emisión deshecha (' || (f->>'codigo') || ' queda libre)')))
    where id = 'facturas/' || fid;
  update ajustes set data = data || jsonb_build_object('ultimo', (f->>'numero')::int - 1,
      'ultimaHuella', coalesce(f->>'huellaAnterior',''), 'ultimoId', replace(coalesce(prev_id,''), 'facturas/', ''),
      'ultimaFecha', prev->>'fechaExpedicion')
    where id = cid;
  oid := f#>>'{rectifica,id}';
  if f->>'serie' = 'R' and oid is not null then
    update ajustes set data = data || jsonb_build_object(
        'rectificadaPor', coalesce((select jsonb_agg(x) from jsonb_array_elements(data->'rectificadaPor') x where x->>'id' <> fid), '[]'::jsonb),
        'estado', 'emitida', 'anulada', false,
        'historial', coalesce(data->'historial','[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha', now(), 'accion', 'Rectificativa ' || (f->>'codigo') || ' deshecha')))
      where id = 'facturas/' || oid;
  end if;
  return jsonb_build_object('liberado', f->>'codigo');
end $$;

revoke all on function public.emitir_factura(text) from public, anon;
revoke all on function public.deshacer_emision(text) from public, anon;
grant execute on function public.emitir_factura(text) to authenticated;
grant execute on function public.deshacer_emision(text) to authenticated;

-- ---------- facturas de compra y gastos (almacén privado) ----------
insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false) on conflict (id) do update set public = false;
drop policy if exists "equipo documentos" on storage.objects;
create policy "equipo documentos" on storage.objects for all to authenticated
  using (bucket_id = 'documentos') with check (bucket_id = 'documentos');
