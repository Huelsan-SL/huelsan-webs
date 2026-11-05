-- Huelsan Automoción · solicitudes del formulario «Solicita tu búsqueda personalizada» de la web pública
-- Pegar entero en Supabase → SQL Editor → New query → Run. Se puede ejecutar más de una vez sin romper nada.
--
-- La web pública no puede escribir en las tablas: solo puede llamar a esta función, que comprueba
-- los datos, limita los envíos para evitar abusos y guarda la solicitud como una petición de cliente
-- (pestaña Clientes de la app, con la etiqueta «Desde la web»).

create index if not exists demandas_web_idx on public.demandas (actualizado) where id like 'web-%';

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
    case when marca <> '' then 'Marca o modelo: ' || marca end,
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

-- Comprobación rápida (no guarda nada): debe devolver el error «Escribe tu nombre.»
-- select public.enviar_solicitud('{"nombre":"","telefono":"600000000","privacidad":true}');
