-- Ecotecplast ColorHub — full schema in a single migration.
--
-- Multi-tenant from day 1: every domain row is owned by an org; users
-- belong to orgs via `organization_members` (role = 'admin' | 'member').
-- The BEFORE INSERT triggers on scoped tables stamp organization_id from
-- the caller's auth.uid()→organization_members lookup so the app layer
-- never has to send it.
--
-- Order of statements:
--   1. Trigger helper functions (used by CREATE TRIGGER later)
--   2. Tables in FK order
--   3. Indexes
--   4. Sequence for job identifiers
--   5. Business-logic functions (RLS helpers, auth hook, org auto-set,
--      job id generator)
--   6. Triggers wiring the functions onto tables

set search_path = public;


-- ================================================================
-- 1. Trigger helper functions
-- ================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ================================================================
-- 2. Tables
-- ================================================================

-- ----- organizations --------------------------------------------
create table if not exists organizations (
    id          serial       primary key,
    name        varchar(150) not null,
    slug        varchar(100) not null unique,
    created_at  timestamptz  not null default now()
);

-- ----- profiles -------------------------------------------------
-- 1:1 with auth.users. `email` is denormalized for convenience.
-- Admin status is NOT here — it lives in organization_members.role.
create table if not exists profiles (
    user_id    uuid        primary key references auth.users(id) on delete cascade,
    email      text        not null,
    created_at timestamptz not null default now()
);

-- ----- organization_members -------------------------------------
-- Many-to-many: a user can belong to multiple orgs with possibly
-- different roles. Today the app treats a user as having a single
-- "current" org (the first membership by created_at).
create table if not exists organization_members (
    org_id      int         not null references organizations(id) on delete cascade,
    user_id     uuid        not null references profiles(user_id) on delete cascade,
    role        varchar(20) not null default 'member'
                check (role in ('admin', 'member')),
    created_at  timestamptz not null default now(),
    primary key (org_id, user_id)
);

create index if not exists organization_members_user_id_idx on organization_members(user_id);

-- ----- providers ------------------------------------------------
create table if not exists providers (
    id              serial       primary key,
    organization_id int          not null references organizations(id) on delete cascade,
    name            varchar(100) not null,
    created_at      timestamptz  not null default now(),
    constraint providers_org_name_unique unique (organization_id, name)
);

create index if not exists providers_organization_id_idx on providers(organization_id);

-- ----- masterbatches --------------------------------------------
create table if not exists masterbatches (
    id                    serial       primary key,
    organization_id       int          not null references organizations(id) on delete cascade,
    provider_id           int          references providers(id) on delete set null,
    product_name          varchar(150) not null,
    supplier_sku          varchar(100) not null,
    color_index_num       varchar(50),
    base_carrier_polymer  varchar(50)  not null,
    current_stock_kg      numeric(10, 2) not null default 0.0,
    internal_notes        text,
    calibration_source    varchar(20)  not null default 'measured'
                          check (calibration_source in ('measured', 'estimated')),
    created_at            timestamptz  not null default now(),
    updated_at            timestamptz  not null default now(),
    constraint masterbatches_org_sku_unique unique (organization_id, supplier_sku)
);

create index if not exists masterbatches_provider_id_idx          on masterbatches(provider_id);
create index if not exists masterbatches_base_carrier_polymer_idx on masterbatches(base_carrier_polymer);
create index if not exists masterbatches_organization_id_idx      on masterbatches(organization_id);

-- ----- calibration_data -----------------------------------------
-- No direct organization_id — scoped through masterbatch_id in RLS.
create table if not exists calibration_data (
    id                 serial primary key,
    masterbatch_id     int    not null references masterbatches(id) on delete cascade,
    letdown_percentage numeric(4, 2) not null,
    lab_l              numeric(5, 2) not null,
    lab_a              numeric(5, 2) not null,
    lab_b              numeric(5, 2) not null,
    created_at         timestamptz not null default now(),
    constraint calibration_letdown_positive check (letdown_percentage > 0),
    constraint calibration_unique_per_letdown unique (masterbatch_id, letdown_percentage)
);

create index if not exists calibration_data_masterbatch_id_idx on calibration_data(masterbatch_id);

-- ----- clients --------------------------------------------------
create table if not exists clients (
    id                       serial       primary key,
    organization_id          int          not null references organizations(id) on delete cascade,
    name                     varchar(150) not null,
    contact_email            varchar(150),
    contact_phone            varchar(50),
    default_carrier_polymer  varchar(50),
    notes                    text,
    created_at               timestamptz  not null default now(),
    updated_at               timestamptz  not null default now(),
    constraint clients_org_name_unique unique (organization_id, name)
);

create index if not exists clients_organization_id_idx on clients(organization_id);

-- ----- color_references (global, shared across orgs) ------------
create table if not exists color_references (
    id          serial       primary key,
    palette     varchar(50)  not null,
    code        varchar(50)  not null,
    name        varchar(150) not null,
    lab_l       numeric(5, 2) not null,
    lab_a       numeric(5, 2) not null,
    lab_b       numeric(5, 2) not null,
    created_at  timestamptz  not null default now(),
    constraint color_references_unique_per_palette unique (palette, code)
);

create index if not exists color_references_palette_idx on color_references(palette);

-- ----- match_history --------------------------------------------
-- Every color-match run persists here. `job_identifier` is generated
-- via trigger below (EP-YYYY-NNNN). `final_delta_e` uses numeric(6, 2)
-- so the matcher's 999.99 sentinel for "structurally unreachable" fits.
create table if not exists match_history (
    id                    serial primary key,
    organization_id       int not null references organizations(id) on delete cascade,
    job_identifier        varchar(100),
    client_id             int references clients(id) on delete cascade,
    carrier_polymer_used  varchar(50),
    pass_threshold_used   numeric(4, 2) not null default 1.0
                          check (pass_threshold_used > 0),
    base_l                numeric(5, 2),
    base_a                numeric(5, 2),
    base_b                numeric(5, 2),
    target_l              numeric(5, 2),
    target_a              numeric(5, 2),
    target_b              numeric(5, 2),
    calculated_recipe     jsonb,
    final_delta_e         numeric(6, 2),
    is_success            boolean not null default false,
    created_by            uuid references auth.users(id) on delete set null,
    created_at            timestamptz not null default now()
);

create index if not exists match_history_created_at_idx      on match_history(created_at desc);
create index if not exists match_history_created_by_idx      on match_history(created_by);
create index if not exists match_history_organization_id_idx on match_history(organization_id);
create index if not exists match_history_client_id_idx       on match_history(client_id);


-- ================================================================
-- 3. Sequences
-- ================================================================

-- Used by assign_job_identifier() to produce the 4-digit suffix.
create sequence if not exists match_history_job_seq;


-- ================================================================
-- 4. RLS helper functions
-- ================================================================

-- True if the current auth user is a member of the given org.
create or replace function public.is_org_member(target_org_id int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where user_id = auth.uid() and org_id = target_org_id
  );
$$;

revoke execute on function public.is_org_member(int) from public;
grant  execute on function public.is_org_member(int) to authenticated;

-- True if the current auth user is an admin of the given org.
create or replace function public.is_org_admin(target_org_id int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where user_id = auth.uid() and org_id = target_org_id and role = 'admin'
  );
$$;

revoke execute on function public.is_org_admin(int) from public;
grant  execute on function public.is_org_admin(int) to authenticated;


-- ================================================================
-- 5. Business logic functions
-- ================================================================

-- ----- handle_new_user ------------------------------------------
-- Fires on every new auth.users row. Creates the profile and adds the
-- user to the default "Ecotecplast" org as admin (creating the org
-- itself if it doesn't exist — happens on the very first signup).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id int;
begin
  select id into target_org_id
    from public.organizations where slug = 'ecotecplast';

  if target_org_id is null then
    insert into public.organizations (name, slug)
    values ('Ecotecplast', 'ecotecplast')
    returning id into target_org_id;
  end if;

  -- Insert profile FIRST — organization_members.user_id has a FK to
  -- profiles.user_id, so the row must exist before the membership row
  -- can be inserted.
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;

  insert into public.organization_members (org_id, user_id, role)
  values (target_org_id, new.id, 'admin')
  on conflict (org_id, user_id) do nothing;

  return new;
end;
$$;

-- ----- assign_job_identifier ------------------------------------
-- BEFORE INSERT on match_history. Fills job_identifier with
-- EP-YYYY-NNNN if not already set.
create or replace function public.assign_job_identifier()
returns trigger
language plpgsql
as $$
begin
  if new.job_identifier is null or new.job_identifier = '' then
    new.job_identifier :=
      'EP-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('match_history_job_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

-- ----- set_org_from_user ----------------------------------------
-- BEFORE INSERT on scoped tables. Looks up the caller's first
-- organization membership and stamps organization_id, so the API
-- layer doesn't need to send it and can't spoof it.
create or replace function public.set_org_from_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_org int;
begin
  select org_id into user_org
    from public.organization_members
    where user_id = auth.uid()
    order by created_at asc
    limit 1;

  if user_org is null then
    raise exception 'User is not a member of any organization';
  end if;

  new.organization_id := user_org;
  return new;
end;
$$;


-- ================================================================
-- 6. Triggers
-- ================================================================

-- updated_at maintenance
create trigger masterbatches_touch_updated_at
before update on masterbatches
for each row execute function public.touch_updated_at();

create trigger clients_touch_updated_at
before update on clients
for each row execute function public.touch_updated_at();

-- new-user hook (creates profile + org membership)
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- match_history: auto-generate job_identifier
create trigger match_history_assign_job_id
before insert on match_history
for each row execute function public.assign_job_identifier();

-- Auto-stamp organization_id on scoped tables
create trigger providers_set_org
before insert on providers
for each row execute function public.set_org_from_user();

create trigger masterbatches_set_org
before insert on masterbatches
for each row execute function public.set_org_from_user();

create trigger clients_set_org
before insert on clients
for each row execute function public.set_org_from_user();

create trigger match_history_set_org
before insert on match_history
for each row execute function public.set_org_from_user();


-- ================================================================
-- 7. Table-level grants
-- ================================================================
--
-- Supabase auto-grants to `authenticated` / `anon` for tables created
-- via the Dashboard, but tables created by migration SQL do NOT inherit
-- these grants. Without them, Postgres blocks the query before RLS is
-- even consulted ("permission denied for table..." with error 42501).
--
-- We grant broadly to `authenticated`; RLS policies are what actually
-- restrict access.

grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
