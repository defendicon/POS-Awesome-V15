<template>
<div class="filter-grid mb-4">
								<v-text-field
									v-model="im.partialSearch"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									:label="__('Search unpaid invoices or customers')"
								/>
								<v-select
									v-model="im.partialStatus"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:items="im.partialStatusItems"
									:label="__('Payment Status')"
								/>
								<v-text-field
									v-model="im.partialDateFrom"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('From Date')"
								/>
								<v-text-field
									v-model="im.partialDateTo"
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
									:variant="im.partialStatus === 'All' ? 'flat' : 'outlined'"
									:color="im.partialStatus === 'All' ? 'warning' : undefined"
									size="small"
									@click="im.partialStatus = 'All'"
								>
									{{ __("All") }} ({{ im.unpaidStatusCounts.all }})
								</v-btn>
								<v-btn
									:variant="im.partialStatus === 'Partly Paid' ? 'flat' : 'outlined'"
									:color="im.partialStatus === 'Partly Paid' ? 'warning' : undefined"
									size="small"
									@click="im.partialStatus = 'Partly Paid'"
								>
									{{ __("Partly Paid") }} ({{ im.unpaidStatusCounts.partial }})
								</v-btn>
								<v-btn
									:variant="im.partialStatus === 'Unpaid' ? 'flat' : 'outlined'"
									:color="im.partialStatus === 'Unpaid' ? 'warning' : undefined"
									size="small"
									@click="im.partialStatus = 'Unpaid'"
								>
									{{ __("Unpaid") }} ({{ im.unpaidStatusCounts.unpaid }})
								</v-btn>
								<v-btn
									:variant="im.partialStatus === 'Overdue' ? 'flat' : 'outlined'"
									:color="im.partialStatus === 'Overdue' ? 'error' : undefined"
									size="small"
									@click="im.partialStatus = 'Overdue'"
								>
									{{ __("Overdue") }} ({{ im.unpaidStatusCounts.overdue }})
								</v-btn>
							</div>

							<div class="summary-grid mb-4">
								<div class="summary-tile summary-tile--warning">
									<div class="summary-tile__label">{{ __("Invoices") }}</div>
									<div class="summary-tile__value">{{ im.filteredUnpaidSummary.count }}</div>
									<div class="summary-tile__meta">
										{{ __("Invoices still carrying balances") }}
									</div>
								</div>
								<div class="summary-tile summary-tile--success">
									<div class="summary-tile__label">{{ __("Paid") }}</div>
									<div class="summary-tile__value">
										{{ im.currencySymbol(im.posProfile?.currency) }}
										{{ im.formatCurrency(im.filteredUnpaidSummary.total_paid) }}
									</div>
									<div class="summary-tile__meta">{{ __("Amount already received") }}</div>
								</div>
								<div class="summary-tile summary-tile--warning-strong">
									<div class="summary-tile__label">{{ __("Outstanding") }}</div>
									<div class="summary-tile__value">
										{{ im.currencySymbol(im.posProfile?.currency) }}
										{{ im.formatCurrency(im.filteredUnpaidSummary.total_outstanding) }}
									</div>
									<div class="summary-tile__meta">{{ __("Open balance to collect") }}</div>
								</div>
								<div class="summary-tile summary-tile--danger">
									<div class="summary-tile__label">{{ __("Overdue") }}</div>
									<div class="summary-tile__value">
										{{ im.filteredUnpaidSummary.overdue_count }}
									</div>
									<div class="summary-tile__meta">
										{{ __("Invoices already past due date") }}
									</div>
								</div>
							</div>

							<v-alert
								v-if="im.isOffline()"
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

							<div v-if="im.loading && im.activeTab === 'partial'" class="tab-loader">
								<v-progress-circular indeterminate color="warning" size="28" width="3" />
								<span>{{ __("Loading unpaid invoices...") }}</span>
							</div>

							<div v-else-if="!im.filteredUnpaidInvoices.length" class="empty-state">
								<v-icon size="42" color="success">mdi-cash-check</v-icon>
								<div class="empty-state__title">{{ __("No unpaid invoices") }}</div>
								<div class="empty-state__subtitle">
									{{ __("All visible invoices are fully settled.") }}
								</div>
							</div>

							<v-data-table
								v-else-if="im.viewMode === 'list'"
								:headers="im.partialHeaders"
								:items="im.paginatedUnpaidInvoices"
								item-value="name"
								class="elevation-1"
								:items-per-page="-1"
								hide-default-footer
							>
								<template #item.posting_date="{ item }">{{
									im.formatDateTime(item.posting_date, item.posting_time)
								}}</template>
								<template #item.due_date="{ item }">{{
									im.formatDateForDisplay(item.due_date) || "-"
								}}</template>
								<template #item.grand_total="{ item }"
									>{{ im.currencySymbol(item.currency) }}
									{{ im.formatCurrency(item.grand_total) }}</template
								>
								<template #item.paid_amount="{ item }"
									>{{ im.currencySymbol(item.currency) }}
									{{ im.formatCurrency(item.paid_amount || 0) }}</template
								>
								<template #item.outstanding_amount="{ item }"
									>{{ im.currencySymbol(item.currency) }}
									{{ im.formatCurrency(item.outstanding_amount || 0) }}</template
								>
								<template #item.status="{ item }"
									><v-chip size="small" :color="im.statusColor(item.status)" variant="tonal">{{
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
											:disabled="im.isOffline()"
											:title="__('Add Payment')"
											:aria-label="__('Add payment to invoice')"
											@click="im.openAddPayment(item)"
										/>
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
									</div>
								</template>
							</v-data-table>

							<div v-else class="invoice-record-grid invoice-record-grid--unpaid">
								<v-card
									v-for="invoice in im.paginatedUnpaidInvoices"
									:key="invoice.name"
									:class="[
										'invoice-record-card',
										'invoice-record-card--unpaid',
										`invoice-record-card--${im.toneFromStatus(invoice.status)}`,
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
													:color="im.statusColor(invoice.status)"
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
											<v-chip size="small" :color="im.dueTone(invoice)" variant="tonal">
												{{ im.dueLabel(invoice) }}
											</v-chip>
											<div class="invoice-record-card__amount-block">
												<div class="invoice-record-card__amount-label">
													{{ __("Outstanding") }}
												</div>
												<div class="invoice-record-card__amount">
													{{ im.currencySymbol(invoice.currency) }}
													{{ im.formatCurrency(invoice.outstanding_amount || 0) }}
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
														im.formatDateTime(
															invoice.posting_date,
															invoice.posting_time,
														)
													}}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Due Date") }}</div>
												<div class="meta-pair__value">
													{{ im.formatDateForDisplay(invoice.due_date) || "-" }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Grand Total") }}</div>
												<div class="meta-pair__value">
													{{ im.currencySymbol(invoice.currency) }}
													{{ im.formatCurrency(invoice.grand_total) }}
												</div>
											</div>
											<div class="meta-pair">
												<div class="meta-pair__label">{{ __("Paid") }}</div>
												<div class="meta-pair__value meta-pair__value--success">
													{{ im.currencySymbol(invoice.currency) }}
													{{ im.formatCurrency(invoice.paid_amount || 0) }}
												</div>
											</div>
										</div>

										<div class="payment-progress-block">
											<div class="payment-progress-block__labels">
												<span>{{ __("Payment Progress") }}</span>
												<span>{{ im.formatFloat(im.paymentProgress(invoice)) }}%</span>
											</div>
											<v-progress-linear
												:model-value="im.paymentProgress(invoice)"
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
											:disabled="im.isOffline()"
											@click="im.openAddPayment(invoice)"
										>
											{{ __("Add Payment") }}
										</v-btn>
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
									</div>
								</v-card>
							</div>

							<div
								v-if="!im.loading && im.filteredUnpaidInvoices.length && im.partialPageCount > 1"
								class="tab-pagination"
							>
								<div class="tab-pagination__meta">
									{{ im.paginationCaption(im.filteredUnpaidInvoices.length, "partial") }}
								</div>
								<v-pagination
									:model-value="im.tabPages.partial"
									:length="im.partialPageCount"
									:total-visible="7"
									density="comfortable"
									@update:model-value="im.setTabPage('partial', $event)"
								/>
							</div>
</template>

<script setup>
/* global __ */

const { im } = defineProps(["im"]);
</script>
