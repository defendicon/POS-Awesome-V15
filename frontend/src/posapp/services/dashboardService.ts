import api from "./api";

export interface DashboardMetricPayload {
	today_sales: number;
	today_profit: number;
	monthly_sales: number;
	monthly_profit: number;
	profit_method?: "stock_ledger" | "invoice_item";
}

export interface FastMovingItem {
	item_code: string;
	item_name: string;
	stock_uom?: string;
	sold_qty: number;
	sales_amount: number;
}

export interface LowStockItem {
	item_code: string;
	item_name: string;
	stock_uom?: string;
	actual_qty: number;
	warehouse: string;
}

export interface SupplierSummaryRow {
	supplier: string;
	supplier_name?: string;
	purchase_count: number;
	purchase_amount: number;
	last_purchase_date?: string;
}

export interface ItemSalesRow {
	item_code: string;
	item_name?: string;
	stock_uom?: string;
	sold_qty: number;
	sales_amount: number;
	discount_amount?: number;
	estimated_cost?: number;
	estimated_margin?: number;
	estimated_margin_pct?: number | null;
	total_lines?: number;
	discounted_lines?: number;
	discount_frequency_pct?: number;
}

export interface CategoryBrandVariantRow {
	label?: string;
	sold_qty: number;
	sales_amount: number;
	discount_amount?: number;
	item_count?: number;
	variant_item_count?: number;
	attribute?: string;
	attribute_value?: string;
	category?: string;
	brand?: string;
	variant_of?: string;
}

export interface InventoryStatusRow {
	item_code: string;
	item_name?: string;
	stock_uom?: string;
	actual_qty: number;
	sold_qty?: number;
	sales_amount?: number;
	stock_cover_days?: number | null;
}

export interface StockMovementDayRow {
	date?: string;
	movement_count?: number;
	sale_out_qty?: number;
	return_in_qty?: number;
	adjustment_in_qty?: number;
	adjustment_out_qty?: number;
	transfer_in_qty?: number;
	transfer_out_qty?: number;
	other_in_qty?: number;
	other_out_qty?: number;
	net_qty?: number;
	net_value?: number;
}

export interface StockMovementRecentRow {
	posting_date?: string;
	voucher_type?: string;
	voucher_no?: string;
	item_code?: string;
	item_name?: string;
	warehouse?: string;
	stock_entry_purpose?: string;
	category?: string;
	direction?: "in" | "out" | string;
	qty?: number;
	value_change?: number;
}

export interface ReorderSuggestionRow {
	item_code: string;
	item_name?: string;
	stock_uom?: string;
	current_qty: number;
	sold_qty?: number;
	avg_daily_sales?: number;
	lead_time_days?: number;
	reorder_level?: number;
	target_stock?: number;
	suggested_qty: number;
	stock_cover_days?: number | null;
	urgency?: "critical" | "high" | "medium" | "low" | string;
	supplier?: string;
	estimated_unit_cost?: number;
	estimated_purchase_value?: number;
}

export interface PaymentMethodSummaryRow {
	mode_of_payment: string;
	mode_type?: string;
	category?: "cash" | "card_online" | "other" | string;
	amount: number;
	invoice_count?: number;
	share_pct?: number;
}

export interface PaymentCategorySummaryRow {
	category?: "cash" | "card_online" | "other" | string;
	label?: string;
	amount: number;
	invoice_count?: number;
	share_pct?: number;
}

export interface PaymentDaySummaryRow {
	date?: string;
	invoice_count?: number;
	paid_amount?: number;
	pending_amount?: number;
}

export interface DiscountVoidReturnCashierRow {
	cashier?: string;
	discount_amount?: number;
	discounted_invoice_count?: number;
	return_count?: number;
	return_amount?: number;
	void_count?: number;
	void_amount?: number;
}

export interface DiscountVoidReturnItemRow {
	item_code?: string;
	item_name?: string;
	stock_uom?: string;
	return_qty?: number;
	return_amount?: number;
	return_invoice_count?: number;
}

export interface DiscountVoidReturnDayRow {
	date?: string;
	discount_amount?: number;
	return_count?: number;
	return_amount?: number;
	void_count?: number;
	void_amount?: number;
}

export interface DashboardResponse {
	enabled: boolean;
	profile?: string;
	scope?: "all" | "current" | "specific";
	default_scope?: "all" | "current" | "specific";
	global_enabled?: boolean;
	allow_all_profiles?: boolean;
	profile_scope_enabled?: boolean;
	disabled_reason?: "global_disabled" | "no_profiles_in_scope" | string;
	selected_profiles?: string[];
	available_profiles?: Array<{
		name: string;
		warehouse?: string;
		currency?: string;
		dashboard_enabled?: boolean;
	}>;
	company?: string;
	warehouse?: string;
	currency?: string;
	generated_at?: string;
	date_context?: {
		today?: string;
		month_start?: string;
	};
	sales_overview: DashboardMetricPayload;
	daily_sales_summary?: {
		period?: {
			from?: string;
			to?: string;
		};
		invoice_count?: number;
		returns_count?: number;
		gross_sales?: number;
		net_sales?: number;
		returns_amount?: number;
		discount_amount?: number;
		tax_amount?: number;
		opening_amount?: number;
		opening_cash?: number;
		closing_amount?: number;
		closing_cash?: number;
		cash_collections?: number;
		card_online_collections?: number;
		other_collections?: number;
		change_given?: number;
		collections_total?: number;
		expected_cash?: number;
		actual_cash?: number;
		cash_variance?: number;
		average_invoice_value?: number;
		has_closing_snapshot?: boolean;
		payment_methods?: Array<{
			mode_of_payment: string;
			mode_type?: string;
			category?: "cash" | "card_online" | "other" | string;
			amount: number;
		}>;
	};
	payment_method_report?: {
		period?: {
			from?: string;
			to?: string;
		};
		totals?: {
			invoice_count?: number;
			split_invoice_count?: number;
			pending_invoice_count?: number;
			partial_invoice_count?: number;
			unpaid_invoice_count?: number;
			pending_amount?: number;
			paid_amount?: number;
			collected_amount?: number;
			cash_amount?: number;
			card_online_amount?: number;
			other_amount?: number;
		};
		method_wise?: PaymentMethodSummaryRow[];
		category_wise?: PaymentCategorySummaryRow[];
		day_wise?: PaymentDaySummaryRow[];
	};
	discount_void_return_report?: {
		period?: {
			from?: string;
			to?: string;
		};
		totals?: {
			discount_amount?: number;
			discounted_invoice_count?: number;
			return_count?: number;
			return_amount?: number;
			void_count?: number;
			void_amount?: number;
		};
		cashier_wise?: DiscountVoidReturnCashierRow[];
		top_return_items?: DiscountVoidReturnItemRow[];
		day_wise?: DiscountVoidReturnDayRow[];
	};
	sales_trend?: {
		period?: {
			day_from?: string;
			day_to?: string;
			week_from?: string;
			month_from?: string;
			to?: string;
		};
		day_wise?: Array<{
			date?: string;
			label?: string;
			sales: number;
			invoice_count?: number;
		}>;
		week_wise?: Array<{
			year_week?: number;
			label?: string;
			week_start?: string;
			week_end?: string;
			sales: number;
			invoice_count?: number;
		}>;
		month_wise?: Array<{
			month?: string;
			label?: string;
			month_start?: string;
			month_end?: string;
			sales: number;
			invoice_count?: number;
		}>;
		hourly?: Array<{
			hour: number;
			label?: string;
			sales: number;
			invoice_count?: number;
		}>;
		highlights?: {
			best_day?: {
				date?: string;
				sales?: number;
				invoice_count?: number;
			} | null;
			best_hour?: {
				hour?: number;
				label?: string;
				sales?: number;
				invoice_count?: number;
			} | null;
			day_growth_pct?: number | null;
			week_growth_pct?: number | null;
			month_growth_pct?: number | null;
		};
	};
	item_sales_report?: {
		period?: {
			from?: string;
			to?: string;
		};
		items?: ItemSalesRow[];
		highlights?: {
			best_seller?: {
				item_code?: string;
				item_name?: string;
				sold_qty?: number;
				sales_amount?: number;
			} | null;
			top_margin_item?: {
				item_code?: string;
				item_name?: string;
				estimated_margin?: number;
				estimated_margin_pct?: number | null;
			} | null;
			top_discount_item?: {
				item_code?: string;
				item_name?: string;
				discount_amount?: number;
				discount_frequency_pct?: number;
			} | null;
		};
	};
	category_brand_variant_report?: {
		period?: {
			from?: string;
			to?: string;
		};
		category_wise?: CategoryBrandVariantRow[];
		brand_wise?: CategoryBrandVariantRow[];
		variant_wise?: CategoryBrandVariantRow[];
		attribute_wise?: CategoryBrandVariantRow[];
		highlights?: {
			top_category?: CategoryBrandVariantRow | null;
			top_brand?: CategoryBrandVariantRow | null;
			top_variant?: CategoryBrandVariantRow | null;
		};
	};
	inventory_status_report?: {
		period?: {
			from?: string;
			to?: string;
		};
		threshold?: number;
		summary?: {
			total_items?: number;
			total_stock_qty?: number;
			low_stock_count?: number;
			out_of_stock_count?: number;
			negative_stock_count?: number;
			slow_moving_count?: number;
			dead_stock_count?: number;
		};
		low_stock_items?: InventoryStatusRow[];
		out_of_stock_items?: InventoryStatusRow[];
		negative_stock_items?: InventoryStatusRow[];
		slow_moving_items?: InventoryStatusRow[];
		dead_stock_items?: InventoryStatusRow[];
	};
	stock_movement_report?: {
		period?: {
			from?: string;
			to?: string;
		};
		summary?: {
			movement_count?: number;
			sale_out_qty?: number;
			return_in_qty?: number;
			adjustment_in_qty?: number;
			adjustment_out_qty?: number;
			transfer_in_qty?: number;
			transfer_out_qty?: number;
			other_in_qty?: number;
			other_out_qty?: number;
			net_qty?: number;
			net_value?: number;
		};
		day_wise?: StockMovementDayRow[];
		recent_movements?: StockMovementRecentRow[];
	};
	reorder_purchase_suggestions?: {
		period?: {
			from?: string;
			to?: string;
		};
		summary?: {
			candidate_items?: number;
			suggestion_count?: number;
			critical_count?: number;
			high_count?: number;
			medium_count?: number;
			low_count?: number;
			total_suggested_qty?: number;
			estimated_purchase_value?: number;
		};
		suggestions?: ReorderSuggestionRow[];
	};
	inventory_insights: {
		fast_moving_items: FastMovingItem[];
		fast_moving_period?: {
			from?: string;
			to?: string;
			days?: number;
		};
		fast_moving_pagination?: {
			page: number;
			page_size: number;
			total_count: number;
			total_pages: number;
			search?: string;
		};
		low_stock_items: LowStockItem[];
		low_stock_threshold: number;
	};
	supplier_overview: {
		purchase_summary: SupplierSummaryRow[];
		period?: {
			from?: string;
			to?: string;
		};
	};
}

export interface DashboardRequest {
	pos_profile?: string | null;
	scope?: "all" | "current" | "specific";
	profile_filter?: string | null;
	low_stock_threshold?: number;
	fast_moving_limit?: number;
	fast_moving_page?: number;
	fast_moving_page_size?: number;
	fast_moving_search?: string | null;
	item_sales_limit?: number;
	category_report_limit?: number;
	inventory_status_limit?: number;
	stock_movement_limit?: number;
	reorder_suggestion_limit?: number;
	payment_report_limit?: number;
	discount_report_limit?: number;
	supplier_limit?: number;
	low_stock_limit?: number;
}

export function fetchDashboardData(args: DashboardRequest = {}) {
	return api.call<DashboardResponse>(
		"posawesome.posawesome.api.dashboard.get_dashboard_data",
		args,
	);
}
