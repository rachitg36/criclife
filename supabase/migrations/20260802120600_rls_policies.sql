-- docs/03-ROLES-PERMISSIONS.md §4 (permission matrix), §5 (policy sketches),
-- §6 (anonymous audience access). RLS enabled on every table, deny by default
-- — a table with no matching policy denies all access to non-superuser roles.

-- ── profiles ─────────────────────────────────────────────────────────────
-- Never publicly readable (§6): only the owner or a Super Admin. Rows are
-- created by the handle_new_user trigger only — no insert policy at all.

alter table profiles enable row level security;

create policy profiles_select_self_or_admin on profiles
  for select using (id = auth.uid() or public.is_super_admin());

create policy profiles_update_self_or_admin on profiles
  for update
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

-- ── players ──────────────────────────────────────────────────────────────
-- docs/03 §5 verbatim: public read, self-role-rule, super admin override.

alter table players enable row level security;

create policy players_read_all on players
  for select using (true);

create policy players_insert_by_managers on players
  for insert with check (
    public.is_super_admin() or auth.uid() is not null
  );

create policy players_update_self on players
  for update
  using (profile_id = auth.uid() and role_locked_by_admin = false)
  with check (profile_id = auth.uid() and role_locked_by_admin = false);

create policy players_update_superadmin on players
  for update using (public.is_super_admin())
  with check (public.is_super_admin());

-- ── role_change_suggestions ──────────────────────────────────────────────

alter table role_change_suggestions enable row level security;

create policy role_change_suggestions_select on role_change_suggestions
  for select using (
    public.is_super_admin()
    or suggested_by = auth.uid()
    or public.is_player_self(player_id)
  );

create policy role_change_suggestions_insert on role_change_suggestions
  for insert with check (
    suggested_by = auth.uid()
    and exists (
      select 1 from team_members tm
       where tm.player_id = role_change_suggestions.player_id
         and tm.left_at is null
         and public.is_team_manager(tm.team_id)
    )
  );

-- Only the player themself (accept/reject) or a Super Admin resolves it.
create policy role_change_suggestions_resolve on role_change_suggestions
  for update
  using (public.is_super_admin() or public.is_player_self(player_id))
  with check (public.is_super_admin() or public.is_player_self(player_id));

-- ── teams ────────────────────────────────────────────────────────────────

alter table teams enable row level security;

create policy teams_read_all on teams
  for select using (true);

create policy teams_insert_own on teams
  for insert with check (owner_id = auth.uid());

create policy teams_update on teams
  for update
  using (public.is_super_admin() or public.is_team_admin(id))
  with check (public.is_super_admin() or public.is_team_admin(id));

-- ── team_members ─────────────────────────────────────────────────────────

alter table team_members enable row level security;

create policy team_members_read_all on team_members
  for select using (true);

create policy team_members_insert on team_members
  for insert with check (
    public.is_super_admin() or public.is_team_manager(team_id)
  );

create policy team_members_update on team_members
  for update
  using (
    public.is_super_admin()
    or public.is_team_admin(team_id)
    or public.is_player_self(player_id)
  )
  with check (
    public.is_super_admin()
    or public.is_team_admin(team_id)
    or public.is_player_self(player_id)
  );

-- ── rules_profiles ───────────────────────────────────────────────────────

alter table rules_profiles enable row level security;

create policy rules_profiles_read_all on rules_profiles
  for select using (true);

create policy rules_profiles_write on rules_profiles
  for all
  using (public.is_super_admin() or created_by = auth.uid())
  with check (public.is_super_admin() or created_by = auth.uid());

-- ── matches ──────────────────────────────────────────────────────────────
-- docs/03 §5 verbatim. Lock enforcement is doubled up: the BEFORE UPDATE
-- trigger (enforce_match_lock) blocks it even for a manager whose own
-- can_manage_match() check would otherwise still say yes post-completion.

alter table matches enable row level security;

create policy matches_read_public on matches for select using (true);

create policy matches_write on matches for all
  using (public.is_super_admin() or public.can_manage_match(id))
  with check (public.is_super_admin() or public.can_manage_match(id));

-- team managers may also create the initial row, before an id exists to
-- check can_manage_match against — gate on team management of either side.
create policy matches_insert on matches for insert
  with check (
    public.is_super_admin()
    or created_by = auth.uid()
    or public.is_team_manager(team_a_id)
    or public.is_team_manager(team_b_id)
  );

-- ── match_squads ─────────────────────────────────────────────────────────

alter table match_squads enable row level security;

create policy match_squads_read_all on match_squads for select using (true);

create policy match_squads_write on match_squads for all
  using (public.is_super_admin() or public.can_manage_match(match_id))
  with check (public.is_super_admin() or public.can_manage_match(match_id));

-- ── scoring_grants ───────────────────────────────────────────────────────
-- docs/03 §5 verbatim.

alter table scoring_grants enable row level security;

create policy grants_read on scoring_grants
  for select using (
    public.is_super_admin()
    or public.can_manage_match(match_id)
    or grantee_profile_id = auth.uid()
  );

create policy grants_issue on scoring_grants
  for insert with check (
    granted_by_profile_id = auth.uid()
    and (
      public.is_super_admin()
      or public.can_manage_match(match_id)
      or exists (
        select 1 from scoring_grants g
         where g.match_id = scoring_grants.match_id
           and g.grantee_profile_id = auth.uid()
           and g.status = 'active'
           and g.can_delegate
      )
    )
  );

create policy grants_revoke on scoring_grants
  for update using (
    public.is_super_admin()
    or public.can_manage_match(match_id)
    or granted_by_profile_id = auth.uid()
    or grantee_profile_id = auth.uid()
  );

-- ── innings ──────────────────────────────────────────────────────────────
-- Public read for the audience view; writes only via can_manage_match (toss,
-- innings setup) — ball-by-ball totals are maintained by the deliveries
-- trigger (running as the migration owner, which bypasses RLS), never by a
-- direct client UPDATE.

alter table innings enable row level security;

create policy innings_read_public on innings for select using (true);

create policy innings_write on innings for all
  using (public.is_super_admin() or public.can_manage_match(match_id))
  with check (public.is_super_admin() or public.can_manage_match(match_id));

-- ── deliveries ───────────────────────────────────────────────────────────
-- docs/03 §5 verbatim — can_score() is the *only* path to an insert.

alter table deliveries enable row level security;

create policy deliveries_read_public on deliveries
  for select using (true);

create policy deliveries_insert_by_grant on deliveries
  for insert with check (
    public.can_score(match_id, auth.uid())
    and scored_by_profile_id = auth.uid()
    and not exists (
      select 1 from matches m where m.id = match_id and m.is_locked
    )
  );

create policy deliveries_update_by_grant on deliveries
  for update using (
    public.is_super_admin()
    or ( public.can_score(match_id, auth.uid())
         and not exists (select 1 from matches m
                          where m.id = match_id and m.is_locked) )
  );

create policy deliveries_no_delete on deliveries for delete using (false);

-- ── delivery_edits ───────────────────────────────────────────────────────
-- Audit trail: readable by anyone who can manage the match, insertable only
-- by whoever is credited as the editor. Never updatable — an audit row is
-- itself append-only.

alter table delivery_edits enable row level security;

create policy delivery_edits_read on delivery_edits
  for select using (
    public.is_super_admin()
    or exists (
      select 1 from deliveries d
       where d.id = delivery_edits.delivery_id
         and public.can_manage_match(d.match_id)
    )
  );

create policy delivery_edits_insert on delivery_edits
  for insert with check (edited_by_profile_id = auth.uid());

-- ── innings_intervals ────────────────────────────────────────────────────

alter table innings_intervals enable row level security;

create policy innings_intervals_read_public on innings_intervals for select using (true);

create policy innings_intervals_write on innings_intervals for all
  using (
    public.is_super_admin()
    or exists (
      select 1 from innings i where i.id = innings_intervals.innings_id
        and public.can_manage_match(i.match_id)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from innings i where i.id = innings_intervals.innings_id
        and public.can_manage_match(i.match_id)
    )
  );

-- ── batting_card_entries / bowling_card_entries ─────────────────────────
-- Public read (audience/scorecard); writes only happen via the
-- security-definer rebuild_innings() function, never directly by a client.

alter table batting_card_entries enable row level security;
alter table bowling_card_entries enable row level security;

create policy batting_card_entries_read_public on batting_card_entries for select using (true);
create policy bowling_card_entries_read_public on bowling_card_entries for select using (true);

-- ── player_match_stats / player_career_stats / ranking_snapshots ────────
-- Public read (docs/03 §4: "View any player's stats" ✅ for everyone,
-- including audience). Writes are Phase 8's finalize_match /
-- recompute_rankings edge functions, which run with the service role and so
-- bypass RLS entirely — no client-facing write policy is needed or wanted.

alter table player_match_stats enable row level security;
alter table player_career_stats enable row level security;
alter table ranking_snapshots enable row level security;

create policy player_match_stats_read_public on player_match_stats for select using (true);
create policy player_career_stats_read_public on player_career_stats for select using (true);
create policy ranking_snapshots_read_public on ranking_snapshots for select using (true);

-- ── audit_log ────────────────────────────────────────────────────────────
-- Super Admin reads everything; a Team Admin's "own team scope" (docs/03 §4)
-- is approximated here as: entries about players/teams/matches they manage.
-- Writes always go through security-definer functions (never direct insert).

alter table audit_log enable row level security;

create policy audit_log_read on audit_log
  for select using (
    public.is_super_admin()
    or (
      entity_type = 'team' and public.is_team_admin(entity_id)
    )
    or (
      entity_type = 'match' and public.can_manage_match(entity_id)
    )
  );

-- ── app_settings ─────────────────────────────────────────────────────────

alter table app_settings enable row level security;

create policy app_settings_read_all on app_settings for select using (true);

create policy app_settings_write_superadmin on app_settings for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ── notifications ────────────────────────────────────────────────────────

alter table notifications enable row level security;

create policy notifications_read_own on notifications
  for select using (profile_id = auth.uid() or public.is_super_admin());

create policy notifications_update_own on notifications
  for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
