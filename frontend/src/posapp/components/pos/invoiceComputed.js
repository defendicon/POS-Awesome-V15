/* global flt, __, get_currency_symbol */
import { perfMarkStart, perfMarkEnd } from "../../utils/perf.js";

import { parseBooleanSetting } from '../../utils/stock.js';

export default {
        // Calculate total quantity of all items
        total_qty() {
                const mark = perfMarkStart("pos:totals-total_qty");
                this.close_payments();
                let qty = 0;
                this.items.forEach((item) => {
                        qty += flt(item.qty);
                });
                const result = this.flt(qty, this.float_precision);
                perfMarkEnd("pos:totals-total_qty", mark);
                return result;
        },
        // Calculate total amount for all items (handles returns)
        Total() {
                const mark = perfMarkStart("pos:totals-gross");
                let sum = 0;
                this.items.forEach((item) => {
                        // For returns, use absolute value for correct calculation
                        const qty = this.isReturnInvoice ? Math.abs(flt(item.qty)) : flt(item.qty);
                        const rate = flt(item.rate);
                        sum += qty * rate;
                });
                const result = this.flt(sum, this.currency_precision);
                perfMarkEnd("pos:totals-gross", mark);
                return result;
        },
        // Calculate subtotal after discounts and delivery charges
        subtotal() {
                const mark = perfMarkStart("pos:totals-subtotal");
                this.close_payments();
                let sum = 0;
                this.items.forEach((item) => {
                        // For returns, use absolute value for correct calculation
                        const qty = this.isReturnInvoice ? Math.abs(flt(item.qty)) : flt(item.qty);
                        const rate = flt(item.rate);
			sum += qty * rate;
		});

		// Subtract additional discount
		const additional_discount = this.flt(this.additional_discount);
		sum -= additional_discount;

		// Add delivery charges
		const delivery_charges = this.flt(this.delivery_charges_rate);
		sum += delivery_charges;

                const result = this.flt(sum, this.currency_precision);
                perfMarkEnd("pos:totals-subtotal", mark);
                return result;
        },
        // Calculate total discount amount for all items
        total_items_discount_amount() {
                const mark = perfMarkStart("pos:totals-discount");
                let sum = 0;
                this.items.forEach((item) => {
                        // For returns, use absolute value for correct calculation
                        if (this.isReturnInvoice) {
                                sum += Math.abs(flt(item.qty)) * flt(item.discount_amount);
			} else {
				sum += flt(item.qty) * flt(item.discount_amount);
			}
		});
                const result = this.flt(sum, this.float_precision);
                perfMarkEnd("pos:totals-discount", mark);
                return result;
        },
	// Format posting_date for display as DD-MM-YYYY
	formatted_posting_date: {
		get() {
			if (!this.posting_date) return "";
			const parts = this.posting_date.split("-");
			if (parts.length === 3) {
				return `${parts[2]}-${parts[1]}-${parts[0]}`;
			}
			return this.posting_date;
		},
		set(val) {
			const parts = val.split("-");
			if (parts.length === 3) {
				this.posting_date = `${parts[2]}-${parts[1]}-${parts[0]}`;
			} else {
				this.posting_date = val;
			}
		},
	},
	// Get currency symbol for display
	currencySymbol() {
		return (currency) => {
			return get_currency_symbol(currency || this.selected_currency || this.pos_profile.currency);
		};
	},
	// Get display currency
	displayCurrency() {
		return this.selected_currency || this.pos_profile.currency;
	},
	// Determine if current invoice is a return
	isReturnInvoice() {
		return this.invoiceType === "Return" || (this.invoice_doc && this.invoice_doc.is_return);
	},
	blockSaleBeyondAvailableQty() {
		if (["Order", "Quotation"].includes(this.invoiceType)) {
			return false;
		}
		const allowNegative = parseBooleanSetting(this.stock_settings?.allow_negative_stock);
		return (
			!allowNegative &&
			Boolean(this.pos_profile?.posa_block_sale_beyond_available_qty)
		);
	},
	// Table headers for item table (for another table if needed)
	itemTableHeaders() {
		return [
			{
				text: __("Item"),
				value: "item_name",
				width: "35%",
			},
			{
				text: __("Qty"),
				value: "qty",
				width: "15%",
			},
			{
				text: __(`Rate (${this.displayCurrency})`),
				value: "rate",
				width: "20%",
			},
			{
				text: __(`Amount (${this.displayCurrency})`),
				value: "amount",
				width: "20%",
			},
			{
				text: __("Action"),
				value: "actions",
				sortable: false,
				width: "10%",
			},
		];
	},
};
