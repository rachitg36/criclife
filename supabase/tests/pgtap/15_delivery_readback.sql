-- Read back what record_delivery actually stored. HANDOFF § 8.14.
--
-- Two bugs lived in `record_delivery` from Phase 5 to Phase 8 — every ball
-- stored as a wicket, no boundary ever flagged, every wide and no-ball a run
-- short — with 199 pgTAP assertions and 400 unit tests green the whole time.
-- Neither layer could see them:
--
--   * The pure TS engine never touches jsonb or the database, and the scorer
--     pad projects from its own local log, so the screen was always right.
--   * The pgTAP suite asserted that the RPC returned a row, and asserted the
--     *scoring rules* — legality, seq, grants, bowler limits. It never read
--     `is_wicket`, `is_boundary_four` or `runs_extras` back out, because
--     nothing needed those columns until Phase 8 wanted them for stats.
--   * And, decisively, **every existing test sends a payload the client never
--     sends.** They omit `wicket` entirely. The scorer store spreads a
--     `DeliveryInput`, whose `wicket` field is always present and is `null` on
--     a dot, a single, a four. `p->'wicket'` on `{"wicket": null}` returns
--     'null'::jsonb, which is not SQL NULL — so the guard `v_wicket is null`
--     was false on literally every delivery, and no test could have hit it.
--
-- So this file has one rule: **send exactly what `src/features/scoring/store.ts`
-- sends, including `"wicket": null`, and assert on the stored columns.** A
-- write path nothing reads back is not tested, however green the suite is.

begin;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'readbackCaptainA@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'readbackCaptainB@test.local');

insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000070', 'Readback A', 'RBA', '00000000-0000-0000-0000-0000000000e1'),
  ('10000000-0000-0000-0000-000000000071', 'Readback B', 'RBB', '00000000-0000-0000-0000-0000000000e2');

insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000400', '00000000-0000-0000-0000-0000000000e1', 'R Captain'),
  ('20000000-0000-0000-0000-000000000401', null, 'R Striker'),
  ('20000000-0000-0000-0000-000000000402', null, 'R NonStriker'),
  ('20000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-0000000000e2', 'R OppCaptain'),
  ('20000000-0000-0000-0000-000000000411', null, 'R Bowler'),
  ('20000000-0000-0000-0000-000000000412', null, 'R Fielder');

insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000070', '20000000-0000-0000-0000-000000000400', 'captain'),
  ('10000000-0000-0000-0000-000000000070', '20000000-0000-0000-0000-000000000401', 'player'),
  ('10000000-0000-0000-0000-000000000070', '20000000-0000-0000-0000-000000000402', 'player'),
  ('10000000-0000-0000-0000-000000000071', '20000000-0000-0000-0000-000000000410', 'captain'),
  ('10000000-0000-0000-0000-000000000071', '20000000-0000-0000-0000-000000000411', 'player'),
  ('10000000-0000-0000-0000-000000000071', '20000000-0000-0000-0000-000000000412', 'player');

-- wideRuns 1 / noBallRuns 1 are the defaults, and the point of the second bug:
-- the client sends `extraRuns` meaning "on top of the penalty", so the server
-- has to add the penalty itself.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
select create_match(
  '10000000-0000-0000-0000-000000000070', '10000000-0000-0000-0000-000000000071',
  '{"oversPerInnings":5,"ballsPerOver":6,"playersPerSide":3,"maxOversPerBowler":5,"wideRuns":1,"noBallRuns":1,"freeHitAfterNoBall":true}'::jsonb,
  'Readback Test Match'
);
select id as match_id from matches where title = 'Readback Test Match' \gset

select set_toss(:'match_id', '10000000-0000-0000-0000-000000000070', 'bat');
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000070',
  array['20000000-0000-0000-0000-000000000400'::uuid, '20000000-0000-0000-0000-000000000401'::uuid, '20000000-0000-0000-0000-000000000402'::uuid],
  '20000000-0000-0000-0000-000000000400', null
);
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000071',
  array['20000000-0000-0000-0000-000000000410'::uuid, '20000000-0000-0000-0000-000000000411'::uuid, '20000000-0000-0000-0000-000000000412'::uuid],
  '20000000-0000-0000-0000-000000000410', null
);
select start_innings(:'match_id');
select id as innings_id from innings where match_id = (:'match_id')::uuid and innings_no = 1 \gset

-- ── the deliveries, in the client's own payload shape ────────────────────
-- Every one carries "wicket": null or a real wicket object, exactly as
-- recordRun / recordExtra / recordWicket build them.

create function pg_temp.ball(p_innings uuid, p_body text) returns void
language plpgsql as $$
declare v_seq bigint;
begin
  select coalesce(max(seq), 0) into v_seq
    from deliveries where innings_id = p_innings and not is_deleted;
  perform record_delivery(
    ('{"inningsId":"' || p_innings || '","clientDeliveryId":"' || gen_random_uuid()
      || '","expectedSeq":' || v_seq
      || ',"strikerId":"20000000-0000-0000-0000-000000000401"'
      || ',"nonStrikerId":"20000000-0000-0000-0000-000000000402"'
      || ',"bowlerId":"20000000-0000-0000-0000-000000000411",' || p_body || '}')::jsonb
  );
end;
$$;

-- 1. A dot. The one that used to come back a wicket.
select pg_temp.ball((:'innings_id')::uuid, '"runsOffBat":0,"extraType":null,"extraRuns":0,"wicket":null');
-- 2. A four. 3. A six.
select pg_temp.ball((:'innings_id')::uuid, '"runsOffBat":4,"extraType":null,"extraRuns":0,"wicket":null');
select pg_temp.ball((:'innings_id')::uuid, '"runsOffBat":6,"extraType":null,"extraRuns":0,"wicket":null');
-- 4. A plain wide. 5. A wide the batters ran 2 on. 6. A plain no-ball.
select pg_temp.ball((:'innings_id')::uuid, '"runsOffBat":0,"extraType":"wide","extraRuns":0,"wicket":null');
select pg_temp.ball((:'innings_id')::uuid, '"runsOffBat":0,"extraType":"wide","extraRuns":2,"wicket":null');
select pg_temp.ball((:'innings_id')::uuid, '"runsOffBat":0,"extraType":"no_ball","extraRuns":0,"wicket":null');
-- 7. Two byes — no automatic penalty, so this one must NOT gain a run.
select pg_temp.ball((:'innings_id')::uuid, '"runsOffBat":0,"extraType":"bye","extraRuns":2,"wicket":null');
-- 8. An actual wicket.
select pg_temp.ball((:'innings_id')::uuid,
  '"runsOffBat":0,"extraType":null,"extraRuns":0,"wicket":{"type":"bowled","dismissedPlayerId":"20000000-0000-0000-0000-000000000401"}');

create temp view balls as
  select row_number() over (order by seq) as n, * from deliveries
   where innings_id = (:'innings_id')::uuid and not is_deleted;

-- ── bug 1: the JSON null ─────────────────────────────────────────────────

select is(
  (select count(*)::int from balls where is_wicket), 1,
  'exactly one of the eight balls is a wicket — "wicket": null is not a wicket'
);
select ok(
  not (select is_wicket from balls where n = 1),
  'a dot ball carrying "wicket": null is not stored as a wicket'
);
select ok(
  (select is_wicket from balls where n = 8),
  'a ball carrying a real wicket object is stored as a wicket'
);
select is(
  (select wicket_type::text from balls where n = 8), 'bowled',
  'the wicket type survives the round trip'
);
select is(
  (select dismissed_player_id from balls where n = 8),
  '20000000-0000-0000-0000-000000000401'::uuid,
  'so does the dismissed player'
);
select ok(
  (select wicket_type is null and dismissed_player_id is null from balls where n = 1),
  'and a non-wicket carries no dismissal detail'
);

-- The boundary flags were the second casualty of the same line: they are
-- computed as `runs_batter = 4 and v_wicket is null`, so while every ball
-- looked like a wicket, no four or six was ever flagged.
select ok((select is_boundary_four from balls where n = 2), 'a four is flagged as a four');
select ok(not (select is_boundary_six from balls where n = 2), 'a four is not also a six');
select ok((select is_boundary_six from balls where n = 3), 'a six is flagged as a six');
select ok(not (select is_boundary_four from balls where n = 3), 'a six is not also a four');
select is(
  (select count(*)::int from balls where is_boundary_four or is_boundary_six), 2,
  'and nothing else in the over is a boundary'
);

-- ── bug 2: the automatic wide / no-ball run ──────────────────────────────
-- The client's `extraRuns` means "additional to the penalty" — the same thing
-- the engine means by it (applyDelivery § 3: extraRunsTotal = autoExtra +
-- input.extraRuns). The server stored it verbatim, so every wide and no-ball
-- was a run short in the database while the pad showed it correctly.

select is(
  (select runs_extras from balls where n = 4), 1,
  'a wide sent with extraRuns 0 stores 1 — the server adds wideRuns itself'
);
select is(
  (select runs_extras from balls where n = 5), 3,
  'a wide the batters ran 2 on stores 3, not 2'
);
select is(
  (select runs_extras from balls where n = 6), 1,
  'a no-ball sent with extraRuns 0 stores 1'
);
select is(
  (select runs_extras from balls where n = 7), 2,
  'byes carry no automatic penalty and are stored exactly as sent'
);

-- ── the totals those columns feed ────────────────────────────────────────
-- The point of the bugs was never the columns; it was that innings totals,
-- the audience feed and every career stat are derived from them.

select is(
  (select total_wickets from innings where id = (:'innings_id')::uuid), 1,
  'the innings is 1 down, not 8 — the number that made a side all out in ten balls'
);
select is(
  (select total_runs from innings where id = (:'innings_id')::uuid), 17,
  'total_runs is 10 off the bat + 7 in extras'
);
select is(
  (select extras_wides from innings where id = (:'innings_id')::uuid), 4,
  'wides total 4 across the two of them'
);
select is(
  (select extras_no_balls from innings where id = (:'innings_id')::uuid), 1,
  'and the no-ball contributes its penalty'
);
select is(
  (select legal_balls from innings where id = (:'innings_id')::uuid), 5,
  'three wides and no-balls do not count toward the over'
);

-- ── edit_delivery carries the same trap ──────────────────────────────────
-- It reads `p_changes->'wicket'` the same way, and the review tray sends the
-- same always-present field. Correcting a run must not invent a dismissal.

select id as edit_target from balls where n = 2 \gset
select edit_delivery(
  (:'edit_target')::uuid,
  '{"runsOffBat":6,"wicket":null}'::jsonb,
  'readback test'
);

select ok(
  not (select is_wicket from deliveries
        where innings_id = (:'innings_id')::uuid and not is_deleted and seq = (
          select seq from deliveries where id = (:'edit_target')::uuid)),
  'editing a ball with "wicket": null does not turn it into a wicket'
);
select ok(
  (select is_boundary_six and not is_boundary_four from deliveries
    where innings_id = (:'innings_id')::uuid and not is_deleted and seq = (
      select seq from deliveries where id = (:'edit_target')::uuid)),
  'and the corrected four is now flagged a six'
);

select * from finish();
rollback;
