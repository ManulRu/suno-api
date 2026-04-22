# suno-api-reset — Правила проекта

Сервис сброса/обхода авторизации Suno API для Railway deployment.

---

## СОВЕТ ДИРЕКТОРОВ — ОБЯЗАТЕЛЬНЫЙ КОНТРОЛЬ

### Немедленные триггеры (игнорировать НЕЛЬЗЯ)

| Событие | Действие | Срок |
|---|---|---|
| Старт любой новой фичи | `/board-review [описание]` | До первого коммита |
| Прошло 30 дней без review | `/board-review [статус]` | Немедленно |
| Блокер / "не работает" | `/jensen-huang [блокер]` | В тот же день |
| Увеличение расходов | `/board-review [куда + сколько]` | До подтверждения |

### Правила вердиктов
- **NO-GO** → СТОП до устранения
- **FIX FIRST** → только фикс, никаких новых фич

**Доступные скилы:** `/jensen-huang` · `/oliver-hughes` · `/board-review`

---

## РЕЖИМ АВТОПИЛОТА — ОБЯЗАТЕЛЕН

Все задачи по этому проекту исполняются в автопилоте. Это ЖЁСТКИЕ правила:

### 1. Делегирование
- При любой задаче с >1 независимой частью — **параллельные агенты** (Agent tool, один message, несколько tool calls).
- Каждый агент получает: точное ТЗ, файлы которые трогать, критерии приёмки, "не делать".
- Никогда не делегировать понимание — в промпте писать файлы, строки, что именно.

### 2. Качество — жёсткие gate'ы
Перед любым `git push` / Railway deploy:
- ✅ `rtk npx tsc --noEmit` — 0 ошибок
- ✅ `rtk npm run build` — зелёный
- ✅ Smoke-тест локально: `/api/get_limit`, `/api/generate_lyrics`, и если затрагивался captcha-path — `/api/generate` с реальным запросом и `audio_url`
- ✅ Diff прочитан глазами (агент мог сделать не то что описано)

### 3. Тестирование перед запуском в работу
- **Никогда не пушить в main без локальной проверки** — Railway auto-deploy = продакшен = реальные платящие клиенты.
- Если изменение затрагивает `launchBrowser` / `getCaptcha` / Playwright — обязательный smoke POST `/api/generate` с `wait_audio: true`, реальный `audio_url` в ответе.
- Если изменение затрагивает `keepAlive` / `getAuthToken` — проверить `/api/get_limit` и hit Clerk-retry при искусственно невалидном JWT.

### 4. Трассировка действий
После каждой автопилот-сессии:
- Отчёт в `ADAPTATION_REPORT.md` (phase-статусы, баги, фиксы, verification).
- TODO-список в чате обновлён в реальном времени.
- Последний шаг — `/board-review` с текущим статусом.

### 5. Git-гигиена на автопилоте
- `git push` на main — **только с явного разрешения пользователя** в этой конкретной сессии. Даже на автопилоте production-deploy требует "да, пушь".
- Коммиты — атомарные, conventional commits (`fix:`, `feat:`, `chore:`).
- Секреты (`.env`, креды) — никогда в git. Проверка перед каждым `git add`.

### 6. Board Review в конце
Каждая автопилот-сессия заканчивается `/board-review [что сделано]`. Это не опция — это правило.

---

## Типовой флоу автопилота

1. Диагностика (read-only) → выявить все баги и gap'ы
2. План → список параллельных задач
3. Запуск агентов в параллель
4. Прогон gate'ов (tsc, build, smoke)
5. Отчёт + diff
6. Запрос разрешения на push (если нужен)
7. После push: 24ч наблюдение prod-логов
8. `/board-review`

---

## ЖИВАЯ И РАБОЧАЯ АДАПТАЦИЯ — ЖЕЛЕЗНОЕ ПРАВИЛО

**Только рабочий продукт. Без единого бага в проде.**

### Что значит «живая адаптация»
- Код не просто билдится и тест-суита зелёная — **живой prod-URL отвечает 2xx на все эндпоинты** которые зовёт клиент.
- End-to-end функция работает: `POST /api/generate` / `/api/custom_generate` реально возвращает `audio_url` на реального клиента. Не hypothetical, не «должно работать» — **реальный HTTP-ответ в консоли** + ссылка на сгенерированную песню.
- Все **оплаченные заказы** проходят от webhook оплаты до финального письма клиенту с песней. Никаких «зависших в GENERATING» в Supabase.

### Deploy не считается завершённым пока:
1. ✅ GitHub принял push (`git ls-remote origin main` = HEAD)
2. ✅ Railway **заделплоил новый коммит** (`/api/health` возвращает 200 + новую версию)
3. ✅ **Живой smoke**: `POST /api/custom_generate` возвращает `id`, `POST /api/get?ids=...` возвращает `audio_url != null`
4. ✅ 3 подряд проверки /api/health = `ok` (не degraded, не down) в течение 10 минут

Если любой из 4 пунктов падает → **rollback** или горячий hotfix до зелёного прода. Никаких «задеплоим и завтра посмотрим».

### Запреты «только рабочий продукт»
- ❌ Никаких TODO/FIXME в коде который идёт в прод
- ❌ Никаких заглушек, mock-ов, `throw new Error('not implemented')` на продовых путях
- ❌ Никаких «временных» фиксов с комментарием `// quick fix, refactor later`
- ❌ Никаких `console.log` вместо structured pino logs
- ❌ Никаких не-отлогиненных catch-блоков (silent failure = smoldering bug)

### Обязательные гарантии перед объявлением фичи готовой
- Unit-тесты для pure-функций (там где можно)
- End-to-end smoke против prod или staging
- `/api/health` = ok после деплоя
- Нет новых regressions в логах первые 60 минут после деплоя

### Безопасность + автопилот
Автопилот НЕ хранит и НЕ передаёт в GitHub/код:
- Реальные `SUNO_COOKIE`, `SUNO_SESSION_ID`, `RAILWAY_TOKEN`, `VERCEL_TOKEN`, `YOOKASSA_SECRET_KEY` и прочие прод-креды.
- Они приходят в чат одноразово, используются для диагностики/деплоя, и не записываются в файлы.
- Токены для CI/CD — только через GitHub Secrets / Vercel env (dashboard), никогда в git.

---

## УПРАВЛЕНИЕ ПРОД-КРЕДАМИ — ЖЕЛЕЗНО

Обязательная политика обращения с секретами. Нарушение = инцидент безопасности с обязательной ротацией.

### 1. Где живут секреты (single source of truth)

| Секрет | Место хранения | Репо |
|---|---|---|
| `SUNO_COOKIE` | **Railway Variables** (dashboard) | suno-api-reset |
| `SUNO_SESSION_ID` | **Railway Variables** (dashboard) | suno-api-reset |
| `TWOCAPTCHA_KEY` | **Railway Variables** (dashboard) | suno-api-reset |
| `RAILWAY_TOKEN` | **GitHub Secrets** (для CI workflow) | suno-api-reset |
| `YOOKASSA_*` | **Vercel Environment Variables** (dashboard) | gift-song-pwa |
| `NOWPAYMENTS_*` | **Vercel Environment Variables** (dashboard) | gift-song-pwa |
| `TELEGRAM_BOT_TOKEN` | **Vercel Environment Variables** (dashboard) | gift-song-pwa |
| `QSTASH_*` | **Vercel Environment Variables** (dashboard) | gift-song-pwa |
| `SUPABASE_SERVICE_ROLE_KEY` | **Vercel Environment Variables** (dashboard) | gift-song-pwa |
| `.env`, `.env.local`, `.env.prod` | **НИКОГДА в git**, всегда в `.gitignore` | любой |

### 2. Ротация

- **`SUNO_COOKIE`** — ротация при каждом подозрении на утечку (попал в чат, в скриншот, в лог), минимум **раз в 30 дней**.
- **`RAILWAY_TOKEN` / `VERCEL_TOKEN`** — ротация **раз в 90 дней**.
- **Любые creds после сессии с `.env.local`** — удалить файл командой `rm .env.local` сразу после завершения задачи.
- **Пароли Suno / Vercel / Railway** — ротация при **любом** инциденте утечки. Не ждать планового цикла.

### 3. Запрет на получение секретов через чат (ЖЁСТКО)

- Автопилот (Claude Code) **никогда** не просит: паролей, cookie-строк, токенов напрямую в чат.
- Если пользователь всё же прислал секрет в чат — автопилот обязан:
  1. (a) Ответить: **«⚠️ секрет попал в транскрипт, немедленно ротируй»**
  2. (b) **Не использовать** полученное значение
  3. (c) **Не записывать** в файл (ни в `.env`, ни в код, ни в отчёт)
  4. (d) **Не цитировать** значение обратно в чате
- Для диагностики использовать изолированный путь:
  - Пользователь сам кладёт секрет в `.env.local` локально
  - Запускает локальные скрипты, которые **не логируют значения**
  - Делится с автопилотом **только обезличенным output** (length, hash, present/absent флаг)

### 4. Логирование

- **Никогда** не логировать значение `SUNO_COOKIE`, JWT, токенов в `console.log` / `logger.info` / `logger.debug`.
- Логировать только **маркеры**:
  - длину строки (`cookie.length`)
  - первые 4 символа (`cookie.slice(0, 4)`)
  - флаг `present / absent`
- Pino-логи в проде **не должны** содержать raw `Authorization: Bearer ...` — только события типа `event: keepalive_ok`, `event: auth_refreshed`.

### 5. Чек-лист перед каждым деплоем

- [ ] `git diff --staged` не содержит значений env-переменных (cookie-строк, токенов, ключей)
- [ ] `.env*.local`, `.env.prod` присутствуют в `.gitignore`
- [ ] Новые секреты добавлены в Railway/Vercel dashboard, **не в код**
- [ ] Если есть diagnostic-скрипт — он **не пишет cookie** в output-файлы (проверить все `fs.writeFile`, `console.log`, redirect в `> file.txt`)

### 6. Инцидент-response (что делать, если секрет утёк)

1. **Немедленно ротировать** — сменить cookie / пароль / токен в панели провайдера
2. **Обновить значение** в Railway Variables / Vercel Environment Variables
3. **Проверить audit logs** провайдера на подозрительную активность (Suno account activity, Railway deploy log, Vercel deploy log)
4. **Записать инцидент** в `SECURITY_INCIDENTS.md` (создать файл, если нет) с полями:
   - Дата / время (UTC)
   - Что именно утекло (переменная, провайдер)
   - Канал утечки (чат, скриншот, git, лог)
   - Как ротировано (новое значение установлено где, когда)
   - Kill-switch: старое значение отозвано? да/нет

---

## МОНИТОРИНГ — ОБЯЗАТЕЛЕН

### Правила

1. Любой коммит влияющий на прод → **через 10 минут после деплоя проверить `/api/health`**. Если не `ok` → rollback последнего коммита или немедленный hotfix.
2. **Внешний мониторинг обязателен**: GitHub Actions cron `.github/workflows/health-monitor.yml` пингает `/api/health` каждые 5 минут.
3. Рекомендуется второй watchdog — UptimeRobot или Better Uptime (free tier) — на случай если GitHub Actions сами упадут.

### Реакция на prod-down issue

Если автоматический мониторинг создал GitHub Issue с меткой `prod-down`:

1. Открыть issue, прочитать HTTP code, status, `last_refresh_sec_ago`
2. Вручную проверить `curl <prod>/api/health` и отдельные endpoints (`/api/get_limit`)
3. Проанализировать structured logs Railway за последние 30 минут — искать `keepalive_fail`, `selector_no_match`, `captcha_*` события
4. Если regression от последнего коммита → **rollback на Railway** (dashboard -> Deployments -> предыдущий deploy -> Redeploy) ИЛИ push hotfix
5. Если корень — истёкший `SUNO_COOKIE` → обновить в Railway Variables
6. Когда health снова `ok` → мониторинг сам закроет issue с комментарием recovery
