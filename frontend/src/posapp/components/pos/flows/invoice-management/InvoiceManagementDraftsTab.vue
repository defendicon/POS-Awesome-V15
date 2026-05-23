<template>
<div class="draft-source-toolbar mb-4">
								<DocumentSourceSelector
									v-if="im.showDraftSourceSelector"
									:model-value="im.currentDraftSource"
									:options="im.availableDraftSources"
									compact
									:aria-label="__('Draft source')"
									@update:model-value="im.updateDraftSource"
								/>
							</div>

							<div class="filter-grid mb-4">
								<v-text-field
									v-model="im.draftSearch"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									:label="__(im.currentDraftSourceOption.searchLabel)"
								/>
								<v-text-field
									v-model="im.draftDateFrom"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('From Date')"
								/>
								<v-text-field
									v-model="im.draftDateTo"
									type="date"
									class="pos-themed-input"
									variant="outlined"
									density="compact"
									hide-details
									:label="__('To Date')"
								/>
							</div>

							<div v-if="im.loading && im.activeTab === 'drafts'" class="tab-loader">
								<v-progress-circular indeterminate color="secondary" size="28" width="3" />
								<span>{{ __(im.currentDraftSourceOption.loadingLabel) }}</span>
							</div>

							<div v-else-if="!im.filteredDraftInvoices.length" class="empty-state">
								<v-icon size="42" :color="im.currentDraftSourceOption.color">{{
									im.currentDraftSourceOption.icon
								}}</v-icon>
								<div class="empty-state__title">
									{{ __(im.currentDraftSourceOption.emptyTitle) }}
								</div>
								<div class="empty-state__subtitle">
									{{ __(im.currentDraftSourceOption.emptySubtitle) }}
								</div>
							</div>

							<v-data-table
								v-else-if="im.viewMode === 'list'"
								:headers="im.draftHeaders"
								:items="im.paginatedDraftInvoices"
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
								<template #item.actions="{ item }">
									<div class="d-flex justify-end ga-1">
										<v-btn
											v-for="action in im.draftActions(item)"
											:key="`${item.name}-${action}`"
											variant="text"
											size="small"
											:color="im.draftActionColor(action)"
											:title="im.draftActionLabel(action)"
											:aria-label="im.draftActionLabel(action)"
											@click="im.runDraftAction(item, action)"
										>
											{{ im.draftActionLabel(action) }}
										</v-btn>
										<v-btn
											v-if="im.canDeleteActiveDraftSource"
											icon="mdi-delete-outline"
											variant="text"
											size="small"
											color="error"
											:title="__('Delete Draft')"
											:aria-label="__('Delete draft invoice')"
											@click="im.deleteDraft(item)"
										/>
									</div>
								</template>
							</v-data-table>

							<div v-else class="invoice-record-grid invoice-record-grid--drafts">
								<v-card
									v-for="invoice in im.paginatedDraftInvoices"
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
													:color="im.currentDraftSourceOption.color"
													variant="flat"
												>
													{{ im.draftSourceChipLabel(invoice) }}
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
												<div class="meta-pair__label">
													{{ im.draftSecondaryMetaLabel(invoice).label }}
												</div>
												<div class="meta-pair__value">
													{{ im.draftSecondaryMetaLabel(invoice).value }}
												</div>
											</div>
										</div>
									</div>

									<div class="invoice-record-card__actions">
										<v-btn
											v-for="action in im.draftActions(invoice)"
											:key="`${invoice.name}-${action}`"
											size="small"
											:variant="im.isPrimaryDraftAction(action) ? 'flat' : 'text'"
											:color="im.draftActionColor(action)"
											@click="im.runDraftAction(invoice, action)"
										>
											{{ im.draftActionLabel(action) }}
										</v-btn>
										<v-btn
											v-if="im.canDeleteActiveDraftSource"
											icon="mdi-delete-outline"
											size="small"
											variant="text"
											color="error"
											:title="__('Delete Draft')"
											:aria-label="__('Delete draft invoice')"
											@click="im.deleteDraft(invoice)"
										/>
									</div>
								</v-card>
							</div>

							<div
								v-if="!im.loading && im.filteredDraftInvoices.length && im.draftsPageCount > 1"
								class="tab-pagination"
							>
								<div class="tab-pagination__meta">
									{{ im.paginationCaption(im.filteredDraftInvoices.length, "drafts") }}
								</div>
								<v-pagination
									:model-value="im.tabPages.drafts"
									:length="im.draftsPageCount"
									:total-visible="7"
									density="comfortable"
									@update:model-value="im.setTabPage('drafts', $event)"
								/>
							</div>
</template>

<script setup>
/* global __ */
import DocumentSourceSelector from "../../shared/DocumentSourceSelector.vue";

const { im } = defineProps(["im"]);
</script>
