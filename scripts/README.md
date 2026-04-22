# scripts/diagnose-selectors.mjs

Диагностический скрипт который запускает Playwright в залогиненном Suno аккаунте
и извлекает **текущие CSS-селекторы** страницы `suno.com/create` — чтобы мы могли
обновить устаревший `.custom-textarea` в `src/lib/SunoApi.ts`.

## Безопасность

- Скрипт читает `SUNO_COOKIE` из **`.env.local`** на твоей машине
- `.env.local` попадает в `.gitignore` — в git не уйдёт
- Скрипт **никогда** не печатает значение cookie в stdout и не пишет его в JSON
- Результат — только **публичные атрибуты** DOM (классы, placeholders, aria-labels)
- Скриншот `diagnose.png` может показать UI с именем аккаунта — проверь перед тем как делиться

## Шаг 1 — Положи cookie в `.env.local`

В Chrome на suno.com:
- **F12** → вкладка **Application** → слева **Cookies** → `https://suno.com`
- Найди куку **`__client`** — её значение (длинный JWT `eyJ...`) — то что нужно

Создай файл `.env.local` в корне проекта `C:\Users\asus\Desktop\suno-api-reset\.env.local` с содержимым:

```
SUNO_COOKIE=eyJhbGci...<сюда вставь значение __client>
```

**Или** если проще — скопируй весь cookie-заголовок из DevTools → Network → любой запрос к suno.com → Request Headers → `Cookie:` и вставь после `SUNO_COOKIE=`.

## Шаг 2 — Запусти скрипт

```bash
cd C:\Users\asus\Desktop\suno-api-reset
node scripts/diagnose-selectors.mjs
```

Ожидаемый вывод (не цитирует cookie):
```
[diagnose] Parsed N cookie(s) (values not printed)
[diagnose] Launching Chromium...
[diagnose] Navigating to https://suno.com/create ...
[diagnose] Waiting 5s for React to render...
[diagnose] Collecting DOM candidates...
[diagnose] Collected: 2 textarea(s), 0 contenteditable(s), 3 create/generate button(s), 2 mode tab(s)
[diagnose] Saving screenshot to scripts/diagnose.png ...
[diagnose] Saving JSON to scripts/diagnose-output.json ...
[diagnose] Done.
```

## Шаг 3 — Проверь результат

- `scripts/diagnose-output.json` — содержит только DOM-атрибуты. Безопасно шарить.
- `scripts/diagnose.png` — скриншот страницы. **Перед тем как поделиться**, посмотри не видно ли там персональных данных (имя аккаунта, email).

## Шаг 4 — Кинь мне содержимое `diagnose-output.json`

Я найду правильный новый селектор для поля лирики (это `textarea` в режиме "Custom"),
обновлю `src/lib/SunoApi.ts` с мульти-селектор fallback-ом и запушу фикс.

## Если что-то пошло не так

- **`SUNO_COOKIE is not set`** — проверь что файл называется именно `.env.local` (не `.env` и не `.env.local.txt`), и что `SUNO_COOKIE=...` там есть
- **`navigation failed`** — вероятно cookie просрочен, возьми свежий из браузера
- **Скриншот показывает страницу логина** — Suno не принял cookie, нужен свежий
- **Playwright ругается** — запусти `npx playwright install chromium` если chromium не скачан

## После всего — ротация пароля

После того как фикс задеплоен и `/api/custom_generate` работает:
1. Смени пароль Suno (ты сам упомянул что сделаешь это в конце)
2. Получи новый cookie, обнови его в Railway env var `SUNO_COOKIE`
3. Удали `.env.local` локально: `rm .env.local`
