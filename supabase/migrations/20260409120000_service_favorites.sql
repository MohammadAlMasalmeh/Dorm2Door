-- Saved / hearted services (consumer favorites)

create table public.service_favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, service_id)
);

create index service_favorites_service_id_idx on public.service_favorites(service_id);
create index service_favorites_user_id_idx on public.service_favorites(user_id);

alter table public.service_favorites enable row level security;

create policy "service_favorites: read own"
  on public.service_favorites for select
  using (auth.uid() = user_id);

create policy "service_favorites: insert own"
  on public.service_favorites for insert
  with check (auth.uid() = user_id);

create policy "service_favorites: delete own"
  on public.service_favorites for delete
  using (auth.uid() = user_id);
