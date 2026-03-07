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

export interface DashboardResponse {
	enabled: boolean;
	profile?: string;
	scope?: "all" | "current" | "specific";
	default_scope?: "all" | "current" | "specific";
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
	inventory_insights: {
		fast_moving_items: FastMovingItem[];
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
	supplier_limit?: number;
	low_stock_limit?: number;
}

export function fetchDashboardData(args: DashboardRequest = {}) {
	return api.call<DashboardResponse>(
		"posawesome.posawesome.api.dashboard.get_dashboard_data",
		args,
	);
}
