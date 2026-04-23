# suno-api-reset — Project Context

**Этот файл = SSOT (single source of truth)** для всего что знает автопилот об этом проекте. Пересечений с другими проектами пользователя (devdocs-ai, gift-song-pwa как отдельный код, и т.п.) в этом файле нет. Живёт ВНУТРИ репозитория, коммитится, переживает сессии.

---

## 1. Что это за проект

Next.js 14 API-обёртка над **Suno AI** (генерация музыки через неофициальное API). Работает как «бэкенд» для frontend-клиента `gift-song-pwa`. Клиенты `gift-song-pwa` платят → фронт зовёт наши endpoints → мы генерируем песню → возвращаем `audio_url`.

**Репо:** https://github.com/ManulRu/suno-api
**Локальный путь:** `C:\Users\asus\Desktop\suno-api-reset`
**Прод:** `https://suno-api-production-cfc9.up.railway.app` (Railway)
**Прод-health:** `/api/health` → `{status, uptime_sec, env, suno_auth}`

## 2. Архитектура воронки

```
Клиент (web browser)
  ↓ оплачивает песню
gift-song-pwa (Vercel, другой репо)
  ↓ webhook YooKassa / NowPayments
  ↓ enqueue QStash (3 retries)
  ↓ POST /api/custom_generate (3 параллельных песни на заказ)
suno-api-reset (Railway, ЭТОТ репо)
  ↓ keepAlive() — Clerk JWT (кеш 4 мин)
  ↓ [fast path] POST https://studio-api.prod.suno.com/api/generate/v2/
  ↓ [fallback path] Playwright + 2Captcha + hCaptcha
Suno studio-api
  ↓ возвращает clips with IDs
suno-api-reset → gift-song-pwa
  ↓ клиент получает audio_url
```

## 3. Монетизация

Платежи живут в **gift-song-pwa** (не в этом репо), упоминаю для контекста:

- **РФ:** 299₽ через **ЮKassa**
- **Остальные:** $10 через **NowPayments** (крипто, пользователь ранее называл это «Arbitrum-кошелёк» — имел в виду NowPayments, не блокчейн Arbitrum)

## 4. Auth — Clerk JWT

- `SUNO_COOKIE` или `SUNO_SESSION_ID` → session ID
- `keepAlive()` дёргает Clerk `/v1/client/sessions/{sid}/tokens` → получает JWT
- JWT кешируется на 4 минуты (Clerk токены живут ~5 мин)
- Все запросы к `studio-api.prod.suno.com` идут с `Authorization: Bearer <jwt>`

## 5. Captcha-flow (текущий статус)

**2026-04-23:** Suno требует captcha verification на `/api/generate/v2/`. Прямой POST без token возвращает `HTTP 422` с `"We couldn't verify your request"`.

**Наш код (начиная с commit 5634bba):**
1. **Fast path** (default, `SUNO_SKIP_CAPTCHA=true`): direct POST с `token: null`
2. Ловит 403/422/451 или body-match `captcha|challenge|hcaptcha|turnstile|verification|verify|refresh the page|security check|bot`
3. Если captcha нужна И `TWOCAPTCHA_KEY` настроен → fallback в Playwright → hCaptcha через 2Captcha
4. Если `TWOCAPTCHA_KEY` НЕ настроен → **fail fast** за 1 сек с понятной ошибкой «Captcha required by Suno but no solver configured»

**Оставшееся препятствие для live-работы воронки:** добавить `TWOCAPTCHA_KEY` в Railway Variables.

## 6. Env vars (живут в Railway Variables)

| Ключ | Описание | Критично |
|---|---|---|
| `SUNO_COOKIE` | Cookie Suno-сессии или raw JWT | **Да** |
| `SUNO_SESSION_ID` | Session ID bypass (предпочтительнее чем COOKIE) | Рекомендовано |
| `TWOCAPTCHA_KEY` | Ключ 2Captcha для hCaptcha solving | **Да** (с 2026-04) |
| `SUNO_SKIP_CAPTCHA` | `true` (default) / `false` — forcing browser flow | Нет |
| `BROWSER` | `chromium` или `firefox` | Нет |
| `BROWSER_HEADLESS` | `true` (default) | Нет |
| `BROWSER_DISABLE_GPU` | `true` в Docker | Нет |

## 7. Observability

- **`/api/health`** — cheap probe: `ok/degraded/down` по JWT age + env presence. HTTP 503 при down.
- **Structured pino logs** в stdout (Railway автоматически агрегирует):
  - `keepalive_start/ok/fail/cache_hit/cache_miss`
  - `captcha_check`, `captcha_start`, `captcha_token_received`
  - `create_page_loaded`, `selector_matched`, `selector_no_match`
  - `generate_request`, `generate_direct_attempt/success/failed`, `generate_captcha_fallback`
  - `captcha_required_no_solver`
  - `launchBrowser: adding N cookies (filtered M of K)`

## 8. CI/CD

- **Auto-deploy:** Railway привязан к GitHub `main`. Каждый push → билд (3-7 минут из-за Playwright в Dockerfile).
- **Backup workflow:** [.github/workflows/railway-deploy.yml](../.github/workflows/railway-deploy.yml) — GitHub Actions как backup если Railway webhook залагает. Нужен `RAILWAY_TOKEN` в GitHub Secrets.
- **Health monitoring:** [.github/workflows/health-monitor.yml](../.github/workflows/health-monitor.yml) — cron каждые 5 мин, создаёт Issue `prod-down` при фейле, опционально Telegram-alert. Нужны `TELEGRAM_BOT_TOKEN` + `ADMIN_TELEGRAM_CHAT_ID` в GitHub Secrets.

## 9. Тесты

- **Unit-тесты:** `__tests__/cookie-sanitize.test.mjs` — 22/22 assertions на логику фильтрации куков (standalone Node, no framework). Запуск: `node __tests__/cookie-sanitize.test.mjs`.
- **Smoke-тест:** через curl на живой prod `/api/health` + `/api/custom_generate`.

## 10. Диагностика в живую

Если Suno ломает UI/DOM/captcha — использовать `scripts/diagnose-selectors.mjs`. **Безопасный**: читает `SUNO_COOKIE` из `.env.local` (gitignored), никогда не логирует значение cookie, пишет только обезличенный DOM-дамп в `scripts/diagnose-output.json` (тоже gitignored). См. [scripts/README.md](../scripts/README.md).

## 11. Известные проблемы (открытые)

### В этом репо
- **`TWOCAPTCHA_KEY` не настроен** — captcha-fallback не работает, воронка разорвана до его добавления.
- **Playwright + Chromium в Docker** — weight ~2GB, медленный cold-start. Если fast path стабильно работает после добавления 2Captcha — Playwright можно будет удалить, вес упадёт до ~200MB.
- **HCaptcha через браузер** — даже с TWOCAPTCHA_KEY текущий browser-flow ждёт iframe который Suno больше не показывает. Возможно лучше использовать 2Captcha **invisible-hCaptcha API** напрямую (без Playwright) — передать site-key + URL → получить token → в payload.

### В gift-song-pwa (отдельный репо, но связано)
- `SUNO_API_URL` в Vercel env содержит литеральный `\n` — требует починки в Vercel dashboard
- Нет instant Telegram-alert при fail sunoGenerate
- Нет refund-flow
- Нет cleanup cron для orders со статусом GENERATING где все songs=READY
- Потенциально 10-50 «зависших» оплаченных заказов от старых bug-периодов

## 12. История сессий

См. [ADAPTATION_REPORT.md](../ADAPTATION_REPORT.md) — финальный отчёт каждой сессии с phase-статусами, багами, фиксами.

## 13. Next actions (приоритизированы)

1. Получить ключ 2Captcha на https://2captcha.com → добавить в Railway Variables → прогнать smoke
2. Если fast path с 2Captcha не взлетает — перейти на 2Captcha invisible-hCaptcha API (без Playwright)
3. После зелёного прод-smoke — удалить Playwright + chromium + 2captcha-solver → лёгкий Docker
4. Settings Railway токен + GitHub Secrets `RAILWAY_TOKEN` → авто-деплой из GitHub Actions
5. Settings `TELEGRAM_BOT_TOKEN` + `ADMIN_TELEGRAM_CHAT_ID` → monitor alerts
6. Ротация cookie Suno (юзер обещал после «пройдём всё»), удаление `.env.local`
7. gift-song-pwa: фикс `\n`, instant alert, stuck-orders cleanup, refund-flow
8. `/board-review` с итогами
