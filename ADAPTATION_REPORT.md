# Adaptation Report — 2026-04-22

**Коммит:** `04b4d23` (main, чисто, только untracked CLAUDE.md)
**Окружение:** Node v24.14.1, npm 11.11.0, Windows 11
**Prod URL:** `https://suno-api-production-cfc9.up.railway.app` (Railway, уже развёрнут)
**Клиент:** `gift-song-pwa` на Vercel (ЮKassa + NowPayments + Supabase + Telegram)

---

## Phase 1 — Build ✅

| Шаг | Результат |
|---|---|
| `npm install` | 591 пакет, exit 0, 31 vuln (14 moderate, 14 high, 3 critical) — не блокер |
| `tsc --noEmit` | 0 ошибок |
| `npm run build` | `✓ Compiled successfully`, все 12 API-роутов собраны как `λ (Dynamic)` |
| Shared JS | 84.7 kB |

**Warnings (не блокеры):** нет `sharp`, устаревший `caniuse-lite`, deprecated `eslint@8.57.1`.

---

## Phase 2 — Prod Smoke ⚠️ частично

Тесты против **живого prod на Railway** (без .env локально).

| Endpoint | Метод | HTTP | Время | Статус |
|---|---|---|---|---|
| `/` (swagger UI) | GET | 200 | 0.93s | ✅ |
| `/api/get_limit` | GET | 200 | 1.42s | ✅ `credits_left: 1790/2500`, usage 710/mo |
| `/api/get?limit=3` | GET | 200 | 1.22s | ✅ возвращает реальные клипы |
| `/api/generate_lyrics` | POST | 200 | 7.63s | ✅ генерирует текст |
| `/api/generate` | POST | **500** | 1.89s | ❌ `Invalid cookie fields` |
| `/api/custom_generate` | POST | **500** | 0.92s | ❌ `Invalid cookie fields` |

**Вывод:**
- Clerk/JWT авторизация **работает**: серия fix-коммитов 20 апреля дала результат, GET и простые POST проходят.
- **Критический блокер** — `/api/generate` и `/api/custom_generate` падают **до** обращения к Suno: ломается Playwright browser automation, которая нужна для обхода капчи.

---

## 🔴 Критический баг #1 — `Invalid cookie fields` в launchBrowser()

**Файл:** [src/lib/SunoApi.ts:308-324](src/lib/SunoApi.ts#L308-L324)

**Error:** `Protocol error (Storage.setCookies): Invalid cookie fields`

**Путь вызова:**
`POST /api/generate` → `generate()` → `generateSongs()` → `getCaptcha()` → `captchaRequired()` (возвращает `true`) → `launchBrowser()` → `context.addCookies(cookies)` → **fail**.

**Проблемный блок:**
```typescript
cookies.push({
  name: '__session',
  value: this.currentToken+'',       // если currentToken undefined → строка "undefined"
  domain: '.suno.com', path: '/', sameSite: lax
});
for (const key in this.cookies) {
  cookies.push({
    name: key,
    value: this.cookies[key]+'',     // undefined cookies → строка "undefined"
    domain: '.suno.com', path: '/', sameSite: lax
  })
}
await context.addCookies(cookies);   // Playwright отклоняет весь массив если хоть один элемент невалиден
```

**Вероятные причины:**
1. Некоторые ключи в `this.cookies` имеют `undefined` значение (например, `ajs_anonymous_id` не приходит), и `undefined+''` = строка `"undefined"`, что может не пройти валидацию Playwright.
2. После sanitization `.replace(/[^\x20-\x7E]/g, '')` (commit 1aa2d7e) некоторые cookie values могли стать пустыми строками — Playwright не принимает пустые values.
3. `cookie.parse(rawJWT)` на raw JWT мог создать key с недопустимыми символами.

**Фикс (3 строки):** перед `context.addCookies(cookies)` отфильтровать невалидные:
```typescript
const valid = cookies.filter(c =>
  c.name && c.value && c.value !== 'undefined' && c.value.length > 0
);
await context.addCookies(valid);
```

**Влияние:** **генерация песни через основной эндпоинт не работает в проде**. `gift-song-pwa` использует `/api/generate` — значит пользователи, оплатившие через ЮKassa/NowPayments, **не получают результат**. Это потенциальная выдача возвратов.

---

## 🟡 Баг #2 — `\n` в SUNO_API_URL клиента

**Файл:** `C:/Users/asus/Desktop/Роботы/gift-song-pwa/.env.prod`

```
SUNO_API_URL="https://suno-api-production-cfc9.up.railway.app\n"
```

Литеральный `\n` в конце значения. Если читается как строка — в URL попадёт лишний символ. Некоторые HTTP-клиенты нормализуют это, некоторые — нет.

**Фикс:** убрать `\n` из значения, также проверить переменные в Vercel dashboard.

---

## 🟡 Баг #3 — Playwright HEADFULL на Railway

Railway — headless окружение, но `.env.example` не задаёт `BROWSER_HEADLESS=true` по умолчанию (хотя код делает `default: true` через `yn`). Dockerfile ставит `BROWSER_DISABLE_GPU=true` — правильно. Но `BROWSER_HEADLESS` не в Dockerfile. Нужно убедиться что в Railway env переменной или установлено `true`, или отсутствует (тогда default=true).

---

## Phase 3 — Docker sanity ⏭ отложено

Docker локально не установлен. Railway сам билдит из `Dockerfile`. Статическая проверка `Dockerfile` показала корректную установку `libnss3`, Playwright chromium и настройку `BROWSER_DISABLE_GPU=true`. Блокирующих проблем в Dockerfile нет.

**Рекомендация:** после фикса #1 задеплоить и проверить `/api/generate` на Railway.

---

## Observability gaps (от Jensen в board-review)

- [ ] `/api/health` — **отсутствует** (нет способа узнать живо ли серверу, валиден ли JWT, и жив ли Playwright)
- [ ] Structured pino-logs в `launchBrowser()`, `getCaptcha()`, `keepAlive()` — минимальные, без timestamp и request_id
- [ ] JWT TTL-кеш — отсутствует (`keepAlive` дёргает Clerk перед **каждым** API-методом, риск rate limit)
- [ ] Error telemetry — Playwright exception не попадает в структурированный лог с stack-trace

---

## Решения совета директоров — статус

| Пункт | Статус |
|---|---|
| **Jensen FIX FIRST**: observability до деплоя | ❌ не начато |
| **Hughes STOP** снят (цены определены: 299₽ / $10) | ✅ |
| Деплой на Railway | ✅ уже развёрнут (`suno-api-production-cfc9.up.railway.app`) |
| 24ч наблюдение prod-трафика | ❌ нет логов для анализа |

---

## Что делать в порядке приоритета

1. **СРОЧНО (сегодня):** фикс бага #1 в `launchBrowser()` — без этого вся воронка «оплата → песня» разорвана.
2. **Сегодня:** фикс `\n` в `SUNO_API_URL` в Vercel env (баг #2).
3. **На этой неделе:** добавить `/api/health` (5 строк), structured pino с `reqId`, JWT TTL-кеш (снижает нагрузку на Clerk в ~95%).
4. **Следующий board-review:** 2026-04-29, метрики: success-rate `/api/generate`, p95 latency, количество Clerk-вызовов.

---

## Критерий успеха сессии

✅ Build проходит
✅ Prod Railway отвечает на авторизованных endpoints
❌ **Основная фича (генерация песни) сломана в проде** — это и есть результат проверки адаптации.

Следующий шаг — решение пользователя: **фиксим баг #1 прямо сейчас или откладываем и сначала делаем observability?**
