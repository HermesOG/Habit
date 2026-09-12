-- 0002 · Безопасность.
-- Было: все функции bot_* исполнялись ролями anon/authenticated (защита — только общий секрет
-- в bot_config), а таблицы bot_users/bot_config/bot_media давали anon полные права (спасала лишь
-- RLS без политик). Советник безопасности Supabase выдавал 12 предупреждений.
-- Стало: исполнять функции может только service_role (ключ живёт на сервере, см. api/_supa.js),
-- у anon/authenticated нет прав ни на таблицы, ни на функции.

revoke all on table public.bot_users, public.bot_config, public.bot_media from anon, authenticated;

revoke execute on function public.bot_ok(text)                                  from public, anon, authenticated;
revoke execute on function public.bot_tz(text)                                  from public, anon, authenticated;
revoke execute on function public.bot_register(text, text, boolean, text)       from public, anon, authenticated;
revoke execute on function public.bot_set_push(text, boolean, text)             from public, anon, authenticated;
revoke execute on function public.bot_set_morning(text, boolean, text)          from public, anon, authenticated;
revoke execute on function public.bot_set_lang(text, text, text)                from public, anon, authenticated;
revoke execute on function public.bot_get_lang(text, text)                      from public, anon, authenticated;
revoke execute on function public.bot_mark_action(text, text, text)             from public, anon, authenticated;
revoke execute on function public.bot_claim_nudges(text)                        from public, anon, authenticated;
revoke execute on function public.bot_claim_morning(text)                       from public, anon, authenticated;
revoke execute on function public.bot_unmark(text, text, text)                  from public, anon, authenticated;
revoke execute on function public.media_all(text)                               from public, anon, authenticated;
revoke execute on function public.media_put(text, text, text)                   from public, anon, authenticated;
revoke execute on function public.record_source(text, text, text)               from public, anon, authenticated;

grant execute on function public.bot_ok(text)                                   to service_role;
grant execute on function public.bot_tz(text)                                   to service_role;
grant execute on function public.bot_register(text, text, boolean, text)        to service_role;
grant execute on function public.bot_set_push(text, boolean, text)              to service_role;
grant execute on function public.bot_set_morning(text, boolean, text)           to service_role;
grant execute on function public.bot_set_lang(text, text, text)                 to service_role;
grant execute on function public.bot_get_lang(text, text)                       to service_role;
grant execute on function public.bot_mark_action(text, text, text)              to service_role;
grant execute on function public.bot_claim_nudges(text)                         to service_role;
grant execute on function public.bot_claim_morning(text)                        to service_role;
grant execute on function public.bot_unmark(text, text, text)                   to service_role;
grant execute on function public.media_all(text)                                to service_role;
grant execute on function public.media_put(text, text, text)                    to service_role;
grant execute on function public.record_source(text, text, text)                to service_role;

-- Новые функции по умолчанию получают execute для public — отключаем это в схеме раз и навсегда.
alter default privileges in schema public revoke execute on functions from public;

-- [prod-only]
-- Расширение pg_net стояло в public (предупреждение советника). Вызовы net.http_post не меняются.
create schema if not exists extensions;
alter extension pg_net set schema extensions;
-- [/prod-only]
