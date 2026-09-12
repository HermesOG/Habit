-- 0001 · Базовая схема — ровно то, что было развёрнуто в проде на 2026-09-12 (снято с базы).
-- До этого файла схема жила только в Supabase; db/analytics.sql устарел и удалён.
-- Идемпотентно: можно запускать повторно.

create extension if not exists pg_net;

-- ── Таблицы ─────────────────────────────────────────────────────────────────
create table if not exists public.bot_config (
  key text primary key,
  val text not null
);

create table if not exists public.bot_users (
  user_id         text primary key,
  tz              text,
  push_enabled    boolean not null default true,
  last_action_day text,
  nudged_day      text,
  last_seen_at    timestamptz,
  first_seen_at   timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  source          text,
  morning_enabled boolean not null default true,
  morning_day     text,
  lang            text
);

create table if not exists public.bot_media (
  url        text primary key,
  file_id    text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.dau (
  day        date not null,
  user_id    text not null,
  platform   text,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  visits     integer not null default 1,
  primary key (day, user_id)
);

create table if not exists public.user_acq (
  user_id    text primary key,
  source     text not null default 'direct',
  first_seen timestamptz not null default now()
);

alter table public.bot_config enable row level security;
alter table public.bot_users  enable row level security;
alter table public.bot_media  enable row level security;
alter table public.dau        enable row level security;
alter table public.user_acq   enable row level security;
revoke all on table public.dau, public.user_acq from anon, authenticated;

insert into public.bot_config (key, val) values ('default_tz', 'Asia/Tashkent') on conflict (key) do nothing;
-- nudge_secret задаётся вручную: update public.bot_config set val = '<NUDGE_SECRET>' where key = 'nudge_secret';
insert into public.bot_config (key, val) values ('nudge_secret', 'CHANGE-ME') on conflict (key) do nothing;

-- ── Функции ─────────────────────────────────────────────────────────────────
create or replace function public.bot_ok(p_secret text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_secret is not null and p_secret = (select val from public.bot_config where key = 'nudge_secret');
$$;

create or replace function public.bot_tz(p_tz text)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(nullif(p_tz, ''), (select val from public.bot_config where key = 'default_tz'), 'UTC');
$$;

create or replace function public.bot_register(p_user_id text, p_tz text, p_push boolean, p_secret text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_inserted boolean;
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  insert into public.bot_users(user_id, tz, push_enabled, last_seen_at)
  values (p_user_id, nullif(p_tz,''), coalesce(p_push, true), now())
  on conflict (user_id) do update set
    tz           = coalesce(nullif(excluded.tz,''), public.bot_users.tz),
    push_enabled = coalesce(p_push, public.bot_users.push_enabled),
    last_seen_at = now(),
    updated_at   = now()
  returning (xmax = 0) into v_inserted;
  return v_inserted;
end $$;

create or replace function public.bot_set_push(p_user_id text, p_enabled boolean, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  insert into public.bot_users(user_id, push_enabled, last_seen_at)
  values (p_user_id, p_enabled, now())
  on conflict (user_id) do update set push_enabled = p_enabled, updated_at = now();
end $$;

create or replace function public.bot_set_morning(p_user_id text, p_enabled boolean, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  insert into public.bot_users(user_id, morning_enabled, last_seen_at)
  values (p_user_id, p_enabled, now())
  on conflict (user_id) do update set morning_enabled = p_enabled, updated_at = now();
end $$;

create or replace function public.bot_set_lang(p_user_id text, p_lang text, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_lang text;
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  v_lang := case when p_lang in ('ru','uz','en') then p_lang else 'ru' end;
  insert into public.bot_users(user_id, lang, last_seen_at)
  values (p_user_id, v_lang, now())
  on conflict (user_id) do update set lang = v_lang, updated_at = now();
end $$;

create or replace function public.bot_get_lang(p_user_id text, p_secret text)
returns text language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  return (select u.lang from public.bot_users u where u.user_id = p_user_id);
end $$;

create or replace function public.bot_mark_action(p_user_id text, p_tz text, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_tz text; v_day text;
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  select coalesce(nullif(p_tz,''), tz, 'UTC') into v_tz from public.bot_users where user_id = p_user_id;
  v_tz := coalesce(v_tz, nullif(p_tz,''), 'UTC');
  v_day := (now() at time zone v_tz)::date::text;
  insert into public.bot_users(user_id, tz, last_action_day, last_seen_at)
  values (p_user_id, nullif(p_tz,''), v_day, now())
  on conflict (user_id) do update set
    last_action_day = v_day,
    tz              = coalesce(nullif(excluded.tz,''), public.bot_users.tz),
    last_seen_at    = now(),
    updated_at      = now();
end $$;

create or replace function public.bot_claim_nudges(p_secret text)
returns table(uid text, ulang text) language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  return query
  update public.bot_users u
  set nudged_day = (now() at time zone public.bot_tz(u.tz))::date::text,
      updated_at = now()
  where u.push_enabled
    and extract(hour from (now() at time zone public.bot_tz(u.tz))) between 20 and 22
    and coalesce(u.last_action_day,'') <> (now() at time zone public.bot_tz(u.tz))::date::text
    and coalesce(u.nudged_day,'')      <> (now() at time zone public.bot_tz(u.tz))::date::text
  returning u.user_id, coalesce(u.lang, 'ru');
end $$;

create or replace function public.bot_claim_morning(p_secret text)
returns table(uid text, ulang text) language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  return query
  update public.bot_users u
  set morning_day = (now() at time zone public.bot_tz(u.tz))::date::text,
      updated_at = now()
  where u.morning_enabled
    and extract(hour from (now() at time zone public.bot_tz(u.tz))) between 9 and 11
    and coalesce(u.morning_day,'') <> (now() at time zone public.bot_tz(u.tz))::date::text
  returning u.user_id, coalesce(u.lang, 'ru');
end $$;

create or replace function public.bot_unmark(p_user_id text, p_kind text, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  if p_kind = 'morning' then
    update public.bot_users set morning_day = null where user_id = p_user_id;
  else
    update public.bot_users set nudged_day = null where user_id = p_user_id;
  end if;
end $$;

create or replace function public.media_all(p_secret text)
returns table(url text, file_id text) language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  return query select m.url, m.file_id from public.bot_media m;
end $$;

create or replace function public.media_put(p_url text, p_file_id text, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  insert into public.bot_media(url, file_id) values (p_url, p_file_id)
  on conflict (url) do update set file_id = excluded.file_id, updated_at = now();
end $$;

-- first-touch источник; реальный источник вытесняет прежний 'direct'
create or replace function public.record_source(p_user_id text, p_source text, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_src text;
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  v_src := nullif(p_source, '');
  insert into public.bot_users(user_id, source, last_seen_at)
  values (p_user_id, coalesce(v_src, 'direct'), now())
  on conflict (user_id) do update set
    source = case
      when public.bot_users.source is null then coalesce(v_src, 'direct')
      when public.bot_users.source = 'direct' and v_src is not null then v_src
      else public.bot_users.source
    end,
    updated_at = now();
end $$;

create or replace function public.record_visit(p_user_id text, p_day date, p_platform text default null)
returns void language sql security definer set search_path to '' as $$
  insert into public.dau (day, user_id, platform)
  values (p_day, p_user_id, p_platform)
  on conflict (day, user_id) do update
    set last_seen = now(),
        visits    = dau.visits + 1,
        platform  = coalesce(excluded.platform, dau.platform);
$$;

create or replace function public.get_stats(p_days integer default 30)
returns json language sql security definer set search_path to '' as $$
  select json_build_object(
    'total_users', (select count(distinct user_id) from public.dau),
    'active_7d',   (select count(distinct user_id) from public.dau where day >= current_date - 6),
    'active_30d',  (select count(distinct user_id) from public.dau where day >= current_date - 29),
    'daily', (
      select coalesce(json_agg(row_to_json(t) order by t.day desc), '[]'::json)
      from (
        select day, count(*)::int as users, sum(visits)::int as visits
        from public.dau group by day order by day desc limit p_days
      ) t
    )
  );
$$;

revoke all on function public.record_visit(text, date, text) from public, anon, authenticated;
revoke all on function public.get_stats(integer) from public, anon, authenticated;
grant execute on function public.record_visit(text, date, text) to service_role;
grant execute on function public.get_stats(integer) to service_role;

-- [prod-only]
-- Ежечасный тик напоминаний (URL прода). Для стенда — свой job, см. db/README.md.
select cron.schedule('nudge-hourly', '0 * * * *', $$
  select net.http_post(
    url := 'https://habit-sigma-wine.vercel.app/api/nudge',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-nudge-secret', (select val from public.bot_config where key = 'nudge_secret')
    ),
    timeout_milliseconds := 55000
  );
$$) where not exists (select 1 from cron.job where jobname = 'nudge-hourly');
-- [/prod-only]
