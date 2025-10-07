import { clearPriceListCache } from "../../../offline/index.js";
/* global frappe */

export default {
	// Watch for customer change and update related data
	customer() {
		this.close_payments();
		this.eventBus.emit("set_customer", this.customer);
		this.fetch_customer_details();
		this.fetch_customer_balance();
		this.set_delivery_charges();
	},
	// Watch for customer_info change and emit to edit form
	customer_info() {
		this.eventBus.emit("set_customer_info_to_edit", this.customer_info);
	},
	// Watch for expanded row change and update item detail
	expanded(data_value) {
		if (data_value.length > 0) {
			const expandedId = data_value[0];
			const item = this.items.find((it) => it.posa_row_id === expandedId);
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
	// Watch for items array changes (deep) and re-handle offers
	items: {
		deep: true,
		handler() {
			if (this.isApplyingOffer) return;
			this.handelOffers();
			this.$forceUpdate();
		},
	},
	packed_items: {
		deep: true,
		handler() {
			if (this.isApplyingOffer) return;
			this.handelOffers();
			this.$forceUpdate();
		},
	},
	// Watch for invoice type change and emit
	invoiceType() {
		this.eventBus.emit("update_invoice_type", this.invoiceType);
	},
	// Watch for additional discount and update percentage accordingly
	additional_discount() {
		if (!this.additional_discount || this.additional_discount == 0) {
			this.additional_discount_percentage = 0;
		} else if (this.pos_profile.posa_use_percentage_discount) {
			// Prevent division by zero which causes NaN
			if (this.Total && this.Total !== 0) {
				this.additional_discount_percentage = (this.additional_discount / this.Total) * 100;
			} else {
				this.additional_discount_percentage = 0;
			}
		} else {
			this.additional_discount_percentage = 0;
		}
	},
	// Keep display date in sync with posting_date
	posting_date: {
		handler(newVal) {
			this.posting_date_display = this.formatDateForDisplay(newVal);
		},
		immediate: true,
	},
	// Update posting_date when user changes the display value
	posting_date_display(newVal) {
		this.posting_date = this.formatDateForBackend(newVal);
	},

	selected_price_list(newVal) {
		// Clear cached price list items to avoid mixing rates
		clearPriceListCache();

		const price_list = newVal === this.pos_profile.selling_price_list ? null : newVal;
		this.eventBus.emit("update_customer_price_list", price_list);
		const applied = newVal || this.pos_profile.selling_price_list;
		this.apply_cached_price_list(applied);

		// If multi-currency is enabled, sync currency with the price list currency
		if (this.pos_profile.posa_allow_multi_currency && applied) {
			frappe.call({
				method: "posawesome.posawesome.api.invoices.get_price_list_currency",
				args: { price_list: applied },
				callback: (r) => {
					if (r.message) {
						// Store price list currency for later use
						this.price_list_currency = r.message;
						// Sync invoice currency with price list currency
						this.update_currency(r.message);
					}
				},
			});
		}
	},

	// Reactively update item prices when currency changes
	selected_currency() {
		clearPriceListCache();
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
