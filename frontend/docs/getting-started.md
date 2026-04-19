# Getting Started — Frontend Development

## Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 20.x |
| Yarn | 1.22 |
| TypeScript | 5.x (installed as devDep) |

A running ERPNext v15 bench is required for any API calls. The frontend can be built and
type-checked without it.

## Install dependencies

```bash
cd frontend
yarn install
```

## Type check

```bash
yarn type-check        # vue-tsc --noEmit, no output emitted
```

## Run unit tests

```bash
yarn test              # vitest, watch mode
yarn test run          # vitest, single pass
```

The offline-layer tests (`tests/*.spec.ts`) use `fake-indexeddb` so no real browser is
required.

## Smoke tests (Playwright)

```bash
yarn test:smoke        # requires a running ERPNext site
```

## Build for production

```bash
# From the frappe-bench root:
bench build --app posawesome

# Or directly from frontend/ (outputs to posawesome/public/dist/):
yarn build
```

## Lint and format

```bash
yarn format            # prettier --write
```

## Generate API docs

```bash
yarn docs:generate     # writes frontend/docs/api/ (gitignored)
yarn docs:check        # validate entry points without writing files
```

## Environment notes

- The app expects `window.frappe` to be set up by the Frappe boot process. In tests,
  Frappe globals are either stubbed or not needed (offline-layer tests run purely in Node).
- `src/env.d.ts` declares the Frappe ambient types; see `src/posapp/types/frappe.d.ts`
  for a more complete declaration.
- `src/libs/` contains vendored JS blobs (Dexie min, OpenCV WASM loader, Workbox) — do
  not edit them.
