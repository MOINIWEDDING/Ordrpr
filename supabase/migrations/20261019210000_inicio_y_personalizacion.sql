-- Orden y visibilidad en el inicio, color de fondo y personalización del menú tipo carta.

-- Ocultar una categoría o un producto del inicio (sigue apareciendo en el menú).
alter table public.categories add column if not exists home_hidden boolean not null default false;
alter table public.menu_items add column if not exists home_hidden boolean not null default false;
-- Orden de los productos dentro de su categoría (las categorías ya tienen sort_order).
alter table public.menu_items add column if not exists sort_order integer not null default 0;

-- Color de fondo de la página (claro, en hexadecimal).
alter table public.site_settings add column if not exists background_color text not null default '#FBF8F2'
  check (background_color ~ '^#[0-9A-Fa-f]{6}$');

-- CSS y HTML propios del dueño para el menú tipo carta. La app limpia el HTML (sin scripts ni
-- atributos de eventos) y aplica el CSS solo dentro de la carta antes de mostrarlos.
alter table public.site_settings add column if not exists menu_custom_css text not null default '';
alter table public.site_settings add column if not exists menu_custom_html_top text not null default '';
alter table public.site_settings add column if not exists menu_custom_html_bottom text not null default '';
