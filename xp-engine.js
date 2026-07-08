/* ============================================================
   Хранитель — XP-движок (искры).
   Чистые функции: сложность → XP, стрик-множитель, дневной жар
   (мягкий кап), кривая уровней. Никакого состояния внутри.
   ============================================================ */
(function () {
  var TASK_XP  = [5, 10, 20, 35, 55];  /* задачи, сложность 1–5 */
  var HABIT_XP = [4, 8, 15, 25, 40];   /* привычки (база), сложность 1–5 */
  var DAILY_CAP = 150;                 /* «дневной жар»: полный XP до этого порога */
  var OVERFLOW_RATE = 0.3;             /* сверх капа — ×0.3 */

  function clampDiff(d) { d = +d || 2; return Math.max(1, Math.min(5, Math.round(d))); }

  function taskXp(diff) { return TASK_XP[clampDiff(diff) - 1]; }
  function habitBase(diff) { return HABIT_XP[clampDiff(diff) - 1]; }

  /* Стрик-множитель: <7 → ×1.0; ≥7 → ×1.25; ≥30 → ×1.5; ≥100 → ×2.0 */
  function streakMult(streak) {
    streak = +streak || 0;
    if (streak >= 100) return 2.0;
    if (streak >= 30) return 1.5;
    if (streak >= 7) return 1.25;
    return 1.0;
  }
  function habitXp(diff, streak) { return Math.round(habitBase(diff) * streakMult(streak)); }

  /* Мягкий кап: первые 150 XP за календарный день — полностью, дальше ×0.3.
     rawBefore — «сырой» XP, уже засчитанный сегодня. Возвращает целое granted. */
  function applyCap(rawBefore, amount) {
    rawBefore = Math.max(0, +rawBefore || 0);
    amount = Math.max(0, +amount || 0);
    var full = Math.max(0, Math.min(amount, DAILY_CAP - rawBefore));
    var over = amount - full;
    return {
      granted: Math.round(full + over * OVERFLOW_RATE),
      rawAfter: rawBefore + amount,
      capJustHit: rawBefore < DAILY_CAP && (rawBefore + amount) >= DAILY_CAP
    };
  }

  /* Кривая уровней: стоимость перехода n → n+1 */
  function need(n) { return Math.round(10 * Math.pow(n, 1.2) / 5) * 5; }

  /* Из суммарного XP — уровень и прогресс внутри уровня */
  function levelFromXp(total) {
    total = Math.max(0, Math.round(+total || 0));
    var lvl = 1, rem = total;
    while (rem >= need(lvl) && lvl < 200) { rem -= need(lvl); lvl++; }
    return { level: lvl, into: rem, need: need(lvl), progress: rem / need(lvl) };
  }

  window.GuardianXP = {
    TASK_XP: TASK_XP, HABIT_XP: HABIT_XP, DAILY_CAP: DAILY_CAP,
    taskXp: taskXp, habitBase: habitBase, streakMult: streakMult, habitXp: habitXp,
    applyCap: applyCap, need: need, levelFromXp: levelFromXp
  };
})();
