-- Ejecutar una sola vez en el SQL Editor de Supabase.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  primary key (family_id, user_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  type text not null check (type in ('income','expense')),
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  description text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  month date not null default date_trunc('month', current_date)::date,
  unique (family_id, category, month)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  saved_amount numeric(12,2) not null default 0 check (saved_amount >= 0),
  target_date date
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  creditor text not null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  due_date date,
  status text not null default 'pending' check (status in ('pending','paid'))
);

create or replace function public.is_family_member(target_family uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.family_members where family_id = target_family and user_id = auth.uid()); $$;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.debts enable row level security;

create policy "profile_self" on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "family_read" on public.families for select using (public.is_family_member(id));
create policy "members_read" on public.family_members for select using (public.is_family_member(family_id));
create policy "transactions_family" on public.transactions for all using (public.is_family_member(family_id)) with check (public.is_family_member(family_id) and user_id = auth.uid());
create policy "budgets_family" on public.budgets for all using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "goals_family" on public.goals for all using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));
create policy "debts_family" on public.debts for all using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

create or replace function public.create_family(family_name text, member_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists(select 1 from family_members where user_id = auth.uid()) then raise exception 'El usuario ya pertenece a una familia'; end if;
  insert into profiles(user_id, display_name) values(auth.uid(), trim(member_name))
    on conflict(user_id) do update set display_name = excluded.display_name;
  insert into families(name) values(trim(family_name)) returning id into new_id;
  insert into family_members(family_id, user_id, role) values(new_id, auth.uid(), 'owner');
  return new_id;
end; $$;

create or replace function public.join_family(invitation_code text, member_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists(select 1 from family_members where user_id = auth.uid()) then raise exception 'El usuario ya pertenece a una familia'; end if;
  select id into selected_id from families where join_code = upper(trim(invitation_code));
  if selected_id is null then raise exception 'Código familiar inválido'; end if;
  if (select count(*) from family_members where family_id = selected_id) >= 2 then raise exception 'La familia ya tiene dos usuarios'; end if;
  insert into profiles(user_id, display_name) values(auth.uid(), trim(member_name))
    on conflict(user_id) do update set display_name = excluded.display_name;
  insert into family_members(family_id, user_id, role) values(selected_id, auth.uid(), 'member');
  return selected_id;
end; $$;

grant execute on function public.create_family(text,text) to authenticated;
grant execute on function public.join_family(text,text) to authenticated;

-- La entrega queda sin datos de prueba: las tablas se crean vacías.
