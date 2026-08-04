-- Phase 9 — account deletion requests, which could never have worked.
--
-- `DataSettings` inserted straight into `notifications` from the client. That
-- table has SELECT and UPDATE policies and no INSERT policy, so deny-by-default
-- refused it: "new row violates row-level security policy for table
-- notifications". Reported from a phone.
--
-- The missing policy is not the fix. A client able to insert notifications can
-- write anything to anyone — a spam vector, and `payload` is untyped jsonb. The
-- request goes through a function that decides what a request looks like, and
-- the client keeps no write access at all.
--
-- The notification goes to every super admin, not to the person asking. They
-- are the ones who need to see it; the requester gets the on-screen answer.

-- `notifications.type` is text with a CHECK list, and had no value for this.
-- The client was sending 'role_suggestion', which would have put a deletion
-- request in the wrong inbox had the insert ever succeeded.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'grant_issued', 'grant_revoked', 'match_starting', 'role_suggestion',
    'rank_change', 'account_deletion'
  ));

create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admins int;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN: sign in to request deletion';
  end if;

  insert into notifications (profile_id, type, payload)
  select
    p.id,
    'account_deletion',
    jsonb_build_object(
      'kind', 'account_deletion_requested',
      'requestedBy', auth.uid(),
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'requestedAt', now()
    )
  from profiles p
  where p.is_super_admin;
  get diagnostics v_admins = row_count;

  insert into audit_log (actor_profile_id, action, entity_type, entity_id, before)
  values (auth.uid(), 'request_account_deletion', 'profiles', auth.uid(),
          jsonb_build_object('reason', p_reason));

  -- Zero admins is not an error the requester can act on, and silently
  -- succeeding would be a lie. The audit row is the durable record either way.
  return jsonb_build_object('ok', true, 'notified', v_admins);
end;
$$;

revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;
