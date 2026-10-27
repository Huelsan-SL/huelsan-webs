-- Huelsan Automoción · funciones y tiempo real (ejecutar después de 01-estructura.sql)

-- Mezcla campos en el documento de un registro (equivale a «update» de la app).
-- Devuelve false si el registro no existe. Respeta las reglas de seguridad (security invoker).
create or replace function public.merge_doc(tabla text, doc_id text, patch jsonb)
returns boolean language plpgsql security invoker as $$
declare n int;
begin
  if tabla not in ('lotes','subastas','demandas','miniaturas','ajustes') then
    raise exception 'tabla no permitida: %', tabla;
  end if;
  execute format('update public.%I set data = data || $1 where id = $2', tabla) using patch, doc_id;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.merge_doc(text,text,jsonb) from public, anon;
grant execute on function public.merge_doc(text,text,jsonb) to authenticated;

-- Cambios en tiempo real para que los dos veáis lo mismo a la vez
do $$ declare t text; begin
  foreach t in array array['lotes','subastas','demandas','miniaturas','ajustes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop; end $$;

-- Fotos internas: carpeta con nombres aleatorios, visible por enlace (las de la web ya eran públicas)
update storage.buckets set public = true where id = 'fotos';
