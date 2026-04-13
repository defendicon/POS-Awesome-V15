# Phase 6 Platform Cleanup Execution Plan

This plan executes the platform cleanup phase from [STRUCTURE_MIGRATION_MAP.md](/C:/Users/am102/Downloads/POS-Awesome-V15/STRUCTURE_MIGRATION_MAP.md) without leaving features coupled to raw framework and runtime implementation details.

## Phase Goal

Isolate non-feature runtime concerns under platform ownership.

That means:

- printing moves under `platform/printing`
- offline runtime moves under `platform/offline`
- workers and scanner runtime move under `platform/workers` and `platform/scanner`
- app boot and framework glue stop leaking through feature paths

## Execution Strategy

Phase 6 should be executed in bounded slices.

### Slice 6A: Printing

Move:

- `frontend/src/posapp/services/qzTray.ts`
- `frontend/src/posapp/plugins/print.ts`

Target:

- `frontend/src/platform/printing/`

Finish line:

- features and legacy screens import printing runtime only from `platform/printing`
- tests reference the new platform path
- old `posapp` printing ownership paths are removed

### Slice 6B: Offline Runtime

Move the offline runtime entry and supporting modules under `platform/offline`.

### Slice 6C: Workers And Scanner Runtime

Move worker and scanner implementation under platform ownership.

### Slice 6D: App Boot / Frappe Integration

Move boot/runtime glue into `app/boot` and `platform/frappe`.

## No Partial State Conditions

Stop and keep working if any of these remain true:

- printing runtime exists under both `posapp` and `platform`
- features import mixed printing paths after the move
- tests still target old live paths after platform migration
