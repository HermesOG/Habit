-- 0005 · Рефералы: /start ref_<id> или ?startapp=ref_<id>. Бонус (искры) обоим: новичку — при
-- первом заходе в приложение, пригласившему — при следующем заходе. Начисление — через
-- pending_bonus: /api/hit отдаёт число, приложение начисляет и подтверждает (bot_ack_bonus),
-- так бонус не теряется, если приложение закрыли до загрузки.

alter table public.bot_users
  add column if not exists referrer_id   text,
  add column if not exists pending_bonus integer not null default 0;

create or replace function public.record_referral(p_user_id text, p_referrer text, p_secret text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_bonus integer := 30; v_new boolean := false;
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  if p_user_id = p_referrer or p_referrer is null or p_referrer = '' then
    return json_build_object('is_new', false, 'bonus', 0);
  end if;
  if not exists (select 1 from public.bot_users where user_id = p_referrer) then
    return json_build_object('is_new', false, 'bonus', 0);
  end if;
  -- засчитываем один раз и только новичку: запись моложе суток и ни одного действия
  update public.bot_users
     set referrer_id = p_referrer, pending_bonus = pending_bonus + v_bonus, updated_at = now()
   where user_id = p_user_id and referrer_id is null
     and first_seen_at > now() - interval '1 day' and last_action_day is null;
  if found then
    v_new := true;
    update public.bot_users set pending_bonus = pending_bonus + v_bonus, updated_at = now() where user_id = p_referrer;
  end if;
  return json_build_object('is_new', v_new, 'bonus', v_bonus);
end $$;
revoke execute on function public.record_referral(text, text, text) from public, anon, authenticated;
grant  execute on function public.record_referral(text, text, text) to service_role;

create or replace function public.bot_claim_bonus(p_user_id text, p_secret text)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  return coalesce((select pending_bonus from public.bot_users where user_id = p_user_id), 0);
end $$;
revoke execute on function public.bot_claim_bonus(text, text) from public, anon, authenticated;
grant  execute on function public.bot_claim_bonus(text, text) to service_role;

create or replace function public.bot_ack_bonus(p_user_id text, p_n integer, p_secret text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.bot_ok(p_secret) then raise exception 'forbidden'; end if;
  update public.bot_users set pending_bonus = greatest(0, pending_bonus - greatest(0, coalesce(p_n, 0))), updated_at = now()
   where user_id = p_user_id;
end $$;
revoke execute on function public.bot_ack_bonus(text, integer, text) from public, anon, authenticated;
grant  execute on function public.bot_ack_bonus(text, integer, text) to service_role;
