/* global flt, __, get_currency_symbol */

export default {
        // Aggregate frequently used totals in a single computed property so
        // large invoices only trigger one pass over the items collection.
        aggregatedTotals() {
                const totals = {
                        totalQty: 0,
                        totalAmount: 0,
                        totalDiscount: 0,
                };

                const items = Array.isArray(this.items) ? this.items : [];
                const isReturn = this.isReturnInvoice;

                for (const item of items) {
                        const qty = flt(item.qty);
                        const absQty = isReturn ? Math.abs(qty) : qty;
                        const rate = flt(item.rate);

                        totals.totalQty += absQty;
                        totals.totalAmount += absQty * rate;

                        const discountQty = isReturn ? Math.abs(qty) : qty;
                        const discountAmount = flt(item.discount_amount);
                        totals.totalDiscount += discountQty * discountAmount;
                }

                totals.totalQty = this.flt(totals.totalQty, this.float_precision);
                totals.totalAmount = this.flt(totals.totalAmount, this.currency_precision);
                totals.totalDiscount = this.flt(totals.totalDiscount, this.float_precision);

                return totals;
        },
        // Calculate total quantity of all items
        total_qty() {
                return this.aggregatedTotals.totalQty;
        },
        // Calculate total amount for all items (handles returns)
        Total() {
                return this.aggregatedTotals.totalAmount;
        },
        // Calculate subtotal after discounts and delivery charges
        subtotal() {
                let sum = this.aggregatedTotals.totalAmount;

                // Subtract additional discount
                const additional_discount = this.flt(this.additional_discount);
                sum -= additional_discount;

		// Add delivery charges
		const delivery_charges = this.flt(this.delivery_charges_rate);
		sum += delivery_charges;

		return this.flt(sum, this.currency_precision);
        },
        // Calculate total discount amount for all items
        total_items_discount_amount() {
                return this.aggregatedTotals.totalDiscount;
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
		return (
			!["Order", "Quotation"].includes(this.invoiceType) &&
			this.pos_profile.posa_block_sale_beyond_available_qty
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
