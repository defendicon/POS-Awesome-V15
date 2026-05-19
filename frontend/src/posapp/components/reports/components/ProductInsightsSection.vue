<template>
	<div>
		<v-row class="dashboard-grid mb-2">
			<v-col cols="12">
				<v-card class="dashboard-card" elevation="2">
					<div class="dashboard-card__header">
						<h2 class="text-subtitle-1 font-weight-bold mb-0">
							{{ __("Item / Product Sales Report") }}
						</h2>
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
						<InsightRow
							v-for="item in itemSalesItems"
							:key="`item-sales-${item.item_code}`"
							:title="item.item_name || item.item_code || '-'"
							:value="formatMoney(Number(item.sales_amount || 0))"
						>
							<template #meta>
								{{ item.item_code }} . {{ __("Qty") }}:
								{{ formatQuantity(Number(item.sold_qty || 0)) }}
								{{ item.stock_uom || "" }}
							</template>
							<div class="insight-row__meta">
								{{ __("Margin") }}:
								{{ formatMoney(Number(item.estimated_margin || 0)) }} ({{
									formatPercent(item.estimated_margin_pct, 1)
								}}) . {{ __("Discount") }}:
								{{ formatMoney(Number(item.discount_amount || 0)) }} ({{
									formatPercent(item.discount_frequency_pct, 1)
								}})
							</div>
							<v-progress-linear
								:model-value="trendProgress(Number(item.sales_amount || 0), itemSalesMaxSales)"
								color="primary"
								height="5"
								rounded
							/>
						</InsightRow>
					</div>
					<EmptyState v-else :message="__('No item sales data found for this period.')" />
				</v-card>
			</v-col>
		</v-row>

		<v-row class="dashboard-grid mb-2">
			<v-col cols="12">
				<v-card class="dashboard-card" elevation="2">
					<div class="dashboard-card__header">
						<h2 class="text-subtitle-1 font-weight-bold mb-0">
							{{ __("Category / Brand / Variant Report") }}
						</h2>
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
						<TrendPanel :title="__('Category-wise')">
							<div v-if="categorySalesPoints.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in categorySalesPoints"
									:key="`cat-${row.category || row.label}`"
									:title="row.label || '-'"
									:value="formatMoney(Number(row.sales_amount || 0))"
								>
									<template #meta>
										{{ __("Items") }}:
										{{ formatQuantity(Number(row.item_count || 0)) }}
									</template>
									<v-progress-linear
										:model-value="trendProgress(Number(row.sales_amount || 0), categorySalesMax)"
										color="primary"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No category data found.')" />
						</TrendPanel>

						<TrendPanel :title="__('Brand-wise')">
							<div v-if="brandSalesPoints.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in brandSalesPoints"
									:key="`brand-${row.brand || row.label}`"
									:title="row.label || '-'"
									:value="formatMoney(Number(row.sales_amount || 0))"
								>
									<template #meta>
										{{ __("Items") }}:
										{{ formatQuantity(Number(row.item_count || 0)) }}
									</template>
									<v-progress-linear
										:model-value="trendProgress(Number(row.sales_amount || 0), brandSalesMax)"
										color="success"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No brand data found.')" />
						</TrendPanel>

						<TrendPanel :title="__('Variant-wise')">
							<div v-if="variantSalesPoints.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in variantSalesPoints"
									:key="`variant-${row.variant_of || row.label}`"
									:title="row.label || '-'"
									:value="formatMoney(Number(row.sales_amount || 0))"
								>
									<template #meta>
										{{ __("Variants") }}:
										{{ formatQuantity(Number(row.variant_item_count || 0)) }}
									</template>
									<v-progress-linear
										:model-value="trendProgress(Number(row.sales_amount || 0), variantSalesMax)"
										color="warning"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No variant data found.')" />
						</TrendPanel>

						<TrendPanel :title="__('Attributes (Size/Color)')">
							<div v-if="attributeSalesPoints.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in attributeSalesPoints"
									:key="`attr-${row.attribute || ''}-${row.attribute_value || ''}`"
									:title="row.label || '-'"
									:value="formatMoney(Number(row.sales_amount || 0))"
								>
									<template #meta>
										{{ __("Items") }}:
										{{ formatQuantity(Number(row.item_count || 0)) }}
									</template>
									<v-progress-linear
										:model-value="trendProgress(Number(row.sales_amount || 0), attributeSalesMax)"
										color="info"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No attribute data found.')" />
						</TrendPanel>
					</div>
				</v-card>
			</v-col>
		</v-row>
	</div>
</template>

<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
import InsightRow from "./InsightRow.vue";
import TrendPanel from "./TrendPanel.vue";

type DashboardRow = Record<string, any>;

defineProps<{
	itemSalesRangeLabel: string;
	itemSalesBestSellerLabel: string;
	itemSalesTopMarginLabel: string;
	itemSalesTopDiscountLabel: string;
	itemSalesItems: DashboardRow[];
	itemSalesMaxSales: number;
	categoryVariantRangeLabel: string;
	topCategoryLabel: string;
	topBrandLabel: string;
	topVariantLabel: string;
	categorySalesPoints: DashboardRow[];
	brandSalesPoints: DashboardRow[];
	variantSalesPoints: DashboardRow[];
	attributeSalesPoints: DashboardRow[];
	categorySalesMax: number;
	brandSalesMax: number;
	variantSalesMax: number;
	attributeSalesMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	formatPercent: (value?: number | null, digits?: number) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
