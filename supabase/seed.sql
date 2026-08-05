insert into public.projects(id,name,slug,site_url,allowed_domains,repository_provider,repository_owner,repository_name,default_branch,agent_mode,deco_studio_org_slug,agent_tier,is_active)
values('11111111-1111-4111-8111-111111111111','Loja Demo SpotPatch','loja-demo','http://localhost:3000/demo','["localhost", "127.0.0.1"]','github','spotpatch-demo','storefront','main','autonomous_pr',null,'smart',true)
on conflict(id) do update set name=excluded.name,allowed_domains=excluded.allowed_domains,is_active=true;
