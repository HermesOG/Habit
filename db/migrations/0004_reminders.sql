-- 0004 · Адресные напоминания: сводка привычек, свой час, пометка заблокировавших, настройки из приложения.
-- ВНИМАНИЕ: 0003 ссылается на blocked_at — применять 0004 сразу после 0003 (get_stats до этого
-- момента вызывать нельзя). Порядок в db/README.md.

alter table public.bot_users
  add column if not exists summary      jsonb,
  add column if not exists summary_at   timestamptz,
  add column if not exists morning_hour integer not null default 9,
  add column if not exists evening_hour integer not null default 20,
  add column if not exists blocked_at   timestamptz;

-- /start снова: снимаем блокировку (человек вернулся)
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
    blocked_at   = case when p_push is true then null else public.bot_users.blocked_at end,
    last_seen_at = now(),
    updated_at   = now()
  returning (xmax = 0) into v_inserted;
  return v_inserted;
end $$;

-- Сводка без отметки действия (изменился список привычек, ничего не выполнено)
create or replace function public.bot_sync(p_user_id text, p_tz text, p_summary jsonb, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  insert into public.bot_users(user_id, tz, summary, summary_at, last_seen_at)
  values (p_user_id, nullif(p_tz,''), p_summary, now(), now())
  on conflict (user_id) do update set
    tz           = coalesce(nullif(excluded.tz,''), public.bot_users.tz),
    summary      = coalesce(p_summary, public.bot_users.summary),
    summary_at   = case when p_summary is null then public.bot_users.summary_at else now() end,
    last_seen_at = now(),
    updated_at   = now();
end $$;
revoke execute on function public.bot_sync(text, text, jsonb, text) from public, anon, authenticated;
grant  execute on function public.bot_sync(text, text, jsonb, text) to service_role;

-- Действие дня + сводка (старая сигнатура удаляется, чтобы PostgREST не путал перегрузки)
drop function if exists public.bot_mark_action(text, text, text);
create or replace function public.bot_mark_action(p_user_id text, p_tz text, p_summary jsonb, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_tz text; v_day text;
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  select coalesce(nullif(p_tz,''), tz, 'UTC') into v_tz from public.bot_users where user_id = p_user_id;
  v_tz := coalesce(v_tz, nullif(p_tz,''), 'UTC');
  v_day := (now() at time zone v_tz)::date::text;
  insert into public.bot_users(user_id, tz, last_action_day, summary, summary_at, last_seen_at)
  values (p_user_id, nullif(p_tz,''), v_day, p_summary, now(), now())
  on conflict (user_id) do update set
    last_action_day = v_day,
    tz              = coalesce(nullif(excluded.tz,''), public.bot_users.tz),
    summary         = coalesce(p_summary, public.bot_users.summary),
    summary_at      = case when p_summary is null then public.bot_users.summary_at else now() end,
    last_seen_at    = now(),
    updated_at      = now();
end $$;
revoke execute on function public.bot_mark_action(text, text, jsonb, text) from public, anon, authenticated;
grant  execute on function public.bot_mark_action(text, text, jsonb, text) to service_role;

-- Заблокировал бота / удалил аккаунт — больше не дёргаем (до следующего /start)
create or replace function public.bot_set_blocked(p_user_id text, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  update public.bot_users set blocked_at = now(), updated_at = now() where user_id = p_user_id;
end $$;
revoke execute on function public.bot_set_blocked(text, text) from public, anon, authenticated;
grant  execute on function public.bot_set_blocked(text, text) to service_role;

-- Claim-функции: свой час, без заблокированных, отдают сводку и пояс для текста
drop function if exists public.bot_claim_morning(text);
create or replace function public.bot_claim_morning(p_secret text)
returns table(uid text, ulang text, usummary jsonb, utz text) language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  return query
  update public.bot_users u
  set morning_day = (now() at time zone public.bot_tz(u.tz))::date::text,
      updated_at = now()
  where u.morning_enabled and u.blocked_at is null
    and extract(hour from (now() at time zone public.bot_tz(u.tz))) between u.morning_hour and u.morning_hour + 2
    and coalesce(u.morning_day,'') <> (now() at time zone public.bot_tz(u.tz))::date::text
  returning u.user_id, coalesce(u.lang, 'ru'), u.summary, public.bot_tz(u.tz);
end $$;
revoke execute on function public.bot_claim_morning(text) from public, anon, authenticated;
grant  execute on function public.bot_claim_morning(text) to service_role;

drop function if exists public.bot_claim_nudges(text);
create or replace function public.bot_claim_nudges(p_secret text)
returns table(uid text, ulang text, usummary jsonb, utz text) language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  return query
  update public.bot_users u
  set nudged_day = (now() at time zone public.bot_tz(u.tz))::date::text,
      updated_at = now()
  where u.push_enabled and u.blocked_at is null
    and extract(hour from (now() at time zone public.bot_tz(u.tz))) between u.evening_hour and u.evening_hour + 2
    and coalesce(u.last_action_day,'') <> (now() at time zone public.bot_tz(u.tz))::date::text
    and coalesce(u.nudged_day,'')      <> (now() at time zone public.bot_tz(u.tz))::date::text
  returning u.user_id, coalesce(u.lang, 'ru'), u.summary, public.bot_tz(u.tz);
end $$;
revoke execute on function public.bot_claim_nudges(text) from public, anon, authenticated;
grant  execute on function public.bot_claim_nudges(text) to service_role;

-- Настройки для экрана «Уведомления» в приложении (тот же источник истины, что и кнопки бота)
create or replace function public.bot_get_prefs(p_user_id text, p_secret text)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare r public.bot_users%rowtype;
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  select * into r from public.bot_users where user_id = p_user_id;
  if not found then
    return json_build_object('morning', true, 'evening', true, 'morning_hour', 9, 'evening_hour', 20, 'lang', null, 'tz', null, 'summary', null);
  end if;
  return json_build_object('morning', r.morning_enabled, 'evening', r.push_enabled,
                           'morning_hour', r.morning_hour, 'evening_hour', r.evening_hour,
                           'lang', r.lang, 'tz', r.tz, 'summary', r.summary);
end $$;
revoke execute on function public.bot_get_prefs(text, text) from public, anon, authenticated;
grant  execute on function public.bot_get_prefs(text, text) to service_role;

create or replace function public.bot_set_prefs(p_user_id text, p_morning boolean, p_evening boolean,
                                                p_morning_hour integer, p_evening_hour integer, p_secret text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  insert into public.bot_users(user_id, morning_enabled, push_enabled, morning_hour, evening_hour, last_seen_at)
  values (p_user_id, coalesce(p_morning, true), coalesce(p_evening, true),
          least(12, greatest(5,  coalesce(p_morning_hour, 9))),
          least(23, greatest(17, coalesce(p_evening_hour, 20))), now())
  on conflict (user_id) do update set
    morning_enabled = coalesce(p_morning, public.bot_users.morning_enabled),
    push_enabled    = coalesce(p_evening, public.bot_users.push_enabled),
    morning_hour    = least(12, greatest(5,  coalesce(p_morning_hour, public.bot_users.morning_hour))),
    evening_hour    = least(23, greatest(17, coalesce(p_evening_hour, public.bot_users.evening_hour))),
    -- сменили час — сегодняшняя пометка «уже слали» больше не про этот час
    morning_day     = case when p_morning_hour is not null and p_morning_hour <> public.bot_users.morning_hour then null else public.bot_users.morning_day end,
    nudged_day      = case when p_evening_hour is not null and p_evening_hour <> public.bot_users.evening_hour then null else public.bot_users.nudged_day end,
    updated_at      = now();
  return public.bot_get_prefs(p_user_id, p_secret);
end $$;
revoke execute on function public.bot_set_prefs(text, boolean, boolean, integer, integer, text) from public, anon, authenticated;
grant  execute on function public.bot_set_prefs(text, boolean, boolean, integer, integer, text) to service_role;
