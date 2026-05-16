# Codex Workflow

Codex must follow this workflow for every coding task.

## Step 1: Read First

Before editing, read:

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/FEATURE_CONTRACTS.md`
- `docs/TESTING_AND_VERIFICATION.md`

## Step 2: Analyze Impact

For every requested change, identify:

- Direct files affected
- Linked features affected
- Shared logic affected
- Backend/API impact
- POS Profile configuration impact
- POS Profile custom fields impact
- Offline/cache impact
- Printing/reporting impact
- Test/build impact

Do not start coding until the impact is understood.

## POS Profile Check

Before coding, Codex must check whether the requested change depends on POS Profile.

Questions to answer internally:

1. Does this feature use POS Profile company?
2. Does this feature use POS Profile warehouse?
3. Does this feature use POS Profile price list?
4. Does this feature use POS Profile customer?
5. Does this feature use POS Profile payment methods?
6. Does this feature use POS Profile taxes?
7. Does this feature use POS Profile print format?
8. Does offline cache depend on this POS Profile data?
9. Does the Sales Invoice payload require POS Profile defaults?
10. Are there custom fields on POS Profile that affect this feature?

If yes, Codex must align the code change with POS Profile behavior.

## Step 3: Implement

Prefer:

- Shared services
- Shared composables
- Central stores
- Small reusable helpers
- Clear naming
- Backward-compatible changes

Avoid:

- One-screen patches
- Duplicate calculations
- Hidden behavior changes
- Hardcoded temporary fixes
- Ignoring offline data paths
- Breaking ERPNext default behavior unnecessarily

## Step 4: Verify

Run available commands such as:

```bash
yarn lint
yarn build
yarn test
bench build
bench --site [site-name] migrate
```

Only run commands that are valid for the current repo setup.

If a command cannot be run, explain why.

## Step 5: Final Report

At the end, Codex must report:

- Summary
- Files changed
- Why each file changed
- Linked features checked
- Commands run
- Risks
- Follow-up suggestions
