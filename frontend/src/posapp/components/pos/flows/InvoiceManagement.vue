<template>
	<v-row justify="center">
		<v-dialog
			v-model="invoiceManagementDialog"
			:max-width="invoiceManagementDialogMaxWidth"
			:fullscreen="isCompactInvoiceManagement"
			:width="invoiceManagementDialogWidth"
			scrollable
			:theme="isDarkTheme ? 'dark' : 'light'"
			content-class="invoice-management-dialog-content"
		>
			<v-card
				:class="[
					'pos-themed-card invoice-management-card',
					isDarkTheme ? 'invoice-management-card--dark' : 'invoice-management-card--light',
				]"
				variant="flat"
			>
				<v-card-title class="invoice-management-header">
					<div>
						<div class="text-h5 text-primary">{{ __("Invoice Management") }}</div>
						<div class="text-subtitle-2 text-medium-emphasis">
							{{ __("Track recent sales, collect unpaid balances, and reopen saved work") }}
						</div>
					</div>
					<div class="d-flex align-center ga-2">
						<v-select
							v-if="im.isSupervisorScope()"
							v-model="im.selectedSupervisorPosProfile"
							class="supervisor-profile-select"
							variant="outlined"
							density="compact"
							hide-details
							:items="im.supervisorPosProfileItems"
							item-title="title"
							item-value="value"
							:label="__('POS Profile')"
						/>
						<div class="view-toggle-group">
							<v-btn
								:variant="im.viewMode === 'card' ? 'flat' : 'text'"
								:color="im.viewMode === 'card' ? 'primary' : undefined"
								size="small"
								prepend-icon="mdi-view-grid-outline"
								@click="im.viewMode = 'card'"
							>
								{{ __("Cards") }}
							</v-btn>
							<v-btn
								:variant="im.viewMode === 'list' ? 'flat' : 'text'"
								:color="im.viewMode === 'list' ? 'primary' : undefined"
								size="small"
								prepend-icon="mdi-format-list-bulleted"
								@click="im.viewMode = 'list'"
							>
								{{ __("List") }}
							</v-btn>
						</div>
						<v-btn
							color="primary"
							variant="text"
							prepend-icon="mdi-refresh"
							:loading="im.loading"
							@click="im.refreshActiveTab"
						>
							{{ __("Refresh") }}
						</v-btn>
						<v-btn
							icon="mdi-close"
							variant="text"
							:aria-label="__('Close invoice management')"
							@click="im.uiStore.closeInvoiceManagement()"
						/>
					</div>
				</v-card-title>

				<div class="invoice-tabs-shell">
					<v-tabs v-model="im.activeTab" color="primary" grow class="invoice-tabs">
						<v-tab value="history">
							<div class="invoice-tab-label">
								<span>{{ __("History") }}</span>
								<v-chip size="x-small" variant="flat" color="primary">{{
									im.filteredHistoryInvoices.length
								}}</v-chip>
							</div>
						</v-tab>
						<v-tab value="partial">
							<div class="invoice-tab-label">
								<span>{{ __("Unpaid") }}</span>
								<v-chip size="x-small" variant="flat" color="warning">{{
									im.filteredUnpaidInvoices.length
								}}</v-chip>
							</div>
						</v-tab>
						<v-tab value="drafts">
							<div class="invoice-tab-label">
								<span>{{ __("Drafts") }}</span>
								<v-chip size="x-small" variant="flat" color="secondary">{{
									im.filteredDraftInvoices.length
								}}</v-chip>
							</div>
						</v-tab>
						<v-tab value="returns">
							<div class="invoice-tab-label">
								<span>{{ __("Returns") }}</span>
								<v-chip size="x-small" variant="flat" color="error">{{
									im.filteredReturnInvoices.length
								}}</v-chip>
							</div>
						</v-tab>
					</v-tabs>
				</div>

				<v-divider />

				<v-card-text class="invoice-management-card__body">
					<v-window v-model="im.activeTab">
						<v-window-item value="history">
							<InvoiceManagementHistoryTab :im="im" />
						</v-window-item>
						<v-window-item value="partial">
							<InvoiceManagementUnpaidTab :im="im" />
						</v-window-item>
						<v-window-item value="drafts">
							<InvoiceManagementDraftsTab :im="im" />
						</v-window-item>
						<v-window-item value="returns">
							<InvoiceManagementReturnsTab :im="im" />
						</v-window-item>
					</v-window>
				</v-card-text>

				<v-card-actions class="invoice-management-footer">
					<v-btn color="error" variant="tonal" @click="im.uiStore.closeInvoiceManagement()">
						{{ __("Close") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>

	<InvoiceManagementDetailDialog
		v-if="selectedInvoiceDetailModel"
		v-model:detail-dialog="detailDialogModel"
		:is-dark-theme="isDarkTheme"
		:selected-invoice-detail="selectedInvoiceDetailModel"
		:detail-headers="im.detailHeaders"
		:payment-headers="im.paymentHeaders"
		:repair-change-loading="im.repairChangeLoading"
		:format-float="im.formatFloat"
		:format-currency="im.formatCurrency"
		:currency-symbol="im.currencySymbol"
		:format-date-time="im.formatDateTime"
		:status-color="im.statusColor"
		:change-allocation-repair-state="im.changeAllocationRepairState"
		:repair-state-label="im.repairStateLabel"
		:repair-state-color="im.repairStateColor"
		:is-repair-candidate="im.isRepairCandidate"
		:is-offline="im.isOffline"
		:repair-change-allocation="im.repairChangeAllocation"
		:open-add-payment="im.openAddPayment"
		:print-invoice="im.printInvoice"
	/>
</template>

<script setup lang="ts">
import { computed, unref } from "vue";
import { storeToRefs } from "pinia";
import { useTheme } from "../../../composables/core/useTheme";
import { useResponsive } from "../../../composables/core/useResponsive";
import { useUIStore } from "../../../stores/uiStore";
import { useInvoiceManagement } from "../../../composables/pos/flows/useInvoiceManagement";
import InvoiceManagementHistoryTab from "./invoice-management/InvoiceManagementHistoryTab.vue";
import InvoiceManagementUnpaidTab from "./invoice-management/InvoiceManagementUnpaidTab.vue";
import InvoiceManagementDraftsTab from "./invoice-management/InvoiceManagementDraftsTab.vue";
import InvoiceManagementReturnsTab from "./invoice-management/InvoiceManagementReturnsTab.vue";
import InvoiceManagementDetailDialog from "./invoice-management/InvoiceManagementDetailDialog.vue";
const uiStore = useUIStore();
const theme = useTheme();
const responsive = useResponsive();
const __ = (globalThis as any).__ || ((value: string) => value);
const im = useInvoiceManagement() as any;

const { invoiceManagementDialog } = storeToRefs(uiStore);
const isDarkTheme = theme.isDark;
const isCompactInvoiceManagement = computed(() => responsive.windowWidth.value < 1100);
const invoiceManagementDialogWidth = computed(() =>
	responsive.windowWidth.value < 600 ? "100vw" : "min(1420px, 97vw)",
);
const invoiceManagementDialogMaxWidth = computed(() =>
	responsive.windowWidth.value < 1100 ? "100vw" : "1420px",
);

const selectedInvoiceDetailModel = computed(() => unref(im.selectedInvoiceDetail) || null);
const detailDialogModel = computed({
	get: () => Boolean(unref(im.detailDialog) && selectedInvoiceDetailModel.value),
	set: (value) => {
		if (im.detailDialog && typeof im.detailDialog === "object" && "value" in im.detailDialog) {
			im.detailDialog.value = Boolean(value);
		} else {
			im.detailDialog = Boolean(value);
		}

		if (!value && im.selectedInvoiceDetail && typeof im.selectedInvoiceDetail === "object") {
			im.selectedInvoiceDetail.value = null;
		}
	},
});
</script>

<style scoped>
@import "./invoice-management/invoice-management.css";
</style>
