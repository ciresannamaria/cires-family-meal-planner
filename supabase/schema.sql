-- Cires Family Meal Planner: Supabase schema
-- Run this in the Supabase SQL Editor for a new project.
-- All application records are private to their owner through Row Level Security.

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  instructions text not null default '',
  notes text not null default '',
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric,
  unit text not null default 'g',
  ingredient_group text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  plan_date date not null,
  slot text not null check (slot in ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  portions numeric not null default 1 check (portions > 0),
  created_at timestamptz not null default now()
);

create index if not exists meals_owner_id_idx on public.meals(owner_id);
create index if not exists ingredients_meal_id_idx on public.meal_ingredients(meal_id);
create index if not exists ingredients_owner_id_idx on public.meal_ingredients(owner_id);
create index if not exists planned_meals_owner_date_idx on public.planned_meals(owner_id, plan_date);

alter table public.meals enable row level security;
alter table public.meal_ingredients enable row level security;
alter table public.planned_meals enable row level security;

drop policy if exists "Users manage their own meals" on public.meals;
create policy "Users manage their own meals"
on public.meals for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Users manage their own ingredients" on public.meal_ingredients;
create policy "Users manage their own ingredients"
on public.meal_ingredients for all to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.meals
    where meals.id = meal_ingredients.meal_id
      and meals.owner_id = auth.uid()
  )
);

drop policy if exists "Users manage their own planned meals" on public.planned_meals;
create policy "Users manage their own planned meals"
on public.planned_meals for all to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.meals
    where meals.id = planned_meals.meal_id
      and meals.owner_id = auth.uid()
  )
);

-- Private photo bucket. Store each user's files under: <auth-user-id>/<filename>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their own meal photos" on storage.objects;
create policy "Users read their own meal photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users upload their own meal photos" on storage.objects;
create policy "Users upload their own meal photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update their own meal photos" on storage.objects;
create policy "Users update their own meal photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete their own meal photos" on storage.objects;
create policy "Users delete their own meal photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- Optional individual recipe sharing.
-- Public visitors can read only explicitly shared recipe data through get_shared_meal(token).
-- They cannot query the meals or ingredients tables directly.
create table if not exists public.meal_shares (
  token uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (meal_id)
);
alter table public.meal_shares enable row level security;
revoke all on public.meal_shares from anon, authenticated;

create or replace function public.create_meal_share(p_meal_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_token uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in to share a meal'; end if;
  if not exists (select 1 from public.meals m where m.id = p_meal_id and m.owner_id = auth.uid()) then
    raise exception 'Meal not found or you do not own it';
  end if;
  insert into public.meal_shares (meal_id, owner_id) values (p_meal_id, auth.uid())
  on conflict (meal_id) do update set token = gen_random_uuid(), owner_id = excluded.owner_id, created_at = now(), revoked_at = null
  returning token into v_token;
  return v_token;
end;
$$;

create or replace function public.get_shared_meal(p_token uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'name', m.name, 'instructions', m.instructions, 'notes', m.notes,
    'ingredients', coalesce((select jsonb_agg(jsonb_build_object(
      'name', i.name, 'amount', i.amount, 'unit', i.unit, 'group', i.ingredient_group, 'sort_order', i.sort_order
    ) order by i.sort_order) from public.meal_ingredients i where i.meal_id = m.id and i.owner_id = m.owner_id), '[]'::jsonb)
  )
  from public.meal_shares s join public.meals m on m.id = s.meal_id and m.owner_id = s.owner_id
  where s.token = p_token and s.revoked_at is null limit 1;
$$;

create or replace function public.copy_shared_meal(p_token uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_meal public.meals%rowtype;
declare v_new_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in to save this recipe'; end if;
  select m.* into v_meal from public.meal_shares s
  join public.meals m on m.id = s.meal_id and m.owner_id = s.owner_id
  where s.token = p_token and s.revoked_at is null;
  if not found then raise exception 'This shared recipe is no longer available'; end if;
  insert into public.meals (owner_id, name, instructions, notes)
  values (auth.uid(), v_meal.name, v_meal.instructions, v_meal.notes) returning id into v_new_id;
  insert into public.meal_ingredients (meal_id, owner_id, name, amount, unit, ingredient_group, sort_order)
  select v_new_id, auth.uid(), i.name, i.amount, i.unit, i.ingredient_group, i.sort_order
  from public.meal_ingredients i where i.meal_id = v_meal.id and i.owner_id = v_meal.owner_id;
  return v_new_id;
end;
$$;

revoke all on function public.create_meal_share(uuid) from public, anon;
revoke all on function public.get_shared_meal(uuid) from public;
revoke all on function public.copy_shared_meal(uuid) from public, anon;
grant execute on function public.create_meal_share(uuid) to authenticated;
grant execute on function public.get_shared_meal(uuid) to anon, authenticated;
grant execute on function public.copy_shared_meal(uuid) to authenticated;
