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
				data-testid="invoice-management-dialog"
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
									tabCountLabel("history", filteredHistoryInvoices.length)
								}}</v-chip>
							</div>
						</v-tab>
						<v-tab value="partial">
							<div class="invoice-tab-label">
								<span>{{ __("Unpaid") }}</span>
								<v-chip size="x-small" variant="flat" color="warning">{{
									tabCountLabel("partial", filteredUnpaidInvoices.length)
								}}</v-chip>
							</div>
						</v-tab>
						<v-tab value="drafts">
							<div class="invoice-tab-label">
								<span>{{ __("Drafts") }}</span>
								<v-chip size="x-small" variant="flat" color="secondary">{{
									tabCountLabel("drafts", filteredDraftInvoices.length)
								}}</v-chip>
							</div>
						</v-tab>
						<v-tab value="returns">
							<div class="invoice-tab-label">
								<span>{{ __("Returns") }}</span>
								<v-chip size="x-small" variant="flat" color="error">{{
									tabCountLabel("returns", filteredReturnInvoices.length)
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
								<DateRangeFilter
									v-model:from-date="historyDateFrom"
									v-model:to-date="historyDateTo"
									:aria-label="__('History date range')"
									:start-label="__('Start date')"
									:end-label="__('End date')"
									:preset-label="__('Quick date ranges')"
									:today-label="__('Today')"
									:seven-days-label="__('7 days')"
									:thirty-days-label="__('30 days')"
									:clear-label="__('Clear')"
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
								<v-btn
									v-if="hasHistoryFilters"
									variant="text"
									color="error"
									prepend-icon="mdi-filter-remove-outline"
									@click="resetHistoryFilters"
								>
									{{ __("Reset filters") }}
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
											v-if="modificationCount(item)"
											size="small"
											color="secondary"
											variant="tonal"
										>
											{{ modificationLabel(item) }}
										</v-chip>
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
											v-if="canEditSubmittedInvoice(item)"
											icon="mdi-pencil-outline"
											variant="text"
											size="small"
											color="primary"
											:data-testid="`invoice-management-edit-${item.name}`"
											:title="__('Edit Invoice')"
											:aria-label="__('Edit submitted invoice')"
											@click="openEditInvoice(item)"
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
													v-if="modificationCount(invoice)"
													size="small"
													color="secondary"
													variant="tonal"
												>
													{{ modificationLabel(invoice) }}
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
											v-if="canEditSubmittedInvoice(invoice)"
											icon="mdi-pencil-outline"
											size="small"
											variant="text"
											color="primary"
											:data-testid="`invoice-management-edit-${invoice.name}`"
											:title="__('Edit Invoice')"
											:aria-label="__('Edit submitted invoice')"
											@click="openEditInvoice(invoice)"
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
								<DateRangeFilter
									v-model:from-date="partialDateFrom"
									v-model:to-date="partialDateTo"
									color="warning"
									:aria-label="__('Unpaid invoice date range')"
									:start-label="__('Start date')"
									:end-label="__('End date')"
									:preset-label="__('Quick date ranges')"
									:today-label="__('Today')"
									:seven-days-label="__('7 days')"
									:thirty-days-label="__('30 days')"
									:clear-label="__('Clear')"
								/>
								<v-btn
									v-if="hasPartialFilters"
									variant="text"
									color="error"
									prepend-icon="mdi-filter-remove-outline"
									@click="resetPartialFilters"
								>
									{{ __("Reset filters") }}
								</v-btn>
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
									><div class="d-flex flex-wrap ga-1">
										<v-chip
											size="small"
											:color="statusColor(item.status)"
											variant="tonal"
											>{{ __(item.status || "Unpaid") }}</v-chip
										>
										<v-chip
											v-if="modificationCount(item)"
											size="small"
											color="secondary"
											variant="tonal"
										>
											{{ modificationLabel(item) }}
										</v-chip>
									</div></template
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
											v-if="canEditSubmittedInvoice(item)"
											icon="mdi-pencil-outline"
											variant="text"
											size="small"
											color="primary"
											:data-testid="`invoice-management-edit-${item.name}`"
											:title="__('Edit Invoice')"
											:aria-label="__('Edit submitted invoice')"
											@click="openEditInvoice(item)"
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
												<v-chip
													v-if="modificationCount(invoice)"
													size="small"
													color="secondary"
													variant="tonal"
												>
													{{ modificationLabel(invoice) }}
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
											v-if="canEditSubmittedInvoice(invoice)"
											icon="mdi-pencil-outline"
											size="small"
											variant="text"
											color="primary"
											:data-testid="`invoice-management-edit-${invoice.name}`"
											:title="__('Edit Invoice')"
											:aria-label="__('Edit submitted invoice')"
											@click="openEditInvoice(invoice)"
										/>
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
								<DateRangeFilter
									v-model:from-date="draftDateFrom"
									v-model:to-date="draftDateTo"
									color="secondary"
									:aria-label="__('Draft document date range')"
									:start-label="__('Start date')"
									:end-label="__('End date')"
									:preset-label="__('Quick date ranges')"
									:today-label="__('Today')"
									:seven-days-label="__('7 days')"
									:thirty-days-label="__('30 days')"
									:clear-label="__('Clear')"
								/>
								<v-btn
									v-if="hasDraftFilters"
									variant="text"
									color="error"
									prepend-icon="mdi-filter-remove-outline"
									@click="resetDraftFilters"
								>
									{{ __("Reset filters") }}
								</v-btn>
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
								<DateRangeFilter
									v-model:from-date="returnDateFrom"
									v-model:to-date="returnDateTo"
									color="error"
									:aria-label="__('Return invoice date range')"
									:start-label="__('Start date')"
									:end-label="__('End date')"
									:preset-label="__('Quick date ranges')"
									:today-label="__('Today')"
									:seven-days-label="__('7 days')"
									:thirty-days-label="__('30 days')"
									:clear-label="__('Clear')"
								/>
								<v-btn
									v-if="hasReturnFilters"
									variant="text"
									color="error"
									prepend-icon="mdi-filter-remove-outline"
									@click="resetReturnFilters"
								>
									{{ __("Reset filters") }}
								</v-btn>
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

	<v-dialog
		v-model="editDialog"
		max-width="1160px"
		scrollable
		content-class="invoice-edit-modal-content"
		:theme="isDarkTheme ? 'dark' : 'light'"
	>
		<v-card
			tabindex="0"
			:class="[
				'invoice-detail-card',
				isDarkTheme ? 'invoice-detail-card--dark' : 'invoice-detail-card--light',
			]"
			data-testid="invoice-edit-modal"
			@keydown.capture="handleEditModalKeydown"
			@click.capture="handleEditModalClick"
		>
			<v-card-title class="d-flex align-center justify-space-between flex-wrap ga-3">
				<div>
					<div class="text-h6">{{ editInvoiceOriginal?.name || __("Edit Invoice") }}</div>
					<div class="text-subtitle-2 text-medium-emphasis">
						{{ editInvoiceDoc?.customer_name || editInvoiceDoc?.customer || "" }}
					</div>
				</div>
				<div class="d-flex align-center ga-2">
					<v-chip v-if="editInvoiceDoc?.doctype" size="small" color="primary" variant="tonal">
						{{ __(editInvoiceDoc.doctype) }}
					</v-chip>
					<v-chip
						v-if="editEligibility?.edit_window_hours"
						size="small"
						color="warning"
						variant="tonal"
					>
						{{ __("{0}h window", [editEligibility.edit_window_hours]) }}
					</v-chip>
					<v-btn
						icon="mdi-close"
						variant="text"
						class="edit-key-field"
						data-edit-nav="close"
						:aria-label="__('Close edit invoice dialog')"
						@click="closeEditInvoice"
					/>
				</div>
			</v-card-title>
			<v-divider />
			<v-card-text v-if="editLoading" class="tab-loader">
				<v-progress-circular indeterminate color="primary" size="28" width="3" />
				<span>{{ __("Loading editable invoice...") }}</span>
			</v-card-text>
			<v-card-text v-else-if="editInvoiceDoc">
				<v-alert v-if="editError" type="error" variant="tonal" density="compact" class="mb-4">
					{{ editError }}
				</v-alert>
				<div class="summary-grid mb-4">
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Current Total") }}</div>
						<div class="summary-tile__value">
							{{ currencySymbol(editInvoiceDoc.currency) }}
							{{ formatCurrency(editInvoiceDoc.grand_total || 0) }}
						</div>
					</div>
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Preview Total") }}</div>
						<div class="summary-tile__value">
							<v-progress-circular
								v-if="editPreviewLoading"
								indeterminate
								color="primary"
								size="18"
								width="2"
								class="me-2"
							/>
							{{ currencySymbol(editPreviewDoc?.currency || editInvoiceDoc.currency) }}
							{{ formatCurrency((editPreviewDoc || editInvoiceDoc).grand_total || 0) }}
						</div>
					</div>
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Payment Applied") }}</div>
						<div class="summary-tile__value">
							{{ currencySymbol(editSettlementCurrency) }}
							{{ formatCurrency(editAutoPaymentTotal) }}
						</div>
					</div>
					<div class="summary-tile">
						<div class="summary-tile__label">{{ __("Cash Difference") }}</div>
						<div class="summary-tile__value">
							{{ currencySymbol(editSettlementCurrency) }}
							{{ formatCurrency(Math.abs(editSettlementDelta)) }}
						</div>
						<div class="summary-tile__meta">
							{{ editSettlementLabel }}
						</div>
					</div>
				</div>
				<div
					class="edit-settlement-summary mb-4"
					:class="editSettlementSummaryClass"
					data-testid="invoice-edit-settlement-summary"
				>
					<div>
						<div class="edit-settlement-summary__label">{{ __("Cashier Action") }}</div>
						<div class="edit-settlement-summary__value">
							{{ editSettlementLabel }}
						</div>
					</div>
					<div class="edit-settlement-summary__amount">
						{{ currencySymbol(editSettlementCurrency) }}
						{{ formatCurrency(Math.abs(editSettlementDelta)) }}
					</div>
				</div>

				<div class="edit-form-grid mb-4">
					<v-text-field
						v-model="editInvoiceDoc.customer"
						variant="outlined"
						density="compact"
						hide-details
						class="edit-key-field"
						data-edit-nav="customer"
						data-testid="invoice-edit-customer"
						:label="__('Customer')"
						@update:model-value="scheduleEditPreview()"
					/>
					<v-text-field
						v-model.number="editInvoiceDoc.discount_amount"
						type="number"
						variant="outlined"
						density="compact"
						hide-details
						class="edit-key-field"
						data-edit-nav="discount_amount"
						data-testid="invoice-edit-discount-amount"
						:label="__('Invoice Discount')"
						@update:model-value="scheduleEditPreview()"
					/>
					<v-text-field
						v-model.number="editInvoiceDoc.additional_discount_percentage"
						type="number"
						variant="outlined"
						density="compact"
						hide-details
						class="edit-key-field"
						data-edit-nav="additional_discount_percentage"
						data-testid="invoice-edit-additional-discount-percentage"
						:label="__('Additional Discount %')"
						@update:model-value="scheduleEditPreview()"
					/>
				</div>

				<div class="detail-section__title">{{ __("Items") }}</div>
				<v-table class="elevation-1 edit-invoice-table">
					<thead>
						<tr>
							<th>{{ __("Item") }}</th>
							<th>{{ __("Qty") }}</th>
							<th>{{ __("Rate") }}</th>
							<th>{{ __("Discount %") }}</th>
							<th>{{ __("Discount") }}</th>
							<th class="text-end">{{ __("Actions") }}</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="(item, index) in editInvoiceDoc.items || []" :key="item.name || index">
							<td>
								<div class="edit-item-title">{{ item.item_name || item.item_code }}</div>
								<div class="text-caption text-medium-emphasis">{{ item.item_code }}</div>
							</td>
							<td>
								<v-text-field
									v-model.number="item.qty"
									type="number"
									variant="outlined"
									density="compact"
									hide-details
									class="edit-number-input edit-key-field"
									:data-edit-nav="`item-${index}-qty`"
									:data-testid="`invoice-edit-item-${index}-qty`"
									:data-edit-row="index"
									data-edit-col="qty"
									data-edit-section="items"
									@update:model-value="scheduleEditPreview()"
								/>
							</td>
							<td>
								<v-text-field
									v-model.number="item.rate"
									type="number"
									variant="outlined"
									density="compact"
									hide-details
									class="edit-number-input edit-key-field"
									:data-edit-nav="`item-${index}-rate`"
									:data-testid="`invoice-edit-item-${index}-rate`"
									:data-edit-row="index"
									data-edit-col="rate"
									data-edit-section="items"
									@update:model-value="scheduleEditPreview()"
								/>
							</td>
							<td>
								<v-text-field
									v-model.number="item.discount_percentage"
									type="number"
									variant="outlined"
									density="compact"
									hide-details
									class="edit-number-input edit-key-field"
									:data-edit-nav="`item-${index}-discount_percentage`"
									:data-testid="`invoice-edit-item-${index}-discount-percentage`"
									:data-edit-row="index"
									data-edit-col="discount_percentage"
									data-edit-section="items"
									@update:model-value="scheduleEditPreview()"
								/>
							</td>
							<td>
								<v-text-field
									v-model.number="item.discount_amount"
									type="number"
									variant="outlined"
									density="compact"
									hide-details
									class="edit-number-input edit-key-field"
									:data-edit-nav="`item-${index}-discount_amount`"
									:data-testid="`invoice-edit-item-${index}-discount-amount`"
									:data-edit-row="index"
									data-edit-col="discount_amount"
									data-edit-section="items"
									@update:model-value="scheduleEditPreview()"
								/>
							</td>
							<td class="text-end">
								<v-btn
									icon="mdi-delete-outline"
									variant="text"
									size="small"
									color="error"
									class="edit-key-field"
									:data-edit-nav="`item-${index}-remove`"
									:data-edit-row="index"
									data-edit-col="remove"
									data-edit-section="items"
									:title="__('Remove Item')"
									:aria-label="__('Remove item')"
									@click="removeEditItem(index)"
								/>
							</td>
						</tr>
					</tbody>
				</v-table>
				<div class="edit-add-row mt-3">
					<v-text-field
						v-model="newEditItem.item_code"
						variant="outlined"
						density="compact"
						hide-details
						class="edit-key-field"
						data-edit-nav="new-item-code"
						data-edit-section="new-item"
						:label="__('Item Code')"
					/>
					<v-text-field
						v-model.number="newEditItem.qty"
						type="number"
						variant="outlined"
						density="compact"
						hide-details
						class="edit-key-field"
						data-edit-nav="new-item-qty"
						data-edit-section="new-item"
						:label="__('Qty')"
					/>
					<v-text-field
						v-model.number="newEditItem.rate"
						type="number"
						variant="outlined"
						density="compact"
						hide-details
						class="edit-key-field"
						data-edit-nav="new-item-rate"
						data-edit-section="new-item"
						:label="__('Rate')"
					/>
					<v-btn
						color="primary"
						variant="tonal"
						prepend-icon="mdi-plus"
						class="edit-key-field"
						data-edit-nav="new-item-add"
						data-edit-section="new-item"
						@click="addEditItem"
					>
						{{ __("Add Item") }}
					</v-btn>
				</div>

				<div class="detail-section__title mt-4">{{ __("Payments") }}</div>
				<v-table class="elevation-1 edit-invoice-table">
					<thead>
						<tr>
							<th>{{ __("Mode") }}</th>
							<th>{{ __("Amount") }}</th>
							<th>{{ __("Account") }}</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="(payment, index) in editInvoiceDoc.payments || []"
							:key="payment.name || index"
						>
							<td>{{ payment.mode_of_payment }}</td>
							<td>
								<v-text-field
									v-model.number="payment.amount"
									type="number"
									variant="outlined"
									density="compact"
									hide-details
									class="edit-number-input edit-key-field"
									:data-edit-nav="`payment-${index}-amount`"
									:data-testid="`invoice-edit-payment-${index}-amount`"
									:data-edit-row="index"
									data-edit-col="amount"
									data-edit-section="payments"
									readonly
									:label="__('Auto Adjusted')"
								/>
							</td>
							<td>{{ payment.account || "-" }}</td>
						</tr>
					</tbody>
				</v-table>
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<div class="edit-preview-status text-caption text-medium-emphasis">
					{{ editPreviewStatus }}
				</div>
				<v-btn
					color="error"
					variant="tonal"
					class="edit-key-field"
					data-edit-nav="cancel"
					:disabled="editSubmitting"
					@click="closeEditInvoice"
				>
					{{ __("Cancel") }}
				</v-btn>
				<v-btn
					color="primary"
					variant="flat"
					prepend-icon="mdi-content-save-check-outline"
					class="edit-key-field"
					data-edit-nav="submit"
					data-testid="invoice-edit-submit"
					:loading="editSubmitting"
					:disabled="editLoading || editSubmitting || isOffline()"
					@click="submitEditInvoice"
				>
					{{ __("Submit Amendment") }}
				</v-btn>
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
import {
	confirmDocumentPrintFallback,
	printDocumentViaConfiguredQz,
	shouldUseConfiguredQzDocumentPrinting,
	shouldUseRawDocumentPrinting,
} from "../../../services/documentPrint";
import { isOffline } from "../../../../offline/index";
import { buildInvoicePdfUrl, shouldDownloadPdfForShareError } from "../../../utils/invoiceSharing";
import DateRangeFilter from "../shared/DateRangeFilter.vue";
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
		DateRangeFilter,
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
		loadingTab: null,
		loadedTabs: {
			history: false,
			partial: false,
			drafts: false,
			returns: false,
		},
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
		editDialog: false,
		editLoading: false,
		editSubmitting: false,
		editPreviewLoading: false,
		editPreviewTimer: null,
		editPreviewRequestId: 0,
		editPreviewDirty: false,
		editPreviewLastUpdatedAt: null,
		editError: "",
		editInvoiceOriginal: null,
		editInvoiceDoc: null,
		editPreviewDoc: null,
		editEligibility: null,
		editKeyboardTargetKey: "",
		editKeyboardEditing: false,
		editKeyboardGeneratedId: 0,
		newEditItem: {
			item_code: "",
			qty: 1,
			rate: 0,
		},
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
		hasHistoryFilters() {
			return Boolean(
				this.historySearch ||
					this.historyStatus !== "All" ||
					this.historyDateFrom ||
					this.historyDateTo ||
					this.historyShowRepairCandidatesOnly,
			);
		},
		hasPartialFilters() {
			return Boolean(
				this.partialSearch ||
					this.partialStatus !== "All" ||
					this.partialDateFrom ||
					this.partialDateTo,
			);
		},
		hasDraftFilters() {
			return Boolean(this.draftSearch || this.draftDateFrom || this.draftDateTo);
		},
		hasReturnFilters() {
			return Boolean(this.returnSearch || this.returnDateFrom || this.returnDateTo);
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
		editPaymentTotal() {
			return (this.editInvoiceDoc?.payments || []).reduce(
				(total, payment) => total + Number(payment?.amount || 0),
				0,
			);
		},
		editSettlementCurrency() {
			return (this.editPreviewDoc || this.editInvoiceDoc || {}).currency || this.posProfile?.currency;
		},
		editCorrectedTotal() {
			const source = this.editPreviewDoc || this.editInvoiceDoc || {};
			return this.normalizeEditMoney(source.rounded_total || source.grand_total || 0);
		},
		editOriginalPaidTotal() {
			const source = this.editInvoiceOriginal || this.editInvoiceDoc || {};
			const paid = Number(source.paid_amount ?? 0);
			if (Number.isFinite(paid) && Math.abs(paid) > 0) {
				return this.normalizeEditMoney(paid);
			}
			return this.normalizeEditMoney(
				(source.payments || []).reduce((total, payment) => total + Number(payment?.amount || 0), 0),
			);
		},
		editAutoPaymentTotal() {
			return this.normalizeEditMoney(this.editCorrectedTotal);
		},
		editSettlementDelta() {
			return this.normalizeEditMoney(this.editCorrectedTotal - this.editOriginalPaidTotal);
		},
		editSettlementLabel() {
			const delta = this.editSettlementDelta;
			if (delta > 0) return __("Collect from customer");
			if (delta < 0) return __("Refund to customer");
			return __("No cash difference");
		},
		editSettlementSummaryClass() {
			return {
				"edit-settlement-summary--collect": this.editSettlementDelta > 0,
				"edit-settlement-summary--refund": this.editSettlementDelta < 0,
				"edit-settlement-summary--balanced": this.editSettlementDelta === 0,
			};
		},
		editPreviewStatus() {
			if (this.editPreviewLoading) return __("Recalculating...");
			if (this.editPreviewDirty) return __("Recalculation pending");
			if (this.editPreviewLastUpdatedAt) return __("Totals updated");
			return __("Totals update automatically");
		},
	},
	watch: {
		editDialog(value) {
			if (!value) {
				this.clearScheduledEditPreview();
				this.clearEditKeyboardBox();
				this.editKeyboardTargetKey = "";
				this.editKeyboardEditing = false;
			} else {
				this.$nextTick(() => this.setDefaultEditKeyboardTarget());
			}
		},
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
			this.ensureActiveTabLoaded();
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
	beforeUnmount() {
		this.clearScheduledEditPreview();
	},
	methods: {
		resetLoadedTabs() {
			this.loadedTabs = {
				history: false,
				partial: false,
				drafts: false,
				returns: false,
			};
		},
		tabCountLabel(tab, count) {
			return this.loadedTabs?.[tab] ? count : "—";
		},
		resetHistoryFilters() {
			this.historySearch = "";
			this.historyStatus = "All";
			this.historyDateFrom = "";
			this.historyDateTo = "";
			this.historyShowRepairCandidatesOnly = false;
		},
		resetPartialFilters() {
			this.partialSearch = "";
			this.partialStatus = "All";
			this.partialDateFrom = "";
			this.partialDateTo = "";
		},
		resetDraftFilters() {
			this.draftSearch = "";
			this.draftDateFrom = "";
			this.draftDateTo = "";
		},
		resetReturnFilters() {
			this.returnSearch = "";
			this.returnDateFrom = "";
			this.returnDateTo = "";
		},
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
		submittedInvoiceListArgs(doctype, filters, extraFields = []) {
			return {
				doctype,
				filters,
				fields: this.getInvoiceListFields(extraFields),
				order_by: "posting_date desc, posting_time desc, modified desc",
				limit_page_length: 0,
				pos_profile: filters?.pos_profile || null,
				company: filters?.company || null,
			};
		},
		modificationCount(invoice) {
			return Number(invoice?.amendment_count || 0);
		},
		modificationLabel(invoice) {
			const count = this.modificationCount(invoice);
			return count > 0 ? __("Modified x{0}", [count]) : "";
		},
		canEditSubmittedInvoice(invoice) {
			return Boolean(invoice?.can_edit_submitted_invoice);
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
			this.resetLoadedTabs();
			await this.refreshActiveTab();
		},
		async ensureActiveTabLoaded() {
			const tab = this.activeTab || "history";
			if (this.loadedTabs?.[tab] || this.loadingTab) return;
			await this.refreshActiveTab();
		},
		async refreshActiveTab() {
			if (!this.invoiceManagementDialog) return;
			const tab = this.activeTab || "history";
			if (this.loadingTab) return;
			this.loadingTab = tab;
			try {
				if (tab === "drafts") await this.loadDrafts();
				else if (tab === "partial") await this.loadUnpaidInvoices();
				else await this.loadHistory();

				if (tab === "history" || tab === "returns") {
					this.loadedTabs.history = true;
					this.loadedTabs.returns = true;
				} else {
					this.loadedTabs[tab] = true;
				}
			} finally {
				this.loadingTab = null;
				const activeTab = this.activeTab || "history";
				if (!this.loadedTabs?.[activeTab]) {
					this.$nextTick?.(() => this.ensureActiveTabLoaded());
				}
			}
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
					method: "posawesome.posawesome.api.invoices.list_submitted_invoices",
					args: this.submittedInvoiceListArgs(this.currentInvoiceDoctype, filters, ["due_date"]),
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
							method: "posawesome.posawesome.api.invoices.list_submitted_invoices",
							args: this.submittedInvoiceListArgs(doctype, filters, [
								"change_amount",
								"is_return",
								"return_against",
							]),
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
		closeEditInvoice() {
			this.clearScheduledEditPreview();
			this.editPreviewRequestId = Number(this.editPreviewRequestId || 0) + 1;
			this.editDialog = false;
			this.editLoading = false;
			this.editSubmitting = false;
			this.editPreviewLoading = false;
			this.editPreviewDirty = false;
			this.editPreviewLastUpdatedAt = null;
			this.editError = "";
			this.editInvoiceOriginal = null;
			this.editInvoiceDoc = null;
			this.editPreviewDoc = null;
			this.editEligibility = null;
			this.newEditItem = { item_code: "", qty: 1, rate: 0 };
		},
		editScopeArgs(invoice) {
			return {
				doctype: invoice?.doctype || this.currentInvoiceDoctype,
				name: invoice?.name,
				pos_profile: this.isSupervisorScope()
					? this.resolveSupervisorProfileScope()
					: this.posProfile?.name,
				company: this.posProfile?.company || null,
			};
		},
		cloneForEdit(value) {
			return JSON.parse(JSON.stringify(value || {}));
		},
		normalizeEditMoney(value) {
			const precision = Number.isInteger(Number(this.currency_precision))
				? Number(this.currency_precision)
				: 2;
			const factor = 10 ** Math.max(0, precision);
			const number = Number(value || 0);
			if (!Number.isFinite(number)) return 0;
			return Math.round(number * factor) / factor;
		},
		ensureEditPaymentRows() {
			if (!this.editInvoiceDoc) return [];
			if (!Array.isArray(this.editInvoiceDoc.payments)) {
				this.editInvoiceDoc.payments = [];
			}
			if (!this.editInvoiceDoc.payments.length) {
				const profilePayment = Array.isArray(this.posProfile?.payments)
					? this.posProfile.payments.find((payment) => payment?.mode_of_payment)
					: null;
				this.editInvoiceDoc.payments.push({
					mode_of_payment: profilePayment?.mode_of_payment || "Cash",
					account: profilePayment?.account || "",
					type: profilePayment?.type || "Cash",
					default: profilePayment?.default || 1,
					amount: 0,
					base_amount: 0,
					currency: this.editInvoiceDoc.currency || this.posProfile?.currency,
					conversion_rate: Number(this.editInvoiceDoc.conversion_rate || 1),
				});
			}
			return this.editInvoiceDoc.payments;
		},
		syncEditPaymentsToCorrectedTotal(totalOverride = null, previewDoc = null) {
			if (!this.editInvoiceDoc) return 0;
			const targetTotal = this.normalizeEditMoney(
				totalOverride ?? this.editCorrectedTotal ?? this.editInvoiceDoc.grand_total,
			);
			const payments = this.ensureEditPaymentRows();
			if (!payments.length) return targetTotal;
			const primaryIndex = Math.max(
				0,
				payments.findIndex((payment) =>
					String(payment?.mode_of_payment || "")
						.toLowerCase()
						.includes("cash"),
				),
			);
			payments.forEach((payment, index) => {
				const amount = index === primaryIndex ? targetTotal : 0;
				payment.amount = amount;
				payment.base_amount = this.normalizeEditMoney(
					amount * Number(payment.conversion_rate || this.editInvoiceDoc.conversion_rate || 1),
				);
			});
			if (previewDoc) {
				previewDoc.paid_amount = targetTotal;
				previewDoc.base_paid_amount = this.normalizeEditMoney(
					targetTotal *
						Number(previewDoc.conversion_rate || this.editInvoiceDoc.conversion_rate || 1),
				);
				previewDoc.outstanding_amount = 0;
			}
			return targetTotal;
		},
		clearScheduledEditPreview() {
			if (this.editPreviewTimer) {
				if (typeof window !== "undefined") window.clearTimeout(this.editPreviewTimer);
				this.editPreviewTimer = null;
			}
		},
		scheduleEditPreview(delay = 450) {
			if (!this.editDialog || this.editLoading || this.editSubmitting || !this.editInvoiceDoc?.name) {
				return;
			}
			this.editPreviewDirty = true;
			this.clearScheduledEditPreview();
			if (typeof window === "undefined") return;
			this.editPreviewTimer = window.setTimeout(() => {
				this.editPreviewTimer = null;
				this.previewEditInvoice({ silent: true });
			}, delay);
		},
		editModalElement() {
			if (typeof document === "undefined") return null;
			return document.querySelector(".invoice-edit-modal-content");
		},
		editModalFocusRoot() {
			const modal = this.editModalElement();
			return modal?.querySelector?.(".invoice-detail-card") || modal;
		},
		isEditElementVisible(element) {
			if (!element?.isConnected || typeof window === "undefined") return false;
			const style = window.getComputedStyle(element);
			if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
				return false;
			}
			const rect = element.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		},
		clearEditKeyboardBox() {
			const modal = this.editModalElement();
			modal?.querySelectorAll?.(".edit-keyboard-box")?.forEach((element) => {
				element.classList.remove("edit-keyboard-box");
			});
		},
		ensureEditNavKey(element) {
			if (!element?.dataset) return "";
			if (!element.dataset.editKeyboardKey) {
				this.editKeyboardGeneratedId = Number(this.editKeyboardGeneratedId || 0) + 1;
				element.dataset.editKeyboardKey = `edit-target-${this.editKeyboardGeneratedId}`;
			}
			return element.dataset.editKeyboardKey;
		},
		setEditKeyboardTarget(element, options = {}) {
			this.clearEditKeyboardBox();
			if (!element) {
				this.editKeyboardTargetKey = "";
				return false;
			}
			const shouldFocusRoot = options?.focusRoot !== false;
			this.editKeyboardTargetKey = this.ensureEditNavKey(element);
			element.classList.add("edit-keyboard-box");
			element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
			if (shouldFocusRoot) {
				this.editModalFocusRoot()?.focus?.({ preventScroll: true });
			}
			return true;
		},
		currentEditKeyboardTarget() {
			const modal = this.editModalElement();
			if (!modal || !this.editKeyboardTargetKey) return null;
			return modal.querySelector(`[data-edit-keyboard-key="${this.editKeyboardTargetKey}"]`);
		},
		editNavigationFields() {
			const modal = this.editModalElement();
			if (!modal) return [];
			return Array.from(modal.querySelectorAll("[data-edit-nav]")).filter((element) => {
				if (
					element.disabled ||
					element.getAttribute("aria-disabled") === "true" ||
					element.classList.contains("v-btn--disabled") ||
					!this.isEditElementVisible(element)
				) {
					return false;
				}
				const input = this.editFocusableElement(element);
				return Boolean(input && !input.disabled && input.getAttribute("aria-disabled") !== "true");
			});
		},
		editFocusableElement(element) {
			if (!element) return null;
			return element.matches("input, textarea, button, select, [contenteditable='true']")
				? element
				: element.querySelector("input, textarea, button, select, [contenteditable='true']");
		},
		focusEditField(element) {
			if (!element) return false;
			const target = this.editFocusableElement(element);
			if (!target || target.disabled) return false;
			const root = element.closest?.("[data-edit-nav]") || element;
			this.setEditKeyboardTarget(root, { focusRoot: false });
			target.focus();
			if (
				typeof target.select === "function" &&
				target.matches("input[type='number'], input[type='text']")
			) {
				target.select();
			}
			this.editKeyboardEditing = target.matches("input, textarea, select, [contenteditable='true']");
			return true;
		},
		focusEditFieldByPredicate(predicate) {
			const fields = this.editNavigationFields();
			const field = fields.find(predicate);
			return this.focusEditField(field);
		},
		focusNextEditField(currentElement, direction = 1) {
			const fields = this.editNavigationFields();
			if (!fields.length) return false;
			const currentRoot = currentElement?.closest?.("[data-edit-nav]") || currentElement;
			const currentIndex = Math.max(fields.indexOf(currentRoot), 0);
			const nextIndex = (currentIndex + direction + fields.length) % fields.length;
			return this.setEditKeyboardTarget(fields[nextIndex]);
		},
		focusVerticalEditField(currentElement, direction = 1) {
			const currentRoot = currentElement?.closest?.("[data-edit-nav]");
			if (!currentRoot) return false;
			const section = currentRoot.dataset.editSection;
			const column = currentRoot.dataset.editCol;
			const row = Number(currentRoot.dataset.editRow);
			if (!section || !column || !Number.isFinite(row)) return false;
			return this.focusEditFieldByPredicate((element) => {
				return (
					element.dataset.editSection === section &&
					element.dataset.editCol === column &&
					Number(element.dataset.editRow) === row + direction
				);
			});
		},
		targetCenter(element) {
			const rect = element.getBoundingClientRect();
			return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		},
		scoreEditTargetForArrow(key, current, element) {
			const candidate = this.targetCenter(element);
			const dx = candidate.x - current.x;
			const dy = candidate.y - current.y;
			if (key === "ArrowRight" && dx <= 1) return null;
			if (key === "ArrowLeft" && dx >= -1) return null;
			if (key === "ArrowDown" && dy <= 1) return null;
			if (key === "ArrowUp" && dy >= -1) return null;
			const primary = key === "ArrowRight" || key === "ArrowLeft" ? Math.abs(dx) : Math.abs(dy);
			const secondary = key === "ArrowRight" || key === "ArrowLeft" ? Math.abs(dy) : Math.abs(dx);
			return secondary * 1000 + primary;
		},
		sortEditFieldsByPosition(fields) {
			return [...fields].sort((left, right) => {
				const leftRect = left.getBoundingClientRect();
				const rightRect = right.getBoundingClientRect();
				return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
			});
		},
		setDefaultEditKeyboardTarget() {
			if (!this.editDialog || this.editLoading) return false;
			const fields = this.editNavigationFields();
			if (!fields.length) return false;
			const preferred = fields.find((element) => element.dataset.editNav === "customer") || fields[0];
			return this.setEditKeyboardTarget(preferred);
		},
		moveEditKeyboardBox(key) {
			const fields = this.editNavigationFields();
			if (!fields.length) return false;
			const current = this.currentEditKeyboardTarget();
			if (!current || !fields.includes(current)) {
				return this.setEditKeyboardTarget(this.sortEditFieldsByPosition(fields)[0]);
			}
			const currentCenter = this.targetCenter(current);
			let bestTarget = null;
			let bestScore = Number.POSITIVE_INFINITY;
			for (const field of fields) {
				if (field === current) continue;
				const score = this.scoreEditTargetForArrow(key, currentCenter, field);
				if (score !== null && score < bestScore) {
					bestScore = score;
					bestTarget = field;
				}
			}
			if (!bestTarget) {
				const ordered = this.sortEditFieldsByPosition(fields);
				const index = ordered.indexOf(current);
				const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
				bestTarget = ordered[Math.max(0, Math.min(index + delta, ordered.length - 1))];
			}
			return bestTarget ? this.setEditKeyboardTarget(bestTarget) : false;
		},
		stopEditKeyboardEditing() {
			this.editKeyboardEditing = false;
			const active = document.activeElement;
			active?.blur?.();
			this.editModalFocusRoot()?.focus?.({ preventScroll: true });
		},
		activateEditKeyboardTarget() {
			const target = this.currentEditKeyboardTarget() || this.editNavigationFields()[0];
			if (!target) return false;
			this.setEditKeyboardTarget(target);
			const focusable = this.editFocusableElement(target);
			if (!focusable || focusable.disabled) return false;
			if (focusable.matches("button")) {
				focusable.click();
				this.$nextTick(() => {
					if (target.dataset.editNav === "new-item-add") {
						this.setEditKeyboardTarget(
							this.editNavigationFields().find(
								(element) => element.dataset.editNav === "new-item-code",
							),
						);
						return;
					}
					this.setDefaultEditKeyboardTarget();
				});
				return true;
			}
			this.focusEditField(target);
			return true;
		},
		handleEditModalClick(event) {
			const target = event.target?.closest?.("[data-edit-nav]");
			if (target) {
				this.setEditKeyboardTarget(target);
				this.editKeyboardEditing = Boolean(
					this.editFocusableElement(target)?.matches(
						"input, textarea, select, [contenteditable='true']",
					),
				);
			}
		},
		handleEditModalKeydown(event) {
			if (!this.editDialog || this.editLoading) return;
			if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
				event.preventDefault();
				this.submitEditInvoice();
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				if (this.editKeyboardEditing) {
					this.stopEditKeyboardEditing();
					return;
				}
				if (!this.editSubmitting) this.closeEditInvoice();
				return;
			}
			if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
				if (this.editKeyboardEditing) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				this.moveEditKeyboardBox(event.key);
				return;
			}
			if (event.key === "Tab") {
				event.preventDefault();
				event.stopPropagation();
				if (this.editKeyboardEditing) this.stopEditKeyboardEditing();
				this.moveEditKeyboardBox(event.shiftKey ? "ArrowLeft" : "ArrowRight");
				return;
			}
			const target = event.target;
			const fieldRoot = target?.closest?.("[data-edit-nav]");
			if (event.key === "Enter") {
				event.preventDefault();
				const activeRoot = document.activeElement?.closest?.("[data-edit-nav]");
				if ((this.editKeyboardEditing || activeRoot === fieldRoot) && fieldRoot) {
					this.editKeyboardEditing = false;
					this.setEditKeyboardTarget(fieldRoot);
					this.moveEditKeyboardBox(event.shiftKey ? "ArrowLeft" : "ArrowRight");
					return;
				}
				this.activateEditKeyboardTarget();
			}
		},
		async openEditInvoice(invoice) {
			if (!invoice?.name) return;
			if (isOffline()) {
				this.toastStore.show({
					title: __("Editing submitted invoices requires an online connection"),
					color: "warning",
				});
				return;
			}
			if (!this.canEditSubmittedInvoice(invoice)) {
				this.toastStore.show({
					title: invoice?.edit_block_reason || __("This invoice cannot be edited"),
					color: "warning",
				});
				return;
			}
			this.editDialog = true;
			this.editLoading = true;
			this.editError = "";
			this.editInvoiceOriginal = invoice;
			this.editPreviewDoc = null;
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.invoices.get_submitted_invoice_for_edit",
					args: this.editScopeArgs(invoice),
				});
				this.editInvoiceDoc = this.cloneForEdit(message?.invoice || {});
				this.editEligibility = message?.metadata || null;
				if (!Array.isArray(this.editInvoiceDoc.items)) this.editInvoiceDoc.items = [];
				if (!Array.isArray(this.editInvoiceDoc.payments)) this.editInvoiceDoc.payments = [];
				this.syncEditPaymentsToCorrectedTotal(
					this.editInvoiceDoc.rounded_total || this.editInvoiceDoc.grand_total || 0,
				);
			} catch (error) {
				console.error("Error loading editable invoice:", error);
				this.editError = error?.message || __("Unable to load editable invoice");
				this.toastStore.show({ title: this.editError, color: "error" });
				this.closeEditInvoice();
			} finally {
				this.editLoading = false;
				if (this.editDialog && this.editInvoiceDoc?.name) {
					this.$nextTick(() => {
						this.setDefaultEditKeyboardTarget();
						this.scheduleEditPreview(0);
					});
				}
			}
		},
		removeEditItem(index) {
			if (!Array.isArray(this.editInvoiceDoc?.items)) return;
			if (this.editInvoiceDoc.items.length <= 1) {
				this.toastStore.show({ title: __("Invoice must have at least one item"), color: "warning" });
				return false;
			}
			this.editInvoiceDoc.items.splice(index, 1);
			this.editPreviewDoc = null;
			this.scheduleEditPreview();
			return true;
		},
		addEditItem() {
			const itemCode = String(this.newEditItem?.item_code || "").trim();
			if (!itemCode) {
				this.toastStore.show({ title: __("Item code is required"), color: "warning" });
				return false;
			}
			if (!Array.isArray(this.editInvoiceDoc.items)) this.editInvoiceDoc.items = [];
			this.editInvoiceDoc.items.push({
				item_code: itemCode,
				item_name: itemCode,
				qty: Number(this.newEditItem.qty || 1),
				rate: Number(this.newEditItem.rate || 0),
				discount_percentage: 0,
				discount_amount: 0,
			});
			this.newEditItem = { item_code: "", qty: 1, rate: 0 };
			this.editPreviewDoc = null;
			this.scheduleEditPreview();
			return true;
		},
		buildEditCorrectionData() {
			this.syncEditPaymentsToCorrectedTotal();
			const doc = this.editInvoiceDoc || {};
			return {
				customer: doc.customer,
				discount_amount: Number(doc.discount_amount || 0),
				additional_discount_percentage: Number(doc.additional_discount_percentage || 0),
				apply_discount_on: doc.apply_discount_on || "Grand Total",
				due_date: doc.due_date || null,
				items: (doc.items || []).map((item) => ({
					name: item.name,
					item_code: item.item_code,
					item_name: item.item_name,
					description: item.description,
					qty: Number(item.qty || 0),
					uom: item.uom,
					stock_uom: item.stock_uom,
					conversion_factor: Number(item.conversion_factor || 1),
					warehouse: item.warehouse,
					rate: Number(item.rate || 0),
					price_list_rate: Number(item.price_list_rate || item.rate || 0),
					discount_percentage: Number(item.discount_percentage || 0),
					discount_amount: Number(item.discount_amount || 0),
					is_free_item: Number(item.is_free_item || 0),
					batch_no: item.batch_no,
					serial_no: item.serial_no,
					income_account: item.income_account,
					expense_account: item.expense_account,
					cost_center: item.cost_center,
				})),
				payments: (doc.payments || []).map((payment) => ({
					name: payment.name,
					mode_of_payment: payment.mode_of_payment,
					amount: Number(payment.amount || 0),
					base_amount: Number(payment.base_amount || 0),
					account: payment.account,
					type: payment.type,
					default: payment.default,
					currency: payment.currency,
					conversion_rate: Number(payment.conversion_rate || 1),
				})),
			};
		},
		async previewEditInvoice(options = {}) {
			if (!this.editInvoiceDoc?.name) return;
			const silent = Boolean(options?.silent);
			this.clearScheduledEditPreview();
			const requestId = Number(this.editPreviewRequestId || 0) + 1;
			this.editPreviewRequestId = requestId;
			this.editPreviewLoading = true;
			this.editPreviewDirty = false;
			this.editError = "";
			try {
				const args = {
					...this.editScopeArgs(this.editInvoiceDoc),
					correction_data: JSON.stringify(this.buildEditCorrectionData()),
				};
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.invoices.preview_submitted_invoice_edit",
					args,
				});
				if (requestId !== this.editPreviewRequestId) return;
				this.editPreviewDoc = message?.invoice || null;
				if (this.editPreviewDoc) {
					this.syncEditPaymentsToCorrectedTotal(
						this.editPreviewDoc.rounded_total || this.editPreviewDoc.grand_total || 0,
						this.editPreviewDoc,
					);
				}
				this.editEligibility = message?.metadata || this.editEligibility;
				this.editPreviewLastUpdatedAt = Date.now();
			} catch (error) {
				if (requestId !== this.editPreviewRequestId) return;
				console.error("Error previewing invoice edit:", error);
				this.editError = error?.message || __("Unable to recalculate invoice");
				if (!silent) this.toastStore.show({ title: this.editError, color: "error" });
			} finally {
				if (requestId === this.editPreviewRequestId) {
					this.editPreviewLoading = false;
				}
			}
		},
		async submitEditInvoice() {
			if (!this.editInvoiceDoc?.name || this.editSubmitting) return;
			this.clearScheduledEditPreview();
			if (isOffline()) {
				this.toastStore.show({
					title: __("Editing submitted invoices requires an online connection"),
					color: "warning",
				});
				return;
			}
			if (
				!window.confirm(
					__("Cancel {0} and submit a corrected amendment?", [this.editInvoiceDoc.name]),
				)
			) {
				return;
			}
			this.editSubmitting = true;
			this.editError = "";
			try {
				if (this.editPreviewDirty || !this.editPreviewDoc) {
					await this.previewEditInvoice({ silent: true });
				}
				if (this.editError) {
					return;
				}
				this.syncEditPaymentsToCorrectedTotal();
				const clientRequestId = [
					"submitted-edit",
					this.editInvoiceDoc.name,
					Date.now(),
					Math.random().toString(16).slice(2),
				].join("-");
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.invoices.submit_submitted_invoice_edit",
					args: {
						...this.editScopeArgs(this.editInvoiceDoc),
						correction_data: JSON.stringify(this.buildEditCorrectionData()),
						client_request_id: clientRequestId,
					},
					freeze: true,
					freeze_message: __("Submitting corrected invoice"),
				});
				const amendedName = message?.name || __("new invoice");
				this.toastStore.show({
					title: __("Corrected invoice {0} submitted", [amendedName]),
					color: "success",
				});
				this.closeEditInvoice();
				await this.refreshAll();
			} catch (error) {
				console.error("Error submitting invoice edit:", error);
				this.editError = error?.message || __("Unable to submit corrected invoice");
				this.toastStore.show({ title: this.editError, color: "error" });
			} finally {
				this.editSubmitting = false;
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
			const useConfiguredQzPrint = shouldUseConfiguredQzDocumentPrinting(profile);
			const useRawPrint = shouldUseRawDocumentPrinting(profile);
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
			if (useConfiguredQzPrint && !isOffline()) {
				try {
					await printDocumentViaConfiguredQz({
						doctype,
						name: invoice.name,
						doc: invoice,
						profile,
						printFormat,
						letterhead: letterHead || null,
						noLetterhead: letterHead ? "0" : "1",
					});
					return;
				} catch (error) {
					console.warn("QZ Tray print failed", error);
					if (confirmDocumentPrintFallback(error, { raw: useRawPrint })) {
						silentPrint(url, printOptions);
					}
					return;
				}
			}
			if (useRawPrint) {
				const offlineError = new Error(__("Raw printing is not available while the POS is offline."));
				if (confirmDocumentPrintFallback(offlineError, { raw: true, offline: true })) {
					silentPrint(url, printOptions);
				}
				return;
			}
			if (useConfiguredQzPrint) {
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
				if (!response.ok)
					throw new Error(__("Failed to download invoice. Status: {0}", [response.status]));
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

.filter-grid {
	align-items: center;
}

.filter-grid :deep(.date-range-filter) {
	grid-column: span 2;
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

.edit-form-grid,
.edit-add-row {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12px;
	align-items: center;
}

.edit-add-row {
	grid-template-columns: minmax(180px, 1fr) minmax(90px, 120px) minmax(110px, 140px) auto;
}

.edit-invoice-table {
	border-radius: 8px;
	overflow: hidden;
}

.edit-settlement-summary {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	border-radius: 8px;
	padding: 12px 16px;
	border: 1px solid rgba(148, 163, 184, 0.28);
}

.edit-settlement-summary__label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.edit-settlement-summary__value,
.edit-settlement-summary__amount {
	font-weight: 800;
	color: var(--pos-text-primary);
}

.edit-settlement-summary__amount {
	font-size: 1.1rem;
	white-space: nowrap;
}

.edit-settlement-summary--collect {
	background: linear-gradient(135deg, rgba(236, 253, 245, 0.98), rgba(209, 250, 229, 0.9));
	border-color: rgba(34, 197, 94, 0.3);
}

.edit-settlement-summary--refund {
	background: linear-gradient(135deg, rgba(255, 247, 237, 0.98), rgba(254, 215, 170, 0.9));
	border-color: rgba(249, 115, 22, 0.34);
}

.edit-settlement-summary--balanced {
	background: rgba(248, 250, 252, 0.78);
}

.edit-number-input {
	min-width: 96px;
	max-width: 140px;
}

.edit-keyboard-box {
	position: relative;
	outline: 3px solid rgb(var(--v-theme-primary)) !important;
	outline-offset: 2px;
	border-radius: 6px;
	z-index: 4;
}

.edit-invoice-table .edit-keyboard-box {
	outline-offset: 1px;
}

.edit-keyboard-box :deep(.v-field) {
	box-shadow:
		0 0 0 2px rgba(var(--v-theme-primary), 0.2),
		inset 0 0 0 2px rgb(var(--v-theme-primary));
}

.edit-item-title {
	font-weight: 700;
	line-height: 1.25;
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
	.edit-form-grid,
	.edit-add-row {
		grid-template-columns: 1fr;
	}
	.edit-number-input {
		max-width: none;
	}
}

@media (max-width: 640px) {
	.filter-grid :deep(.date-range-filter) {
		grid-column: span 1;
	}

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
