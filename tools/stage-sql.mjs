// Превращает миграцию для прода (схема public) в вариант для тестового стенда, который живёт
// В ТОЙ ЖЕ базе Supabase (лимит бесплатных проектов): таблицы — в схеме `staging`, функции —
// в public с префиксом `stg_` (PostgREST отдаёт только схему public, поэтому функции нельзя
// спрятать в staging без ручной настройки «Exposed schemas» в дашборде).
// Сервер выбирает префикс через env RPC_PREFIX=stg_ (см. api/_supa.js).
//
//   node tools/stage-sql.mjs db/migrations/0004_reminders.sql > /tmp/stg_0004.sql
//
// Блоки между «-- [prod-only]» и «-- [/prod-only]» вырезаются (cron прода, перенос расширений).
import { readFileSync } from 'node:fs';

const FUNCS = [
  'bot_ok', 'bot_tz', 'bot_register', 'bot_set_push', 'bot_set_morning', 'bot_set_lang', 'bot_get_lang',
  'bot_mark_action', 'bot_claim_nudges', 'bot_claim_morning', 'bot_unmark', 'media_all', 'media_put',
  'record_source', 'record_visit', 'get_stats', 'record_event', 'bot_sync', 'bot_set_blocked',
  'bot_get_prefs', 'bot_set_prefs', 'record_referral', 'bot_claim_bonus', 'bot_ack_bonus',
  'bot_delete_user', 'purge_inactive',
];
const TABLES = ['dau', 'bot_users', 'bot_config', 'bot_media', 'user_acq', 'events'];

export function stage(sql) {
  let out = sql.replace(/-- \[prod-only\][\s\S]*?-- \[\/prod-only\]\n?/g, '');
  out = out.replace(new RegExp('\\bpublic\\.(' + FUNCS.join('|') + ')\\(', 'g'), 'public.stg_$1(');
  out = out.replace(new RegExp('\\bpublic\\.(' + TABLES.join('|') + ')\\b', 'g'), 'staging.$1');
  // %rowtype и default privileges — про схему staging
  out = out.replace(/alter default privileges in schema public/g, 'alter default privileges in schema staging');
  return 'create schema if not exists staging;\ngrant usage on schema staging to service_role;\n\n' + out;
}

if (process.argv[1] && process.argv[1].endsWith('stage-sql.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/stage-sql.mjs <migration.sql>'); process.exit(1); }
  process.stdout.write(stage(readFileSync(file, 'utf8')));
}
