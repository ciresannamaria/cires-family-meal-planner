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
