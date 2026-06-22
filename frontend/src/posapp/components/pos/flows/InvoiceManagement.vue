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
							v-if="isSupervisorScope()"
							v-model="selectedSupervisorPosProfile"
							class="supervisor-profile-select"
							variant="outlined"
							density="compact"
							hide-details
							:items="supervisorPosProfileItems"
							item-title="title"
							item-value="value"
							:label="__('POS Profile')"
						/>
						<div class="view-toggle-group">
							<v-btn
								:variant="viewMode === 'card' ? 'flat' : 'text'"
								:color="viewMode === 'card' ? 'primary' : undefined"
								size="small"
								prepend-icon="mdi-view-grid-outline"
								@click="viewMode = 'card'"
							>
								{{ __("Cards") }}
							</v-btn>
							<v-btn
								:variant="viewMode === 'list' ? 'flat' : 'text'"
								:color="viewMode === 'list' ? 'primary' : undefined"
								size="small"
								prepend-icon="mdi-format-list-bulleted"
								@click="viewMode = 'list'"
							>
								{{ __("List") }}
							</v-btn>
						</div>
						<v-btn
							color="primary"
							variant="text"
							prepend-icon="mdi-refresh"
							:loading="loading"
							@click="refreshActiveTab"
						>
							{{ __("Refresh") }}
						</v-btn>
						<v-btn
							icon="mdi-close"
							variant="text"
							:aria-label="__('Close invoice management')"
							@click="uiStore.closeInvoiceManagement()"
						/>
					</div>
				</v-card-title>

				<div class="invoice-tabs-shell">
					<v-tabs v-model="activeTab" color="primary" grow class="invoice-tabs">
						<v-tab value="history">
							<div class="invoice-tab-label">
								<span>{{ __("History") }}</span>
								<v-chip size="x-small" variant="flat" color="primary">{{
									filteredHistoryInvoices.length
								}}</v-chip>
							</div>
						</v-tab>
						<v-tab value="partial">
							<div class="invoice-tab-label">
								<span>{{ __("Unpaid") }}</span>
								<v-chip size="x-small" variant="flat" color="warning">{{
									filteredUnpaidInvoices.length
								}}</v-chip>
							</div>
						</v-tab>
						<v-tab value="drafts">
							<div class="invoice-tab-label">
								<span>{{ __("Drafts") }}</span>
								<v-chip size="x-small" variant="flat" color="secondary">{{
									filteredDraftInvoices.length
								}}</v-chip>
							</div>
						</v-tab>
						<v-tab value="returns">
							<div class="invoice-tab-label">
								<span>{{ __("Returns") }}</span>
								<v-chip size="x-small" variant="flat" color="error">{{
									filteredReturnInvoices.length
								}}</v-chip>
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
								<v-btn
									class="history-repair-toggle"
									:color="historyShowRepairCandidatesOnly ? 'warning' : undefined"
									:variant="historyShowRepairCandidatesOnly ? 'flat' : 'outlined'"
									prepend-icon="mdi-wrench-check-outline"
									@click="
										historyShowRepairCandidatesOnly = !historyShowRepairCandidatesOnly
									"
								>
									{{ __("Show Repair Candidates") }}
									<v-chip
										size="x-small"
										variant="flat"
										:color="historyShowRepairCandidatesOnly ? 'white' : 'warning'"
										class="ms-2"
									>
										{{ historyRepairCandidateCount }}
									</v-chip>
								</v-btn>
							</div>

							<div class="summary-grid mb-4">
								<div class="summary-tile summary-tile--history">
									<div class="summary-tile__label">{{ __("Invoices") }}</div>
									<div class="summary-tile__value">
										{{ filteredHistoryInvoices.length }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Completed and active sales in this range") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--primary">
									<div class="summary-tile__label">{{ __("Gross Sales") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }}
										{{ formatCurrency(historyTotals.gross) }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Before any return workflow") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--success">
									<div class="summary-tile__label">{{ __("Tendered") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }}
										{{ formatCurrency(historyTotals.paid) }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Amount received from customer") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--danger">
									<div class="summary-tile__label">{{ __("Change Return") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }}
										{{ formatCurrency(historyTotals.change_return) }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Cash returned after payment") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--warning">
									<div class="summary-tile__label">{{ __("Outstanding") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }}
										{{ formatCurrency(historyTotals.outstanding) }}
									</div>
									<div class="summary-tile__meta">{{ __("Balances still pending") }}</div>
								</div>
							</div>

							<div v-if="loading && activeTab === 'history'" class="tab-loader">
								<v-progress-circular indeterminate color="primary" size="28" width="3" />
								<span>{{ __("Loading invoice history...") }}</span>
							</div>

							<div v-else-if="!filteredHistoryInvoices.length" class="empty-state">
								<v-icon size="42" color="medium-emphasis"
									>mdi-receipt-text-clock-outline</v-icon
								>
								<div class="empty-state__title">{{ __("No invoices found") }}</div>
								<div class="empty-state__subtitle">
									{{
										historyShowRepairCandidatesOnly
											? __("No change-allocation invoices match the current filters.")
											: __("Try changing the date range or status filter.")
									}}
								</div>
							</div>

							<v-data-table
								v-else-if="viewMode === 'list'"
								:headers="historyHeaders"
								:items="paginatedHistoryInvoices"
								item-value="name"
								class="elevation-1"
								:items-per-page="-1"
								hide-default-footer
							>
								<template #item.posting_date="{ item }">{{
									formatDateTime(item.posting_date, item.posting_time)
								}}</template>
								<template #item.grand_total="{ item }"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.grand_total) }}</template
								>
								<template #item.paid_amount="{ item }"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.paid_amount || 0) }}</template
								>
								<template #item.change_amount="{ item }"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.change_amount || 0) }}</template
								>
								<template #item.outstanding_amount="{ item }"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.outstanding_amount || 0) }}</template
								>
								<template #item.status="{ item }">
									<div class="d-flex flex-wrap ga-1">
										<v-chip
											size="small"
											:color="statusColor(item.status)"
											variant="tonal"
											>{{ __(item.status || "Draft") }}</v-chip
										>
										<v-chip
											v-if="changeAllocationRepairState(item)"
											size="small"
											:color="repairStateColor(changeAllocationRepairState(item))"
											variant="flat"
										>
											{{ repairStateLabel(changeAllocationRepairState(item)) }}
										</v-chip>
									</div>
								</template>
								<template #item.actions="{ item }">
									<div class="d-flex justify-end ga-1">
										<v-btn
											icon="mdi-eye-outline"
											variant="text"
											size="small"
											:title="__('View Details')"
											:aria-label="__('View invoice details')"
											@click="viewInvoice(item)"
										/>
										<v-btn
											icon="mdi-printer-outline"
											variant="text"
											size="small"
											:title="__('Print')"
											:aria-label="__('Print invoice')"
											@click="printInvoice(item)"
										/>
										<v-btn
											icon="mdi-share-variant-outline"
											variant="text"
											size="small"
											color="info"
											:title="__('Share')"
											:aria-label="__('Share invoice')"
											@click="shareInvoice(item)"
										/>
										<v-btn
											v-if="posProfile?.posa_allow_return == 1"
											icon="mdi-backup-restore"
											variant="text"
											size="small"
											color="warning"
											:title="__('Create Return')"
											:aria-label="__('Create return from invoice')"
											@click="createReturn(item)"
										/>
									</div>
								</template>
							</v-data-table>

							<div v-else class="invoice-record-grid invoice-record-grid--history">
								<v-card
									v-for="invoice in paginatedHistoryInvoices"
									:key="invoice.name"
									:class="[
										'invoice-record-card',
										`invoice-record-card--${toneFromStatus(invoice.status)}`,
									]"
									variant="flat"
								>
									<div class="invoice-record-card__hero">
										<div>
											<div class="invoice-record-card__title-row">
												<div class="invoice-record-card__title">
													{{ invoice.name }}
												</div>
												<v-chip
													size="small"
													:color="statusColor(invoice.status)"
													variant="flat"
												>
													{{ __(invoice.status || "Draft") }}
												</v-chip>
												<v-chip
													v-if="changeAllocationRepairState(invoice)"
													size="small"
													:color="
														repairStateColor(changeAllocationRepairState(invoice))
													"
													variant="flat"
												>
													{{
														repairStateLabel(changeAllocationRepairState(invoice))
													}}
												</v-chip>
											</div>
											<div class="invoice-record-card__subtitle">
												{{
													invoice.customer_name ||
													invoice.customer ||
													__("Walk-in Customer")
												}}
											</div>
										</div>
										<div class="invoice-record-card__amount-block">
											<div class="invoice-record-card__amount-label">
												{{ __("Grand Total") }}
											</div>
											<div class="invoice-record-card__amount">
												{{ currencySymbol(invoice.currency) }}
												{{ formatCurrency(invoice.grand_total) }}
											</div>
										</div>
									</div>

									<div class="invoice-record-card__content">
										<div class="meta-pair-grid">
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Posting") }}</div>
												<div class="meta-pair__value">
													{{
														formatDateTime(
															invoice.posting_date,
															invoice.posting_time,
														)
													}}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Tendered") }}</div>
												<div class="meta-pair__value meta-pair__value--success">
													{{ currencySymbol(invoice.currency) }}
													{{ formatCurrency(invoice.paid_amount || 0) }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Change Return") }}</div>
												<div class="meta-pair__value meta-pair__value--warning">
													{{ currencySymbol(invoice.currency) }}
													{{ formatCurrency(invoice.change_amount || 0) }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Outstanding") }}</div>
												<div
													class="meta-pair__value"
													:class="{
														'meta-pair__value--warning':
															Number(invoice.outstanding_amount || 0) > 0,
													}"
												>
													{{ currencySymbol(invoice.currency) }}
													{{ formatCurrency(invoice.outstanding_amount || 0) }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Payment State") }}</div>
												<div class="meta-pair__value">
													{{ __(invoice.status || "Draft") }}
												</div>
											</div>
										</div>
									</div>

									<div class="invoice-record-card__actions">
										<v-btn
											icon="mdi-eye-outline"
											size="small"
											variant="text"
											:title="__('View Details')"
											:aria-label="__('View invoice details')"
											@click="viewInvoice(invoice)"
										/>
										<v-btn
											icon="mdi-printer-outline"
											size="small"
											variant="text"
											:title="__('Print')"
											:aria-label="__('Print invoice')"
											@click="printInvoice(invoice)"
										/>
										<v-btn
											icon="mdi-share-variant-outline"
											variant="text"
											size="small"
											color="info"
											:title="__('Share')"
											:aria-label="__('Share invoice')"
											@click="shareInvoice(invoice)"
										/>
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

							<div
								v-if="!loading && filteredHistoryInvoices.length && historyPageCount > 1"
								class="tab-pagination"
							>
								<div class="tab-pagination__meta">
									{{ paginationCaption(filteredHistoryInvoices.length, "history") }}
								</div>
								<v-pagination
									:model-value="tabPages.history"
									:length="historyPageCount"
									:total-visible="7"
									density="comfortable"
									@update:model-value="setTabPage('history', $event)"
								/>
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
								<v-btn
									:variant="partialStatus === 'All' ? 'flat' : 'outlined'"
									:color="partialStatus === 'All' ? 'warning' : undefined"
									size="small"
									@click="partialStatus = 'All'"
								>
									{{ __("All") }} ({{ unpaidStatusCounts.all }})
								</v-btn>
								<v-btn
									:variant="partialStatus === 'Partly Paid' ? 'flat' : 'outlined'"
									:color="partialStatus === 'Partly Paid' ? 'warning' : undefined"
									size="small"
									@click="partialStatus = 'Partly Paid'"
								>
									{{ __("Partly Paid") }} ({{ unpaidStatusCounts.partial }})
								</v-btn>
								<v-btn
									:variant="partialStatus === 'Unpaid' ? 'flat' : 'outlined'"
									:color="partialStatus === 'Unpaid' ? 'warning' : undefined"
									size="small"
									@click="partialStatus = 'Unpaid'"
								>
									{{ __("Unpaid") }} ({{ unpaidStatusCounts.unpaid }})
								</v-btn>
								<v-btn
									:variant="partialStatus === 'Overdue' ? 'flat' : 'outlined'"
									:color="partialStatus === 'Overdue' ? 'error' : undefined"
									size="small"
									@click="partialStatus = 'Overdue'"
								>
									{{ __("Overdue") }} ({{ unpaidStatusCounts.overdue }})
								</v-btn>
							</div>

							<div class="summary-grid mb-4">
								<div class="summary-tile summary-tile--warning">
									<div class="summary-tile__label">{{ __("Invoices") }}</div>
									<div class="summary-tile__value">{{ filteredUnpaidSummary.count }}</div>
									<div class="summary-tile__meta">
										{{ __("Invoices still carrying balances") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--success">
									<div class="summary-tile__label">{{ __("Paid") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }}
										{{ formatCurrency(filteredUnpaidSummary.total_paid) }}
									</div>
									<div class="summary-tile__meta">{{ __("Amount already received") }}</div>
								</div>
								<div class="summary-tile summary-tile--warning-strong">
									<div class="summary-tile__label">{{ __("Outstanding") }}</div>
									<div class="summary-tile__value">
										{{ currencySymbol(posProfile?.currency) }}
										{{ formatCurrency(filteredUnpaidSummary.total_outstanding) }}
									</div>
									<div class="summary-tile__meta">{{ __("Open balance to collect") }}</div>
								</div>
								<div class="summary-tile summary-tile--danger">
									<div class="summary-tile__label">{{ __("Overdue") }}</div>
									<div class="summary-tile__value">
										{{ filteredUnpaidSummary.overdue_count }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Invoices already past due date") }}
									</div>
								</div>
							</div>

							<v-alert
								v-if="isOffline()"
								type="warning"
								variant="tonal"
								density="compact"
								class="mb-4"
							>
								{{
									__(
										"You are offline. Add Payment will work again when the connection is restored.",
									)
								}}
							</v-alert>

							<div v-if="loading && activeTab === 'partial'" class="tab-loader">
								<v-progress-circular indeterminate color="warning" size="28" width="3" />
								<span>{{ __("Loading unpaid invoices...") }}</span>
							</div>

							<div v-else-if="!filteredUnpaidInvoices.length" class="empty-state">
								<v-icon size="42" color="success">mdi-cash-check</v-icon>
								<div class="empty-state__title">{{ __("No unpaid invoices") }}</div>
								<div class="empty-state__subtitle">
									{{ __("All visible invoices are fully settled.") }}
								</div>
							</div>

							<v-data-table
								v-else-if="viewMode === 'list'"
								:headers="partialHeaders"
								:items="paginatedUnpaidInvoices"
								item-value="name"
								class="elevation-1"
								:items-per-page="-1"
								hide-default-footer
							>
								<template #item.posting_date="{ item }">{{
									formatDateTime(item.posting_date, item.posting_time)
								}}</template>
								<template #item.due_date="{ item }">{{
									formatDateForDisplay(item.due_date) || "-"
								}}</template>
								<template #item.grand_total="{ item }"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.grand_total) }}</template
								>
								<template #item.paid_amount="{ item }"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.paid_amount || 0) }}</template
								>
								<template #item.outstanding_amount="{ item }"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.outstanding_amount || 0) }}</template
								>
								<template #item.status="{ item }"
									><v-chip size="small" :color="statusColor(item.status)" variant="tonal">{{
										__(item.status || "Unpaid")
									}}</v-chip></template
								>
								<template #item.actions="{ item }">
									<div class="d-flex justify-end ga-1">
										<v-btn
											icon="mdi-cash-plus"
											variant="text"
											size="small"
											color="warning"
											:disabled="isOffline()"
											:title="__('Add Payment')"
											:aria-label="__('Add payment to invoice')"
											@click="openAddPayment(item)"
										/>
										<v-btn
											icon="mdi-eye-outline"
											variant="text"
											size="small"
											:title="__('View Details')"
											:aria-label="__('View invoice details')"
											@click="viewInvoice(item)"
										/>
										<v-btn
											icon="mdi-printer-outline"
											variant="text"
											size="small"
											:title="__('Print')"
											:aria-label="__('Print invoice')"
											@click="printInvoice(item)"
										/>
										<v-btn
											icon="mdi-share-variant-outline"
											variant="text"
											size="small"
											color="info"
											:title="__('Share')"
											:aria-label="__('Share invoice')"
											@click="shareInvoice(item)"
										/>
									</div>
								</template>
							</v-data-table>

							<div v-else class="invoice-record-grid invoice-record-grid--unpaid">
								<v-card
									v-for="invoice in paginatedUnpaidInvoices"
									:key="invoice.name"
									:class="[
										'invoice-record-card',
										'invoice-record-card--unpaid',
										`invoice-record-card--${toneFromStatus(invoice.status)}`,
									]"
									variant="flat"
								>
									<div class="invoice-record-card__hero invoice-record-card__hero--warm">
										<div>
											<div class="invoice-record-card__title-row">
												<div class="invoice-record-card__title">
													{{ invoice.name }}
												</div>
												<v-chip
													size="small"
													:color="statusColor(invoice.status)"
													variant="flat"
												>
													{{ __(invoice.status || "Unpaid") }}
												</v-chip>
											</div>
											<div class="invoice-record-card__subtitle">
												{{
													invoice.customer_name ||
													invoice.customer ||
													__("Walk-in Customer")
												}}
											</div>
										</div>
										<div class="d-flex flex-column align-end ga-2">
											<v-chip size="small" :color="dueTone(invoice)" variant="tonal">
												{{ dueLabel(invoice) }}
											</v-chip>
											<div class="invoice-record-card__amount-block">
												<div class="invoice-record-card__amount-label">
													{{ __("Outstanding") }}
												</div>
												<div class="invoice-record-card__amount">
													{{ currencySymbol(invoice.currency) }}
													{{ formatCurrency(invoice.outstanding_amount || 0) }}
												</div>
											</div>
										</div>
									</div>

									<div class="invoice-record-card__content">
										<div class="meta-pair-grid meta-pair-grid--compact">
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Posting") }}</div>
												<div class="meta-pair__value">
													{{
														formatDateTime(
															invoice.posting_date,
															invoice.posting_time,
														)
													}}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Due Date") }}</div>
												<div class="meta-pair__value">
													{{ formatDateForDisplay(invoice.due_date) || "-" }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Grand Total") }}</div>
												<div class="meta-pair__value">
													{{ currencySymbol(invoice.currency) }}
													{{ formatCurrency(invoice.grand_total) }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Paid") }}</div>
												<div class="meta-pair__value meta-pair__value--success">
													{{ currencySymbol(invoice.currency) }}
													{{ formatCurrency(invoice.paid_amount || 0) }}
												</div>
											</div>
										</div>

										<div class="payment-progress-block">
											<div class="payment-progress-block__labels">
												<span>{{ __("Payment Progress") }}</span>
												<span>{{ formatFloat(paymentProgress(invoice)) }}%</span>
											</div>
											<v-progress-linear
												:model-value="paymentProgress(invoice)"
												color="success"
												bg-color="grey-lighten-2"
												height="8"
												rounded
											/>
										</div>
									</div>

									<div class="invoice-record-card__actions">
										<v-btn
											prepend-icon="mdi-cash-plus"
											size="small"
											variant="flat"
											color="warning"
											:disabled="isOffline()"
											@click="openAddPayment(invoice)"
										>
											{{ __("Add Payment") }}
										</v-btn>
										<v-btn
											icon="mdi-eye-outline"
											size="small"
											variant="text"
											:title="__('View Details')"
											:aria-label="__('View invoice details')"
											@click="viewInvoice(invoice)"
										/>
										<v-btn
											icon="mdi-printer-outline"
											size="small"
											variant="text"
											:title="__('Print')"
											:aria-label="__('Print invoice')"
											@click="printInvoice(invoice)"
										/>
										<v-btn
											icon="mdi-share-variant-outline"
											variant="text"
											size="small"
											color="info"
											:title="__('Share')"
											:aria-label="__('Share invoice')"
											@click="shareInvoice(invoice)"
										/>
									</div>
								</v-card>
							</div>

							<div
								v-if="!loading && filteredUnpaidInvoices.length && partialPageCount > 1"
								class="tab-pagination"
							>
								<div class="tab-pagination__meta">
									{{ paginationCaption(filteredUnpaidInvoices.length, "partial") }}
								</div>
								<v-pagination
									:model-value="tabPages.partial"
									:length="partialPageCount"
									:total-visible="7"
									density="comfortable"
									@update:model-value="setTabPage('partial', $event)"
								/>
							</div>
						</v-window-item>

						<v-window-item value="drafts">
							<div class="draft-source-toolbar mb-4">
								<DocumentSourceSelector
									v-if="showDraftSourceSelector"
									:model-value="currentDraftSource"
									:options="availableDraftSources"
									compact
									:aria-label="__('Draft source')"
									@update:model-value="updateDraftSource"
								/>
							</div>

							<div class="filter-grid mb-4">
								<v-text-field
									v-model="draftSearch"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									:label="__(currentDraftSourceOption.searchLabel)"
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

							<div v-if="loading && activeTab === 'drafts'" class="tab-loader">
								<v-progress-circular indeterminate color="secondary" size="28" width="3" />
								<span>{{ __(currentDraftSourceOption.loadingLabel) }}</span>
							</div>

							<div v-else-if="!filteredDraftInvoices.length" class="empty-state">
								<v-icon size="42" :color="currentDraftSourceOption.color">{{
									currentDraftSourceOption.icon
								}}</v-icon>
								<div class="empty-state__title">
									{{ __(currentDraftSourceOption.emptyTitle) }}
								</div>
								<div class="empty-state__subtitle">
									{{ __(currentDraftSourceOption.emptySubtitle) }}
								</div>
							</div>

							<v-data-table
								v-else-if="viewMode === 'list'"
								:headers="draftHeaders"
								:items="paginatedDraftInvoices"
								item-value="name"
								class="elevation-1"
								:items-per-page="-1"
								hide-default-footer
							>
								<template #item.posting_date="{ item }">{{
									formatDateTime(item.posting_date, item.posting_time)
								}}</template>
								<template #item.grand_total="{ item }"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.grand_total) }}</template
								>
								<template #item.actions="{ item }">
									<div class="d-flex justify-end ga-1">
										<v-btn
											v-for="action in draftActions(item)"
											:key="`${item.name}-${action}`"
											variant="text"
											size="small"
											:color="draftActionColor(action)"
											:title="draftActionLabel(action)"
											:aria-label="draftActionLabel(action)"
											@click="runDraftAction(item, action)"
										>
											{{ draftActionLabel(action) }}
										</v-btn>
										<v-btn
											v-if="canDeleteActiveDraftSource"
											icon="mdi-delete-outline"
											variant="text"
											size="small"
											color="error"
											:title="__('Delete Draft')"
											:aria-label="__('Delete draft invoice')"
											@click="deleteDraft(item)"
										/>
									</div>
								</template>
							</v-data-table>

							<div v-else class="invoice-record-grid invoice-record-grid--drafts">
								<v-card
									v-for="invoice in paginatedDraftInvoices"
									:key="invoice.name"
									class="invoice-record-card invoice-record-card--draft"
									variant="flat"
								>
									<div class="invoice-record-card__hero invoice-record-card__hero--draft">
										<div>
											<div class="invoice-record-card__title-row">
												<div class="invoice-record-card__title">
													{{ invoice.name }}
												</div>
												<v-chip
													size="small"
													:color="currentDraftSourceOption.color"
													variant="flat"
												>
													{{ draftSourceChipLabel(invoice) }}
												</v-chip>
											</div>
											<div class="invoice-record-card__subtitle">
												{{
													invoice.customer_name ||
													invoice.customer ||
													__("Walk-in Customer")
												}}
											</div>
										</div>
										<div class="invoice-record-card__amount-block">
											<div class="invoice-record-card__amount-label">
												{{ __("Total") }}
											</div>
											<div class="invoice-record-card__amount">
												{{ currencySymbol(invoice.currency) }}
												{{ formatCurrency(invoice.grand_total) }}
											</div>
										</div>
									</div>

									<div class="invoice-record-card__content">
										<div class="meta-pair-grid">
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Posting") }}</div>
												<div class="meta-pair__value">
													{{
														formatDateTime(
															invoice.posting_date,
															invoice.posting_time,
														)
													}}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">
													{{ draftSecondaryMetaLabel(invoice).label }}
												</div>
												<div class="meta-pair__value">
													{{ draftSecondaryMetaLabel(invoice).value }}
												</div>
											</div>
										</div>
									</div>

									<div class="invoice-record-card__actions">
										<v-btn
											v-for="action in draftActions(invoice)"
											:key="`${invoice.name}-${action}`"
											size="small"
											:variant="isPrimaryDraftAction(action) ? 'flat' : 'text'"
											:color="draftActionColor(action)"
											@click="runDraftAction(invoice, action)"
										>
											{{ draftActionLabel(action) }}
										</v-btn>
										<v-btn
											v-if="canDeleteActiveDraftSource"
											icon="mdi-delete-outline"
											size="small"
											variant="text"
											color="error"
											:title="__('Delete Draft')"
											:aria-label="__('Delete draft invoice')"
											@click="deleteDraft(invoice)"
										/>
									</div>
								</v-card>
							</div>

							<div
								v-if="!loading && filteredDraftInvoices.length && draftsPageCount > 1"
								class="tab-pagination"
							>
								<div class="tab-pagination__meta">
									{{ paginationCaption(filteredDraftInvoices.length, "drafts") }}
								</div>
								<v-pagination
									:model-value="tabPages.drafts"
									:length="draftsPageCount"
									:total-visible="7"
									density="comfortable"
									@update:model-value="setTabPage('drafts', $event)"
								/>
							</div>
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

							<div v-if="loading && activeTab === 'returns'" class="tab-loader">
								<v-progress-circular indeterminate color="error" size="28" width="3" />
								<span>{{ __("Loading return invoices...") }}</span>
							</div>

							<div v-else-if="!filteredReturnInvoices.length" class="empty-state">
								<v-icon size="42" color="error">mdi-backup-restore</v-icon>
								<div class="empty-state__title">{{ __("No return invoices found") }}</div>
								<div class="empty-state__subtitle">
									{{ __("Completed returns will appear here.") }}
								</div>
							</div>

							<v-data-table
								v-else-if="viewMode === 'list'"
								:headers="returnHeaders"
								:items="paginatedReturnInvoices"
								item-value="name"
								class="elevation-1"
								:items-per-page="-1"
								hide-default-footer
							>
								<template #item.posting_date="{ item }">{{
									formatDateTime(item.posting_date, item.posting_time)
								}}</template>
								<template #item.grand_total="{ item }"
									>{{ currencySymbol(item.currency) }}
									{{ formatCurrency(item.grand_total) }}</template
								>
								<template #item.return_against="{ item }">{{
									item.return_against || "-"
								}}</template>
								<template #item.actions="{ item }">
									<div class="d-flex justify-end ga-1">
										<v-btn
											icon="mdi-eye-outline"
											variant="text"
											size="small"
											:title="__('View Details')"
											:aria-label="__('View invoice details')"
											@click="viewInvoice(item)"
										/>
										<v-btn
											icon="mdi-printer-outline"
											variant="text"
											size="small"
											:title="__('Print')"
											:aria-label="__('Print invoice')"
											@click="printInvoice(item)"
										/>
										<v-btn
											icon="mdi-share-variant-outline"
											variant="text"
											size="small"
											color="info"
											:title="__('Share')"
											:aria-label="__('Share invoice')"
											@click="shareInvoice(item)"
										/>
									</div>
								</template>
							</v-data-table>

							<div v-else class="invoice-record-grid invoice-record-grid--returns">
								<v-card
									v-for="invoice in paginatedReturnInvoices"
									:key="invoice.name"
									class="invoice-record-card invoice-record-card--error"
									variant="flat"
								>
									<div class="invoice-record-card__hero invoice-record-card__hero--return">
										<div>
											<div class="invoice-record-card__title-row">
												<div class="invoice-record-card__title">
													{{ invoice.name }}
												</div>
												<v-chip size="small" color="error" variant="flat">{{
													__("Return")
												}}</v-chip>
											</div>
											<div class="invoice-record-card__subtitle">
												{{
													invoice.customer_name ||
													invoice.customer ||
													__("Walk-in Customer")
												}}
											</div>
										</div>
										<div class="invoice-record-card__amount-block">
											<div class="invoice-record-card__amount-label">
												{{ __("Total") }}
											</div>
											<div class="invoice-record-card__amount">
												{{ currencySymbol(invoice.currency) }}
												{{ formatCurrency(invoice.grand_total) }}
											</div>
										</div>
									</div>

									<div class="invoice-record-card__content">
										<div class="meta-pair-grid">
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Posting") }}</div>
												<div class="meta-pair__value">
													{{
														formatDateTime(
															invoice.posting_date,
															invoice.posting_time,
														)
													}}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Against") }}</div>
												<div class="meta-pair__value">
													{{ invoice.return_against || "-" }}
												</div>
											</div>
										</div>
									</div>

									<div class="invoice-record-card__actions">
										<v-btn
											icon="mdi-eye-outline"
											size="small"
											variant="text"
											:title="__('View Details')"
											:aria-label="__('View invoice details')"
											@click="viewInvoice(invoice)"
										/>
										<v-btn
											icon="mdi-printer-outline"
											size="small"
											variant="text"
											:title="__('Print')"
											:aria-label="__('Print invoice')"
											@click="printInvoice(invoice)"
										/>
										<v-btn
											icon="mdi-share-variant-outline"
											variant="text"
											size="small"
											color="info"
											:title="__('Share')"
											:aria-label="__('Share invoice')"
											@click="shareInvoice(invoice)"
										/>
									</div>
								</v-card>
							</div>

							<div
								v-if="!loading && filteredReturnInvoices.length && returnsPageCount > 1"
								class="tab-pagination"
							>
								<div class="tab-pagination__meta">
									{{ paginationCaption(filteredReturnInvoices.length, "returns") }}
								</div>
								<v-pagination
									:model-value="tabPages.returns"
									:length="returnsPageCount"
									:total-visible="7"
									density="comfortable"
									@update:model-value="setTabPage('returns', $event)"
								/>
							</div>
						</v-window-item>
					</v-window>
				</v-card-text>
				<v-card-actions class="invoice-management-footer">
					<v-btn color="error" variant="tonal" @click="uiStore.closeInvoiceManagement()">
						{{ __("Close") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>

	<v-dialog v-model="detailDialog" max-width="1040px" scrollable :theme="isDarkTheme ? 'dark' : 'light'">
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
						>{{ __(selectedInvoiceDetail.status) }}</v-chip
					>
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
				<div class="summary-grid mb-4">
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Posting") }}</div>
						<div class="summary-tile__value">
							{{
								formatDateTime(
									selectedInvoiceDetail.posting_date,
									selectedInvoiceDetail.posting_time,
								)
							}}
						</div>
					</div>
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Grand Total") }}</div>
						<div class="summary-tile__value">
							{{ currencySymbol(selectedInvoiceDetail.currency) }}
							{{ formatCurrency(selectedInvoiceDetail.grand_total) }}
						</div>
					</div>
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Outstanding") }}</div>
						<div class="summary-tile__value">
							{{ currencySymbol(selectedInvoiceDetail.currency) }}
							{{ formatCurrency(selectedInvoiceDetail.outstanding_amount || 0) }}
						</div>
					</div>
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Items") }}</div>
						<div class="summary-tile__value">
							{{ (selectedInvoiceDetail.items || []).length }}
						</div>
					</div>
				</div>
				<div class="detail-section__title">{{ __("Items") }}</div>
				<v-data-table
					:headers="detailHeaders"
					:items="selectedInvoiceDetail.items || []"
					item-value="item_code"
					:items-per-page="10"
					class="elevation-1"
				>
					<template #item.qty="{ item }">{{ formatFloat(item.qty || 0) }}</template>
					<template #item.rate="{ item }"
						>{{ currencySymbol(selectedInvoiceDetail.currency) }}
						{{ formatCurrency(item.rate) }}</template
					>
					<template #item.amount="{ item }"
						>{{ currencySymbol(selectedInvoiceDetail.currency) }}
						{{ formatCurrency(item.amount) }}</template
					>
				</v-data-table>
				<div class="detail-section__title mt-4">{{ __("Payment History") }}</div>
				<v-data-table
					:headers="paymentHeaders"
					:items="selectedInvoiceDetail.payments || []"
					item-value="mode_of_payment"
					:items-per-page="5"
					class="elevation-1"
				>
					<template #item.amount="{ item }"
						>{{ currencySymbol(selectedInvoiceDetail.currency) }}
						{{ formatCurrency(item.amount || 0) }}</template
					>
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
					>{{ __("Add Payment") }}</v-btn
				>
				<v-btn
					v-if="selectedInvoiceDetail"
					color="primary"
					variant="text"
					prepend-icon="mdi-printer-outline"
					@click="printInvoice(selectedInvoiceDetail)"
					>{{ __("Print") }}</v-btn
				>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
import { inject, computed } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import format from "../../../format";
import { useTheme } from "../../../composables/core/useTheme";
import { useResponsive } from "../../../composables/core/useResponsive";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { useCustomersStore } from "../../../stores/customersStore";
import { useEmployeeStore } from "../../../stores/employeeStore";
import {
	appendDebugPrintParam,
	isDebugPrintEnabled,
	silentPrint,
	watchPrintWindow,
} from "../../../plugins/print";
import { printDocumentViaQz } from "../../../services/qzTray";
import { isOffline } from "../../../../offline/index";
import { buildInvoicePdfUrl, shouldDownloadPdfForShareError } from "../../../utils/invoiceSharing";
import DocumentSourceSelector from "../shared/DocumentSourceSelector.vue";
import {
	canDeleteDocumentSourceRecord,
	commitDocumentFlowAction,
	fetchDocumentSourceRecords,
	getAvailableCommercialDocumentSources,
	getDefaultCommercialDocumentSource,
	getDocumentFlowActionLabel,
	getDocumentFlowActionsForRecord,
	getDocumentSourceOption,
	loadDocumentSourceRecord,
	prepareDocumentFlowAction,
	shouldShowDocumentSourceSelector,
} from "../../../utils/documentSources";

const TAB_PAGE_SIZE = 25;

export default {
	mixins: [format],
	components: {
		DocumentSourceSelector,
	},
	setup() {
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const customersStore = useCustomersStore();
		const employeeStore = useEmployeeStore();
		const toastStore = useToastStore();
		const router = useRouter();
		const theme = useTheme();
		const responsive = useResponsive();
		const eventBus = inject("eventBus");
		const isCompactInvoiceManagement = computed(() => responsive.windowWidth.value < 1100);
		const invoiceManagementDialogWidth = computed(() =>
			responsive.windowWidth.value < 600 ? "100vw" : "min(1420px, 97vw)",
		);
		const invoiceManagementDialogMaxWidth = computed(() =>
			responsive.windowWidth.value < 1100 ? "100vw" : "1420px",
		);
		const { invoiceManagementDialog, invoiceManagementTargetTab, posProfile, posOpeningShift } =
			storeToRefs(uiStore);
		const { currentCashier } = storeToRefs(employeeStore);
		return {
			uiStore,
			invoiceStore,
			customersStore,
			employeeStore,
			toastStore,
			router,
			eventBus,
			invoiceManagementDialog,
			invoiceManagementTargetTab,
			posProfile,
			posOpeningShift,
			currentCashier,
			isDarkTheme: theme.isDark,
			isOffline,
			isCompactInvoiceManagement,
			invoiceManagementDialogWidth,
			invoiceManagementDialogMaxWidth,
		};
	},
	data: () => ({
		activeTab: "history",
		viewMode: "card",
		loading: false,
		pageSize: TAB_PAGE_SIZE,
		tabPages: {
			history: 1,
			partial: 1,
			drafts: 1,
			returns: 1,
		},
		partialSearch: "",
		partialStatus: "All",
		partialDateFrom: "",
		partialDateTo: "",
		historySearch: "",
		historyStatus: "All",
		historyDateFrom: "",
		historyDateTo: "",
		historyShowRepairCandidatesOnly: false,
		repairCandidateInvoiceNames: [],
		repairedChangeAllocationInvoiceNames: [],
		repairCandidateScopeReady: false,
		selectedSupervisorPosProfile: null,
		supervisorPosProfiles: [],
		suppressSupervisorProfileRefresh: false,
		draftSearch: "",
		draftDateFrom: "",
		draftDateTo: "",
		draftSource: "invoice",
		returnSearch: "",
		returnDateFrom: "",
		returnDateTo: "",
		unpaidInvoices: [],
		historyInvoices: [],
		isSharingInvoice: false,
		draftRecordsBySource: {
			invoice: [],
			order: [],
			quote: [],
			delivery: [],
		},
		repairChangeLoading: false,
		detailDialog: false,
		selectedInvoiceDetail: null,
		partialStatusItems: ["All", "Partly Paid", "Unpaid", "Overdue"],
		historyStatusItems: ["All", "Paid", "Partly Paid", "Unpaid", "Overdue", "Credit Note Issued"],
		partialHeaders: [
			{ title: __("Invoice"), key: "name" },
			{ title: __("Customer"), key: "customer_name" },
			{ title: __("Posting"), key: "posting_date" },
			{ title: __("Due Date"), key: "due_date" },
			{ title: __("Status"), key: "status" },
			{ title: __("Total"), key: "grand_total", align: "end" },
			{ title: __("Paid"), key: "paid_amount", align: "end" },
			{ title: __("Outstanding"), key: "outstanding_amount", align: "end" },
			{ title: __("Actions"), key: "actions", align: "end", sortable: false },
		],
		historyHeaders: [
			{ title: __("Invoice"), key: "name" },
			{ title: __("Customer"), key: "customer_name" },
			{ title: __("Posting"), key: "posting_date" },
			{ title: __("Status"), key: "status" },
			{ title: __("Total"), key: "grand_total", align: "end" },
			{ title: __("Tendered"), key: "paid_amount", align: "end" },
			{ title: __("Change Return"), key: "change_amount", align: "end" },
			{ title: __("Outstanding"), key: "outstanding_amount", align: "end" },
			{ title: __("Actions"), key: "actions", align: "end", sortable: false },
		],
		returnHeaders: [
			{ title: __("Invoice"), key: "name" },
			{ title: __("Customer"), key: "customer_name" },
			{ title: __("Posting"), key: "posting_date" },
			{ title: __("Against"), key: "return_against" },
			{ title: __("Total"), key: "grand_total", align: "end" },
			{ title: __("Actions"), key: "actions", align: "end", sortable: false },
		],
		detailHeaders: [
			{ title: __("Item"), key: "item_name" },
			{ title: __("Code"), key: "item_code" },
			{ title: __("Qty"), key: "qty", align: "end" },
			{ title: __("Rate"), key: "rate", align: "end" },
			{ title: __("Amount"), key: "amount", align: "end" },
		],
		paymentHeaders: [
			{ title: __("Mode"), key: "mode_of_payment" },
			{ title: __("Amount"), key: "amount", align: "end" },
			{ title: __("Account"), key: "account" },
		],
	}),
	computed: {
		currentInvoiceDoctype() {
			return this.posProfile?.create_pos_invoice_instead_of_sales_invoice
				? "POS Invoice"
				: "Sales Invoice";
		},
		availableDraftSources() {
			return getAvailableCommercialDocumentSources(this.posProfile);
		},
		currentDraftSource() {
			return getDefaultCommercialDocumentSource(this.posProfile, this.draftSource);
		},
		currentDraftSourceOption() {
			return getDocumentSourceOption(this.currentDraftSource);
		},
		showDraftSourceSelector() {
			return shouldShowDocumentSourceSelector(this.availableDraftSources);
		},
		canDeleteActiveDraftSource() {
			return canDeleteDocumentSourceRecord(this.currentDraftSource);
		},
		draftHeaders() {
			return [
				{ title: __(this.currentDraftSourceOption.label), key: "name" },
				{ title: __("Customer"), key: "customer_name" },
				{ title: __("Posting"), key: "posting_date" },
				{ title: __("Total"), key: "grand_total", align: "end" },
				{ title: __("Actions"), key: "actions", align: "end", sortable: false },
			];
		},
		draftRecords() {
			return Array.isArray(this.draftRecordsBySource?.[this.currentDraftSource])
				? this.draftRecordsBySource[this.currentDraftSource]
				: [];
		},
		supervisorProfileScope() {
			return this.resolveSupervisorProfileScope();
		},
		supervisorPosProfileItems() {
			if (!this.isSupervisorScope()) return [];
			const profileNames = new Set(
				[this.posProfile?.name, ...(this.supervisorPosProfiles || [])].filter(Boolean),
			);
			return [
				{ title: __("All"), value: "All" },
				...Array.from(profileNames)
					.sort((left, right) => String(left).localeCompare(String(right)))
					.map((profileName) => ({
						title: profileName,
						value: profileName,
					})),
			];
		},
		filteredUnpaidInvoices() {
			return this.sortInvoicesByLatest(
				this.filterCollection(
					this.unpaidInvoices,
					this.partialSearch,
					this.partialStatus,
					this.partialDateFrom,
					this.partialDateTo,
				),
			);
		},
		filteredHistoryInvoices() {
			const visibleInvoices = this.historyInvoices.filter((invoice) => !invoice.is_return);
			const candidateScopedInvoices = this.historyShowRepairCandidatesOnly
				? visibleInvoices.filter((invoice) => this.changeAllocationRepairState(invoice) !== null)
				: visibleInvoices;
			return this.sortInvoicesByLatest(
				this.filterCollection(
					candidateScopedInvoices,
					this.historySearch,
					this.historyStatus,
					this.historyDateFrom,
					this.historyDateTo,
				),
			);
		},
		historyRepairCandidateCount() {
			return this.filterCollection(
				this.historyInvoices.filter(
					(invoice) => !invoice.is_return && this.changeAllocationRepairState(invoice) !== null,
				),
				this.historySearch,
				this.historyStatus,
				this.historyDateFrom,
				this.historyDateTo,
			).length;
		},
		filteredDraftInvoices() {
			return this.sortInvoicesByLatest(
				this.filterCollection(
					this.draftRecords,
					this.draftSearch,
					"All",
					this.draftDateFrom,
					this.draftDateTo,
				),
			);
		},
		filteredReturnInvoices() {
			return this.sortInvoicesByLatest(
				this.filterCollection(
					this.historyInvoices.filter((d) => d.is_return),
					this.returnSearch,
					"All",
					this.returnDateFrom,
					this.returnDateTo,
				),
			);
		},
		filteredUnpaidSummary() {
			return this.filteredUnpaidInvoices.reduce(
				(accumulator, invoice) => {
					accumulator.count += 1;
					accumulator.total_paid += Number(invoice.paid_amount || 0);
					accumulator.total_outstanding += Number(invoice.outstanding_amount || 0);
					if (this.isOverdue(invoice)) accumulator.overdue_count += 1;
					return accumulator;
				},
				{ count: 0, total_paid: 0, total_outstanding: 0, overdue_count: 0 },
			);
		},
		historyTotals() {
			return this.filteredHistoryInvoices.reduce(
				(accumulator, invoice) => {
					accumulator.gross += Number(invoice.grand_total || 0);
					accumulator.paid += Number(invoice.paid_amount || 0);
					accumulator.change_return += Number(invoice.change_amount || 0);
					accumulator.outstanding += Number(invoice.outstanding_amount || 0);
					return accumulator;
				},
				{ gross: 0, paid: 0, change_return: 0, outstanding: 0 },
			);
		},
		unpaidStatusCounts() {
			return this.unpaidInvoices.reduce(
				(accumulator, invoice) => {
					accumulator.all += 1;
					const status = String(invoice.status || "");
					if (status === "Partly Paid") accumulator.partial += 1;
					if (status === "Unpaid") accumulator.unpaid += 1;
					if (this.isOverdue(invoice)) accumulator.overdue += 1;
					return accumulator;
				},
				{ all: 0, partial: 0, unpaid: 0, overdue: 0 },
			);
		},
		paginatedHistoryInvoices() {
			return this.paginateCollection(this.filteredHistoryInvoices, "history");
		},
		paginatedUnpaidInvoices() {
			return this.paginateCollection(this.filteredUnpaidInvoices, "partial");
		},
		paginatedDraftInvoices() {
			return this.paginateCollection(this.filteredDraftInvoices, "drafts");
		},
		paginatedReturnInvoices() {
			return this.paginateCollection(this.filteredReturnInvoices, "returns");
		},
		historyPageCount() {
			return this.pageCount(this.filteredHistoryInvoices.length);
		},
		partialPageCount() {
			return this.pageCount(this.filteredUnpaidInvoices.length);
		},
		draftsPageCount() {
			return this.pageCount(this.filteredDraftInvoices.length);
		},
		returnsPageCount() {
			return this.pageCount(this.filteredReturnInvoices.length);
		},
	},
	watch: {
		invoiceManagementDialog(value) {
			if (value) {
				this.activeTab = this.invoiceManagementTargetTab || "history";
				this.draftSource = getDefaultCommercialDocumentSource(
					this.posProfile,
					this.uiStore.invoiceManagementDraftSource || this.draftSource,
				);
				this.initializeSupervisorProfileScope();
				this.loadSupervisorPosProfiles();
				this.refreshAll();
			} else this.resetPagination();
		},
		activeTab() {
			this.refreshActiveTab();
		},
		filteredHistoryInvoices() {
			this.resetTabPage("history");
		},
		filteredUnpaidInvoices() {
			this.resetTabPage("partial");
		},
		filteredDraftInvoices() {
			this.resetTabPage("drafts");
		},
		filteredReturnInvoices() {
			this.resetTabPage("returns");
		},
		selectedSupervisorPosProfile(value, previousValue) {
			if (
				value !== previousValue &&
				this.invoiceManagementDialog &&
				this.isSupervisorScope() &&
				!this.suppressSupervisorProfileRefresh
			) {
				this.refreshAll();
			}
		},
		posProfile: {
			async handler(value, previousValue) {
				this.draftSource = getDefaultCommercialDocumentSource(
					value,
					this.uiStore.invoiceManagementDraftSource || this.draftSource,
				);
				this.initializeSupervisorProfileScope();
				if (!this.invoiceManagementDialog) return;

				const profileChanged =
					value?.name !== previousValue?.name ||
					value?.company !== previousValue?.company ||
					value?.create_pos_invoice_instead_of_sales_invoice !==
						previousValue?.create_pos_invoice_instead_of_sales_invoice;

				if (!profileChanged) return;

				if (this.isSupervisorScope()) {
					await this.loadSupervisorPosProfiles();
				}
				await this.refreshAll();
			},
			deep: true,
		},
	},
	methods: {
		resetPagination() {
			this.tabPages = {
				history: 1,
				partial: 1,
				drafts: 1,
				returns: 1,
			};
		},
		resetTabPage(tab) {
			if (!this.tabPages || !Object.prototype.hasOwnProperty.call(this.tabPages, tab)) return;
			this.tabPages[tab] = 1;
		},
		setTabPage(tab, value) {
			if (!this.tabPages || !Object.prototype.hasOwnProperty.call(this.tabPages, tab)) return;
			const page = Number(value) || 1;
			this.tabPages[tab] = page > 0 ? page : 1;
		},
		pageCount(totalItems) {
			const perPage = Number(this.pageSize) || TAB_PAGE_SIZE;
			return Math.max(1, Math.ceil(Number(totalItems || 0) / perPage));
		},
		paginateCollection(items, tab) {
			if (!Array.isArray(items) || !items.length) return [];
			const perPage = Number(this.pageSize) || TAB_PAGE_SIZE;
			const currentPage = Number(this.tabPages?.[tab]) || 1;
			const maxPage = this.pageCount(items.length);
			const page = Math.min(Math.max(currentPage, 1), maxPage);
			const startIndex = (page - 1) * perPage;
			return items.slice(startIndex, startIndex + perPage);
		},
		paginationCaption(totalItems, tab) {
			const total = Number(totalItems || 0);
			if (!total) return __("Showing 0 of 0");
			const perPage = Number(this.pageSize) || TAB_PAGE_SIZE;
			const maxPage = this.pageCount(total);
			const currentPage = Number(this.tabPages?.[tab]) || 1;
			const page = Math.min(Math.max(currentPage, 1), maxPage);
			const start = (page - 1) * perPage + 1;
			const end = Math.min(total, page * perPage);
			return __("Showing {0}-{1} of {2}", [start, end, total]);
		},
		normalizeDate(value) {
			return value ? String(value).slice(0, 10) : "";
		},
		normalizePostingTime(value) {
			const raw = String(value || "")
				.split(".")[0]
				.trim();
			if (!raw) return "00:00:00";

			const parts = raw.split(":").map((part) => part.trim());
			if (parts.length < 1 || parts.length > 3) return "00:00:00";

			const hour = Number.parseInt(parts[0] || "0", 10);
			const minute = Number.parseInt(parts[1] || "0", 10);
			const second = Number.parseInt(parts[2] || "0", 10);

			if (
				!Number.isInteger(hour) ||
				!Number.isInteger(minute) ||
				!Number.isInteger(second) ||
				hour < 0 ||
				hour > 23 ||
				minute < 0 ||
				minute > 59 ||
				second < 0 ||
				second > 59
			) {
				return "00:00:00";
			}

			return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
		},
		toPostingTimestamp(postingDate, postingTime) {
			if (!postingDate) return Number.NaN;
			const dateParts = String(postingDate).split("-");
			if (dateParts.length !== 3) return Number.NaN;

			const year = Number.parseInt(dateParts[0], 10);
			const month = Number.parseInt(dateParts[1], 10);
			const day = Number.parseInt(dateParts[2], 10);
			if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
				return Number.NaN;
			}

			const [hourText, minuteText, secondText] = postingTime.split(":");
			const hour = Number.parseInt(hourText || "0", 10);
			const minute = Number.parseInt(minuteText || "0", 10);
			const second = Number.parseInt(secondText || "0", 10);

			return Date.UTC(year, month - 1, day, hour, minute, second);
		},
		inRange(date, fromDate, toDate) {
			const value = this.normalizeDate(date);
			if (fromDate && value < fromDate) return false;
			if (toDate && value > toDate) return false;
			return true;
		},
		filterCollection(items, search, status, fromDate, toDate) {
			const needle = String(search || "")
				.trim()
				.toLowerCase();
			return items.filter((item) => {
				if (needle) {
					const haystack = [
						item.name,
						item.customer,
						item.customer_name,
						item.return_against,
						item.status,
						item.pos_profile,
						item.owner,
						item.modified_by,
						item.custom_created_by_name,
						item.custom_submitted_by_name,
					]
						.filter(Boolean)
						.map((entry) => String(entry).toLowerCase());
					if (!haystack.some((entry) => entry.includes(needle))) return false;
				}
				if (status && status !== "All" && String(item.status || "") !== status) return false;
				return this.inRange(
					item.posting_date,
					this.normalizeDate(fromDate),
					this.normalizeDate(toDate),
				);
			});
		},
		resolveSupervisorProfileScope() {
			if (!this.isSupervisorScope()) return null;
			const selectedProfile = this.selectedSupervisorPosProfile;
			if (selectedProfile && selectedProfile !== "All") return selectedProfile;
			return selectedProfile === "All" ? null : this.posProfile?.name || null;
		},
		initializeSupervisorProfileScope() {
			if (!this.isSupervisorScope()) {
				this.selectedSupervisorPosProfile = null;
				this.supervisorPosProfiles = [];
				return;
			}
			const currentProfile = this.posProfile?.name || null;
			this.suppressSupervisorProfileRefresh = true;
			if (
				!this.selectedSupervisorPosProfile ||
				(this.selectedSupervisorPosProfile !== "All" &&
					![currentProfile, ...(this.supervisorPosProfiles || [])]
						.filter(Boolean)
						.includes(this.selectedSupervisorPosProfile))
			) {
				this.selectedSupervisorPosProfile = currentProfile;
			}
			this.suppressSupervisorProfileRefresh = false;
		},
		async loadSupervisorPosProfiles() {
			if (!this.isSupervisorScope()) {
				this.supervisorPosProfiles = [];
				return;
			}
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "POS Profile",
						filters: {
							company: this.posProfile?.company,
						},
						fields: ["name"],
						order_by: "name asc",
						limit_page_length: 0,
					},
				});
				this.supervisorPosProfiles = Array.isArray(message)
					? message.map((entry) => entry.name).filter(Boolean)
					: [];
				this.initializeSupervisorProfileScope();
			} catch (error) {
				console.error("Error loading supervisor POS profiles:", error);
				this.supervisorPosProfiles = this.posProfile?.name ? [this.posProfile.name] : [];
			}
		},
		matchesRepairCandidatePattern(invoice) {
			return Boolean(
				invoice &&
					!Number(invoice?.is_return || 0) &&
					Number(invoice?.change_amount || 0) > 0 &&
					Number(invoice?.outstanding_amount || 0) < 0,
			);
		},
		async refreshRepairCandidates(invoices = this.historyInvoices) {
			const candidateInvoices = Array.isArray(invoices)
				? invoices.filter((invoice) => this.matchesRepairCandidatePattern(invoice))
				: [];

			if (!candidateInvoices.length) {
				this.repairCandidateInvoiceNames = [];
				this.repairedChangeAllocationInvoiceNames = [];
				this.repairCandidateScopeReady = true;
				return;
			}

			try {
				const invoicesByDoctype = candidateInvoices.reduce((groups, invoice) => {
					const doctype = invoice?.doctype || this.currentInvoiceDoctype || "Sales Invoice";
					if (!groups[doctype]) groups[doctype] = [];
					groups[doctype].push(invoice.name);
					return groups;
				}, {});
				const responses = await Promise.all(
					Object.entries(invoicesByDoctype).map(async ([doctype, invoiceNames]) => {
						const { message } = await frappe.call({
							method: "posawesome.posawesome.api.payments.repair_overpayment_change_allocations",
							args: {
								doctype,
								invoice_names: invoiceNames,
								company: this.posProfile?.company || null,
								dry_run: 1,
								limit: Math.min(invoiceNames.length, 500),
							},
						});
						return message || {};
					}),
				);
				this.repairCandidateInvoiceNames = responses.flatMap((message) =>
					Array.isArray(message?.matched)
						? message.matched.map((entry) => entry?.invoice).filter(Boolean)
						: [],
				);
				this.repairedChangeAllocationInvoiceNames = responses.flatMap((message) =>
					Array.isArray(message?.skipped)
						? message.skipped
								.filter((entry) => entry?.reason === "already_allocated")
								.map((entry) => entry.invoice)
								.filter(Boolean)
						: [],
				);
				this.repairCandidateScopeReady = true;
			} catch (error) {
				console.error("Error refreshing repair candidates:", error);
				this.repairCandidateInvoiceNames = [];
				this.repairedChangeAllocationInvoiceNames = [];
				this.repairCandidateScopeReady = false;
			}
		},
		historyInvoiceDoctypes() {
			if (this.currentInvoiceDoctype === "POS Invoice") return ["POS Invoice", "Sales Invoice"];
			return [this.currentInvoiceDoctype || "Sales Invoice"];
		},
		isSupervisorScope() {
			return Boolean(this.currentCashier?.is_supervisor && this.posProfile?.company);
		},
		buildInvoiceFilters(baseFilters = {}) {
			const filters = { ...baseFilters, docstatus: 1 };
			if (this.isSupervisorScope()) {
				filters.company = this.posProfile.company;
				const scopedProfile =
					typeof this.resolveSupervisorProfileScope === "function"
						? this.resolveSupervisorProfileScope()
						: null;
				if (scopedProfile) filters.pos_profile = scopedProfile;
				else delete filters.pos_profile;
				delete filters.posa_pos_opening_shift;
				return filters;
			}
			filters.pos_profile = this.posProfile?.name;
			return filters;
		},
		getInvoiceListFields(extraFields = []) {
			return [
				"name",
				"customer",
				"customer_name",
				"posting_date",
				"posting_time",
				"grand_total",
				"paid_amount",
				"outstanding_amount",
				"status",
				"currency",
				"pos_profile",
				"owner",
				"modified_by",
				...extraFields,
			];
		},
		sortInvoicesByLatest(items) {
			return [...items].sort(
				(left, right) => this.invoiceSortValue(right) - this.invoiceSortValue(left),
			);
		},
		invoiceSortValue(invoice) {
			const postingDate = this.normalizeDate(invoice?.posting_date) || "0000-00-00";
			const postingTime = this.normalizePostingTime(invoice?.posting_time);
			const modified = String(invoice?.modified || "");
			const createdAt = String(invoice?.created_at || "");
			const timestamp = this.toPostingTimestamp(postingDate, postingTime);
			if (!Number.isNaN(timestamp)) return timestamp;
			const createdTimestamp = Date.parse(createdAt);
			if (!Number.isNaN(createdTimestamp)) return createdTimestamp;
			const modifiedTimestamp = Date.parse(modified);
			if (!Number.isNaN(modifiedTimestamp)) return modifiedTimestamp;
			return 0;
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
		changeAllocationRepairState(invoice) {
			const matchesRepairPattern =
				typeof this.matchesRepairCandidatePattern === "function"
					? this.matchesRepairCandidatePattern(invoice)
					: Boolean(
							invoice &&
								!Number(invoice?.is_return || 0) &&
								Number(invoice?.change_amount || 0) > 0 &&
								Number(invoice?.outstanding_amount || 0) < 0,
						);
			if (!matchesRepairPattern) return null;
			if (this.repairCandidateScopeReady) {
				if (
					Array.isArray(this.repairedChangeAllocationInvoiceNames) &&
					this.repairedChangeAllocationInvoiceNames.includes(invoice?.name)
				) {
					return "repaired";
				}
				return "candidate";
			}
			return "candidate";
		},
		repairStateLabel(state) {
			if (state === "repaired") return __("Repaired");
			if (state === "candidate") return __("Repair Candidate");
			return "";
		},
		repairStateColor(state) {
			if (state === "repaired") return "success";
			if (state === "candidate") return "warning";
			return "primary";
		},
		isRepairCandidate(invoice) {
			const repairState =
				typeof this.changeAllocationRepairState === "function"
					? this.changeAllocationRepairState(invoice)
					: typeof this.matchesRepairCandidatePattern === "function" &&
						  this.matchesRepairCandidatePattern(invoice)
						? "candidate"
						: null;
			return repairState === "candidate";
		},
		async runRepairChangeAllocation(invoice, dryRun = true) {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.payments.repair_overpayment_change_allocations",
				args: {
					doctype: invoice.doctype || this.currentInvoiceDoctype || "Sales Invoice",
					invoice_names: [invoice.name],
					company: this.posProfile?.company || invoice.company || null,
					dry_run: dryRun ? 1 : 0,
				},
				freeze: !dryRun,
				freeze_message: dryRun ? undefined : __("Repairing change allocation"),
			});
			return response?.message || {};
		},
		async repairChangeAllocation(invoice) {
			const repairState =
				typeof this.changeAllocationRepairState === "function"
					? this.changeAllocationRepairState(invoice)
					: typeof this.isRepairCandidate === "function" && this.isRepairCandidate(invoice)
						? "candidate"
						: null;
			if (repairState === "repaired") {
				this.toastStore.show({ title: __("This invoice is already repaired"), color: "info" });
				return;
			}
			if (repairState !== "candidate") {
				this.toastStore.show({
					title: __("This invoice does not need change-allocation repair"),
					color: "info",
				});
				return;
			}
			if (isOffline()) {
				this.toastStore.show({ title: __("Repair requires an online connection"), color: "warning" });
				return;
			}

			this.repairChangeLoading = true;
			try {
				const preview = await this.runRepairChangeAllocation(invoice, true);
				if (
					!Array.isArray(preview?.matched) ||
					preview.matched.length !== 1 ||
					(preview?.skipped || []).length
				) {
					this.toastStore.show({
						title: __("No exact repair match found for this invoice"),
						color: "warning",
					});
					return;
				}

				const result = await this.runRepairChangeAllocation(invoice, false);
				if (!Array.isArray(result?.repaired) || !result.repaired.length) {
					this.toastStore.show({ title: __("Unable to repair change allocation"), color: "error" });
					return;
				}

				await this.viewInvoice(invoice);
				await this.refreshAll();
				this.toastStore.show({ title: __("Change allocation repaired"), color: "success" });
			} catch (error) {
				console.error("Error repairing change allocation:", error);
				this.toastStore.show({ title: __("Unable to repair change allocation"), color: "error" });
			} finally {
				this.repairChangeLoading = false;
			}
		},
		draftItemCount(invoice) {
			if (Array.isArray(invoice?.items)) return invoice.items.length;
			if (Number.isFinite(Number(invoice?.items_count))) return Number(invoice.items_count);
			return 0;
		},
		draftSourceChipLabel(invoice) {
			if (this.currentDraftSource === "invoice") return __("Draft");
			if (this.currentDraftSource === "quote") return __(invoice?.status || "Quote");
			if (this.currentDraftSource === "delivery") return __("Delivered");
			return __("Order");
		},
		draftSecondaryMetaLabel(invoice) {
			if (this.currentDraftSource === "invoice") {
				return {
					label: __("Items"),
					value: this.draftItemCount(invoice),
				};
			}
			return {
				label: __("Status"),
				value: __(invoice?.status || this.currentDraftSourceOption.label),
			};
		},
		draftActions(invoice) {
			return getDocumentFlowActionsForRecord(invoice || { source: this.currentDraftSource });
		},
		draftActionLabel(action) {
			return __(getDocumentFlowActionLabel(action));
		},
		draftActionColor(action) {
			if (action === "quote_submit") return "warning";
			if (action === "order_to_delivery_note") return "success";
			if (
				action === "order_to_invoice" ||
				action === "quote_to_invoice" ||
				action === "delivery_to_invoice"
			) {
				return "primary";
			}
			if (action === "quote_to_order" || action === "order_load" || action === "quote_edit_draft") {
				return this.currentDraftSourceOption.color;
			}
			return this.currentDraftSourceOption.color;
		},
		isPrimaryDraftAction(action) {
			return action !== "quote_submit" && action !== "order_to_delivery_note";
		},
		async runDraftAction(invoice, action) {
			if (!invoice?.name || !action) {
				return;
			}

			try {
				if (action === "invoice_load_draft") {
					await this.loadDraft(invoice);
					return;
				}

				if (action === "quote_submit" || action === "order_to_delivery_note") {
					const result = await commitDocumentFlowAction({
						action,
						source: invoice?.source || this.currentDraftSource,
						record: invoice,
					});
					if (action === "quote_submit") {
						this.toastStore.show({ title: __("Quotation submitted"), color: "success" });
						await this.loadDrafts();
						return;
					}

					if (result?.result?.name) {
						this.toastStore.show({
							title: __("Delivery Note {0} created", [result.result.name]),
							color: "success",
						});
					} else {
						this.toastStore.show({ title: __("Delivery note created"), color: "success" });
					}
					this.draftSource = "delivery";
					this.uiStore.setInvoiceManagementDraftSource("delivery");
					await this.loadDrafts();
					return;
				}

				const prepared = await prepareDocumentFlowAction({
					action,
					source: invoice?.source || this.currentDraftSource,
					record: invoice,
					currentInvoiceDoctype: this.currentInvoiceDoctype,
				});
				if (!prepared?.prepared_doc) {
					this.toastStore.show({ title: __("Unable to prepare document"), color: "error" });
					return;
				}
				this.invoiceStore.triggerLoadFlow?.(prepared);
				this.uiStore.closeInvoiceManagement();
			} catch (error) {
				console.error("Error running draft action:", error);
				this.toastStore.show({ title: __("Unable to process document action"), color: "error" });
			}
		},
		async updateDraftSource(source) {
			const nextSource = getDefaultCommercialDocumentSource(this.posProfile, source);
			if (this.draftSource === nextSource) return;
			this.draftSource = nextSource;
			this.uiStore.setInvoiceManagementDraftSource(nextSource);
			if (this.activeTab === "drafts") {
				await this.loadDrafts();
			}
		},
		async refreshAll() {
			this.resetPagination();
			await Promise.all([this.loadUnpaidInvoices(), this.loadHistory(), this.loadDrafts()]);
		},
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
				const filters = this.buildInvoiceFilters({
					is_return: 0,
					outstanding_amount: [">", 0],
				});
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: this.currentInvoiceDoctype,
						filters,
						fields: this.getInvoiceListFields(["due_date"]),
						order_by: "posting_date desc, posting_time desc, modified desc",
						limit_page_length: 0,
					},
				});
				this.unpaidInvoices = Array.isArray(message)
					? message.map((entry) => ({ ...entry, doctype: this.currentInvoiceDoctype }))
					: [];
			} catch (error) {
				console.error("Error loading unpaid invoices:", error);
				this.toastStore.show({ title: __("Unable to fetch unpaid invoices"), color: "error" });
			} finally {
				this.loading = false;
			}
		},
		async loadHistory() {
			if (!this.posProfile?.name) {
				this.historyInvoices = [];
				this.repairCandidateInvoiceNames = [];
				this.repairedChangeAllocationInvoiceNames = [];
				this.repairCandidateScopeReady = false;
				return;
			}
			this.loading = true;
			try {
				const filters = this.buildInvoiceFilters();
				const doctypes =
					typeof this.historyInvoiceDoctypes === "function"
						? this.historyInvoiceDoctypes()
						: this.currentInvoiceDoctype === "POS Invoice"
							? ["POS Invoice", "Sales Invoice"]
							: [this.currentInvoiceDoctype || "Sales Invoice"];
				const results = await Promise.all(
					doctypes.map(async (doctype) => {
						const { message } = await frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype,
								filters,
								fields: this.getInvoiceListFields([
									"change_amount",
									"is_return",
									"return_against",
								]),
								order_by: "posting_date desc, posting_time desc, modified desc",
								limit_page_length: 0,
							},
						});
						return Array.isArray(message) ? message.map((entry) => ({ ...entry, doctype })) : [];
					}),
				);
				this.historyInvoices = results.flat();
				if (typeof this.refreshRepairCandidates === "function") {
					await this.refreshRepairCandidates(this.historyInvoices);
				}
			} catch (error) {
				console.error("Error loading invoice history:", error);
				this.toastStore.show({ title: __("Unable to fetch invoice history"), color: "error" });
				this.repairCandidateInvoiceNames = [];
				this.repairedChangeAllocationInvoiceNames = [];
				this.repairCandidateScopeReady = false;
			} finally {
				this.loading = false;
			}
		},
		async loadDrafts() {
			if (!this.posProfile?.name) {
				this.draftRecordsBySource[this.currentDraftSource] = [];
				return;
			}
			this.loading = true;
			try {
				const records = await fetchDocumentSourceRecords({
					source: this.currentDraftSource,
					posOpeningShift: this.posOpeningShift,
					posProfile: this.posProfile,
					currentInvoiceDoctype: this.currentInvoiceDoctype,
					isSupervisorScope: this.isSupervisorScope(),
					resolveSupervisorProfileScope: () =>
						typeof this.resolveSupervisorProfileScope === "function"
							? this.resolveSupervisorProfileScope()
							: null,
					resolveCashierProfileScope: () => this.posProfile?.name || null,
					resolveCashierScope: () => this.currentCashier?.user || null,
				});
				this.draftRecordsBySource = {
					...this.draftRecordsBySource,
					[this.currentDraftSource]: records,
				};
				this.uiStore.setInvoiceManagementDraftSource(this.currentDraftSource);
			} catch (error) {
				console.error("Error loading source records:", error);
				this.toastStore.show({ title: __("Unable to fetch documents"), color: "error" });
			} finally {
				this.loading = false;
			}
		},
		async viewInvoice(invoice) {
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get",
					args: { doctype: invoice.doctype || this.currentInvoiceDoctype, name: invoice.name },
				});
				this.selectedInvoiceDetail = message || null;
				this.detailDialog = !!message;
			} catch (error) {
				console.error("Error loading invoice details:", error);
				this.toastStore.show({ title: __("Unable to load invoice details"), color: "error" });
			}
		},
		async loadDraft(invoice) {
			try {
				await loadDocumentSourceRecord({
					source: invoice?.source || this.currentDraftSource,
					record: invoice,
					posProfile: this.posProfile,
					currentInvoiceDoctype: this.currentInvoiceDoctype,
					invoiceStore: this.invoiceStore,
					uiStore: this.uiStore,
					closeDrafts: true,
					closeInvoiceManagement: true,
				});
			} catch (error) {
				console.error("Error loading source record:", error);
				this.toastStore.show({ title: __("Unable to load document"), color: "error" });
			}
		},
		async deleteDraft(invoice) {
			if (!this.canDeleteActiveDraftSource) return;
			if (!window.confirm(__("Delete draft invoice {0}?", [invoice.name]))) return;
			try {
				await frappe.call({
					method: "posawesome.posawesome.api.invoices.delete_invoice",
					args: { invoice: invoice.name },
				});
				this.toastStore.show({ title: __("Draft invoice deleted"), color: "success" });
				await this.loadDrafts();
			} catch (error) {
				console.error("Error deleting draft invoice:", error);
				this.toastStore.show({ title: __("Unable to delete draft invoice"), color: "error" });
			}
		},
		async createReturn(invoice) {
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.invoices.get_invoice_for_return",
					args: {
						invoice_name: invoice.name,
						pos_profile: this.posProfile?.name,
						doctype: invoice.doctype || this.currentInvoiceDoctype,
					},
				});
				const returnDoc = message;
				if (!returnDoc || !Array.isArray(returnDoc.items) || !returnDoc.items.length) {
					this.toastStore.show({
						title: __("No returnable items found for this invoice"),
						color: "warning",
					});
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
					payments: Array.isArray(returnDoc.payments)
						? returnDoc.payments.map((payment) => ({
								mode_of_payment: payment.mode_of_payment,
								amount: payment.amount,
								base_amount: payment.base_amount,
								default: payment.default,
								account: payment.account,
								type: payment.type,
								currency: payment.currency,
								conversion_rate: payment.conversion_rate,
							}))
						: [],
					grand_total:
						returnDoc.grand_total > 0 ? returnDoc.grand_total * -1 : returnDoc.grand_total,
					update_stock: 1,
					pos_profile: this.posProfile?.name,
					company: this.posProfile?.company,
				};
				this.eventBus?.emit("load_return_invoice", {
					invoice_doc: invoiceDoc,
					return_doc: returnDoc,
				});
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
			this.uiStore.setPaymentRouteTarget({
				invoiceName: invoice.name,
				customer,
				currency: invoice.currency || this.posProfile?.currency || null,
			});
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
			let url =
				frappe.urllib.get_base_url() +
				"/printview?doctype=" +
				encodeURIComponent(doctype) +
				"&name=" +
				encodeURIComponent(invoice.name) +
				"&trigger_print=1&format=" +
				encodeURIComponent(printFormat) +
				"&no_letterhead=" +
				(letterHead ? "0" : "1");
			if (letterHead) url += "&letterhead=" + encodeURIComponent(letterHead);
			url = appendDebugPrintParam(url, debugPrint);
			const printOptions = { allowOfflineFallback: isOffline(), triggerPrint: "1", debugPrint };
			if (useSilentPrint && !isOffline()) {
				try {
					await printDocumentViaQz({
						doctype,
						name: invoice.name,
						printFormat,
						letterhead: letterHead || null,
						noLetterhead: letterHead ? "0" : "1",
					});
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
		async shareInvoice(invoice) {
			if (this.isSharingInvoice) return;
			this.isSharingInvoice = true;
			try {
				const profile = this.posProfile;
				if (!invoice?.name || !profile) return;
				const doctype = invoice.doctype || this.currentInvoiceDoctype;
				const printFormat = profile.print_format_for_online || profile.print_format || "Standard";
				const pdf_url = buildInvoicePdfUrl({ doctype, name: invoice.name, format: printFormat });
				const response = await fetch(pdf_url, {
					headers: { "X-Frappe-CSRF-Token": frappe.csrf_token },
				});
				if (!response.ok) throw new Error(__("Failed to download invoice. Status: {0}", [response.status]));
				const blob = await response.blob();
				const file = new File([blob], `${invoice.name}.pdf`, { type: "application/pdf" });
				if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
					try {
						await navigator.share({
							title: __("Sales Invoice"),
							text: __("Invoice No: {0}", [invoice.name]),
							files: [file],
						});
					} catch (shareError) {
						if (shouldDownloadPdfForShareError(shareError)) {
							this.downloadInvoicePdf(blob, invoice.name);
						}
					}
				} else {
					this.downloadInvoicePdf(blob, invoice.name);
				}
			} catch (error) {
				this.eventBus?.emit?.("show_message", {
					title: error.message || __("Failed to share invoice"),
					color: "error",
				});
			} finally {
				this.isSharingInvoice = false;
			}
		},
		downloadInvoicePdf(blob, name) {
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${name}.pdf`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		},
	},
};
</script>

<style scoped>
.invoice-management-dialog-content {
	background: transparent !important;
}

.invoice-management-card {
	background:
		radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 28%),
		radial-gradient(circle at top left, rgba(245, 158, 11, 0.12), transparent 24%),
		var(--pos-surface-raised) !important;
	color: var(--pos-text-primary) !important;
	border: 1px solid rgba(148, 163, 184, 0.18);
	display: flex;
	flex-direction: column;
	max-height: min(94vh, 1040px);
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

.invoice-tabs-shell {
	padding: 0 8px 8px;
}

.view-toggle-group {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px;
	border-radius: 12px;
	background: rgba(148, 163, 184, 0.08);
}

.supervisor-profile-select {
	min-width: 220px;
	max-width: 280px;
}

.invoice-tabs {
	background: rgba(148, 163, 184, 0.08);
	border-radius: 16px;
	padding: 6px;
}

.invoice-management-card--dark .invoice-tabs {
	background: rgba(15, 23, 42, 0.46);
}

.invoice-management-card--dark .view-toggle-group {
	background: rgba(15, 23, 42, 0.46);
}

.invoice-tab-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
}

.invoice-management-card__body {
	min-height: 580px;
	flex: 1;
	overflow: auto;
}

.invoice-management-footer {
	position: sticky;
	bottom: 0;
	z-index: 2;
	display: flex;
	justify-content: flex-end;
	padding: 14px 20px calc(14px + env(safe-area-inset-bottom, 0px));
	background: color-mix(in srgb, var(--pos-surface-raised) 92%, transparent);
	backdrop-filter: blur(10px);
	border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

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

.summary-tile--history {
	background: linear-gradient(145deg, rgba(239, 246, 255, 0.98), rgba(219, 234, 254, 0.88));
}
.summary-tile--primary {
	background: linear-gradient(145deg, rgba(224, 231, 255, 0.98), rgba(199, 210, 254, 0.88));
}
.summary-tile--success {
	background: linear-gradient(145deg, rgba(236, 253, 245, 0.98), rgba(209, 250, 229, 0.88));
}
.summary-tile--warning {
	background: linear-gradient(145deg, rgba(255, 251, 235, 0.98), rgba(254, 243, 199, 0.88));
}
.summary-tile--warning-strong {
	background: linear-gradient(145deg, rgba(255, 247, 237, 0.98), rgba(254, 215, 170, 0.9));
}
.summary-tile--danger {
	background: linear-gradient(145deg, rgba(254, 242, 242, 0.98), rgba(254, 202, 202, 0.88));
}

.history-repair-toggle {
	min-height: 40px;
	justify-content: space-between;
}

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

.invoice-management-card--dark .summary-tile__label {
	color: rgba(226, 232, 240, 0.88);
	opacity: 1;
}

.invoice-management-card--dark .summary-tile__value {
	color: rgb(248, 250, 252);
}

.invoice-management-card--dark .summary-tile__meta {
	color: rgba(226, 232, 240, 0.78);
	opacity: 1;
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

.draft-source-toolbar {
	display: flex;
	align-items: center;
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

.invoice-record-grid--history {
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
.invoice-record-grid--unpaid {
	grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
}
.invoice-record-grid--drafts {
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
.invoice-record-grid--returns {
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.tab-pagination {
	margin-top: 16px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
}

.tab-pagination__meta {
	font-size: 0.8rem;
	color: var(--pos-text-secondary);
}

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

.invoice-record-card__hero--warm {
	background: linear-gradient(135deg, rgba(255, 247, 237, 0.98), rgba(255, 237, 213, 0.9));
}
.invoice-record-card__hero--draft {
	background: linear-gradient(135deg, rgba(245, 243, 255, 0.98), rgba(233, 213, 255, 0.9));
}
.invoice-record-card__hero--return {
	background: linear-gradient(135deg, rgba(254, 242, 242, 0.98), rgba(254, 202, 202, 0.9));
}

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

.invoice-record-card__amount-block {
	text-align: right;
}

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

.invoice-record-card__content {
	padding: 18px 20px;
}

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

.invoice-management-card--dark .invoice-record-card__hero--draft {
	background: linear-gradient(135deg, rgba(76, 29, 149, 0.96), rgba(88, 28, 135, 0.44));
}

.invoice-management-card--dark .invoice-record-card__hero--return {
	background: linear-gradient(135deg, rgba(127, 29, 29, 0.96), rgba(153, 27, 27, 0.42));
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

.meta-pair-grid--compact {
	margin-bottom: 16px;
}

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

.meta-pair__value--success {
	color: rgb(22, 163, 74);
}
.meta-pair__value--warning {
	color: rgb(217, 119, 6);
}

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

.invoice-record-card--success .invoice-record-card__hero {
	background: linear-gradient(135deg, rgba(236, 253, 245, 0.98), rgba(209, 250, 229, 0.9));
}
.invoice-record-card--warning .invoice-record-card__hero {
	background: linear-gradient(135deg, rgba(255, 251, 235, 0.98), rgba(254, 243, 199, 0.9));
}
.invoice-record-card--error .invoice-record-card__hero {
	background: linear-gradient(135deg, rgba(254, 242, 242, 0.98), rgba(254, 202, 202, 0.9));
}
.invoice-record-card--info .invoice-record-card__hero {
	background: linear-gradient(135deg, rgba(240, 249, 255, 0.98), rgba(224, 242, 254, 0.9));
}

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

.invoice-detail-card--dark .summary-tile {
	border-color: rgba(100, 116, 139, 0.34);
	background: linear-gradient(145deg, rgba(36, 43, 51, 0.98), rgba(26, 32, 40, 0.96));
	box-shadow: 0 18px 40px rgba(2, 6, 23, 0.32);
}

.invoice-detail-card--dark .summary-tile__label {
	color: rgba(226, 232, 240, 0.84);
	opacity: 1;
}

.invoice-detail-card--dark .summary-tile__value {
	color: rgb(248, 250, 252);
}

@media (max-width: 960px) {
	.invoice-management-card {
		max-height: 100vh;
		border-radius: 0;
	}

	.invoice-record-card__hero {
		flex-direction: column;
	}
	.invoice-record-card__amount-block {
		text-align: left;
	}
	.invoice-management-footer {
		padding-inline: 16px;
		justify-content: stretch;
	}
	.invoice-management-footer :deep(.v-btn) {
		flex: 1;
	}
}

@media (max-width: 640px) {
	.meta-pair-grid {
		grid-template-columns: 1fr;
	}
	.invoice-record-card__actions {
		justify-content: stretch;
	}
	.tab-pagination {
		justify-content: center;
	}
	.tab-pagination__meta {
		width: 100%;
		text-align: center;
	}
}
</style>
