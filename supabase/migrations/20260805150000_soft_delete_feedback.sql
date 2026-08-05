alter table public.feedback_items
  add column if not exists deleted_at timestamptz;

create index if not exists feedback_items_active_idx
  on public.feedback_items(project_id, created_at desc)
  where deleted_at is null;

create or replace function public.soft_delete_feedback(p_feedback_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_status text;
  deleted_time timestamptz := now();
begin
  if exists (
    select 1
    from public.agent_runs
    where feedback_item_id = p_feedback_id
      and status in ('queued', 'in_progress')
  ) then
    raise exception 'Feedback cannot be deleted while an agent run is active'
      using errcode = 'P0001';
  end if;

  update public.feedback_items
  set deleted_at = deleted_time
  where id = p_feedback_id and deleted_at is null
  returning status into previous_status;

  if not found then
    raise exception 'Feedback not found' using errcode = 'P0002';
  end if;

  insert into public.feedback_events (
    feedback_item_id,
    actor_type,
    actor_label,
    event_type,
    previous_status,
    payload
  ) values (
    p_feedback_id,
    'operator',
    'Operador',
    'feedback_deleted',
    previous_status,
    jsonb_build_object('deletedAt', deleted_time)
  );
end;
$$;

revoke execute on function public.soft_delete_feedback(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_feedback(uuid) to service_role;
