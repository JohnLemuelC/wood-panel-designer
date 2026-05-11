-- Wood Panel Wall Designer - Database Schema
-- All dimensions in millimeters. All coordinates relative to wall top-left.

-- ============================================================
-- USERS / ROLES (using Supabase auth + profile table for role)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'customer' check (role in ('customer', 'operator')),
  created_at timestamptz default now()
);

-- ============================================================
-- CANVAS CATALOG (operator-managed)
-- ============================================================
create table if not exists public.canvas_sizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  width_mm integer not null,
  height_mm integer not null,
  thickness_mm integer not null default 18,
  price_cents integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Hole positions for each canvas size
-- Positions in mm relative to panel top-left corner
create table if not exists public.canvas_holes (
  id uuid primary key default gen_random_uuid(),
  canvas_size_id uuid not null references public.canvas_sizes(id) on delete cascade,
  label text not null default 'hole',
  x_mm numeric(10,2) not null,
  y_mm numeric(10,2) not null,
  created_at timestamptz default now()
);
create index if not exists idx_canvas_holes_size on public.canvas_holes(canvas_size_id);

-- ============================================================
-- JOBS
-- ============================================================
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  wall_width_mm integer not null,
  wall_height_mm integer not null,
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'UPLOADED', 'ARRANGING', 'PROOFING', 'APPROVED', 'PRINTED', 'SHIPPED'
  )),
  -- layout is a JSONB array of panels (see panel structure in app)
  layout jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_jobs_user on public.jobs(user_id);
create index if not exists idx_jobs_status on public.jobs(status);

-- ============================================================
-- PHOTOS (uploaded by customer for a job)
-- ============================================================
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_name text,
  width_px integer,
  height_px integer,
  file_size_bytes integer,
  mime_type text,
  created_at timestamptz default now()
);
create index if not exists idx_photos_job on public.photos(job_id);

-- ============================================================
-- AUDIT LOG (status changes)
-- ============================================================
create table if not exists public.job_status_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.canvas_sizes enable row level security;
alter table public.canvas_holes enable row level security;
alter table public.jobs enable row level security;
alter table public.photos enable row level security;
alter table public.job_status_log enable row level security;

-- Profiles: users see/update their own
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Helper function to check if user is operator
create or replace function public.is_operator()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select role = 'operator' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Canvas sizes: everyone can read active ones; only operators write
drop policy if exists "canvas_sizes_select_all" on public.canvas_sizes;
create policy "canvas_sizes_select_all" on public.canvas_sizes for select using (true);
drop policy if exists "canvas_sizes_op_insert" on public.canvas_sizes;
create policy "canvas_sizes_op_insert" on public.canvas_sizes for insert with check (public.is_operator());
drop policy if exists "canvas_sizes_op_update" on public.canvas_sizes;
create policy "canvas_sizes_op_update" on public.canvas_sizes for update using (public.is_operator());
drop policy if exists "canvas_sizes_op_delete" on public.canvas_sizes;
create policy "canvas_sizes_op_delete" on public.canvas_sizes for delete using (public.is_operator());

-- Canvas holes: same as sizes
drop policy if exists "canvas_holes_select_all" on public.canvas_holes;
create policy "canvas_holes_select_all" on public.canvas_holes for select using (true);
drop policy if exists "canvas_holes_op_write" on public.canvas_holes;
create policy "canvas_holes_op_write" on public.canvas_holes for all using (public.is_operator()) with check (public.is_operator());

-- Jobs: customers see own, operators see all
drop policy if exists "jobs_select_own_or_op" on public.jobs;
create policy "jobs_select_own_or_op" on public.jobs for select using (
  auth.uid() = user_id or public.is_operator()
);
drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own" on public.jobs for insert with check (auth.uid() = user_id);
drop policy if exists "jobs_update_own_or_op" on public.jobs;
create policy "jobs_update_own_or_op" on public.jobs for update using (
  auth.uid() = user_id or public.is_operator()
);
drop policy if exists "jobs_delete_own_or_op" on public.jobs;
create policy "jobs_delete_own_or_op" on public.jobs for delete using (
  auth.uid() = user_id or public.is_operator()
);

-- Photos: same as jobs
drop policy if exists "photos_select_own_or_op" on public.photos;
create policy "photos_select_own_or_op" on public.photos for select using (
  auth.uid() = user_id or public.is_operator()
);
drop policy if exists "photos_insert_own" on public.photos;
create policy "photos_insert_own" on public.photos for insert with check (auth.uid() = user_id);
drop policy if exists "photos_delete_own_or_op" on public.photos;
create policy "photos_delete_own_or_op" on public.photos for delete using (
  auth.uid() = user_id or public.is_operator()
);

-- Job status log: viewable by job owner or operator
drop policy if exists "log_select_own_or_op" on public.job_status_log;
create policy "log_select_own_or_op" on public.job_status_log for select using (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and (j.user_id = auth.uid() or public.is_operator())
  )
);
drop policy if exists "log_insert_any" on public.job_status_log;
create policy "log_insert_any" on public.job_status_log for insert with check (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and (j.user_id = auth.uid() or public.is_operator())
  )
);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- STORAGE: photos bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Storage policies: users can upload/read their own photos; operators can read all
drop policy if exists "photos_upload_own" on storage.objects;
create policy "photos_upload_own" on storage.objects for insert
  with check (
    bucket_id = 'photos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "photos_read_own_or_op" on storage.objects;
create policy "photos_read_own_or_op" on storage.objects for select
  using (
    bucket_id = 'photos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_operator()
    )
  );

drop policy if exists "photos_delete_own" on storage.objects;
create policy "photos_delete_own" on storage.objects for delete
  using (
    bucket_id = 'photos' and
    (storage.foldername(name))[1] = auth.uid()::text
  );
