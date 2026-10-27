-- Datos de empresa para la web pública: se guardan desde la app de gestión en ajustes con id «web/empresa»
-- y la web los lee con esta vista (solo ese registro; nada más de la tabla ajustes).
create or replace view public.empresa_web as
  select data from public.ajustes where id = 'web/empresa';
grant select on public.empresa_web to anon, authenticated;
