-- El dueño puede ocultar la página "Nosotros" a los clientes.
alter table public.site_settings add column if not exists show_nosotros boolean not null default true;
