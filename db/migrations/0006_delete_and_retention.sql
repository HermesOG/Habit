-- 0006 · Право на удаление (/delete в боте) и ретенция: неактивные записи стираются через 12 месяцев,
-- как обещано в политике конфиденциальности (privacy.html).

create or replace function public.bot_delete_user(p_user_id text, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  update public.bot_users set referrer_id = null where referrer_id = p_user_id;
  delete from public.events    where user_id = p_user_id;
  delete from public.dau       where user_id = p_user_id;
  delete from public.bot_users where user_id = p_user_id;
end $$;
revoke execute on function public.bot_delete_user(text, text) from public, anon, authenticated;
grant  execute on function public.bot_delete_user(text, text) to service_role;

create or replace function public.purge_inactive()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  with gone as (
    delete from public.bot_users
     where coalesce(last_seen_at, first_seen_at) < now() - interval '12 months'
       and (last_action_day is null or last_action_day::date < current_date - 365)
    returning user_id
  )
  select count(*) into n from gone;
  delete from public.events where day < current_date - 400;
  delete from public.dau    where day < current_date - 400;
  return n;
end $$;
revoke execute on function public.purge_inactive() from public, anon, authenticated;

-- [prod-only]
select cron.schedule('purge-inactive', '15 3 * * *', $$ select public.purge_inactive(); $$)
 where not exists (select 1 from cron.job where jobname = 'purge-inactive');
-- [/prod-only]
