<template>
	<v-row justify="center">
		<v-dialog
			v-model="invoiceManagementDialog"
			max-width="1380px"
			scrollable
			:theme="isDarkTheme ? 'dark' : 'light'"
			content-class="invoice-management-dialog-content"
		>
			<v-card :class="['pos-themed-card invoice-management-card', isDarkTheme ? 'invoice-management-card--dark' : 'invoice-management-card--light']" variant="flat">
				<v-card-title class="invoice-management-header">
					<div>
						<div class="text-h5 text-primary">{{ __("Invoice Management") }}</div>
						<div class="text-subtitle-2 text-medium-emphasis">
							{{ __("Track recent sales, collect unpaid balances, and reopen saved work") }}
						</div>
					</div>
					<div class="d-flex align-center ga-2">
						<v-btn
							color="primary"
							variant="text"
							prepend-icon="mdi-refresh"
							:loading="loading"
							@click="refreshActiveTab"
						>
							{{ __("Refresh") }}
						</v-btn>
						<v-btn icon="mdi-close" variant="text" @click="uiStore.closeInvoiceManagement()" />
					</div>
				</v-card-title>

				<div class="invoice-tabs-shell">
					<v-tabs v-model="activeTab" color="primary" grow class="invoice-tabs">
						<v-tab value="history">
							<div class="invoice-tab-label">
								<span>{{ __("History") }}</span>
								<v-chip size="x-small" variant="flat" color="primary">{{ filteredHistoryInvoices.length }}</v-chip>
							</div>
						</v-tab>
						<v-tab value="partial">
							<div class="invoice-tab-label">
								<span>{{ __("Unpaid") }}</span>
								<v-chip size="x-small" variant="flat" color="warning">{{ filteredUnpaidInvoices.length }}</v-chip>
							</div>
						</v-tab>
						<v-tab value="drafts">
							<div class="invoice-tab-label">
								<span>{{ __("Drafts") }}</span>
								<v-chip size="x-small" variant="flat" color="secondary">{{ filteredDraftInvoices.length }}</v-chip>
							</div>
						</v-tab>
						<v-tab value="returns">
							<div class="invoice-tab-label">
								<span>{{ __("Returns") }}</span>
								<v-chip size="x-small" variant="flat" color="error">{{ filteredReturnInvoices.length }}</v-chip>
							</div>
						</v-tab>
					</v-tabs>
				</div>

				<v-divider />

				<v-card-text class="invoice-management-card__body">
					<v-window v-model="activeTab">
						<v-window-item value="history">
							<div class="filter-grid mb-4">
								<v-text-field
									v-model="historySearch"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									:label="__('Search invoices or customers')"
								/>
								<v-select
									v-model="historyStatus"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:items="historyStatusItems"
									:label="__('Status')"
								/>
								<v-text-field
									v-model="historyDateFrom"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('From Date')"
								/>
								<v-text-field
									v-model="historyDateTo"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('To Date')"
								/>
							</div>

							<div class="summary-grid mb-4">
								<div class="summary-tile summary-tile--history">
									<div class="summary-tile__label">{{ __("Invoices") }}</div>
									<div class="summary-tile__value">{{ filteredHistoryInvoices.length }}</div>
									<div class="summary-tile__meta">{{ __("Completed and active sales in this range") }}</div>
								</div>
								<div class="summary-tile summary-tile--primary">
									<div class="summary-tile__label">{{ __("Gross Sales") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }} {{ formatCurrency(historyTotals.gross) }}
									</div>
									<div class="summary-tile__meta">{{ __("Before any return workflow") }}</div>
								</div>
								<div class="summary-tile summary-tile--success">
									<div class="summary-tile__label">{{ __("Collected") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }} {{ formatCurrency(historyTotals.paid) }}
									</div>
									<div class="summary-tile__meta">{{ __("Paid directly on invoices") }}</div>
								</div>
								<div class="summary-tile summary-tile--warning">
									<div class="summary-tile__label">{{ __("Outstanding") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }} {{ formatCurrency(historyTotals.outstanding) }}
									</div>
									<div class="summary-tile__meta">{{ __("Balances still pending") }}</div>
								</div>
							</div>

							<div v-if="loading && activeTab === 'history'" class="tab-loader">
								<v-progress-circular indeterminate color="primary" size="28" width="3" />
								<span>{{ __("Loading invoice history...") }}</span>
							</div>

							<div v-else-if="!filteredHistoryInvoices.length" class="empty-state">
								<v-icon size="42" color="medium-emphasis">mdi-receipt-text-clock-outline</v-icon>
								<div class="empty-state__title">{{ __("No invoices found") }}</div>
								<div class="empty-state__subtitle">
									{{ __("Try changing the date range or status filter.") }}
								</div>
							</div>

							<div v-else class="invoice-record-grid invoice-record-grid--history">
								<v-card
									v-for="invoice in filteredHistoryInvoices"
									:key="invoice.name"
									:class="['invoice-record-card', `invoice-record-card--${toneFromStatus(invoice.status)}`]"
									variant="flat"
								>
									<div class="invoice-record-card__hero">
										<div>
											<div class="invoice-record-card__title-row">
												<div class="invoice-record-card__title">{{ invoice.name }}</div>
												<v-chip size="small" :color="statusColor(invoice.status)" variant="flat">
													{{ __(invoice.status || "Draft") }}
												</v-chip>
											</div>
											<div class="invoice-record-card__subtitle">
												{{ invoice.customer_name || invoice.customer || __("Walk-in Customer") }}
											</div>
										</div>
										<div class="invoice-record-card__amount-block">
											<div class="invoice-record-card__amount-label">{{ __("Grand Total") }}</div>
											<div class="invoice-record-card__amount">
												{{ currencySymbol(invoice.currency) }} {{ formatCurrency(invoice.grand_total) }}
											</div>
										</div>
									</div>

									<div class="invoice-record-card__content">
										<div class="meta-pair-grid">
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Posting") }}</div>
												<div class="meta-pair__value">{{ formatDateTime(invoice.posting_date, invoice.posting_time) }}</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Collected") }}</div>
												<div class="meta-pair__value meta-pair__value--success">
													{{ currencySymbol(invoice.currency) }} {{ formatCurrency(invoice.paid_amount || 0) }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Outstanding") }}</div>
												<div class="meta-pair__value" :class="{ 'meta-pair__value--warning': Number(invoice.outstanding_amount || 0) > 0 }">
													{{ currencySymbol(invoice.currency) }} {{ formatCurrency(invoice.outstanding_amount || 0) }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Payment State") }}</div>
												<div class="meta-pair__value">{{ __(invoice.status || "Draft") }}</div>
											</div>
										</div>
									</div>

									<div class="invoice-record-card__actions">
										<v-btn icon="mdi-eye-outline" size="small" variant="text" :title="__('View Details')" @click="viewInvoice(invoice)" />
										<v-btn icon="mdi-printer-outline" size="small" variant="text" :title="__('Print')" @click="printInvoice(invoice)" />
										<v-btn
											v-if="posProfile?.posa_allow_return == 1"
											icon="mdi-backup-restore"
											size="small"
											variant="text"
											color="warning"
											:title="__('Create Return')"
											@click="createReturn(invoice)"
										/>
									</div>
								</v-card>
							</div>
						</v-window-item>

						<v-window-item value="partial">
							<div class="filter-grid mb-4">
								<v-text-field
									v-model="partialSearch"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									:label="__('Search unpaid invoices or customers')"
								/>
								<v-select
									v-model="partialStatus"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:items="partialStatusItems"
									:label="__('Payment Status')"
								/>
								<v-text-field
									v-model="partialDateFrom"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('From Date')"
								/>
								<v-text-field
									v-model="partialDateTo"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('To Date')"
								/>
							</div>

							<div class="status-strip mb-4">
								<v-btn :variant="partialStatus === 'All' ? 'flat' : 'outlined'" :color="partialStatus === 'All' ? 'warning' : undefined" size="small" @click="partialStatus = 'All'">
									{{ __("All") }} ({{ unpaidStatusCounts.all }})
								</v-btn>
								<v-btn :variant="partialStatus === 'Partly Paid' ? 'flat' : 'outlined'" :color="partialStatus === 'Partly Paid' ? 'warning' : undefined" size="small" @click="partialStatus = 'Partly Paid'">
									{{ __("Partly Paid") }} ({{ unpaidStatusCounts.partial }})
								</v-btn>
								<v-btn :variant="partialStatus === 'Unpaid' ? 'flat' : 'outlined'" :color="partialStatus === 'Unpaid' ? 'warning' : undefined" size="small" @click="partialStatus = 'Unpaid'">
									{{ __("Unpaid") }} ({{ unpaidStatusCounts.unpaid }})
								</v-btn>
								<v-btn :variant="partialStatus === 'Overdue' ? 'flat' : 'outlined'" :color="partialStatus === 'Overdue' ? 'error' : undefined" size="small" @click="partialStatus = 'Overdue'">
									{{ __("Overdue") }} ({{ unpaidStatusCounts.overdue }})
								</v-btn>
							</div>

							<div class="summary-grid mb-4">
								<div class="summary-tile summary-tile--warning">
									<div class="summary-tile__label">{{ __("Invoices") }}</div>
									<div class="summary-tile__value">{{ filteredUnpaidSummary.count }}</div>
									<div class="summary-tile__meta">{{ __("Invoices still carrying balances") }}</div>
								</div>
								<div class="summary-tile summary-tile--success">
									<div class="summary-tile__label">{{ __("Paid") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }} {{ formatCurrency(filteredUnpaidSummary.total_paid) }}
									</div>
									<div class="summary-tile__meta">{{ __("Amount already received") }}</div>
								</div>
								<div class="summary-tile summary-tile--warning-strong">
									<div class="summary-tile__label">{{ __("Outstanding") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }} {{ formatCurrency(filteredUnpaidSummary.total_outstanding) }}
									</div>
									<div class="summary-tile__meta">{{ __("Open balance to collect") }}</div>
								</div>
								<div class="summary-tile summary-tile--danger">
									<div class="summary-tile__label">{{ __("Overdue") }}</div>
									<div class="summary-tile__value">{{ filteredUnpaidSummary.overdue_count }}</div>
									<div class="summary-tile__meta">{{ __("Invoices already past due date") }}</div>
								</div>
							</div>

							<v-alert v-if="isOffline()" type="warning" variant="tonal" density="compact" class="mb-4">
								{{ __("You are offline. Add Payment will work again when the connection is restored.") }}
							</v-alert>

							<div v-if="loading && activeTab === 'partial'" class="tab-loader">
								<v-progress-circular indeterminate color="warning" size="28" width="3" />
								<span>{{ __("Loading unpaid invoices...") }}</span>
							</div>

							<div v-else-if="!filteredUnpaidInvoices.length" class="empty-state">
								<v-icon size="42" color="success">mdi-cash-check</v-icon>
								<div class="empty-state__title">{{ __("No unpaid invoices") }}</div>
								<div class="empty-state__subtitle">{{ __("All visible invoices are fully settled.") }}</div>
							</div>

							<div v-else class="invoice-record-grid invoice-record-grid--unpaid">
								<v-card
									v-for="invoice in filteredUnpaidInvoices"
									:key="invoice.name"
									:class="['invoice-record-card', 'invoice-record-card--unpaid', `invoice-record-card--${toneFromStatus(invoice.status)}`]"
									variant="flat"
								>
									<div class="invoice-record-card__hero invoice-record-card__hero--warm">
										<div>
											<div class="invoice-record-card__title-row">
												<div class="invoice-record-card__title">{{ invoice.name }}</div>
												<v-chip size="small" :color="statusColor(invoice.status)" variant="flat">
													{{ __(invoice.status || "Unpaid") }}
												</v-chip>
											</div>
											<div class="invoice-record-card__subtitle">
												{{ invoice.customer_name || invoice.customer || __("Walk-in Customer") }}
											</div>
										</div>
										<div class="d-flex flex-column align-end ga-2">
											<v-chip size="small" :color="dueTone(invoice)" variant="tonal">
												{{ dueLabel(invoice) }}
											</v-chip>
											<div class="invoice-record-card__amount-block">
												<div class="invoice-record-card__amount-label">{{ __("Outstanding") }}</div>
												<div class="invoice-record-card__amount">
													{{ currencySymbol(invoice.currency) }} {{ formatCurrency(invoice.outstanding_amount || 0) }}
												</div>
											</div>
										</div>
									</div>

									<div class="invoice-record-card__content">
										<div class="meta-pair-grid meta-pair-grid--compact">
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Posting") }}</div>
												<div class="meta-pair__value">{{ formatDateTime(invoice.posting_date, invoice.posting_time) }}</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Due Date") }}</div>
												<div class="meta-pair__value">{{ formatDateForDisplay(invoice.due_date) || "-" }}</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Grand Total") }}</div>
												<div class="meta-pair__value">
													{{ currencySymbol(invoice.currency) }} {{ formatCurrency(invoice.grand_total) }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Paid") }}</div>
												<div class="meta-pair__value meta-pair__value--success">
													{{ currencySymbol(invoice.currency) }} {{ formatCurrency(invoice.paid_amount || 0) }}
												</div>
											</div>
										</div>

										<div class="payment-progress-block">
											<div class="payment-progress-block__labels">
												<span>{{ __("Payment Progress") }}</span>
												<span>{{ formatFloat(paymentProgress(invoice)) }}%</span>
											</div>
											<v-progress-linear :model-value="paymentProgress(invoice)" color="success" bg-color="grey-lighten-2" height="8" rounded />
										</div>
									</div>

									<div class="invoice-record-card__actions">
										<v-btn prepend-icon="mdi-cash-plus" size="small" variant="flat" color="warning" :disabled="isOffline()" @click="openAddPayment(invoice)">
											{{ __("Add Payment") }}
										</v-btn>
										<v-btn icon="mdi-eye-outline" size="small" variant="text" :title="__('View Details')" @click="viewInvoice(invoice)" />
										<v-btn icon="mdi-printer-outline" size="small" variant="text" :title="__('Print')" @click="printInvoice(invoice)" />
									</div>
								</v-card>
							</div>
						</v-window-item>

						<v-window-item value="drafts">
							<div class="filter-grid mb-4">
								<v-text-field
									v-model="draftSearch"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									:label="__('Search drafts or customers')"
								/>
								<v-text-field
									v-model="draftDateFrom"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('From Date')"
								/>
								<v-text-field
									v-model="draftDateTo"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('To Date')"
								/>
							</div>
							<v-data-table :headers="draftHeaders" :items="filteredDraftInvoices" :loading="loading && activeTab === 'drafts'" item-value="name" class="elevation-1" :items-per-page="10">
								<template #item.posting_date="{ item }">{{ formatDateTime(item.posting_date, item.posting_time) }}</template>
								<template #item.grand_total="{ item }">{{ currencySymbol(item.currency) }} {{ formatCurrency(item.grand_total) }}</template>
								<template #item.actions="{ item }">
									<div class="d-flex justify-end ga-1">
										<v-btn icon="mdi-folder-open-outline" variant="text" size="small" color="primary" :title="__('Load Draft')" @click="loadDraft(item)" />
										<v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" :title="__('Delete Draft')" @click="deleteDraft(item)" />
									</div>
								</template>
							</v-data-table>
						</v-window-item>

						<v-window-item value="returns">
							<div class="filter-grid mb-4">
								<v-text-field
									v-model="returnSearch"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									:label="__('Search return invoices or customers')"
								/>
								<v-text-field
									v-model="returnDateFrom"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('From Date')"
								/>
								<v-text-field
									v-model="returnDateTo"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('To Date')"
								/>
							</div>
							<v-data-table :headers="returnHeaders" :items="filteredReturnInvoices" :loading="loading && activeTab === 'returns'" item-value="name" class="elevation-1" :items-per-page="10">
								<template #item.posting_date="{ item }">{{ formatDateTime(item.posting_date, item.posting_time) }}</template>
								<template #item.grand_total="{ item }">{{ currencySymbol(item.currency) }} {{ formatCurrency(item.grand_total) }}</template>
								<template #item.return_against="{ item }">{{ item.return_against || "-" }}</template>
								<template #item.actions="{ item }">
									<div class="d-flex justify-end ga-1">
										<v-btn icon="mdi-eye-outline" variant="text" size="small" :title="__('View Details')" @click="viewInvoice(item)" />
										<v-btn icon="mdi-printer-outline" variant="text" size="small" :title="__('Print')" @click="printInvoice(item)" />
									</div>
								</template>
							</v-data-table>
						</v-window-item>
					</v-window>
				</v-card-text>
			</v-card>
		</v-dialog>
	</v-row>

	<v-dialog v-model="detailDialog" max-width="1040px" scrollable :theme="isDarkTheme ? 'dark' : 'light'">
		<v-card :class="['invoice-detail-card', isDarkTheme ? 'invoice-detail-card--dark' : 'invoice-detail-card--light']">
			<v-card-title class="d-flex align-center justify-space-between flex-wrap ga-3">
				<div>
					<div class="text-h6">{{ selectedInvoiceDetail?.name || __("Invoice Details") }}</div>
					<div class="text-subtitle-2 text-medium-emphasis">{{ selectedInvoiceDetail?.customer_name || selectedInvoiceDetail?.customer || "" }}</div>
				</div>
				<div class="d-flex align-center ga-2">
					<v-chip v-if="selectedInvoiceDetail?.status" size="small" :color="statusColor(selectedInvoiceDetail.status)" variant="tonal">{{ __(selectedInvoiceDetail.status) }}</v-chip>
					<v-btn icon="mdi-close" variant="text" @click="detailDialog = false" />
				</div>
			</v-card-title>
			<v-divider />
			<v-card-text v-if="selectedInvoiceDetail">
				<div class="summary-grid mb-4">
					<div class="summary-tile"><div class="summary-tile__label">{{ __("Posting") }}</div><div class="summary-tile__value">{{ formatDateTime(selectedInvoiceDetail.posting_date, selectedInvoiceDetail.posting_time) }}</div></div>
					<div class="summary-tile"><div class="summary-tile__label">{{ __("Grand Total") }}</div><div class="summary-tile__value">{{ currencySymbol(selectedInvoiceDetail.currency) }} {{ formatCurrency(selectedInvoiceDetail.grand_total) }}</div></div>
					<div class="summary-tile"><div class="summary-tile__label">{{ __("Outstanding") }}</div><div class="summary-tile__value">{{ currencySymbol(selectedInvoiceDetail.currency) }} {{ formatCurrency(selectedInvoiceDetail.outstanding_amount || 0) }}</div></div>
					<div class="summary-tile"><div class="summary-tile__label">{{ __("Items") }}</div><div class="summary-tile__value">{{ (selectedInvoiceDetail.items || []).length }}</div></div>
				</div>
				<div class="detail-section__title">{{ __("Items") }}</div>
				<v-data-table :headers="detailHeaders" :items="selectedInvoiceDetail.items || []" item-value="item_code" :items-per-page="10" class="elevation-1">
					<template #item.qty="{ item }">{{ formatFloat(item.qty || 0) }}</template>
					<template #item.rate="{ item }">{{ currencySymbol(selectedInvoiceDetail.currency) }} {{ formatCurrency(item.rate) }}</template>
					<template #item.amount="{ item }">{{ currencySymbol(selectedInvoiceDetail.currency) }} {{ formatCurrency(item.amount) }}</template>
				</v-data-table>
				<div class="detail-section__title mt-4">{{ __("Payment History") }}</div>
				<v-data-table :headers="paymentHeaders" :items="selectedInvoiceDetail.payments || []" item-value="mode_of_payment" :items-per-page="5" class="elevation-1">
					<template #item.amount="{ item }">{{ currencySymbol(selectedInvoiceDetail.currency) }} {{ formatCurrency(item.amount || 0) }}</template>
				</v-data-table>
				<div v-if="!Array.isArray(selectedInvoiceDetail.payments) || !selectedInvoiceDetail.payments.length" class="text-caption text-medium-emphasis mt-2">{{ __("No payment rows available on this invoice.") }}</div>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn v-if="selectedInvoiceDetail && Number(selectedInvoiceDetail.outstanding_amount || 0) > 0" color="warning" variant="text" prepend-icon="mdi-cash-plus" @click="openAddPayment(selectedInvoiceDetail)">{{ __("Add Payment") }}</v-btn>
				<v-btn v-if="selectedInvoiceDetail" color="primary" variant="text" prepend-icon="mdi-printer-outline" @click="printInvoice(selectedInvoiceDetail)">{{ __("Print") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
import { inject } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import format from "../../../format";
import { useTheme } from "../../../composables/core/useTheme";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { useCustomersStore } from "../../../stores/customersStore";
import { appendDebugPrintParam, isDebugPrintEnabled, silentPrint, watchPrintWindow } from "../../../plugins/print";
import { printDocumentViaQz } from "../../../services/qzTray";
import { isOffline } from "../../../../offline/index";

export default {
	mixins: [format],
	setup() {
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const customersStore = useCustomersStore();
		const toastStore = useToastStore();
		const router = useRouter();
		const theme = useTheme();
		const eventBus = inject("eventBus");
		const { invoiceManagementDialog, posProfile, posOpeningShift } = storeToRefs(uiStore);
		return { uiStore, invoiceStore, customersStore, toastStore, router, eventBus, invoiceManagementDialog, posProfile, posOpeningShift, isDarkTheme: theme.isDark, isOffline };
	},
	data: () => ({
		activeTab: "history",
		loading: false,
		partialSearch: "",
		partialStatus: "All",
		partialDateFrom: "",
		partialDateTo: "",
		historySearch: "",
		historyStatus: "All",
		historyDateFrom: "",
		historyDateTo: "",
		draftSearch: "",
		draftDateFrom: "",
		draftDateTo: "",
		returnSearch: "",
		returnDateFrom: "",
		returnDateTo: "",
		unpaidInvoices: [],
		historyInvoices: [],
		draftInvoices: [],
		detailDialog: false,
		selectedInvoiceDetail: null,
		partialStatusItems: ["All", "Partly Paid", "Unpaid", "Overdue"],
		historyStatusItems: ["All", "Paid", "Partly Paid", "Unpaid", "Overdue", "Credit Note Issued"],
		draftHeaders: [{ title: __("Invoice"), key: "name" }, { title: __("Customer"), key: "customer_name" }, { title: __("Posting"), key: "posting_date" }, { title: __("Total"), key: "grand_total", align: "end" }, { title: __("Actions"), key: "actions", align: "end", sortable: false }],
		returnHeaders: [{ title: __("Invoice"), key: "name" }, { title: __("Customer"), key: "customer_name" }, { title: __("Posting"), key: "posting_date" }, { title: __("Against"), key: "return_against" }, { title: __("Total"), key: "grand_total", align: "end" }, { title: __("Actions"), key: "actions", align: "end", sortable: false }],
		detailHeaders: [{ title: __("Item"), key: "item_name" }, { title: __("Code"), key: "item_code" }, { title: __("Qty"), key: "qty", align: "end" }, { title: __("Rate"), key: "rate", align: "end" }, { title: __("Amount"), key: "amount", align: "end" }],
		paymentHeaders: [{ title: __("Mode"), key: "mode_of_payment" }, { title: __("Amount"), key: "amount", align: "end" }, { title: __("Account"), key: "account" }],
	}),
	computed: {
		currentInvoiceDoctype() { return this.posProfile?.create_pos_invoice_instead_of_sales_invoice ? "POS Invoice" : "Sales Invoice"; },
		filteredUnpaidInvoices() { return this.filterCollection(this.unpaidInvoices, this.partialSearch, this.partialStatus, this.partialDateFrom, this.partialDateTo); },
		filteredHistoryInvoices() { return this.filterCollection(this.historyInvoices.filter((d) => !d.is_return), this.historySearch, this.historyStatus, this.historyDateFrom, this.historyDateTo); },
		filteredDraftInvoices() { return this.filterCollection(this.draftInvoices, this.draftSearch, "All", this.draftDateFrom, this.draftDateTo); },
		filteredReturnInvoices() { return this.filterCollection(this.historyInvoices.filter((d) => d.is_return), this.returnSearch, "All", this.returnDateFrom, this.returnDateTo); },
		filteredUnpaidSummary() {
			return this.filteredUnpaidInvoices.reduce((accumulator, invoice) => {
				accumulator.count += 1;
				accumulator.total_paid += Number(invoice.paid_amount || 0);
				accumulator.total_outstanding += Number(invoice.outstanding_amount || 0);
				if (this.isOverdue(invoice)) accumulator.overdue_count += 1;
				return accumulator;
			}, { count: 0, total_paid: 0, total_outstanding: 0, overdue_count: 0 });
		},
		historyTotals() {
			return this.filteredHistoryInvoices.reduce((accumulator, invoice) => {
				accumulator.gross += Number(invoice.grand_total || 0);
				accumulator.paid += Number(invoice.paid_amount || 0);
				accumulator.outstanding += Number(invoice.outstanding_amount || 0);
				return accumulator;
			}, { gross: 0, paid: 0, outstanding: 0 });
		},
		unpaidStatusCounts() {
			return this.unpaidInvoices.reduce((accumulator, invoice) => {
				accumulator.all += 1;
				const status = String(invoice.status || "");
				if (status === "Partly Paid") accumulator.partial += 1;
				if (status === "Unpaid") accumulator.unpaid += 1;
				if (this.isOverdue(invoice)) accumulator.overdue += 1;
				return accumulator;
			}, { all: 0, partial: 0, unpaid: 0, overdue: 0 });
		},
	},
	watch: {
		invoiceManagementDialog(value) {
			if (value) this.refreshAll();
		},
		activeTab() {
			this.refreshActiveTab();
		},
	},
	methods: {
		normalizeDate(value) { return value ? String(value).slice(0, 10) : ""; },
		inRange(date, fromDate, toDate) {
			const value = this.normalizeDate(date);
			if (fromDate && value < fromDate) return false;
			if (toDate && value > toDate) return false;
			return true;
		},
		filterCollection(items, search, status, fromDate, toDate) {
			const needle = String(search || "").trim().toLowerCase();
			return items.filter((item) => {
				if (needle) {
					const haystack = [item.name, item.customer, item.customer_name, item.return_against, item.status].filter(Boolean).map((entry) => String(entry).toLowerCase());
					if (!haystack.some((entry) => entry.includes(needle))) return false;
				}
				if (status && status !== "All" && String(item.status || "") !== status) return false;
				return this.inRange(item.posting_date, this.normalizeDate(fromDate), this.normalizeDate(toDate));
			});
		},
		formatDateForDisplay(date) {
			if (!date) return "";
			const parts = String(date).split("-");
			return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : date;
		},
		formatDateTime(date, time) {
			const formattedDate = this.formatDateForDisplay(date);
			const formattedTime = time ? String(time).split(".")[0] : "";
			return [formattedDate, formattedTime].filter(Boolean).join(" ");
		},
		statusColor(status) {
			const value = String(status || "").toLowerCase();
			if (value === "paid") return "success";
			if (value.includes("partly")) return "warning";
			if (value.includes("overdue")) return "error";
			if (value.includes("credit")) return "info";
			return "primary";
		},
		toneFromStatus(status) {
			const value = String(status || "").toLowerCase();
			if (value === "paid") return "success";
			if (value.includes("partly")) return "warning";
			if (value.includes("overdue")) return "error";
			if (value.includes("credit")) return "info";
			return "primary";
		},
		isOverdue(invoice) {
			const status = String(invoice?.status || "").toLowerCase();
			if (status.includes("overdue")) return true;
			const dueDate = this.normalizeDate(invoice?.due_date);
			if (!dueDate) return false;
			const today = frappe.datetime.get_today();
			return dueDate < today && Number(invoice?.outstanding_amount || 0) > 0;
		},
		dueTone(invoice) {
			if (!invoice?.due_date) return "default";
			return this.isOverdue(invoice) ? "error" : "warning";
		},
		dueLabel(invoice) {
			if (!invoice?.due_date) return __("No due date");
			if (this.isOverdue(invoice)) return __("Overdue");
			return __("Due {0}", [this.formatDateForDisplay(invoice.due_date)]);
		},
		paymentProgress(invoice) {
			const grandTotal = Number(invoice?.grand_total || 0);
			if (!grandTotal) return 0;
			return Math.max(0, Math.min(100, (Number(invoice?.paid_amount || 0) / grandTotal) * 100));
		},
		async refreshAll() { await Promise.all([this.loadUnpaidInvoices(), this.loadHistory(), this.loadDrafts()]); },
		async refreshActiveTab() {
			if (!this.invoiceManagementDialog) return;
			if (this.activeTab === "drafts") return this.loadDrafts();
			if (this.activeTab === "partial") return this.loadUnpaidInvoices();
			return this.loadHistory();
		},
		async loadUnpaidInvoices() {
			if (!this.posProfile?.name) return void (this.unpaidInvoices = []);
			this.loading = true;
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: this.currentInvoiceDoctype,
						filters: { pos_profile: this.posProfile.name, docstatus: 1, is_return: 0, outstanding_amount: [">", 0] },
						fields: ["name", "customer", "customer_name", "posting_date", "posting_time", "due_date", "grand_total", "paid_amount", "outstanding_amount", "status", "currency"],
						order_by: "modified desc",
						limit_page_length: 200,
					},
				});
				this.unpaidInvoices = Array.isArray(message) ? message.map((entry) => ({ ...entry, doctype: this.currentInvoiceDoctype })) : [];
			} catch (error) {
				console.error("Error loading unpaid invoices:", error);
				this.toastStore.show({ title: __("Unable to fetch unpaid invoices"), color: "error" });
			} finally {
				this.loading = false;
			}
		},
		async loadHistory() {
			if (!this.posProfile?.name) return void (this.historyInvoices = []);
			this.loading = true;
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: this.currentInvoiceDoctype,
						filters: { pos_profile: this.posProfile.name, docstatus: 1 },
						fields: ["name", "customer", "customer_name", "posting_date", "posting_time", "grand_total", "paid_amount", "outstanding_amount", "status", "is_return", "return_against", "currency"],
						order_by: "modified desc",
						limit_page_length: 300,
					},
				});
				this.historyInvoices = Array.isArray(message) ? message.map((entry) => ({ ...entry, doctype: this.currentInvoiceDoctype })) : [];
			} catch (error) {
				console.error("Error loading invoice history:", error);
				this.toastStore.show({ title: __("Unable to fetch invoice history"), color: "error" });
			} finally {
				this.loading = false;
			}
		},
		async loadDrafts() {
			if (!this.posOpeningShift?.name) return void (this.draftInvoices = []);
			this.loading = true;
			try {
				const { message } = await frappe.call({ method: "posawesome.posawesome.api.invoices.get_draft_invoices", args: { pos_opening_shift: this.posOpeningShift.name, doctype: this.currentInvoiceDoctype } });
				this.draftInvoices = Array.isArray(message) ? message.map((entry) => ({ ...entry, doctype: entry.doctype || this.currentInvoiceDoctype })) : [];
			} catch (error) {
				console.error("Error loading draft invoices:", error);
				this.toastStore.show({ title: __("Unable to fetch draft invoices"), color: "error" });
			} finally {
				this.loading = false;
			}
		},
		async viewInvoice(invoice) {
			try {
				const { message } = await frappe.call({ method: "frappe.client.get", args: { doctype: invoice.doctype || this.currentInvoiceDoctype, name: invoice.name } });
				this.selectedInvoiceDetail = message || null;
				this.detailDialog = !!message;
			} catch (error) {
				console.error("Error loading invoice details:", error);
				this.toastStore.show({ title: __("Unable to load invoice details"), color: "error" });
			}
		},
		async loadDraft(invoice) {
			try {
				const { message } = await frappe.call({ method: "posawesome.posawesome.api.invoices.get_draft_invoice_doc", args: { invoice_name: invoice.name, doctype: invoice.doctype || this.currentInvoiceDoctype } });
				if (message) {
					this.invoiceStore.triggerLoadInvoice(message);
					this.uiStore.closeInvoiceManagement();
				}
			} catch (error) {
				console.error("Error loading draft invoice:", error);
				this.toastStore.show({ title: __("Unable to load draft invoice"), color: "error" });
			}
		},
		async deleteDraft(invoice) {
			if (!window.confirm(__("Delete draft invoice {0}?", [invoice.name]))) return;
			try {
				await frappe.call({ method: "posawesome.posawesome.api.invoices.delete_invoice", args: { invoice: invoice.name } });
				this.toastStore.show({ title: __("Draft invoice deleted"), color: "success" });
				await this.loadDrafts();
			} catch (error) {
				console.error("Error deleting draft invoice:", error);
				this.toastStore.show({ title: __("Unable to delete draft invoice"), color: "error" });
			}
		},
		async createReturn(invoice) {
			try {
				const { message } = await frappe.call({ method: "posawesome.posawesome.api.invoices.get_invoice_for_return", args: { invoice_name: invoice.name, pos_profile: this.posProfile?.name, doctype: invoice.doctype || this.currentInvoiceDoctype } });
				const returnDoc = message;
				if (!returnDoc || !Array.isArray(returnDoc.items) || !returnDoc.items.length) {
					this.toastStore.show({ title: __("No returnable items found for this invoice"), color: "warning" });
					return;
				}
				const invoiceDoc = {
					items: returnDoc.items.map((item) => {
						const row = { ...item };
						if (returnDoc.doctype === "POS Invoice") row.pos_invoice_item = item.name;
						else row.sales_invoice_item = item.name;
						delete row.name;
						row.rate = item.rate;
						row.price_list_rate = item.price_list_rate;
						row.discount_percentage = item.discount_percentage;
						row.discount_amount = item.discount_amount;
						row.is_free_item = item.is_free_item;
						row.net_rate = item.net_rate;
						row.net_amount = item.net_amount > 0 ? item.net_amount * -1 : item.net_amount;
						row.locked_price = true;
						row.qty = item.qty > 0 ? item.qty * -1 : item.qty;
						row.stock_qty = item.stock_qty > 0 ? item.stock_qty * -1 : item.stock_qty;
						row.amount = item.amount > 0 ? item.amount * -1 : item.amount;
						return row;
					}),
					is_return: 1,
					return_against: returnDoc.name,
					customer: returnDoc.customer,
					discount_amount: returnDoc.discount_amount,
					additional_discount_percentage: returnDoc.additional_discount_percentage,
					payments: Array.isArray(returnDoc.payments) ? returnDoc.payments.map((payment) => ({ mode_of_payment: payment.mode_of_payment, amount: payment.amount, base_amount: payment.base_amount, default: payment.default, account: payment.account, type: payment.type, currency: payment.currency, conversion_rate: payment.conversion_rate })) : [],
					grand_total: returnDoc.grand_total > 0 ? returnDoc.grand_total * -1 : returnDoc.grand_total,
					update_stock: 1,
					pos_profile: this.posProfile?.name,
					company: this.posProfile?.company,
				};
				this.eventBus?.emit("load_return_invoice", { invoice_doc: invoiceDoc, return_doc: returnDoc });
				this.uiStore.closeInvoiceManagement();
			} catch (error) {
				console.error("Error creating return invoice:", error);
				this.toastStore.show({ title: __("Unable to prepare return invoice"), color: "error" });
			}
		},
		openAddPayment(invoice) {
			const customer = invoice.customer || this.selectedInvoiceDetail?.customer;
			if (!customer) {
				this.toastStore.show({ title: __("Customer is required to add payment"), color: "error" });
				return;
			}
			this.customersStore.setSelectedCustomer(customer);
			this.uiStore.setPaymentRouteTarget({ invoiceName: invoice.name, customer, currency: invoice.currency || this.posProfile?.currency || null });
			this.detailDialog = false;
			this.uiStore.closeInvoiceManagement();
			this.router.push("/payments");
		},
		async printInvoice(invoice) {
			const profile = this.posProfile;
			if (!invoice?.name || !profile) return;
			const doctype = invoice.doctype || this.currentInvoiceDoctype;
			const printFormat = profile.print_format_for_online || profile.print_format || "Standard";
			const letterHead = profile.letter_head || 0;
			const debugPrint = isDebugPrintEnabled();
			const useSilentPrint = !!profile.posa_silent_print;
			let url = frappe.urllib.get_base_url() + "/printview?doctype=" + encodeURIComponent(doctype) + "&name=" + encodeURIComponent(invoice.name) + "&trigger_print=1&format=" + encodeURIComponent(printFormat) + "&no_letterhead=" + (letterHead ? "0" : "1");
			if (letterHead) url += "&letterhead=" + encodeURIComponent(letterHead);
			url = appendDebugPrintParam(url, debugPrint);
			const printOptions = { allowOfflineFallback: isOffline(), triggerPrint: "1", debugPrint };
			if (useSilentPrint && !isOffline()) {
				try {
					await printDocumentViaQz({ doctype, name: invoice.name, printFormat, letterhead: letterHead || null, noLetterhead: letterHead ? "0" : "1" });
					return;
				} catch (error) {
					console.warn("QZ Tray print failed, falling back to browser print", error);
				}
			}
			if (useSilentPrint) {
				silentPrint(url, printOptions);
				return;
			}
			const printWindow = window.open(url, "Print");
			if (printWindow) watchPrintWindow(printWindow, printOptions);
		},
	},
};
</script>

<style scoped>
.invoice-management-dialog-content { background: transparent !important; }

.invoice-management-card {
	background:
		radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 28%),
		radial-gradient(circle at top left, rgba(245, 158, 11, 0.12), transparent 24%),
		var(--pos-surface-raised) !important;
	color: var(--pos-text-primary) !important;
	border: 1px solid rgba(148, 163, 184, 0.18);
}

.invoice-management-card--dark {
	background:
		radial-gradient(circle at top right, rgba(56, 189, 248, 0.1), transparent 28%),
		radial-gradient(circle at top left, rgba(251, 191, 36, 0.08), transparent 24%),
		var(--pos-surface-raised) !important;
}

.invoice-management-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 12px;
	padding-bottom: 10px;
}

.invoice-tabs-shell { padding: 0 8px 8px; }

.invoice-tabs {
	background: rgba(148, 163, 184, 0.08);
	border-radius: 16px;
	padding: 6px;
}

.invoice-management-card--dark .invoice-tabs {
	background: rgba(15, 23, 42, 0.46);
}

.invoice-tab-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
}

.invoice-management-card__body { min-height: 580px; }

.filter-grid,
.summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 12px;
}

.summary-tile {
	border-radius: 18px;
	padding: 16px 18px;
	border: 1px solid rgba(148, 163, 184, 0.2);
	background: linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(241, 245, 249, 0.88));
	box-shadow: 0 16px 36px rgba(15, 23, 42, 0.06);
	color: var(--pos-text-primary);
}

.summary-tile--history { background: linear-gradient(145deg, rgba(239, 246, 255, 0.98), rgba(219, 234, 254, 0.88)); }
.summary-tile--primary { background: linear-gradient(145deg, rgba(224, 231, 255, 0.98), rgba(199, 210, 254, 0.88)); }
.summary-tile--success { background: linear-gradient(145deg, rgba(236, 253, 245, 0.98), rgba(209, 250, 229, 0.88)); }
.summary-tile--warning { background: linear-gradient(145deg, rgba(255, 251, 235, 0.98), rgba(254, 243, 199, 0.88)); }
.summary-tile--warning-strong { background: linear-gradient(145deg, rgba(255, 247, 237, 0.98), rgba(254, 215, 170, 0.9)); }
.summary-tile--danger { background: linear-gradient(145deg, rgba(254, 242, 242, 0.98), rgba(254, 202, 202, 0.88)); }

.summary-tile__label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	opacity: 0.72;
}

.summary-tile__value {
	margin-top: 8px;
	font-size: 1.08rem;
	font-weight: 800;
	line-height: 1.25;
}

.summary-tile__meta {
	margin-top: 6px;
	font-size: 0.76rem;
	opacity: 0.72;
	color: var(--pos-text-secondary);
}

.invoice-management-card--dark .summary-tile {
	border-color: rgba(100, 116, 139, 0.38);
	background: linear-gradient(145deg, rgba(36, 43, 51, 0.98), rgba(26, 32, 40, 0.94));
	box-shadow: 0 18px 44px rgba(2, 6, 23, 0.34);
}

.invoice-management-card--dark .summary-tile--history {
	background: linear-gradient(145deg, rgba(28, 52, 81, 0.98), rgba(23, 37, 84, 0.92));
}

.invoice-management-card--dark .summary-tile--primary {
	background: linear-gradient(145deg, rgba(49, 46, 129, 0.98), rgba(30, 41, 59, 0.92));
}

.invoice-management-card--dark .summary-tile--success {
	background: linear-gradient(145deg, rgba(20, 83, 45, 0.96), rgba(22, 101, 52, 0.88));
}

.invoice-management-card--dark .summary-tile--warning {
	background: linear-gradient(145deg, rgba(120, 53, 15, 0.96), rgba(146, 64, 14, 0.88));
}

.invoice-management-card--dark .summary-tile--warning-strong {
	background: linear-gradient(145deg, rgba(124, 45, 18, 0.98), rgba(154, 52, 18, 0.9));
}

.invoice-management-card--dark .summary-tile--danger {
	background: linear-gradient(145deg, rgba(127, 29, 29, 0.98), rgba(153, 27, 27, 0.88));
}

.status-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.tab-loader,
.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	min-height: 280px;
	border: 1px dashed rgba(148, 163, 184, 0.35);
	border-radius: 18px;
	background: rgba(248, 250, 252, 0.66);
	color: var(--pos-text-primary);
}

.empty-state__title {
	font-size: 1rem;
	font-weight: 700;
}

.empty-state__subtitle {
	font-size: 0.86rem;
	color: var(--pos-text-secondary);
	text-align: center;
	max-width: 420px;
}

.invoice-management-card--dark .tab-loader,
.invoice-management-card--dark .empty-state {
	border-color: rgba(100, 116, 139, 0.38);
	background: rgba(15, 23, 42, 0.42);
}

.invoice-record-grid {
	display: grid;
	gap: 16px;
}

.invoice-record-grid--history { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
.invoice-record-grid--unpaid { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }

.invoice-record-card {
	border-radius: 22px;
	overflow: hidden;
	border: 1px solid rgba(148, 163, 184, 0.18);
	background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
	box-shadow: 0 20px 44px rgba(15, 23, 42, 0.08);
	color: var(--pos-text-primary);
}

.invoice-record-card__hero {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
	padding: 18px 20px;
	background: linear-gradient(135deg, rgba(239, 246, 255, 0.95), rgba(224, 231, 255, 0.88));
	border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.invoice-record-card__hero--warm { background: linear-gradient(135deg, rgba(255, 247, 237, 0.98), rgba(255, 237, 213, 0.9)); }

.invoice-record-card__title-row {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.invoice-record-card__title {
	font-size: 1rem;
	font-weight: 800;
	line-height: 1.3;
}

.invoice-record-card__subtitle {
	margin-top: 6px;
	font-size: 0.88rem;
	color: var(--pos-text-secondary);
}

.invoice-record-card__amount-block { text-align: right; }

.invoice-record-card__amount-label {
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	opacity: 0.65;
}

.invoice-record-card__amount {
	margin-top: 6px;
	font-size: 1.1rem;
	font-weight: 800;
}

.invoice-record-card__content { padding: 18px 20px; }

.invoice-record-card__actions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 8px;
	padding: 14px 18px 18px;
	border-top: 1px solid rgba(148, 163, 184, 0.12);
	background: rgba(248, 250, 252, 0.76);
}

.invoice-management-card--dark .invoice-record-card {
	border-color: rgba(100, 116, 139, 0.34);
	background: linear-gradient(180deg, rgba(36, 43, 51, 0.98), rgba(26, 32, 40, 0.96));
	box-shadow: 0 22px 48px rgba(2, 6, 23, 0.38);
}

.invoice-management-card--dark .invoice-record-card__hero {
	border-bottom-color: rgba(100, 116, 139, 0.24);
	background: linear-gradient(135deg, rgba(30, 41, 59, 0.96), rgba(30, 64, 175, 0.34));
}

.invoice-management-card--dark .invoice-record-card__hero--warm {
	background: linear-gradient(135deg, rgba(67, 20, 7, 0.96), rgba(120, 53, 15, 0.52));
}

.invoice-management-card--dark .invoice-record-card--success .invoice-record-card__hero {
	background: linear-gradient(135deg, rgba(20, 83, 45, 0.96), rgba(22, 101, 52, 0.42));
}

.invoice-management-card--dark .invoice-record-card--warning .invoice-record-card__hero {
	background: linear-gradient(135deg, rgba(120, 53, 15, 0.96), rgba(161, 98, 7, 0.42));
}

.invoice-management-card--dark .invoice-record-card--error .invoice-record-card__hero {
	background: linear-gradient(135deg, rgba(127, 29, 29, 0.96), rgba(153, 27, 27, 0.42));
}

.invoice-management-card--dark .invoice-record-card--info .invoice-record-card__hero {
	background: linear-gradient(135deg, rgba(12, 74, 110, 0.96), rgba(30, 64, 175, 0.4));
}

.invoice-management-card--dark .invoice-record-card__actions {
	border-top-color: rgba(100, 116, 139, 0.22);
	background: rgba(15, 23, 42, 0.32);
}

.meta-pair-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 14px;
}

.meta-pair-grid--compact { margin-bottom: 16px; }

.meta-pair {
	padding: 12px 14px;
	border-radius: 16px;
	background: rgba(255, 255, 255, 0.82);
	border: 1px solid rgba(148, 163, 184, 0.14);
}

.meta-pair__label {
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--pos-text-secondary);
}

.meta-pair__value {
	margin-top: 6px;
	font-size: 0.92rem;
	font-weight: 700;
	line-height: 1.35;
}

.meta-pair__value--success { color: rgb(22, 163, 74); }
.meta-pair__value--warning { color: rgb(217, 119, 6); }

.payment-progress-block {
	padding: 14px 16px;
	border-radius: 16px;
	background: rgba(255, 255, 255, 0.84);
	border: 1px solid rgba(148, 163, 184, 0.14);
}

.invoice-management-card--dark .meta-pair,
.invoice-management-card--dark .payment-progress-block {
	background: rgba(15, 23, 42, 0.34);
	border-color: rgba(100, 116, 139, 0.26);
}

.payment-progress-block__labels {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 10px;
	font-size: 0.8rem;
	font-weight: 700;
}

.invoice-record-card--success .invoice-record-card__hero { background: linear-gradient(135deg, rgba(236, 253, 245, 0.98), rgba(209, 250, 229, 0.9)); }
.invoice-record-card--warning .invoice-record-card__hero { background: linear-gradient(135deg, rgba(255, 251, 235, 0.98), rgba(254, 243, 199, 0.9)); }
.invoice-record-card--error .invoice-record-card__hero { background: linear-gradient(135deg, rgba(254, 242, 242, 0.98), rgba(254, 202, 202, 0.9)); }
.invoice-record-card--info .invoice-record-card__hero { background: linear-gradient(135deg, rgba(240, 249, 255, 0.98), rgba(224, 242, 254, 0.9)); }

.detail-section__title {
	font-size: 0.95rem;
	font-weight: 700;
	margin-bottom: 8px;
}

.invoice-detail-card {
	background: var(--pos-surface-raised) !important;
	color: var(--pos-text-primary) !important;
}

.invoice-detail-card--dark {
	background: var(--pos-surface-raised) !important;
	color: var(--pos-text-primary) !important;
}

@media (max-width: 960px) {
	.invoice-record-card__hero { flex-direction: column; }
	.invoice-record-card__amount-block { text-align: left; }
}

@media (max-width: 640px) {
	.meta-pair-grid { grid-template-columns: 1fr; }
	.invoice-record-card__actions { justify-content: stretch; }
}
</style>
