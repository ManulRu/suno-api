# Monitoring — suno-api-reset

## What's monitored

`GET https://suno-api-production-cfc9.up.railway.app/api/health` every 5 minutes via GitHub Actions.

The endpoint returns `{status: "ok"|"degraded"|"down", uptime_sec, env, suno_auth}`. A failure means HTTP code != 200 OR `status != "ok"`.

## Alert channels

1. **GitHub Issues** — a new issue with label `prod-down` is created on first fail; subsequent fails append comments. Issues auto-close when health recovers.
2. **Telegram** — optional, first fail only. Requires `TELEGRAM_BOT_TOKEN` and `ADMIN_TELEGRAM_CHAT_ID` in GitHub Secrets.

## Add Secrets (one-time)

Go to https://github.com/ManulRu/suno-api/settings/secrets/actions and add:

- `TELEGRAM_BOT_TOKEN` — Telegram bot token (same as used in gift-song-pwa)
- `ADMIN_TELEGRAM_CHAT_ID` — your personal chat id with the bot

Without these, monitor still runs and creates GitHub Issues but no Telegram alert.

## Optional variable

Settings -> Secrets and variables -> Actions -> Variables:

- `RAILWAY_PUBLIC_URL` — override default prod URL if it changes

## View runs

https://github.com/ManulRu/suno-api/actions/workflows/health-monitor.yml

## Manual trigger

Actions tab -> Prod Health Monitor -> Run workflow.

## Runbook for prod-down

1. Open the open `prod-down` issue to see HTTP code, status, refresh age
2. Hit `/api/health` yourself to confirm: `curl https://suno-api-production-cfc9.up.railway.app/api/health`
3. Check Railway logs for recent errors: https://railway.app (project suno-api-production -> Deployments -> View logs)
4. If regression from last deploy -> rollback on Railway or push hotfix
5. Document incident in `SECURITY_INCIDENTS.md` if it involved leaked creds / expired cookie

## Recommended second watchdog

GitHub Actions cron isn't guaranteed every 5 minutes (can lag under high load). Add an external uptime monitor as backup (both have free tiers):

- https://uptimerobot.com — 5-min checks, 50 free monitors
- https://betterstack.com/better-uptime — 3-min checks, 10 free monitors

Configure it to hit `/api/health` and expect HTTP 200 + body contains `"status":"ok"`.
