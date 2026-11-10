-- Huelsan Automoción · búsquedas clave con avisos, reseñas de clientes, texto de venta en la web y formulario ampliado
-- Pegar entero en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez.
--
-- 1) BÚSQUEDAS CLAVE
--    Se guardan desde la app en ajustes «busquedas/<id>»: {nombre, clienteId, marca, modelo, combustibles[], tipos[],
--    anioMin, antiguedadMax, precioMax, kmMax, cvMin, cambio, activa, correo}.
--    Cada lote que entra (paquetes de la recogida en «entrantes/…» o lotes nuevos) se compara con las búsquedas activas;
--    los que encajan se apuntan en ajustes «coincidencias/<busqueda>~<bastidor o lote>» (pestaña «Búsquedas» de la app)
--    y una tarea cada 15 min manda un correo con las nuevas (función «avisos» de Supabase).
-- 2) RESEÑAS
--    La app crea una invitación en ajustes «resenas/<código>» y copia el enlace huelsanautomocion.com/opinion/?c=<código>.
--    El cliente rellena el cuestionario (función enviar_resena, sin sesión) y la reseña queda «recibida»;
--    solo sale en la web cuando la aprobáis en la app (se copia a «web/empresa» → resenas).
-- 3) TEXTO DE VENTA: la vista coches_web añade «descripcion» (campo textoVenta del lote).
-- 4) FORMULARIO DE LA WEB: marca, modelo, km, año, potencia y cilindrada (obligatorios en la versión nueva del formulario).

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- utilidades ----------
create or replace function public.norm_txt(t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(t,'')),'áàäâéèëêíìïîóòöôúùüûñç','aaaaeeeeiiiioooouuuunc'),'[^a-z0-9]','','g')
$$;

-- precio con el que se compara el presupuesto: venta si es nuestro; si no, el precio de BCA (salida, puja, reserva, compra ya)
create or replace function public.precio_ref_lote(l jsonb) returns numeric language sql immutable as $$
  select case when coalesce(l->>'estado','') in ('comprado','stock','vendido') and nullif(l->>'precioVenta','') is not null
              then (l->>'precioVenta')::numeric
         else coalesce(nullif(l->>'precioSalida','')::numeric,
                       case when coalesce(nullif(l->>'numPujas','')::numeric,0) > 0 then nullif(l->>'siguientePuja','')::numeric end,
                       nullif(l->>'precioReserva','')::numeric, nullif(l->>'precioCompraYa','')::numeric, nullif(l->>'precioGuia','')::numeric) end
$$;

create or replace function public.es_automatico(l jsonb) returns boolean language sql immutable as $$
  select coalesce(l->>'cambio','') ~* 'autom'
      or coalesce(l->>'derivado','') || ' ' || coalesce(l->>'modelo','')
         ~* '(\maut\M|autom|dsg|tiptronic|s[ -]?tronic|steptronic|\meat\d?\M|\medc\M|\mdct\M|xtronic|\mcvt\M|powershift|\mat\d\M)'
$$;

-- ¿encaja el lote con la búsqueda? (misma lógica que la app, ver extra.js → coincide())
create or replace function public.coincide_busqueda(b jsonb, l jsonb) returns boolean language plpgsql immutable as $$
declare
  t text; ok boolean; p numeric; anio_min int;
  texto text := public.norm_txt(concat_ws(' ', l->>'marca', l->>'modelo', l->>'derivado'));
begin
  if coalesce(l->>'estado','nuevo') in ('descartado','vendido') then return false; end if;
  if coalesce(b->>'marca','') <> '' and position(public.norm_txt(b->>'marca') in public.norm_txt(l->>'marca')) = 0 then return false; end if;
  if coalesce(b->>'modelo','') <> '' then
    ok := false;
    foreach t in array regexp_split_to_array(b->>'modelo', '\s*[,;/]\s*') loop
      if public.norm_txt(t) <> '' and position(public.norm_txt(t) in texto) > 0 then ok := true; end if;
    end loop;
    if not ok then return false; end if;
  end if;
  if jsonb_typeof(b->'combustibles') = 'array' and jsonb_array_length(b->'combustibles') > 0
     and not (b->'combustibles' ? coalesce(l->>'combustible','')) then return false; end if;
  if jsonb_typeof(b->'tipos') = 'array' and jsonb_array_length(b->'tipos') > 0
     and not (b->'tipos' ? coalesce(l->>'tipo','')) then return false; end if;
  anio_min := greatest(coalesce(nullif(b->>'anioMin','')::int, 0),
                       case when nullif(b->>'antiguedadMax','') is not null then extract(year from now())::int - (b->>'antiguedadMax')::int else 0 end);
  if anio_min > 0 and coalesce(nullif(l->>'anio','')::numeric, 0) < anio_min then return false; end if;
  if nullif(b->>'kmMax','') is not null and nullif(l->>'km','')::numeric > (b->>'kmMax')::numeric then return false; end if;
  if nullif(b->>'cvMin','') is not null and coalesce(nullif(l->>'cv','')::numeric, 0) < (b->>'cvMin')::numeric then return false; end if;
  if nullif(b->>'precioMax','') is not null then
    p := public.precio_ref_lote(l);
    if p is not null and p > (b->>'precioMax')::numeric then return false; end if;
  end if;
  if b->>'cambio' = 'Automático' and not public.es_automatico(l) then return false; end if;
  if b->>'cambio' = 'Manual' and public.es_automatico(l) then return false; end if;
  return true;
end $$;

-- compara una lista de lotes con las búsquedas activas y apunta las coincidencias nuevas
create or replace function public.apuntar_coincidencias(lotes jsonb, subastas jsonb default '[]'::jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare b record; l jsonb; s jsonb; clave text; n int := 0;
begin
  if jsonb_typeof(lotes) <> 'array' then return 0; end if;
  for b in select id, data from public.ajustes where id like 'busquedas/%' and coalesce((data->>'activa')::boolean, true) loop
    for l in select * from jsonb_array_elements(lotes) loop
      continue when coalesce(l->>'id','') = '';
      continue when (b.data->'ocultos') ? (l->>'id');
      continue when not public.coincide_busqueda(b.data, l);
      clave := 'coincidencias/' || substr(b.id, 11) || '~' || coalesce(nullif(l->>'vin',''), l->>'id') || '~' || coalesce(l->>'subastaId','');
      continue when exists (select 1 from public.ajustes where id = clave);
      s := coalesce(l->'subasta', (select x from jsonb_array_elements(subastas) x where x->>'id' = l->>'subastaId' limit 1));
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

-- paquetes de la recogida (extensión) → coincidencias en cuanto llegan, aunque nadie abra la app
create or replace function public.coincidencias_entrantes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id like 'entrantes/%' then
    perform public.apuntar_coincidencias(coalesce(new.data->'lotes','[]'::jsonb), coalesce(new.data->'subastas','[]'::jsonb));
  end if;
  return null;
end $$;
create or replace trigger ajustes_coincidencias after insert or update on public.ajustes
  for each row when (new.id like 'entrantes/%') execute function public.coincidencias_entrantes();

-- lotes nuevos (importados de Excel, añadidos a mano…)
create or replace function public.coincidencias_lote() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.apuntar_coincidencias(jsonb_build_array(new.data || jsonb_build_object('id', new.id)));
  return null;
end $$;
create or replace trigger lotes_coincidencias after insert on public.lotes
  for each row execute function public.coincidencias_lote();

-- ---------- reseñas ----------
-- datos mínimos para saludar al cliente en el cuestionario (nombre de pila y coche); nada más
create or replace function public.ver_invitacion_resena(c text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if c !~ '^[a-z0-9]{16,40}$' then return jsonb_build_object('ok', false); end if;
  select data into d from public.ajustes where id = 'resenas/' || c;
  if d is null then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'usada', coalesce(d->>'estado','invitada') <> 'invitada',
    'nombre', split_part(coalesce(d->>'cliente',''), ' ', 1), 'coche', d->>'coche');
end $$;
revoke all on function public.ver_invitacion_resena(text) from public;
grant execute on function public.ver_invitacion_resena(text) to anon, authenticated;

create or replace function public.enviar_resena(c text, r jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d jsonb;
  estrellas int := case when coalesce(r->>'estrellas','') ~ '^[1-5]$' then (r->>'estrellas')::int end;
  nombre text := left(btrim(coalesce(r->>'nombre','')), 60);
  texto text := left(btrim(coalesce(r->>'texto','')), 1200);
  localidad text := left(btrim(coalesce(r->>'localidad','')), 60);
  recomienda text := left(coalesce(r->>'recomienda',''), 10);
  aspectos jsonb;
begin
  if coalesce(r->>'web','') <> '' then return jsonb_build_object('ok', true); end if;   -- campo trampa
  if c !~ '^[a-z0-9]{16,40}$' then raise exception 'El enlace no es válido.'; end if;
  select data into d from public.ajustes where id = 'resenas/' || c for update;
  if d is null then raise exception 'El enlace no es válido.'; end if;
  if coalesce(d->>'estado','invitada') <> 'invitada' then raise exception 'Ya hemos recibido tu opinión. ¡Gracias!'; end if;
  if estrellas is null then raise exception 'Elige de 1 a 5 estrellas.'; end if;
  if char_length(nombre) < 2 then raise exception 'Escribe el nombre con el que quieres que aparezca tu opinión.'; end if;
  if char_length(texto) < 10 then raise exception 'Cuéntanos un poco más sobre tu experiencia.'; end if;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into aspectos
    from jsonb_each_text(case when jsonb_typeof(r->'aspectos') = 'object' then r->'aspectos' else '{}'::jsonb end) e(k, v)
   where k in ('atencion','coche','rapidez','precio','tramites') and v ~ '^[1-5]$';
  update public.ajustes set data = data || jsonb_strip_nulls(jsonb_build_object(
    'estado', 'recibida', 'avisado', false,
    'respuesta', jsonb_strip_nulls(jsonb_build_object('estrellas', estrellas, 'nombre', nombre, 'texto', texto,
       'localidad', nullif(localidad,''), 'recomienda', nullif(recomienda,''), 'aspectos', aspectos,
       'publicar', coalesce((r->>'publicar')::boolean, false))),
    'recibida', to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')))
   where id = 'resenas/' || c;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.enviar_resena(text, jsonb) from public;
grant execute on function public.enviar_resena(text, jsonb) to anon, authenticated;

-- ---------- avisos por correo (función «avisos»), cada 15 minutos si hay algo pendiente ----------
create or replace function public.lanzar_avisos() returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.ajustes
              where (id like 'coincidencias/%' or id like 'resenas/%') and data->>'avisado' = 'false') then
    perform net.http_post(
      url := 'https://ajxdzchffqaphkmetswx.supabase.co/functions/v1/avisos',
      headers := jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_8n9P6btJois-b7B3-kNTTQ_YG6D4S1X'),
      body := '{}'::jsonb);
  end if;
end $$;
revoke all on function public.lanzar_avisos() from public, anon, authenticated;
-- (cron.schedule con el mismo nombre sustituye la tarea si ya existe; la función «avisos» borra las coincidencias de más de 60 días)
select cron.schedule('huelsan-avisos', '*/15 * * * *', 'select public.lanzar_avisos()');

-- ---------- web pública: texto de venta ----------
create or replace view public.coches_web as
select
  'h' || left(md5('huelsan' || l.id), 8)                       as id,
  l.data->>'marca'                                              as marca,
  l.data->>'modelo'                                             as modelo,
  l.data->>'derivado'                                           as version,
  round(nullif(l.data->>'anio','')::numeric)::int               as anio,
  round(nullif(l.data->>'km','')::numeric)::int                 as km,
  l.data->>'combustible'                                        as combustible,
  round(nullif(l.data->>'cv','')::numeric)::int                 as cv,
  nullif(l.data->>'motor','')::numeric                          as motor,
  l.data->>'cambio'                                             as cambio,
  l.data->>'tipo'                                               as tipo,
  round(nullif(l.data->>'plazas','')::numeric)::int             as plazas,
  l.data->>'color'                                              as color,
  l.data->>'equipamiento'                                       as equipamiento,
  case when l.estado in ('comprado','stock') then 'stock' else 'encargo' end as disponibilidad,
  case when l.estado in ('comprado','stock') then null else l.subasta_fin end as caduca,
  nullif(l.data->>'precioVenta','')::numeric                    as precio,
  coalesce(l.data->'fotosWeb','[]'::jsonb)                      as fotos,
  nullif(btrim(l.data->>'textoVenta'),'')                       as descripcion,
  nullif(l.data->>'etiquetaDGT','')                             as etiqueta,
  l.actualizado                                                 as actualizado
from public.lotes l
where l.publico
  and l.estado not in ('vendido','descartado')
  and (l.estado in ('comprado','stock') or (l.subasta_fin is not null and l.subasta_fin::timestamptz > now()));
grant select on public.coches_web to anon, authenticated;

-- ---------- formulario de la web (versión 2: marca, modelo, km, antigüedad, potencia y cilindrada; todo obligatorio) ----------
-- Las páginas antiguas (sin «v»: 2) siguen funcionando como antes.
create or replace function public.enviar_solicitud(s jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nombre    text := left(btrim(coalesce(s->>'nombre','')), 80);
  telefono  text := left(btrim(coalesce(s->>'telefono','')), 20);
  tel_dig   text := regexp_replace(coalesce(s->>'telefono',''), '\D', '', 'g');
  email     text := left(btrim(coalesce(s->>'email','')), 120);
  marca     text := left(btrim(coalesce(s->>'marca','')), 120);
  extra     text := left(btrim(coalesce(s->>'extra','')), 1200);
  residencia text := left(btrim(coalesce(s->>'residencia','')), 80);
  presupuesto text := left(btrim(coalesce(s->>'presupuesto','')), 60);
  combustible text := left(btrim(coalesce(s->>'combustible','')), 40);
  cambio    text := left(btrim(coalesce(s->>'cambio','')), 40);
  plazo     text := left(btrim(coalesce(s->>'plazo','')), 60);
  modelo    text := left(btrim(coalesce(s->>'modelo','')), 120);
  km_txt    text := left(btrim(coalesce(s->>'km','')), 60);
  anio_txt  text := left(btrim(coalesce(s->>'antiguedad','')), 60);
  cv_txt    text := left(btrim(coalesce(s->>'potencia','')), 60);
  cil_txt   text := left(btrim(coalesce(s->>'cilindrada','')), 60);
  v2        boolean := coalesce((s->>'v')::int, 1) >= 2;
  kmmax     numeric := case when coalesce(s->>'kmMax','') ~ '^\d{4,7}$' then (s->>'kmMax')::numeric end;
  antig     int := case when coalesce(s->>'antiguedadMax','') ~ '^\d{1,2}$' then (s->>'antiguedadMax')::int end;
  cvmin     int := case when coalesce(s->>'cvMin','') ~ '^\d{2,4}$' then (s->>'cvMin')::int end;
  motmin    numeric := case when coalesce(s->>'motorMin','') ~ '^\d(\.\d)?$' then (s->>'motorMin')::numeric end;
  motmax    numeric := case when coalesce(s->>'motorMax','') ~ '^\d(\.\d)?$' then (s->>'motorMax')::numeric end;
  tipos_txt text;
  tipos     jsonb;
  combus    jsonb;
  pmax      numeric;
  notas     text;
  nuevo_id  text;
  -- valores que entiende la app (mismas listas que la ficha de cliente)
  tipos_ok  text[] := array['Utilitario','Compacto','Berlina','Familiar','Monovolumen','SUV','4x4','Deportivo','Descapotable','Furgoneta','Comercial'];
  combus_ok text[] := array['Diésel','Gasolina','Híbrido','Híbrido enchufable','Eléctrico','GLP/GNC'];
begin
  -- Campo trampa: los robots lo rellenan, las personas no lo ven. Se responde «ok» sin guardar nada.
  if coalesce(s->>'web','') <> '' then
    return jsonb_build_object('ok', true);
  end if;

  if char_length(nombre) < 2 then raise exception 'Escribe tu nombre.'; end if;
  if char_length(tel_dig) < 9 or char_length(tel_dig) > 15 then raise exception 'Escribe un teléfono de contacto válido.'; end if;
  if email <> '' and email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Revisa el correo electrónico.'; end if;
  -- formulario nuevo (v2): todas las preguntas son obligatorias
  if v2 then
    if coalesce(jsonb_typeof(s->'tiposTexto'),'') <> 'array' or jsonb_array_length(s->'tiposTexto') = 0 then raise exception 'Elige el tipo de vehículo.'; end if;
    if char_length(marca) < 2 then raise exception 'Escribe la marca que te interesa.'; end if;
    if char_length(modelo) < 1 then raise exception 'Escribe el modelo que te interesa.'; end if;
    if presupuesto = '' then raise exception 'Elige tu presupuesto.'; end if;
    if km_txt = '' then raise exception 'Elige el kilometraje máximo.'; end if;
    if anio_txt = '' then raise exception 'Elige la antigüedad máxima.'; end if;
    if combustible = '' then raise exception 'Elige el combustible.'; end if;
    if cambio = '' then raise exception 'Elige el tipo de cambio.'; end if;
    if cv_txt = '' then raise exception 'Elige la potencia.'; end if;
    if cil_txt = '' then raise exception 'Elige la cilindrada.'; end if;
    if plazo = '' then raise exception 'Dinos para cuándo lo necesitas.'; end if;
    if char_length(extra) < 3 then raise exception 'Cuéntanos qué características buscas.'; end if;
    if char_length(residencia) < 2 then raise exception 'Dinos dónde resides.'; end if;
    if email = '' then raise exception 'Escribe tu correo electrónico.'; end if;
  end if;
  if coalesce((s->>'privacidad')::boolean, false) is not true then raise exception 'Acepta la política de privacidad para continuar.'; end if;

  -- Límites contra abusos: 20 solicitudes por hora en total y 3 al día por teléfono
  if (select count(*) from public.demandas where id like 'web-%' and actualizado > now() - interval '1 hour') >= 20 then
    raise exception 'Ahora mismo estamos recibiendo muchas solicitudes. Inténtalo de nuevo en un rato.';
  end if;
  if (select count(*) from public.demandas
       where id like 'web-%' and actualizado > now() - interval '1 day'
         and right(regexp_replace(coalesce(data->>'telefono',''), '\D', '', 'g'), 9) = right(tel_dig, 9)) >= 3 then
    raise exception 'Ya hemos recibido tu solicitud. Te llamaremos muy pronto.';
  end if;

  select coalesce(jsonb_agg(distinct t), '[]'::jsonb) into tipos
    from jsonb_array_elements_text(case when jsonb_typeof(s->'tipos') = 'array' then s->'tipos' else '[]'::jsonb end) t
   where t = any(tipos_ok);
  select coalesce(jsonb_agg(distinct t), '[]'::jsonb) into combus
    from jsonb_array_elements_text(case when jsonb_typeof(s->'combustibles') = 'array' then s->'combustibles' else '[]'::jsonb end) t
   where t = any(combus_ok);
  select string_agg(left(t, 40), ', ') into tipos_txt
    from (select t from jsonb_array_elements_text(case when jsonb_typeof(s->'tiposTexto') = 'array' then s->'tiposTexto' else '[]'::jsonb end) t limit 8) x;
  pmax := case when coalesce(s->>'presupuestoMax','') ~ '^\d{3,7}(\.\d+)?$' then (s->>'presupuestoMax')::numeric end;

  notas := concat_ws(E'\n',
    case when tipos_txt is not null then 'Tipo: ' || tipos_txt end,
    case when marca <> '' then (case when v2 then 'Marca: ' else 'Marca o modelo: ' end) || marca end,
    case when modelo <> '' then 'Modelo: ' || modelo end,
    case when km_txt <> '' then 'Kilometraje: ' || km_txt end,
    case when anio_txt <> '' then 'Antigüedad: ' || anio_txt end,
    case when cv_txt <> '' then 'Potencia: ' || cv_txt end,
    case when cil_txt <> '' then 'Cilindrada: ' || cil_txt end,
    case when presupuesto <> '' then 'Presupuesto: ' || presupuesto end,
    case when combustible <> '' then 'Combustible: ' || combustible end,
    case when cambio <> '' then 'Cambio: ' || cambio end,
    case when plazo <> '' then 'Plazo: ' || plazo end,
    case when residencia <> '' then 'Reside en: ' || residencia end,
    case when extra <> '' then 'Imprescindible: ' || extra end);

  nuevo_id := 'web-' || to_char(now() at time zone 'Europe/Madrid', 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

  insert into public.demandas (id, data) values (nuevo_id, jsonb_strip_nulls(jsonb_build_object(
    'id', nuevo_id,
    'nombre', nombre,
    'telefono', telefono,
    'email', nullif(email, ''),
    'marca', nullif(marca, ''),
    'modelo', nullif(modelo, ''),
    'kmMax', kmmax,
    'anioMin', case when antig is not null then extract(year from now())::int - antig end,
    'cvMin', cvmin,
    'motorMin', motmin,
    'motorMax', motmax,
    'presupuestoMax', pmax,
    'tipos', tipos,
    'combustibles', combus,
    'cambio', nullif(cambio, ''),
    'plazo', nullif(plazo, ''),
    'residencia', nullif(residencia, ''),
    'notas', nullif(notas, ''),
    'origen', 'web',
    'estado', 'activa',
    'creado', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'avisado', false,
    'privacidadAceptada', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )));

  return jsonb_build_object('ok', true, 'id', nuevo_id);
end $$;

revoke all on function public.enviar_solicitud(jsonb) from public;
grant execute on function public.enviar_solicitud(jsonb) to anon, authenticated;
