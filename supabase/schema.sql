-- =====================================================================
--  ESTÚDIO DE FOTOGRAFIA — schema do Supabase
--  Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
--  Pode ser executado mais de uma vez sem erro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFIS (um por usuário do Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role text not null default 'client' check (role in ('client', 'admin')),
  created_at timestamptz not null default now()
);

-- Todo usuário novo vira "client". O papel "admin" só é dado manualmente (ver README).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 2. CONTEÚDO DO SITE
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value text not null default ''
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  sort_order int not null default 0
);

create table if not exists public.carousel_images (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.public_photos (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  event_type text,
  rating int not null default 5 check (rating between 1 and 5),
  content text not null check (char_length(content) <= 1000),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. CLIENTES: EVENTOS, FOTOS PRIVADAS E AGENDAMENTOS
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  service text,
  event_date date,
  location text,
  notes text,
  gallery_released boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists events_client_idx on public.events(client_id);

create table if not exists public.private_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  path text not null unique,
  filename text,
  created_at timestamptz not null default now()
);
create index if not exists private_photos_event_idx on public.private_photos(event_id);
create index if not exists private_photos_client_idx on public.private_photos(client_id);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  event_type text,
  event_date date,
  location text,
  message text,
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmado', 'concluido', 'cancelado')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3B. VENDA DAS FOTOS, MARCA D'ÁGUA E PAGAMENTOS (Mercado Pago)
-- ---------------------------------------------------------------------
-- Regras de venda de cada evento (galeria):
--   sale_mode = 'unit'  -> cada foto custa unit_price
--   sale_mode = 'album' -> album_price dá direito a album_photos_included fotos;
--                          cada foto a mais custa extra_photo_price
alter table public.events add column if not exists sale_mode text not null default 'unit';
alter table public.events add column if not exists unit_price numeric(10,2);
alter table public.events add column if not exists album_price numeric(10,2);
alter table public.events add column if not exists album_photos_included int;
alter table public.events add column if not exists extra_photo_price numeric(10,2);
alter table public.events add column if not exists album_paid boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_sale_mode_check') then
    alter table public.events
      add constraint events_sale_mode_check check (sale_mode in ('unit', 'album'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_prices_check') then
    alter table public.events
      add constraint events_prices_check check (
        coalesce(unit_price, 0) >= 0
        and coalesce(album_price, 0) >= 0
        and coalesce(extra_photo_price, 0) >= 0
        and coalesce(album_photos_included, 0) >= 0
      );
  end if;
end $$;

-- preview_path = cópia com marca d'água (é o que o cliente vê antes de pagar).
-- unlocked_at  = quando a foto original foi liberada (pagamento aprovado ou liberação manual).
alter table public.private_photos add column if not exists preview_path text;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'private_photos' and column_name = 'unlocked_at'
  ) then
    alter table public.private_photos add column unlocked_at timestamptz;
    -- Fotos que já existiam antes da venda foram entregues sem cobrança: continuam liberadas.
    -- (Este bloco só roda uma vez, quando a coluna é criada.)
    update public.private_photos set unlocked_at = created_at;
  end if;
end $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  includes_album boolean not null default false,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'recusado', 'cancelado', 'reembolsado')),
  mp_preference_id text,
  mp_payment_id text,
  checkout_url text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_client_idx on public.orders(client_id);
create index if not exists orders_event_idx on public.orders(event_id);

create table if not exists public.order_items (
  order_id uuid not null references public.orders(id) on delete cascade,
  photo_id uuid not null references public.private_photos(id) on delete cascade,
  primary key (order_id, photo_id)
);
create index if not exists order_items_photo_idx on public.order_items(photo_id);

-- ---------------------------------------------------------------------
-- 4. PERMISSÕES BÁSICAS (a segurança real vem das políticas RLS abaixo)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.site_settings, public.services, public.carousel_images,
  public.public_photos, public.testimonials to anon, authenticated;
grant insert, update, delete on public.site_settings, public.services,
  public.carousel_images, public.public_photos to authenticated;
grant insert on public.testimonials, public.bookings to anon, authenticated;
grant update, delete on public.testimonials to authenticated;
grant select, update, delete on public.bookings to authenticated;
grant select, insert, update, delete on public.events, public.private_photos to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
-- Pedidos: só leitura pelo navegador. Quem cria e aprova pedidos são as Edge Functions.
grant select on public.orders, public.order_items to authenticated;

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.site_settings   enable row level security;
alter table public.services        enable row level security;
alter table public.carousel_images enable row level security;
alter table public.public_photos   enable row level security;
alter table public.testimonials    enable row level security;
alter table public.events          enable row level security;
alter table public.private_photos  enable row level security;
alter table public.bookings        enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;

-- Perfis: cada um vê o próprio; admin vê e gerencia todos.
drop policy if exists "perfil: ver o proprio" on public.profiles;
create policy "perfil: ver o proprio" on public.profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists "perfil: admin gerencia" on public.profiles;
create policy "perfil: admin gerencia" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Conteúdo público: todos leem, só admin escreve.
do $$
declare t text;
begin
  foreach t in array array['site_settings', 'services', 'carousel_images', 'public_photos']
  loop
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "admin escreve" on public.%I', t);
    execute format('create policy "admin escreve" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Depoimentos: o público vê só os aprovados e qualquer visitante pode enviar (fica pendente).
drop policy if exists "depoimentos: ver aprovados" on public.testimonials;
create policy "depoimentos: ver aprovados" on public.testimonials
  for select to anon, authenticated using (status = 'aprovado');
drop policy if exists "depoimentos: enviar" on public.testimonials;
create policy "depoimentos: enviar" on public.testimonials
  for insert to anon, authenticated with check (status = 'pendente');
drop policy if exists "depoimentos: admin gerencia" on public.testimonials;
create policy "depoimentos: admin gerencia" on public.testimonials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Agendamentos: qualquer visitante solicita; o cliente vê só os seus; admin vê todos.
drop policy if exists "agendamentos: solicitar" on public.bookings;
create policy "agendamentos: solicitar" on public.bookings
  for insert to anon, authenticated
  with check (status = 'pendente' and (client_id is null or client_id = auth.uid()));
drop policy if exists "agendamentos: cliente ve os seus" on public.bookings;
create policy "agendamentos: cliente ve os seus" on public.bookings
  for select to authenticated using (client_id = auth.uid());
drop policy if exists "agendamentos: admin gerencia" on public.bookings;
create policy "agendamentos: admin gerencia" on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Eventos: o cliente vê só os dele.
drop policy if exists "eventos: cliente ve os seus" on public.events;
create policy "eventos: cliente ve os seus" on public.events
  for select to authenticated using (client_id = auth.uid());
drop policy if exists "eventos: admin gerencia" on public.events;
create policy "eventos: admin gerencia" on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Fotos privadas: o cliente só vê as dele, e só depois que o admin liberar a galeria.
drop policy if exists "fotos privadas: cliente ve as suas" on public.private_photos;
create policy "fotos privadas: cliente ve as suas" on public.private_photos
  for select to authenticated
  using (
    client_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = private_photos.event_id and e.gallery_released
    )
  );
drop policy if exists "fotos privadas: admin gerencia" on public.private_photos;
create policy "fotos privadas: admin gerencia" on public.private_photos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Pedidos: o cliente vê só os seus; admin vê todos. Ninguém escreve pelo navegador.
drop policy if exists "pedidos: cliente ve os seus" on public.orders;
create policy "pedidos: cliente ve os seus" on public.orders
  for select to authenticated using (client_id = auth.uid());
drop policy if exists "pedidos: admin ve todos" on public.orders;
create policy "pedidos: admin ve todos" on public.orders
  for select to authenticated using (public.is_admin());

drop policy if exists "itens: cliente ve os seus" on public.order_items;
create policy "itens: cliente ve os seus" on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o where o.id = order_items.order_id and o.client_id = auth.uid()
  ));
drop policy if exists "itens: admin ve todos" on public.order_items;
create policy "itens: admin ve todos" on public.order_items
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. STORAGE (arquivos)
--    site            -> público (logo, carrossel, portfólio)
--    private-photos  -> privado (fotos dos clientes; acesso por link assinado)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 52428800, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-photos', 'private-photos', false, 52428800, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage site: admin gerencia" on storage.objects;
create policy "storage site: admin gerencia" on storage.objects
  for all to authenticated
  using (bucket_id = 'site' and public.is_admin())
  with check (bucket_id = 'site' and public.is_admin());

drop policy if exists "storage privado: admin gerencia" on storage.objects;
create policy "storage privado: admin gerencia" on storage.objects
  for all to authenticated
  using (bucket_id = 'private-photos' and public.is_admin())
  with check (bucket_id = 'private-photos' and public.is_admin());

drop policy if exists "storage privado: cliente le as proprias" on storage.objects;
create policy "storage privado: cliente le as proprias" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private-photos'
    and exists (
      select 1
      from public.private_photos p
      join public.events e on e.id = p.event_id
      where p.path = storage.objects.name
        and p.client_id = auth.uid()
        and e.gallery_released
        and p.unlocked_at is not null   -- original SÓ depois de liberado (pago)
    )
  );

-- Prévias com marca d'água: o cliente enxerga as das próprias fotos (galeria liberada).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('previews', 'previews', false, 10485760, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage previas: admin gerencia" on storage.objects;
create policy "storage previas: admin gerencia" on storage.objects
  for all to authenticated
  using (bucket_id = 'previews' and public.is_admin())
  with check (bucket_id = 'previews' and public.is_admin());

drop policy if exists "storage previas: cliente ve as proprias" on storage.objects;
create policy "storage previas: cliente ve as proprias" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'previews'
    and exists (
      select 1
      from public.private_photos p
      join public.events e on e.id = p.event_id
      where p.preview_path = storage.objects.name
        and p.client_id = auth.uid()
        and e.gallery_released
    )
  );

-- ---------------------------------------------------------------------
-- 7. CONTEÚDO INICIAL (edite depois pelo painel administrativo)
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('company_name', 'Meu Estúdio Fotográfico'),
  ('tagline', 'Momentos reais, memórias para toda a vida.'),
  ('about_title', 'Fotografia com olhar autoral'),
  ('about_text', 'Aqui você conta a sua história sobre o estúdio: como começou, o estilo das fotos, o que você valoriza no atendimento e o que o cliente pode esperar.'),
  ('contact_email', ''),
  ('contact_phone', ''),
  ('whatsapp', ''),
  ('instagram', ''),
  ('address', ''),
  ('hours', 'Segunda a sábado, 9h às 18h'),
  ('logo_path', ''),
  ('watermark_text', '')
on conflict (key) do nothing;

insert into public.services (title, description, sort_order)
select * from (values
  ('Casamentos', 'Cobertura completa do grande dia, dos preparativos à festa.', 1),
  ('Eventos e festas', 'Aniversários, formaturas e confraternizações registrados com naturalidade.', 2),
  ('Ensaios', 'Ensaios individuais, de casal e de família, em estúdio ou ao ar livre.', 3)
) as v(title, description, sort_order)
where not exists (select 1 from public.services);
