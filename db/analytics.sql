-- Аналитика посещаемости Mini App (DAU — daily active users).
-- Одна строка на пользователя в день. Пишется ТОЛЬКО сервером сервисным ключом
-- (service_role): клиент никогда не обращается к базе напрямую.
--
-- Запусти этот файл целиком в Supabase → SQL Editor (можно повторно — идемпотентно).

create table if not exists public.dau (
  day        date        not null,
  user_id    text        not null,
  platform   text,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  visits     integer     not null default 1,
  primary key (day, user_id)
);

-- RLS включён, политик нет => anon/authenticated не видят ничего.
-- service_role обходит RLS, поэтому серверу доступ есть.
alter table public.dau enable row level security;
revoke all on table public.dau from anon, authenticated;

-- Зафиксировать заход. День вычисляет сервер и передаёт как p_day
-- (чтобы «сутки» считались в нужном часовом поясе, а не в UTC базы).
create or replace function public.record_visit(p_user_id text, p_day date, p_platform text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.dau (day, user_id, platform)
  values (p_day, p_user_id, p_platform)
  on conflict (day, user_id) do update
    set last_seen = now(),
        visits    = dau.visits + 1,
        platform  = coalesce(excluded.platform, dau.platform);
$$;

-- Сводка: всего уникальных за всё время + разбивка по дням (свежие сверху).
create or replace function public.get_stats(p_days integer default 30)
returns json
language sql
security definer
set search_path = ''
as $$
  select json_build_object(
    'total_users', (select count(distinct user_id) from public.dau),
    'daily', (
      select coalesce(json_agg(row_to_json(t) order by t.day desc), '[]'::json)
      from (
        select day, count(*)::int as users, sum(visits)::int as visits
        from public.dau
        group by day
        order by day desc
        limit p_days
      ) t
    )
  );
$$;

-- Функции вызывает только сервер сервисным ключом — закрываем от публичного доступа.
revoke all on function public.record_visit(text, date, text) from public, anon, authenticated;
revoke all on function public.get_stats(integer)            from public, anon, authenticated;
grant execute on function public.record_visit(text, date, text) to service_role;
grant execute on function public.get_stats(integer)            to service_role;
