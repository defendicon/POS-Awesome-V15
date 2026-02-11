# POS Cash Movement Rollout Guide

Last Updated: 2026-02-11
Scope: POS Expense + Cash Deposit + Journal Entry posting + Offline queue + Closing impact

## Pre-Deployment Checklist

- [ ] Confirm app code deployed on target branch.
- [ ] Confirm database backup exists for target site.
- [ ] Confirm `bench --site <site> migrate` will be run during rollout.
- [ ] Confirm accounting team approved:
  - POS cash source account mapping
  - expense account policy
  - back-office cash account policy
- [ ] Confirm support team has tested cancel/delete policy with business.

## Deployment Steps

1. Pull latest app code.
2. Build frontend assets.
3. Run site migration.
4. Clear browser site cache for POS terminals (first run after deployment).

Example commands:

```bash
bench --site <site> migrate
bench build --app posawesome
bench restart
```

## Post-Deployment Configuration

Configure each target `POS Profile`:

- [ ] Enable `Enable Cash Movement`
- [ ] Enable one or both:
  - `Allow POS Expense`
  - `Allow Cash Deposit`
- [ ] Set `Default POS Expense Account`
- [ ] Set `Back Office Cash Account`
- [ ] Set `Cash Movement Max Amount` (if policy requires)
- [ ] Set `Require Cash Movement Remarks` (recommended)
- [ ] Set cancel/delete controls:
  - `Allow Cancel Submitted Cash Movement`
  - `Allow Delete Cancelled Cash Movement`

## Smoke Validation (Production-Safe)

- [ ] Open POS with a profile that has cash movement enabled.
- [ ] Create one `Expense` entry and verify:
  - `POS Cash Movement` submitted
  - linked `Journal Entry` submitted
  - JE lines: Dr Expense / Cr POS Cash
- [ ] Create one `Deposit` entry and verify:
  - `POS Cash Movement` submitted
  - linked `Journal Entry` submitted
  - JE lines: Dr Back Office Cash / Cr POS Cash
- [ ] Verify history list shows submitted entries and JE links.
- [ ] Verify cancel flow:
  - cancel movement
  - linked JE cancels
- [ ] Verify delete flow for cancelled movement (if enabled).
- [ ] Verify closing shift overview includes cash movement effect.

## Offline Validation

- [ ] Put browser offline (or disable server connectivity).
- [ ] Submit cash movement and verify queue count increases.
- [ ] Restore connectivity and run sync.
- [ ] Verify queued entry syncs once (idempotent behavior).

## Monitoring After Go-Live

- Track first 1-2 business days:
  - failed JE postings
  - permission errors on cancel/delete
  - queue not syncing issues
  - mismatch complaints in closing expected cash

## Rollback Notes

Use staged rollback, not destructive rollback:

1. Disable feature at profile level:
   - Turn off `Enable Cash Movement` on impacted profiles.
2. Keep historical `POS Cash Movement` + `Journal Entry` records for audit.
3. If code rollback is required:
   - deploy previous app revision
   - run migrate
   - rebuild assets
4. Do not mass-delete records to rollback behavior.

## Operational Guardrails

- Keep cancel/delete permissions restricted.
- Enforce remarks for audit quality.
- Keep max amount aligned to SOP limits.
- Use dedicated accounting review for first week.
