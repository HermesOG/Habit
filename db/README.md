# База данных: миграции и тестовый стенд

Схема больше не живёт «только в Supabase»: всё, что есть в базе, описано в `db/migrations/`
и меняется только через новые файлы `NNNN_name.sql`. `0001_baseline.sql` — снимок прода на
2026-09-12 (таблицы `bot_users`, `bot_config`, `bot_media`, `dau`, функции `bot_*`, cron).

| Миграция | Что делает |
|---|---|
| 0001_baseline | схема прода как есть |
| 0002_security | функции `bot_*` только для `service_role`; у `anon`/`authenticated` нет прав на таблицы; `pg_net` → схема `extensions` |
| 0003_events_funnel | таблица `events` + `record_event`; `get_stats` с воронкой и источниками из `bot_users`; удаление пустой `user_acq` |
| 0004_reminders | сводка привычек (`summary`), свой час напоминаний, `blocked_at`, `bot_get_prefs`/`bot_set_prefs`, claim-функции с текстом по сводке |
| 0005_referrals | `referrer_id`, `pending_bonus`, `record_referral`, `bot_claim_bonus`/`bot_ack_bonus` |
| 0006_delete_and_retention | `/delete` → `bot_delete_user`; `purge_inactive()` + ежедневный cron |

Применять по порядку в Supabase → SQL Editor (или через MCP `apply_migration`). Все файлы идемпотентны.

## Прод

Прод пока на состоянии `0001`. Чтобы включить всё новое: применить `0002` … `0006` подряд, затем
задеплоить ветку с новым `api/` (старый код `hit.js`/`act.js` перестанет работать после `0004`,
потому что сигнатура `bot_mark_action` изменилась — делать одним заходом: миграции → деплой).

## Тестовый стенд в той же базе

Бесплатный тариф Supabase не даёт третий проект, поэтому стенд живёт в том же проекте:

- таблицы — в схеме **`staging`** (`staging.bot_users`, `staging.dau`, …);
- функции — в `public` с префиксом **`stg_`** (`public.stg_bot_register`, …), потому что PostgREST
  отдаёт по `/rest/v1/rpc/` только схему `public`, а добавлять схему в «Exposed schemas» — ручной
  шаг в дашборде, который легко забыть;
- сервер стенда вызывает их через `RPC_PREFIX=stg_` (см. `api/_supa.js`).

Staging-вариант миграции генерируется, а не пишется руками:

```bash
node tools/stage-sql.mjs db/migrations/0004_reminders.sql > /tmp/stg_0004.sql
```

Скрипт переименовывает `public.<таблица>` → `staging.<таблица>`, `public.<функция>(` →
`public.stg_<функция>(` и вырезает блоки `-- [prod-only] … -- [/prod-only]` (cron прода,
перенос расширений). Порядок применения тот же. Новая миграция — сначала на стенд (через
генератор), потом на прод (как есть).

Секрет стенда: `update staging.bot_config set val = '<NUDGE_SECRET стенда>' where key = 'nudge_secret';`

Cron стенда (после того, как известен адрес деплоя):

```sql
select cron.schedule('nudge-hourly-staging', '0 * * * *', $$
  select net.http_post(
    url := 'https://<STAGING_URL>/api/nudge',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json',
      'x-nudge-secret', (select val from staging.bot_config where key = 'nudge_secret')),
    timeout_milliseconds := 55000);
$$);
```

Посмотреть стенд: `select * from staging.bot_users;` · `select public.stg_get_stats(30);`
