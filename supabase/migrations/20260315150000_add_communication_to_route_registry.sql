-- BYFROST — Register Communication Route
-- Adds the communication module to the route registry for access matrix delegation.

insert into public.route_registry (key, name, category, path_pattern, description, is_system)
values (
  'app.communication',
  'Comunicação',
  'App',
  '/app/communication',
  'Módulo de chat interno e canais',
  true
)
on conflict (key) do update
set name = excluded.name,
    category = excluded.category,
    path_pattern = excluded.path_pattern,
    description = excluded.description,
    is_system = excluded.is_system;
