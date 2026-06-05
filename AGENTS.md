# AGENTS.md

> **Single source of truth for AI coding agents working on this repository.**
>
> This file applies to **all** AI coding assistants (Claude Code, Codex, Cursor,
> Aider, Devin, Gemini CLI, OpenCode, GitHub Copilot, etc.). If a tool reads
> `CLAUDE.md`, `CODE.md`, or any other agent-specific file, point it here.
>
> This repository (`POS-Awesome-V15`) is a Point of Sale app for ERPNext / Frappe.
> Features are deeply linked — see the **Mandatory Working Method** below.

---

## About the Project

POSAwesome is a Frappe application — a full-stack Point of Sale (POS) system
built on the Frappe Framework. It is a Python backend with a Vue 3 / Vuetify
frontend, an Electron desktop wrapper, and an offline-first architecture
(IndexedDB + background sync + idempotent submission).

**Stack:**

- **Backend:** Python 3.10+, Frappe v15/v16, ERPNext v15/v16, MariaDB / MySQL, Redis
- **Frontend:** Vue 3, Vuetify 3, Vite, Pinia, TypeScript (migrating), Dexie (IndexedDB)
- **Desktop:** Electron 33 + electron-builder
- **CI/CD:** GitHub Actions, semantic-release, build verification, electron smoke tests

**Feature surface (non-exhaustive):** sales, returns, quotations, sales orders,
purchase orders (with optional receipt / invoice / supplier payment), multi-currency,
multi-language (RTL), offline mode, gift cards, M-Pesa, loyalty points, coupons,
offers, shift management, cash movement (Journal Entry), barcode printing, scale /
weighted barcodes, supervisor role-based access, payment reconciliation, customer /
supplier / employee payments.

**Enhanced Camera Scanner:** advanced OpenCV-based image processing for barcode
and QR code scanning with real-time image enhancement.

---

## Project Structure

```
posawesome/
├── frontend/                            # Vue.js frontend
│   └── src/posapp/
│       ├── components/                  # Vue components (modular split)
│       │   ├── pos/                     # Main POS UI: invoice, items, payments, closing…
│       │   ├── pos_pay/                 # Payment sidebar
│       │   ├── customer_display/        # Customer-facing display
│       │   ├── navbar/                  # Top nav + status gadgets
│       │   ├── payments/                # POS Awesome Payments route
│       │   ├── reports/                 # Reports + dashboards
│       │   ├── system/                  # System health widgets
│       │   └── ui/                      # Generic UI primitives
│       ├── composables/                 # Business logic + state orchestration
│       │   ├── core/                    # Cross-cutting composables
│       │   ├── pos/                     # POS-specific (invoice, items, payments, …)
│       │   └── runtime/                 # Bootstrap, sync, replay
│       ├── stores/                      # Pinia stores (normalized state)
│       ├── router/                      # Vue Router (client-side routes)
│       ├── services/                    # API clients + offline cache adapters
│       ├── workers/                     # Web workers (offline sync, indexing)
│       ├── modules/                     # Feature modules
│       ├── plugins/                     # Vuetify / Vue plugins
│       ├── types/                       # TypeScript type contracts
│       ├── utils/                       # Pure helpers
│       └── styles/                      # SCSS / theming
├── posawesome/                          # Python backend (Frappe app)
│   ├── hooks.py                         # App hooks
│   ├── patches/                         # Schema migrations
│   ├── public/                          # Static assets (built frontend → dist/)
│   ├── posawesome/
│   │   ├── api/                         # Whitelisted API endpoints (split by domain)
│   │   │   ├── invoice_processing/
│   │   │   ├── item_processing/
│   │   │   ├── payment_processing/
│   │   │   ├── offline_sync/
│   │   │   ├── cash_movement/
│   │   │   └── test_support/
│   │   ├── doctype/                     # ~30+ custom DocTypes
│   │   ├── overrides/                   # ERPNext DocType overrides
│   │   ├── page/                        # Frappe Page bootstraps
│   │   ├── workspace/                   # Workspace definitions
│   │   └── translations/                # i18n
│   ├── templates/                       # Jinja templates
│   ├── fixtures/                        # Initial data
│   └── config/                          # App config
├── electron/                            # Electron desktop shell
├── docs/                                # Architecture + workflow docs (see below)
│   ├── ARCHITECTURE.md
│   ├── FEATURE_CONTRACTS.md
│   ├── CODEX_WORKFLOW.md
│   └── TESTING_AND_VERIFICATION.md
├── scripts/                             # Build / verify / electron smoke
├── pyproject.toml                       # Python packaging + ruff + black
├── package.json                         # Frontend + electron deps + scripts
└── AGENTS.md                            # ← you are here
```

**Before making any code change, you must read and follow:**

1. `docs/ARCHITECTURE.md`
2. `docs/FEATURE_CONTRACTS.md`
3. `docs/CODEX_WORKFLOW.md`
4. `docs/TESTING_AND_VERIFICATION.md`

If any of these files are missing, **stop and report this to the user before coding.**

---

## Mandatory Working Method

Before editing any file, the assistant must:

1. Understand the requested bug or feature.
2. Identify all linked modules affected by the change.
3. Read the current implementation before modifying it.
4. Find the **single source of truth** for the logic.
5. Avoid local one-file patches when the logic is shared.
6. Align frontend, backend, cache, sync, print, and reports where relevant.
7. Preserve existing ERPNext / POS Awesome behavior unless the task explicitly
   asks to change it.
8. After coding, explain to the user:
   - Files changed
   - Why each file changed
   - Linked features affected
   - What was verified
   - Remaining risks
   - Suggested commit message

---

## Linked Feature Rule

When changing any POS feature, always check the impact on:

- Item search
- Cart item row
- Pricing rules
- Discount percentage
- Discount amount
- UOM conversion
- Customer price list
- POS Profile configuration
- POS Profile price list
- POS Profile warehouse
- POS Profile payment methods
- POS Profile tax settings
- POS Profile print settings
- Stock validation
- Cart totals
- Payment screen
- Sales Invoice payload
- Backend API methods
- Offline IndexedDB / cache
- Sync logic
- Print format
- QZ Tray receipt
- Reports / dashboards

**Never fix only the visible screen if the same logic is used elsewhere.**

---

## POS Profile Configuration Rule

POS Profile is the central configuration source for POS behavior. Many flows
depend on it — never hardcode what should come from POS Profile.

Always consider POS Profile impact on:

- Company
- Warehouse
- Customer
- Price List
- Currency
- Taxes and Charges
- Payment Methods
- Stock validation
- Item filters
- Customer filters
- Sales Invoice defaults
- Print format
- Offline cache loading
- Opening and closing shift flows
- Any custom POS Profile fields

**Do not change pricing, stock, payment, printing, offline cache, or invoice
payload logic without first checking whether POS Profile controls that behavior.**

---

## Single Source of Truth Rule

Business logic must not be duplicated across multiple components.

Prefer shared services, composables, utilities, or stores for:

- Price calculation
- Discount calculation
- UOM conversion
- Tax calculation
- Cart totals
- Customer price list resolution
- Stock validation
- Invoice payload preparation
- Offline sync transformation

If duplicated logic exists, refactor it carefully instead of adding another copy.

---

## Build & Run Commands

### Main Build Commands

```bash
# Build frontend assets for production
bench build --app posawesome

# Force rebuild (clears esbuild + Vite cache first)
bench build --app posawesome --force

# Build all apps in the bench
bench build

# Frontend-only dev server (HMR)
cd apps/posawesome
yarn dev
```

### Development Server

```bash
bench start                # default port 8000
bench start --port 8000
```

### Electron Desktop App

```bash
yarn install                # one-time
yarn electron:dev           # launch the desktop shell
yarn electron:build         # build installer for current OS
yarn electron:build:win     # Windows NSIS installer
yarn electron:build:linux   # Linux AppImage
```

> Windows `.exe` builds require Wine/Mono when running `electron-builder` on Linux.
> By default `yarn electron:build` targets the current platform and writes
> artifacts to `dist-electron/`.

### Build Verification

```bash
yarn verify:build           # assert built artifacts match source manifest
yarn electron:smoke         # smoke-test the packaged electron bundle
yarn release:verify         # verify:build + electron:smoke with --require-artifact
```

---

## Site & Database Management

```bash
# Create new site
bench new-site mysite.local

# Install app on site
bench --site mysite.local install-app posawesome

# Migrate database
bench --site mysite.local migrate
# (or just `bench migrate` for the default site)

# Reload a single DocType after editing its definition
bench --site mysite.local console
>>> frappe.reload_doc("posawesome", "doctype", "pos_invoice")

# Clear cache (after build / schema changes)
bench --site mysite.local clear-cache

# Backup site
bench --site mysite.local backup
```

---

## Frontend Development

- **Framework:** Vue 3 (Composition API), Vuetify 3, Vite 6, Pinia 3.
- **Component location:** `frontend/src/posapp/components/pos/…` is split into
  small, focused files (invoice, items, payments, closing, shift, …). Prefer
  adding a new focused component over bloating an existing one.
- **TypeScript migration in progress.** New modules should be `.ts` / `.vue`
  with `lang="ts"`. Keep shared types in `frontend/src/posapp/types/`.
- **Styling:** Vuetify components + Material Design. Custom SCSS goes in
  component `<style>` blocks. **RTL support is implemented** for Arabic /
  Hebrew — keep `dir="rtl"` working in any new layout.
- **State:** Pinia stores in `frontend/src/posapp/stores/`. Avoid mutating
  store state directly from components; use store actions.
- **Composables** in `frontend/src/posapp/composables/` hold reusable logic —
  prefer them over duplicating logic across components.
- **Asset building:** automatic on `bench build --app posawesome`. Watch mode
  via `yarn dev` (Vite HMR).
- **Multi-language:** English, Arabic, Portuguese, Spanish, and more — keep
  translatable strings wrapped in `_("…")` / `__("…")`.

---

## Backend Development (Frappe)

### Common DocType / Query Patterns

```python
import frappe
from frappe.utils import cint, flt, cstr, getdate, add_days, today, now_datetime

# Get document
doc = frappe.get_doc("POS Invoice", invoice_name)

# Create new document
new_doc = frappe.new_doc("POS Invoice")
new_doc.update(data)
new_doc.insert()

# Database queries
invoices = frappe.get_list(
    "POS Invoice",
    filters={"status": "Draft"},
    fields=["name", "total"],
)

# Single value lookup
frappe.db.get_value("DocType", "name", "field")

frappe.db.set_value("DocType", "name", "field", "value")
frappe.db.commit()
```

### API Endpoints

API methods are split by domain under `posawesome/posawesome/api/`:

- `invoice_processing/` — invoice submission, returns, draft handling
- `item_processing/` — item search, batch / serial, pricing, stock
- `payment_processing/` — payments, reconciliation, multi-currency
- `offline_sync/` — submission ledger, replay, idempotency
- `cash_movement/` — POS cash movement + Journal Entry
- `test_support/` — test fixtures and helpers

Whitelisted methods follow the Frappe convention:

```python
# in posawesome/posawesome/api/<domain>/<file>.py
import frappe

@frappe.whitelist()
def submit_pos_invoice(payload):
    ...
```

### Hooks

Located in `posawesome/hooks.py`:

```python
doc_events = {
    "POS Invoice": {
        "on_submit": "posawesome.api.invoice_processing.on_pos_invoice_submit",
    }
}
```

### User-facing Messages

```python
frappe.msgprint("Friendly message")
frappe.throw("Error message that aborts the request")
_("Text to translate")
```

---

## Testing & Verification

```bash
# Run all tests for the app
bench --site mysite.local run-tests --app posawesome

# Run a specific module
bench --site mysite.local run-tests --module posawesome.tests.test_pos

# Frontend test suite (Vite / Vitest)
cd apps/posawesome
yarn test
```

> Backend permissioned runtime tests require a **full Frappe / ERPNext bench
> environment**, so they may be skipped in sandboxed CI. Always run them
> locally before opening a PR.

After coding, also run:

```bash
yarn lint                   # ESLint (frontend + electron)
yarn format                 # Prettier — rewrites in place
black .                     # Python formatter
ruff check .                # Python linter
```

CI enforces `format.yml`, `ci-frontend.yml`, and `ci-backend.yml` — local
formatting must pass before merge.

---

## Debugging Tips

### Common Issues

1. **Build failures:** `bench clear-cache` then `bench build --app posawesome --force`.
2. **Stale UI totals after a major update:** clear site data in browser DevTools
   (Application → Storage → Clear site data) AND clear cache + image files from
   browsing history. Required after any major frontend refactor.
3. **Frontend runtime errors:** check browser console + network tab; the app
   attaches diagnostic logs you can include in issue reports.
4. **Python errors:** check `bench start` output and `error.log` /
   `frappe.log` under `sites/<site>/`.
5. **Database / schema errors:** `bench migrate`, then check DocType
   definitions and the matching `patches/` if migration scripts are involved.
6. **Offline mode behaving wrong:** inspect the IndexedDB stores (Dexie
   schema in `frontend/src/posapp/services/`) and the submission ledger
   in the `POS Invoice Submission Ledger` DocType.

### Development Tools

```bash
# Python console (with full app context)
bench --site mysite.local console

# Enable developer mode (auto-reload, debug toolbar)
bench --site mysite.local set-config developer_mode 1

# Show bench config
bench show-config

# List installed apps
bench list-apps --format json
```

---

## Git Workflow

### Working with a Fork

```bash
cd apps/posawesome

# Add your fork
git remote add origin https://github.com/<your-username>/posawesome

# Feature branch
git checkout -b feature/my-new-feature

# Stage + commit
git add .
git commit -m "Add new POS feature"

# Push
git push origin feature/my-new-feature
```

### Staying Updated

```bash
# Add upstream (the canonical repo)
git remote add upstream https://github.com/yrestom/POS-Awesome

# Pull latest
git pull upstream develop

# Rebase your branch
git rebase upstream/develop
```

### Commit Message Convention

This repo uses **Conventional Commits** (enforced by commitlint + semantic-release):

```
feat(scope): add new POS feature
fix(scope): handle edge case in payment flow
chore(deps): bump vue to 3.4
docs: update AGENTS.md
```

`semantic-release` analyzes commits to bump the version, generate the changelog,
and publish the release. Bug fixes alone do not bump the major version.

---

## Production Deployment

```bash
# Production build
bench build --app posawesome

# Setup production (nginx + supervisor)
bench setup production <user>

# Restart services
bench restart

# Update an existing app install
bench update --app posawesome
```

> After pulling a new version on an existing install, also run:
> `yarn install` → `bench build --app posawesome --force` → `bench --site <site> migrate`
> Then clear browser site data + cache.

---

## Code Quality Rules

- Keep changes minimal **only when minimal is correct.** Full refactoring is
  allowed when required for correctness and long-term maintainability.
- Do not add new dependencies unless necessary.
- Do not remove existing behavior without explaining why.
- Do not silently ignore errors.
- Add safe fallbacks for offline / cache data.
- Avoid breaking existing POS flows.

---

## Done Definition

A task is complete only when:

1. The requested issue is fixed.
2. Linked features are checked (see **Linked Feature Rule**).
3. Existing behavior is not broken.
4. `yarn lint` + `yarn format` + `black .` + `ruff check .` pass.
5. Build / lint / test commands are run where available.
6. Frontend unit tests pass; backend tests pass locally on a full bench.
7. Risks are documented in the PR description.

---

## Configuration Notes

- Uses the new **esbuild-based build system** (Frappe v14+).
- Frontend assets compile to `posawesome/public/dist/`.
- Development mode enables auto-reload and debug features; **never enable
  `developer_mode` in production.**
- Production builds are optimized + minified.
- Heavy refactor in progress (per upstream README). Prefer working on a
  stable release branch when shipping to production.

---

## Notes for the Assistant

- **Read before write.** Always read the current implementation and the
  relevant section of `docs/` before suggesting a change.
- **Trace POS Profile.** Many "bugs" are actually missing POS Profile
  configuration. Before adding a new flag, check if POS Profile already
  covers it.
- **Offline is first-class.** Any change to invoice payload, pricing, or
  stock must be reviewed against the offline IndexedDB cache and the
  submission replay path.
- **Multi-currency precision matters.** Use the project's exchange-gain /
  loss logic; don't reinvent it per call site.
- **When in doubt, ask the user** — but only if the ambiguity would lead
  to a fundamentally different outcome. Otherwise pick the safer default
  and call it out inline.
