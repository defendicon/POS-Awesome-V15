<template>
	<v-dialog v-model="dialog" max-width="980" scrollable>
		<v-card class="purchase-drafts-card pos-themed-card">
			<v-card-title class="purchase-drafts-card__title">
				<div class="d-flex align-center ga-2">
					<v-icon color="primary" icon="mdi-file-document-edit-outline" />
					<span class="text-h6">{{ __("Select Draft Purchase Order") }}</span>
				</div>
				<v-btn
					icon="mdi-close"
					variant="text"
					:aria-label="__('Close')"
					@click="dialog = false"
				/>
			</v-card-title>

			<v-card-text class="purchase-drafts-card__body">
				<v-row dense class="mb-3">
					<v-col cols="12" md="4">
						<v-text-field
							v-model="filters.search"
							:label="__('PO or Supplier')"
							prepend-inner-icon="mdi-magnify"
							density="compact"
							variant="outlined"
							hide-details
							clearable
							class="pos-themed-input"
							@keydown.enter="searchDrafts"
						/>
					</v-col>
					<v-col cols="12" sm="6" md="3">
						<v-text-field
							v-model="filters.supplier"
							:label="__('Supplier')"
							prepend-inner-icon="mdi-account-hard-hat-outline"
							density="compact"
							variant="outlined"
							hide-details
							clearable
							class="pos-themed-input"
							@keydown.enter="searchDrafts"
						/>
					</v-col>
					<v-col cols="12" sm="6" md="3">
						<v-autocomplete
							v-model="filters.warehouse"
							:items="warehouseOptions"
							item-title="warehouse_name"
							item-value="name"
							:label="__('Warehouse')"
							prepend-inner-icon="mdi-warehouse"
							density="compact"
							variant="outlined"
							hide-details
							clearable
							class="pos-themed-input"
						/>
					</v-col>
					<v-col cols="12" md="2">
						<v-btn
							block
							color="primary"
							variant="tonal"
							prepend-icon="mdi-refresh"
							:loading="loading"
							:disabled="loading"
							@click="searchDrafts"
						>
							{{ __("Search") }}
						</v-btn>
					</v-col>
					<v-col cols="12" sm="6" md="3">
						<VueDatePicker
							v-model="filters.fromDate"
							model-type="format"
							format="dd-MM-yyyy"
							:enable-time-picker="false"
							auto-apply
							:placeholder="__('From Date')"
							class="pos-themed-input"
						/>
					</v-col>
					<v-col cols="12" sm="6" md="3">
						<VueDatePicker
							v-model="filters.toDate"
							model-type="format"
							format="dd-MM-yyyy"
							:enable-time-picker="false"
							auto-apply
							:placeholder="__('To Date')"
							class="pos-themed-input"
						/>
					</v-col>
				</v-row>

				<v-alert v-if="errorMessage" type="error" density="compact" class="mb-3">
					{{ errorMessage }}
				</v-alert>

				<v-data-table
					:headers="headers"
					:items="drafts"
					:loading="loading"
					item-key="name"
					density="compact"
					class="purchase-drafts-table"
					hover
				>
					<template #item.name="{ item }">
						<div class="purchase-drafts-order">
							<v-tooltip :text="__('View details')">
								<template #activator="{ props: tooltipProps }">
									<v-btn
										v-bind="tooltipProps"
										icon="mdi-information-outline"
										size="x-small"
										variant="text"
										color="info"
										:loading="previewName === item.name"
										:disabled="loadingSelected || previewLoading"
										:aria-label="__('View purchase order details')"
										@click.stop="previewDraft(item)"
									/>
								</template>
							</v-tooltip>
							<span class="font-weight-medium">{{ item.name }}</span>
						</div>
					</template>
					<template #item.transaction_date="{ item }">
						{{ formatDate(item.transaction_date) }}
					</template>
					<template #item.progress="{ item }">
						<div class="purchase-drafts-tags">
							<v-chip v-if="item.is_draft" size="x-small" color="grey" variant="tonal">
								{{ __("Draft") }}
							</v-chip>
							<v-chip
								v-if="item.has_receipt"
								size="x-small"
								:color="item.receipt_complete ? 'success' : 'warning'"
								variant="tonal"
							>
								{{ item.receipt_complete ? __("Receipt") : __("Partial Receipt") }}
							</v-chip>
							<v-chip
								v-if="item.has_invoice"
								size="x-small"
								:color="item.invoice_complete ? 'primary' : 'info'"
								variant="tonal"
							>
								{{ item.invoice_complete ? __("Bill") : __("Partial Bill") }}
							</v-chip>
						</div>
					</template>
					<template #item.grand_total="{ item }">
						<span class="font-weight-medium">
							{{ currencySymbol(item.currency) }} {{ formatAmount(item.grand_total) }}
						</span>
					</template>
					<template #item.actions="{ item }">
						<v-btn
							size="small"
							color="primary"
							variant="text"
							prepend-icon="mdi-folder-open-outline"
							:loading="selectedName === item.name"
							:disabled="loadingSelected"
							@click="selectDraft(item)"
						>
							{{ __("Load") }}
						</v-btn>
					</template>
					<template #no-data>
						<div class="purchase-drafts-empty">
							<v-icon icon="mdi-file-search-outline" size="32" color="medium-emphasis" />
							<span>{{ __("No draft purchase orders found") }}</span>
						</div>
					</template>
				</v-data-table>
			</v-card-text>

			<v-card-actions class="purchase-drafts-card__footer">
				<v-btn variant="text" @click="clearFilters">{{ __("Clear Filters") }}</v-btn>
				<v-spacer />
				<v-btn variant="tonal" color="error" @click="dialog = false">{{ __("Close") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>

	<v-dialog v-model="previewDialog" max-width="820" scrollable>
		<v-card class="purchase-preview-card pos-themed-card">
			<v-card-title class="purchase-preview-card__title">
				<div>
					<div class="text-h6">{{ previewDoc?.name || __("Purchase Order") }}</div>
					<div class="text-caption text-medium-emphasis">
						{{ previewDoc?.supplier_name || previewDoc?.supplier || "" }}
					</div>
				</div>
				<v-btn
					icon="mdi-close"
					variant="text"
					:aria-label="__('Close')"
					@click="previewDialog = false"
				/>
			</v-card-title>

			<v-card-text class="purchase-preview-card__body">
				<div v-if="previewDoc" class="purchase-preview-summary">
					<div>
						<span>{{ __("Date") }}</span>
						<strong>{{ formatDate(previewDoc.transaction_date) }}</strong>
					</div>
					<div>
						<span>{{ __("Required By") }}</span>
						<strong>{{ formatDate(previewDoc.schedule_date) }}</strong>
					</div>
					<div>
						<span>{{ __("Warehouse") }}</span>
						<strong>{{ previewDoc.set_warehouse || "-" }}</strong>
					</div>
					<div>
						<span>{{ __("Total") }}</span>
						<strong>
							{{ currencySymbol(previewDoc.currency) }} {{ formatAmount(previewDoc.grand_total) }}
						</strong>
					</div>
				</div>

				<div v-if="previewDoc" class="purchase-preview-tags">
					<v-chip v-if="previewDoc.is_draft" size="small" color="grey" variant="tonal">
						{{ __("Draft") }}
					</v-chip>
					<v-chip
						v-if="previewDoc.has_receipt"
						size="small"
						:color="previewDoc.receipt_complete ? 'success' : 'warning'"
						variant="tonal"
					>
						{{ previewDoc.receipt_complete ? __("Receipt Created") : __("Partial Receipt") }}
					</v-chip>
					<v-chip
						v-if="previewDoc.has_invoice"
						size="small"
						:color="previewDoc.invoice_complete ? 'primary' : 'info'"
						variant="tonal"
					>
						{{ previewDoc.invoice_complete ? __("Bill Created") : __("Partial Bill") }}
					</v-chip>
				</div>

				<v-data-table
					:headers="previewHeaders"
					:items="previewDoc?.items || []"
					density="compact"
					class="purchase-preview-table"
					hide-default-footer
					:items-per-page="-1"
				>
					<template #item.item_name="{ item }">
						<div class="py-1">
							<div class="font-weight-medium">{{ item.item_name || item.item_code }}</div>
							<div class="text-caption text-medium-emphasis">{{ item.item_code }}</div>
						</div>
					</template>
					<template #item.rate="{ item }">
						{{ currencySymbol(previewDoc?.currency) }} {{ formatAmount(item.rate) }}
					</template>
					<template #item.amount="{ item }">
						<strong>
							{{ currencySymbol(previewDoc?.currency) }}
							{{ formatAmount((Number(item.qty) || 0) * (Number(item.rate) || 0)) }}
						</strong>
					</template>
				</v-data-table>
			</v-card-text>

			<v-card-actions class="purchase-preview-card__footer">
				<v-btn variant="text" @click="previewDialog = false">{{ __("Close") }}</v-btn>
				<v-spacer />
				<v-btn
					color="primary"
					prepend-icon="mdi-folder-open-outline"
					:loading="loadingSelected"
					:disabled="!previewDoc || loadingSelected"
					@click="loadPreviewDraft"
				>
					{{ __("Load Draft") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";
import { normalizeDateForBackend } from "../../../format";

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

const emit = defineEmits(["update:modelValue", "select"]);

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

const drafts = ref([]);
const loading = ref(false);
const loadingSelected = ref(false);
const previewLoading = ref(false);
const selectedName = ref("");
const previewName = ref("");
const previewDialog = ref(false);
const previewDoc = ref(null);
const errorMessage = ref("");

const headers = [
	{ title: __("Purchase Order"), key: "name", align: "start", sortable: true },
	{ title: __("Supplier"), key: "supplier_name", align: "start", sortable: true },
	{ title: __("Date"), key: "transaction_date", align: "start", sortable: true },
	{ title: __("Progress"), key: "progress", align: "start", sortable: false },
	{ title: __("Warehouse"), key: "set_warehouse", align: "start", sortable: true },
	{ title: __("Amount"), key: "grand_total", align: "end", sortable: true },
	{ title: "", key: "actions", align: "end", sortable: false },
];

const previewHeaders = [
	{ title: __("Item"), key: "item_name", align: "start", sortable: false },
	{ title: __("UOM"), key: "uom", align: "center", sortable: false },
	{ title: __("Qty"), key: "qty", align: "center", sortable: false },
	{ title: __("Rate"), key: "rate", align: "end", sortable: false },
	{ title: __("Amount"), key: "amount", align: "end", sortable: false },
];

watch(dialog, (value) => {
	if (value) {
		searchDrafts();
	} else {
		errorMessage.value = "";
		selectedName.value = "";
	}
});

async function fetchDraftDoc(name) {
	const { message } = await frappe.call({
		method: "posawesome.posawesome.api.purchase_orders.get_draft_purchase_order",
		args: {
			purchase_order: name,
			pos_profile: props.posProfile,
			company: props.posProfile?.company,
		},
	});
	return message;
}

async function searchDrafts() {
	if (loading.value) return;

	loading.value = true;
	errorMessage.value = "";
	try {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.purchase_orders.search_draft_purchase_orders",
			args: {
				pos_profile: props.posProfile,
				company: props.posProfile?.company,
				search_text: filters.search || null,
				supplier: filters.supplier || null,
				warehouse: filters.warehouse || null,
				from_date: normalizeDateForBackend(filters.fromDate),
				to_date: normalizeDateForBackend(filters.toDate),
				limit: 50,
			},
		});
		drafts.value = Array.isArray(message) ? message : [];
	} catch (error) {
		console.error("Failed to search draft purchase orders", error);
		errorMessage.value = __("Unable to fetch draft purchase orders");
		drafts.value = [];
	} finally {
		loading.value = false;
	}
}

async function selectDraft(row) {
	if (!row?.name || loadingSelected.value) return;

	loadingSelected.value = true;
	selectedName.value = row.name;
	errorMessage.value = "";
	try {
		const draftDoc = await fetchDraftDoc(row.name);
		emit("select", draftDoc);
		dialog.value = false;
	} catch (error) {
		console.error("Failed to load draft purchase order", error);
		errorMessage.value = __("Unable to load the selected draft");
	} finally {
		loadingSelected.value = false;
		selectedName.value = "";
	}
}

async function previewDraft(row) {
	if (!row?.name || previewLoading.value) return;

	previewLoading.value = true;
	previewName.value = row.name;
	errorMessage.value = "";
	try {
		previewDoc.value = await fetchDraftDoc(row.name);
		previewDialog.value = true;
	} catch (error) {
		console.error("Failed to preview draft purchase order", error);
		errorMessage.value = __("Unable to show the selected draft details");
	} finally {
		previewLoading.value = false;
		previewName.value = "";
	}
}

function loadPreviewDraft() {
	if (!previewDoc.value || loadingSelected.value) return;

	emit("select", previewDoc.value);
	previewDialog.value = false;
	dialog.value = false;
}

function clearFilters() {
	filters.search = "";
	filters.supplier = "";
	filters.warehouse = null;
	filters.fromDate = null;
	filters.toDate = null;
	searchDrafts();
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
</script>

<style scoped>
.purchase-drafts-card {
	display: flex;
	flex-direction: column;
	max-height: min(90vh, 860px);
	background: var(--pos-surface-raised) !important;
	border: 1px solid var(--pos-border);
}

.purchase-drafts-card__title,
.purchase-drafts-card__footer {
	display: flex;
	align-items: center;
	gap: 12px;
	border-color: var(--pos-border);
}

.purchase-drafts-card__title {
	justify-content: space-between;
	padding: 16px 20px;
	border-bottom: 1px solid var(--pos-border);
}

.purchase-drafts-card__body {
	padding: 16px 20px;
	overflow: auto;
}

.purchase-drafts-card__footer {
	padding: 12px 20px;
	border-top: 1px solid var(--pos-border);
}

.purchase-drafts-table {
	border: 1px solid var(--pos-border);
	border-radius: 8px;
	overflow: hidden;
}

.purchase-drafts-order {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
}

.purchase-drafts-tags,
.purchase-preview-tags {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
}

.purchase-preview-tags {
	margin: -4px 0 14px;
}

.purchase-drafts-table :deep(.v-table),
.purchase-drafts-table :deep(.v-table__wrapper),
.purchase-drafts-table :deep(table),
.purchase-drafts-table :deep(thead),
.purchase-drafts-table :deep(tbody),
.purchase-drafts-table :deep(tr),
.purchase-drafts-table :deep(td),
.purchase-drafts-table :deep(th) {
	background: var(--pos-surface) !important;
	color: var(--pos-text-primary) !important;
}

.purchase-drafts-table :deep(th) {
	background: var(--pos-table-header-bg) !important;
}

.purchase-drafts-table :deep(tbody tr:hover) {
	background: var(--pos-table-row-hover) !important;
}

.purchase-drafts-empty {
	min-height: 150px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	color: var(--pos-text-muted);
}

.purchase-preview-card {
	display: flex;
	flex-direction: column;
	max-height: min(88vh, 780px);
	background: var(--pos-surface-raised) !important;
	border: 1px solid var(--pos-border);
}

.purchase-preview-card__title,
.purchase-preview-card__footer {
	display: flex;
	align-items: center;
	gap: 12px;
	border-color: var(--pos-border);
}

.purchase-preview-card__title {
	justify-content: space-between;
	padding: 16px 20px;
	border-bottom: 1px solid var(--pos-border);
}

.purchase-preview-card__body {
	padding: 16px 20px;
	overflow: auto;
}

.purchase-preview-card__footer {
	padding: 12px 20px;
	border-top: 1px solid var(--pos-border);
}

.purchase-preview-summary {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	margin-bottom: 14px;
}

.purchase-preview-summary > div {
	display: grid;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--pos-border);
	border-radius: 8px;
	background: var(--pos-surface);
}

.purchase-preview-summary span {
	font-size: 0.75rem;
	color: var(--pos-text-muted);
}

.purchase-preview-summary strong {
	font-size: 0.95rem;
	color: var(--pos-text-primary);
}

.purchase-preview-table {
	border: 1px solid var(--pos-border);
	border-radius: 8px;
	overflow: hidden;
}

.purchase-preview-table :deep(.v-table),
.purchase-preview-table :deep(.v-table__wrapper),
.purchase-preview-table :deep(table),
.purchase-preview-table :deep(thead),
.purchase-preview-table :deep(tbody),
.purchase-preview-table :deep(tr),
.purchase-preview-table :deep(td),
.purchase-preview-table :deep(th) {
	background: var(--pos-surface) !important;
	color: var(--pos-text-primary) !important;
}

.purchase-preview-table :deep(th) {
	background: var(--pos-table-header-bg) !important;
}

@media (max-width: 720px) {
	.purchase-preview-summary {
		grid-template-columns: 1fr 1fr;
	}
}
</style>
