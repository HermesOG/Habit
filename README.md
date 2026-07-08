# Хранитель — Telegram Web App

Оффлайн‑сборка геймифицированного трекера задач / привычек / целей.
У пользователя есть персонаж «Хранитель огня», который растёт по уровням от начисляемого
XP («искры»). Экспортировано из Claude Design и переведено на локальные зависимости
(без CDN) — работает полностью офлайн и грузится быстрее.

## Запуск

Это статический сайт без сборки. Любой статический сервер:

```bash
python -m http.server 5599
# открыть http://localhost:5599/
```

Или просто открыть `index.html` в браузере.

## Структура

```
index.html                       точка входа (UI, состояние — класс Component)
support.js                       рантайм Design Component (загрузка React/Babel из vendor/)
xp-engine.js                     GuardianXP — математика XP/уровней/дневного капа
sfx-engine.js                    GuardianSfx — синтез звука на Web Audio
character-config.standalone.js   GuardianCharConfig — формы/якоря/эффекты персонажа
CharacterStage.dc.html           рендер персонажа (PNG формы + эффекты по якорям)
ios-frame.jsx                    бутафорский корпус iPhone для превью
uploads/                         PNG форм персонажа (form1..5 × amber/azure/spark, _c)
vendor/                          локальные зависимости (офлайн):
  react.production.min.js        React 18.3.1
  react-dom.production.min.js    ReactDOM 18.3.1
  babel.min.js                   @babel/standalone 7.29.0
  fonts.css + fonts/             Golos Text + Spectral (вкл. кириллицу)
  tabler-icons.min.css + fonts/  Tabler Icons 3.24.0
LOGIC.md                         полное описание логики приложения
reference/                       оригинал 1:1 из Claude Design (онлайн‑бандл) + исходные PNG
```

## Что изменено при переносе на офлайн

- `support.js`: ссылки на `unpkg.com` (React / ReactDOM / Babel) заменены на локальные
  `vendor/…`; SRI‑хэши отключены (файлы отдаются с того же origin).
- `index.html`: `<link>` на Google Fonts и Tabler CDN заменены на локальные `vendor/…`.
- Пути к движкам и `uploads/` выровнены под плоскую структуру (без `../`).

Поведение приложения — 1:1 с версией из Claude Design. Полный оригинальный бандл
сохранён в `reference/`.

## Заметки

- JSX компилируется в браузере через `@babel/standalone` (как в оригинале). Быстрее, чем
  раньше, за счёт отсутствия сетевых запросов к CDN, но всё ещё транспилируется на клиенте.
- Демо‑дата зашита как `2026-06-12`, данные демо встроены (см. `LOGIC.md`, разд. 8 и 9).
