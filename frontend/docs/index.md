# POSAwesome Frontend — Documentation

POSAwesome is a Vue 3 Point-of-Sale application that runs inside an ERPNext/Frappe
installation. The frontend is a standalone Vite + TypeScript SPA that communicates with
the Frappe backend through `frappe.call()` and a thin `axios`-based API layer.

## Quick links

| Guide | Description |
|---|---|
| [Getting Started](./getting-started.md) | Local dev setup and build instructions |
| [Architecture](./architecture.md) | Module boundaries, data flow, offline design |
| [Modules](./modules.md) | Composables, stores, utilities — what lives where |
| [API Reference](./api/) | Auto-generated from TSDoc (run `yarn docs:generate`) |

## Regenerating the API reference

```bash
cd frontend
yarn docs:generate   # writes docs/api/
```

The `docs/api/` folder is gitignored. Run the command locally or let CI publish it.

## Documentation check in CI

```bash
yarn docs:check      # exits non-zero if TypeDoc finds errors in the entry points
```
