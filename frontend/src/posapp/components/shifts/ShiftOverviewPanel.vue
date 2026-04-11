<template>
	<div class="overview-section">
		<div class="table-header mb-4">
			<h4 class="text-h6 text-grey-darken-2 mb-1">
				{{ __("Shift Overview") }}
			</h4>
			<p class="text-body-2 text-grey">
				{{ __("Review shift totals before submitting the closing entry") }}
			</p>
		</div>

		<div class="overview-wrapper" v-if="loading">
			<v-progress-circular color="primary" indeterminate size="32"></v-progress-circular>
		</div>

		<div v-else class="overview-wrapper">
			<div class="insight-grid">
				<v-row dense>
					<v-col
						v-for="card in primaryInsights"
						:key="card.key"
						cols="12"
						sm="6"
						md="3"
						class="d-flex"
					>
						<div class="insight-card">
							<div class="insight-icon" :class="card.color">
								<v-icon size="22">{{ card.icon }}</v-icon>
							</div>
							<div class="insight-body">
								<div class="insight-label">{{ card.label }}</div>
								<div class="insight-value">{{ card.value }}</div>
								<div class="insight-caption">{{ card.caption }}</div>
							</div>
						</div>
					</v-col>
				</v-row>
				<v-row dense class="mt-2" v-if="secondaryInsights.length">
					<v-col
						v-for="card in secondaryInsights"
						:key="card.key"
						cols="12"
						sm="6"
						md="3"
						class="d-flex"
					>
						<div class="insight-card compact">
							<div class="insight-icon" :class="card.color">
								<v-icon size="20">{{ card.icon }}</v-icon>
							</div>
							<div class="insight-body">
								<div class="insight-label">{{ card.label }}</div>
								<div class="insight-value">{{ card.value }}</div>
								<div class="insight-caption">{{ card.caption }}</div>
							</div>
						</div>
					</v-col>
				</v-row>
			</div>

			<div class="table-section mt-6">
				<div class="table-header mb-2">
					<h5 class="text-subtitle-1 text-grey-darken-2 mb-1">
						{{ __("Totals by Invoice Currency") }}
					</h5>
					<p class="text-body-2 text-grey">
						{{ __("Shows the distribution of invoices per currency") }}
					</p>
				</div>

				<div v-if="multiCurrencyTotals.length" class="overview-table-wrapper">
					<table class="overview-table">
						<thead>
							<tr>
								<th>{{ __("Currency") }}</th>
								<th class="text-end">
									{{ __("Total") }}
								</th>
								<th class="text-end">
									{{ __("Invoices") }}
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in multiCurrencyTotals" :key="row.currency">
								<td>{{ row.currency }}</td>
								<td class="text-end">
									<div class="amount-with-base">
										<div class="amount-primary">
											<span class="overview-amount">
												{{
													formatCurrencyWithSymbol(
														row.total || 0,
														row.currency || overviewCompanyCurrency,
													)
												}}
											</span>
											<span
												v-if="shouldShowCompanyEquivalent(row, row.currency)"
												class="company-equivalent"
											>
												({{
													formatCurrencyWithSymbol(
														row.company_currency_total || 0,
														overviewCompanyCurrency,
													)
												}})
											</span>
										</div>
										<div
											v-if="showExchangeRates(row, row.currency)"
											class="exchange-note"
										>
											{{
												formatExchangeRates(
													row.exchange_rates,
													row.currency || overviewCompanyCurrency,
													overviewCompanyCurrency,
												)
											}}
										</div>
									</div>
								</td>
								<td class="text-end">{{ row.invoice_count || 0 }}</td>
							</tr>
						</tbody>
					</table>
				</div>
				<div v-else class="overview-empty text-body-2">
					{{ __("No invoices recorded for this shift.") }}
				</div>
			</div>

			<v-row dense class="mt-4">
				<v-col cols="12" md="6">
					<div class="table-section">
						<div class="table-header mb-2">
							<h5 class="text-subtitle-1 text-grey-darken-2 mb-1">
								{{ __("Outstanding Credit by Currency") }}
							</h5>
							<p class="text-body-2 text-grey">
								{{ __("Credit sales remaining to be collected") }}
							</p>
						</div>
						<div v-if="creditInvoicesByCurrency.length" class="overview-table-wrapper">
							<table class="overview-table">
								<thead>
									<tr>
										<th>{{ __("Currency") }}</th>
										<th class="text-end">
											{{ __("Outstanding") }}
										</th>
										<th class="text-end">
											{{ __("Invoices") }}
										</th>
									</tr>
								</thead>
								<tbody>
									<tr
										v-for="row in creditInvoicesByCurrency"
										:key="`credit-${row.currency}`"
									>
										<td>{{ row.currency }}</td>
										<td class="text-end">
											<div class="amount-with-base">
												<div class="amount-primary">
													<span class="overview-amount">
														{{
															formatCurrencyWithSymbol(
																row.total || 0,
																row.currency || overviewCompanyCurrency,
															)
														}}
													</span>
													<span
														v-if="shouldShowCompanyEquivalent(row, row.currency)"
														class="company-equivalent"
													>
														({{
															formatCurrencyWithSymbol(
																row.company_currency_total || 0,
																overviewCompanyCurrency,
															)
														}})
													</span>
												</div>
												<div
													v-if="showExchangeRates(row, row.currency)"
													class="exchange-note"
												>
													{{
														formatExchangeRates(
															row.exchange_rates,
															row.currency || overviewCompanyCurrency,
															overviewCompanyCurrency,
														)
													}}
												</div>
											</div>
										</td>
										<td class="text-end">
											{{ row.invoice_count || 0 }}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<div v-else class="overview-empty text-body-2">
							{{ __("No outstanding credit invoices for this shift.") }}
						</div>
					</div>
				</v-col>
				<v-col cols="12" md="6">
					<div class="table-section">
						<div class="table-header mb-2">
							<h5 class="text-subtitle-1 text-grey-darken-2 mb-1">
								{{ __("Returns by Currency") }}
							</h5>
							<p class="text-body-2 text-grey">
								{{ __("Processed returns impacting the shift totals") }}
							</p>
						</div>
						<div v-if="returnsByCurrency.length" class="overview-table-wrapper">
							<table class="overview-table">
								<thead>
									<tr>
										<th>{{ __("Currency") }}</th>
										<th class="text-end">
											{{ __("Returns") }}
										</th>
										<th class="text-end">
											{{ __("Count") }}
										</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="row in returnsByCurrency" :key="`return-${row.currency}`">
										<td>{{ row.currency }}</td>
										<td class="text-end">
											<div class="amount-with-base">
												<div class="amount-primary">
													<span class="overview-amount">
														{{
															formatCurrencyWithSymbol(
																row.total || 0,
																row.currency || overviewCompanyCurrency,
															)
														}}
													</span>
													<span
														v-if="shouldShowCompanyEquivalent(row, row.currency)"
														class="company-equivalent"
													>
														({{
															formatCurrencyWithSymbol(
																row.company_currency_total || 0,
																overviewCompanyCurrency,
															)
														}})
													</span>
												</div>
												<div
													v-if="showExchangeRates(row, row.currency)"
													class="exchange-note"
												>
													{{
														formatExchangeRates(
															row.exchange_rates,
															row.currency || overviewCompanyCurrency,
															overviewCompanyCurrency,
														)
													}}
												</div>
											</div>
										</td>
										<td class="text-end">
											{{ row.invoice_count || 0 }}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<div v-else class="overview-empty text-body-2">
							{{ __("No returns were processed in this shift.") }}
						</div>
					</div>
				</v-col>
			</v-row>

			<v-row dense class="mt-4">
				<v-col cols="12" md="6">
					<div class="table-section">
						<div class="table-header mb-2">
							<h5 class="text-subtitle-1 text-grey-darken-2 mb-1">
								{{ __("Change Returned") }}
							</h5>
							<p class="text-body-2 text-grey">
								{{ __("Track how much cash was handed back to customers") }}
							</p>
						</div>
						<div v-if="changeReturnedRows.length" class="overview-table-wrapper">
							<table class="overview-table">
								<thead>
									<tr>
										<th>{{ __("Currency") }}</th>
										<th class="text-end">
											{{ __("Invoice Change") }}
										</th>
										<th class="text-end">
											{{ __("Overpayment Change") }}
										</th>
										<th class="text-end">
											{{ __("Total Change") }}
										</th>
									</tr>
								</thead>
								<tbody>
									<tr
										v-for="row in changeReturnedRows"
										:key="`change-returned-${row.currency}`"
									>
										<td>{{ row.currency }}</td>
										<td class="text-end">
											<div class="amount-with-base">
												<div class="amount-primary">
													<span class="overview-amount">
														{{
															formatCurrencyWithSymbol(
																row.invoice_total,
																row.currency || overviewCompanyCurrency,
															)
														}}
													</span>
													<span
														v-if="
															shouldShowCompanyEquivalent(
																{
																	currency: row.currency,
																	total: row.invoice_total,
																	company_currency_total:
																		row.invoice_company_currency_total,
																},
																row.currency,
															)
														"
														class="company-equivalent"
													>
														({{
															formatCurrencyWithSymbol(
																row.invoice_company_currency_total,
																overviewCompanyCurrency,
															)
														}})
													</span>
												</div>
												<div
													v-if="showExchangeRates(row, row.currency)"
													class="exchange-note"
												>
													{{
														formatExchangeRates(
															row.exchange_rates,
															row.currency || overviewCompanyCurrency,
															overviewCompanyCurrency,
														)
													}}
												</div>
											</div>
										</td>
										<td class="text-end">
											<div class="amount-with-base">
												<div class="amount-primary">
													<span class="overview-amount">
														{{
															formatCurrencyWithSymbol(
																row.overpayment_total,
																row.currency || overviewCompanyCurrency,
															)
														}}
													</span>
													<span
														v-if="
															shouldShowCompanyEquivalent(
																{
																	currency: row.currency,
																	total: row.overpayment_total,
																	company_currency_total:
																		row.overpayment_company_currency_total,
																},
																row.currency,
															)
														"
														class="company-equivalent"
													>
														({{
															formatCurrencyWithSymbol(
																row.overpayment_company_currency_total,
																overviewCompanyCurrency,
															)
														}})
													</span>
												</div>
												<div
													v-if="showExchangeRates(row, row.currency)"
													class="exchange-note"
												>
													{{
														formatExchangeRates(
															row.exchange_rates,
															row.currency || overviewCompanyCurrency,
															overviewCompanyCurrency,
														)
													}}
												</div>
											</div>
										</td>
										<td class="text-end">
											<div class="amount-with-base">
												<div class="amount-primary">
													<span class="overview-amount">
														{{
															formatCurrencyWithSymbol(
																row.total,
																row.currency || overviewCompanyCurrency,
															)
														}}
													</span>
													<span
														v-if="
															shouldShowCompanyEquivalent(
																row.company_currency_total,
																row.currency,
															)
														"
														class="company-equivalent"
													>
														({{
															formatCurrencyWithSymbol(
																row.company_currency_total,
																overviewCompanyCurrency,
															)
														}})
													</span>
												</div>
												<div
													v-if="showExchangeRates(row, row.currency)"
													class="exchange-note"
												>
													{{
														formatExchangeRates(
															row.exchange_rates,
															row.currency || overviewCompanyCurrency,
															overviewCompanyCurrency,
														)
													}}
												</div>
											</div>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<div v-else class="overview-empty text-body-2">
							{{ __("No change returned recorded for this shift.") }}
						</div>
					</div>
					<!-- End: Change Returned -->
					<div class="table-section">
						<div class="table-header mb-2">
							<h5 class="text-subtitle-1 text-grey-darken-2 mb-1">
								{{ __("Cash Drawer Snapshot") }}
							</h5>
							<p class="text-body-2 text-grey">
								{{ __("Expected cash on hand grouped by currency") }}
							</p>
						</div>
						<div v-if="cashExpectedByCurrency.length" class="overview-table-wrapper">
							<table class="overview-table">
								<thead>
									<tr>
										<th>{{ __("Currency") }}</th>
										<th class="text-end">
											{{ __("Expected Cash") }}
										</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="row in cashExpectedByCurrency" :key="`cash-${row.currency}`">
										<td>{{ row.currency }}</td>
										<td class="text-end">
											<div class="amount-with-base">
												<div class="amount-primary">
													<span class="overview-amount">
														{{
															formatCurrencyWithSymbol(
																row.total || 0,
																row.currency || overviewCompanyCurrency,
															)
														}}
													</span>
													<span
														v-if="shouldShowCompanyEquivalent(row, row.currency)"
														class="company-equivalent"
													>
														({{
															formatCurrencyWithSymbol(
																row.company_currency_total || 0,
																overviewCompanyCurrency,
															)
														}})
													</span>
												</div>
												<div
													v-if="
														isCashMode(row.mode_of_payment) &&
														overpaymentDeductionForCurrency(row.currency)
													"
													class="exchange-note"
												>
													{{
														__("Overpayment change deducted: {0}", [
															formatCurrencyWithSymbol(
																overpaymentDeductionForCurrency(row.currency),
																row.currency || overviewCompanyCurrency,
															),
														])
													}}
												</div>
												<div
													v-if="showExchangeRates(row, row.currency)"
													class="exchange-note"
												>
													{{
														formatExchangeRates(
															row.exchange_rates,
															row.currency || overviewCompanyCurrency,
															overviewCompanyCurrency,
														)
													}}
												</div>
											</div>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<div v-else class="overview-empty text-body-2">
							{{ __("No cash expected for this shift.") }}
						</div>
					</div>
					<div class="table-section mt-4">
						<div class="table-header mb-2">
							<h5 class="text-subtitle-1 text-grey-darken-2 mb-1">
								{{ __("Submitted Cash Movements") }}
							</h5>
							<p class="text-body-2 text-grey">
								{{ __("Expenses and deposits posted during this shift") }}
							</p>
						</div>
						<div v-if="cashMovementSummary?.count" class="overview-table-wrapper">
							<table class="overview-table">
								<thead>
									<tr>
										<th>{{ __("Movement Type") }}</th>
										<th class="text-end">{{ __("Amount") }}</th>
									</tr>
								</thead>
								<tbody>
									<tr
										v-for="row in cashMovementSummary.by_type || []"
										:key="`cash-movement-${row.movement_type}`"
									>
										<td>{{ row.movement_type }}</td>
										<td class="text-end">
											{{ formatCurrencyWithSymbol(row.total || 0, overviewCompanyCurrency) }}
										</td>
									</tr>
									<tr>
										<td><strong>{{ __("Total") }}</strong></td>
										<td class="text-end">
											<strong>
												{{
													formatCurrencyWithSymbol(
														cashMovementSummary.company_currency_total || 0,
														overviewCompanyCurrency,
													)
												}}
											</strong>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<div v-else class="overview-empty text-body-2">
							{{ __("No submitted cash movements in this shift.") }}
						</div>
					</div>
				</v-col>
			</v-row>

			<div class="table-section mt-4">
				<div class="table-header mb-2">
					<h5 class="text-subtitle-1 text-grey-darken-2 mb-1">
						{{ __("Payments by Mode of Payment") }}
					</h5>
					<p class="text-body-2 text-grey">
						{{ __("Grouped totals for each payment method and currency") }}
					</p>
				</div>

				<div v-if="paymentsByMode.length" class="overview-table-wrapper">
					<table class="overview-table">
						<thead>
							<tr>
								<th>{{ __("Mode of Payment") }}</th>
								<th>{{ __("Currency") }}</th>
								<th class="text-end">
									{{ __("Amount") }}
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in paymentsByMode" :key="`${row.mode_of_payment}-${row.currency}`">
								<td>{{ row.mode_of_payment }}</td>
								<td>{{ row.currency }}</td>
								<td class="text-end">
									<div class="amount-with-base">
										<div class="amount-primary">
											<span class="overview-amount">
												{{
													formatCurrencyWithSymbol(
														row.total || 0,
														row.currency || overviewCompanyCurrency,
													)
												}}
											</span>
											<span
												v-if="shouldShowCompanyEquivalent(row, row.currency)"
												class="company-equivalent"
											>
												({{
													formatCurrencyWithSymbol(
														row.company_currency_total || 0,
														overviewCompanyCurrency,
													)
												}})
											</span>
										</div>
										<div
											v-if="showExchangeRates(row, row.currency)"
											class="exchange-note"
										>
											{{
												formatExchangeRates(
													row.exchange_rates,
													row.currency || overviewCompanyCurrency,
													overviewCompanyCurrency,
												)
											}}
										</div>
									</div>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
				<div v-else class="overview-empty text-body-2">
					{{ __("No payments registered for this shift.") }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
defineProps({
	loading: Boolean,
	primaryInsights: Array,
	secondaryInsights: Array,
	multiCurrencyTotals: Array,
	creditInvoicesByCurrency: Array,
	returnsByCurrency: Array,
	changeReturnedRows: Array,
	cashExpectedByCurrency: Array,
	cashMovementSummary: Object,
	paymentsByMode: Array,
	overviewCompanyCurrency: String,
	// Functions
	formatCurrencyWithSymbol: Function,
	shouldShowCompanyEquivalent: Function,
	showExchangeRates: Function,
	formatExchangeRates: Function,
	isCashMode: Function,
	overpaymentDeductionForCurrency: Function,
});

const __ = window.__ || ((t) => t);
</script>

<style scoped>
.overview-wrapper {
	display: flex;
	flex-direction: column;
	gap: 24px;
	width: 100%;
}

.table-header {
	margin-bottom: 24px;
}

.insight-grid {
	margin-bottom: 8px;
}

.insight-card {
	background: rgb(var(--v-theme-surface));
	border-radius: 12px;
	padding: 16px;
	display: flex;
	align-items: flex-start;
	gap: 16px;
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	width: 100%;
	transition: all 0.2s ease;
}

.insight-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	border-color: rgba(var(--v-border-color), 0.5);
}

.insight-card.compact {
	padding: 12px 16px;
}

.insight-icon {
	width: 48px;
	height: 48px;
	border-radius: 12px;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.insight-card.compact .insight-icon {
	width: 40px;
	height: 40px;
}

/* Accent Colors for Icons - Theme Aware */
.accent-primary {
	background-color: rgba(var(--v-theme-primary), 0.1);
	color: rgb(var(--v-theme-primary));
}
.accent-success {
	background-color: rgba(var(--v-theme-success), 0.1);
	color: rgb(var(--v-theme-success));
}
.accent-secondary {
	background-color: rgba(var(--v-theme-secondary), 0.1);
	color: rgb(var(--v-theme-secondary));
}
.accent-info {
	background-color: rgba(var(--v-theme-info), 0.1);
	color: rgb(var(--v-theme-info));
}
.accent-warning {
	background-color: rgba(var(--v-theme-warning), 0.1);
	color: rgb(var(--v-theme-warning));
}

.insight-body {
	flex: 1;
	min-width: 0;
}

.insight-label {
	font-size: 0.75rem;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	opacity: 0.7;
	font-weight: 600;
	margin-bottom: 4px;
}

.insight-value {
	font-size: 1.25rem;
	font-weight: 700;
	line-height: 1.2;
}

.insight-card.compact .insight-value {
	font-size: 1.1rem;
}

.insight-caption {
	font-size: 0.75rem;
	opacity: 0.6;
	margin-top: 4px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.table-section {
	background: rgb(var(--v-theme-surface));
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	border-radius: 12px;
	padding: 24px;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
}

.overview-table-wrapper {
	overflow-x: auto;
	width: 100%;
}

.overview-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 0.875rem;
}

.overview-table th {
	text-align: left;
	opacity: 0.7;
	font-weight: 600;
	padding: 12px 16px;
	border-bottom: 2px solid rgba(var(--v-border-color), 0.1);
	white-space: nowrap;
}

.overview-table td {
	padding: 14px 16px;
	border-bottom: 1px solid rgba(var(--v-border-color), 0.05);
	vertical-align: top;
}

.overview-table tbody tr:last-child td {
	border-bottom: none;
}

.overview-table tbody tr:hover {
	background-color: rgba(var(--v-theme-on-surface), 0.02);
}

.text-end {
	text-align: right !important;
}

.amount-with-base {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
}

.amount-primary {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
}

.overview-amount {
	font-weight: 600;
}

.company-equivalent {
	font-size: 0.75rem;
	opacity: 0.6;
	margin-top: 2px;
}

.exchange-note {
	font-size: 0.7rem;
	color: rgb(var(--v-theme-primary));
	background-color: rgba(var(--v-theme-primary), 0.1);
	padding: 2px 6px;
	border-radius: 4px;
	margin-top: 4px;
	display: inline-block;
}

.overview-empty {
	padding: 24px;
	text-align: center;
	background-color: rgba(var(--v-theme-on-surface), 0.03);
	border-radius: 8px;
	opacity: 0.6;
	font-style: italic;
}
</style>
