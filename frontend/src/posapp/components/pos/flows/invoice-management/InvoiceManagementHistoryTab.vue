<template>
<div class="filter-grid mb-4">
								<v-text-field
									v-model="im.historySearch"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									:label="__('Search invoices or customers')"
								/>
								<v-select
									v-model="im.historyStatus"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:items="im.historyStatusItems"
									:label="__('Status')"
								/>
								<v-text-field
									v-model="im.historyDateFrom"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('From Date')"
								/>
								<v-text-field
									v-model="im.historyDateTo"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('To Date')"
								/>
								<v-btn
									class="history-repair-toggle"
									:color="im.historyShowRepairCandidatesOnly ? 'warning' : undefined"
									:variant="im.historyShowRepairCandidatesOnly ? 'flat' : 'outlined'"
									prepend-icon="mdi-wrench-check-outline"
									@click="
										im.historyShowRepairCandidatesOnly = !im.historyShowRepairCandidatesOnly
									"
								>
									{{ __("Show Repair Candidates") }}
									<v-chip
										size="x-small"
										variant="flat"
										:color="im.historyShowRepairCandidatesOnly ? 'white' : 'warning'"
										class="ms-2"
									>
										{{ im.historyRepairCandidateCount }}
									</v-chip>
								</v-btn>
							</div>

							<div class="summary-grid mb-4">
								<div class="summary-tile summary-tile--history">
									<div class="summary-tile__label">{{ __("Invoices") }}</div>
									<div class="summary-tile__value">
										{{ im.filteredHistoryInvoices.length }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Completed and active sales in this range") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--primary">
									<div class="summary-tile__label">{{ __("Gross Sales") }}</div>
									<div class="summary-tile__value">
										{{ im.currencySymbol(im.posProfile?.currency) }}
										{{ im.formatCurrency(im.historyTotals.gross) }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Before any return workflow") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--success">
									<div class="summary-tile__label">{{ __("Tendered") }}</div>
									<div class="summary-tile__value">
										{{ im.currencySymbol(im.posProfile?.currency) }}
										{{ im.formatCurrency(im.historyTotals.paid) }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Amount received from customer") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--danger">
									<div class="summary-tile__label">{{ __("Change Return") }}</div>
									<div class="summary-tile__value">
										{{ im.currencySymbol(im.posProfile?.currency) }}
										{{ im.formatCurrency(im.historyTotals.change_return) }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Cash returned after payment") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--warning">
									<div class="summary-tile__label">{{ __("Outstanding") }}</div>
									<div class="summary-tile__value">
										{{ im.currencySymbol(im.posProfile?.currency) }}
										{{ im.formatCurrency(im.historyTotals.outstanding) }}
									</div>
									<div class="summary-tile__meta">{{ __("Balances still pending") }}</div>
								</div>
							</div>

							<div v-if="im.loading && im.activeTab === 'history'" class="tab-loader">
								<v-progress-circular indeterminate color="primary" size="28" width="3" />
								<span>{{ __("Loading invoice history...") }}</span>
							</div>

							<div v-else-if="!im.filteredHistoryInvoices.length" class="empty-state">
								<v-icon size="42" color="medium-emphasis"
									>mdi-receipt-text-clock-outline</v-icon
								>
								<div class="empty-state__title">{{ __("No invoices found") }}</div>
								<div class="empty-state__subtitle">
									{{
										im.historyShowRepairCandidatesOnly
											? __("No change-allocation invoices match the current filters.")
											: __("Try changing the date range or status filter.")
									}}
								</div>
							</div>

							<v-data-table
								v-else-if="im.viewMode === 'list'"
								:headers="im.historyHeaders"
								:items="im.paginatedHistoryInvoices"
								item-value="name"
								class="elevation-1"
								:items-per-page="-1"
								hide-default-footer
							>
								<template #item.posting_date="{ item }">{{
									im.formatDateTime(item.posting_date, item.posting_time)
								}}</template>
								<template #item.grand_total="{ item }"
									>{{ im.currencySymbol(item.currency) }}
									{{ im.formatCurrency(item.grand_total) }}</template
								>
								<template #item.paid_amount="{ item }"
									>{{ im.currencySymbol(item.currency) }}
									{{ im.formatCurrency(item.paid_amount || 0) }}</template
								>
								<template #item.change_amount="{ item }"
									>{{ im.currencySymbol(item.currency) }}
									{{ im.formatCurrency(item.change_amount || 0) }}</template
								>
								<template #item.outstanding_amount="{ item }"
									>{{ im.currencySymbol(item.currency) }}
									{{ im.formatCurrency(item.outstanding_amount || 0) }}</template
								>
								<template #item.status="{ item }">
									<div class="d-flex flex-wrap ga-1">
										<v-chip
											size="small"
											:color="im.statusColor(item.status)"
											variant="tonal"
											>{{ __(item.status || "Draft") }}</v-chip
										>
										<v-chip
											v-if="im.changeAllocationRepairState(item)"
											size="small"
											:color="im.repairStateColor(im.changeAllocationRepairState(item))"
											variant="flat"
										>
											{{ im.repairStateLabel(im.changeAllocationRepairState(item)) }}
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
											@click="im.viewInvoice(item)"
										/>
										<v-btn
											icon="mdi-printer-outline"
											variant="text"
											size="small"
											:title="__('Print')"
											:aria-label="__('Print invoice')"
											@click="im.printInvoice(item)"
										/>
										<v-btn
											v-if="im.posProfile?.posa_allow_return == 1"
											icon="mdi-backup-restore"
											variant="text"
											size="small"
											color="warning"
											:title="__('Create Return')"
											:aria-label="__('Create return from invoice')"
											@click="im.createReturn(item)"
										/>
									</div>
								</template>
							</v-data-table>

							<div v-else class="invoice-record-grid invoice-record-grid--history">
								<v-card
									v-for="invoice in im.paginatedHistoryInvoices"
									:key="invoice.name"
									:class="[
										'invoice-record-card',
										`invoice-record-card--${im.toneFromStatus(invoice.status)}`,
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
													:color="im.statusColor(invoice.status)"
													variant="flat"
												>
													{{ __(invoice.status || "Draft") }}
												</v-chip>
												<v-chip
													v-if="im.changeAllocationRepairState(invoice)"
													size="small"
													:color="
														im.repairStateColor(im.changeAllocationRepairState(invoice))
													"
													variant="flat"
												>
													{{
														im.repairStateLabel(im.changeAllocationRepairState(invoice))
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
												{{ im.currencySymbol(invoice.currency) }}
												{{ im.formatCurrency(invoice.grand_total) }}
											</div>
										</div>
									</div>

									<div class="invoice-record-card__content">
										<div class="meta-pair-grid">
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Posting") }}</div>
												<div class="meta-pair__value">
													{{
														im.formatDateTime(
															invoice.posting_date,
															invoice.posting_time,
														)
													}}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Tendered") }}</div>
												<div class="meta-pair__value meta-pair__value--success">
													{{ im.currencySymbol(invoice.currency) }}
													{{ im.formatCurrency(invoice.paid_amount || 0) }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Change Return") }}</div>
												<div class="meta-pair__value meta-pair__value--warning">
													{{ im.currencySymbol(invoice.currency) }}
													{{ im.formatCurrency(invoice.change_amount || 0) }}
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
													{{ im.currencySymbol(invoice.currency) }}
													{{ im.formatCurrency(invoice.outstanding_amount || 0) }}
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
											@click="im.viewInvoice(invoice)"
										/>
										<v-btn
											icon="mdi-printer-outline"
											size="small"
											variant="text"
											:title="__('Print')"
											:aria-label="__('Print invoice')"
											@click="im.printInvoice(invoice)"
										/>
										<v-btn
											v-if="im.posProfile?.posa_allow_return == 1"
											icon="mdi-backup-restore"
											size="small"
											variant="text"
											color="warning"
											:title="__('Create Return')"
											@click="im.createReturn(invoice)"
										/>
									</div>
								</v-card>
							</div>

							<div
								v-if="!im.loading && im.filteredHistoryInvoices.length && im.historyPageCount > 1"
								class="tab-pagination"
							>
								<div class="tab-pagination__meta">
									{{ im.paginationCaption(im.filteredHistoryInvoices.length, "history") }}
								</div>
								<v-pagination
									:model-value="im.tabPages.history"
									:length="im.historyPageCount"
									:total-visible="7"
									density="comfortable"
									@update:model-value="im.setTabPage('history', $event)"
								/>
							</div>
</template>

<script setup>
const { im } = defineProps(["im"]);
</script>
