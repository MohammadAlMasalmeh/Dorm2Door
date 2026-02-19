-- ============================================================
-- Dorm2Door — Initial Schema
-- ============================================================

-- 1. TABLES
-- ============================================================

create table public.users (
  id uuid references auth.users not null primary key,
  email text unique not null,
  display_name text,
  role text check (role in ('consumer', 'provider')) default 'consumer',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.providers (
  id uuid references public.users(id) on delete cascade not null primary key,
  bio text,
  tags text[],
  avg_rating numeric(3, 2) default 0.0,
  location text
);

create table public.services (
  id uuid default gen_random_uuid() primary key,
  provider_id uuid references public.providers(id) on delete cascade not null,
  name text not null,
  price numeric(10, 2) not null,
  description text
);

create table public.appointments (
  id uuid default gen_random_uuid() primary key,
  consumer_id uuid references public.users(id) not null,
  provider_id uuid references public.providers(id) not null,
  service_id uuid references public.services(id) not null,
  status text check (status in ('pending', 'confirmed', 'completed')) default 'pending',
  scheduled_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.reviews (
  id uuid default gen_random_uuid() primary key,
  appointment_id uuid references public.appointments(id) unique not null,
  provider_id uuid references public.providers(id) not null,
  rating integer check (rating >= 1 and rating <= 5) not null,
  comment text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================
-- 2. ROW LEVEL SECURITY — enable on all tables
-- ============================================================

alter table public.users enable row level security;
alter table public.providers enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.reviews enable row level security;

-- ============================================================
-- 3. RLS POLICIES
-- ============================================================

-- ── users ──────────────────────────────────────────────────
-- Read own profile only
create policy "users: read own" on public.users
  for select using (auth.uid() = id);

-- Insert allowed only from the handle_new_user trigger (SECURITY DEFINER bypasses RLS,
-- but we still need a policy for any direct inserts; restrict to .edu emails only).
create policy "users: insert .edu only" on public.users
  for insert with check (
    auth.uid() is not null
    and auth.jwt() ->> 'email' like '%.edu'
  );

-- Update own profile
create policy "users: update own" on public.users
  for update using (auth.uid() = id);

-- ── providers ───────────────────────────────────────────────
-- Anyone authenticated can browse providers
create policy "providers: read all" on public.providers
  for select using (auth.uid() is not null);

-- Only a user whose role = 'provider' can create a provider record for themselves
create policy "providers: insert own (provider role)" on public.providers
  for insert with check (
    auth.uid() = id
    and exists (
      select 1 from public.users where id = auth.uid() and role = 'provider'
    )
  );

-- Providers can update only their own record
create policy "providers: update own" on public.providers
  for update using (
    auth.uid() = id
    and exists (
      select 1 from public.users where id = auth.uid() and role = 'provider'
    )
  );

-- ── services ────────────────────────────────────────────────
-- Anyone authenticated can read services
create policy "services: read all" on public.services
  for select using (auth.uid() is not null);

-- Providers can add services only to their own provider profile
create policy "services: insert own provider" on public.services
  for insert with check (
    provider_id = auth.uid()
    and exists (
      select 1 from public.users where id = auth.uid() and role = 'provider'
    )
  );

-- Providers can update their own services
create policy "services: update own provider" on public.services
  for update using (
    provider_id = auth.uid()
    and exists (
      select 1 from public.users where id = auth.uid() and role = 'provider'
    )
  );

-- Providers can delete their own services
create policy "services: delete own provider" on public.services
  for delete using (
    provider_id = auth.uid()
    and exists (
      select 1 from public.users where id = auth.uid() and role = 'provider'
    )
  );

-- ── appointments ────────────────────────────────────────────
-- Consumers can only read appointments where they are the consumer
create policy "appointments: consumer reads own" on public.appointments
  for select using (auth.uid() = consumer_id);

-- Providers can read appointments assigned to them
create policy "appointments: provider reads own" on public.appointments
  for select using (auth.uid() = provider_id);

-- Authenticated consumers can book appointments for themselves
create policy "appointments: consumer insert" on public.appointments
  for insert with check (
    auth.uid() is not null
    and consumer_id = auth.uid()
  );

-- Status updates allowed by either party (consumer or provider)
create policy "appointments: update by participant" on public.appointments
  for update using (
    auth.uid() = consumer_id or auth.uid() = provider_id
  );

-- ── reviews ─────────────────────────────────────────────────
-- Anyone authenticated can read reviews
create policy "reviews: read all" on public.reviews
  for select using (auth.uid() is not null);

-- Authenticated users can create a review (one per appointment enforced by UNIQUE)
create policy "reviews: insert" on public.reviews
  for insert with check (auth.uid() is not null);

-- NO update policy  → reviews are immutable once submitted
-- NO delete policy  → reviews cannot be removed by users

-- ============================================================
-- 4. DATABASE FUNCTIONS & TRIGGERS
-- ============================================================

-- onUserSignup: auto-create a users row when a new auth user is created.
-- Also enforces the .edu restriction at the database level.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  if right(new.email, 4) <> '.edu' then
    raise exception 'Registration restricted to .edu email addresses';
  end if;
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- onReviewCreated: recalculate and persist a provider's average rating.
create or replace function public.update_avg_rating()
returns trigger as $$
begin
  update public.providers
  set avg_rating = (
    select round(avg(rating)::numeric, 2)
    from public.reviews
    where provider_id = new.provider_id
  )
  where id = new.provider_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_review_created
  after insert on public.reviews
  for each row execute procedure public.update_avg_rating();

-- ============================================================
-- 5. INDEXES
-- ============================================================

-- Supports array-contains queries on tags (e.g. tags @> '{cleaning}')
create index idx_providers_tags on public.providers using gin (tags);

-- Supports ORDER BY avg_rating DESC
create index idx_providers_avg_rating on public.providers (avg_rating desc);

-- Appointment lookups by participant
create index idx_appointments_consumer on public.appointments (consumer_id);
create index idx_appointments_provider on public.appointments (provider_id);

-- Review lookups by provider
create index idx_reviews_provider on public.reviews (provider_id);
