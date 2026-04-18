# Loading Architecture

## Purpose

POS uses one shared loading orchestration layer in
[`src/posapp/composables/core/useLoading.ts`](../src/posapp/composables/core/useLoading.ts).
Do not create a second global loading store.

Bootstrap progress lives in
[`src/posapp/utils/loading.ts`](../src/posapp/utils/loading.ts). That file is an adapter for
startup progress messages and percentages. It should feed the shared loading scope model, not
replace it.

## Scope rules

- `bootstrap`: app is not usable yet. This is the only scope that should drive the full-screen overlay.
- `route`: navigation is in progress, but the app should stay mostly usable. Show visible progress, not a full-screen block.
- `background`: passive sync or refresh work. Never use it to lock usable UI.
- `action`: button, form, or request-level work where a local busy state is enough.
- `section`: local screen or panel loading. Keep these contextual to the component or section.

## Usage rules

- Prefer `startBootstrapLoading`, `startRouteLoading`, `startBackgroundLoading`, `startActionLoading`, or the matching `with...Loading` helpers over raw string ids.
- Prefer `with...Loading()` for async work so cleanup happens automatically on success and failure.
- If manual `start()` and `stop()` control is necessary, always pair them with `try/finally`.
- API loading is observability only by default. It should not become blocking UX unless the specific screen needs it.
- Local loaders in components such as item and customer panels are still valid when they describe section or action work more clearly than a global indicator.
- Do not route all loading into the full-screen overlay. Preserve contextual UX.

## Common examples

```ts
await withRouteLoading(() => router.push("/payments"), {
	message: "Loading payments...",
});
```

```ts
await withActionLoading(() => saveInvoice(), {
	message: "Saving invoice...",
});
```

```ts
startSectionLoading("customers:list", { message: "Refreshing customers..." });
try {
	await reloadCustomers();
} finally {
	stopSectionLoading("customers:list");
}
```

## Guardrails

- Dev builds emit a warning if a scope stays active for too long. Treat that as a missing cleanup signal.
- Route loading messages should come from route metadata when useful:
  `meta.loadingMessage = "Loading payments..."`.
- Keep wrapper usage as the default path in new code so wrong scope selection is harder.
