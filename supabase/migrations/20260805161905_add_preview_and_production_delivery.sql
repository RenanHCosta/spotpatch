begin;

alter table public.projects
  add column production_agent_id text;

alter table public.executions
  add column preview_url text,
  add column production_url text,
  add column production_deployment_id text,
  add column merged_at timestamptz,
  add column deployed_at timestamptz;

alter table public.agent_runs drop constraint if exists agent_runs_run_type_check;
alter table public.agent_runs add constraint agent_runs_run_type_check
  check (run_type in ('investigation', 'execution', 'production', 'validation'));

create unique index one_active_production_per_feedback
  on public.agent_runs(feedback_item_id)
  where run_type = 'production' and status in ('queued', 'in_progress');

alter table public.feedback_events drop constraint if exists feedback_events_actor_type_check;
alter table public.feedback_events add constraint feedback_events_actor_type_check
  check (actor_type in (
    'visitor',
    'operator',
    'system',
    'investigator_agent',
    'executor_agent',
    'release_agent'
  ));

commit;
