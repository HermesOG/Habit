-- Что применено в базе: для каждой функции, которую вызывает api/, есть ли она в проде
-- (public.<fn>) и на стенде (public.stg_<fn>), и кто вправе её исполнять.
-- Ожидание после переноса на прод: prod = true, anon_prod = false, service_prod = true у всех 9.
-- Пока прод на 0001: prod = false у всех девяти, stage = true (стенд применён).
-- Запускать в Supabase → SQL Editor (или через MCP execute_sql).
with need(fn) as (values
  ('bot_delete_user'), ('record_referral'), ('bot_claim_bonus'), ('bot_ack_bonus'),
  ('record_event'), ('bot_get_prefs'), ('bot_set_prefs'), ('bot_sync'), ('bot_set_blocked'))
select need.fn,
       p.oid  is not null                                                  as prod,
       s.oid  is not null                                                  as stage,
       coalesce(has_function_privilege('anon',         p.oid, 'execute'), false) as anon_prod,
       coalesce(has_function_privilege('service_role', p.oid, 'execute'), false) as service_prod,
       pg_get_function_identity_arguments(coalesce(p.oid, s.oid))          as args
from need
left join pg_proc p on p.proname = need.fn          and p.pronamespace = 'public'::regnamespace
left join pg_proc s on s.proname = 'stg_' || need.fn and s.pronamespace = 'public'::regnamespace
order by need.fn;
