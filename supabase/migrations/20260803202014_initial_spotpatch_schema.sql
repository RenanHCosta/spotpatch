create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  site_url text not null,
  allowed_domains jsonb not null default '[]'::jsonb check (jsonb_typeof(allowed_domains) = 'array'),
  repository_provider text not null default 'github',
  repository_owner text not null,
  repository_name text not null,
  default_branch text not null default 'main',
  agent_mode text not null default 'autonomous_pr' check (agent_mode in ('investigation_only','autonomous_pr')),
  deco_studio_org_slug text,
  investigation_agent_id text,
  execution_agent_id text,
  agent_tier text not null default 'smart',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feedback_items (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  public_number bigint generated always as identity, title text not null, comment text not null,
  category text not null check (category in ('visual_bug','functional_bug','content_change','ux_improvement','performance','accessibility','other')),
  priority text not null check (priority in ('low','medium','high','critical')),
  status text not null default 'new' check (status in ('new','queued_for_investigation','investigating','needs_information','queued_for_execution','executing','pull_request_opened','completed','failed','rejected')),
  author_name text, author_email text, installation_id uuid not null, session_id uuid not null,
  page_url text not null, normalized_url text not null, hostname text not null, page_title text not null default '',
  viewport jsonb not null, scroll_position jsonb not null, screenshot_path text, element_screenshot_path text,
  idempotency_key text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(project_id,idempotency_key)
);
create index feedback_items_project_status_idx on public.feedback_items(project_id,status,created_at desc);
create index feedback_items_page_idx on public.feedback_items(project_id,normalized_url,created_at desc);

create table public.selected_elements (
  id uuid primary key default gen_random_uuid(), feedback_item_id uuid not null unique references public.feedback_items(id) on delete cascade,
  tag_name text not null,text_content text not null,css_selector text not null,xpath text not null,outer_html text not null,
  attributes jsonb not null,class_list jsonb not null,bounding_box jsonb not null,computed_styles jsonb not null,parent_context jsonb not null,nearby_text text not null,data_agent_id text,created_at timestamptz not null default now()
);
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),feedback_item_id uuid not null references public.feedback_items(id),
  run_type text not null check(run_type in ('investigation','execution','validation')),provider text not null check(provider in ('deco_studio','demo')),
  agent_id text,thread_id text,task_id text,status text not null,request_payload jsonb,result_payload jsonb,error_message text,
  idempotency_key text not null,started_at timestamptz,finished_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(run_type,feedback_item_id,idempotency_key)
);
create index agent_runs_feedback_idx on public.agent_runs(feedback_item_id,created_at desc);
create index agent_runs_project_idx on public.agent_runs(project_id,created_at desc);
create unique index one_active_investigation_per_feedback on public.agent_runs(feedback_item_id) where run_type='investigation' and status in ('queued','in_progress');
create unique index one_active_execution_per_feedback on public.agent_runs(feedback_item_id) where run_type='execution' and status in ('queued','in_progress');

create table public.investigations (
  id uuid primary key default gen_random_uuid(),feedback_item_id uuid not null references public.feedback_items(id),agent_run_id uuid unique references public.agent_runs(id),
  interpreted_request text not null,summary text not null,technical_hypothesis text not null,recommended_action text not null,likely_files jsonb not null default '[]',
  risk_level text not null check(risk_level in ('low','medium','high','critical')),confidence numeric not null check(confidence between 0 and 1),requires_human_input boolean not null,questions jsonb not null default '[]',can_execute boolean not null,raw_agent_result jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index investigations_feedback_idx on public.investigations(feedback_item_id,created_at desc);
create table public.executions (
  id uuid primary key default gen_random_uuid(),feedback_item_id uuid not null references public.feedback_items(id),investigation_id uuid not null references public.investigations(id),agent_run_id uuid unique references public.agent_runs(id),
  status text not null,branch_name text,base_branch text,commit_sha text,pull_request_number integer,pull_request_url text,summary text,changed_files jsonb not null default '[]',checks jsonb not null default '[]',warnings jsonb not null default '[]',error_message text,
  started_at timestamptz,finished_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index executions_feedback_idx on public.executions(feedback_item_id,created_at desc);
create index executions_investigation_idx on public.executions(investigation_id);
create table public.feedback_events (
  id uuid primary key default gen_random_uuid(),feedback_item_id uuid not null references public.feedback_items(id) on delete cascade,
  actor_type text not null check(actor_type in ('visitor','operator','system','investigator_agent','executor_agent')),actor_label text not null,event_type text not null,previous_status text,new_status text,payload jsonb not null default '{}',created_at timestamptz not null default now()
);
create index feedback_events_timeline_idx on public.feedback_events(feedback_item_id,created_at);
create table public.project_integrations (
  id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,integration_type text not null,external_reference text,status text not null,metadata jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(project_id,integration_type,external_reference)
);

create function public.set_updated_at() returns trigger language plpgsql security invoker set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();
create trigger feedback_updated before update on public.feedback_items for each row execute function public.set_updated_at();
create trigger runs_updated before update on public.agent_runs for each row execute function public.set_updated_at();
create trigger investigations_updated before update on public.investigations for each row execute function public.set_updated_at();
create trigger executions_updated before update on public.executions for each row execute function public.set_updated_at();
create trigger integrations_updated before update on public.project_integrations for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.feedback_items enable row level security;
alter table public.selected_elements enable row level security;
alter table public.investigations enable row level security;
alter table public.executions enable row level security;
alter table public.agent_runs enable row level security;
alter table public.feedback_events enable row level security;
alter table public.project_integrations enable row level security;

revoke all on all tables in schema public from anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;
revoke execute on function public.set_updated_at() from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('spotpatch-feedback','spotpatch-feedback',false,8388608,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
