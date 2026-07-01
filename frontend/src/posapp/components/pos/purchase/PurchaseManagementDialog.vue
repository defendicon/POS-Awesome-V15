<template>
	<v-dialog v-model="dialog" max-width="1180px" scrollable>
		<v-card class="purchase-management-card pos-themed-card" variant="flat">
			<v-card-title class="purchase-management-card__title">
				<div>
					<div class="text-h5 text-primary">{{ __("Purchase Management") }}</div>
					<div class="text-subtitle-2 text-medium-emphasis">
						{{ __("Manage receipts, supplier bills, and payments for submitted purchase orders") }}
					</div>
				</div>
				<div class="d-flex align-center ga-2">
					<v-btn
						color="primary"
						variant="text"
						prepend-icon="mdi-refresh"
						:loading="loading"
						@click="loadOrders"
					>
						{{ __("Refresh") }}
					</v-btn>
					<v-btn icon="mdi-close" variant="text" :aria-label="__('Close')" @click="dialog = false" />
				</div>
			</v-card-title>

			<div class="purchase-management-tabs">
				<v-tabs v-model="activeTab" color="primary" grow>
					<v-tab value="active">{{ __("Active") }}</v-tab>
					<v-tab value="to_receive">{{ __("To Receive") }}</v-tab>
					<v-tab value="to_bill">{{ __("To Bill") }}</v-tab>
					<v-tab value="to_pay">{{ __("To Pay") }}</v-tab>
					<v-tab value="all">{{ __("All") }}</v-tab>
				</v-tabs>
			</div>

			<v-divider />

			<v-card-text class="purchase-management-card__body">
				<div class="purchase-management-filters">
					<v-text-field
						v-model="filters.search"
						variant="outlined"
						density="compact"
						hide-details
						clearable
						prepend-inner-icon="mdi-magnify"
						:label="__('Search purchase orders or suppliers')"
						@keyup.enter="loadOrders"
					/>
					<v-text-field
						v-model="filters.supplier"
						variant="outlined"
						density="compact"
						hide-details
						clearable
						prepend-inner-icon="mdi-account-search-outline"
						:label="__('Supplier')"
						@keyup.enter="loadOrders"
					/>
					<v-select
						v-model="filters.warehouse"
						variant="outlined"
						density="compact"
						hide-details
						clearable
						:items="warehouseOptions"
						item-title="warehouse_name"
						item-value="name"
						:label="__('Warehouse')"
					/>
					<v-text-field
						v-model="filters.fromDate"
						type="date"
						variant="outlined"
						density="compact"
						hide-details
						:label="__('From Date')"
					/>
					<v-text-field
						v-model="filters.toDate"
						type="date"
						variant="outlined"
						density="compact"
						hide-details
						:label="__('To Date')"
					/>
					<v-btn color="primary" prepend-icon="mdi-filter" :loading="loading" @click="loadOrders">
						{{ __("Apply") }}
					</v-btn>
				</div>

				<v-alert v-if="errorMessage" type="error" density="compact" class="mb-3">
					{{ errorMessage }}
				</v-alert>

				<div class="purchase-management-summary">
					<div class="purchase-management-summary__tile">
						<span>{{ __("Orders") }}</span>
						<strong>{{ orders.length }}</strong>
					</div>
					<div class="purchase-management-summary__tile">
						<span>{{ __("To Receive") }}</span>
						<strong>{{ receiveCount }}</strong>
					</div>
					<div class="purchase-management-summary__tile">
						<span>{{ __("To Bill") }}</span>
						<strong>{{ billCount }}</strong>
					</div>
					<div class="purchase-management-summary__tile">
						<span>{{ __("To Pay") }}</span>
						<strong>{{ currencySymbol(posProfile?.currency) }} {{ formatAmount(payableTotal) }}</strong>
					</div>
				</div>

				<v-data-table
					:headers="headers"
					:items="orders"
					:loading="loading"
					density="compact"
					class="purchase-management-table"
					:items-per-page="15"
				>
					<template #item.name="{ item }">
						<div class="purchase-management-order">
							<div class="d-flex align-center ga-1">
								<strong>{{ item.name }}</strong>
								<v-btn
									icon="mdi-information-outline"
									size="x-small"
									variant="text"
									:aria-label="__('View details')"
									:loading="previewLoading && previewName === item.name"
									@click.stop="previewOrder(item)"
								/>
							</div>
							<span>{{ item.supplier_name || item.supplier }}</span>
						</div>
					</template>
					<template #item.transaction_date="{ item }">
						{{ formatDate(item.transaction_date) }}
					</template>
					<template #item.receipt_status="{ item }">
						<v-chip
							size="x-small"
							variant="tonal"
							:color="item.receipt_complete ? 'success' : item.has_receipt ? 'warning' : 'grey'"
						>
							{{ receiptLabel(item) }}
						</v-chip>
					</template>
					<template #item.invoice_status="{ item }">
						<v-chip
							size="x-small"
							variant="tonal"
							:color="item.invoice_complete ? 'primary' : item.has_invoice ? 'info' : 'grey'"
						>
							{{ invoiceLabel(item) }}
						</v-chip>
					</template>
					<template #item.payable_amount="{ item }">
						<strong>{{ currencySymbol(item.currency) }} {{ formatAmount(item.payable_amount) }}</strong>
					</template>
					<template #item.actions="{ item }">
						<div class="purchase-management-actions">
							<v-btn
								size="small"
								color="success"
								variant="tonal"
								prepend-icon="mdi-truck-check-outline"
								:disabled="item.receipt_complete"
								:loading="actionLoading === `${item.name}:receipt`"
								@click="runAction(item, 'receipt')"
							>
								{{ __("Receive") }}
							</v-btn>
							<v-btn
								size="small"
								color="primary"
								variant="tonal"
								prepend-icon="mdi-file-document-check-outline"
								:disabled="item.invoice_complete"
								:loading="actionLoading === `${item.name}:invoice`"
								@click="runAction(item, 'invoice')"
							>
								{{ __("Bill") }}
							</v-btn>
							<v-btn
								size="small"
								color="deep-purple"
								variant="tonal"
								prepend-icon="mdi-credit-card-outline"
								:disabled="Number(item.payable_amount || 0) <= 0"
								:loading="actionLoading === `${item.name}:payment`"
								@click="openPayment(item)"
							>
								{{ item.invoice_count ? __("Pay") : __("Advance") }}
							</v-btn>
						</div>
					</template>
				</v-data-table>
			</v-card-text>
		</v-card>

		<v-dialog v-model="previewDialog" max-width="900px" scrollable>
			<v-card class="pos-themed-card">
				<v-card-title class="d-flex align-center ga-2">
					<div>
						<div class="text-h6">{{ previewDoc?.name || __("Purchase Order") }}</div>
						<div class="text-caption text-medium-emphasis">
							{{ previewDoc?.supplier_name || previewDoc?.supplier }}
						</div>
					</div>
					<v-spacer />
					<v-btn icon="mdi-close" variant="text" @click="previewDialog = false" />
				</v-card-title>
				<v-card-text>
					<div v-if="previewDoc" class="purchase-management-preview">
						<div>
							<span>{{ __("Receipt") }}</span>
							<strong>{{ receiptLabel(previewDoc) }}</strong>
						</div>
						<div>
							<span>{{ __("Bill") }}</span>
							<strong>{{ invoiceLabel(previewDoc) }}</strong>
						</div>
						<div>
							<span>{{ __("Payable") }}</span>
							<strong>
								{{ currencySymbol(previewDoc.currency) }} {{ formatAmount(previewDoc.payable_amount) }}
							</strong>
						</div>
					</div>

					<v-data-table
						:headers="previewHeaders"
						:items="previewDoc?.items || []"
						density="compact"
						hide-default-footer
						:items-per-page="-1"
						class="mt-4"
					>
						<template #item.item_name="{ item }">
							<div class="py-1">
								<div class="font-weight-medium">{{ item.item_name || item.item_code }}</div>
								<div class="text-caption text-medium-emphasis">{{ item.item_code }}</div>
							</div>
						</template>
					</v-data-table>
				</v-card-text>
			</v-card>
		</v-dialog>

		<PurchasePaymentDialog
			v-model="paymentDialog"
			:total-amount="Number(paymentOrder?.payable_amount || 0)"
			:currency="paymentOrder?.currency || posProfile?.currency"
			:pos-profile="posProfile"
			:create-invoice="false"
			@submit="handlePaymentSubmit"
		/>
	</v-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";
import { normalizeDateForBackend } from "../../../format";
import { useToastStore } from "../../../stores/toastStore";
import PurchasePaymentDialog from "./PurchasePaymentDialog.vue";

const __ = window.__ || ((text) => text);

const props = defineProps({
	modelValue: {
		type: Boolean,
		default: false,
	},
	posProfile: {
		type: Object,
		default: () => ({}),
	},
	warehouseOptions: {
		type: Array,
		default: () => [],
	},
});

const emit = defineEmits(["update:modelValue"]);
const toastStore = useToastStore();

const dialog = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
});

const filters = reactive({
	search: "",
	supplier: "",
	warehouse: null,
	fromDate: null,
	toDate: null,
});

const activeTab = ref("active");
const orders = ref([]);
const loading = ref(false);
const actionLoading = ref("");
const errorMessage = ref("");
const previewDialog = ref(false);
const previewDoc = ref(null);
const previewLoading = ref(false);
const previewName = ref("");
const paymentDialog = ref(false);
const paymentOrder = ref(null);

const headers = [
	{ title: __("Purchase Order"), key: "name", align: "start", sortable: true },
	{ title: __("Date"), key: "transaction_date", align: "start", sortable: true },
	{ title: __("Receipt"), key: "receipt_status", align: "start", sortable: false },
	{ title: __("Bill"), key: "invoice_status", align: "start", sortable: false },
	{ title: __("Payable"), key: "payable_amount", align: "end", sortable: true },
	{ title: __("Actions"), key: "actions", align: "end", sortable: false },
];

const previewHeaders = [
	{ title: __("Item"), key: "item_name", align: "start", sortable: false },
	{ title: __("Ordered"), key: "ordered_qty", align: "center", sortable: false },
	{ title: __("Pending Receipt"), key: "pending_receipt_qty", align: "center", sortable: false },
	{ title: __("Pending Bill"), key: "pending_bill_qty", align: "center", sortable: false },
	{ title: __("Rate"), key: "rate", align: "end", sortable: false },
];

const receiveCount = computed(() => orders.value.filter((row) => row.needs_receipt).length);
const billCount = computed(() => orders.value.filter((row) => row.needs_invoice).length);
const payableTotal = computed(() =>
	orders.value.reduce((sum, row) => sum + (Number(row.payable_amount) || 0), 0),
);

watch(dialog, (value) => {
	if (value) {
		loadOrders();
	} else {
		errorMessage.value = "";
		previewDoc.value = null;
		paymentOrder.value = null;
	}
});

watch(activeTab, () => {
	if (dialog.value) loadOrders();
});

async function loadOrders() {
	if (loading.value) return;

	loading.value = true;
	errorMessage.value = "";
	try {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.purchase_orders.search_purchase_management_orders",
			args: {
				pos_profile: props.posProfile,
				company: props.posProfile?.company,
				search_text: filters.search || null,
				supplier: filters.supplier || null,
				warehouse: filters.warehouse || null,
				from_date: normalizeDateForBackend(filters.fromDate),
				to_date: normalizeDateForBackend(filters.toDate),
				status_filter: activeTab.value === "all" ? null : activeTab.value,
				limit: 100,
			},
		});
		orders.value = Array.isArray(message) ? message : [];
	} catch (error) {
		console.error("Failed to load purchase management orders", error);
		errorMessage.value = __("Unable to load purchase management orders");
		orders.value = [];
	} finally {
		loading.value = false;
	}
}

async function fetchManagementDoc(name) {
	const { message } = await frappe.call({
		method: "posawesome.posawesome.api.purchase_orders.get_purchase_management_order",
		args: {
			purchase_order: name,
			pos_profile: props.posProfile,
			company: props.posProfile?.company,
		},
	});
	return message;
}

async function previewOrder(row) {
	if (!row?.name || previewLoading.value) return;

	previewLoading.value = true;
	previewName.value = row.name;
	try {
		previewDoc.value = await fetchManagementDoc(row.name);
		previewDialog.value = true;
	} catch (error) {
		console.error("Failed to preview purchase order", error);
		toastStore.show({ title: __("Unable to show purchase order details"), color: "error" });
	} finally {
		previewLoading.value = false;
		previewName.value = "";
	}
}

async function runAction(row, action) {
	if (!row?.name || actionLoading.value) return;

	actionLoading.value = `${row.name}:${action}`;
	try {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.purchase_orders.process_purchase_management_action",
			args: {
				data: {
					purchase_order: row.name,
					action,
					pos_profile: props.posProfile,
					company: props.posProfile?.company,
					warehouse: row.set_warehouse,
				},
			},
		});
		const createdDoc = message?.purchase_receipt || message?.purchase_invoice || row.name;
		toastStore.show({ title: __("Purchase action completed: {0}", [createdDoc]), color: "success" });
		await loadOrders();
		if (previewDialog.value && previewDoc.value?.name === row.name) {
			previewDoc.value = await fetchManagementDoc(row.name);
		}
	} catch (error) {
		console.error("Failed purchase management action", error);
		toastStore.show({ title: extractServerError(error), color: "error" });
	} finally {
		actionLoading.value = "";
	}
}

function openPayment(row) {
	if (!row?.name || Number(row.payable_amount || 0) <= 0) return;

	paymentOrder.value = row;
	paymentDialog.value = true;
}

async function handlePaymentSubmit({ payments }) {
	if (!paymentOrder.value) return;

	const row = paymentOrder.value;
	paymentDialog.value = false;
	actionLoading.value = `${row.name}:payment`;
	try {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.purchase_orders.process_purchase_management_action",
			args: {
				data: {
					purchase_order: row.name,
					action: "payment",
					pos_profile: props.posProfile,
					company: props.posProfile?.company,
					payments,
				},
			},
		});
		const entries = message?.payment_entries || [];
		paymentOrder.value = null;
		toastStore.show({
			title: entries.length
				? __("Payment created: {0}", [entries.join(", ")])
				: __("Payment completed"),
			color: "success",
		});
		await loadOrders();
	} catch (error) {
		console.error("Failed purchase payment", error);
		toastStore.show({ title: extractServerError(error), color: "error" });
	} finally {
		actionLoading.value = "";
	}
}

function receiptLabel(row) {
	if (row?.receipt_complete) return __("Received");
	if (row?.has_receipt) return __("Partial Receipt");
	return __("Pending");
}

function invoiceLabel(row) {
	if (row?.invoice_complete) return __("Billed");
	if (row?.has_invoice) return __("Partial Bill");
	return __("Pending");
}

function formatDate(value) {
	if (!value) return "";
	if (typeof frappe?.datetime?.str_to_user === "function") {
		return frappe.datetime.str_to_user(value);
	}
	return value;
}

function formatAmount(value) {
	const amount = Number(value || 0);
	return amount.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function currencySymbol(currency) {
	if (!currency) return "";
	if (typeof get_currency_symbol === "function") {
		return get_currency_symbol(currency);
	}
	return currency;
}

function extractServerError(error) {
	const parseServerMessages = (raw) => {
		if (!raw) return "";
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.length) {
				const first = parsed[0];
				if (typeof first === "string") {
					return first.replace(/<[^>]*>/g, "").trim();
				}
			}
		} catch {
			return String(raw);
		}
		return "";
	};

	return (
		parseServerMessages(error?._server_messages) ||
		parseServerMessages(error?.responseJSON?._server_messages) ||
		error?.message ||
		error?.responseJSON?.message ||
		__("Unable to complete purchase action")
	);
}
</script>

<style scoped>
.purchase-management-card {
	display: flex;
	flex-direction: column;
	max-height: min(92vh, 900px);
	background: var(--pos-surface-raised) !important;
	border: 1px solid var(--pos-border);
}

.purchase-management-card__title {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 16px 20px;
	border-bottom: 1px solid var(--pos-border);
}

.purchase-management-tabs {
	padding: 0 16px;
	background: color-mix(in srgb, var(--pos-surface-raised) 94%, rgb(var(--v-theme-primary)) 6%);
}

.purchase-management-card__body {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.purchase-management-filters {
	display: grid;
	grid-template-columns: minmax(180px, 1.5fr) minmax(150px, 1fr) minmax(150px, 1fr) 140px 140px auto;
	gap: 10px;
	align-items: center;
}

.purchase-management-summary {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.purchase-management-summary__tile {
	display: grid;
	gap: 2px;
	padding: 10px 12px;
	border: 1px solid var(--pos-border);
	border-radius: 8px;
	background: var(--pos-surface);
}

.purchase-management-summary__tile span {
	font-size: 0.75rem;
	color: var(--pos-text-muted);
}

.purchase-management-summary__tile strong {
	font-size: 1.05rem;
	color: var(--pos-text-primary);
}

.purchase-management-order {
	display: grid;
	gap: 2px;
	min-width: 180px;
}

.purchase-management-order span {
	font-size: 0.78rem;
	color: var(--pos-text-muted);
}

.purchase-management-actions {
	display: flex;
	justify-content: flex-end;
	gap: 6px;
	flex-wrap: wrap;
}

.purchase-management-preview {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 10px;
}

.purchase-management-preview > div {
	display: grid;
	gap: 2px;
	padding: 10px 12px;
	border-radius: 8px;
	border: 1px solid var(--pos-border);
	background: var(--pos-surface);
}

.purchase-management-preview span {
	font-size: 0.75rem;
	color: var(--pos-text-muted);
}

@media (max-width: 980px) {
	.purchase-management-card__title {
		align-items: flex-start;
		flex-direction: column;
	}

	.purchase-management-filters {
		grid-template-columns: 1fr 1fr;
	}

	.purchase-management-summary,
	.purchase-management-preview {
		grid-template-columns: 1fr;
	}
}
</style>
