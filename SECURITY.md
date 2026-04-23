# Security — Suno API Reset

Логика: 4 слоя (секреты / автоматический ревью / мониторинг / RLS).
См. общее правило: `~/.claude/projects/c--Users-asus/memory/feedback_security_baseline.md`

Этот сервис — backend на Railway, не имеет user-facing Supabase → слой 4 (RLS) не применим.

## Baseline-статус (2026-04-23)

| Слой | Что | Статус |
|---|---|---|
| 1 | `.gitignore` закрывает `.env*` | ✅ |
| 1 | Секреты в Railway env vars | ✅ предположительно (проверить в dashboard) |
| 1 | Локальный `.env.prod` | ✅ отсутствует |
| 2 | gitleaks pre-commit | ✅ `.git/hooks/pre-commit` |
| 2 | GitHub Push Protection | ⚠️ включить |
| 2 | Semgrep CI | ✅ `.github/workflows/security.yml` |
| 3 | Railway logs | ✅ встроено |
| 3 | Sentry | ❌ P2 |
| 4 | RLS | n/a (нет Supabase) |

## Чеклист активации

### 1. GitHub Push Protection
GitHub → `ManulRu/suno-api` → Settings → Code security and analysis:
- Secret scanning: Enable
- Push protection: Enable
- Dependabot alerts: Enable
- CodeQL: Enable

### 2. Перед деплоем на Railway
```
/security-review
```

### 3. Railway env vars аудит
Railway dashboard → Variables → убедиться что:
- `SUNO_COOKIE` / credentials хранятся только там
- Нет debug-переменных с токенами в logs (проверить что нет `console.log(process.env.*_TOKEN)`)

## Permanent правила
- `.env*` — **никогда** в git
- Sekrety только в Railway env vars
- Перед push в main: `/security-review`
