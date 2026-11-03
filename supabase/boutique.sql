-- Sika : boutiques en ligne, produits et commandes.
-- À exécuter une fois dans Supabase → SQL Editor (après schema.sql).

-- ---------- Boutiques (une par compte) ----------
create table if not exists public.shops (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name        text not null check (char_length(name) between 2 and 80),
  description text not null default '',
  phone       text not null default '',
  city        text not null default '',
  logo_url    text not null default '',
  delivery    text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Produits ----------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  price       numeric(14, 0) not null check (price >= 0),
  old_price   numeric(14, 0) check (old_price is null or old_price >= 0),
  image_url   text not null default '',
  stock       integer check (stock is null or stock >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists products_shop_idx on public.products (shop_id);

-- ---------- Commandes ----------
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops (id) on delete cascade,
  number           integer not null,
  customer_name    text not null,
  customer_phone   text not null,
  customer_address text not null default '',
  note             text not null default '',
  items            jsonb not null,
  total            numeric(14, 0) not null,
  status           text not null default 'nouvelle' check (status in ('nouvelle', 'validee', 'livree', 'annulee')),
  invoice_number   text,
  created_at       timestamptz not null default now(),
  unique (shop_id, number)
);
create index if not exists orders_shop_idx on public.orders (shop_id, created_at desc);

-- ---------- Sécurité (RLS) ----------
alter table public.shops    enable row level security;
alter table public.products enable row level security;
alter table public.orders   enable row level security;

create or replace function public.is_shop_owner(p_shop uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shops where id = p_shop and owner = auth.uid());
$$;

drop policy if exists "boutique visible" on public.shops;
create policy "boutique visible" on public.shops for select using (active or owner = auth.uid());
drop policy if exists "boutique creation" on public.shops;
create policy "boutique creation" on public.shops for insert with check (owner = auth.uid());
drop policy if exists "boutique modification" on public.shops;
create policy "boutique modification" on public.shops for update using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "produit visible" on public.products;
create policy "produit visible" on public.products for select using (
  public.is_shop_owner(shop_id)
  or (active and exists (select 1 from public.shops s where s.id = shop_id and s.active))
);
drop policy if exists "produit creation" on public.products;
create policy "produit creation" on public.products for insert with check (public.is_shop_owner(shop_id));
drop policy if exists "produit modification" on public.products;
create policy "produit modification" on public.products for update using (public.is_shop_owner(shop_id)) with check (public.is_shop_owner(shop_id));
drop policy if exists "produit suppression" on public.products;
create policy "produit suppression" on public.products for delete using (public.is_shop_owner(shop_id));

-- Les commandes : seul le vendeur les voit et les modifie. Les clients passent par place_order().
drop policy if exists "commande lecture" on public.orders;
create policy "commande lecture" on public.orders for select using (public.is_shop_owner(shop_id));
drop policy if exists "commande modification" on public.orders;
create policy "commande modification" on public.orders for update using (public.is_shop_owner(shop_id)) with check (public.is_shop_owner(shop_id));

-- ---------- Passer une commande (sans compte) ----------
-- Les prix sont relus en base : le client ne peut pas les modifier. Le stock est décrémenté.
create or replace function public.place_order(
  p_slug text, p_name text, p_phone text, p_address text, p_note text, p_items jsonb
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_shop   shops%rowtype;
  v_item   jsonb;
  v_prod   products%rowtype;
  v_qty    integer;
  v_lines  jsonb := '[]'::jsonb;
  v_total  numeric := 0;
  v_number integer;
  v_id     uuid;
begin
  select * into v_shop from shops where slug = p_slug and active;
  if not found then raise exception 'Boutique introuvable'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception 'Nom et téléphone obligatoires';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Panier invalide';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 1000 then raise exception 'Quantité invalide'; end if;
    select * into v_prod from products
      where id = (v_item ->> 'id')::uuid and shop_id = v_shop.id and active
      for update;
    if not found then raise exception 'Un produit n''est plus disponible'; end if;
    if v_prod.stock is not null then
      if v_prod.stock < v_qty then raise exception 'Stock insuffisant pour %', v_prod.name; end if;
      update products set stock = stock - v_qty where id = v_prod.id;
    end if;
    v_lines := v_lines || jsonb_build_object('id', v_prod.id, 'name', v_prod.name, 'price', v_prod.price, 'qty', v_qty);
    v_total := v_total + v_prod.price * v_qty;
  end loop;

  perform pg_advisory_xact_lock(hashtext(v_shop.id::text));
  select coalesce(max(number), 0) + 1 into v_number from orders where shop_id = v_shop.id;

  insert into orders (shop_id, number, customer_name, customer_phone, customer_address, note, items, total)
  values (v_shop.id, v_number, left(trim(p_name), 100), left(trim(p_phone), 30),
          left(coalesce(p_address, ''), 300), left(coalesce(p_note, ''), 500), v_lines, v_total)
  returning id into v_id;

  return json_build_object('id', v_id, 'number', v_number, 'total', v_total);
end;
$$;

revoke all on function public.place_order(text, text, text, text, text, jsonb) from public;
grant execute on function public.place_order(text, text, text, text, text, jsonb) to anon, authenticated;

-- Rendre le stock quand une commande est annulée
create or replace function public.restock_on_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_item jsonb;
begin
  if new.status = 'annulee' and old.status <> 'annulee' then
    for v_item in select * from jsonb_array_elements(old.items) loop
      update products set stock = stock + (v_item ->> 'qty')::integer
        where id = (v_item ->> 'id')::uuid and stock is not null;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_restock on public.orders;
create trigger orders_restock after update of status on public.orders
  for each row execute function public.restock_on_cancel();

-- ---------- Photos (Supabase Storage) ----------
insert into storage.buckets (id, name, public)
values ('produits', 'produits', true)
on conflict (id) do update set public = true;

drop policy if exists "photos ajout" on storage.objects;
create policy "photos ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'produits' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos modification" on storage.objects;
create policy "photos modification" on storage.objects for update to authenticated
  using (bucket_id = 'produits' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos suppression" on storage.objects;
create policy "photos suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'produits' and (storage.foldername(name))[1] = auth.uid()::text);
