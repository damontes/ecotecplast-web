-- Row-level security for every table.
--
-- Scoping model:
--   * `organizations`, `organization_members`, `providers`,
--     `masterbatches`, `clients`, `match_history`   → per-org read,
--     admin-only writes within the caller's org.
--   * `calibration_data`   → inherits from parent masterbatch.
--   * `color_references`   → global read for authenticated users; any
--     org admin (in any org) can extend the shared library.
--   * `profiles`   → users can read only their own profile.

set search_path = public;

alter table organizations         enable row level security;
alter table organization_members  enable row level security;
alter table profiles              enable row level security;
alter table providers             enable row level security;
alter table masterbatches         enable row level security;
alter table calibration_data      enable row level security;
alter table clients               enable row level security;
alter table color_references      enable row level security;
alter table match_history         enable row level security;


-- ================================================================
-- organizations
-- ================================================================

-- Read: only orgs the user is a member of.
create policy "organizations_read_member"
on organizations for select
to authenticated
using (public.is_org_member(id));

-- Insert: any authenticated user can create an org (they'll be added
-- as a member separately). In practice this is only used by
-- handle_new_user() via service_role.
create policy "organizations_insert_own"
on organizations for insert
to authenticated
with check (true);


-- ================================================================
-- organization_members
-- ================================================================

-- Read: only rows for orgs the caller belongs to.
create policy "organization_members_read_own_orgs"
on organization_members for select
to authenticated
using (public.is_org_member(org_id));

-- Insert: the caller can only insert their own membership row (used
-- by handle_new_user() and a future "join org via invite" flow).
create policy "organization_members_insert_own"
on organization_members for insert
to authenticated
with check (user_id = auth.uid());


-- ================================================================
-- profiles
-- ================================================================

-- Users can read their own profile only. If you later want org admins
-- to see other members' profiles, add an "or is_org_admin(...)"
-- predicate here.
create policy "profiles_read_own"
on profiles for select
to authenticated
using (user_id = auth.uid());


-- ================================================================
-- providers
-- ================================================================

create policy "providers_read_org_member"
on providers for select
to authenticated
using (public.is_org_member(organization_id));

create policy "providers_write_org_admin"
on providers for all
to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));


-- ================================================================
-- masterbatches
-- ================================================================

create policy "masterbatches_read_org_member"
on masterbatches for select
to authenticated
using (public.is_org_member(organization_id));

create policy "masterbatches_write_org_admin"
on masterbatches for all
to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));


-- ================================================================
-- calibration_data (scoped through parent masterbatch)
-- ================================================================

create policy "calibration_data_read_org_member"
on calibration_data for select
to authenticated
using (
  exists (
    select 1 from public.masterbatches m
    where m.id = calibration_data.masterbatch_id
      and public.is_org_member(m.organization_id)
  )
);

create policy "calibration_data_write_org_admin"
on calibration_data for all
to authenticated
using (
  exists (
    select 1 from public.masterbatches m
    where m.id = calibration_data.masterbatch_id
      and public.is_org_admin(m.organization_id)
  )
)
with check (
  exists (
    select 1 from public.masterbatches m
    where m.id = calibration_data.masterbatch_id
      and public.is_org_admin(m.organization_id)
  )
);


-- ================================================================
-- clients
-- ================================================================

create policy "clients_read_org_member"
on clients for select
to authenticated
using (public.is_org_member(organization_id));

create policy "clients_write_org_admin"
on clients for all
to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));


-- ================================================================
-- color_references (global vocabulary)
-- ================================================================

-- Anyone authenticated can read the shared library.
create policy "color_references_read_authenticated"
on color_references for select
to authenticated
using (true);

-- Writes require the caller to be admin of AT LEAST ONE org — this
-- reflects the "internal staff can extend the reference book" scope
-- without needing a super-admin construct.
create policy "color_references_write_any_org_admin"
on color_references for all
to authenticated
using (
  exists (
    select 1 from public.organization_members
    where user_id = auth.uid() and role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.organization_members
    where user_id = auth.uid() and role = 'admin'
  )
);


-- ================================================================
-- match_history
-- ================================================================

-- Read: your own runs OR any run in an org you're a member of.
create policy "match_history_read_org_member_or_own"
on match_history for select
to authenticated
using (
  public.is_org_member(organization_id)
  or created_by = auth.uid()
);

-- Insert: the caller must be inserting a row they authored, and the
-- org_id must be their own (auto-set by set_org_from_user trigger, but
-- the WITH CHECK is defense-in-depth).
create policy "match_history_insert_own"
on match_history for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_org_member(organization_id)
);

-- Update/delete: admin-only within the org.
create policy "match_history_update_org_admin"
on match_history for update
to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "match_history_delete_org_admin"
on match_history for delete
to authenticated
using (public.is_org_admin(organization_id));
