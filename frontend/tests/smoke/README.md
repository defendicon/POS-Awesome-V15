# POS Smoke Tests

This suite is a production-safety smoke gate for global runtime errors.

## Run

```bash
yarn test:smoke
```

## Local Secrets

Copy `frontend/.env.example` to `frontend/.env.local` and fill in local values.

`frontend/.env.local` is ignored by git and is auto-loaded by `frontend/playwright.config.ts`.

## Environment Variables

- `POSA_SMOKE_BASE_URL`: Frappe site URL (default: `http://127.0.0.1:8000`)
- `POSA_SMOKE_PATH`: POS route (default: `/app/posapp`)
- `POSA_SMOKE_USER`: login username (optional)
- `POSA_SMOKE_PASSWORD`: login password (optional)

If credentials are set, the test logs in before opening POS.
If credentials are not set, test assumes an already authenticated session.
