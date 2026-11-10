-- Huelsan Automoción · búsquedas guardadas desde los filtros de Subastas (10/11/2026, migración 12_busquedas_filtros)
-- Una búsqueda «busquedas/<id>» puede ser sencilla (marca, modelo… → coincide_busqueda, ver 08) o llevar «filtros»
-- (los filtros del panel de Subastas → pasa_filtros, copia de passes() de gestion/index.html sin los filtros de margen,
-- que dependen de la estimación de mercado y en una recogida nueva aún no existe).
-- Avisos: un mismo coche (bastidor) solo se apunta y se avisa una vez por búsqueda, aunque salga en varias recogidas
-- o vuelva a otra subasta. Si la búsqueda tiene «correo»: false, se apunta en la app pero no se manda correo.

create or replace function public.f_rng(v numeric, mn text, mx text, u boolean) returns boolean language sql immutable as $$
  select case when v is null then u or (coalesce(mn,'') = '' and coalesce(mx,'') = '')
              else (coalesce(mn,'') = '' or v >= mn::numeric) and (coalesce(mx,'') = '' or v <= mx::numeric) end
$$;
create or replace function public.f_num(t text) returns numeric language sql immutable as $$
  select case when t ~ '^\s*-?\d+(\.\d+)?\s*$' then t::numeric end
$$;

create or replace function public.pasa_filtros(f jsonb, l jsonb) returns boolean language plpgsql immutable as $$
declare
  u boolean := coalesce((f->>'incluirDesconocidos')::boolean, true);
  s jsonb := case when jsonb_typeof(l->'subasta') = 'object' then l->'subasta' else '{}'::jsonb end;
  anio numeric := public.f_num(l->>'anio'); km numeric := public.f_num(l->>'km');
  ref numeric := public.precio_ref_lote(l - 'estado');
  ky numeric; edad numeric; g text; ks text;
begin
  if coalesce(l->>'estado','nuevo') in ('descartado','vendido','comprado','stock') then return false; end if;
  if f->>'modo' = 'online' and not coalesce((l->>'online')::boolean, (s->>'online')::boolean, false) then return false; end if;
  if coalesce(f->>'subUbic','') <> '' and coalesce(s->>'ubicacion','') <> f->>'subUbic' then return false; end if;
  if coalesce(f->>'q','') <> '' and position(lower(f->>'q') in lower(concat_ws(' ', l->>'marca', l->>'modelo', l->>'derivado', l->>'matricula', l->>'color'))) = 0 then return false; end if;
  if not public.f_rng(anio, f->>'anioMin', f->>'anioMax', u) then return false; end if;
  if not public.f_rng(ref, f->>'precioMin', f->>'precioMax', u) then return false; end if;
  if not public.f_rng(km, '', f->>'kmMax', u) then return false; end if;
  if not public.f_rng(public.f_num(l->>'duenos'), '', f->>'duenosMax', u) then return false; end if;
  if coalesce(f->>'libro','any') <> 'any' then
    if l->'libro' is null or l->'libro' = 'null'::jsonb then if not u then return false; end if;
    elsif (l->>'libro')::boolean <> (f->>'libro' = 'si') then return false; end if;
  end if;
  if coalesce((f->>'sinAverias')::boolean,false) and (l->>'averias' = 'true' or (not u and l->'averias' is null)) then return false; end if;
  if coalesce((f->>'sinAccidentes')::boolean,false) and (l->>'accidentes' = 'true' or (not u and l->'accidentes' is null)) then return false; end if;
  if coalesce((f->>'sinManip')::boolean,false) then
    ks := case when l->>'manipKm' = 'true' then 'si' when l->>'manipKm' = 'false' then 'no' end;
    if ks is null and anio is not null and km is not null then
      edad := extract(year from now()) - anio;
      if edad >= 4 then ky := km / greatest(edad, 1); if ky < 5000 then ks := 'revisar'; end if; end if;
    end if;
    if ks in ('si','revisar') or (not u and ks is null) then return false; end if;
  end if;
  if jsonb_typeof(f->'comb') = 'array' and jsonb_array_length(f->'comb') > 0 and not (f->'comb' ? coalesce(l->>'combustible','')) then return false; end if;
  if not public.f_rng(public.f_num(l->>'cv'), f->>'cvMin', f->>'cvMax', u) then return false; end if;
  if not public.f_rng(public.f_num(l->>'motor'), f->>'motorMin', f->>'motorMax', u) then return false; end if;
  if jsonb_typeof(f->'tipos') = 'array' and jsonb_array_length(f->'tipos') > 0 and not (f->'tipos' ? coalesce(l->>'tipo','')) then return false; end if;
  if coalesce(f->>'plazasMin','') <> '' then
    if public.f_num(l->>'plazas') is null then if not u then return false; end if;
    elsif public.f_num(l->>'plazas') < (f->>'plazasMin')::numeric then return false; end if;
  end if;
  if jsonb_typeof(f->'zonas') = 'array' and jsonb_array_length(f->'zonas') > 0 and not (f->'zonas' ? coalesce(l->>'ubicacion','')) then return false; end if;
  if coalesce(f->>'iva','any') <> 'any' then
    if coalesce(l->>'iva','') = '' then if not u then return false; end if;
    elsif l->>'iva' <> f->>'iva' then return false; end if;
  end if;
  if jsonb_typeof(f->'proced') = 'array' and jsonb_array_length(f->'proced') > 0 and not (f->'proced' ? coalesce(l->>'procedencia','')) then return false; end if;
  if coalesce((f->>'sinImportados')::boolean,false) and (l->>'importado' = 'true' or (not u and l->'importado' is null)) then return false; end if;
  if coalesce(f->>'mecMax','') <> '' then
    g := upper(btrim(coalesce(l->>'gradoMecanico','')));
    if g !~ '^[A-E]$' then if f->>'mecMax' <> 'D' then return false; end if;
    elsif g > f->>'mecMax' then return false; end if;
  end if;
  if coalesce(f->>'danosMax','') <> '' and public.f_num(l->>'danosClasif') > (f->>'danosMax')::numeric then return false; end if;
  return true;
end $$;

create or replace function public.apuntar_coincidencias(lotes jsonb, subastas jsonb default '[]'::jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare b record; l jsonb; s jsonb; clave text; n int := 0; ok boolean;
begin
  if jsonb_typeof(lotes) <> 'array' then return 0; end if;
  for b in select id, data from public.ajustes where id like 'busquedas/%' and coalesce((data->>'activa')::boolean, true) loop
    for l in select * from jsonb_array_elements(lotes) loop
      continue when coalesce(l->>'id','') = '';
      continue when (b.data->'ocultos') ? (l->>'id');
      s := coalesce(case when jsonb_typeof(l->'subasta') = 'object' then l->'subasta' end,
                    (select x from jsonb_array_elements(subastas) x where x->>'id' = l->>'subastaId' limit 1));
      if jsonb_typeof(b.data->'filtros') = 'object' then
        ok := public.pasa_filtros(b.data->'filtros', case when s is not null then l || jsonb_build_object('subasta', s) else l end);
      else
        ok := public.coincide_busqueda(b.data, l);
      end if;
      continue when not ok;
      clave := 'coincidencias/' || substr(b.id, 11) || '~' || coalesce(nullif(l->>'vin',''), l->>'id');
      continue when exists (select 1 from public.ajustes where id = clave or id like clave || '~%');
      insert into public.ajustes (id, data) values (clave, jsonb_strip_nulls(jsonb_build_object(
        'id', substr(clave, 15), 'busqueda', substr(b.id, 11), 'busquedaNombre', b.data->>'nombre', 'lote', l->>'id', 'vin', l->>'vin',
        'titulo', concat_ws(' ', l->>'marca', coalesce(l->>'derivado', l->>'modelo')), 'anio', l->'anio', 'km', l->'km', 'cv', l->'cv',
        'combustible', l->>'combustible', 'precio', public.precio_ref_lote(l), 'matricula', l->>'matricula',
        'subasta', s->>'nombre', 'sede', s->>'ubicacion', 'cierre', coalesce(l->>'cierreLote', s->>'fin'), 'url', l->>'url',
        'creado', to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'visto', false,
        'avisado', not coalesce((b.data->>'correo')::boolean, true))))
      on conflict (id) do nothing;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.apuntar_coincidencias(jsonb, jsonb) from public, anon;
grant execute on function public.apuntar_coincidencias(jsonb, jsonb) to authenticated;
