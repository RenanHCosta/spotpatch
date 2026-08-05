begin;

update public.projects
set agent_mode = 'autonomous_pr'
where agent_mode = 'approval_required';

update public.feedback_items
set status = 'queued_for_execution'
where status = 'awaiting_approval';

update public.feedback_events
set
  previous_status = case
    when coalesce(previous_status, payload ->> 'previousStatus') = 'awaiting_approval'
      then 'queued_for_execution'
    else coalesce(previous_status, payload ->> 'previousStatus')
  end,
  new_status = case
    when coalesce(new_status, payload ->> 'newStatus') = 'awaiting_approval'
      then 'queued_for_execution'
    else coalesce(new_status, payload ->> 'newStatus')
  end,
  event_type = case
    when event_type = 'execution_approved' then 'execution_queued_automatically'
    else event_type
  end,
  payload = case
    when payload ? 'payload' then coalesce(payload -> 'payload', '{}'::jsonb)
    else payload
  end;

alter table public.projects drop constraint if exists projects_agent_mode_check;
alter table public.projects alter column agent_mode set default 'autonomous_pr';
alter table public.projects add constraint projects_agent_mode_check
  check (agent_mode in ('investigation_only', 'autonomous_pr'));

alter table public.feedback_items drop constraint if exists feedback_items_status_check;
alter table public.feedback_items add constraint feedback_items_status_check
  check (status in (
    'new',
    'queued_for_investigation',
    'investigating',
    'needs_information',
    'queued_for_execution',
    'executing',
    'pull_request_opened',
    'completed',
    'failed',
    'rejected'
  ));

commit;
