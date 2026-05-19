# Reports.vue Safe Split Plan

## Goal

Split `frontend/src/posapp/components/reports/Reports.vue` into smaller, testable frontend modules without changing dashboard behavior, API payloads, POS Profile scoping, permissions, visual layout, responsive behavior, or data formatting.

This is a planning document only. Do not refactor `Reports.vue` in the documentation PR.

## Current Shape

`Reports.vue` is a large Vue SFC that combines:

- Dashboard shell, toolbar, filters, tabs, alerts, and responsive layout.
- KPI cards and repeated summary metric blocks.
- Sales summaries, payment reports, discount/void/return reports, sales trend panels.
- Staff, customer, finance, branch, product, inventory, procurement sections.
- Formatting helpers and chip/progress color helpers.
- Derived computed state for every report section.
- API loading, request parameter assembly, response merging, logging, watcher-driven refreshes, and debounce cleanup.

The component already depends on `@/posapp/services/dashboardService` for backend API access and shared response types. That service should remain the API/data source boundary during the split.

## Logical Sections

### Filters/Header

Template responsibilities:

- Title, subtitle, scope/profile/month filters, last-updated chip, refresh button.
- Disabled and error alerts.
- Desktop `v-tabs` and mobile tab buttons.

State and logic:

- `dashboardScope`
- `selectedProfileFilter`
- `selectedReportMonth`
- `currentMonthToken`
- `lastUpdatedLabel`
- `dashboardScopeItems`
- `profileFilterItems`
- `scopeDisplayLabel`
- `selectedProfilesCount`
- `profitMethodLabel`
- `profitMethodColor`
- `canRenderDashboard`
- `disabledReasonText`

### KPI Cards

Template responsibilities:

- Sales tab top metric cards.

State and logic:

- `salesMetrics`
- `formatMoney`
- Metric style classes such as `metric-card--sales` and `metric-card--profit`.

### Sales Summary

Template responsibilities:

- Monthly Sales Summary.
- Daily Sales Summary.
- Sales Trend Report.
- Discount / Void / Return Report.

State and logic:

- `dailySummary`
- `monthlySummary`
- `summaryRangeLabel`
- `summaryPaymentMethods`
- `summaryMetrics`
- `dailySummaryRangeLabel`
- `monthlySummaryRangeLabel`
- `dailyPaymentMethods`
- `monthlyPaymentMethods`
- `dailySummaryMetrics`
- `monthlySummaryMetrics`
- `salesTrend*` computed values
- `discountVoidReturn*` computed values

### Payment Breakdown

Template responsibilities:

- Payment Methods chips in daily/monthly summaries.
- Payment Method Report panels and day-wise payment activity.

State and logic:

- `paymentReport`
- `paymentReportTotals`
- `paymentReportRangeLabel`
- `paymentMethodRows`
- `paymentDayRows`
- `paymentDayMax`
- `paymentCategoryColor`

### Inventory/Product Insights

Template responsibilities:

- Products tab item sales and category/brand/variant/attribute panels.
- Inventory tab inventory status, stock movement, reorder suggestions, fast-moving items, low-stock filters.
- Procurement tab supplier overview and supplier risk panels.

State and logic:

- `itemSales*` computed values
- `categoryVariant*` computed values
- `inventoryStatus*` computed values
- `stockMovement*` computed values
- `reorder*` computed values
- `fastMoving*` refs/computed values
- `lowStock*` refs/computed values
- `supplier*` refs/computed values
- `stockChipColor`
- `progressFromQuantity`
- `urgencyLabel`
- `urgencyColor`
- `formatMovementCategory`

### Charts/Tables

`Reports.vue` does not currently use a charting package. It renders chart-like comparisons as repeated rows, chips, progress bars, summary grids, and list stacks.

Reusable display patterns:

- Metric card.
- Summary metric.
- Insight row with title/value/meta/progress.
- Trend panel.
- Empty state.
- Supplier row.
- Filtered card controls.
- Pagination row for fast-moving items.

### Export/Refresh Logic

Observed refresh behavior:

- Manual refresh button calls `loadDashboard`.
- Watchers reload when supervisor status, POS Profile, scope, selected profile, month, fast-moving page, page size, and debounced search change.
- `lastUpdatedAt` is set after a successful load.

No explicit export action was found in the current `Reports.vue`. If export functionality is added later, keep it outside the first split or add it as a separate component with tests.

### API/Data Loading Logic

Current responsibilities:

- `createEmptyDashboard`
- `mergeDashboardPayload`
- `logDashboardRequest`
- `logDashboardResponse`
- `logDashboardError`
- `resetDashboardState`
- `loadDashboard`
- Watchers and `onMounted`
- Fast-moving search debounce cleanup in `onBeforeUnmount`

Inputs to `fetchDashboardData` include:

- `pos_profile`
- `scope`
- `profile_filter`
- `report_month`
- report limits
- low-stock threshold
- fast-moving pagination/search

## Refactor Principles

- Keep `dashboardService` as the single API/data contract boundary.
- Move one behavior-neutral unit at a time.
- Start with presentational components that receive props and emit only obvious events.
- Do not move watchers and `loadDashboard` until the visual split is stable.
- Do not change CSS class names in early PRs; move scoped CSS with the component only after snapshot/DOM tests cover it.
- Prefer passing already-derived props to child components before moving computed logic.
- Keep all currency/date/quantity formatting output identical.
- Do not introduce a charting package as part of this split.
- Do not change POS Profile scoping or supervisor gating.

## Proposed Target Structure

Possible final structure:

```text
frontend/src/posapp/components/reports/
  Reports.vue
  components/
    DashboardHeader.vue
    DashboardTabs.vue
    MetricCard.vue
    SummaryMetric.vue
    InsightRow.vue
    TrendPanel.vue
    EmptyState.vue
    SalesOverviewCards.vue
    SalesSummarySection.vue
    SalesTrendSection.vue
    DiscountVoidReturnSection.vue
    PaymentBreakdownSection.vue
    StaffPerformanceSection.vue
    CustomerReportSection.vue
    FinanceSection.vue
    BranchReportSection.vue
    ProductInsightsSection.vue
    InventoryStatusSection.vue
    StockMovementSection.vue
    ReorderSuggestionsSection.vue
    ProcurementSection.vue
  composables/
    useReportsDashboard.ts
    useReportsFormatters.ts
    useReportsSales.ts
    useReportsPayments.ts
    useReportsProducts.ts
    useReportsInventory.ts
    useReportsProcurement.ts
  utils/
    emptyDashboard.ts
    mergeDashboardPayload.ts
```

This is a direction, not a requirement to create all files. Each PR should add only the files needed for that step.

## Low-Risk PR Sequence

### PR 1: Add Characterization Tests Only

Scope:

- Add tests around current `Reports.vue` behavior before extraction.
- Mock `dashboardService.fetchDashboardData`, `uiStore`, and `employeeStore`.

Acceptance tests:

- Supervisor sees dashboard tabs and Refresh button.
- Non-supervisor sees warning and no dashboard body.
- Initial load calls `fetchDashboardData` with current POS Profile name, dashboard scope, report month, limits, and fast-moving parameters.
- Successful load renders at least one known sales KPI, one payment method row, one inventory count, and one supplier row from a fixture payload.
- Failed load renders the error alert.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`

### PR 2: Extract Shared Presentational Atoms

Scope:

- Extract `MetricCard`, `SummaryMetric`, `InsightRow`, `TrendPanel`, and `EmptyState`.
- Keep props simple and pass already formatted labels/values where possible.
- Keep class names unchanged or intentionally mirrored.

Acceptance tests:

- Existing characterization tests pass unchanged.
- New atom tests verify slots/props render text and progress values.
- No change to rendered text for representative sales, payment, inventory, and supplier fixture data.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`
- Run a visual smoke check if a local POS route is readily available.

### PR 3: Extract Header, Filters, Alerts, and Tabs

Scope:

- Create `DashboardHeader.vue` and `DashboardTabs.vue`.
- Keep `Reports.vue` owning all state and watchers.
- Child components receive values and emit `update:*` or simple events such as `refresh`.

Acceptance tests:

- Scope select remains disabled for non-supervisor users.
- Specific profile select appears only for `dashboardScope === "specific"`.
- Month field keeps `max=currentMonthToken`.
- Refresh still calls the same `loadDashboard` path.
- Mobile tab buttons and desktop tabs both update `activeDashboardTab`.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`

### PR 4: Extract Sales Tab Sections

Scope:

- Extract `SalesOverviewCards`, `SalesSummarySection`, `SalesTrendSection`, and `DiscountVoidReturnSection`.
- Keep computed values in `Reports.vue` for this PR; pass derived rows/metrics into children.

Acceptance tests:

- Sales tab renders all previous headings.
- Daily and monthly summary metrics match fixture values.
- Payment chips in daily/monthly summaries retain category colors.
- Sales trend best-day, best-hour, and growth chips render the same strings.
- Discount/void/return totals and rows render the same strings and empty states.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`

### PR 5: Extract Payment, Staff, Customer, Finance, and Branch Sections

Scope:

- Extract one tab section at a time, preferably in this order:
  1. Payment breakdown
  2. Staff performance
  3. Customer report
  4. Finance/profitability and taxes
  5. Branch/location report
- Keep computed logic in `Reports.vue` until all presentational extraction is stable.

Acceptance tests:

- Each tab still renders its heading, summary metrics, top rows, and empty state from fixtures.
- Payment report preserves pending/partial/unpaid counts.
- Staff report preserves top sales, active cashiers, and risk activity rows.
- Customer report preserves top, repeat, and recent customers.
- Finance report preserves profitability, margin, tax heads, charge heads, and day-wise rows.
- Branch report preserves location performance and top item groups.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`

### PR 6: Extract Product, Inventory, Stock Movement, Reorder, and Procurement Sections

Scope:

- Extract product insights and inventory/procurement-heavy sections after sales/payment sections are stable.
- Keep pagination/search state in `Reports.vue` at first.

Acceptance tests:

- Products tab preserves item sales rows, best seller, margin, discount labels, and category/brand/variant/attribute panels.
- Inventory tab preserves low/out/negative/slow/dead stock sections and thresholds.
- Fast-moving search/page/page-size controls still trigger reloads with the same request params.
- Stock movement preserves incoming/outgoing counts and recent movement rows.
- Reorder suggestions preserve urgency labels/colors and quantity formatting.
- Procurement preserves supplier filters, top suppliers, risk rows, day-wise purchases, and detailed supplier breakdown.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`

### PR 7: Extract Formatters and Pure Data Shapers

Scope:

- Move pure formatting helpers to `useReportsFormatters.ts`.
- Move `createEmptyDashboard` and `mergeDashboardPayload` to utility files.
- Move repeated max/progress helpers only when tests cover their output.

Acceptance tests:

- Direct unit tests for:
  - `formatMoney`
  - `formatQuantity`
  - `formatSignedQuantity`
  - `formatDate`
  - `formatPercent`
  - `formatDays`
  - `trendProgress`
  - `mergeDashboardPayload`
  - `createEmptyDashboard`
- Characterization tests still pass.
- Empty/missing partial payloads still render zero/default values without crashing.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`

### PR 8: Extract API/Data Loading Composable

Scope:

- Create `useReportsDashboard.ts`.
- Move state that directly controls data loading:
  - `loading`
  - `errorMessage`
  - `isDashboardEnabledOnServer`
  - `lastUpdatedAt`
  - `allowAllProfiles`
  - `dashboardData`
  - `resetDashboardState`
  - `loadDashboard`
  - request logging
- Keep UI tab state in `Reports.vue` unless there is a clear test-covered reason to move it.

Acceptance tests:

- Composable test verifies non-supervisor reset behavior.
- Composable test verifies request payload assembly for all filters and limits.
- Composable test verifies response merge, `selectedReportMonth` server sync, `allowAllProfiles`, scope initialization, and specific-profile default selection.
- Composable test verifies failure sets `errorMessage` and clears loading.
- Existing component tests pass.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`

### PR 9: Move Watchers and Debounced Search Into Composables

Scope:

- Move watcher orchestration only after `useReportsDashboard` is stable.
- Consider `useReportsRefreshTriggers.ts` for:
  - supervisor watch
  - POS Profile watch
  - scope/profile/month watch
  - fast-moving page/page-size/search watch
  - debounce cleanup

Acceptance tests:

- Changing scope calls load once with expected params and clears selected profile when not specific.
- Changing to specific scope selects the first available profile when none selected.
- Changing report month resets fast-moving page to 1 before loading when needed.
- Changing fast-moving search input debounces before request.
- `onBeforeUnmount` clears pending debounce.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`

### PR 10: Move Scoped CSS Gradually

Scope:

- Move CSS only after components are extracted and covered by tests.
- Prefer keeping shared classes in a single reports stylesheet if multiple sections use them.
- Avoid renaming classes unless the PR is purely CSS and visually verified.

Acceptance tests:

- Component DOM still contains expected class names used by current CSS.
- Desktop and mobile tab layouts remain represented in tests.
- Manual visual QA compares before/after for desktop and narrow viewport.

Validation:

- `cd frontend && yarn test:unit`
- `cd frontend && yarn type-check`
- `cd frontend && yarn build`
- Browser smoke check when a local POS route is available.

## Suggested Test Fixtures

Create a compact dashboard fixture that includes non-empty data for every tab:

- `sales_overview`
- `daily_sales_summary`
- `monthly_sales_summary`
- `payment_method_report`
- `discount_void_return_report`
- `staff_performance_report`
- `customer_report`
- `profitability_report`
- `tax_charges_report`
- `branch_location_report`
- `sales_trend`
- `item_sales_report`
- `category_brand_variant_report`
- `inventory_status_report`
- `stock_movement_report`
- `reorder_purchase_suggestions`
- `inventory_insights`
- `supplier_overview`

Also create a sparse fixture with only `enabled`, `currency`, and `date_context` to verify fallback/default rendering.

## Risk Controls

- Do not change backend `posawesome.posawesome.api.dashboard.get_dashboard_data`.
- Do not alter `dashboardService` request/response types in visual extraction PRs.
- Do not change supervisor gating or POS Profile scope defaults.
- Do not change report limits or fast-moving pagination defaults.
- Do not change formatting precision or date output.
- Do not replace progress-bar based trend displays with chart components during this split.
- Keep each PR reviewable by limiting it to either presentation extraction, pure helper extraction, or loading orchestration extraction.

## Done Criteria For The Full Refactor

- `Reports.vue` primarily composes sections and wires high-level state.
- Data loading remains centralized and test-covered.
- Shared formatting and payload merging are unit-tested.
- Each major dashboard tab has a small presentational component.
- All existing user-visible text, empty states, filters, tabs, and refresh behavior remain unchanged.
- `cd frontend && yarn test:unit`, `cd frontend && yarn type-check`, and `cd frontend && yarn build` pass before merging the final extraction PR.
