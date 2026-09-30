-- One-time setup for saved programs.
-- Paste this whole file into Supabase → SQL Editor → New query, then click "Run".
-- Safe to run more than once.

create table if not exists public.programs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name text not null check (char_length(name) between 1 and 100),
    settings jsonb not null default '{}'::jsonb,
    plan jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists programs_user_id_updated_at_idx
    on public.programs (user_id, updated_at desc);

-- Keep updated_at current on every edit
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists programs_set_updated_at on public.programs;
create trigger programs_set_updated_at
    before update on public.programs
    for each row execute function public.set_updated_at();

-- Row Level Security: each signed-in user can only see and change their own programs.
-- Logged-out visitors get nothing.
alter table public.programs enable row level security;

drop policy if exists "Users can view their own programs" on public.programs;
create policy "Users can view their own programs"
    on public.programs for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own programs" on public.programs;
create policy "Users can create their own programs"
    on public.programs for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own programs" on public.programs;
create policy "Users can update their own programs"
    on public.programs for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own programs" on public.programs;
create policy "Users can delete their own programs"
    on public.programs for delete
    to authenticated
    using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.programs to authenticated;
revoke all on public.programs from anon;
