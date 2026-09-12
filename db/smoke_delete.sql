-- Сквозная проверка /delete на одноразовом пользователе (id не числовой — с реальными Telegram id
-- не пересечётся). Создаёт строки во всех таблицах с данными о человеке, зовёт bot_delete_user
-- с настоящим секретом из bot_config и проверяет, что не осталось ничего; заодно — что чужой
-- секрет отвергается. Любая ошибка = exception, мусор убирается в exception-блоке.
do $$
declare
  v_uid    text := 'smoke-delete-' || substr(md5(random()::text), 1, 8);
  v_friend text := 'smoke-friend-' || substr(md5(random()::text), 1, 8);
  v_secret text := (select val from public.bot_config where key = 'nudge_secret');
  v_left   integer;
  v_forbidden boolean := false;
begin
  insert into public.bot_users (user_id, tz, lang, summary, referrer_id, pending_bonus)
  values (v_uid, 'Asia/Tashkent', 'ru', '{"v":1,"h":[{"n":"Вода","s":3}]}'::jsonb, null, 30);
  insert into public.bot_users (user_id, referrer_id) values (v_friend, v_uid); -- друг ссылается на удаляемого
  insert into public.dau (day, user_id, platform) values (current_date, v_uid, 'smoke');
  insert into public.events (user_id, name, day, meta) values (v_uid, 'open', current_date, '{"platform":"smoke"}'::jsonb);

  -- чужой секрет → forbidden
  begin
    perform public.bot_delete_user(v_uid, 'wrong-secret');
  exception when others then
    v_forbidden := (sqlerrm = 'forbidden');
  end;
  if not v_forbidden then raise exception 'bot_delete_user не отверг чужой секрет'; end if;
  if not exists (select 1 from public.bot_users where user_id = v_uid) then
    raise exception 'строка исчезла при вызове с неверным секретом';
  end if;

  -- настоящий секрет → всё стёрто
  perform public.bot_delete_user(v_uid, v_secret);
  select (select count(*) from public.bot_users where user_id = v_uid)
       + (select count(*) from public.dau       where user_id = v_uid)
       + (select count(*) from public.events    where user_id = v_uid)
       + (select count(*) from public.bot_users where referrer_id = v_uid)
    into v_left;
  if v_left <> 0 then raise exception 'после bot_delete_user осталось строк: %', v_left; end if;
  if (select referrer_id from public.bot_users where user_id = v_friend) is not null then
    raise exception 'ссылка referrer_id у друга не обнулена';
  end if;

  delete from public.bot_users where user_id = v_friend;
  raise notice 'smoke /delete: ok (%)', v_uid;
exception when others then
  delete from public.events    where user_id in (v_uid, v_friend);
  delete from public.dau       where user_id in (v_uid, v_friend);
  delete from public.bot_users where user_id in (v_uid, v_friend);
  raise;
end $$;
select 'smoke /delete: ok' as result;
