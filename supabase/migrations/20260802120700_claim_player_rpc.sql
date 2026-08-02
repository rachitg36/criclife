-- docs/03-ROLES-PERMISSIONS.md § 2.3 — "Shadow players ... have their role
-- set by whoever created them, until the player claims the record via
-- claim_code. On claim, ownership transfers to the claiming profile."
--
-- No existing RLS policy can express this: `players_update_self` requires
-- `profile_id = auth.uid()` already, which is exactly what claiming is
-- setting for the first time (profile_id starts null on a shadow player).
-- A dedicated RPC — not a policy — is the right shape here, same reasoning
-- as update_player_admin_fields: the one thing this function is allowed to
-- do (attach a profile to an unclaimed row matching the code) is narrower
-- than anything a `using`/`with check` clause could safely express.

create or replace function public.claim_player(p_claim_code text)
returns players
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN: must be signed in to claim a player record';
  end if;

  select * into v_player from players where claim_code = p_claim_code and profile_id is null;
  if v_player.id is null then
    raise exception 'CLAIM_CODE_INVALID: no unclaimed player matches this code';
  end if;

  update players set profile_id = auth.uid(), claimed_at = now()
    where id = v_player.id
    returning * into v_player;

  return v_player;
end;
$$;
