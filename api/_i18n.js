// Тексты бота на трёх языках. Используется и api/bot.js, и api/nudge.js.
// Язык пользователя хранится в bot_users.lang (выбирается на первом /start, команда /lang).
// Файл с префиксом «_» Vercel не считает роутом — только импортируемый модуль.

export const LANGS = ['ru', 'uz', 'en'];
export const normLang = (l) => (LANGS.indexOf(String(l || '')) >= 0 ? String(l) : 'ru');

// Подписи кнопок выбора языка — всегда на своём языке, независимо от текущего.
export const LANG_LABELS = { ru: 'Русский', uz: "O'zbekcha", en: 'English' };

const S = {
  ru: {
    open: '🔥 Открыть Хранителя',
    openStep: '🔥 Сделать шаг',
    openTasks: '🔥 Открыть задачи',
    muteEvening: '🔕 Не напоминать',
    muteMorning: '🔕 Не будить по утрам',

    story1:
      'Здравствуй, {name}.\n\n' +
      'Я — Хранитель. Маленький огонёк, который живёт твоими делами. ' +
      'Пока ты действуешь — я горю. Пока ты растёшь — расту и я.',
    story2:
      'Всё просто: выполняешь задачи и привычки → получаешь искры ✨ → я набираю силу и меняю форму.\n\n' +
      'Серии дней делают искры ярче. Главное — не дать огню погаснуть.',
    story3: 'Зажги первую искру — добавь свою первую привычку. Я жду внутри 👇',

    welcomeBack: 'С возвращением, {name}. Огонь ещё горит 🔥',
    stopped: 'Напоминания притушены — и утренние, и вечерние. /start вернёт их.',
    fallback: 'Я живу вон там 👇 Все дела, привычки и искры — внутри.',
    langSaved: 'Готово — говорим по-русски 🔥',
    langHint: 'Язык можно сменить командой /lang или в настройках приложения.',
    defaultName: 'путник',

    muteEveningToast: 'Вечером больше не напомню 🔕 /start вернёт напоминания.',
    muteMorningToast: 'Утром больше не побеспокою 🔕 /start вернёт напоминания.',

    evening:
      'Искра ослабла, но ещё не погасла.\n' +
      'До конца дня есть время на один маленький шаг — и я снова разгорюсь. 🔥',
    morning: [
      'Доброе утро ☀️\nНовый день — чистый лист. Загляни в задачи и реши, с чего начнёшь.',
      'С добрым утром 🔥\nЯ уже разжёг огонь. Посмотри, что сегодня важно, — и сделаем день ярким.',
      'Доброе утро.\nОдин взгляд на список с утра экономит весь день. Что сегодня главное?',
      'Утро доброе ☀️\nНе хватайся за всё разом. Открой задачи, выбери одну — с неё и начнём.',
      'Доброе утро!\nДень только начинается — самое время наметить пару дел. Загляни в список.',
      'С добрым утром.\nСпроси себя: что сегодня действительно важно? Ответ — в твоих задачах. 🔥',
      'Доброе утро ☀️\nВчера осталось позади. Сегодня ждут новые искры — глянь, что запланировано.',
      'Утро 🔥\nЯ рядом и готов расти вместе с тобой. Посмотри задачи на сегодня — и вперёд.',
      'Доброе утро.\nМинутка на список с утра — и день пойдёт по твоему плану, а не наоборот.',
      'С добрым утром ☀️\nПусть день будет твоим. Начни с малого: открой задачи и выбери первый шаг.',
    ],
  },

  uz: {
    open: "🔥 Qo'riqchini ochish",
    openStep: '🔥 Qadam tashlash',
    openTasks: '🔥 Vazifalarni ochish',
    muteEvening: '🔕 Eslatmang',
    muteMorning: "🔕 Ertalab uyg'otmang",

    story1:
      'Salom, {name}.\n\n' +
      "Men — Qo'riqchiman. Sening ishlaring bilan yashaydigan kichik olov. " +
      "Sen harakat qilsang — men yonaman. Sen o'ssang — men ham o'saman.",
    story2:
      "Hammasi oddiy: vazifa va odatlarni bajarasan → uchqun olasan ✨ → men kuchayaman va qiyofamni o'zgartiraman.\n\n" +
      "Kunlar seriyasi uchqunlarni yorqinroq qiladi. Eng muhimi — olovni o'chirmaslik.",
    story3: "Birinchi uchqunni yoq — birinchi odatingni qo'sh. Men ichkarida kutaman 👇",

    welcomeBack: 'Qaytganing bilan, {name}. Olov hali yonmoqda 🔥',
    stopped: "Eslatmalar o'chirildi — ertalabkisi ham, kechkisi ham. /start ularni qaytaradi.",
    fallback: 'Men ana u yerda yashayman 👇 Barcha ishlar, odatlar va uchqunlar — ichkarida.',
    langSaved: "Tayyor — o'zbekcha gaplashamiz 🔥",
    langHint: "Tilni /lang buyrug'i bilan yoki ilova sozlamalarida almashtirish mumkin.",
    defaultName: "yo'lovchi",

    muteEveningToast: 'Kechqurun endi eslatmayman 🔕 /start eslatmalarni qaytaradi.',
    muteMorningToast: "Ertalab endi bezovta qilmayman 🔕 /start eslatmalarni qaytaradi.",

    evening:
      "Uchqun so'nay dedi, lekin hali o'chgani yo'q.\n" +
      "Kun tugagunicha bitta kichik qadamga vaqt bor — va men yana alangalanaman. 🔥",
    morning: [
      'Xayrli tong ☀️\nYangi kun — toza sahifa. Vazifalarga nazar tashla va nimadan boshlashni hal qil.',
      "Xayrli tong 🔥\nOlovni allaqachon yoqdim. Bugun nima muhimligini ko'r — kunni yorqin o'tkazamiz.",
      "Xayrli tong.\nErtalab ro'yxatga bir qarash butun kunni tejaydi. Bugun eng muhimi nima?",
      "Tong xayrli ☀️\nHammasini birdaniga ushlama. Vazifalarni och, bittasini tanla — o'shandan boshlaymiz.",
      "Xayrli tong!\nKun endi boshlanmoqda — bir-ikki ishni belgilashga ayni vaqt. Ro'yxatga qara.",
      "Xayrli tong.\nO'zingdan so'ra: bugun nima chindan muhim? Javob — vazifalaringda. 🔥",
      "Xayrli tong ☀️\nKecha ortda qoldi. Bugun yangi uchqunlar kutmoqda — rejangni ko'r.",
      "Tong 🔥\nMen yoningdaman va sen bilan birga o'sishga tayyorman. Bugungi vazifalarni ko'r — va oldinga.",
      "Xayrli tong.\nErtalab ro'yxatga bir daqiqa — va kun sening rejang bo'yicha ketadi, aksincha emas.",
      "Xayrli tong ☀️\nKun seniki bo'lsin. Kichikdan boshla: vazifalarni och va birinchi qadamni tanla.",
    ],
  },

  en: {
    open: '🔥 Open the Guardian',
    openStep: '🔥 Take a step',
    openTasks: '🔥 Open tasks',
    muteEvening: '🔕 Stop reminding',
    muteMorning: "🔕 Don't wake me",

    story1:
      'Hello, {name}.\n\n' +
      'I am the Guardian — a small flame that lives on what you do. ' +
      'While you act, I burn. While you grow, I grow too.',
    story2:
      "It's simple: you complete tasks and habits → you earn sparks ✨ → I grow stronger and change form.\n\n" +
      'Streaks make the sparks brighter. The main thing is to keep the fire alive.',
    story3: "Light the first spark — add your first habit. I'm waiting inside 👇",

    welcomeBack: 'Welcome back, {name}. The fire is still burning 🔥',
    stopped: 'Reminders are dimmed — both morning and evening. /start brings them back.',
    fallback: 'I live right in there 👇 All your tasks, habits and sparks are inside.',
    langSaved: "Done — we'll speak English 🔥",
    langHint: 'You can change the language with /lang or in the app settings.',
    defaultName: 'traveller',

    muteEveningToast: "I won't remind you in the evening 🔕 /start brings reminders back.",
    muteMorningToast: "I won't wake you in the morning 🔕 /start brings reminders back.",

    evening:
      "The spark has dimmed, but it hasn't gone out.\n" +
      "There's still time today for one small step — and I'll blaze again. 🔥",
    morning: [
      'Good morning ☀️\nA new day, a blank page. Look at your tasks and decide where to start.',
      "Good morning 🔥\nI've already lit the fire. See what matters today — let's make it a bright one.",
      'Good morning.\nOne glance at your list in the morning saves the whole day. What matters most today?',
      "Morning ☀️\nDon't grab everything at once. Open your tasks, pick one — we'll start there.",
      'Good morning!\nThe day is just beginning — a good time to plan a couple of things. Check your list.',
      'Good morning.\nAsk yourself: what truly matters today? The answer is in your tasks. 🔥',
      "Good morning ☀️\nYesterday is behind you. New sparks are waiting — see what's planned.",
      "Morning 🔥\nI'm here, ready to grow with you. Look at today's tasks — and off we go.",
      'Good morning.\nA minute with your list now, and the day follows your plan, not the other way around.',
      'Good morning ☀️\nMay the day be yours. Start small: open your tasks and pick the first step.',
    ],
  },
};

// Приглашение выбрать язык показывается ДО того, как язык известен, — поэтому на трёх сразу.
export const LANG_PROMPT = 'Выбери язык · Tilni tanlang · Choose your language';

export function t(lang, key, vars) {
  const d = S[normLang(lang)] || S.ru;
  let v = d[key] !== undefined ? d[key] : S.ru[key];
  if (v === undefined) return key;
  if (vars) for (const k of Object.keys(vars)) v = v.split('{' + k + '}').join(vars[k]);
  return v;
}

// Случайная утренняя подпись на нужном языке — чтобы ритуал не приедался.
export function morningCaption(lang) {
  const a = (S[normLang(lang)] || S.ru).morning;
  return a[Math.floor(Math.random() * a.length)];
}

// Адрес Mini App с языком: приложение берёт ?lang= как значение по умолчанию,
// пока пользователь не выбрал язык вручную в настройках.
export function appUrl(lang) {
  const base = process.env.WEBAPP_URL;
  if (!base) return null;
  if (!lang) return base;
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'lang=' + encodeURIComponent(normLang(lang));
}
