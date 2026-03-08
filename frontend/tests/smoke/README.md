# POS Smoke Tests

This suite is a production-safety smoke gate for global runtime errors.

## Run

```bash
yarn test:smoke
```

## Environment Variables

- `POSA_SMOKE_BASE_URL`: Frappe site URL (default: `http://127.0.0.1:8000`)
- `POSA_SMOKE_PATH`: POS route (default: `/app/posapp`)
- `POSA_SMOKE_USER`: login username (optional)
- `POSA_SMOKE_PASSWORD`: login password (optional)
- `POSA_ENABLE_VISUAL_REGRESSION`: set to `1` to run screenshot baseline test

If credentials are set, the test logs in before opening POS.
If credentials are not set, test assumes an already authenticated session.

## Visual Baseline

Visual smoke test is opt-in and skipped by default:

```bash
POSA_ENABLE_VISUAL_REGRESSION=1 yarn test:smoke
```
