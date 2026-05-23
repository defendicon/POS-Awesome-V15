<template>
	<v-dialog
		v-model="detailDialog"
		max-width="1040px"
		scrollable
		:theme="isDarkTheme ? 'dark' : 'light'"
	>
		<v-card
			:class="[
				'invoice-detail-card',
				isDarkTheme ? 'invoice-detail-card--dark' : 'invoice-detail-card--light',
			]"
		>
			<v-card-title class="d-flex align-center justify-space-between flex-wrap ga-3">
				<div>
					<div class="text-h6">{{ selectedInvoiceDetail?.name || __("Invoice Details") }}</div>
					<div class="text-subtitle-2 text-medium-emphasis">
						{{ selectedInvoiceDetail?.customer_name || selectedInvoiceDetail?.customer || "" }}
					</div>
				</div>
				<div class="d-flex align-center ga-2">
					<v-chip
						v-if="selectedInvoiceDetail?.status"
						size="small"
						:color="statusColor(selectedInvoiceDetail.status)"
						variant="tonal"
					>
						{{ __(selectedInvoiceDetail.status) }}
					</v-chip>
					<v-chip
						v-if="selectedInvoiceDetail && changeAllocationRepairState(selectedInvoiceDetail)"
						size="small"
						:color="repairStateColor(changeAllocationRepairState(selectedInvoiceDetail))"
						variant="flat"
					>
						{{ repairStateLabel(changeAllocationRepairState(selectedInvoiceDetail)) }}
					</v-chip>
					<v-btn
						icon="mdi-close"
						variant="text"
						:aria-label="__('Close invoice details dialog')"
						@click="detailDialog = false"
					/>
				</div>
			</v-card-title>
			<v-divider />
			<v-card-text v-if="selectedInvoiceDetail">
				<InvoiceManagementSummaryTiles :tiles="detailSummaryTiles" />
				<div class="detail-section__title">{{ __("Items") }}</div>
				<v-data-table
					:headers="detailHeaders"
					:items="selectedInvoiceDetail.items || []"
					item-value="item_code"
					:items-per-page="10"
					class="elevation-1"
				>
					<template #item.qty="{ item }">{{ formatFloat(item.qty || 0) }}</template>
					<template #item.rate="{ item }">
						{{ currencySymbol(selectedInvoiceDetail.currency) }}
						{{ formatCurrency(item.rate) }}
					</template>
					<template #item.amount="{ item }">
						{{ currencySymbol(selectedInvoiceDetail.currency) }}
						{{ formatCurrency(item.amount) }}
					</template>
				</v-data-table>
				<div class="detail-section__title mt-4">{{ __("Payment History") }}</div>
				<v-data-table
					:headers="paymentHeaders"
					:items="selectedInvoiceDetail.payments || []"
					item-value="mode_of_payment"
					:items-per-page="5"
					class="elevation-1"
				>
					<template #item.amount="{ item }">
						{{ currencySymbol(selectedInvoiceDetail.currency) }}
						{{ formatCurrency(item.amount || 0) }}
					</template>
				</v-data-table>
				<div
					v-if="
						!Array.isArray(selectedInvoiceDetail.payments) ||
						!selectedInvoiceDetail.payments.length
					"
					class="text-caption text-medium-emphasis mt-2"
				>
					{{ __("No payment rows available on this invoice.") }}
				</div>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn
					v-if="selectedInvoiceDetail && isRepairCandidate(selectedInvoiceDetail)"
					color="secondary"
					variant="text"
					prepend-icon="mdi-link-wrench"
					:loading="repairChangeLoading"
					:disabled="repairChangeLoading || isOffline()"
					@click="repairChangeAllocation(selectedInvoiceDetail)"
				>
					{{ __("Repair Change Allocation") }}
				</v-btn>
				<v-btn
					v-if="selectedInvoiceDetail && Number(selectedInvoiceDetail.outstanding_amount || 0) > 0"
					color="warning"
					variant="text"
					prepend-icon="mdi-cash-plus"
					@click="openAddPayment(selectedInvoiceDetail)"
				>
					{{ __("Add Payment") }}
				</v-btn>
				<v-btn
					v-if="selectedInvoiceDetail"
					color="primary"
					variant="text"
					prepend-icon="mdi-printer-outline"
					@click="printInvoice(selectedInvoiceDetail)"
				>
					{{ __("Print") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup>
/* global __ */
import { computed } from "vue";
import InvoiceManagementSummaryTiles from "./InvoiceManagementSummaryTiles.vue";

const detailDialog = defineModel("detailDialog", { required: true });

const {
	isDarkTheme,
	selectedInvoiceDetail,
	detailHeaders,
	paymentHeaders,
	repairChangeLoading,
	formatFloat,
	formatCurrency,
	currencySymbol,
	formatDateTime,
	statusColor,
	changeAllocationRepairState,
	repairStateLabel,
	repairStateColor,
	isRepairCandidate,
	isOffline,
	repairChangeAllocation,
	openAddPayment,
	printInvoice,
} = defineProps([
	"isDarkTheme",
	"selectedInvoiceDetail",
	"detailHeaders",
	"paymentHeaders",
	"repairChangeLoading",
	"formatFloat",
	"formatCurrency",
	"currencySymbol",
	"formatDateTime",
	"statusColor",
	"changeAllocationRepairState",
	"repairStateLabel",
	"repairStateColor",
	"isRepairCandidate",
	"isOffline",
	"repairChangeAllocation",
	"openAddPayment",
	"printInvoice",
]);

const detailSummaryTiles = computed(() => {
	const detail = selectedInvoiceDetail;
	if (!detail) return [];
	return [
		{
			key: "posting",
			label: __("Posting"),
			value: formatDateTime(detail.posting_date, detail.posting_time),
		},
		{
			key: "grand-total",
			label: __("Grand Total"),
			value: `${currencySymbol(detail.currency)} ${formatCurrency(detail.grand_total)}`,
		},
		{
			key: "outstanding",
			label: __("Outstanding"),
			value: `${currencySymbol(detail.currency)} ${formatCurrency(detail.outstanding_amount || 0)}`,
		},
		{
			key: "items",
			label: __("Items"),
			value: (detail.items || []).length,
		},
	];
});

</script>
