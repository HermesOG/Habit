-- 0003 · События воронки + статистика по источникам.
-- Одна строка на пользователя, событие и день — считаем людей, а не тапы.
-- user_acq больше не нужна: источник живёт в bot_users.source (так и было в проде,
-- а get_stats ошибочно читал пустую user_acq — отсюда вечная пустая разбивка по источникам).

create table if not exists public.events (
  user_id text not null,
  name    text not null,
  day     date not null,
  at      timestamptz not null default now(),
  meta    jsonb,
  primary key (user_id, name, day)
);
create index if not exists events_name_day on public.events (name, day);
alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;

create or replace function public.record_event(p_user_id text, p_name text, p_day date, p_meta jsonb, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  insert into public.events (user_id, name, day, meta)
  values (p_user_id, left(p_name, 40), coalesce(p_day, current_date), p_meta)
  on conflict (user_id, name, day) do update set meta = coalesce(excluded.meta, public.events.meta);
end $$;
revoke execute on function public.record_event(text, text, date, jsonb, text) from public, anon, authenticated;
grant  execute on function public.record_event(text, text, date, jsonb, text) to service_role;

drop table if exists public.user_acq;

-- get_stats считает заблокировавших бота — столбец появляется здесь (0004 повторяет add column idempotently)
alter table public.bot_users add column if not exists blocked_at timestamptz;

create or replace function public.get_stats(p_days integer default 30)
returns json language sql security definer set search_path to '' as $$
  select json_build_object(
    'total_users', (select count(distinct user_id) from public.dau),
    'active_7d',   (select count(distinct user_id) from public.dau where day >= current_date - 6),
    'active_30d',  (select count(distinct user_id) from public.dau where day >= current_date - 29),
    'by_source', (
      select coalesce(json_agg(row_to_json(s) order by s.users desc), '[]'::json)
      from (select coalesce(source, 'direct') as source, count(*)::int as users from public.bot_users group by 1) s
    ),
    'funnel', json_build_object(
      'opened',        (select count(distinct user_id) from public.events where name = 'open'),
      'habit_created', (select count(distinct user_id) from public.events where name = 'habit_created'),
      'checked',       (select count(distinct user_id) from public.events where name = 'check'),
      'checked_2days', (select count(*) from (select user_id from public.events where name = 'check' group by user_id having count(distinct day) >= 2) q),
      'checked_day7',  (select count(*) from (
                          select e.user_id from public.events e
                          join (select user_id, min(day) d0 from public.events where name = 'open' group by user_id) o on o.user_id = e.user_id
                          where e.name = 'check' and e.day >= o.d0 + 6 group by e.user_id) q),
      'muted_any',     (select count(*) from public.bot_users where not push_enabled or not morning_enabled),
      'blocked',       (select count(*) from public.bot_users where blocked_at is not null)
    ),
    'daily', (
      select coalesce(json_agg(row_to_json(t) order by t.day desc), '[]'::json)
      from (
        select day, count(*)::int as users, sum(visits)::int as visits
        from public.dau group by day order by day desc limit p_days
      ) t
    )
  );
$$;
