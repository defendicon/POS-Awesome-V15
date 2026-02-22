import { clearPriceListCache } from "../../../../offline/index";
import { useCustomersStore } from "../../../stores/customersStore.js";

interface WatcherItem {
	posa_row_id?: string | number;
	_detailSynced?: boolean;
	[key: string]: unknown;
}

interface InvoiceWatchersVm {
	customer?: string | null;
	customer_info?: Record<string, unknown>;
	items: WatcherItem[];
	packed_items: WatcherItem[];
	discount_percentage_offer_name?: string | null;
	discount_amount?: number;
	eventBus: { emit: (_event: string, _payload?: unknown) => void };
	invoiceType?: string;
	additional_discount?: number;
	additional_discount_percentage?: number;
	return_doc?: Record<string, unknown> | string | null;
	update_discount_umount?: () => void;
	pos_profile: {
		posa_use_percentage_discount?: boolean;
		selling_price_list?: string;
		posa_allow_multi_currency?: boolean;
		currency?: string;
	};
	Total?: number;
	isReturnInvoice?: boolean;
	posting_date?: string;
	posting_date_display?: string;
	selected_price_list?: string;
	price_list_currency?: string;
	available_stock_cache?: Record<string, unknown>;
	exchange_rate?: number;
	selected_currency?: string;
	conversion_rate?: number;
	close_payments: () => void;
	fetch_customer_details: () => void;
	fetch_customer_balance: () => void;
	set_delivery_charges: () => void;
	sync_invoice_customer_details: (_details?: Record<string, unknown>) => void;
	update_item_detail: (_item: WatcherItem) => void;
	emitCartQuantities?: () => void;
	scheduleOfferRefresh?: () => void;
	schedulePricingRuleApplication?: (_force?: boolean) => void;
	formatDateForDisplay: (_value: string) => string;
	formatDateForBackend: (_value: string) => string;
	get_effective_price_list?: () => string;
	apply_cached_price_list: (_priceList?: string) => void;
	update_currency: (_currency: string) => void;
	clearItemDetailCache?: () => void;
	clearItemStockCache?: () => void;
	update_item_rates: () => void;
	_applyingPricingRules?: boolean;
}

const applyReturnDiscountProration = (context: InvoiceWatchersVm) => {
	const shouldProrate =
		context.isReturnInvoice &&
		!context.pos_profile?.posa_use_percentage_discount &&
		context.return_doc &&
		typeof context.return_doc === "object";

	if (!shouldProrate) return;

	const returnDoc = context.return_doc as Record<string, unknown>;
	const originalDiscount = Math.abs(
		Number(returnDoc.discount_amount || 0),
	);
	const originalTotal = Math.abs(
		Number(
			returnDoc.total ??
				returnDoc.net_total ??
				returnDoc.grand_total ??
				0,
		),
	);
	const returnTotal = Math.abs(Number(context.Total || 0));

	if (!originalDiscount || !originalTotal || !returnTotal) return;

	const ratio = Math.min(1, returnTotal / originalTotal);
	const prorated = -Math.abs(originalDiscount * ratio);
	const current = Number(context.additional_discount || 0);
	if (Math.abs(current - prorated) > 0.0001) {
		console.log("[POSA][Returns] Auto-prorate discount", {
			originalDiscount,
			originalTotal,
			returnTotal,
			ratio,
			prorated,
		});
		context.additional_discount = prorated;
		context.discount_amount = prorated;
		context.additional_discount_percentage = 0;
	}
};

const invoiceWatchers: Record<string, unknown> & ThisType<InvoiceWatchersVm> = {
	// Watch for customer change and update related data
	customer(newValue: unknown, oldValue: unknown) {
		if (newValue === oldValue) {
			return;
		}
		this.close_payments();
		const customersStore = useCustomersStore();
		customersStore.setSelectedCustomer(this.customer || null);
		const hasCustomer =
			typeof this.customer === "string" &&
			this.customer.trim().length > 0;
		if (hasCustomer) {
			this.fetch_customer_details();
			this.fetch_customer_balance();
		}
		this.set_delivery_charges();
		this.sync_invoice_customer_details();
	},
	// Watch for customer_info change and emit to edit form
	customer_info() {
		const customersStore = useCustomersStore();
		customersStore.setCustomerInfo(this.customer_info || {});
		this.sync_invoice_customer_details(this.customer_info);
	},
	// Watch for expanded row change and update item detail
	expanded(data_value: Array<string | number>) {
		if (data_value.length > 0) {
			const expandedId = data_value[0];
			const item = this.items.find(
				(it: WatcherItem) => it.posa_row_id === expandedId,
			);
			if (item) {
				this.update_item_detail(item);
			}
		}
	},
	// Watch for discount offer name change and emit
	discount_percentage_offer_name() {
		this.eventBus.emit("update_discount_percentage_offer_name", {
			value: this.discount_percentage_offer_name,
		});
	},

	// Optimized watcher: Track store version instead of deep watching items array
	"invoiceStore.metadata.changeVersion": {
		handler(this: InvoiceWatchersVm) {
			// This covers both items and packed_items changes if they modify the store
			if (typeof this.emitCartQuantities === "function") {
				// emitCartQuantities is usually debounced internally or cheap enough
				this.emitCartQuantities();
			}

			const pricingRunInProgress = this._applyingPricingRules === true;
			if (
				!pricingRunInProgress &&
				typeof this.schedulePricingRuleApplication === "function"
			) {
				this.schedulePricingRuleApplication();
			}

			if (
				!pricingRunInProgress &&
				typeof this.scheduleOfferRefresh === "function"
			) {
				this.scheduleOfferRefresh();
			}
			applyReturnDiscountProration(this);
		},
	},
	Total(this: InvoiceWatchersVm) {
		if (
			this.pos_profile?.posa_use_percentage_discount &&
			Number(this.additional_discount_percentage || 0) !== 0 &&
			typeof this.update_discount_umount === "function"
		) {
			this.update_discount_umount();
		}
		applyReturnDiscountProration(this);
	},

	// Keep a shallow watcher on packed_items just in case (for non-store flows)
	// But ideally we should rely on the store version.
	// If legacy code mutates items directly without store, this won't catch it,
	// but our new architecture pushes updates through store actions.

	// Watch for invoice type change and emit
	invoiceType() {
		this.eventBus.emit("update_invoice_type", this.invoiceType);
	},
	// Watch for additional discount and update percentage accordingly
	additional_discount() {
		const normalizedDiscount = Number(this.additional_discount || 0);
		if (this.isReturnInvoice && normalizedDiscount > 0) {
			const forcedNegative = -Math.abs(normalizedDiscount);
			this.additional_discount = forcedNegative;
			this.discount_amount = forcedNegative;
			return;
		}

		if (!this.additional_discount || this.additional_discount == 0) {
			this.additional_discount_percentage = 0;
		} else if (this.pos_profile.posa_use_percentage_discount) {
			// Prevent division by zero which causes NaN
			const baseTotal =
				this.Total && this.Total !== 0
					? this.isReturnInvoice
						? Math.abs(this.Total)
						: this.Total
					: 0;

			if (baseTotal) {
				let computedPercentage =
					(this.additional_discount / baseTotal) * 100;

				if (this.isReturnInvoice) {
					computedPercentage = -Math.abs(computedPercentage);
				}

				this.additional_discount_percentage = computedPercentage;
			} else {
				this.additional_discount_percentage = 0;
			}
		} else {
			this.additional_discount_percentage = 0;
		}
	},
	// Keep display date in sync with posting_date
	posting_date: {
		handler(this: InvoiceWatchersVm, newVal: string) {
			this.posting_date_display = this.formatDateForDisplay(newVal);
		},
		immediate: true,
	},
	// Update posting_date when user changes the display value
	posting_date_display(newVal: string) {
		this.posting_date = this.formatDateForBackend(newVal);
	},

	selected_price_list(newVal: string) {
		// Clear cached price list items to avoid mixing rates
		clearPriceListCache();

		const effectivePriceList =
			typeof this.get_effective_price_list === "function"
				? this.get_effective_price_list()
				: this.pos_profile?.selling_price_list;

		if (newVal !== effectivePriceList) {
			this.selected_price_list = effectivePriceList;
		}

		const price_list =
			effectivePriceList === this.pos_profile.selling_price_list
				? null
				: effectivePriceList;
		this.eventBus.emit("update_customer_price_list", price_list);
		const applied =
			effectivePriceList || this.pos_profile.selling_price_list;
		this.apply_cached_price_list(applied);

		// If multi-currency is enabled, sync currency with the price list currency
		if (this.pos_profile.posa_allow_multi_currency && applied) {
			frappe.call({
				method: "posawesome.posawesome.api.invoices.get_price_list_currency",
				args: { price_list: applied },
				callback: (r: { message?: string }) => {
					if (r.message) {
						// Store price list currency for later use
						this.price_list_currency = r.message;
						// Sync invoice currency with price list currency
						this.update_currency(r.message);
					}
				},
			});
		}

		if (Array.isArray(this.items)) {
			this.items.forEach((item) => {
				item._detailSynced = false;
			});
		}
		if (Array.isArray(this.packed_items)) {
			this.packed_items.forEach((item) => {
				item._detailSynced = false;
			});
		}

		if (typeof this.clearItemDetailCache === "function") {
			this.clearItemDetailCache();
		}
		if (typeof this.clearItemStockCache === "function") {
			this.clearItemStockCache();
		}
		if (this.available_stock_cache) {
			this.available_stock_cache = {};
		}
	},

	// Reactively update item prices when currency changes
	selected_currency() {
		clearPriceListCache();
		if (this.eventBus) {
			this.eventBus.emit("update_currency", {
				currency: this.selected_currency || this.pos_profile?.currency,
				exchange_rate: this.exchange_rate,
				conversion_rate: this.conversion_rate,
			});
		}
		if (this.items && this.items.length) {
			this.update_item_rates();
		}
	},

	// Reactively update item prices when exchange rate changes
	exchange_rate() {
		if (this.items && this.items.length) {
			this.update_item_rates();
		}
	},
};

export default invoiceWatchers;
