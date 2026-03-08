<template>
	<div class="awesome-dashboard-view">
		<v-container fluid class="dashboard-shell pa-3 pa-sm-4">
			<div class="dashboard-toolbar mb-4">
				<div>
					<h1 class="text-h5 text-sm-h4 font-weight-bold mb-1">{{ __("Awesome Dashboard") }}</h1>
					<p class="text-body-2 text-medium-emphasis mb-0">
						{{ __("Real-time POS insights for retail operations.") }}
					</p>
					<div class="dashboard-meta mt-2">
						<v-chip size="x-small" color="secondary" variant="tonal" class="mr-1 mb-1">
							{{ scopeDisplayLabel }}
						</v-chip>
						<v-chip size="x-small" color="info" variant="tonal" class="mr-1 mb-1">
							{{ __("Profiles") }}: {{ selectedProfilesCount }}
						</v-chip>
						<v-chip size="x-small" :color="profitMethodColor" variant="tonal" class="mr-1 mb-1">
							{{ profitMethodLabel }}
						</v-chip>
					</div>
				</div>
				<div class="dashboard-actions">
					<v-select
						v-model="dashboardScope"
						:items="dashboardScopeItems"
						item-title="label"
						item-value="value"
						density="compact"
						variant="outlined"
						hide-details
						class="dashboard-filter mr-2 mb-2 mb-sm-0"
						:label="__('Scope')"
					/>
					<v-select
						v-if="dashboardScope === 'specific'"
						v-model="selectedProfileFilter"
						:items="profileFilterItems"
						item-title="label"
						item-value="value"
						density="compact"
						variant="outlined"
						hide-details
						class="dashboard-filter mr-2 mb-2 mb-sm-0"
						:label="__('Profile')"
					/>
					<v-text-field
						v-model="selectedReportMonth"
						type="month"
						:max="currentMonthToken"
						density="compact"
						variant="outlined"
						hide-details
						class="dashboard-filter mr-2 mb-2 mb-sm-0"
						:label="__('Month')"
					/>
					<v-chip
						v-if="lastUpdatedLabel"
						size="small"
						variant="tonal"
						color="primary"
						class="mr-2 mb-2 mb-sm-0"
					>
						{{ lastUpdatedLabel }}
					</v-chip>
					<v-btn color="primary" variant="flat" :loading="loading" @click="loadDashboard">
						{{ __("Refresh") }}
					</v-btn>
				</div>
			</div>

			<v-alert
				v-if="!isDashboardEnabledOnServer"
				type="warning"
				variant="tonal"
				class="mb-4"
			>
				{{ disabledReasonText }}
			</v-alert>

			<v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
				{{ errorMessage }}
			</v-alert>

			<template v-if="canRenderDashboard">
				<div class="dashboard-tabs mb-3">
					<div class="dashboard-tabs--desktop">
						<v-tabs v-model="activeDashboardTab" color="primary" class="dashboard-tab-bar" density="comfortable">
							<v-tab value="sales">{{ __("Sales") }}</v-tab>
							<v-tab value="staff">{{ __("Staff") }}</v-tab>
							<v-tab value="customers">{{ __("Customers") }}</v-tab>
							<v-tab value="finance">{{ __("Finance") }}</v-tab>
							<v-tab value="branches">{{ __("Branches") }}</v-tab>
							<v-tab value="products">{{ __("Products") }}</v-tab>
							<v-tab value="inventory">{{ __("Inventory") }}</v-tab>
							<v-tab value="procurement">{{ __("Procurement") }}</v-tab>
						</v-tabs>
					</div>
					<div class="dashboard-tabs--mobile">
						<v-btn
							v-for="tab in dashboardTabItems"
							:key="`tab-card-${tab.value}`"
							:block="true"
							:variant="activeDashboardTab === tab.value ? 'flat' : 'tonal'"
							:color="activeDashboardTab === tab.value ? 'primary' : 'secondary'"
							class="tab-card-btn"
							@click="activeDashboardTab = tab.value"
						>
							<v-icon size="16" start>{{ tab.icon }}</v-icon>
							<span class="tab-card-label">{{ tab.label }}</span>
						</v-btn>
					</div>
				</div>

				<v-row v-show="activeDashboardTab === 'sales'" class="dashboard-grid mb-2">
					<v-col v-for="metric in salesMetrics" :key="metric.key" cols="12" sm="6" lg="3">
						<v-card class="metric-card" :class="metric.styleClass" elevation="2">
							<div class="metric-card__header">
								<span class="metric-card__label">{{ metric.label }}</span>
								<v-icon size="20">{{ metric.icon }}</v-icon>
							</div>
							<div class="metric-card__value">{{ formatMoney(metric.value) }}</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'sales'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Monthly Sales Summary") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ __("Month") }}: {{ monthlySummaryRangeLabel }}
									</v-chip>
									<v-chip
										size="small"
										:color="monthlySummary.has_closing_snapshot ? 'success' : 'warning'"
										variant="tonal"
									>
										{{
											monthlySummary.has_closing_snapshot
												? __("Closing Snapshot Available")
												: __("Live Snapshot")
										}}
									</v-chip>
								</div>
							</div>
							<div class="summary-grid">
								<div v-for="metric in monthlySummaryMetrics" :key="metric.key" class="summary-metric">
									<div class="summary-metric__label">{{ metric.label }}</div>
									<div class="summary-metric__value" :class="metric.valueClass">
										{{ metric.value }}
									</div>
								</div>
							</div>
							<div v-if="monthlyPaymentMethods.length" class="payment-breakdown">
								<div class="summary-metric__label">{{ __("Payment Methods") }}</div>
								<div class="payment-chip-list">
									<v-chip
										v-for="payment in monthlyPaymentMethods"
										:key="payment.mode_of_payment"
										size="small"
										:color="paymentCategoryColor(payment.category)"
										variant="tonal"
									>
										{{ payment.mode_of_payment }}: {{ formatMoney(payment.amount) }}
									</v-chip>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

<v-row v-show="activeDashboardTab === 'sales'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Daily Sales Summary") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ __("Date") }}: {{ dailySummaryRangeLabel }}
									</v-chip>
									<v-chip
										size="small"
										:color="dailySummary.has_closing_snapshot ? 'success' : 'warning'"
										variant="tonal"
									>
										{{
											dailySummary.has_closing_snapshot
												? __("Shift Closed Snapshot")
												: __("Live Snapshot")
										}}
									</v-chip>
								</div>
							</div>
							<div class="summary-grid">
								<div v-for="metric in dailySummaryMetrics" :key="metric.key" class="summary-metric">
									<div class="summary-metric__label">{{ metric.label }}</div>
									<div class="summary-metric__value" :class="metric.valueClass">
										{{ metric.value }}
									</div>
								</div>
							</div>
							<div v-if="dailyPaymentMethods.length" class="payment-breakdown">
								<div class="summary-metric__label">{{ __("Payment Methods") }}</div>
								<div class="payment-chip-list">
									<v-chip
										v-for="payment in dailyPaymentMethods"
										:key="payment.mode_of_payment"
										size="small"
										:color="paymentCategoryColor(payment.category)"
										variant="tonal"
									>
										{{ payment.mode_of_payment }}: {{ formatMoney(payment.amount) }}
									</v-chip>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

<v-row v-show="activeDashboardTab === 'sales'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Sales Trend Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ salesTrendRangeLabel }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Best Day") }}: {{ bestDayLabel }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Peak Hour") }}: {{ bestHourLabel }}
									</v-chip>
									<v-chip
										v-for="chip in trendGrowthChips"
										:key="chip.key"
										size="small"
										:color="chip.color"
										variant="tonal"
									>
										{{ chip.label }}: {{ chip.value }}
									</v-chip>
								</div>
							</div>

							<div class="trend-grid">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Day-wise (MTD)") }}</div>
									<div v-if="salesTrendDayPoints.length" class="list-stack trend-list">
										<div v-for="point in salesTrendDayPoints" :key="`day-${point.date}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ formatDate(point.date) }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(point.sales || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Invoices") }}: {{ formatQuantity(Number(point.invoice_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(point.sales || 0), salesTrendDayMax)"
												color="primary"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No day-wise sales trend found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Week-wise") }}</div>
									<div v-if="salesTrendWeekPoints.length" class="list-stack trend-list">
										<div v-for="point in salesTrendWeekPoints" :key="`week-${point.label}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ point.label || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(point.sales || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ formatDate(point.week_start) }} - {{ formatDate(point.week_end) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(point.sales || 0), salesTrendWeekMax)"
												color="info"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No week-wise sales trend found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Month-wise") }}</div>
									<div v-if="salesTrendMonthPoints.length" class="list-stack trend-list">
										<div v-for="point in salesTrendMonthPoints" :key="`month-${point.month}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ point.label || point.month || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(point.sales || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Invoices") }}: {{ formatQuantity(Number(point.invoice_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(point.sales || 0), salesTrendMonthMax)"
												color="success"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No month-wise sales trend found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Hourly (Today)") }}</div>
									<div v-if="salesTrendHourPoints.length" class="list-stack trend-list">
										<div v-for="point in salesTrendHourPoints" :key="`hour-${point.hour}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ point.label || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(point.sales || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Invoices") }}: {{ formatQuantity(Number(point.invoice_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(point.sales || 0), salesTrendHourMax)"
												color="warning"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No hourly sales trend found for today.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

<v-row v-show="activeDashboardTab === 'sales'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Discount / Void / Return Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ discountVoidReturnRangeLabel }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Discount") }}: {{ formatMoney(Number(discountVoidReturnTotals.discount_amount || 0)) }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Returns") }}: {{ formatMoney(Number(discountVoidReturnTotals.return_amount || 0)) }}
									</v-chip>
									<v-chip size="small" color="error" variant="tonal">
										{{ __("Voids") }}: {{ formatMoney(Number(discountVoidReturnTotals.void_amount || 0)) }}
									</v-chip>
								</div>
							</div>

							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Discounted Invoices") }}</div>
									<div class="summary-metric__value">
										{{ formatQuantity(Number(discountVoidReturnTotals.discounted_invoice_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Return Count") }}</div>
									<div class="summary-metric__value">
										{{ formatQuantity(Number(discountVoidReturnTotals.return_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Void Count") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatQuantity(Number(discountVoidReturnTotals.void_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Discount Amount") }}</div>
									<div class="summary-metric__value">
										{{ formatMoney(Number(discountVoidReturnTotals.discount_amount || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Return Amount") }}</div>
									<div class="summary-metric__value">
										{{ formatMoney(Number(discountVoidReturnTotals.return_amount || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Void Amount") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatMoney(Number(discountVoidReturnTotals.void_amount || 0)) }}
									</div>
								</div>
							</div>

							<div class="trend-grid">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Cashier-wise") }}</div>
									<div v-if="discountCashierRows.length" class="list-stack trend-list">
										<div v-for="row in discountCashierRows" :key="`dvr-cashier-${row.cashier}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.cashier || __("Unknown") }}</div>
												<div class="insight-row__value">
													{{ formatMoney(Number(row.void_amount || 0) + Number(row.return_amount || 0)) }}
												</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Discount") }}: {{ formatMoney(Number(row.discount_amount || 0)) }} .
												{{ __("Returns") }}: {{ formatQuantity(Number(row.return_count || 0)) }} .
												{{ __("Voids") }}: {{ formatQuantity(Number(row.void_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="
													trendProgress(
														Number(row.discount_amount || 0) +
															Number(row.return_amount || 0) +
															Number(row.void_amount || 0),
														discountCashierMax,
													)
												"
												color="error"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No cashier-wise discount/void/return activity.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Top Return Items") }}</div>
									<div v-if="discountTopReturnItems.length" class="list-stack trend-list">
										<div
											v-for="row in discountTopReturnItems"
											:key="`dvr-item-${row.item_code || row.item_name}`"
											class="insight-row"
										>
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.item_name || row.item_code || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.return_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ row.item_code || "-" }} .
												{{ __("Qty") }}: {{ formatQuantity(Number(row.return_qty || 0)) }} {{ row.stock_uom || "" }} .
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.return_invoice_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.return_amount || 0), discountReturnItemMax)"
												color="primary"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No return item trend found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Last 14 Days Activity") }}</div>
									<div v-if="discountDayRows.length" class="list-stack trend-list">
										<div v-for="row in discountDayRows" :key="`dvr-day-${row.date}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ formatDate(row.date) }}</div>
												<div class="insight-row__value">
													{{ formatMoney(Number(row.discount_amount || 0) + Number(row.return_amount || 0) + Number(row.void_amount || 0)) }}
												</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Discount") }}: {{ formatMoney(Number(row.discount_amount || 0)) }} .
												{{ __("Returns") }}: {{ formatQuantity(Number(row.return_count || 0)) }} .
												{{ __("Voids") }}: {{ formatQuantity(Number(row.void_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="
													trendProgress(
														Number(row.discount_amount || 0) +
															Number(row.return_amount || 0) +
															Number(row.void_amount || 0),
														discountDayMax,
													)
												"
												color="warning"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No day-wise discount/void/return trend.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

<v-row v-show="activeDashboardTab === 'sales'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Payment Method Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ paymentReportRangeLabel }}
									</v-chip>
									<v-chip size="small" color="success" variant="tonal">
										{{ __("Collected") }}: {{ formatMoney(Number(paymentReportTotals.collected_amount || 0)) }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Pending") }}: {{ formatMoney(Number(paymentReportTotals.pending_amount || 0)) }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Split Invoices") }}: {{ formatQuantity(Number(paymentReportTotals.split_invoice_count || 0)) }}
									</v-chip>
								</div>
							</div>

							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Invoices") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(paymentReportTotals.invoice_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Pending Invoices") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatQuantity(Number(paymentReportTotals.pending_invoice_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Partial") }}</div>
									<div class="summary-metric__value">
										{{ formatQuantity(Number(paymentReportTotals.partial_invoice_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Unpaid") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatQuantity(Number(paymentReportTotals.unpaid_invoice_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Cash") }}</div>
									<div class="summary-metric__value">
										{{ formatMoney(Number(paymentReportTotals.cash_amount || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Card / Online") }}</div>
									<div class="summary-metric__value">
										{{ formatMoney(Number(paymentReportTotals.card_online_amount || 0)) }}
									</div>
								</div>
							</div>

							<div class="trend-grid trend-grid--two">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Method-wise Collections") }}</div>
									<div v-if="paymentMethodRows.length" class="list-stack trend-list">
										<div v-for="row in paymentMethodRows" :key="`pay-method-${row.mode_of_payment}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.mode_of_payment }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Category") }}: {{ row.category || "-" }} .
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }} .
												{{ __("Share") }}: {{ formatPercent(row.share_pct, 1) }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No payment collection data found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Last 14 Days (Paid vs Pending)") }}</div>
									<div v-if="paymentDayRows.length" class="list-stack trend-list">
										<div v-for="row in paymentDayRows" :key="`pay-day-${row.date}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ formatDate(row.date) }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.paid_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Pending") }}: {{ formatMoney(Number(row.pending_amount || 0)) }} .
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="
													trendProgress(
														Number(row.paid_amount || 0) + Number(row.pending_amount || 0),
														paymentDayMax,
													)
												"
												color="info"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No day-wise payment data found.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'staff'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Staff / Cashier Performance Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ staffReportRangeLabel }}
									</v-chip>
									<v-chip size="small" color="success" variant="tonal">
										{{ __("Sales") }}: {{ formatMoney(Number(staffSummary.sales_amount || 0)) }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Discounts") }}: {{ formatMoney(Number(staffSummary.discount_amount || 0)) }}
									</v-chip>
									<v-chip size="small" color="error" variant="tonal">
										{{ __("Voids") }}: {{ formatQuantity(Number(staffSummary.void_count || 0)) }}
									</v-chip>
								</div>
							</div>

							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Cashiers") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(staffSummary.cashier_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Invoices") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(staffSummary.invoice_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Items Sold") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(staffSummary.items_sold || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Avg Bill") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(staffSummary.average_bill || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Returns") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(staffSummary.return_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Voids") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatQuantity(Number(staffSummary.void_count || 0)) }}
									</div>
								</div>
							</div>

							<div class="trend-grid">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Top Sales by Cashier") }}</div>
									<div v-if="staffCashierRows.length" class="list-stack trend-list">
										<div v-for="row in staffCashierRows" :key="`staff-sales-${row.cashier}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.cashier || __("Unknown") }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.sales_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }} .
												{{ __("Items") }}: {{ formatQuantity(Number(row.items_sold || 0)) }} .
												{{ __("Avg Bill") }}: {{ formatMoney(Number(row.average_bill || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.sales_amount || 0), staffSalesMax)"
												color="success"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No staff sales activity found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Most Active Cashiers") }}</div>
									<div v-if="staffInvoiceRows.length" class="list-stack trend-list">
										<div v-for="row in staffInvoiceRows" :key="`staff-inv-${row.cashier}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.cashier || __("Unknown") }}</div>
												<div class="insight-row__value">{{ formatQuantity(Number(row.invoice_count || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Sales") }}: {{ formatMoney(Number(row.sales_amount || 0)) }} .
												{{ __("Items/Invoice") }}: {{ Number(row.items_per_invoice || 0).toFixed(2) }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No invoice activity found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Returns / Voids / Discounts") }}</div>
									<div v-if="staffRiskRows.length" class="list-stack trend-list">
										<div v-for="row in staffRiskRows" :key="`staff-risk-${row.cashier}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.cashier || __("Unknown") }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.void_amount || 0) + Number(row.return_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Returns") }}: {{ formatQuantity(Number(row.return_count || 0)) }} .
												{{ __("Voids") }}: {{ formatQuantity(Number(row.void_count || 0)) }} .
												{{ __("Discount") }}: {{ formatMoney(Number(row.discount_amount || 0)) }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No risk activity found.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'customers'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Customer Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ customerReportRangeLabel }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Repeat Rate") }}: {{ formatPercent(customerSummary.repeat_customer_rate_pct, 1) }}
									</v-chip>
									<v-chip size="small" color="success" variant="tonal">
										{{ __("Sales") }}: {{ formatMoney(Number(customerSummary.sales_amount || 0)) }}
									</v-chip>
								</div>
							</div>

							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Customers") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(customerSummary.customer_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Repeat Customers") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(customerSummary.repeat_customer_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Invoices") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(customerSummary.invoice_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Average Basket") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(customerSummary.average_basket_size || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Avg Purchase Frequency") }}</div>
									<div class="summary-metric__value">{{ formatDays(customerSummary.average_purchase_frequency_days) }}</div>
								</div>
							</div>

							<div class="trend-grid">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Top Customers") }}</div>
									<div v-if="topCustomerRows.length" class="list-stack trend-list">
										<div v-for="row in topCustomerRows" :key="`cust-top-${row.customer}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.customer_name || row.customer || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.sales_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ row.customer || "-" }} .
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }} .
												{{ __("Avg Bill") }}: {{ formatMoney(Number(row.average_basket_size || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.sales_amount || 0), customerSalesMax)"
												color="primary"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No customer sales data found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Repeat Customers") }}</div>
									<div v-if="repeatCustomerRows.length" class="list-stack trend-list">
										<div v-for="row in repeatCustomerRows" :key="`cust-repeat-${row.customer}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.customer_name || row.customer || "-" }}</div>
												<div class="insight-row__value">{{ formatQuantity(Number(row.invoice_count || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Sales") }}: {{ formatMoney(Number(row.sales_amount || 0)) }} .
												{{ __("Frequency") }}: {{ formatDays(row.purchase_frequency_days) }} .
												{{ __("Last") }}: {{ formatDate(row.last_purchase_date || undefined) }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No repeat customers in this period.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Recently Active Customers") }}</div>
									<div v-if="recentCustomerRows.length" class="list-stack trend-list">
										<div v-for="row in recentCustomerRows" :key="`cust-recent-${row.customer}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.customer_name || row.customer || "-" }}</div>
												<div class="insight-row__value">{{ formatDate(row.last_purchase_date || undefined) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }} .
												{{ __("Sales") }}: {{ formatMoney(Number(row.sales_amount || 0)) }} .
												{{ __("Returns") }}: {{ formatQuantity(Number(row.return_count || 0)) }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No recent customer activity found.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'finance'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Profitability Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ profitabilityRangeLabel }}
									</v-chip>
									<v-chip size="small" color="success" variant="tonal">
										{{ __("Top Profit Item") }}: {{ topProfitItemLabel }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Lowest Margin") }}: {{ lowestMarginItemLabel }}
									</v-chip>
								</div>
							</div>

							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Revenue") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(profitabilitySummary.revenue || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("COGS") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(profitabilitySummary.cogs || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Gross Profit") }}</div>
									<div class="summary-metric__value" :class="Number(profitabilitySummary.gross_profit || 0) < 0 ? 'summary-metric__value--danger' : ''">
										{{ formatMoney(Number(profitabilitySummary.gross_profit || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Gross Margin") }}</div>
									<div class="summary-metric__value">
										{{ formatPercent(profitabilitySummary.gross_margin_pct, 1) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Invoices") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(profitabilitySummary.invoice_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Avg Invoice Profit") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(profitabilitySummary.average_invoice_profit || 0)) }}</div>
								</div>
							</div>

							<div class="trend-grid">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Item-wise Profitability") }}</div>
									<div v-if="profitabilityItemRows.length" class="list-stack trend-list">
										<div v-for="row in profitabilityItemRows" :key="`profit-item-${row.item_code}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.item_name || row.item_code || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.gross_profit || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Revenue") }}: {{ formatMoney(Number(row.revenue || 0)) }} .
												{{ __("COGS") }}: {{ formatMoney(Number(row.cogs || 0)) }} .
												{{ __("Margin") }}: {{ formatPercent(row.gross_margin_pct, 1) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.gross_profit || 0), profitabilityItemMax)"
												color="success"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No item profitability data found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Category-wise Margin") }}</div>
									<div v-if="profitabilityCategoryRows.length" class="list-stack trend-list">
										<div v-for="row in profitabilityCategoryRows" :key="`profit-cat-${row.category || row.label}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.label || row.category || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.gross_profit || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Revenue") }}: {{ formatMoney(Number(row.revenue || 0)) }} .
												{{ __("Margin") }}: {{ formatPercent(row.gross_margin_pct, 1) }} .
												{{ __("Items") }}: {{ formatQuantity(Number(row.item_count || 0)) }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No category profitability data found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Last 14 Days Gross Profit") }}</div>
									<div v-if="profitabilityDayRows.length" class="list-stack trend-list">
										<div v-for="row in profitabilityDayRows" :key="`profit-day-${row.date}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ formatDate(row.date) }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.gross_profit || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Revenue") }}: {{ formatMoney(Number(row.revenue || 0)) }} .
												{{ __("COGS") }}: {{ formatMoney(Number(row.cogs || 0)) }} .
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.gross_profit || 0), profitabilityDayMax)"
												color="primary"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No day-wise profitability trend found.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'finance'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Tax / Charges Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ taxChargesRangeLabel }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Top Tax Head") }}: {{ topTaxHeadLabel }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Top Charge Head") }}: {{ topChargeHeadLabel }}
									</v-chip>
								</div>
							</div>

							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Invoices") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(taxChargesTotals.invoice_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Returns") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(taxChargesTotals.return_invoice_count || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Taxable Amount") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(taxChargesTotals.taxable_amount || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Tax") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(taxChargesTotals.tax_amount || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Service Charges") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(taxChargesTotals.service_charge_amount || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Fees") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(taxChargesTotals.fee_amount || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Round Off") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(taxChargesTotals.round_off_amount || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Invoice Adjustments") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(taxChargesTotals.invoice_adjustment_amount || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Total Charges") }}</div>
									<div class="summary-metric__value">{{ formatMoney(Number(taxChargesTotals.total_charge_amount || 0)) }}</div>
								</div>
							</div>

							<div class="trend-grid">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Tax Heads") }}</div>
									<div v-if="taxHeadRows.length" class="list-stack trend-list">
										<div v-for="row in taxHeadRows" :key="`tax-head-${row.label}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.label || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }} .
												{{ __("Share") }}: {{ formatPercent(row.share_pct, 1) }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No tax head breakdown found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Charge Heads") }}</div>
									<div v-if="chargeHeadRows.length" class="list-stack trend-list">
										<div v-for="row in chargeHeadRows" :key="`charge-head-${row.label}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.label || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Category") }}: {{ row.category || "-" }} .
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }} .
												{{ __("Share") }}: {{ formatPercent(row.share_pct, 1) }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No charge head breakdown found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Last 14 Days Tax/Charges") }}</div>
									<div v-if="taxChargesDayRows.length" class="list-stack trend-list">
										<div v-for="row in taxChargesDayRows" :key="`tax-day-${row.date}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ formatDate(row.date) }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.total_charge_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Tax") }}: {{ formatMoney(Number(row.tax_amount || 0)) }} .
												{{ __("Charges") }}:
												{{
													formatMoney(
														Number(row.service_charge_amount || 0) +
															Number(row.fee_amount || 0) +
															Number(row.other_charge_amount || 0),
													)
												}} .
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.total_charge_amount || 0), taxDayMax)"
												color="warning"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No day-wise tax/charges trend found.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'branches'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Branch / Location-wise Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ branchReportRangeLabel }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Locations") }}: {{ formatQuantity(Number(branchSummary.location_count || 0)) }}
									</v-chip>
									<v-chip size="small" color="success" variant="tonal">
										{{ __("Sales") }}: {{ formatMoney(Number(branchSummary.total_sales || 0)) }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Profit") }}: {{ formatMoney(Number(branchSummary.total_profit || 0)) }}
									</v-chip>
								</div>
							</div>

							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Total Invoices") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(branchSummary.total_invoices || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Total Stock Qty") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(branchSummary.total_stock_qty || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Low Stock Total") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatQuantity(Number(branchSummary.low_stock_total || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Cashiers") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(branchSummary.cashier_count || 0)) }}</div>
								</div>
							</div>

							<div class="trend-grid trend-grid--two">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Location Performance") }}</div>
									<div v-if="branchRows.length" class="list-stack trend-list">
										<div v-for="row in branchRows" :key="`branch-row-${row.profile}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.profile || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.sales_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Warehouse") }}: {{ row.warehouse || "-" }} .
												{{ __("Invoices") }}: {{ formatQuantity(Number(row.invoice_count || 0)) }} .
												{{ __("Avg Bill") }}: {{ formatMoney(Number(row.average_bill || 0)) }}
											</div>
											<div class="insight-row__meta">
												{{ __("Profit") }}: {{ formatMoney(Number(row.profit_amount || 0)) }} .
												{{ __("Stock") }}: {{ formatQuantity(Number(row.stock_qty || 0)) }} .
												{{ __("Low Stock") }}: {{ formatQuantity(Number(row.low_stock_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.sales_amount || 0), branchSalesMax)"
												color="primary"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No branch/location data found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Top Items by Location") }}</div>
									<div v-if="branchTopItemsByLocation.length" class="list-stack trend-list">
										<div
											v-for="location in branchTopItemsByLocation"
											:key="`branch-items-${location.profile}`"
											class="insight-row"
										>
											<div class="insight-row__top">
												<div class="insight-row__title">{{ location.profile || "-" }}</div>
												<div class="insight-row__value">{{ location.warehouse || "-" }}</div>
											</div>
											<div
												v-for="item in location.items || []"
												:key="`branch-item-${location.profile}-${item.item_code}`"
												class="insight-row__meta"
											>
												{{ item.item_name || item.item_code || "-" }}:
												{{ formatMoney(Number(item.sales_amount || 0)) }}
											</div>
											<div v-if="!(location.items || []).length" class="insight-row__meta">
												{{ __("No top items found for this location.") }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No location-wise top item data found.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'products'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Item / Product Sales Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ itemSalesRangeLabel }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Best Seller") }}: {{ itemSalesBestSellerLabel }}
									</v-chip>
									<v-chip size="small" color="success" variant="tonal">
										{{ __("Top Margin") }}: {{ itemSalesTopMarginLabel }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Top Discount") }}: {{ itemSalesTopDiscountLabel }}
									</v-chip>
								</div>
							</div>

							<div v-if="itemSalesItems.length" class="list-stack">
								<div v-for="item in itemSalesItems" :key="`item-sales-${item.item_code}`" class="insight-row">
									<div class="insight-row__top">
										<div class="insight-row__title">
											{{ item.item_name || item.item_code }}
										</div>
										<div class="insight-row__value">
											{{ formatMoney(Number(item.sales_amount || 0)) }}
										</div>
									</div>
									<div class="insight-row__meta">
										{{ item.item_code }} .
										{{ __("Qty") }}: {{ formatQuantity(Number(item.sold_qty || 0)) }} {{ item.stock_uom || "" }}
									</div>
									<div class="insight-row__meta">
										{{ __("Margin") }}: {{ formatMoney(Number(item.estimated_margin || 0)) }}
										({{ formatPercent(item.estimated_margin_pct, 1) }}) .
										{{ __("Discount") }}: {{ formatMoney(Number(item.discount_amount || 0)) }}
										({{ formatPercent(item.discount_frequency_pct, 1) }})
									</div>
									<v-progress-linear
										:model-value="trendProgress(Number(item.sales_amount || 0), itemSalesMaxSales)"
										color="primary"
										height="5"
										rounded
									/>
								</div>
							</div>
							<div v-else class="empty-state">{{ __("No item sales data found for this period.") }}</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'products'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Category / Brand / Variant Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ categoryVariantRangeLabel }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Top Category") }}: {{ topCategoryLabel }}
									</v-chip>
									<v-chip size="small" color="success" variant="tonal">
										{{ __("Top Brand") }}: {{ topBrandLabel }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Top Variant") }}: {{ topVariantLabel }}
									</v-chip>
								</div>
							</div>

							<div class="trend-grid">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Category-wise") }}</div>
									<div v-if="categorySalesPoints.length" class="list-stack trend-list">
										<div v-for="row in categorySalesPoints" :key="`cat-${row.category || row.label}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.label || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.sales_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Items") }}: {{ formatQuantity(Number(row.item_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.sales_amount || 0), categorySalesMax)"
												color="primary"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No category data found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Brand-wise") }}</div>
									<div v-if="brandSalesPoints.length" class="list-stack trend-list">
										<div v-for="row in brandSalesPoints" :key="`brand-${row.brand || row.label}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.label || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.sales_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Items") }}: {{ formatQuantity(Number(row.item_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.sales_amount || 0), brandSalesMax)"
												color="success"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No brand data found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Variant-wise") }}</div>
									<div v-if="variantSalesPoints.length" class="list-stack trend-list">
										<div v-for="row in variantSalesPoints" :key="`variant-${row.variant_of || row.label}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.label || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.sales_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Variants") }}: {{ formatQuantity(Number(row.variant_item_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.sales_amount || 0), variantSalesMax)"
												color="warning"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No variant data found.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Attributes (Size/Color)") }}</div>
									<div v-if="attributeSalesPoints.length" class="list-stack trend-list">
										<div
											v-for="row in attributeSalesPoints"
											:key="`attr-${row.attribute || ''}-${row.attribute_value || ''}`"
											class="insight-row"
										>
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.label || "-" }}</div>
												<div class="insight-row__value">{{ formatMoney(Number(row.sales_amount || 0)) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Items") }}: {{ formatQuantity(Number(row.item_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.sales_amount || 0), attributeSalesMax)"
												color="info"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No attribute data found.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'inventory'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Inventory Status Report") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ inventoryStatusRangeLabel }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Low Stock Threshold") }}: {{ inventoryStatusReport.threshold || lowStockThreshold }}
									</v-chip>
								</div>
							</div>

							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Total Items") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(inventoryStatusSummary.total_items || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Total Stock Qty") }}</div>
									<div class="summary-metric__value">{{ formatQuantity(Number(inventoryStatusSummary.total_stock_qty || 0)) }}</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Low Stock") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatQuantity(Number(inventoryStatusSummary.low_stock_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Out of Stock") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatQuantity(Number(inventoryStatusSummary.out_of_stock_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Negative Stock") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatQuantity(Number(inventoryStatusSummary.negative_stock_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Slow Moving") }}</div>
									<div class="summary-metric__value">
										{{ formatQuantity(Number(inventoryStatusSummary.slow_moving_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Dead Stock") }}</div>
									<div class="summary-metric__value">
										{{ formatQuantity(Number(inventoryStatusSummary.dead_stock_count || 0)) }}
									</div>
								</div>
							</div>

							<div class="trend-grid">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Low Stock Items") }}</div>
									<div v-if="inventoryStatusLowStockItems.length" class="list-stack trend-list">
										<div v-for="row in inventoryStatusLowStockItems" :key="`inv-low-${row.item_code}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.item_name || row.item_code }}</div>
												<div class="insight-row__value">{{ formatQuantity(Number(row.actual_qty || 0)) }}</div>
											</div>
											<div class="insight-row__meta">{{ row.item_code }}</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.actual_qty || 0), inventoryStatusLowMax)"
												color="warning"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No low stock items.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Out of Stock Items") }}</div>
									<div v-if="inventoryStatusOutOfStockItems.length" class="list-stack trend-list">
										<div v-for="row in inventoryStatusOutOfStockItems" :key="`inv-out-${row.item_code}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.item_name || row.item_code }}</div>
												<v-chip size="x-small" color="error" variant="flat">0</v-chip>
											</div>
											<div class="insight-row__meta">{{ row.item_code }}</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No out-of-stock items.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Negative Stock Items") }}</div>
									<div v-if="inventoryStatusNegativeItems.length" class="list-stack trend-list">
										<div v-for="row in inventoryStatusNegativeItems" :key="`inv-neg-${row.item_code}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.item_name || row.item_code }}</div>
												<div class="insight-row__value summary-metric__value--danger">
													{{ formatQuantity(Number(row.actual_qty || 0)) }}
												</div>
											</div>
											<div class="insight-row__meta">{{ row.item_code }}</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.actual_qty || 0), inventoryStatusNegativeMax)"
												color="error"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No negative stock items.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Slow Moving Items") }}</div>
									<div v-if="inventoryStatusSlowMovingItems.length" class="list-stack trend-list">
										<div v-for="row in inventoryStatusSlowMovingItems" :key="`inv-slow-${row.item_code}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.item_name || row.item_code }}</div>
												<div class="insight-row__value">{{ formatDays(row.stock_cover_days) }}</div>
											</div>
											<div class="insight-row__meta">
												{{ __("Stock") }}: {{ formatQuantity(Number(row.actual_qty || 0)) }} .
												{{ __("Sold") }}: {{ formatQuantity(Number(row.sold_qty || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.stock_cover_days || 0), inventoryStatusSlowMax)"
												color="info"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No slow moving items.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Dead Stock Items") }}</div>
									<div v-if="inventoryStatusDeadStockItems.length" class="list-stack trend-list">
										<div v-for="row in inventoryStatusDeadStockItems" :key="`inv-dead-${row.item_code}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.item_name || row.item_code }}</div>
												<div class="insight-row__value">{{ formatQuantity(Number(row.actual_qty || 0)) }}</div>
											</div>
											<div class="insight-row__meta">{{ row.item_code }}</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.actual_qty || 0), inventoryStatusDeadMax)"
												color="secondary"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No dead stock items.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'inventory'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Stock Movement Report") }}</h2>
								<v-chip size="small" color="info" variant="tonal">
									{{ stockMovementRangeLabel }}
								</v-chip>
							</div>

							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Movements") }}</div>
									<div class="summary-metric__value">
										{{ formatQuantity(Number(stockMovementSummary.movement_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Total Out") }}</div>
									<div class="summary-metric__value">
										{{ formatQuantity(Number(stockMovementOutgoingQty || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Total In") }}</div>
									<div class="summary-metric__value summary-metric__value--success">
										{{ formatQuantity(Number(stockMovementIncomingQty || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Net Qty") }}</div>
									<div class="summary-metric__value">
										{{ formatSignedQuantity(Number(stockMovementSummary.net_qty || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Net Value") }}</div>
									<div class="summary-metric__value">
										{{ formatMoney(Number(stockMovementSummary.net_value || 0)) }}
									</div>
								</div>
							</div>

							<div class="trend-grid trend-grid--two">
								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Day-wise Movement") }}</div>
									<div v-if="stockMovementDaySimple.length" class="list-stack trend-list">
										<div v-for="row in stockMovementDaySimple" :key="`move-day-${row.date}`" class="insight-row">
											<div class="insight-row__top">
												<div class="insight-row__title">{{ formatDate(row.date) }}</div>
												<div class="insight-row__value">
													{{ __("Net") }}: {{ formatSignedQuantity(Number(row.net || 0)) }}
												</div>
											</div>
											<div class="insight-row__meta">
												{{ __("In") }}: {{ formatQuantity(Number(row.incoming || 0)) }} .
												{{ __("Out") }}: {{ formatQuantity(Number(row.outgoing || 0)) }} .
												{{ __("Entries") }}: {{ formatQuantity(Number(row.movement_count || 0)) }}
											</div>
											<v-progress-linear
												:model-value="trendProgress(Number(row.incoming || 0) + Number(row.outgoing || 0), stockMovementDayMax)"
												color="primary"
												height="5"
												rounded
											/>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No stock movement for this period.") }}</div>
								</div>

								<div class="trend-panel">
									<div class="summary-metric__label">{{ __("Recent Movement Entries") }}</div>
									<div v-if="stockMovementRecent.length" class="list-stack trend-list">
										<div
											v-for="row in stockMovementRecent"
											:key="`move-row-${row.voucher_type}-${row.voucher_no}-${row.item_code}-${row.warehouse}`"
											class="insight-row"
										>
											<div class="insight-row__top">
												<div class="insight-row__title">{{ row.item_name || row.item_code || "-" }}</div>
												<div class="insight-row__value">
													{{ formatSignedQuantity(Number(row.qty || 0)) }}
												</div>
											</div>
											<div class="insight-row__meta">
												{{ formatDate(row.posting_date) }} . {{ formatMovementCategory(row.category) }} .
												{{ row.direction || "-" }}
											</div>
											<div class="insight-row__meta">
												{{ row.warehouse || "-" }} . {{ row.voucher_type || "-" }} {{ row.voucher_no || "-" }}
											</div>
										</div>
									</div>
									<div v-else class="empty-state">{{ __("No recent stock entries found.") }}</div>
								</div>
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'inventory'" class="dashboard-grid">
					<v-col cols="12" lg="6">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Fast Moving Items") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ __("Age Bracket") }}: {{ fastMovingRangeLabel }}
									</v-chip>
									<v-chip size="small" color="success" variant="tonal">
										{{ __("Total") }}: {{ fastMovingTotalCount }}
									</v-chip>
								</div>
							</div>
							<div class="card-filters">
								<v-text-field
									v-model="fastMovingSearchInput"
									:label="__('Search item')"
									density="compact"
									variant="outlined"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									class="card-filter-input"
								/>
								<v-select
									v-model="fastMovingPageSize"
									:items="fastMovingPageSizeItems"
									item-title="label"
									item-value="value"
									:label="__('Per Page')"
									density="compact"
									variant="outlined"
									hide-details
									class="card-filter-select"
								/>
							</div>

							<div v-if="loading" class="py-2">
								<v-skeleton-loader type="list-item-three-line" class="mb-2" />
								<v-skeleton-loader type="list-item-three-line" class="mb-2" />
								<v-skeleton-loader type="list-item-three-line" />
							</div>

							<div v-else-if="fastMovingItems.length" class="list-stack">
								<div v-for="item in fastMovingItems" :key="item.item_code" class="insight-row">
									<div class="insight-row__top">
										<div class="insight-row__title">
											{{ item.item_name || item.item_code }}
										</div>
										<div class="insight-row__value">
											{{ formatQuantity(item.sold_qty) }} {{ item.stock_uom || "" }}
										</div>
									</div>
									<div class="insight-row__meta">{{ item.item_code }}</div>
									<v-progress-linear
										:model-value="progressFromQuantity(item.sold_qty)"
										color="success"
										height="6"
										rounded
									/>
								</div>
							</div>
							<div v-if="!loading && fastMovingItems.length && fastMovingTotalPages > 1" class="pagination-row">
								<v-pagination
									v-model="fastMovingPage"
									:length="fastMovingTotalPages"
									:total-visible="5"
									density="comfortable"
								/>
							</div>

							<div v-if="!loading && !fastMovingItems.length" class="empty-state">
								{{ __("No sales activity found for this period.") }}
							</div>
						</v-card>
					</v-col>

					<v-col cols="12" lg="6">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Low Stock Alerts") }}</h2>
								<v-chip size="small" color="warning" variant="tonal">
									{{ __("Threshold") }}: {{ lowStockThreshold }}
								</v-chip>
							</div>
							<div class="card-filters">
								<v-text-field
									v-model="lowStockSearch"
									:label="__('Search item / code')"
									density="compact"
									variant="outlined"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									class="card-filter-input"
								/>
								<v-select
									v-model="lowStockWarehouseFilter"
									:items="lowStockWarehouseItems"
									item-title="label"
									item-value="value"
									:label="__('Warehouse')"
									density="compact"
									variant="outlined"
									hide-details
									class="card-filter-select"
								/>
							</div>

							<div v-if="loading" class="py-2">
								<v-skeleton-loader type="list-item-two-line" class="mb-2" />
								<v-skeleton-loader type="list-item-two-line" class="mb-2" />
								<v-skeleton-loader type="list-item-two-line" />
							</div>

							<div v-else-if="filteredLowStockItems.length" class="list-stack">
								<div v-for="item in filteredLowStockItems" :key="`${item.item_code}-${item.warehouse}`" class="insight-row">
									<div class="insight-row__top">
										<div class="insight-row__title">
											{{ item.item_name || item.item_code }}
										</div>
										<v-chip size="x-small" :color="stockChipColor(item.actual_qty)" variant="flat">
											{{ formatQuantity(item.actual_qty) }} {{ item.stock_uom || "" }}
										</v-chip>
									</div>
									<div class="insight-row__meta">
										{{ item.item_code }} . {{ item.warehouse }}
									</div>
								</div>
							</div>

							<div v-else class="empty-state">
								{{ __("No low stock alerts right now.") }}
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'procurement'" class="dashboard-grid mb-2">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Reorder / Purchase Suggestions") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ reorderRangeLabel }}
									</v-chip>
									<v-chip size="small" color="error" variant="tonal">
										{{ __("Critical") }}: {{ formatQuantity(Number(reorderSummary.critical_count || 0)) }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("High") }}: {{ formatQuantity(Number(reorderSummary.high_count || 0)) }}
									</v-chip>
									<v-chip size="small" color="success" variant="tonal">
										{{ __("Suggested Qty") }}: {{ formatQuantity(Number(reorderSummary.total_suggested_qty || 0)) }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Est. Purchase") }}: {{ formatMoney(Number(reorderSummary.estimated_purchase_value || 0)) }}
									</v-chip>
								</div>
							</div>

							<div v-if="reorderSuggestions.length" class="list-stack">
								<div v-for="row in reorderSuggestions" :key="`reorder-${row.item_code}`" class="insight-row">
									<div class="insight-row__top">
										<div class="insight-row__title">{{ row.item_name || row.item_code }}</div>
										<v-chip size="x-small" :color="urgencyColor(row.urgency)" variant="flat">
											{{ urgencyLabel(row.urgency) }}
										</v-chip>
									</div>
									<div class="insight-row__meta">
										{{ row.item_code }} .
										{{ __("Current") }}: {{ formatQuantity(Number(row.current_qty || 0)) }} .
										{{ __("Suggested") }}: {{ formatQuantity(Number(row.suggested_qty || 0)) }}
									</div>
									<div class="insight-row__meta">
										{{ __("Daily Sales") }}: {{ formatQuantity(Number(row.avg_daily_sales || 0)) }} .
										{{ __("Lead Time") }}: {{ formatDays(row.lead_time_days) }} .
										{{ __("Cover") }}: {{ formatDays(row.stock_cover_days) }}
									</div>
									<div class="insight-row__meta">
										{{ __("Supplier") }}: {{ row.supplier || __("Not Set") }} .
										{{ __("Est. Value") }}: {{ formatMoney(Number(row.estimated_purchase_value || 0)) }}
									</div>
								</div>
							</div>
							<div v-else class="empty-state">
								{{ __("No reorder suggestions right now.") }}
							</div>
						</v-card>
					</v-col>
				</v-row>

				<v-row v-show="activeDashboardTab === 'procurement'" class="dashboard-grid mt-1">
					<v-col cols="12">
						<v-card class="dashboard-card" elevation="2">
							<div class="dashboard-card__header">
								<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ __("Supplier Purchase Summary") }}</h2>
								<div class="dashboard-chip-row">
									<v-chip size="small" color="info" variant="tonal">
										{{ monthRangeLabel }}
									</v-chip>
									<v-chip size="small" color="primary" variant="tonal">
										{{ __("Top Supplier") }}: {{ topSupplierLabel }}
									</v-chip>
									<v-chip size="small" color="warning" variant="tonal">
										{{ __("Top Pending") }}: {{ topPendingSupplierLabel }}
									</v-chip>
								</div>
							</div>
							<div class="card-filters">
								<v-text-field
									v-model="supplierSearch"
									:label="__('Search supplier')"
									density="compact"
									variant="outlined"
									hide-details
									clearable
									prepend-inner-icon="mdi-magnify"
									class="card-filter-input"
								/>
							</div>
							<div class="summary-grid">
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Suppliers") }}</div>
									<div class="summary-metric__value">
										{{ formatQuantity(Number(supplierOverviewSummary.supplier_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Purchase Invoices") }}</div>
									<div class="summary-metric__value">
										{{ formatQuantity(Number(supplierOverviewSummary.purchase_count || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Purchase Amount") }}</div>
									<div class="summary-metric__value">
										{{ formatMoney(Number(supplierOverviewSummary.purchase_amount || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Paid Amount") }}</div>
									<div class="summary-metric__value summary-metric__value--success">
										{{ formatMoney(Number(supplierOverviewSummary.paid_amount || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Pending Amount") }}</div>
									<div class="summary-metric__value summary-metric__value--danger">
										{{ formatMoney(Number(supplierOverviewSummary.pending_amount || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Avg Invoice Value") }}</div>
									<div class="summary-metric__value">
										{{ formatMoney(Number(supplierOverviewSummary.avg_invoice_value || 0)) }}
									</div>
								</div>
								<div class="summary-metric">
									<div class="summary-metric__label">{{ __("Pending Ratio") }}</div>
									<div class="summary-metric__value">
										{{ formatPercent(Number(supplierOverviewSummary.pending_ratio_pct || 0), 1) }}
									</div>
								</div>
							</div>

							<div v-if="loading" class="py-2">
								<v-skeleton-loader type="list-item-two-line" class="mb-2" />
								<v-skeleton-loader type="list-item-two-line" class="mb-2" />
								<v-skeleton-loader type="list-item-two-line" />
							</div>

							<div v-else-if="filteredSupplierSummary.length" class="list-stack">
								<div class="trend-grid">
									<div class="trend-panel">
										<div class="summary-metric__label">{{ __("Top Suppliers by Spend") }}</div>
										<div v-if="filteredSupplierSummary.length" class="list-stack trend-list">
											<div
												v-for="supplier in filteredSupplierSummary"
												:key="`supplier-top-${supplier.supplier}`"
												class="insight-row"
											>
												<div class="insight-row__top">
													<div class="insight-row__title">
														{{ supplier.supplier_name || supplier.supplier }}
													</div>
													<div class="insight-row__value">
														{{ formatMoney(Number(supplier.purchase_amount || 0)) }}
													</div>
												</div>
												<div class="insight-row__meta">
													{{ __("Invoices") }}: {{ formatQuantity(Number(supplier.purchase_count || 0)) }} .
													{{ __("Share") }}: {{ formatPercent(supplier.share_pct, 1) }}
												</div>
												<v-progress-linear
													:model-value="trendProgress(Number(supplier.purchase_amount || 0), supplierPurchaseMax)"
													color="primary"
													height="5"
													rounded
												/>
											</div>
										</div>
										<div v-else class="empty-state">{{ __("No suppliers found for this period.") }}</div>
									</div>

									<div class="trend-panel">
										<div class="summary-metric__label">{{ __("Pending Exposure") }}</div>
										<div v-if="filteredSupplierRiskRows.length" class="list-stack trend-list">
											<div
												v-for="supplier in filteredSupplierRiskRows"
												:key="`supplier-risk-${supplier.supplier}`"
												class="insight-row"
											>
												<div class="insight-row__top">
													<div class="insight-row__title">
														{{ supplier.supplier_name || supplier.supplier }}
													</div>
													<div class="insight-row__value">
														{{ formatMoney(Number(supplier.pending_amount || 0)) }}
													</div>
												</div>
												<div class="insight-row__meta">
													{{ __("Pending Ratio") }}: {{ formatPercent(supplier.pending_ratio_pct, 1) }} .
													{{ __("Total Purchase") }}: {{ formatMoney(Number(supplier.purchase_amount || 0)) }}
												</div>
												<v-progress-linear
													:model-value="trendProgress(Number(supplier.pending_amount || 0), supplierPendingMax)"
													color="error"
													height="5"
													rounded
												/>
											</div>
										</div>
										<div v-else class="empty-state">{{ __("No pending balances in this period.") }}</div>
									</div>

									<div class="trend-panel">
										<div class="summary-metric__label">{{ __("Last 14 Days Purchases") }}</div>
										<div v-if="supplierDayRows.length" class="list-stack trend-list">
											<div v-for="day in supplierDayRows" :key="`supplier-day-${day.date}`" class="insight-row">
												<div class="insight-row__top">
													<div class="insight-row__title">{{ formatDate(day.date) }}</div>
													<div class="insight-row__value">
														{{ formatMoney(Number(day.purchase_amount || 0)) }}
													</div>
												</div>
												<div class="insight-row__meta">
													{{ __("Invoices") }}: {{ formatQuantity(Number(day.purchase_count || 0)) }} .
													{{ __("Pending") }}: {{ formatMoney(Number(day.pending_amount || 0)) }}
												</div>
												<v-progress-linear
													:model-value="trendProgress(Number(day.purchase_amount || 0), supplierDayMax)"
													color="success"
													height="5"
													rounded
												/>
											</div>
										</div>
										<div v-else class="empty-state">{{ __("No day-wise purchase data found.") }}</div>
									</div>
								</div>

								<div class="summary-metric__label mt-2">{{ __("Detailed Supplier Breakdown") }}</div>
								<div v-for="supplier in filteredSupplierSummary" :key="supplier.supplier" class="supplier-row">
									<div class="supplier-row__headline">
										<div class="supplier-row__name">
											{{ supplier.supplier_name || supplier.supplier }}
										</div>
										<div class="supplier-row__amount">
											{{ formatMoney(Number(supplier.purchase_amount || 0)) }}
										</div>
									</div>
									<div class="supplier-row__meta">
										{{ __("Invoices") }}: {{ formatQuantity(Number(supplier.purchase_count || 0)) }} .
										{{ __("Avg Invoice") }}: {{ formatMoney(Number(supplier.avg_invoice_value || 0)) }} .
										{{ __("Last") }}: {{ formatDate(supplier.last_purchase_date) }}
									</div>
									<div class="supplier-row__meta">
										{{ __("Paid") }}: {{ formatMoney(Number(supplier.paid_amount || 0)) }} .
										{{ __("Pending") }}: {{ formatMoney(Number(supplier.pending_amount || 0)) }} .
										{{ __("Pending Ratio") }}: {{ formatPercent(supplier.pending_ratio_pct, 1) }}
									</div>
								</div>
							</div>

							<div v-else class="empty-state">
								{{ __("No supplier purchases found in this month.") }}
							</div>
						</v-card>
					</v-col>
				</v-row>
			</template>
		</v-container>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useUIStore } from "@/posapp/stores/uiStore";
import {
	type BranchLocationRow,
	type BranchTopItemsByLocationRow,
	fetchDashboardData,
	type CategoryBrandVariantRow,
	type CustomerReportRow,
	type DiscountVoidReturnCashierRow,
	type DiscountVoidReturnDayRow,
	type DiscountVoidReturnItemRow,
	type DashboardResponse,
	type SalesSummaryPayload,
	type FastMovingItem,
	type InventoryStatusRow,
	type ItemSalesRow,
	type PaymentDaySummaryRow,
	type PaymentMethodSummaryRow,
	type ReorderSuggestionRow,
	type ProfitabilityCategoryRow,
	type ProfitabilityDayRow,
	type ProfitabilityItemRow,
	type StaffPerformanceRow,
	type StockMovementDayRow,
	type StockMovementRecentRow,
	type TaxChargeHeadRow,
	type TaxChargesDayRow,
	type LowStockItem,
	type SupplierDayRow,
	type SupplierOverviewSummary,
	type SupplierSummaryRow,
} from "@/posapp/services/dashboardService";

defineOptions({
	name: "Reports",
});

const uiStore = useUIStore();

const loading = ref(false);
const errorMessage = ref("");
const isDashboardEnabledOnServer = ref(true);
const lastUpdatedAt = ref<Date | null>(null);
const allowAllProfiles = ref(false);
type DashboardTab =
	| "sales"
	| "staff"
	| "customers"
	| "finance"
	| "branches"
	| "products"
	| "inventory"
	| "procurement";
const activeDashboardTab = ref<DashboardTab>("sales");
const dashboardScope = ref<"all" | "current" | "specific">("all");
const selectedProfileFilter = ref("");
const initialNow = new Date();
const currentMonthToken = `${initialNow.getFullYear()}-${String(initialNow.getMonth() + 1).padStart(2, "0")}`;
const selectedReportMonth = ref(currentMonthToken);
const scopeInitialized = ref(false);
const fastMovingPage = ref(1);
const fastMovingPageSize = ref(10);
const fastMovingSearch = ref("");
const fastMovingSearchInput = ref("");
const lowStockSearch = ref("");
const lowStockWarehouseFilter = ref("");
const supplierSearch = ref("");
const itemSalesLimit = ref(20);
const categoryReportLimit = ref(12);
const inventoryStatusLimit = ref(20);
const stockMovementLimit = ref(20);
const reorderSuggestionLimit = ref(25);
const paymentReportLimit = ref(20);
const discountReportLimit = ref(20);
const customerReportLimit = ref(20);
const staffReportLimit = ref(20);
const profitabilityReportLimit = ref(20);
const branchReportLimit = ref(20);
const taxReportLimit = ref(20);
let fastMovingSearchDebounce: ReturnType<typeof setTimeout> | null = null;

const createEmptyDashboard = (): DashboardResponse => ({
	enabled: true,
	sales_overview: {
		today_sales: 0,
		today_profit: 0,
		monthly_sales: 0,
		monthly_profit: 0,
	},
	daily_sales_summary: {
		period: {},
		invoice_count: 0,
		returns_count: 0,
		gross_sales: 0,
		net_sales: 0,
		returns_amount: 0,
		discount_amount: 0,
		tax_amount: 0,
		opening_amount: 0,
		opening_cash: 0,
		closing_amount: 0,
		closing_cash: 0,
		cash_collections: 0,
		card_online_collections: 0,
		other_collections: 0,
		change_given: 0,
		collections_total: 0,
		expected_cash: 0,
		actual_cash: 0,
		cash_variance: 0,
		average_invoice_value: 0,
		has_closing_snapshot: false,
		payment_methods: [],
	},
	monthly_sales_summary: {
		period: {},
		invoice_count: 0,
		returns_count: 0,
		gross_sales: 0,
		net_sales: 0,
		returns_amount: 0,
		discount_amount: 0,
		tax_amount: 0,
		opening_amount: 0,
		opening_cash: 0,
		closing_amount: 0,
		closing_cash: 0,
		cash_collections: 0,
		card_online_collections: 0,
		other_collections: 0,
		change_given: 0,
		collections_total: 0,
		expected_cash: 0,
		actual_cash: 0,
		cash_variance: 0,
		average_invoice_value: 0,
		has_closing_snapshot: false,
		payment_methods: [],
	},
	payment_method_report: {
		period: {},
		totals: {
			invoice_count: 0,
			split_invoice_count: 0,
			pending_invoice_count: 0,
			partial_invoice_count: 0,
			unpaid_invoice_count: 0,
			pending_amount: 0,
			paid_amount: 0,
			collected_amount: 0,
			cash_amount: 0,
			card_online_amount: 0,
			other_amount: 0,
		},
		method_wise: [],
		category_wise: [],
		day_wise: [],
	},
	discount_void_return_report: {
		period: {},
		totals: {
			discount_amount: 0,
			discounted_invoice_count: 0,
			return_count: 0,
			return_amount: 0,
			void_count: 0,
			void_amount: 0,
		},
		cashier_wise: [],
		top_return_items: [],
		day_wise: [],
	},
	customer_report: {
		period: {},
		summary: {
			customer_count: 0,
			repeat_customer_count: 0,
			repeat_customer_rate_pct: 0,
			invoice_count: 0,
			sales_amount: 0,
			average_basket_size: 0,
			average_purchase_frequency_days: null,
		},
		top_customers: [],
		repeat_customers: [],
		recent_customers: [],
	},
	staff_performance_report: {
		period: {},
		summary: {
			cashier_count: 0,
			invoice_count: 0,
			sales_amount: 0,
			items_sold: 0,
			average_bill: 0,
			average_items_per_invoice: 0,
			return_count: 0,
			return_amount: 0,
			discount_amount: 0,
			void_count: 0,
			void_amount: 0,
		},
		cashier_wise: [],
		top_by_invoices: [],
		risk_activity: [],
	},
	profitability_report: {
		period: {},
		summary: {
			invoice_count: 0,
			return_invoice_count: 0,
			item_line_count: 0,
			revenue: 0,
			cogs: 0,
			gross_profit: 0,
			gross_margin_pct: null,
			average_invoice_profit: 0,
		},
		item_wise: [],
		category_wise: [],
		day_wise: [],
		highlights: {
			top_profit_item: null,
			lowest_margin_item: null,
		},
	},
	branch_location_report: {
		period: {},
		summary: {
			location_count: 0,
			total_invoices: 0,
			total_sales: 0,
			total_profit: 0,
			total_stock_qty: 0,
			low_stock_total: 0,
			cashier_count: 0,
		},
		location_wise: [],
		top_items_by_location: [],
	},
	tax_charges_report: {
		period: {},
		totals: {
			invoice_count: 0,
			return_invoice_count: 0,
			taxable_amount: 0,
			invoice_total: 0,
			tax_amount: 0,
			service_charge_amount: 0,
			fee_amount: 0,
			other_charge_amount: 0,
			round_off_amount: 0,
			invoice_adjustment_amount: 0,
			total_charge_amount: 0,
		},
		tax_heads: [],
		charge_heads: [],
		day_wise: [],
		highlights: {
			top_tax_head: null,
			top_charge_head: null,
		},
	},
	sales_trend: {
		period: {},
		day_wise: [],
		week_wise: [],
		month_wise: [],
		hourly: [],
		highlights: {
			best_day: null,
			best_hour: null,
			day_growth_pct: null,
			week_growth_pct: null,
			month_growth_pct: null,
		},
	},
	item_sales_report: {
		period: {},
		items: [],
		highlights: {
			best_seller: null,
			top_margin_item: null,
			top_discount_item: null,
		},
	},
	category_brand_variant_report: {
		period: {},
		category_wise: [],
		brand_wise: [],
		variant_wise: [],
		attribute_wise: [],
		highlights: {
			top_category: null,
			top_brand: null,
			top_variant: null,
		},
	},
	inventory_status_report: {
		period: {},
		threshold: 10,
		summary: {
			total_items: 0,
			total_stock_qty: 0,
			low_stock_count: 0,
			out_of_stock_count: 0,
			negative_stock_count: 0,
			slow_moving_count: 0,
			dead_stock_count: 0,
		},
		low_stock_items: [],
		out_of_stock_items: [],
		negative_stock_items: [],
		slow_moving_items: [],
		dead_stock_items: [],
	},
	stock_movement_report: {
		period: {},
		summary: {
			movement_count: 0,
			sale_out_qty: 0,
			return_in_qty: 0,
			adjustment_in_qty: 0,
			adjustment_out_qty: 0,
			transfer_in_qty: 0,
			transfer_out_qty: 0,
			other_in_qty: 0,
			other_out_qty: 0,
			net_qty: 0,
			net_value: 0,
		},
		day_wise: [],
		recent_movements: [],
	},
	reorder_purchase_suggestions: {
		period: {},
		summary: {
			candidate_items: 0,
			suggestion_count: 0,
			critical_count: 0,
			high_count: 0,
			medium_count: 0,
			low_count: 0,
			total_suggested_qty: 0,
			estimated_purchase_value: 0,
		},
		suggestions: [],
	},
	inventory_insights: {
		fast_moving_items: [],
		fast_moving_period: {
			from: "",
			to: "",
			days: 0,
		},
		fast_moving_pagination: {
			page: 1,
			page_size: 10,
			total_count: 0,
			total_pages: 0,
			search: "",
		},
		low_stock_items: [],
		low_stock_threshold: 10,
	},
	supplier_overview: {
		summary: {
			supplier_count: 0,
			purchase_count: 0,
			purchase_amount: 0,
			paid_amount: 0,
			pending_amount: 0,
			avg_invoice_value: 0,
			pending_ratio_pct: 0,
		},
		purchase_summary: [],
		risk_suppliers: [],
		day_wise: [],
		highlights: {
			top_supplier: null,
			top_pending_supplier: null,
		},
		period: {},
	},
});

const dashboardData = ref<DashboardResponse>(createEmptyDashboard());

const __ = (value: string) => (window.__ ? window.__(value) : value);
const DASHBOARD_LOG_PREFIX = "[AwesomeDashboard]";
const dashboardTabItems = computed<Array<{ value: DashboardTab; label: string; icon: string }>>(
	() => [
		{ value: "sales", label: __("Sales"), icon: "mdi-point-of-sale" },
		{ value: "staff", label: __("Staff"), icon: "mdi-account-group-outline" },
		{ value: "customers", label: __("Customers"), icon: "mdi-account-heart-outline" },
		{ value: "finance", label: __("Finance"), icon: "mdi-finance" },
		{ value: "branches", label: __("Branches"), icon: "mdi-storefront-outline" },
		{ value: "products", label: __("Products"), icon: "mdi-package-variant-closed" },
		{ value: "inventory", label: __("Inventory"), icon: "mdi-warehouse" },
		{ value: "procurement", label: __("Procurement"), icon: "mdi-truck-delivery-outline" },
	],
);

const posProfile = computed(() => uiStore.posProfile || {});
const profileName = computed(() => String((posProfile.value as any)?.name || "").trim());
const currency = computed(() => dashboardData.value.currency || (posProfile.value as any)?.currency || "");

const configuredLowStockThreshold = computed(() => {
	const rawValue = Number((posProfile.value as any)?.posa_low_stock_alert_threshold);
	return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : undefined;
});

const availableProfiles = computed(() => dashboardData.value.available_profiles || []);
const enabledProfiles = computed(() =>
	availableProfiles.value.filter((profile) => profile.dashboard_enabled !== false),
);

const dashboardScopeItems = computed(() => {
	const items = [
		{ label: __("All Profiles"), value: "all" as const },
		{ label: __("Current Profile"), value: "current" as const },
		{ label: __("Specific Profile"), value: "specific" as const },
	];
	return allowAllProfiles.value
		? items
		: items.filter((item) => item.value === "current");
});

const profileFilterItems = computed(() =>
	enabledProfiles.value.map((profile) => ({
		label: profile.name,
		value: profile.name,
	})),
);

const canRenderDashboard = computed(() => isDashboardEnabledOnServer.value);
const disabledReasonText = computed(() => {
	const reason = dashboardData.value.disabled_reason;
	if (reason === "profile_disabled") {
		return __("Awesome Dashboard is disabled for the selected POS Profile.");
	}
	if (reason === "no_profiles_in_scope") {
		return __("No profiles found for selected scope. Falling back to current profile failed.");
	}
	return __("Awesome Dashboard is unavailable for the selected scope.");
});
const selectedProfilesCount = computed(
	() => Number(dashboardData.value.selected_profiles?.length || 0),
);
const scopeDisplayLabel = computed(() => {
	const current = dashboardData.value.scope || dashboardScope.value;
	if (current === "specific") {
		return __("Scope: Specific Profile");
	}
	if (current === "current") {
		return __("Scope: Current Profile");
	}
	return __("Scope: All Profiles");
});
const profitMethodLabel = computed(() =>
	dashboardData.value.sales_overview.profit_method === "stock_ledger"
		? __("Profit: Stock Ledger (COGS)")
		: __("Profit: Invoice Item Estimate"),
);
const profitMethodColor = computed(() =>
	dashboardData.value.sales_overview.profit_method === "stock_ledger" ? "success" : "warning",
);

const salesMetrics = computed(() => [
	{
		key: "today_sales",
		label: __("Today Sales"),
		icon: "mdi-cart-outline",
		value: Number(dashboardData.value.sales_overview.today_sales || 0),
		styleClass: "metric-card--sales",
	},
	{
		key: "today_profit",
		label: __("Today Profit"),
		icon: "mdi-cash-plus",
		value: Number(dashboardData.value.sales_overview.today_profit || 0),
		styleClass: "metric-card--profit",
	},
	{
		key: "monthly_sales",
		label: __("Monthly Sales"),
		icon: "mdi-calendar-month-outline",
		value: Number(dashboardData.value.sales_overview.monthly_sales || 0),
		styleClass: "metric-card--sales",
	},
	{
		key: "monthly_profit",
		label: __("Monthly Profit"),
		icon: "mdi-finance",
		value: Number(dashboardData.value.sales_overview.monthly_profit || 0),
		styleClass: "metric-card--profit",
	},
]);

const dailySummary = computed<SalesSummaryPayload>(() => dashboardData.value.daily_sales_summary || {});
const monthlySummary = computed<SalesSummaryPayload>(() => dashboardData.value.monthly_sales_summary || {});

function summaryRangeLabel(summary: SalesSummaryPayload, fallbackLabel: string) {
	const from = summary.period?.from;
	const to = summary.period?.to;
	if (!from || !to) {
		return fallbackLabel;
	}
	if (from === to) {
		return formatDate(from);
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
}

function summaryPaymentMethods(summary: SalesSummaryPayload) {
	return (summary.payment_methods || [])
		.filter((row) => Math.abs(Number(row.amount || 0)) > 0.00001)
		.sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)));
}

function summaryMetrics(summary: SalesSummaryPayload) {
	const variance = Number(summary.cash_variance || 0);
	return [
		{
			key: "invoice_count",
			label: __("Invoices"),
			value: formatQuantity(Number(summary.invoice_count || 0)),
			valueClass: "",
		},
		{
			key: "avg_invoice",
			label: __("Average Bill"),
			value: formatMoney(Number(summary.average_invoice_value || 0)),
			valueClass: "",
		},
		{
			key: "opening_cash",
			label: __("Opening Cash"),
			value: formatMoney(Number(summary.opening_cash || 0)),
			valueClass: "",
		},
		{
			key: "gross_sales",
			label: __("Gross Sales"),
			value: formatMoney(Number(summary.gross_sales || 0)),
			valueClass: "",
		},
		{
			key: "returns_amount",
			label: __("Returns"),
			value: formatMoney(Number(summary.returns_amount || 0)),
			valueClass: "",
		},
		{
			key: "discount_amount",
			label: __("Discounts"),
			value: formatMoney(Number(summary.discount_amount || 0)),
			valueClass: "",
		},
		{
			key: "tax_amount",
			label: __("Tax"),
			value: formatMoney(Number(summary.tax_amount || 0)),
			valueClass: "",
		},
		{
			key: "net_sales",
			label: __("Net Sales"),
			value: formatMoney(Number(summary.net_sales || 0)),
			valueClass: "",
		},
		{
			key: "cash_collections",
			label: __("Cash Collections"),
			value: formatMoney(Number(summary.cash_collections || 0)),
			valueClass: "",
		},
		{
			key: "card_online_collections",
			label: __("Card / Online"),
			value: formatMoney(Number(summary.card_online_collections || 0)),
			valueClass: "",
		},
		{
			key: "expected_cash",
			label: __("Expected Cash"),
			value: formatMoney(Number(summary.expected_cash || 0)),
			valueClass: "",
		},
		{
			key: "actual_cash",
			label: __("Cash In Hand"),
			value: formatMoney(Number(summary.actual_cash || 0)),
			valueClass: "",
		},
		{
			key: "cash_variance",
			label: __("Expected vs Actual"),
			value: formatMoney(variance),
			valueClass: variance > 0 ? "summary-metric__value--success" : variance < 0 ? "summary-metric__value--danger" : "",
		},
	];
}

const dailySummaryRangeLabel = computed(() =>
	summaryRangeLabel(dailySummary.value, dashboardData.value.date_context?.today ? formatDate(dashboardData.value.date_context.today) : __("Today")),
);
const monthlySummaryRangeLabel = computed(() =>
	summaryRangeLabel(monthlySummary.value, __("Current Month")),
);
const dailyPaymentMethods = computed(() => summaryPaymentMethods(dailySummary.value));
const monthlyPaymentMethods = computed(() => summaryPaymentMethods(monthlySummary.value));
const dailySummaryMetrics = computed(() => summaryMetrics(dailySummary.value));
const monthlySummaryMetrics = computed(() => summaryMetrics(monthlySummary.value));

const paymentReport = computed(() => dashboardData.value.payment_method_report || {});
const paymentReportTotals = computed(() => paymentReport.value.totals || {});
const paymentReportRangeLabel = computed(() => {
	const from = paymentReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = paymentReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const paymentMethodRows = computed<PaymentMethodSummaryRow[]>(() =>
	[...(paymentReport.value.method_wise || [])]
		.sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)))
		.slice(0, Number(paymentReportLimit.value || 20)),
);
const paymentDayRows = computed<PaymentDaySummaryRow[]>(() =>
	[...(paymentReport.value.day_wise || [])]
		.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
		.slice(-14),
);
const paymentDayMax = computed(() => {
	const maxValue = paymentDayRows.value.reduce((max, row) => {
		const value = Math.abs(Number(row.paid_amount || 0)) + Math.abs(Number(row.pending_amount || 0));
		return Math.max(max, value);
	}, 0);
	return maxValue > 0 ? maxValue : 1;
});

const discountVoidReturnReport = computed(() => dashboardData.value.discount_void_return_report || {});
const discountVoidReturnTotals = computed(() => discountVoidReturnReport.value.totals || {});
const discountVoidReturnRangeLabel = computed(() => {
	const from = discountVoidReturnReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = discountVoidReturnReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const discountCashierRows = computed<DiscountVoidReturnCashierRow[]>(() =>
	[...(discountVoidReturnReport.value.cashier_wise || [])]
		.sort((a, b) => {
			const left =
				Math.abs(Number(a.void_amount || 0)) +
				Math.abs(Number(a.return_amount || 0)) +
				Math.abs(Number(a.discount_amount || 0));
			const right =
				Math.abs(Number(b.void_amount || 0)) +
				Math.abs(Number(b.return_amount || 0)) +
				Math.abs(Number(b.discount_amount || 0));
			return right - left;
		})
		.slice(0, Number(discountReportLimit.value || 20)),
);
const discountTopReturnItems = computed<DiscountVoidReturnItemRow[]>(() =>
	[...(discountVoidReturnReport.value.top_return_items || [])]
		.sort((a, b) => Math.abs(Number(b.return_amount || 0)) - Math.abs(Number(a.return_amount || 0)))
		.slice(0, Number(discountReportLimit.value || 20)),
);
const discountDayRows = computed<DiscountVoidReturnDayRow[]>(() =>
	[...(discountVoidReturnReport.value.day_wise || [])]
		.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
		.slice(-14),
);
const discountDayMax = computed(() => {
	const maxValue = discountDayRows.value.reduce((max, row) => {
		const value =
			Math.abs(Number(row.discount_amount || 0)) +
			Math.abs(Number(row.return_amount || 0)) +
			Math.abs(Number(row.void_amount || 0));
		return Math.max(max, value);
	}, 0);
	return maxValue > 0 ? maxValue : 1;
});
const discountCashierMax = computed(() => {
	const maxValue = discountCashierRows.value.reduce((max, row) => {
		const value =
			Math.abs(Number(row.discount_amount || 0)) +
			Math.abs(Number(row.return_amount || 0)) +
			Math.abs(Number(row.void_amount || 0));
		return Math.max(max, value);
	}, 0);
	return maxValue > 0 ? maxValue : 1;
});
const discountReturnItemMax = computed(() => {
	const maxValue = discountTopReturnItems.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.return_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});

const staffReport = computed(() => dashboardData.value.staff_performance_report || {});
const staffSummary = computed(() => staffReport.value.summary || {});
const staffReportRangeLabel = computed(() => {
	const from = staffReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = staffReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const staffCashierRows = computed<StaffPerformanceRow[]>(() =>
	[...(staffReport.value.cashier_wise || [])]
		.sort((a, b) => Math.abs(Number(b.sales_amount || 0)) - Math.abs(Number(a.sales_amount || 0)))
		.slice(0, Number(staffReportLimit.value || 20)),
);
const staffInvoiceRows = computed<StaffPerformanceRow[]>(() =>
	[...(staffReport.value.top_by_invoices || [])]
		.sort((a, b) => Number(b.invoice_count || 0) - Number(a.invoice_count || 0))
		.slice(0, Number(staffReportLimit.value || 20)),
);
const staffRiskRows = computed<StaffPerformanceRow[]>(() =>
	[...(staffReport.value.risk_activity || [])]
		.sort(
			(a, b) =>
				Math.abs(Number(b.void_amount || 0)) +
				Math.abs(Number(b.return_amount || 0)) -
				(Math.abs(Number(a.void_amount || 0)) + Math.abs(Number(a.return_amount || 0))),
		)
		.slice(0, Number(staffReportLimit.value || 20)),
);
const staffSalesMax = computed(() => {
	const maxValue = staffCashierRows.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});

const profitabilityReport = computed(() => dashboardData.value.profitability_report || {});
const profitabilitySummary = computed(() => profitabilityReport.value.summary || {});
const profitabilityHighlights = computed(() => profitabilityReport.value.highlights || {});
const profitabilityRangeLabel = computed(() => {
	const from = profitabilityReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = profitabilityReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const profitabilityItemRows = computed<ProfitabilityItemRow[]>(() =>
	[...(profitabilityReport.value.item_wise || [])]
		.sort((a, b) => Number(b.gross_profit || 0) - Number(a.gross_profit || 0))
		.slice(0, Number(profitabilityReportLimit.value || 20)),
);
const profitabilityCategoryRows = computed<ProfitabilityCategoryRow[]>(() =>
	[...(profitabilityReport.value.category_wise || [])]
		.sort((a, b) => Number(b.gross_profit || 0) - Number(a.gross_profit || 0))
		.slice(0, Number(profitabilityReportLimit.value || 20)),
);
const profitabilityDayRows = computed<ProfitabilityDayRow[]>(() =>
	[...(profitabilityReport.value.day_wise || [])]
		.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
		.slice(-14),
);
const profitabilityItemMax = computed(() => {
	const maxValue = profitabilityItemRows.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.gross_profit || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const profitabilityDayMax = computed(() => {
	const maxValue = profitabilityDayRows.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.gross_profit || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const topProfitItemLabel = computed(() => {
	const row = profitabilityHighlights.value.top_profit_item;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatMoney(Number(row.gross_profit || 0))}`;
});
const lowestMarginItemLabel = computed(() => {
	const row = profitabilityHighlights.value.lowest_margin_item;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatPercent(row.gross_margin_pct, 1)}`;
});

const taxChargesReport = computed(() => dashboardData.value.tax_charges_report || {});
const taxChargesTotals = computed(() => taxChargesReport.value.totals || {});
const taxChargesHighlights = computed(() => taxChargesReport.value.highlights || {});
const taxChargesRangeLabel = computed(() => {
	const from = taxChargesReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = taxChargesReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const taxHeadRows = computed<TaxChargeHeadRow[]>(() =>
	[...(taxChargesReport.value.tax_heads || [])]
		.sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)))
		.slice(0, Number(taxReportLimit.value || 20)),
);
const chargeHeadRows = computed<TaxChargeHeadRow[]>(() =>
	[...(taxChargesReport.value.charge_heads || [])]
		.sort((a, b) => Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0)))
		.slice(0, Number(taxReportLimit.value || 20)),
);
const taxChargesDayRows = computed<TaxChargesDayRow[]>(() =>
	[...(taxChargesReport.value.day_wise || [])]
		.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
		.slice(-14),
);
const taxDayMax = computed(() => {
	const maxValue = taxChargesDayRows.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.total_charge_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const topTaxHeadLabel = computed(() => {
	const row = taxChargesHighlights.value.top_tax_head;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.amount || 0))}`;
});
const topChargeHeadLabel = computed(() => {
	const row = taxChargesHighlights.value.top_charge_head;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.amount || 0))}`;
});

const branchReport = computed(() => dashboardData.value.branch_location_report || {});
const branchSummary = computed(() => branchReport.value.summary || {});
const branchReportRangeLabel = computed(() => {
	const from = branchReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = branchReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const branchRows = computed<BranchLocationRow[]>(() =>
	[...(branchReport.value.location_wise || [])]
		.sort((a, b) => Number(b.sales_amount || 0) - Number(a.sales_amount || 0))
		.slice(0, Number(branchReportLimit.value || 20)),
);
const branchTopItemsByLocation = computed<BranchTopItemsByLocationRow[]>(() =>
	[...(branchReport.value.top_items_by_location || [])].slice(0, Number(branchReportLimit.value || 20)),
);
const branchSalesMax = computed(() => {
	const maxValue = branchRows.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});

const customerReport = computed(() => dashboardData.value.customer_report || {});
const customerSummary = computed(() => customerReport.value.summary || {});
const customerReportRangeLabel = computed(() => {
	const from = customerReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = customerReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const topCustomerRows = computed<CustomerReportRow[]>(() =>
	[...(customerReport.value.top_customers || [])]
		.sort((a, b) => Math.abs(Number(b.sales_amount || 0)) - Math.abs(Number(a.sales_amount || 0)))
		.slice(0, Number(customerReportLimit.value || 20)),
);
const repeatCustomerRows = computed<CustomerReportRow[]>(() =>
	[...(customerReport.value.repeat_customers || [])]
		.sort((a, b) => Number(b.invoice_count || 0) - Number(a.invoice_count || 0))
		.slice(0, Number(customerReportLimit.value || 20)),
);
const recentCustomerRows = computed<CustomerReportRow[]>(() =>
	[...(customerReport.value.recent_customers || [])]
		.sort((a, b) => String(b.last_purchase_date || "").localeCompare(String(a.last_purchase_date || "")))
		.slice(0, Number(customerReportLimit.value || 20)),
);
const customerSalesMax = computed(() => {
	const maxValue = topCustomerRows.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});

const salesTrend = computed(() => dashboardData.value.sales_trend || {});
const salesTrendDayPoints = computed(() =>
	[...(salesTrend.value.day_wise || [])]
		.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
		.slice(-14),
);
const salesTrendWeekPoints = computed(() =>
	[...(salesTrend.value.week_wise || [])]
		.sort((a, b) => String(a.week_start || "").localeCompare(String(b.week_start || "")))
		.slice(-8),
);
const salesTrendMonthPoints = computed(() =>
	[...(salesTrend.value.month_wise || [])]
		.sort((a, b) => String(a.month || "").localeCompare(String(b.month || "")))
		.slice(-6),
);
const salesTrendHourPoints = computed(() =>
	[...(salesTrend.value.hourly || [])]
		.filter((row) => Math.abs(Number(row.sales || 0)) > 0.00001)
		.sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0))
		.slice(0, 8),
);
const salesTrendRangeLabel = computed(() => {
	const from = salesTrend.value.period?.day_from;
	const to = salesTrend.value.period?.day_to;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const trendHighlights = computed(() => salesTrend.value.highlights || {});
const bestDayLabel = computed(() => {
	const bestDay = trendHighlights.value.best_day;
	if (!bestDay?.date) {
		return __("N/A");
	}
	return `${formatDate(bestDay.date)} . ${formatMoney(Number(bestDay.sales || 0))}`;
});
const bestHourLabel = computed(() => {
	const bestHour = trendHighlights.value.best_hour;
	if (!bestHour) {
		return __("N/A");
	}
	const label =
		bestHour.label || `${String(Number(bestHour.hour || 0)).padStart(2, "0")}:00`;
	return `${label} . ${formatMoney(Number(bestHour.sales || 0))}`;
});
const trendGrowthChips = computed(() => {
	const dayGrowth = trendHighlights.value.day_growth_pct;
	const weekGrowth = trendHighlights.value.week_growth_pct;
	const monthGrowth = trendHighlights.value.month_growth_pct;
	return [
		{
			key: "day_growth",
			label: __("Day Δ"),
			value: formatTrendPct(trendHighlights.value.day_growth_pct),
			color: trendGrowthColor(dayGrowth),
		},
		{
			key: "week_growth",
			label: __("Week Δ"),
			value: formatTrendPct(trendHighlights.value.week_growth_pct),
			color: trendGrowthColor(weekGrowth),
		},
		{
			key: "month_growth",
			label: __("Month Δ"),
			value: formatTrendPct(trendHighlights.value.month_growth_pct),
			color: trendGrowthColor(monthGrowth),
		},
	];
});
const salesTrendDayMax = computed(() => {
	const maxValue = salesTrendDayPoints.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const salesTrendWeekMax = computed(() => {
	const maxValue = salesTrendWeekPoints.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const salesTrendMonthMax = computed(() => {
	const maxValue = salesTrendMonthPoints.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const salesTrendHourMax = computed(() => {
	const maxValue = salesTrendHourPoints.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});

const itemSalesReport = computed(() => dashboardData.value.item_sales_report || {});
const itemSalesItems = computed<ItemSalesRow[]>(() =>
	[...(itemSalesReport.value.items || [])]
		.sort((a, b) => Number(b.sales_amount || 0) - Number(a.sales_amount || 0))
		.slice(0, Number(itemSalesLimit.value || 20)),
);
const itemSalesHighlights = computed(() => itemSalesReport.value.highlights || {});
const itemSalesRangeLabel = computed(() => {
	const from = itemSalesReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = itemSalesReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const itemSalesBestSellerLabel = computed(() => {
	const row = itemSalesHighlights.value.best_seller;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatQuantity(Number(row.sold_qty || 0))}`;
});
const itemSalesTopMarginLabel = computed(() => {
	const row = itemSalesHighlights.value.top_margin_item;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatMoney(Number(row.estimated_margin || 0))}`;
});
const itemSalesTopDiscountLabel = computed(() => {
	const row = itemSalesHighlights.value.top_discount_item;
	if (!row) {
		return __("N/A");
	}
	const name = String(row.item_name || row.item_code || "").trim();
	if (!name) {
		return __("N/A");
	}
	return `${name} . ${formatMoney(Number(row.discount_amount || 0))}`;
});
const itemSalesMaxSales = computed(() => {
	const maxValue = itemSalesItems.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});

const categoryVariantReport = computed(() => dashboardData.value.category_brand_variant_report || {});
const categoryVariantHighlights = computed(() => categoryVariantReport.value.highlights || {});
const categorySalesPoints = computed<CategoryBrandVariantRow[]>(() =>
	[...(categoryVariantReport.value.category_wise || [])]
		.sort((a, b) => Number(b.sales_amount || 0) - Number(a.sales_amount || 0))
		.slice(0, Number(categoryReportLimit.value || 12)),
);
const brandSalesPoints = computed<CategoryBrandVariantRow[]>(() =>
	[...(categoryVariantReport.value.brand_wise || [])]
		.sort((a, b) => Number(b.sales_amount || 0) - Number(a.sales_amount || 0))
		.slice(0, Number(categoryReportLimit.value || 12)),
);
const variantSalesPoints = computed<CategoryBrandVariantRow[]>(() =>
	[...(categoryVariantReport.value.variant_wise || [])]
		.sort((a, b) => Number(b.sales_amount || 0) - Number(a.sales_amount || 0))
		.slice(0, Number(categoryReportLimit.value || 12)),
);
const attributeSalesPoints = computed<CategoryBrandVariantRow[]>(() =>
	[...(categoryVariantReport.value.attribute_wise || [])]
		.sort((a, b) => Number(b.sales_amount || 0) - Number(a.sales_amount || 0))
		.slice(0, Number(categoryReportLimit.value || 12)),
);
const categoryVariantRangeLabel = computed(() => {
	const from = categoryVariantReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = categoryVariantReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const topCategoryLabel = computed(() => {
	const row = categoryVariantHighlights.value.top_category;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.sales_amount || 0))}`;
});
const topBrandLabel = computed(() => {
	const row = categoryVariantHighlights.value.top_brand;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.sales_amount || 0))}`;
});
const topVariantLabel = computed(() => {
	const row = categoryVariantHighlights.value.top_variant;
	if (!row?.label) {
		return __("N/A");
	}
	return `${row.label} . ${formatMoney(Number(row.sales_amount || 0))}`;
});
const categorySalesMax = computed(() => {
	const maxValue = categorySalesPoints.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const brandSalesMax = computed(() => {
	const maxValue = brandSalesPoints.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const variantSalesMax = computed(() => {
	const maxValue = variantSalesPoints.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const attributeSalesMax = computed(() => {
	const maxValue = attributeSalesPoints.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.sales_amount || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});

const inventoryStatusReport = computed(() => dashboardData.value.inventory_status_report || {});
const inventoryStatusSummary = computed(() => inventoryStatusReport.value.summary || {});
const inventoryStatusRangeLabel = computed(() => {
	const from = inventoryStatusReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = inventoryStatusReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const inventoryStatusLowStockItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.low_stock_items || [],
);
const inventoryStatusOutOfStockItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.out_of_stock_items || [],
);
const inventoryStatusNegativeItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.negative_stock_items || [],
);
const inventoryStatusSlowMovingItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.slow_moving_items || [],
);
const inventoryStatusDeadStockItems = computed<InventoryStatusRow[]>(
	() => inventoryStatusReport.value.dead_stock_items || [],
);
const inventoryStatusLowMax = computed(() => {
	const maxValue = inventoryStatusLowStockItems.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.actual_qty || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const inventoryStatusSlowMax = computed(() => {
	const maxValue = inventoryStatusSlowMovingItems.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.stock_cover_days || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const inventoryStatusDeadMax = computed(() => {
	const maxValue = inventoryStatusDeadStockItems.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.actual_qty || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const inventoryStatusNegativeMax = computed(() => {
	const maxValue = inventoryStatusNegativeItems.value.reduce(
		(max, row) => Math.max(max, Math.abs(Number(row.actual_qty || 0))),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});

const stockMovementReport = computed(() => dashboardData.value.stock_movement_report || {});
const stockMovementSummary = computed(() => stockMovementReport.value.summary || {});
const stockMovementRangeLabel = computed(() => {
	const from = stockMovementReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = stockMovementReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});
const stockMovementDayWise = computed<StockMovementDayRow[]>(() =>
	[...(stockMovementReport.value.day_wise || [])]
		.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
		.slice(-31),
);
const stockMovementRecent = computed<StockMovementRecentRow[]>(() =>
	[...(stockMovementReport.value.recent_movements || [])].slice(0, Number(stockMovementLimit.value || 20)),
);
const stockMovementIncomingQty = computed(
	() =>
		Number(stockMovementSummary.value.return_in_qty || 0) +
		Number(stockMovementSummary.value.adjustment_in_qty || 0) +
		Number(stockMovementSummary.value.transfer_in_qty || 0) +
		Number(stockMovementSummary.value.other_in_qty || 0),
);
const stockMovementOutgoingQty = computed(
	() =>
		Number(stockMovementSummary.value.sale_out_qty || 0) +
		Number(stockMovementSummary.value.adjustment_out_qty || 0) +
		Number(stockMovementSummary.value.transfer_out_qty || 0) +
		Number(stockMovementSummary.value.other_out_qty || 0),
);
const stockMovementDaySimple = computed<
	Array<StockMovementDayRow & { incoming: number; outgoing: number; net: number }>
>(() =>
	stockMovementDayWise.value.map((row) => {
		const incoming =
			Number(row.return_in_qty || 0) +
			Number(row.adjustment_in_qty || 0) +
			Number(row.transfer_in_qty || 0) +
			Number(row.other_in_qty || 0);
		const outgoing =
			Number(row.sale_out_qty || 0) +
			Number(row.adjustment_out_qty || 0) +
			Number(row.transfer_out_qty || 0) +
			Number(row.other_out_qty || 0);
		const net = Number(row.net_qty || 0);
		return { ...row, incoming, outgoing, net };
	}),
);
const stockMovementDayMax = computed(() => {
	const maxValue = stockMovementDaySimple.value.reduce((max, row) => {
		const magnitude = Math.abs(Number(row.incoming || 0)) + Math.abs(Number(row.outgoing || 0));
		return Math.max(max, magnitude);
	}, 0);
	return maxValue > 0 ? maxValue : 1;
});

const reorderReport = computed(() => dashboardData.value.reorder_purchase_suggestions || {});
const reorderSummary = computed(() => reorderReport.value.summary || {});
const reorderSuggestions = computed<ReorderSuggestionRow[]>(() =>
	[...(reorderReport.value.suggestions || [])]
		.sort((a, b) => {
			const order = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
			const left = order[String(a.urgency || "").toLowerCase()] ?? 99;
			const right = order[String(b.urgency || "").toLowerCase()] ?? 99;
			if (left !== right) {
				return left - right;
			}
			return Number(b.suggested_qty || 0) - Number(a.suggested_qty || 0);
		})
		.slice(0, Number(reorderSuggestionLimit.value || 25)),
);
const reorderRangeLabel = computed(() => {
	const from = reorderReport.value.period?.from || dashboardData.value.date_context?.month_start;
	const to = reorderReport.value.period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});

const fastMovingItems = computed<FastMovingItem[]>(
	() => dashboardData.value.inventory_insights.fast_moving_items || [],
);
const fastMovingPagination = computed(() => {
	const fallbackSize = Number(fastMovingPageSize.value || 10);
	return (
		dashboardData.value.inventory_insights.fast_moving_pagination || {
			page: Number(fastMovingPage.value || 1),
			page_size: fallbackSize,
			total_count: fastMovingItems.value.length,
			total_pages: fastMovingItems.value.length > 0 ? 1 : 0,
			search: fastMovingSearch.value,
		}
	);
});
const fastMovingTotalCount = computed(() =>
	Number(fastMovingPagination.value.total_count || fastMovingItems.value.length || 0),
);
const fastMovingTotalPages = computed(() =>
	Number(fastMovingPagination.value.total_pages || 0),
);
const fastMovingPageSizeItems = computed(() =>
	[10, 20, 30, 50].map((size) => ({
		label: String(size),
		value: size,
	})),
);
const lowStockItems = computed<LowStockItem[]>(
	() => dashboardData.value.inventory_insights.low_stock_items || [],
);
const supplierOverview = computed(() => dashboardData.value.supplier_overview);
const supplierOverviewSummary = computed<SupplierOverviewSummary>(
	() => supplierOverview.value.summary || {},
);
const supplierSummary = computed<SupplierSummaryRow[]>(
	() => supplierOverview.value.purchase_summary || [],
);
const supplierRiskRows = computed<SupplierSummaryRow[]>(
	() => supplierOverview.value.risk_suppliers || [],
);
const supplierDayRows = computed<SupplierDayRow[]>(() =>
	[...(supplierOverview.value.day_wise || [])]
		.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
		.slice(-14),
);
const lowStockWarehouseItems = computed(() => {
	const values = Array.from(
		new Set(lowStockItems.value.map((item) => String(item.warehouse || "").trim()).filter(Boolean)),
	).sort((a, b) => a.localeCompare(b));
	return [{ label: __("All Warehouses"), value: "" }, ...values.map((value) => ({ label: value, value }))];
});
const filteredLowStockItems = computed<LowStockItem[]>(() => {
	const searchText = String(lowStockSearch.value || "").trim().toLowerCase();
	const warehouse = String(lowStockWarehouseFilter.value || "").trim();
	return lowStockItems.value.filter((item) => {
		if (warehouse && String(item.warehouse || "").trim() !== warehouse) {
			return false;
		}
		if (!searchText) {
			return true;
		}
		return (
			String(item.item_code || "").toLowerCase().includes(searchText) ||
			String(item.item_name || "").toLowerCase().includes(searchText) ||
			String(item.warehouse || "").toLowerCase().includes(searchText)
		);
	});
});
const filteredSupplierSummary = computed<SupplierSummaryRow[]>(() => {
	const searchText = String(supplierSearch.value || "").trim().toLowerCase();
	if (!searchText) {
		return supplierSummary.value;
	}
	return supplierSummary.value.filter((supplier) => {
		return (
			String(supplier.supplier || "").toLowerCase().includes(searchText) ||
			String(supplier.supplier_name || "").toLowerCase().includes(searchText)
		);
	});
});
const filteredSupplierRiskRows = computed<SupplierSummaryRow[]>(() => {
	const searchText = String(supplierSearch.value || "").trim().toLowerCase();
	if (!searchText) {
		return supplierRiskRows.value;
	}
	return supplierRiskRows.value.filter((supplier) => {
		return (
			String(supplier.supplier || "").toLowerCase().includes(searchText) ||
			String(supplier.supplier_name || "").toLowerCase().includes(searchText)
		);
	});
});
const supplierPurchaseMax = computed(() => {
	const maxValue = filteredSupplierSummary.value.reduce(
		(max, row) => Math.max(max, Number(row.purchase_amount || 0)),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const supplierPendingMax = computed(() => {
	const maxValue = filteredSupplierRiskRows.value.reduce(
		(max, row) => Math.max(max, Number(row.pending_amount || 0)),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const supplierDayMax = computed(() => {
	const maxValue = supplierDayRows.value.reduce(
		(max, row) => Math.max(max, Number(row.purchase_amount || 0)),
		0,
	);
	return maxValue > 0 ? maxValue : 1;
});
const topSupplierLabel = computed(() => {
	const row = supplierOverview.value.highlights?.top_supplier;
	if (!row) {
		return __("N/A");
	}
	return String(row.supplier_name || row.supplier || __("N/A"));
});
const topPendingSupplierLabel = computed(() => {
	const row = supplierOverview.value.highlights?.top_pending_supplier;
	if (!row) {
		return __("N/A");
	}
	return String(row.supplier_name || row.supplier || __("N/A"));
});

const maxFastMovingQty = computed(() => {
	const maxValue = fastMovingItems.value.reduce((max, item) => {
		const qty = Number(item.sold_qty || 0);
		return qty > max ? qty : max;
	}, 0);
	return maxValue > 0 ? maxValue : 1;
});

const lowStockThreshold = computed(
	() => Number(dashboardData.value.inventory_insights.low_stock_threshold || 10),
);

const monthRangeLabel = computed(() => {
	const from = supplierOverview.value.period?.from;
	const to = supplierOverview.value.period?.to;
	if (!from || !to) {
		return __("Current Month");
	}
	return `${formatDate(from)} - ${formatDate(to)}`;
});

const fastMovingRangeLabel = computed(() => {
	const period = dashboardData.value.inventory_insights.fast_moving_period;
	const from = period?.from || dashboardData.value.date_context?.month_start;
	const to = period?.to || dashboardData.value.date_context?.today;
	if (!from || !to) {
		return __("Current Month");
	}

	let days = Number(period?.days || 0);
	if (!Number.isFinite(days) || days <= 0) {
		const fromDate = new Date(from);
		const toDate = new Date(to);
		if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
			const msPerDay = 24 * 60 * 60 * 1000;
			const computedDays = Math.floor((toDate.getTime() - fromDate.getTime()) / msPerDay) + 1;
			days = computedDays > 0 ? computedDays : 0;
		}
	}

	const daysLabel = days > 0 ? ` (${days} ${__("days")})` : "";
	return `${formatDate(from)} - ${formatDate(to)}${daysLabel}`;
});

const lastUpdatedLabel = computed(() => {
	if (!lastUpdatedAt.value) {
		return "";
	}
	return `${__("Updated")}: ${lastUpdatedAt.value.toLocaleTimeString()}`;
});

function formatMoney(value: number) {
	const amount = Number(value || 0);
	const formatted = new Intl.NumberFormat(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
	const symbol = typeof get_currency_symbol === "function" && currency.value ? get_currency_symbol(currency.value) : "";
	return symbol ? `${symbol} ${formatted}` : formatted;
}

function formatQuantity(value: number) {
	return new Intl.NumberFormat(undefined, {
		maximumFractionDigits: 2,
	}).format(Number(value || 0));
}

function formatSignedQuantity(value: number) {
	const numeric = Number(value || 0);
	const prefix = numeric > 0 ? "+" : "";
	return `${prefix}${formatQuantity(numeric)}`;
}

function formatDate(value?: string) {
	if (!value) {
		return "-";
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleDateString();
}

function formatPercent(value?: number | null, precision = 1) {
	if (value === null || value === undefined || Number.isNaN(Number(value))) {
		return __("N/A");
	}
	return `${Number(value).toFixed(precision)}%`;
}

function formatDays(value?: number | null) {
	if (value === null || value === undefined || Number.isNaN(Number(value))) {
		return __("N/A");
	}
	return `${Math.round(Number(value))} ${__("days")}`;
}

function formatMovementCategory(category?: string) {
	const normalized = String(category || "").trim().toLowerCase();
	if (normalized === "sale") {
		return __("Sale");
	}
	if (normalized === "return") {
		return __("Return");
	}
	if (normalized === "adjustment") {
		return __("Adjustment");
	}
	if (normalized === "transfer") {
		return __("Transfer");
	}
	return __("Other");
}

function urgencyLabel(value?: string) {
	const normalized = String(value || "").trim().toLowerCase();
	if (normalized === "critical") {
		return __("Critical");
	}
	if (normalized === "high") {
		return __("High");
	}
	if (normalized === "medium") {
		return __("Medium");
	}
	if (normalized === "low") {
		return __("Low");
	}
	return __("Unknown");
}

function urgencyColor(value?: string) {
	const normalized = String(value || "").trim().toLowerCase();
	if (normalized === "critical") {
		return "error";
	}
	if (normalized === "high") {
		return "warning";
	}
	if (normalized === "medium") {
		return "info";
	}
	if (normalized === "low") {
		return "success";
	}
	return "secondary";
}

function progressFromQuantity(quantity: number) {
	return Math.min(100, (Number(quantity || 0) / maxFastMovingQty.value) * 100);
}

function stockChipColor(quantity: number) {
	return Number(quantity || 0) <= 0 ? "error" : "warning";
}

function paymentCategoryColor(category?: string) {
	if (category === "cash") {
		return "success";
	}
	if (category === "card_online") {
		return "info";
	}
	return "secondary";
}

function trendProgress(value: number, maxValue: number) {
	return Math.min(100, (Math.abs(Number(value || 0)) / Math.max(1, Number(maxValue || 1))) * 100);
}

function formatTrendPct(value?: number | null) {
	if (value === null || value === undefined || Number.isNaN(Number(value))) {
		return __("N/A");
	}
	const numeric = Number(value);
	const prefix = numeric > 0 ? "+" : "";
	return `${prefix}${numeric.toFixed(1)}%`;
}

function trendGrowthColor(value?: number | null) {
	if (value === null || value === undefined || Number.isNaN(Number(value))) {
		return "secondary";
	}
	if (Number(value) > 0) {
		return "success";
	}
	if (Number(value) < 0) {
		return "error";
	}
	return "warning";
}

function mergeDashboardPayload(payload?: Partial<DashboardResponse>): DashboardResponse {
	const base = createEmptyDashboard();
	return {
		...base,
		...payload,
		sales_overview: {
			...base.sales_overview,
			...(payload?.sales_overview || {}),
		},
		daily_sales_summary: {
			...(base.daily_sales_summary || {}),
			...(payload?.daily_sales_summary || {}),
		},
		monthly_sales_summary: {
			...(base.monthly_sales_summary || {}),
			...(payload?.monthly_sales_summary || {}),
		},
		payment_method_report: {
			...(base.payment_method_report || {}),
			...(payload?.payment_method_report || {}),
		},
		discount_void_return_report: {
			...(base.discount_void_return_report || {}),
			...(payload?.discount_void_return_report || {}),
		},
		customer_report: {
			...(base.customer_report || {}),
			...(payload?.customer_report || {}),
		},
		staff_performance_report: {
			...(base.staff_performance_report || {}),
			...(payload?.staff_performance_report || {}),
		},
		profitability_report: {
			...(base.profitability_report || {}),
			...(payload?.profitability_report || {}),
		},
		branch_location_report: {
			...(base.branch_location_report || {}),
			...(payload?.branch_location_report || {}),
		},
		tax_charges_report: {
			...(base.tax_charges_report || {}),
			...(payload?.tax_charges_report || {}),
		},
		sales_trend: {
			...(base.sales_trend || {}),
			...(payload?.sales_trend || {}),
		},
		item_sales_report: {
			...(base.item_sales_report || {}),
			...(payload?.item_sales_report || {}),
		},
		category_brand_variant_report: {
			...(base.category_brand_variant_report || {}),
			...(payload?.category_brand_variant_report || {}),
		},
		inventory_status_report: {
			...(base.inventory_status_report || {}),
			...(payload?.inventory_status_report || {}),
		},
		stock_movement_report: {
			...(base.stock_movement_report || {}),
			...(payload?.stock_movement_report || {}),
		},
		reorder_purchase_suggestions: {
			...(base.reorder_purchase_suggestions || {}),
			...(payload?.reorder_purchase_suggestions || {}),
		},
		inventory_insights: {
			...base.inventory_insights,
			...(payload?.inventory_insights || {}),
		},
		supplier_overview: {
			...base.supplier_overview,
			...(payload?.supplier_overview || {}),
		},
	};
}

function logDashboardRequest() {
	console.groupCollapsed(`${DASHBOARD_LOG_PREFIX} fetch:start`);
	console.info("scope", dashboardScope.value);
	console.info("profile_filter", selectedProfileFilter.value || null);
	console.info("report_month", selectedReportMonth.value || null);
	console.info("pos_profile", profileName.value || null);
	console.info("threshold_override", configuredLowStockThreshold.value ?? null);
	console.info("fast_moving_page", fastMovingPage.value);
	console.info("fast_moving_page_size", fastMovingPageSize.value);
	console.info("fast_moving_search", fastMovingSearch.value || null);
	console.groupEnd();
}

function logDashboardResponse(response: DashboardResponse) {
	console.groupCollapsed(`${DASHBOARD_LOG_PREFIX} fetch:success`);
	console.info("enabled", response.enabled);
	console.info("disabled_reason", response.disabled_reason || null);
	console.info("global_enabled", response.global_enabled ?? null);
	console.info("scope", response.scope || null);
	console.info("allow_all_profiles", response.allow_all_profiles ?? null);
	console.info("selected_profiles", response.selected_profiles || []);
	console.info("available_profiles_count", response.available_profiles?.length || 0);
	console.info("profit_method", response.sales_overview?.profit_method || null);
	console.info("payment_method_count", response.payment_method_report?.method_wise?.length || 0);
	console.info("discount_cashier_count", response.discount_void_return_report?.cashier_wise?.length || 0);
	console.info("customer_top_count", response.customer_report?.top_customers?.length || 0);
	console.info("staff_cashier_count", response.staff_performance_report?.cashier_wise?.length || 0);
	console.info("profit_item_count", response.profitability_report?.item_wise?.length || 0);
	console.info("branch_count", response.branch_location_report?.location_wise?.length || 0);
	console.info("tax_head_count", response.tax_charges_report?.tax_heads?.length || 0);
	console.info("item_sales_count", response.item_sales_report?.items?.length || 0);
	console.info("category_report_count", response.category_brand_variant_report?.category_wise?.length || 0);
	console.info("inventory_status_total_items", response.inventory_status_report?.summary?.total_items || 0);
	console.info("stock_movement_count", response.stock_movement_report?.summary?.movement_count || 0);
	console.info("reorder_suggestion_count", response.reorder_purchase_suggestions?.summary?.suggestion_count || 0);
	console.info("fast_moving_pagination", response.inventory_insights?.fast_moving_pagination || null);
	console.groupEnd();
}

function logDashboardError(error: any) {
	console.groupCollapsed(`${DASHBOARD_LOG_PREFIX} fetch:error`);
	console.error(error);
	console.groupEnd();
}

async function loadDashboard() {
	loading.value = true;
	errorMessage.value = "";
	logDashboardRequest();

	try {
		const response = await fetchDashboardData({
			pos_profile: profileName.value || undefined,
			scope: dashboardScope.value,
			profile_filter:
				dashboardScope.value === "specific" ? selectedProfileFilter.value || undefined : undefined,
			report_month: selectedReportMonth.value || undefined,
			low_stock_threshold: configuredLowStockThreshold.value,
			item_sales_limit: itemSalesLimit.value,
			category_report_limit: categoryReportLimit.value,
			inventory_status_limit: inventoryStatusLimit.value,
			stock_movement_limit: stockMovementLimit.value,
			reorder_suggestion_limit: reorderSuggestionLimit.value,
			payment_report_limit: paymentReportLimit.value,
			discount_report_limit: discountReportLimit.value,
			customer_report_limit: customerReportLimit.value,
			staff_report_limit: staffReportLimit.value,
			profitability_report_limit: profitabilityReportLimit.value,
			branch_report_limit: branchReportLimit.value,
			tax_report_limit: taxReportLimit.value,
			fast_moving_page: fastMovingPage.value,
			fast_moving_page_size: fastMovingPageSize.value,
			fast_moving_search: fastMovingSearch.value || undefined,
		});
		logDashboardResponse(response);
		dashboardData.value = mergeDashboardPayload(response);
		if (response.date_context?.report_month) {
			selectedReportMonth.value = String(response.date_context.report_month);
		}
		isDashboardEnabledOnServer.value = response.enabled !== false;
		allowAllProfiles.value = Boolean(response.allow_all_profiles);
		if (!scopeInitialized.value) {
			const defaultScope = (response.default_scope || dashboardScope.value) as
				| "all"
				| "current"
				| "specific";
			dashboardScope.value = defaultScope;
			scopeInitialized.value = true;
		}
		if (!allowAllProfiles.value && dashboardScope.value !== "current") {
			dashboardScope.value = "current";
		}
		if (dashboardScope.value === "specific" && !selectedProfileFilter.value) {
			const firstProfile = profileFilterItems.value[0]?.value || "";
			selectedProfileFilter.value = firstProfile;
		}
		lastUpdatedAt.value = new Date();
	} catch (error: any) {
		logDashboardError(error);
		errorMessage.value = error?.message || __("Failed to load dashboard data.");
	} finally {
		loading.value = false;
	}
}

watch(
	() => profileName.value,
	(newProfile, oldProfile) => {
		if (!newProfile || newProfile === oldProfile) {
			return;
		}
		void loadDashboard();
	},
);

watch(
	() => dashboardScope.value,
	(scope) => {
		if (scope !== "specific") {
			selectedProfileFilter.value = "";
		} else if (!selectedProfileFilter.value) {
			selectedProfileFilter.value = profileFilterItems.value[0]?.value || "";
		}
		void loadDashboard();
	},
);

watch(
	() => selectedProfileFilter.value,
	(newValue, oldValue) => {
		if (dashboardScope.value !== "specific") {
			return;
		}
		if (newValue === oldValue) {
			return;
		}
		void loadDashboard();
	},
);

watch(
	() => selectedReportMonth.value,
	(newMonth, oldMonth) => {
		if (newMonth === oldMonth) {
			return;
		}
		if (fastMovingPage.value !== 1) {
			fastMovingPage.value = 1;
			return;
		}
		void loadDashboard();
	},
);

watch(
	() => fastMovingPage.value,
	(newPage, oldPage) => {
		if (newPage === oldPage) {
			return;
		}
		void loadDashboard();
	},
);

watch(
	() => fastMovingPageSize.value,
	(newSize, oldSize) => {
		if (newSize === oldSize) {
			return;
		}
		if (fastMovingPage.value !== 1) {
			fastMovingPage.value = 1;
			return;
		}
		void loadDashboard();
	},
);

watch(
	() => fastMovingSearch.value,
	(newSearch, oldSearch) => {
		if (newSearch === oldSearch) {
			return;
		}
		if (fastMovingPage.value !== 1) {
			fastMovingPage.value = 1;
			return;
		}
		void loadDashboard();
	},
);

watch(
	() => fastMovingSearchInput.value,
	(newSearch, oldSearch) => {
		if (newSearch === oldSearch) {
			return;
		}
		if (fastMovingSearchDebounce) {
			clearTimeout(fastMovingSearchDebounce);
		}
		fastMovingSearchDebounce = setTimeout(() => {
			fastMovingSearch.value = String(newSearch || "").trim();
		}, 320);
	},
);

onBeforeUnmount(() => {
	if (fastMovingSearchDebounce) {
		clearTimeout(fastMovingSearchDebounce);
		fastMovingSearchDebounce = null;
	}
});

onMounted(() => {
	void loadDashboard();
});
</script>

<style scoped>
.awesome-dashboard-view {
	--dashboard-bg-base: var(--pos-surface-muted, var(--pos-surface, #f4f6f8));
	--dashboard-glow-primary: rgba(25, 118, 210, 0.08);
	--dashboard-glow-secondary: rgba(76, 175, 80, 0.08);
	--dashboard-tabs-bg: var(--pos-surface-raised, var(--pos-card-bg, #ffffff));
	--dashboard-tab-active-bg: var(--pos-card-bg, #ffffff);
	--dashboard-tab-hover-bg: var(--pos-surface-container, rgba(0, 0, 0, 0.04));
	height: 100%;
	overflow: auto;
	background:
		radial-gradient(circle at top right, var(--dashboard-glow-primary), transparent 40%),
		radial-gradient(circle at bottom left, var(--dashboard-glow-secondary), transparent 45%),
		var(--dashboard-bg-base);
}

:deep(.v-theme--dark) .awesome-dashboard-view {
	--dashboard-bg-base: var(--pos-surface-muted, #1a2028);
	--dashboard-glow-primary: rgba(66, 165, 245, 0.18);
	--dashboard-glow-secondary: rgba(102, 187, 106, 0.14);
	--dashboard-tabs-bg: rgba(255, 255, 255, 0.04);
	--dashboard-tab-active-bg: rgba(255, 255, 255, 0.08);
	--dashboard-tab-hover-bg: rgba(255, 255, 255, 0.06);
}

.dashboard-shell {
	min-height: 100%;
}

.dashboard-toolbar {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
}

.dashboard-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
}

.dashboard-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
}

.dashboard-filter {
	min-width: 180px;
	max-width: 220px;
}

.dashboard-tabs {
	background: var(--dashboard-tabs-bg);
	border: 1px solid var(--pos-border);
	border-radius: 14px;
	padding: 6px;
	border-bottom: 1px solid var(--pos-border);
}

.dashboard-tabs--desktop {
	display: block;
}

.dashboard-tabs--mobile {
	display: none;
}

.dashboard-tab-bar {
	background: transparent;
}

.dashboard-tab-bar :deep(.v-slide-group__content) {
	gap: 4px;
}

.dashboard-tab-bar :deep(.v-tab) {
	border-radius: 10px;
	color: var(--pos-text-secondary);
	min-height: 40px;
	transition: background-color 0.18s ease, color 0.18s ease;
}

.dashboard-tab-bar :deep(.v-tab:hover) {
	background: var(--dashboard-tab-hover-bg);
	color: var(--pos-text-primary);
}

.dashboard-tab-bar :deep(.v-tab.v-tab--selected) {
	background: var(--dashboard-tab-active-bg);
	color: var(--pos-text-primary);
}

.dashboard-tab-bar :deep(.v-tab__slider) {
	opacity: 0.9;
}

.tab-card-btn {
	text-transform: none;
	justify-content: flex-start;
	border-radius: 12px;
	min-height: 42px;
	border: 1px solid var(--pos-border);
	background: var(--dashboard-tabs-bg);
	color: var(--pos-text-primary);
}

.tab-card-label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.dashboard-grid {
	row-gap: 4px;
}

.metric-card {
	border-radius: 14px;
	padding: 14px;
	background: var(--pos-card-bg);
	border: 1px solid var(--pos-border);
}

.metric-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 10px;
	color: var(--pos-text-secondary);
}

.metric-card__label {
	font-size: 0.85rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.metric-card__value {
	font-size: 1.35rem;
	font-weight: 700;
	color: var(--pos-text-primary);
	word-break: break-word;
}

.metric-card--sales {
	box-shadow: 0 8px 20px rgba(25, 118, 210, 0.08);
}

.metric-card--profit {
	box-shadow: 0 8px 20px rgba(56, 142, 60, 0.08);
}

.dashboard-card {
	height: 100%;
	border-radius: 14px;
	padding: 14px;
	background: var(--pos-card-bg);
	border: 1px solid var(--pos-border);
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 0;
}

.dashboard-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	flex-wrap: wrap;
}

.dashboard-card__header > * {
	min-width: 0;
}

.dashboard-chip-row {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	min-width: 0;
}

.dashboard-chip-row :deep(.v-chip) {
	max-width: 100%;
	height: auto;
}

.dashboard-chip-row :deep(.v-chip__content) {
	white-space: normal;
	word-break: break-word;
	overflow-wrap: anywhere;
}

.summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: 10px;
}

.trend-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.trend-grid--two {
	grid-template-columns: repeat(2, minmax(0, 1fr));
}

.trend-panel {
	border: 1px solid var(--pos-border);
	border-radius: 10px;
	padding: 10px;
	background: var(--pos-card-bg);
	min-width: 0;
}

.trend-list {
	max-height: 280px;
}

.summary-metric {
	border: 1px solid var(--pos-border);
	border-radius: 10px;
	padding: 10px;
	background: var(--pos-card-bg);
	min-width: 0;
}

.summary-metric__label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--pos-text-secondary);
	margin-bottom: 4px;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.summary-metric__value {
	font-size: 1rem;
	font-weight: 700;
	color: var(--pos-text-primary);
	word-break: break-word;
	overflow-wrap: anywhere;
}

.summary-metric__value--success {
	color: #2e7d32;
}

.summary-metric__value--danger {
	color: #c62828;
}

.payment-breakdown {
	border-top: 1px dashed var(--pos-border);
	padding-top: 10px;
}

.payment-chip-list {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.card-filters {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 8px;
	align-items: center;
}

.card-filter-input {
	min-width: 180px;
}

.card-filter-select {
	min-width: 120px;
}

.list-stack {
	display: flex;
	flex-direction: column;
	gap: 10px;
	max-height: 360px;
	overflow: auto;
	padding-right: 2px;
}

.insight-row {
	border: 1px solid var(--pos-border);
	border-radius: 10px;
	padding: 10px;
	background: var(--pos-card-bg);
	min-width: 0;
}

.insight-row__top {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 4px;
	flex-wrap: wrap;
}

.insight-row__title {
	font-weight: 600;
	color: var(--pos-text-primary);
	overflow-wrap: anywhere;
	word-break: break-word;
	min-width: 0;
	flex: 1 1 180px;
}

.insight-row__value {
	font-size: 0.86rem;
	font-weight: 600;
	color: var(--pos-text-secondary);
	white-space: normal;
	text-align: right;
	overflow-wrap: anywhere;
	word-break: break-word;
	min-width: 0;
}

.insight-row__meta {
	font-size: 0.78rem;
	color: var(--pos-text-secondary);
	margin-bottom: 6px;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.supplier-row {
	border: 1px solid var(--pos-border);
	border-radius: 10px;
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	background: var(--pos-card-bg);
}

.supplier-row__headline {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	direction: ltr;
}

.supplier-row__name {
	font-weight: 600;
	color: var(--pos-text-primary);
	flex: 1 1 auto;
	min-width: 0;
	text-align: left;
	overflow-wrap: anywhere;
	word-break: break-word;
}

.supplier-row__meta {
	font-size: 0.78rem;
	color: var(--pos-text-secondary);
	overflow-wrap: anywhere;
	word-break: break-word;
}

.supplier-row__amount {
	font-weight: 700;
	color: var(--pos-text-primary);
	white-space: nowrap;
	text-align: right;
}

.empty-state {
	font-size: 0.9rem;
	color: var(--pos-text-secondary);
	padding: 16px 0;
}

.pagination-row {
	display: flex;
	justify-content: center;
	padding-top: 4px;
}

@media (max-width: 960px) {
	.dashboard-tabs {
		border-bottom: none;
	}

	.dashboard-tabs--desktop {
		display: none;
	}

	.dashboard-tabs--mobile {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.trend-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.list-stack {
		max-height: none;
	}

	.card-filters {
		grid-template-columns: 1fr;
	}

	.card-filter-select {
		min-width: 100%;
	}
}

@media (max-width: 600px) {
	.dashboard-tabs--mobile {
		grid-template-columns: 1fr;
	}

	.trend-grid {
		grid-template-columns: 1fr;
	}

	.dashboard-filter {
		min-width: 150px;
		max-width: 180px;
	}

	.metric-card__value {
		font-size: 1.15rem;
	}

	.supplier-row {
		gap: 8px;
	}

	.supplier-row__amount {
		text-align: right;
	}
}
</style>

