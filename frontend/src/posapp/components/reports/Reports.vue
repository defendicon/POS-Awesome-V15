<template>
	<div class="awesome-dashboard-view">
		<v-container fluid class="dashboard-shell pa-3 pa-sm-4">
			<div class="dashboard-toolbar mb-4">
				<div>
					<h1 class="text-h5 text-sm-h4 font-weight-bold mb-1">{{ __("Awesome Dashboard") }}</h1>
					<p class="text-body-2 text-medium-emphasis mb-0">
						{{ __("Real-time POS insights for retail operations.") }}
					</p>
					<div class="dashboard-meta mt-2">
						<v-chip size="x-small" color="secondary" variant="tonal" class="mr-1 mb-1">
							{{ scopeDisplayLabel }}
						</v-chip>
						<v-chip size="x-small" color="info" variant="tonal" class="mr-1 mb-1">
							{{ __("Profiles") }}: {{ selectedProfilesCount }}
						</v-chip>
						<v-chip size="x-small" :color="profitMethodColor" variant="tonal" class="mr-1 mb-1">
							{{ profitMethodLabel }}
						</v-chip>
					</div>
				</div>
				<div class="dashboard-actions">
					<v-select
						v-model="dashboardScope"
						:items="dashboardScopeItems"
						item-title="label"
						item-value="value"
						density="compact"
						variant="outlined"
						hide-details
						class="dashboard-filter mr-2 mb-2 mb-sm-0"
						:label="__('Scope')"
					/>
					<v-select
						v-if="dashboardScope === 'specific'"
						v-model="selectedProfileFilter"
						:items="profileFilterItems"
						item-title="label"
						item-value="value"
						density="compact"
						variant="outlined"
						hide-details
						class="dashboard-filter mr-2 mb-2 mb-sm-0"
						:label="__('Profile')"
					/>
					<v-chip
						v-if="lastUpdatedLabel"
						size="small"
						variant="tonal"
						color="primary"
						class="mr-2 mb-2 mb-sm-0"
					>
						{{ lastUpdatedLabel }}
					</v-chip>
					<v-btn color="primary" variant="flat" :loading="loading" @click="loadDashboard">
						{{ __("Refresh") }}
					</v-btn>
				</div>
			</div>

			<v-alert
				v-if="!isDashboardEnabledOnServer"
				type="warning"
				variant="tonal"
				class="mb-4"
			>
				{{ disabledReasonText }}
			</v-alert>

			<v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
				{{ errorMessage }}
			</v-alert>

			<template v-if="canRenderDashboard">
				<v-row class="dashboard-grid mb-2">
					<v-col v-for="metric in salesMetrics" :key="metric.key" cols="12" sm="6" lg="3">
						<v-card class="metric-card" :class="metric.styleClass" elevation="2">
							<div class="metric-card__header">
								<span class="metric-card__label">{{ metric.label }}</span>
								<v-icon size="20">{{ metric.icon }}</v-icon>
							</div>
							<div class="metric-card__value">{{ formatMoney(metric.value) }}</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row class="dashboard-grid">
					<v-col cols="12" lg="6">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Fast Moving Items") }}</h2>
								<v-chip size="small" color="success" variant="tonal">
									{{ __("Top 10") }}
								</v-chip>
							</div>

							<div v-if="loading" class="py-2">
								<v-skeleton-loader type="list-item-three-line" class="mb-2" />
								<v-skeleton-loader type="list-item-three-line" class="mb-2" />
								<v-skeleton-loader type="list-item-three-line" />
							</div>

							<div v-else-if="fastMovingItems.length" class="list-stack">
								<div v-for="item in fastMovingItems" :key="item.item_code" class="insight-row">
									<div class="insight-row__top">
										<div class="insight-row__title">
											{{ item.item_name || item.item_code }}
										</div>
										<div class="insight-row__value">
											{{ formatQuantity(item.sold_qty) }} {{ item.stock_uom || "" }}
										</div>
									</div>
									<div class="insight-row__meta">{{ item.item_code }}</div>
									<v-progress-linear
										:model-value="progressFromQuantity(item.sold_qty)"
										color="success"
										height="6"
										rounded
									/>
								</div>
							</div>

							<div v-else class="empty-state">
								{{ __("No sales activity found for this period.") }}
							</div>
						</v-card>
					</v-col>

					<v-col cols="12" lg="6">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Low Stock Alerts") }}</h2>
								<v-chip size="small" color="warning" variant="tonal">
									{{ __("Threshold") }}: {{ lowStockThreshold }}
								</v-chip>
							</div>

							<div v-if="loading" class="py-2">
								<v-skeleton-loader type="list-item-two-line" class="mb-2" />
								<v-skeleton-loader type="list-item-two-line" class="mb-2" />
								<v-skeleton-loader type="list-item-two-line" />
							</div>

							<div v-else-if="lowStockItems.length" class="list-stack">
								<div v-for="item in lowStockItems" :key="item.item_code" class="insight-row">
									<div class="insight-row__top">
										<div class="insight-row__title">
											{{ item.item_name || item.item_code }}
										</div>
										<v-chip size="x-small" :color="stockChipColor(item.actual_qty)" variant="flat">
											{{ formatQuantity(item.actual_qty) }} {{ item.stock_uom || "" }}
										</v-chip>
									</div>
									<div class="insight-row__meta">
										{{ item.item_code }} . {{ item.warehouse }}
									</div>
								</div>
							</div>

							<div v-else class="empty-state">
								{{ __("No low stock alerts right now.") }}
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row class="dashboard-grid mt-1">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Supplier Purchase Summary") }}</h2>
								<v-chip size="small" color="info" variant="tonal">
									{{ monthRangeLabel }}
								</v-chip>
							</div>

							<div v-if="loading" class="py-2">
								<v-skeleton-loader type="list-item-two-line" class="mb-2" />
								<v-skeleton-loader type="list-item-two-line" class="mb-2" />
								<v-skeleton-loader type="list-item-two-line" />
							</div>

							<div v-else-if="supplierSummary.length" class="list-stack">
								<div v-for="supplier in supplierSummary" :key="supplier.supplier" class="supplier-row">
									<div class="supplier-row__name">
										{{ supplier.supplier_name || supplier.supplier }}
									</div>
									<div class="supplier-row__meta">
										{{ __("Invoices") }}: {{ supplier.purchase_count }} .
										{{ __("Last") }}: {{ formatDate(supplier.last_purchase_date) }}
									</div>
									<div class="supplier-row__amount">
										{{ formatMoney(supplier.purchase_amount) }}
									</div>
								</div>
							</div>

							<div v-else class="empty-state">
								{{ __("No supplier purchases found in this month.") }}
							</div>
						</v-card>
					</v-col>
				</v-row>
			</template>
		</v-container>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useUIStore } from "@/posapp/stores/uiStore";
import {
	fetchDashboardData,
	type DashboardResponse,
	type FastMovingItem,
	type LowStockItem,
	type SupplierSummaryRow,
} from "@/posapp/services/dashboardService";

defineOptions({
	name: "Reports",
});

const uiStore = useUIStore();

const loading = ref(false);
const errorMessage = ref("");
const isDashboardEnabledOnServer = ref(true);
const lastUpdatedAt = ref<Date | null>(null);
const allowAllProfiles = ref(false);
const dashboardScope = ref<"all" | "current" | "specific">("all");
const selectedProfileFilter = ref("");
const scopeInitialized = ref(false);

const createEmptyDashboard = (): DashboardResponse => ({
	enabled: true,
	sales_overview: {
		today_sales: 0,
		today_profit: 0,
		monthly_sales: 0,
		monthly_profit: 0,
	},
	inventory_insights: {
		fast_moving_items: [],
		low_stock_items: [],
		low_stock_threshold: 10,
	},
	supplier_overview: {
		purchase_summary: [],
		period: {},
	},
});

const dashboardData = ref<DashboardResponse>(createEmptyDashboard());

const __ = (value: string) => (window.__ ? window.__(value) : value);
const DASHBOARD_LOG_PREFIX = "[AwesomeDashboard]";

const posProfile = computed(() => uiStore.posProfile || {});
const profileName = computed(() => String((posProfile.value as any)?.name || "").trim());
const currency = computed(() => dashboardData.value.currency || (posProfile.value as any)?.currency || "");

const configuredLowStockThreshold = computed(() => {
	const rawValue = Number((posProfile.value as any)?.posa_low_stock_alert_threshold);
	return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : undefined;
});

const availableProfiles = computed(() => dashboardData.value.available_profiles || []);
const enabledProfiles = computed(() =>
	availableProfiles.value.filter((profile) => profile.dashboard_enabled !== false),
);

const dashboardScopeItems = computed(() => {
	const items = [
		{ label: __("All Profiles"), value: "all" as const },
		{ label: __("Current Profile"), value: "current" as const },
		{ label: __("Specific Profile"), value: "specific" as const },
	];
	return allowAllProfiles.value
		? items
		: items.filter((item) => item.value === "current");
});

const profileFilterItems = computed(() =>
	enabledProfiles.value.map((profile) => ({
		label: profile.name,
		value: profile.name,
	})),
);

const canRenderDashboard = computed(() => isDashboardEnabledOnServer.value);
const disabledReasonText = computed(() => {
	const reason = dashboardData.value.disabled_reason;
	if (reason === "global_disabled") {
		return __("Awesome Dashboard is disabled in POS Settings.");
	}
	if (reason === "no_profiles_in_scope") {
		return __("No profiles found for selected scope. Falling back to current profile failed.");
	}
	return __("Awesome Dashboard is disabled in global settings or for the selected scope.");
});
const selectedProfilesCount = computed(
	() => Number(dashboardData.value.selected_profiles?.length || 0),
);
const scopeDisplayLabel = computed(() => {
	const current = dashboardData.value.scope || dashboardScope.value;
	if (current === "specific") {
		return __("Scope: Specific Profile");
	}
	if (current === "current") {
		return __("Scope: Current Profile");
	}
	return __("Scope: All Profiles");
});
const profitMethodLabel = computed(() =>
	dashboardData.value.sales_overview.profit_method === "stock_ledger"
		? __("Profit: Stock Ledger (COGS)")
		: __("Profit: Invoice Item Estimate"),
);
const profitMethodColor = computed(() =>
	dashboardData.value.sales_overview.profit_method === "stock_ledger" ? "success" : "warning",
);

const salesMetrics = computed(() => [
	{
		key: "today_sales",
		label: __("Today Sales"),
		icon: "mdi-cart-outline",
		value: Number(dashboardData.value.sales_overview.today_sales || 0),
		styleClass: "metric-card--sales",
	},
	{
		key: "today_profit",
		label: __("Today Profit"),
		icon: "mdi-cash-plus",
		value: Number(dashboardData.value.sales_overview.today_profit || 0),
		styleClass: "metric-card--profit",
	},
	{
		key: "monthly_sales",
		label: __("Monthly Sales"),
		icon: "mdi-calendar-month-outline",
		value: Number(dashboardData.value.sales_overview.monthly_sales || 0),
		styleClass: "metric-card--sales",
	},
	{
		key: "monthly_profit",
		label: __("Monthly Profit"),
		icon: "mdi-finance",
		value: Number(dashboardData.value.sales_overview.monthly_profit || 0),
		styleClass: "metric-card--profit",
	},
]);

const fastMovingItems = computed<FastMovingItem[]>(
	() => dashboardData.value.inventory_insights.fast_moving_items || [],
);
const lowStockItems = computed<LowStockItem[]>(
	() => dashboardData.value.inventory_insights.low_stock_items || [],
);
const supplierSummary = computed<SupplierSummaryRow[]>(
	() => dashboardData.value.supplier_overview.purchase_summary || [],
);

const maxFastMovingQty = computed(() => {
	const maxValue = fastMovingItems.value.reduce((max, item) => {
		const qty = Number(item.sold_qty || 0);
		return qty > max ? qty : max;
	}, 0);
	return maxValue > 0 ? maxValue : 1;
});

const lowStockThreshold = computed(
	() => Number(dashboardData.value.inventory_insights.low_stock_threshold || 10),
);

const monthRangeLabel = computed(() => {
	const from = dashboardData.value.supplier_overview.period?.from;
	const to = dashboardData.value.supplier_overview.period?.to;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});

const lastUpdatedLabel = computed(() => {
	if (!lastUpdatedAt.value) {
		return "";
	}
	return `${__("Updated")}: ${lastUpdatedAt.value.toLocaleTimeString()}`;
});

function formatMoney(value: number) {
	const amount = Number(value || 0);
	const formatted = new Intl.NumberFormat(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
	const symbol = typeof get_currency_symbol === "function" && currency.value ? get_currency_symbol(currency.value) : "";
	return symbol ? `${symbol} ${formatted}` : formatted;
}

function formatQuantity(value: number) {
	return new Intl.NumberFormat(undefined, {
		maximumFractionDigits: 2,
	}).format(Number(value || 0));
}

function formatDate(value?: string) {
	if (!value) {
		return "-";
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleDateString();
}

function progressFromQuantity(quantity: number) {
	return Math.min(100, (Number(quantity || 0) / maxFastMovingQty.value) * 100);
}

function stockChipColor(quantity: number) {
	return Number(quantity || 0) <= 0 ? "error" : "warning";
}

function mergeDashboardPayload(payload?: Partial<DashboardResponse>): DashboardResponse {
	const base = createEmptyDashboard();
	return {
		...base,
		...payload,
		sales_overview: {
			...base.sales_overview,
			...(payload?.sales_overview || {}),
		},
		inventory_insights: {
			...base.inventory_insights,
			...(payload?.inventory_insights || {}),
		},
		supplier_overview: {
			...base.supplier_overview,
			...(payload?.supplier_overview || {}),
		},
	};
}

function logDashboardRequest() {
	console.groupCollapsed(`${DASHBOARD_LOG_PREFIX} fetch:start`);
	console.info("scope", dashboardScope.value);
	console.info("profile_filter", selectedProfileFilter.value || null);
	console.info("pos_profile", profileName.value || null);
	console.info("threshold_override", configuredLowStockThreshold.value ?? null);
	console.groupEnd();
}

function logDashboardResponse(response: DashboardResponse) {
	console.groupCollapsed(`${DASHBOARD_LOG_PREFIX} fetch:success`);
	console.info("enabled", response.enabled);
	console.info("disabled_reason", response.disabled_reason || null);
	console.info("global_enabled", response.global_enabled ?? null);
	console.info("scope", response.scope || null);
	console.info("allow_all_profiles", response.allow_all_profiles ?? null);
	console.info("selected_profiles", response.selected_profiles || []);
	console.info("available_profiles_count", response.available_profiles?.length || 0);
	console.info("profit_method", response.sales_overview?.profit_method || null);
	console.groupEnd();
}

function logDashboardError(error: any) {
	console.groupCollapsed(`${DASHBOARD_LOG_PREFIX} fetch:error`);
	console.error(error);
	console.groupEnd();
}

async function loadDashboard() {
	loading.value = true;
	errorMessage.value = "";
	logDashboardRequest();

	try {
		const response = await fetchDashboardData({
			pos_profile: profileName.value || undefined,
			scope: dashboardScope.value,
			profile_filter:
				dashboardScope.value === "specific" ? selectedProfileFilter.value || undefined : undefined,
			low_stock_threshold: configuredLowStockThreshold.value,
		});
		logDashboardResponse(response);
		dashboardData.value = mergeDashboardPayload(response);
		isDashboardEnabledOnServer.value = response.enabled !== false;
		allowAllProfiles.value = Boolean(response.allow_all_profiles);
		if (!scopeInitialized.value) {
			const defaultScope = (response.default_scope || dashboardScope.value) as
				| "all"
				| "current"
				| "specific";
			dashboardScope.value = defaultScope;
			scopeInitialized.value = true;
		}
		if (!allowAllProfiles.value && dashboardScope.value !== "current") {
			dashboardScope.value = "current";
		}
		if (dashboardScope.value === "specific" && !selectedProfileFilter.value) {
			const firstProfile = profileFilterItems.value[0]?.value || "";
			selectedProfileFilter.value = firstProfile;
		}
		lastUpdatedAt.value = new Date();
	} catch (error: any) {
		logDashboardError(error);
		errorMessage.value = error?.message || __("Failed to load dashboard data.");
	} finally {
		loading.value = false;
	}
}

watch(
	() => profileName.value,
	(newProfile, oldProfile) => {
		if (!newProfile || newProfile === oldProfile) {
			return;
		}
		void loadDashboard();
	},
);

watch(
	() => dashboardScope.value,
	(scope) => {
		if (scope !== "specific") {
			selectedProfileFilter.value = "";
		} else if (!selectedProfileFilter.value) {
			selectedProfileFilter.value = profileFilterItems.value[0]?.value || "";
		}
		void loadDashboard();
	},
);

watch(
	() => selectedProfileFilter.value,
	(newValue, oldValue) => {
		if (dashboardScope.value !== "specific") {
			return;
		}
		if (newValue === oldValue) {
			return;
		}
		void loadDashboard();
	},
);

onMounted(() => {
	void loadDashboard();
});
</script>

<style scoped>
.awesome-dashboard-view {
	height: 100%;
	overflow: auto;
	background:
		radial-gradient(circle at top right, rgba(25, 118, 210, 0.08), transparent 40%),
		radial-gradient(circle at bottom left, rgba(76, 175, 80, 0.08), transparent 45%),
		var(--pos-background, #f4f6f8);
}

.dashboard-shell {
	min-height: 100%;
}

.dashboard-toolbar {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
}

.dashboard-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
}

.dashboard-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
}

.dashboard-filter {
	min-width: 180px;
	max-width: 220px;
}

.dashboard-grid {
	row-gap: 4px;
}

.metric-card {
	border-radius: 14px;
	padding: 14px;
	background: var(--pos-card-bg);
	border: 1px solid var(--pos-border);
}

.metric-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 10px;
	color: var(--pos-text-secondary);
}

.metric-card__label {
	font-size: 0.85rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.metric-card__value {
	font-size: 1.35rem;
	font-weight: 700;
	color: var(--pos-text-primary);
	word-break: break-word;
}

.metric-card--sales {
	box-shadow: 0 8px 20px rgba(25, 118, 210, 0.08);
}

.metric-card--profit {
	box-shadow: 0 8px 20px rgba(56, 142, 60, 0.08);
}

.dashboard-card {
	height: 100%;
	border-radius: 14px;
	padding: 14px;
	background: var(--pos-card-bg);
	border: 1px solid var(--pos-border);
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.dashboard-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	flex-wrap: wrap;
}

.list-stack {
	display: flex;
	flex-direction: column;
	gap: 10px;
	max-height: 360px;
	overflow: auto;
	padding-right: 2px;
}

.insight-row {
	border: 1px solid var(--pos-border);
	border-radius: 10px;
	padding: 10px;
	background: var(--pos-card-bg);
}

.insight-row__top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 4px;
}

.insight-row__title {
	font-weight: 600;
	color: var(--pos-text-primary);
}

.insight-row__value {
	font-size: 0.86rem;
	font-weight: 600;
	color: var(--pos-text-secondary);
	white-space: nowrap;
}

.insight-row__meta {
	font-size: 0.78rem;
	color: var(--pos-text-secondary);
	margin-bottom: 6px;
}

.supplier-row {
	border: 1px solid var(--pos-border);
	border-radius: 10px;
	padding: 10px;
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 6px 10px;
	align-items: center;
	background: var(--pos-card-bg);
}

.supplier-row__name {
	font-weight: 600;
	color: var(--pos-text-primary);
}

.supplier-row__meta {
	font-size: 0.78rem;
	color: var(--pos-text-secondary);
}

.supplier-row__amount {
	font-weight: 700;
	color: var(--pos-text-primary);
	grid-row: 1 / span 2;
	justify-self: end;
	align-self: center;
}

.empty-state {
	font-size: 0.9rem;
	color: var(--pos-text-secondary);
	padding: 16px 0;
}

@media (max-width: 960px) {
	.list-stack {
		max-height: none;
	}
}

@media (max-width: 600px) {
	.dashboard-filter {
		min-width: 150px;
		max-width: 180px;
	}

	.metric-card__value {
		font-size: 1.15rem;
	}

	.supplier-row {
		grid-template-columns: 1fr;
	}

	.supplier-row__amount {
		grid-row: auto;
		justify-self: start;
	}
}
</style>
