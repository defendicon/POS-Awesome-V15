<template>
<div class="filter-grid mb-4">
								<v-text-field
									v-model="im.returnSearch"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									:label="__('Search return invoices or customers')"
								/>
								<v-text-field
									v-model="im.returnDateFrom"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('From Date')"
								/>
								<v-text-field
									v-model="im.returnDateTo"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('To Date')"
								/>
							</div>

							<div v-if="im.loading && im.activeTab === 'returns'" class="tab-loader">
								<v-progress-circular indeterminate color="error" size="28" width="3" />
								<span>{{ __("Loading return invoices...") }}</span>
							</div>

							<div v-else-if="!im.filteredReturnInvoices.length" class="empty-state">
								<v-icon size="42" color="error">mdi-backup-restore</v-icon>
								<div class="empty-state__title">{{ __("No return invoices found") }}</div>
								<div class="empty-state__subtitle">
									{{ __("Completed returns will appear here.") }}
								</div>
							</div>

							<v-data-table
								v-else-if="im.viewMode === 'list'"
								:headers="im.returnHeaders"
								:items="im.paginatedReturnInvoices"
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

							<div v-else class="invoice-record-grid invoice-record-grid--returns">
								<v-card
									v-for="invoice in im.paginatedReturnInvoices"
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
								v-if="!im.loading && im.filteredReturnInvoices.length && im.returnsPageCount > 1"
								class="tab-pagination"
							>
								<div class="tab-pagination__meta">
									{{ im.paginationCaption(im.filteredReturnInvoices.length, "returns") }}
								</div>
								<v-pagination
									:model-value="im.tabPages.returns"
									:length="im.returnsPageCount"
									:total-visible="7"
									density="comfortable"
									@update:model-value="im.setTabPage('returns', $event)"
								/>
							</div>
</template>

<script setup>
const { im } = defineProps(["im"]);
</script>
